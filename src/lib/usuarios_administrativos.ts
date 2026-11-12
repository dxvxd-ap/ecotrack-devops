import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloUsuario } from "@/modelos/Usuario";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";
import { ModeloBloqueoAdministrativo } from "@/modelos/BloqueoAdministrativo";
import { ActorAdministrativo, UsuarioSeguridad, ErrorAdministrativo, resolver_usuario_clerk,
  rol_efectivo, es_identidad_fundador, validar_gestion_objetivo, cliente_clerk_administrativo,
  autorizar_administracion, validar_rol_asignable } from "./autorizacion";

type CambioSeguridad = { eliminar?: boolean; cancelar_preasignacion?: boolean; crear_preasignacion?: boolean; rol?: string; activo?: boolean };

// Misma exclusión para administración y sincronización. No usa TTL ni snapshots
// previos al bloqueo como autoridad. Resultados inciertos retienen el bloqueo.
export function claves_cuenta(usuario: UsuarioSeguridad | null, correo?: string): string[] {
  return [...new Set([...(usuario ? [usuario.id, ...usuario.emailAddresses.map(e => `correo:${e.emailAddress.toLowerCase()}`)] : []),
    ...(correo ? [`correo:${correo}`] : [])])].sort();
}

export async function con_bloqueo_cuenta<T>(claves: string[], preparar: () => Promise<() => Promise<T>>): Promise<T> {
  await conectar_base_datos();
  const adquiridas: string[] = [];
  try {
    for (const clave of claves) {
      await ModeloBloqueoAdministrativo.create({ _id: clave });
      adquiridas.push(clave);
    }
  } catch (error) {
    for (const clave of adquiridas.reverse()) await ModeloBloqueoAdministrativo.deleteOne({ _id: clave });
    if ((error as { code?: number }).code === 11000) throw new ErrorAdministrativo(409, "La cuenta tiene una operación administrativa en curso o pendiente de recuperación");
    throw new ErrorAdministrativo(503, "No se pudo garantizar exclusión para esta cuenta");
  }
  let iniciada = false;
  let completada = false;
  try {
    const escribir = await preparar();
    iniciada = true;
    const resultado = await escribir();
    completada = true;
    return resultado;
  } finally {
    if (!iniciada || completada) for (const clave of adquiridas.reverse()) await ModeloBloqueoAdministrativo.deleteOne({ _id: clave });
  }
}

export async function con_objetivo_bloqueado<T>(actor: ActorAdministrativo, id: string | undefined,
  correo: string | undefined, cambio: CambioSeguridad,
  operar: (objetivo: Awaited<ReturnType<typeof preparar_objetivo>>) => Promise<T>): Promise<T> {
  const identidad = await resolver_usuario_clerk(id, correo);
  const claves = claves_cuenta(identidad, correo);
  return con_bloqueo_cuenta(claves, async () => {
    const actor_actual = await autorizar_administracion(cambio.eliminar ? "usuarios:eliminar" : "usuarios:gestionar", actor.usuario.id,
      identidad?.id === actor.usuario.id);
    if (cambio.rol) validar_rol_asignable(actor_actual, cambio.rol);
    const objetivo = await preparar_objetivo(actor_actual, id, correo, cambio);
    if (JSON.stringify(claves_cuenta(objetivo.usuario, correo)) !== JSON.stringify(claves)) throw new ErrorAdministrativo(409, "La identidad cambió durante la operación; vuelve a intentarlo");
    if (!objetivo.existe && !cambio.crear_preasignacion && !cambio.cancelar_preasignacion) throw new ErrorAdministrativo(404, "Usuario o preasignación no encontrado");
    return () => operar(objetivo);
  });
}

