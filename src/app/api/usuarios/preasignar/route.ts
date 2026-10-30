import { NextResponse, NextRequest } from "next/server";
import { createClerkClient } from "@clerk/backend";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";

const cliente_clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { correo_electronico, nombre_completo, rol_asignado } = cuerpo;

    if (!correo_electronico || !nombre_completo || !rol_asignado) {
      return NextResponse.json(
        { exito: false, mensaje: "Correo, nombre completo y rol son obligatorios" },
        { status: 400 }
      );
    }

    const correo_limpio = correo_electronico.trim().toLowerCase();
    const rol_limpio = rol_asignado.trim().toLowerCase();
    const nombre_limpio = nombre_completo.trim();

    // 1. Guardar en almacén local
    const almacen = leer_almacen_local();
    const existente_idx = (almacen.preasignaciones || []).findIndex(
      (p: any) => p.correo_electronico.toLowerCase() === correo_limpio
    );

    const objeto_preasignacion = {
      _id: `pre_${Date.now()}`,
      correo_electronico: correo_limpio,
      nombre_completo: nombre_limpio,
      rol_asignado: rol_limpio,
      completado: false,
      fecha_creacion: new Date().toISOString(),
    };

    if (existente_idx >= 0) {
      almacen.preasignaciones[existente_idx] = objeto_preasignacion;
    } else {
      almacen.preasignaciones = [objeto_preasignacion, ...(almacen.preasignaciones || [])];
    }
    guardar_almacen_local(almacen);

    // 2. Intentar guardar en MongoDB Atlas
    try {
      await conectar_base_datos();
      await ModeloPreasignacionUsuario.findOneAndUpdate(
        { correo_electronico: correo_limpio },
        {
          nombre_completo: nombre_limpio,
          rol_asignado: rol_limpio,
          completado: false,
        },
        { upsert: true, new: true }
      );
    } catch (e_db: any) {
      console.warn("MongoDB no conectado, preasignación guardada en respaldo local:", e_db.message);
    }

    // 3. Verificar si el usuario ya existe en Clerk por si acaso ya se había registrado
    try {
      const lista = await cliente_clerk.users.getUserList({
        emailAddress: [correo_limpio],
      });
      if (lista.data.length > 0) {
        const u = lista.data[0];
        const tiene_acceso = ["superadmin", "admin", "secretario", "moderador"].includes(rol_limpio);
        await cliente_clerk.users.updateUser(u.id, {
          publicMetadata: {
            rol: rol_limpio,
            acceso_dashboard: tiene_acceso,
          },
        });
      }
    } catch (e_clerk: any) {
      console.warn("Aviso al verificar Clerk en preasignación:", e_clerk.message);
    }

    return NextResponse.json({
      exito: true,
      mensaje: `Rol '${rol_limpio}' pre-asignado a ${correo_limpio}. Cuando inicie sesión, entrará directamente con este rol.`,
      datos: objeto_preasignacion,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al preasignar rol", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const correo = searchParams.get("correo");

    if (!correo) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere el parámetro correo" },
        { status: 400 }
      );
    }

    const correo_limpio = correo.trim().toLowerCase();

    // Eliminar del respaldo local
    const almacen = leer_almacen_local();
    almacen.preasignaciones = (almacen.preasignaciones || []).filter(
      (p: any) => p.correo_electronico.toLowerCase() !== correo_limpio
    );
    guardar_almacen_local(almacen);

    // Eliminar de MongoDB
    try {
      await conectar_base_datos();
      await ModeloPreasignacionUsuario.deleteOne({ correo_electronico: correo_limpio });
    } catch (e_db) {}

    return NextResponse.json({
      exito: true,
      mensaje: "Preasignación eliminada correctamente",
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al eliminar preasignación", detalle: error.message },
      { status: 500 }
    );
  }
}

