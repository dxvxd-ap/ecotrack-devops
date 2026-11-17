import { NextResponse, NextRequest } from "next/server";
import {
  autorizar_administracion, cliente_clerk_administrativo, respuesta_error_administrativo,
  texto_opcional, correo_validado, validar_rol_asignable, ErrorAdministrativo, rol_efectivo, es_identidad_fundador, correo_principal,
} from "@/lib/autorizacion";
import { con_objetivo_bloqueado, actualizar_objetivo } from "@/lib/usuarios_administrativos";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloUsuario } from "@/modelos/Usuario";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";

export async function GET() {
  try {
    await autorizar_administracion("usuarios:ver");
    const cliente_clerk = cliente_clerk_administrativo();
    // 1. Obtener la lista real y actualizada de todos los usuarios registrados en Clerk
    let usuarios_clerk: any[] = [];
    try {
      const respuesta_clerk = await cliente_clerk.users.getUserList({ limit: 100 });
      usuarios_clerk = respuesta_clerk.data || [];
    } catch (e_clerk: any) {
      throw new ErrorAdministrativo(503, "No se pudieron consultar usuarios de Clerk");
    }

    // 2. MongoDB es la única fuente de preasignaciones administrativas.
    let preasignaciones_db: any[] = [];
    let usuarios_db: any[] = [];
    try {
      await conectar_base_datos();
      preasignaciones_db = await ModeloPreasignacionUsuario.find();
      usuarios_db = await ModeloUsuario.find();
    } catch (e) { throw new ErrorAdministrativo(503, "No se pudieron consultar preasignaciones"); }

    // 3. Fusionar datos de Clerk
    const lista_final: any[] = [];
    const correos_registrados = new Set<string>();

    for (const u of usuarios_clerk) {
      const correo = correo_principal(u)?.emailAddress.toLowerCase() || "sin_correo";
      correos_registrados.add(correo);
      const activo = u.publicMetadata.activo !== false && !u.banned && !u.locked &&
        usuarios_db.find(registro => registro.id_clerk === u.id)?.activo !== false;

      const rol_clerk = rol_efectivo(u);
      const es_fundador = es_identidad_fundador(u.id, correo);

      const nombre =
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        u.username ||
        (es_fundador ? "Super Administrador (UTGZ)" : "Usuario EcoRuta");

      lista_final.push({
        _id: u.id,
        id_clerk: u.id,
        nombre_completo: nombre,
        correo_electronico: correo,
        rol: rol_clerk,
        estado_cuenta: activo ? "activo" : "inactivo",
        activo,
        fecha_creacion: u.createdAt ? new Date(u.createdAt) : new Date(),
      });
    }

    // 4. Agregar usuarios preasignados que aún no se han registrado en Clerk
    const todas_preasignaciones = preasignaciones_db;
    const mapa_pre = new Map();
    todas_preasignaciones.forEach((p) => {
      const c = p.correo_electronico?.toLowerCase();
      if (c && !mapa_pre.has(c)) {
        mapa_pre.set(c, p);
      }
    });

    mapa_pre.forEach((pre, correo) => {
      if (!correos_registrados.has(correo)) {
        lista_final.push({
          _id: pre._id || `pre_${correo}`,
          id_clerk: null,
          nombre_completo: pre.nombre_completo,
          correo_electronico: correo,
          rol: pre.rol_asignado,
          estado_cuenta: "pendiente_registro", // Aún no ha iniciado sesión
          activo: true,
          fecha_creacion: pre.fecha_creacion || new Date(),
        });
      }
    });

    return NextResponse.json({
      exito: true,
      datos: lista_final,
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}

export async function PUT(peticion: NextRequest) {
  try {
    const actor = await autorizar_administracion("usuarios:gestionar");
    const cuerpo = await peticion.json();
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw new ErrorAdministrativo(400, "Cuerpo inválido");
    const id = texto_opcional(cuerpo.id_usuario, "id_usuario");
    const correo = correo_validado(cuerpo.correo_electronico);
    const rol = cuerpo.nuevo_rol !== undefined ? validar_rol_asignable(actor, cuerpo.nuevo_rol) : undefined;
    const nombre_completo = texto_opcional(cuerpo.nombre_completo, "nombre_completo");
    if (cuerpo.activo !== undefined && typeof cuerpo.activo !== "boolean") throw new ErrorAdministrativo(400, "activo debe ser booleano");
    if (rol === undefined && nombre_completo === undefined && cuerpo.activo === undefined) throw new ErrorAdministrativo(400, "No hay cambios válidos");
    return await con_objetivo_bloqueado(actor, id, correo, { rol, activo: cuerpo.activo }, async objetivo => {
      await actualizar_objetivo(objetivo, { rol, nombre_completo, activo: cuerpo.activo });
      return NextResponse.json({ exito: true, mensaje: "Usuario actualizado correctamente",
        datos: { id: objetivo.usuario?.id, rol, nombre_completo } });
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}

export async function DELETE(peticion: NextRequest) {
  try {
    const actor = await autorizar_administracion("usuarios:eliminar");
    const { searchParams } = new URL(peticion.url);
    const id = texto_opcional(searchParams.get("id"), "id");
    const correo = correo_validado(searchParams.get("correo"));
    return await con_objetivo_bloqueado(actor, id, correo, { eliminar: true }, async objetivo => {
      if (!objetivo.existe) throw new ErrorAdministrativo(404, "Usuario o preasignación no encontrado");
      // Usar únicamente la identidad resuelta, nunca dos selectores independientes.
      if (objetivo.usuario) await cliente_clerk_administrativo().users.deleteUser(objetivo.usuario.id);
      await ModeloPreasignacionUsuario.deleteOne({ correo_electronico: objetivo.correo });
      if (objetivo.usuario) await ModeloUsuario.deleteOne({ id_clerk: objetivo.usuario.id, correo_electronico: objetivo.correo });
      return NextResponse.json({ exito: true, mensaje: "Usuario eliminado correctamente del sistema" });
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}
