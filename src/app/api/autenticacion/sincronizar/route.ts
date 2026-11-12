import { NextResponse } from "next/server";
import { ModeloUsuario } from "@/modelos/Usuario";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";
import { con_bloqueo_cuenta, claves_cuenta } from "@/lib/usuarios_administrativos";
import { identidad_autenticada, estado_cuenta, correo_principal, es_fundador_verificado,
  validar_identidad_fundadora, rol_efectivo, ROLES_CONOCIDOS, ErrorAdministrativo,
  cliente_clerk_administrativo, respuesta_error_administrativo } from "@/lib/autorizacion";

export async function POST() {
  try {
    const identidad = await identidad_autenticada();
    return await con_bloqueo_cuenta(claves_cuenta(identidad), async () => {
      // Releer dentro del mismo bloqueo que administración. Ningún dato previo
      // al bloqueo decide rol, estado activo o consumo de preasignaciones.
      const usuario = await identidad_autenticada(identidad.id);
      if (JSON.stringify(claves_cuenta(usuario)) !== JSON.stringify(claves_cuenta(identidad))) {
        throw new ErrorAdministrativo(409, "La identidad cambió; vuelve a intentarlo");
      }
      const principal = correo_principal(usuario);
      if (!principal || principal.verification?.status !== "verified") throw new ErrorAdministrativo(403, "Se requiere un correo principal verificado");
      const correo = principal.emailAddress.toLowerCase();
      const fundador = es_fundador_verificado(usuario);
      validar_identidad_fundadora(usuario);
      const registro = await estado_cuenta(usuario, true);
      const por_correo = await ModeloUsuario.findOne({ correo_electronico: correo });
      if ((por_correo && por_correo.id_clerk !== usuario.id) ||
          (registro && registro.correo_electronico.toLowerCase() !== correo)) {
        throw new ErrorAdministrativo(409, "La identidad persistida requiere conciliación");
      }
      const rol_clerk = rol_efectivo(usuario);
      if (!ROLES_CONOCIDOS.includes(rol_clerk)) throw new ErrorAdministrativo(403, "Rol desconocido");
      if (registro && registro.rol !== rol_clerk) {
        throw new ErrorAdministrativo(409, "Los roles requieren conciliación; sincronizar no restaura privilegios");
      }
      const pre = !registro ? await ModeloPreasignacionUsuario.findOne({ correo_electronico: correo, completado: false }) : null;
      const consumir = Boolean(pre && pre.completado === false);
      let rol = fundador ? "superadmin" : rol_clerk;
      if (consumir && !fundador) {
        if (!ROLES_CONOCIDOS.includes(pre!.rol_asignado)) throw new ErrorAdministrativo(403, "Preasignación con rol desconocido");
        // Una cuenta ya privilegiada de Clerk no se degrada por una invitación antigua.
        if (rol_clerk === "ciudadano") rol = pre!.rol_asignado;
        else if (pre!.rol_asignado !== rol_clerk) throw new ErrorAdministrativo(409, "Preasignación incompatible con la cuenta");
      }
      const nombre = [usuario.firstName, usuario.lastName].filter(Boolean).join(" ") || "Usuario EcoTrack";
      const acceso = ["superadmin", "admin", "secretario", "moderador"].includes(rol);
      return async () => {
        // Consumir antes de conceder. Si algo falla después, el bloqueo persiste
        // hasta reconciliación; no se reintenta una concesión de resultado incierto.
        if (consumir) {
          const consumida = await ModeloPreasignacionUsuario.findOneAndUpdate(
            { correo_electronico: correo, completado: false, rol_asignado: pre!.rol_asignado },
            { $set: { completado: true, fecha_registro_completado: new Date() } }, { new: true });
          if (!consumida) throw new ErrorAdministrativo(409, "La preasignación cambió; requiere conciliación");
        }
        if (usuario.publicMetadata.rol !== rol || usuario.publicMetadata.acceso_dashboard !== acceso) {
          try {
            await cliente_clerk_administrativo().users.updateUser(usuario.id, {
              publicMetadata: { ...usuario.publicMetadata, rol, acceso_dashboard: acceso },
            });
          } catch (error) {
            const status = (error as { status?: number; response?: { status?: number } }).status
              || (error as { response?: { status?: number } }).response?.status;
            console.error("[Clerk] sincronizar.updateUser", { status, code: (error as { code?: string }).code, name: (error as Error).name });
            throw error;
          }
        }
        await ModeloUsuario.findOneAndUpdate({ id_clerk: usuario.id }, {
          $set: { nombre_completo: nombre, correo_electronico: correo, rol, fecha_actualizacion: new Date() },
          $setOnInsert: { activo: true },
        }, { upsert: true, new: true, runValidators: true });
        return NextResponse.json({ exito: true, mensaje: "Usuario sincronizado correctamente",
          datos: { id_clerk: usuario.id, nombre, correo, rol, tiene_acceso_dashboard: acceso } });
      };
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}
