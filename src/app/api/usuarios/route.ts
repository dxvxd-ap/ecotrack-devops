import { NextResponse, NextRequest } from "next/server";
import { createClerkClient } from "@clerk/backend";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloUsuario } from "@/modelos/Usuario";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";

const cliente_clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

export async function GET() {
  try {
    // 1. Obtener la lista real y actualizada de todos los usuarios registrados en Clerk
    let usuarios_clerk: any[] = [];
    try {
      const respuesta_clerk = await cliente_clerk.users.getUserList({ limit: 100 });
      usuarios_clerk = respuesta_clerk.data || [];
    } catch (e_clerk: any) {
      console.warn("Aviso al consultar Clerk API:", e_clerk.message);
    }

    // 2. Obtener preasignaciones locales y de MongoDB
    const almacen = leer_almacen_local();
    const preasignaciones_locales = almacen.preasignaciones || [];

    let preasignaciones_db: any[] = [];
    try {
      await conectar_base_datos();
      preasignaciones_db = await ModeloPreasignacionUsuario.find();
    } catch (e) {}

    // 3. Fusionar datos de Clerk
    const lista_final: any[] = [];
    const correos_registrados = new Set<string>();

    for (const u of usuarios_clerk) {
      const correo = u.emailAddresses[0]?.emailAddress?.toLowerCase() || "sin_correo";
      correos_registrados.add(correo);

      const es_fundador =
        correo === "22610282@utgz.edu.mx" ||
        u.id === "user_3JzRT8FQJPrqKEfk2QdjZpFaRVN";

      const metadatos = (u.publicMetadata as Record<string, any>) || {};
      const rol_clerk = es_fundador ? "superadmin" : metadatos.rol || "ciudadano";

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
        estado_cuenta: "activo",
        activo: true,
        fecha_creacion: u.createdAt ? new Date(u.createdAt) : new Date(),
      });
    }

    // 4. Agregar usuarios preasignados que aún no se han registrado en Clerk
    const todas_preasignaciones = [...preasignaciones_locales, ...preasignaciones_db];
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
  } catch (error: any) {
    console.error("Error al obtener usuarios:", error);
    return NextResponse.json(
      { exito: false, mensaje: "Error al obtener usuarios", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { id_usuario, correo_electronico, nuevo_rol, nombre_completo, activo } = cuerpo;

    if (!id_usuario && !correo_electronico) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere identificación (id_usuario o correo_electronico)" },
        { status: 400 }
      );
    }

    const rol_limpio = nuevo_rol ? nuevo_rol.toLowerCase() : undefined;
    const tiene_acceso = rol_limpio
      ? ["superadmin", "admin", "secretario", "moderador"].includes(rol_limpio)
      : undefined;

    // 1. Si es ID de Clerk
    if (id_usuario && id_usuario.startsWith("user_")) {
      try {
        const payload_clerk: any = {};
        if (nombre_completo) {
          const partes = nombre_completo.trim().split(" ");
          payload_clerk.firstName = partes[0] || "";
          payload_clerk.lastName = partes.slice(1).join(" ") || "";
        }
        if (rol_limpio) {
          payload_clerk.publicMetadata = {
            rol: rol_limpio,
            acceso_dashboard: tiene_acceso,
          };
        }
        await cliente_clerk.users.updateUser(id_usuario, payload_clerk);
      } catch (err_clerk: any) {
        console.warn("Aviso al actualizar en Clerk por ID:", err_clerk.message);
      }
    } else if (correo_electronico) {
      // Si no tenemos ID de Clerk directo pero sí correo, buscar en Clerk y actualizar si existe
      try {
        const busqueda_clerk = await cliente_clerk.users.getUserList({
          emailAddress: [correo_electronico.toLowerCase()],
        });
        if (busqueda_clerk.data.length > 0) {
          const u_clerk = busqueda_clerk.data[0];
          const payload_clerk: any = {};
          if (nombre_completo) {
            const partes = nombre_completo.trim().split(" ");
            payload_clerk.firstName = partes[0] || "";
            payload_clerk.lastName = partes.slice(1).join(" ") || "";
          }
          if (rol_limpio) {
            payload_clerk.publicMetadata = {
              rol: rol_limpio,
              acceso_dashboard: tiene_acceso,
            };
          }
          await cliente_clerk.users.updateUser(u_clerk.id, payload_clerk);
        }
      } catch (err_busqueda: any) {
        console.warn("Aviso al buscar y actualizar Clerk por correo:", err_busqueda.message);
      }
    }

    // 2. Si es una preasignación por correo o usuario en MongoDB, actualizar ambos
    const correo_fmt = correo_electronico ? correo_electronico.toLowerCase() : null;

    if (correo_fmt) {
      const almacen = leer_almacen_local();
      const p = (almacen.preasignaciones || []).find(
        (item: any) => item.correo_electronico.toLowerCase() === correo_fmt
      );
      if (p) {
        if (rol_limpio) p.rol_asignado = rol_limpio;
        if (nombre_completo) p.nombre_completo = nombre_completo;
        guardar_almacen_local(almacen);
      }

      try {
        await conectar_base_datos();
        const obj_update_pre: any = {};
        if (rol_limpio) obj_update_pre.rol_asignado = rol_limpio;
        if (nombre_completo) obj_update_pre.nombre_completo = nombre_completo;
        await ModeloPreasignacionUsuario.findOneAndUpdate(
          { correo_electronico: correo_fmt },
          obj_update_pre
        );
      } catch (e_db_up) {}
    }

    // 3. Actualizar colección de MongoDB de usuarios si existe
    try {
      await conectar_base_datos();
      const filtro: any = {};
      if (id_usuario) filtro.$or = [{ id_clerk: id_usuario }];
      if (correo_fmt) {
        filtro.$or = [...(filtro.$or || []), { correo_electronico: correo_fmt }];
      }

      const obj_update: any = { fecha_actualizacion: new Date() };
      if (rol_limpio) obj_update.rol = rol_limpio;
      if (nombre_completo) obj_update.nombre_completo = nombre_completo;
      if (typeof activo === "boolean") obj_update.activo = activo;

      await ModeloUsuario.findOneAndUpdate(filtro, { $set: obj_update });
    } catch (e_usr_db) {}

    return NextResponse.json({
      exito: true,
      mensaje: `Usuario actualizado correctamente`,
      datos: { id: id_usuario, rol: rol_limpio, nombre_completo },
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al actualizar usuario", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const id_usuario = searchParams.get("id");
    const correo = searchParams.get("correo")?.toLowerCase();

    if (!id_usuario && !correo) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere parámetro 'id' o 'correo'" },
        { status: 400 }
      );
    }

    // 1. Si es ID de Clerk, eliminar de Clerk
    if (id_usuario && id_usuario.startsWith("user_")) {
      try {
        await cliente_clerk.users.deleteUser(id_usuario);
      } catch (err_clerk: any) {
        console.warn("Aviso al eliminar de Clerk por ID:", err_clerk.message);
      }
    } else if (correo) {
      // Si solo viene correo, intentar buscarlo en Clerk y eliminarlo
      try {
        const busqueda_clerk = await cliente_clerk.users.getUserList({
          emailAddress: [correo],
        });
        if (busqueda_clerk.data.length > 0) {
          await cliente_clerk.users.deleteUser(busqueda_clerk.data[0].id);
        }
      } catch (err_clerk_c: any) {
        console.warn("Aviso al eliminar de Clerk por correo:", err_clerk_c.message);
      }
    }

    // 2. Eliminar de almacén local (preasignaciones y usuarios locales)
    const almacen = leer_almacen_local();
    if (almacen.preasignaciones) {
      almacen.preasignaciones = almacen.preasignaciones.filter((p: any) => {
        if (id_usuario && p._id === id_usuario) return false;
        if (correo && p.correo_electronico.toLowerCase() === correo) return false;
        return true;
      });
      guardar_almacen_local(almacen);
    }

    // 3. Eliminar de MongoDB (Preasignacion y Usuario)
    try {
      await conectar_base_datos();
      if (correo) {
        await ModeloPreasignacionUsuario.deleteOne({ correo_electronico: correo });
        await ModeloUsuario.deleteOne({ correo_electronico: correo });
      }
      if (id_usuario) {
        await ModeloUsuario.deleteOne({ id_clerk: id_usuario });
      }
    } catch (e_db) {}

    return NextResponse.json({
      exito: true,
      mensaje: "Usuario eliminado correctamente del sistema",
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al eliminar usuario", detalle: error.message },
      { status: 500 }
    );
  }
}
