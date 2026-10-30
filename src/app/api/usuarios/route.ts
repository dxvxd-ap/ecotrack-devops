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
    const { id_usuario, correo_electronico, nuevo_rol, activo } = cuerpo;

    if ((!id_usuario && !correo_electronico) || !nuevo_rol) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere identificación y nuevo_rol" },
        { status: 400 }
      );
    }

    const rol_limpio = nuevo_rol.toLowerCase();
    const tiene_acceso = ["superadmin", "admin", "secretario", "moderador"].includes(rol_limpio);

    // 1. Si es ID de Clerk
    if (id_usuario && id_usuario.startsWith("user_")) {
      try {
        await cliente_clerk.users.updateUser(id_usuario, {
          publicMetadata: {
            rol: rol_limpio,
            acceso_dashboard: tiene_acceso,
          },
        });
      } catch (err_clerk: any) {
        console.warn("Aviso al actualizar en Clerk:", err_clerk.message);
      }
    }

    // 2. Si es una preasignación por correo
    if (correo_electronico) {
      const almacen = leer_almacen_local();
      const p = (almacen.preasignaciones || []).find(
        (item: any) => item.correo_electronico.toLowerCase() === correo_electronico.toLowerCase()
      );
      if (p) {
        p.rol_asignado = rol_limpio;
        guardar_almacen_local(almacen);
      }
    }

    return NextResponse.json({
      exito: true,
      mensaje: `Rol asignado correctamente a ${nuevo_rol}`,
      datos: { id: id_usuario, rol: rol_limpio },
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al actualizar rol", detalle: error.message },
      { status: 500 }
    );
  }
}
