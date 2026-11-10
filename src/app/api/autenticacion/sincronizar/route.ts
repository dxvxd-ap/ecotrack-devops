import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { createClerkClient } from "@clerk/backend";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloUsuario } from "@/modelos/Usuario";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";
import { sembrar_datos_iniciales_si_esta_vacio } from "@/lib/inicializar_datos";

const cliente_clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});

const CORREOS_SUPERADMIN = [
  "22610282@utgz.edu.mx",
  process.env.ADMIN_CORREO,
].filter(Boolean);

export async function POST() {
  try {
    try {
      await conectar_base_datos();
      await sembrar_datos_iniciales_si_esta_vacio();
    } catch (error_bd: any) {
      console.warn("Aviso de conexión a base de datos en sincronización:", error_bd.message);
    }

    const usuario_clerk = await currentUser();

    if (!usuario_clerk) {
      return NextResponse.json(
        { exito: false, mensaje: "No hay sesión activa de usuario" },
        { status: 401 }
      );
    }

    const correo_principal =
      usuario_clerk.emailAddresses[0]?.emailAddress?.toLowerCase() || "sin_correo@ecoruta.local";
    const nombre =
      [usuario_clerk.firstName, usuario_clerk.lastName].filter(Boolean).join(" ") ||
      usuario_clerk.username ||
      "Usuario EcoRuta";

    // 1. Verificar si es el superadministrador fundador
    const es_admin_fundador =
      CORREOS_SUPERADMIN.includes(correo_principal) ||
      usuario_clerk.id === "user_3JzRT8FQJPrqKEfk2QdjZpFaRVN";

    // 2. Verificar si el correo tenía una preasignación previa de rol en el dashboard
    let rol_preasignado: string | null = null;
    const almacen = leer_almacen_local();
    const pre_local = (almacen.preasignaciones || []).find(
      (p: any) => p.correo_electronico.toLowerCase() === correo_principal
    );
    if (pre_local) {
      rol_preasignado = pre_local.rol_asignado;
      pre_local.completado = true;
      guardar_almacen_local(almacen);
    }

    try {
      await conectar_base_datos();
      const pre_db = await ModeloPreasignacionUsuario.findOne({
        correo_electronico: correo_principal,
      });
      if (pre_db) {
        rol_preasignado = pre_db.rol_asignado;
        pre_db.completado = true;
        pre_db.fecha_registro_completado = new Date();
        await pre_db.save();
      }
    } catch (e) {}

    // Determinación del rol final respetando el rol que el usuario ya tenga asignado
    const metadatos_actuales = (usuario_clerk.publicMetadata as Record<string, any>) || {};
    const rol_existente = metadatos_actuales.rol;

    let rol_asignado = "ciudadano";
    if (es_admin_fundador) {
      rol_asignado = "superadmin";
    } else if (rol_existente && rol_existente !== "ciudadano") {
      // Si el usuario ya tiene un rol administrativo o personalizado asignado en Clerk, ¡NO sobrescribirlo!
      rol_asignado = rol_existente;
    } else if (rol_preasignado) {
      rol_asignado = rol_preasignado;
    } else if (rol_existente) {
      rol_asignado = rol_existente;
    }

    const tiene_acceso_dashboard = ["superadmin", "admin", "secretario", "moderador"].includes(rol_asignado);

    // Solo actualizar metadatos en Clerk si cambiaron para no hacer peticiones innecesarias
    if (metadatos_actuales.rol !== rol_asignado || metadatos_actuales.acceso_dashboard !== tiene_acceso_dashboard) {
      try {
        await cliente_clerk.users.updateUser(usuario_clerk.id, {
          publicMetadata: {
            ...metadatos_actuales,
            rol: rol_asignado,
            acceso_dashboard: tiene_acceso_dashboard,
          },
        });
      } catch (e_clerk: any) {
        console.warn("Aviso al sincronizar metadatos con Clerk:", e_clerk.message);
      }
    }

    // Guardar o actualizar en base de datos
    try {
      await conectar_base_datos();
      await ModeloUsuario.findOneAndUpdate(
        { id_clerk: usuario_clerk.id },
        {
          nombre_completo: nombre,
          correo_electronico: correo_principal,
          rol: rol_asignado,
          activo: true,
          fecha_actualizacion: new Date(),
        },
        { upsert: true, new: true }
      );
    } catch (e) {}

    return NextResponse.json({
      exito: true,
      mensaje: "Usuario sincronizado correctamente",
      datos: {
        id_clerk: usuario_clerk.id,
        nombre,
        correo: correo_principal,
        rol: rol_asignado,
        tiene_acceso_dashboard,
      },
    });
  } catch (error: any) {
    console.error("Error al sincronizar usuario:", error);
    return NextResponse.json(
      { exito: false, mensaje: "Error interno del servidor", detalle: error.message },
      { status: 500 }
    );
  }
}
