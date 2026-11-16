import { identidad_autenticada, estado_cuenta, rol_efectivo, correo_principal,
  validar_identidad_fundadora, ErrorAdministrativo } from "./autorizacion";
import { ModeloUsuario } from "@/modelos/Usuario";
import { claves_cuenta, con_bloqueo_cuenta } from "./usuarios_administrativos";

type OpcionesCiudadano = { permitir_registro?: boolean; id_sesion?: string; bloqueo_propio_adquirido?: boolean };

/** Opciones solo internas del servidor; nunca derivarlas del cuerpo de la petición. */
export async function autorizar_ciudadano(opciones: OpcionesCiudadano = {}) {
  try {
    const usuario = await identidad_autenticada(opciones.id_sesion);
    validar_identidad_fundadora(usuario);
    if (rol_efectivo(usuario) !== "ciudadano") throw new ErrorAdministrativo(403, "Se requiere una cuenta ciudadana");
    const principal = correo_principal(usuario);
    if (!principal || principal.verification?.status !== "verified") throw new ErrorAdministrativo(403, "Se requiere un correo principal verificado");
    const correo = principal.emailAddress.toLowerCase();
    const registro = await estado_cuenta(usuario, opciones.bloqueo_propio_adquirido);
    if (registro && (registro.id_clerk !== usuario.id || registro.activo !== true || registro.rol !== "ciudadano")) {
      throw new ErrorAdministrativo(403, "El perfil ciudadano requiere conciliación administrativa");
    }
    const por_correo = await ModeloUsuario.findOne({ correo_electronico: correo });
    if ((registro && registro.correo_electronico.toLowerCase() !== correo) || (por_correo && por_correo.id_clerk !== usuario.id)) {
      throw new ErrorAdministrativo(409, "La identidad persistida requiere conciliación");
    }
    if (!registro && !opciones.permitir_registro) throw new ErrorAdministrativo(409, "Primero debes sincronizar tu perfil ciudadano");
    return { usuario, registro, correo };
  } catch (error) {
    if (error instanceof ErrorAdministrativo) throw error;
    throw new ErrorAdministrativo(503, "No se pudo verificar la autorización ciudadana");
  }
}
export type ActorCiudadano = Awaited<ReturnType<typeof autorizar_ciudadano>>;

/** Relee seguridad dentro de la misma exclusión que utiliza administración. */
export async function con_ciudadano_bloqueado<T>(actor: ActorCiudadano,
  preparar: (actual: ActorCiudadano) => Promise<() => Promise<T>>, permitir_registro = false): Promise<T> {
  const claves = claves_cuenta(actor.usuario);
  return con_bloqueo_cuenta(claves, async () => {
    const actual = await autorizar_ciudadano({ id_sesion: actor.usuario.id, permitir_registro, bloqueo_propio_adquirido: true });
    if (JSON.stringify(claves_cuenta(actual.usuario)) !== JSON.stringify(claves)) throw new ErrorAdministrativo(409, "La identidad cambió durante la operación; vuelve a consultar tu perfil");
    return preparar(actual);
  });
}
