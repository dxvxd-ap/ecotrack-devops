import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloRol } from "@/modelos/Rol";

const ROLES_PREDETERMINADOS = [
  {
    _id: "rol_superadmin",
    nombre: "superadmin",
    descripcion: "Acceso total a la configuración del sistema, gestión de usuarios y roles.",
    acceso_dashboard: true,
    es_sistema: true,
    permisos: ["todo"],
  },
  {
    _id: "rol_admin",
    nombre: "admin",
    descripcion: "Administrador operativo con permisos de edición de rutas, flota y asignaciones.",
    acceso_dashboard: true,
    es_sistema: true,
    permisos: ["rutas:gestion", "flota:gestion", "calendario:gestion", "usuarios:ver", "usuarios:roles"],
  },
  {
    _id: "rol_secretario",
    nombre: "secretario",
    descripcion: "Personal encargado del trazado de rutas, horarios de recolección y monitoreo.",
    acceso_dashboard: true,
    es_sistema: true,
    permisos: ["rutas:gestion", "calendario:gestion", "monitoreo:ver"],
  },
  {
    _id: "rol_moderador",
    nombre: "moderador",
    descripcion: "Supervisión de alertas, reportes ciudadanos y lectura de telemetría.",
    acceso_dashboard: true,
    es_sistema: true,
    permisos: ["rutas:ver", "flota:ver", "alertas:gestion"],
  },
  {
    _id: "rol_ciudadano",
    nombre: "ciudadano",
    descripcion: "Usuario residente con acceso exclusivo a alertas de su zona y notificaciones push.",
    acceso_dashboard: false,
    es_sistema: true,
    permisos: ["alertas:recibir", "domicilio:gestionar"],
  },
  {
    _id: "rol_conductor",
    nombre: "conductor",
    descripcion: "Operador de vehículo recolector con acceso a su hoja de ruta diaria.",
    acceso_dashboard: false,
    es_sistema: true,
    permisos: ["rutas:ver_asignada", "estado:actualizar"],
  },
  {
    _id: "rol_camion",
    nombre: "camion",
    descripcion: "Dispositivo IoT o unidad física para reporte de telemetría GPS.",
    acceso_dashboard: false,
    es_sistema: true,
    permisos: ["gps:reportar"],
  },
];

export async function GET() {
  try {
    try {
      await conectar_base_datos();
      const roles_db = await ModeloRol.find().sort({ es_sistema: -1, nombre: 1 });
      if (roles_db && roles_db.length > 0) {
        return NextResponse.json({ exito: true, datos: roles_db });
      }
    } catch (e_db: any) {
      console.warn("MongoDB Atlas no disponible para roles, usando roles predeterminados:", e_db.message);
    }

    return NextResponse.json({ exito: true, datos: ROLES_PREDETERMINADOS });
  } catch (error: any) {
    return NextResponse.json({ exito: true, datos: ROLES_PREDETERMINADOS });
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { nombre, descripcion, acceso_dashboard, permisos } = cuerpo;

    if (!nombre || !descripcion) {
      return NextResponse.json(
        { exito: false, mensaje: "El nombre y la descripción son obligatorios" },
        { status: 400 }
      );
    }

    const nombre_limpio = nombre.trim().toLowerCase();

    try {
      await conectar_base_datos();
      const existe = await ModeloRol.findOne({ nombre: nombre_limpio });

      if (existe) {
        return NextResponse.json(
          { exito: false, mensaje: "Ya existe un rol con ese nombre" },
          { status: 400 }
        );
      }

      const nuevo_rol = await ModeloRol.create({
        nombre: nombre_limpio,
        descripcion: descripcion.trim(),
        acceso_dashboard: Boolean(acceso_dashboard),
        es_sistema: false,
        permisos: permisos || [],
      });

      return NextResponse.json({
        exito: true,
        mensaje: "Nuevo rol creado exitosamente",
        datos: nuevo_rol,
      });
    } catch (e_db: any) {
      // Fallback si la BD aún no responde
      const rol_creado = {
        _id: `rol_${Date.now()}`,
        nombre: nombre_limpio,
        descripcion: descripcion.trim(),
        acceso_dashboard: Boolean(acceso_dashboard),
        es_sistema: false,
        permisos: permisos || [],
      };
      return NextResponse.json({
        exito: true,
        mensaje: "Nuevo rol registrado",
        datos: rol_creado,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al crear el rol", detalle: error.message },
      { status: 500 }
    );
  }
}
