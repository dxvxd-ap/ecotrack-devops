import { auth } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/backend";
import { NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloUsuario } from "@/modelos/Usuario";
import { ModeloBloqueoAdministrativo } from "@/modelos/BloqueoAdministrativo";

export const ROLES_INFERIORES = ["secretario", "moderador", "ciudadano", "conductor", "camion"] as const;
export const ROLES_CONOCIDOS: readonly string[] = ["superadmin", "admin", ...ROLES_INFERIORES];
export type PermisoAdministrativo = "usuarios:ver" | "usuarios:gestionar" | "usuarios:eliminar" |
  "roles:ver" | "roles:crear" | "preasignaciones:gestionar" | "dashboard:ver" | "rutas:gestionar" | "reclamos:ver" | "reclamos:gestionar";
const PERMISOS: Record<string, readonly PermisoAdministrativo[]> = {
  superadmin: ["usuarios:ver", "usuarios:gestionar", "usuarios:eliminar", "roles:ver", "roles:crear", "preasignaciones:gestionar", "dashboard:ver", "rutas:gestionar", "reclamos:ver", "reclamos:gestionar"],
  admin: ["usuarios:ver", "usuarios:gestionar", "roles:ver", "preasignaciones:gestionar", "dashboard:ver", "rutas:gestionar", "reclamos:ver", "reclamos:gestionar"],
  secretario: ["dashboard:ver"],
  moderador: ["dashboard:ver"],
};

export type UsuarioSeguridad = {
  id: string;
  publicMetadata: Record<string, unknown>;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string; verification?: { status: string } | null }[];
  banned?: boolean;
  locked?: boolean;
  firstName?: string | null;
  lastName?: string | null;
};
export type ActorAdministrativo = { usuario: UsuarioSeguridad; rol: string };

export class ErrorAdministrativo extends Error {
  constructor(public status: number, mensaje: string) { super(mensaje); }
}

export function cliente_clerk_administrativo() {
  return createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
}

// Identificadores ya existentes en middleware y sincronizar; no se crean cuentas.
const ID_FUNDADOR = "user_3JzRT8FQJPrqKEfk2QdjZpFaRVN";
const CORREO_FUNDADOR = "22610282@utgz.edu.mx";
export function es_identidad_fundador(id?: string, correo?: string): boolean {
  return Boolean((id && [ID_FUNDADOR, process.env.SUPERADMIN_USER_ID].includes(id)) ||
    (correo && [CORREO_FUNDADOR, process.env.ADMIN_CORREO?.trim().toLowerCase()].includes(correo.toLowerCase())));
}

export function rol_efectivo(usuario: UsuarioSeguridad): string {
  if (es_fundador_verificado(usuario)) return "superadmin";
  // Nunca inferir permisos de acceso_dashboard ni de metadatos enviados por cliente.
  return typeof usuario.publicMetadata.rol === "string" ? usuario.publicMetadata.rol.trim().toLowerCase() : "ciudadano";
}

export function correo_principal(usuario: UsuarioSeguridad) {
  return usuario.emailAddresses.find(e => e.id === usuario.primaryEmailAddressId);
}

export function es_fundador_verificado(usuario: UsuarioSeguridad): boolean {
  const principal = correo_principal(usuario);
  return es_identidad_fundador(usuario.id) && principal?.verification?.status === "verified" &&
    es_identidad_fundador(undefined, principal.emailAddress);
}

export function validar_identidad_fundadora(usuario: UsuarioSeguridad) {
  const principal = correo_principal(usuario);
  if ((es_identidad_fundador(usuario.id) || es_identidad_fundador(undefined, principal?.emailAddress)) &&
    !es_fundador_verificado(usuario)) {
    throw new ErrorAdministrativo(403, "La identidad fundadora requiere configuración explícita y verificada");
  }
}

export async function identidad_autenticada(id_sesion?: string | null): Promise<UsuarioSeguridad> {
  try {
    const id = id_sesion === undefined ? (await auth()).userId : id_sesion;
    if (!id) throw new ErrorAdministrativo(401, "No hay sesión activa de usuario");
    return await cliente_clerk_administrativo().users.getUser(id);
  } catch (error) {
    if (error instanceof ErrorAdministrativo) throw error;
    const status = (error as { status?: number; response?: { status?: number } }).status
      || (error as { response?: { status?: number } }).response?.status;
    console.error("[Clerk] identidad_autenticada.getUser", { status, code: (error as { code?: string }).code, name: (error as Error).name });
    throw new ErrorAdministrativo(503, "No se pudo verificar la identidad con Clerk");
  }
}