export async function preparar_objetivo(actor: ActorAdministrativo, id: string | undefined, correo_solicitado: string | undefined,
  cambio: CambioSeguridad) {
  const usuario = await resolver_usuario_clerk(id, correo_solicitado);
  const correo = correo_solicitado || usuario?.emailAddresses.find(e => e.id === usuario.primaryEmailAddressId)?.emailAddress.toLowerCase()
    || usuario?.emailAddresses[0]?.emailAddress.toLowerCase();
  if (!correo) throw new ErrorAdministrativo(400, "No se pudo determinar el correo de la cuenta");
  // Se revisan TODAS las fuentes antes de escribir: una caída de BD no permite
  // omitir un rol privilegiado o una identidad conflictiva de una preasignación.
  await conectar_base_datos();
  const pre_db = await ModeloPreasignacionUsuario.findOne({ correo_electronico: correo });
  const usuario_db = await ModeloUsuario.findOne({ correo_electronico: correo });
  const usuario_db_id = usuario ? await ModeloUsuario.findOne({ id_clerk: usuario.id }) : null;
  if ((usuario_db && usuario_db.id_clerk !== usuario?.id) ||
      (usuario_db_id && usuario_db_id.correo_electronico.toLowerCase() !== correo)) {
    throw new ErrorAdministrativo(409, "La identidad de MongoDB no coincide con Clerk");
  }
  const roles = [usuario ? rol_efectivo(usuario) : undefined, usuario_db?.rol, pre_db?.rol_asignado]
    .filter((r): r is string => r !== undefined).map(r => typeof r === "string" ? r.trim().toLowerCase() : "");
  const fundador = usuario ? es_fundador_protegido(usuario) : es_identidad_fundador(undefined, correo);
  validar_gestion_objetivo(actor, { id: usuario?.id, correo, roles, fundador }, cambio);
  if (!usuario && cambio.activo !== undefined) throw new ErrorAdministrativo(400, "Una preasignación no es una cuenta; cancélala para retirar el acceso pendiente");
  return { usuario, correo, existe: Boolean(usuario || pre_db), pre_db, usuario_db };
}

function es_fundador_protegido(usuario: UsuarioSeguridad) {
  return es_identidad_fundador(usuario.id) || usuario.emailAddresses.some(e => es_identidad_fundador(undefined, e.emailAddress));
}

export async function actualizar_objetivo(objetivo: Awaited<ReturnType<typeof preparar_objetivo>>, cambio: {
  rol?: string; nombre_completo?: string; activo?: boolean;
}) {
  const { usuario, correo } = objetivo;
  if (!objetivo.existe) throw new ErrorAdministrativo(404, "Usuario o preasignación no encontrado");
  if (usuario) {
    const partes = cambio.nombre_completo?.split(/\s+/);
    try {
      await cliente_clerk_administrativo().users.updateUser(usuario.id, {
        ...(partes ? { firstName: partes[0], lastName: partes.slice(1).join(" ") } : {}),
        ...((cambio.rol || cambio.activo !== undefined) ? { publicMetadata: { ...usuario.publicMetadata,
          ...(cambio.rol ? { rol: cambio.rol, acceso_dashboard: ["superadmin", "admin", "secretario", "moderador"].includes(cambio.rol) } : {}),
          ...(cambio.activo !== undefined ? { activo: cambio.activo } : {}),
        } } : {}),
      });
    } catch (error) {
      const status = (error as { status?: number; response?: { status?: number } }).status
        || (error as { response?: { status?: number } }).response?.status;
      console.error("[Clerk] actualizar_objetivo.updateUser", { status, code: (error as { code?: string }).code, name: (error as Error).name });
      throw error;
    }
  }
  const actualizacion = {
    ...(cambio.rol ? { completado: Boolean(usuario) } : {}),
    ...(cambio.rol ? { rol_asignado: cambio.rol } : {}),
    ...(cambio.nombre_completo ? { nombre_completo: cambio.nombre_completo } : {}),
  };
  await ModeloPreasignacionUsuario.findOneAndUpdate({ correo_electronico: correo }, { $set: actualizacion });
  if (usuario) await ModeloUsuario.findOneAndUpdate({ id_clerk: usuario.id, correo_electronico: correo }, { $set: {
    fecha_actualizacion: new Date(), rol: cambio.rol || objetivo.usuario_db?.rol || rol_efectivo(usuario),
    ...(cambio.nombre_completo ? { nombre_completo: cambio.nombre_completo } : {}),
    ...(cambio.activo !== undefined ? { activo: cambio.activo } : {}),
  }, $setOnInsert: { ...(cambio.nombre_completo ? {} : { nombre_completo: "Usuario EcoTrack" }),
    ...(cambio.activo === undefined ? { activo: usuario.publicMetadata.activo !== false } : {}) } }, { upsert: true, runValidators: true });
}
