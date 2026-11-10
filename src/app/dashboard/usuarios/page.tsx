"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Shield,
  ShieldCheck,
  Plus,
  CheckCircle,
  AlertTriangle,
  UserPlus,
  RefreshCw,
  Mail,
  Trash2,
  Clock,
  Edit2,
  Save,
  X,
} from "lucide-react";

export default function PaginaGestionUsuariosRoles() {
  const [usuarios, fijar_usuarios] = useState<any[]>([]);
  const [roles, fijar_roles] = useState<any[]>([]);
  const [cargando, fijar_cargando] = useState(true);
  const [modal_rol_abierto, fijar_modal_rol_abierto] = useState(false);
  const [modal_invitar_abierto, fijar_modal_invitar_abierto] = useState(false);
  const [guardando_rol, fijar_guardando_rol] = useState(false);
  const [guardando_invitacion, fijar_guardando_invitacion] = useState(false);
  const [mensaje_exito, fijar_mensaje_exito] = useState("");

  // Formulario nuevo rol dinámico
  const [form_rol, fijar_form_rol] = useState({
    nombre: "",
    descripcion: "",
    acceso_dashboard: true,
    permisos: "rutas:ver,flota:ver",
  });

  // Formulario preasignar usuario por correo
  const [form_preasignar, fijar_form_preasignar] = useState({
    nombre_completo: "",
    correo_electronico: "",
    rol_asignado: "admin",
  });

  const cargar_datos = async () => {
    try {
      fijar_cargando(true);
      const [res_usr, res_rol] = await Promise.all([
        fetch("/api/usuarios").then((r) => r.json()),
        fetch("/api/roles").then((r) => r.json()),
      ]);

      if (res_usr.exito) fijar_usuarios(res_usr.datos || []);
      if (res_rol.exito) fijar_roles(res_rol.datos || []);
    } catch (e) {
      console.error("Error al cargar usuarios y roles:", e);
    } finally {
      fijar_cargando(false);
    }
  };

  useEffect(() => {
    cargar_datos();
  }, []);

  const cambiar_rol_usuario = async (
    id_usuario: string,
    correo: string,
    nuevo_rol: string
  ) => {
    try {
      fijar_mensaje_exito("");
      const res = await fetch("/api/usuarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_usuario,
          correo_electronico: correo,
          nuevo_rol,
        }),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_mensaje_exito(`Rol modificado a ${nuevo_rol} correctamente.`);
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al actualizar rol");
      }
    } catch (e) {
      alert("Error de red");
    }
  };

  const guardar_preasignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_guardando_invitacion(true);
      fijar_mensaje_exito("");
      const res = await fetch("/api/usuarios/preasignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form_preasignar),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_modal_invitar_abierto(false);
        fijar_form_preasignar({
          nombre_completo: "",
          correo_electronico: "",
          rol_asignado: "admin",
        });
        fijar_mensaje_exito(data.mensaje);
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al preasignar rol");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      fijar_guardando_invitacion(false);
    }
  };

  // Modal editar usuario
  const [modal_editar_abierto, fijar_modal_editar_abierto] = useState(false);
  const [usuario_a_editar, fijar_usuario_a_editar] = useState<any>(null);
  const [guardando_edicion, fijar_guardando_edicion] = useState(false);
  const [form_editar, fijar_form_editar] = useState({
    nombre_completo: "",
    correo_electronico: "",
    rol: "admin",
  });

  const abrir_modal_editar = (usuario: any) => {
    fijar_usuario_a_editar(usuario);
    fijar_form_editar({
      nombre_completo: usuario.nombre_completo || "",
      correo_electronico: usuario.correo_electronico || "",
      rol: usuario.rol || "ciudadano",
    });
    fijar_modal_editar_abierto(true);
  };

  const guardar_edicion_usuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario_a_editar) return;
    try {
      fijar_guardando_edicion(true);
      fijar_mensaje_exito("");
      const res = await fetch("/api/usuarios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_usuario: usuario_a_editar.id_clerk,
          correo_electronico: usuario_a_editar.correo_electronico,
          nuevo_rol: form_editar.rol,
          nombre_completo: form_editar.nombre_completo,
        }),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_modal_editar_abierto(false);
        fijar_mensaje_exito("Usuario actualizado correctamente.");
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al actualizar usuario");
      }
    } catch (e) {
      alert("Error de conexión al actualizar usuario");
    } finally {
      fijar_guardando_edicion(false);
    }
  };

  const eliminar_usuario_total = async (u: any) => {
    const nombre = u.nombre_completo || u.correo_electronico;
    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente a "${nombre}" del sistema?`)) {
      return;
    }

    try {
      fijar_mensaje_exito("");
      const params = new URLSearchParams();
      if (u.id_clerk) params.set("id", u.id_clerk);
      if (u.correo_electronico) params.set("correo", u.correo_electronico);

      const res = await fetch(`/api/usuarios?${params.toString()}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.exito) {
        fijar_mensaje_exito(`Usuario "${nombre}" eliminado del sistema.`);
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al eliminar usuario");
      }
    } catch (e) {
      alert("Error de red al intentar eliminar");
    }
  };

  const eliminar_preasignacion = async (correo: string) => {
    if (!confirm(`¿Eliminar la preasignación para ${correo}?`)) return;
    try {
      const res = await fetch(`/api/usuarios/preasignar?correo=${encodeURIComponent(correo)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.exito) {
        cargar_datos();
      }
    } catch (e) {
      alert("Error al eliminar preasignación");
    }
  };

  const crear_rol_dinamico = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      fijar_guardando_rol(true);
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form_rol,
          permisos: form_rol.permisos.split(",").map((p) => p.trim()),
        }),
      });
      const data = await res.json();
      if (data.exito) {
        fijar_modal_rol_abierto(false);
        fijar_form_rol({
          nombre: "",
          descripcion: "",
          acceso_dashboard: true,
          permisos: "rutas:ver,flota:ver",
        });
        fijar_mensaje_exito("Nuevo rol creado exitosamente.");
        cargar_datos();
      } else {
        alert(data.mensaje || "Error al crear rol");
      }
    } catch (e) {
      alert("Error de red");
    } finally {
      fijar_guardando_rol(false);
    }
  };

  return (
    <div className="p-8 space-y-8 font-sans">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-rose-400 mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>MÓDULO DE SEGURIDAD // CONTROL DE ACCESO BASADO EN ROLES</span>
          </div>
          <h1 className="texto-anton text-3xl tracking-wide text-white">
            USUARIOS Y ROLES DEL SISTEMA (RBAC)
          </h1>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Preasigna roles por correo antes de que los usuarios se registren para que accedan al dashboard de inmediato.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fijar_modal_invitar_abierto(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all shadow-md"
          >
            <UserPlus className="w-4 h-4" />
            <span>Pre-asignar Usuario por Correo</span>
          </button>

          <button
            onClick={() => fijar_modal_rol_abierto(true)}
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-semibold px-4 py-2.5 rounded-lg transition-all border border-zinc-700"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Rol Dinámico</span>
          </button>
        </div>
      </div>

      {mensaje_exito && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center gap-2 text-xs font-mono">
          <CheckCircle className="w-4 h-4" />
          <span>{mensaje_exito}</span>
        </div>
      )}

      {/* Tabla de Usuarios Registrados y Preasignados */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="texto-anton text-lg tracking-wide text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-rose-400" />
            <span>DIRECTORIO DE USUARIOS ({usuarios.length})</span>
          </h2>

          <button
            onClick={cargar_datos}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-mono"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
        </div>

        {usuarios.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs font-mono border border-dashed border-zinc-800 rounded-xl">
            No se han registrado usuarios. Usa el botón "Pre-asignar Usuario por Correo" arriba.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/60 font-mono text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                <tr>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Correo Electrónico</th>
                  <th className="p-3">Estado de Cuenta</th>
                  <th className="p-3">Rol Asignado</th>
                  <th className="p-3">Acceso Dashboard</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {usuarios.map((u) => {
                  const rol_limpio = (u.rol || "ciudadano").toLowerCase();
                  const rol_obj = roles.find(
                    (r) => r.nombre.toLowerCase() === rol_limpio
                  );
                  const tiene_acceso =
                    rol_obj?.acceso_dashboard ??
                    ["superadmin", "admin", "secretario", "moderador"].includes(rol_limpio);

                  const es_preasignado = u.estado_cuenta === "pendiente_registro";

                  return (
                    <tr key={u._id || u.correo_electronico} className="hover:bg-zinc-800/30">
                      <td className="p-3 font-semibold text-white">
                        {u.nombre_completo}
                      </td>
                      <td className="p-3 font-mono text-zinc-300">
                        {u.correo_electronico}
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        {es_preasignado ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" />
                            <span>Pendiente de primer ingreso</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            <CheckCircle className="w-3 h-3" />
                            <span>Activo en Clerk</span>
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                            rol_limpio === "superadmin" || rol_limpio === "admin"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : rol_limpio === "secretario" || rol_limpio === "moderador"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-zinc-700/20 text-zinc-400 border-zinc-700/30"
                          }`}
                        >
                          {rol_limpio}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        {tiene_acceso ? (
                          <span className="text-emerald-400 font-semibold">
                            ✓ Habilitado
                          </span>
                        ) : (
                          <span className="text-zinc-500">Bloqueado (Periférico)</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => abrir_modal_editar(u)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-mono transition-colors"
                            title="Editar usuario y rol"
                          >
                            <Edit2 className="w-3 h-3 text-blue-400" />
                            <span>Editar</span>
                          </button>

                          <button
                            onClick={() => eliminar_usuario_total(u)}
                            className="inline-flex items-center gap-1 p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20"
                            title="Eliminar usuario del sistema"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Pre-asignar Usuario por Correo */}
      {modal_invitar_abierto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="texto-anton text-xl tracking-wide text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-500" />
                <span>PRE-ASIGNAR ROL POR CORREO</span>
              </h3>
              <button
                onClick={() => fijar_modal_invitar_abierto(false)}
                className="text-zinc-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-400 font-sans leading-relaxed">
              Registra el correo institucional o personal de la persona. Cuando cree su cuenta en Clerk o inicie sesión, entrará directamente al <strong>Dashboard</strong> con el rol que elijas, sin pasar por la vista de ciudadano ni ser bloqueado.
            </p>

            <form onSubmit={guardar_preasignacion} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  NOMBRE COMPLETO DEL USUARIO
                </label>
                <input
                  type="text"
                  value={form_preasignar.nombre_completo}
                  onChange={(e) =>
                    fijar_form_preasignar({
                      ...form_preasignar,
                      nombre_completo: e.target.value,
                    })
                  }
                  required
                  placeholder="Ej: Lic. Martín Domínguez"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  CORREO ELECTRÓNICO (CON EL QUE INICIARÁ SESIÓN)
                </label>
                <input
                  type="email"
                  value={form_preasignar.correo_electronico}
                  onChange={(e) =>
                    fijar_form_preasignar({
                      ...form_preasignar,
                      correo_electronico: e.target.value,
                    })
                  }
                  required
                  placeholder="Ej: obraspublicas@utgz.edu.mx"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500 lowercase"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  ROL A ASIGNAR EN EL SISTEMA
                </label>
                <select
                  value={form_preasignar.rol_asignado}
                  onChange={(e) =>
                    fijar_form_preasignar({
                      ...form_preasignar,
                      rol_asignado: e.target.value,
                    })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                >
                  <option value="admin">ADMIN (ADMINISTRADOR OPERATIVO)</option>
                  <option value="secretario">SECRETARIO (RUTAS Y CALENDARIOS)</option>
                  <option value="moderador">MODERADOR (SUPERVISIÓN Y ALERTAS)</option>
                  <option value="superadmin">SUPERADMIN (CONTROL TOTAL)</option>
                  <option value="conductor">CONDUCTOR (PERIFÉRICO)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fijar_modal_invitar_abierto(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando_invitacion}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-mono text-xs font-semibold uppercase"
                >
                  {guardando_invitacion ? "Pre-asignando..." : "Confirmar Preasignación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Crear Rol Dinámico */}
      {modal_rol_abierto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="texto-anton text-xl tracking-wide text-white">
                CREAR NUEVO ROL DE DASHBOARD
              </h3>
              <button
                onClick={() => fijar_modal_rol_abierto(false)}
                className="text-zinc-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={crear_rol_dinamico} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  NOMBRE DEL ROL (IDENTIFICADOR)
                </label>
                <input
                  type="text"
                  value={form_rol.nombre}
                  onChange={(e) =>
                    fijar_form_rol({ ...form_rol, nombre: e.target.value })
                  }
                  required
                  placeholder="Ej: inspector_ecologico, supervisor"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono lowercase focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  DESCRIPCIÓN DE RESPONSABILIDADES
                </label>
                <textarea
                  value={form_rol.descripcion}
                  onChange={(e) =>
                    fijar_form_rol({ ...form_rol, descripcion: e.target.value })
                  }
                  required
                  rows={2}
                  placeholder="Propósito operativo del rol..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="acceso_dash"
                  checked={form_rol.acceso_dashboard}
                  onChange={(e) =>
                    fijar_form_rol({
                      ...form_rol,
                      acceso_dashboard: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-rose-500 rounded"
                />
                <label htmlFor="acceso_dash" className="text-zinc-300 font-mono text-xs">
                  Permitir acceso al panel de control (/dashboard)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fijar_modal_rol_abierto(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando_rol}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-mono text-xs font-semibold uppercase"
                >
                  {guardando_rol ? "Creando..." : "Guardar Rol"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Editar Usuario y Rol */}
      {modal_editar_abierto && usuario_a_editar && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="texto-anton text-xl tracking-wide text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-400" />
                <span>EDITAR USUARIO Y ROL</span>
              </h3>
              <button
                onClick={() => fijar_modal_editar_abierto(false)}
                className="text-zinc-400 hover:text-white font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={guardar_edicion_usuario} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  NOMBRE COMPLETO
                </label>
                <input
                  type="text"
                  value={form_editar.nombre_completo}
                  onChange={(e) =>
                    fijar_form_editar({ ...form_editar, nombre_completo: e.target.value })
                  }
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  CORREO ELECTRÓNICO (NO MODIFICABLE)
                </label>
                <input
                  type="email"
                  disabled
                  value={form_editar.correo_electronico}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3.5 py-2.5 text-zinc-400 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-mono mb-1">
                  ROL DEL SISTEMA (RBAC)
                </label>
                <select
                  value={form_editar.rol.toLowerCase()}
                  onChange={(e) =>
                    fijar_form_editar({ ...form_editar, rol: e.target.value })
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                >
                  {(roles.length > 0
                    ? roles
                    : [
                        { nombre: "superadmin", acceso_dashboard: true },
                        { nombre: "admin", acceso_dashboard: true },
                        { nombre: "secretario", acceso_dashboard: true },
                        { nombre: "moderador", acceso_dashboard: true },
                        { nombre: "ciudadano", acceso_dashboard: false },
                        { nombre: "conductor", acceso_dashboard: false },
                        { nombre: "camion", acceso_dashboard: false },
                      ]
                  ).map((r) => (
                    <option key={r.nombre} value={r.nombre.toLowerCase()}>
                      {r.nombre.toUpperCase()} {r.acceso_dashboard ? "(Dashboard)" : "(Periférico)"}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Los roles con permiso de Dashboard son: <em>superadmin, admin, secretario, moderador</em> y roles dinámicos activos.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fijar_modal_editar_abierto(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando_edicion}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-mono text-xs font-semibold uppercase"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{guardando_edicion ? "Guardando..." : "Guardar Cambios"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