export async function estado_cuenta(usuario: UsuarioSeguridad, bloqueo_propio_adquirido = false) {
  if (usuario.banned || usuario.locked || usuario.publicMetadata.activo === false) {
    throw new ErrorAdministrativo(403, "La cuenta está desactivada o bloqueada");
  }
  await conectar_base_datos();
  // Un resultado remoto incierto no habilita bootstrap por ausencia de registro.
  // Solo el escritor que YA adquirió estos bloqueos omite esta comprobación.
  if (!bloqueo_propio_adquirido) {
    for (const clave of [usuario.id, ...usuario.emailAddresses.map(e => `correo:${e.emailAddress.toLowerCase()}`)]) {
      if (await ModeloBloqueoAdministrativo.findOne({ _id: clave })) {
        throw new ErrorAdministrativo(409, "La cuenta tiene una operación pendiente de completar o conciliar");
      }
    }
  }
  const registro = await ModeloUsuario.findOne({ id_clerk: usuario.id });
  if (registro?.activo === false) throw new ErrorAdministrativo(403, "La cuenta está desactivada");
  return registro;
}

export async function autorizar_administracion(permiso: PermisoAdministrativo, id_sesion?: string | null,
  bloqueo_propio_adquirido = false): Promise<ActorAdministrativo> {
  try {
    const usuario = await identidad_autenticada(id_sesion);
    validar_identidad_fundadora(usuario);
    const rol = rol_efectivo(usuario);
    if (usuario.banned || usuario.locked || !Object.hasOwn(PERMISOS, rol) || !PERMISOS[rol].includes(permiso)) {
      throw new ErrorAdministrativo(403, "No tienes permisos para esta operación");
    }
    const registro = await estado_cuenta(usuario, bloqueo_propio_adquirido);
    if (registro && registro.rol !== rol) throw new ErrorAdministrativo(403, "Los roles de la cuenta requieren conciliación administrativa");
    return { usuario, rol };
  } catch (error) {
    if (error instanceof ErrorAdministrativo) throw error;
    const status = (error as { status?: number; response?: { status?: number } }).status
      || (error as { response?: { status?: number } }).response?.status;
    console.error("[Clerk] autorizar_administracion", { status, code: (error as { code?: string }).code, name: (error as Error).name });
    throw new ErrorAdministrativo(503, "No se pudo verificar la autorización con Clerk");
  }
}

/** Ciudadanos: solo recursos propios. Administración: lectura municipal completa. */
export async function autorizar_reclamos(): Promise<ActorAdministrativo> {
  try {
    const usuario = await identidad_autenticada();
    validar_identidad_fundadora(usuario);
    const rol = rol_efectivo(usuario);
    if (rol !== "ciudadano" && (!Object.hasOwn(PERMISOS, rol) || !PERMISOS[rol].includes("reclamos:ver"))) {
      throw new ErrorAdministrativo(403, "No tienes permisos para esta operación");
    }
    const registro = await estado_cuenta(usuario);
    if (registro && registro.rol !== rol) throw new ErrorAdministrativo(403, "Los roles de la cuenta requieren conciliación administrativa");
    return { usuario, rol };
  } catch (error) {
    if (error instanceof ErrorAdministrativo) throw error;
    throw new ErrorAdministrativo(503, "No se pudo verificar la autorización");
  }
}

export function permiso_api_administrativa(ruta: string, metodo: string): PermisoAdministrativo | null {
  const normalizada = ruta.replace(/\/+$/, "");
  if (normalizada === "/api/rutas" && ["POST", "PUT", "DELETE"].includes(metodo)) return "rutas:gestionar";
  if (normalizada === "/api/usuarios/preasignar") return "preasignaciones:gestionar";
  if (normalizada === "/api/usuarios") return metodo === "GET" ? "usuarios:ver" : metodo === "DELETE" ? "usuarios:eliminar" : "usuarios:gestionar";
  if (normalizada === "/api/roles") return metodo === "GET" ? "roles:ver" : "roles:crear";
  return null;
}

export function texto_opcional(valor: unknown, campo: string): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor !== "string" || !valor.trim()) throw new ErrorAdministrativo(400, `Campo inválido: ${campo}`);
  return valor.trim();
}

export function correo_validado(valor: unknown): string | undefined {
  const correo = texto_opcional(valor, "correo_electronico")?.toLowerCase();
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorAdministrativo(400, "Correo electrónico inválido");
  return correo;
}

export function validar_rol_asignable(actor: ActorAdministrativo, valor: unknown): string {
  const rol = texto_opcional(valor, "rol")?.toLowerCase();
  if (!rol || !ROLES_CONOCIDOS.includes(rol) ||
    (actor.rol === "admin" && !(ROLES_INFERIORES as readonly string[]).includes(rol))) {
    throw new ErrorAdministrativo(403, "No puedes asignar ese rol");
  }
  return rol;
}

export async function resolver_usuario_clerk(id?: string, correo?: string): Promise<UsuarioSeguridad | null> {
  try {
    const cliente = cliente_clerk_administrativo();
    if (id) {
      if (!/^user_[a-zA-Z0-9_]+$/.test(id)) throw new ErrorAdministrativo(400, "Se requiere un ID de usuario de Clerk válido");
      const usuario = await cliente.users.getUser(id);
      if (correo && !usuario.emailAddresses.some(e => e.emailAddress.toLowerCase() === correo)) {
        throw new ErrorAdministrativo(400, "El ID y el correo no corresponden a la misma cuenta");
      }
      return usuario;
    }
    if (!correo) throw new ErrorAdministrativo(400, "Se requiere identificación del usuario");
    const resultado = await cliente.users.getUserList({ emailAddress: [correo], limit: 2 });
    if (resultado.totalCount > 1) throw new ErrorAdministrativo(409, "Identidad ambigua");
    const usuario = resultado.data[0];
    if (usuario && !usuario.emailAddresses.some(e => e.emailAddress.toLowerCase() === correo)) {
      throw new ErrorAdministrativo(409, "Clerk devolvió una identidad inconsistente");
    }
    return usuario || null;
  } catch (error) {
    if (error instanceof ErrorAdministrativo) throw error;
    const status = (error as { status?: number; response?: { status?: number } }).status
      || (error as { response?: { status?: number } }).response?.status;
    const op = id ? "getUser" : "getUserList";
    console.error("[Clerk] resolver_usuario_clerk." + op, { status, code: (error as { code?: string }).code, name: (error as Error).name });
    if ((error as { status?: number }).status === 404) throw new ErrorAdministrativo(404, "Usuario no encontrado");
    throw new ErrorAdministrativo(503, "No se pudo verificar la identidad con Clerk");
  }
}

export function validar_gestion_objetivo(actor: ActorAdministrativo, objetivo: {
  id?: string; correo?: string; roles: string[]; fundador?: boolean;
}, cambio: { eliminar?: boolean; cancelar_preasignacion?: boolean; rol?: string; activo?: boolean }) {
  if (objetivo.roles.some(rol => !ROLES_CONOCIDOS.includes(rol))) throw new ErrorAdministrativo(403, "El rol objetivo no tiene una jerarquía definida");
  if (actor.rol === "admin" && (cambio.eliminar || objetivo.fundador || es_identidad_fundador(objetivo.id, objetivo.correo) ||
    objetivo.roles.some(rol => !(ROLES_INFERIORES as readonly string[]).includes(rol)))) {
    throw new ErrorAdministrativo(403, "No puedes administrar esta cuenta");
  }
  const protegido = objetivo.fundador || es_identidad_fundador(objetivo.id, objetivo.correo) || objetivo.roles.includes("superadmin");
  // No hay CAS entre Clerk y MongoDB: bloquear todos los superadmins evita
  // depender de un conteo vulnerable a borrados/degradaciones concurrentes.
  if (protegido && (cambio.eliminar || cambio.cancelar_preasignacion || cambio.activo === false || (cambio.rol !== undefined && cambio.rol !== "superadmin"))) {
    throw new ErrorAdministrativo(403, "No se permite eliminar, degradar o desactivar al fundador ni a cuentas superadmin");
  }
  if (objetivo.id === actor.usuario.id && cambio.rol && cambio.rol !== actor.rol) {
    throw new ErrorAdministrativo(403, "No puedes cambiar tus propios privilegios");
  }
}

export function respuesta_error_administrativo(error: unknown) {
  const status = error instanceof ErrorAdministrativo ? error.status : error instanceof SyntaxError ? 400 : 503;
  const mensaje = error instanceof ErrorAdministrativo ? error.message : status === 400 ? "JSON inválido" : "No se pudo completar la operación administrativa";
  return NextResponse.json({ ok: false, exito: false, mensaje }, { status });
}
