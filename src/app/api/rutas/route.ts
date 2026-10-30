import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloRuta } from "@/modelos/Ruta";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";

export async function GET() {
  try {
    try {
      await conectar_base_datos();
      const rutas_db = await ModeloRuta.find({ activa: true }).sort({ fecha_creacion: -1 });
      if (rutas_db && rutas_db.length > 0) {
        return NextResponse.json({ exito: true, datos: rutas_db });
      }
    } catch (e_db: any) {
      console.warn("MongoDB Atlas no disponible para rutas, usando respaldo local:", e_db.message);
    }

    // Respaldo local
    const datos = leer_almacen_local();
    const rutas_activas = (datos.rutas || []).filter((r: any) => r.activa !== false);
    return NextResponse.json({ exito: true, datos: rutas_activas });
  } catch (error: any) {
    const datos = leer_almacen_local();
    return NextResponse.json({ exito: true, datos: datos.rutas || [] });
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();

    const {
      id_ruta,
      nombre,
      descripcion,
      trazado_geojson,
      color_mapa,
      distancia_estimada_km,
      duracion_estimada_min,
    } = cuerpo;

    if (!id_ruta || !nombre || !trazado_geojson) {
      return NextResponse.json(
        { exito: false, mensaje: "Faltan campos obligatorios (id_ruta, nombre, trazado_geojson)" },
        { status: 400 }
      );
    }

    const objeto_ruta = {
      _id: `ruta_${Date.now()}`,
      id_ruta: id_ruta.trim().toUpperCase(),
      nombre: nombre.trim(),
      descripcion: descripcion || "",
      trazado_geojson,
      color_mapa: color_mapa || "#2f63ff",
      distancia_estimada_km: distancia_estimada_km || 0,
      duracion_estimada_min: duracion_estimada_min || 0,
      activa: true,
      fecha_creacion: new Date().toISOString(),
    };

    // 1. Guardar en respaldo local garantizado
    const almacen = leer_almacen_local();
    almacen.rutas = [objeto_ruta, ...(almacen.rutas || [])];
    guardar_almacen_local(almacen);

    // 2. Intentar guardar en MongoDB Atlas si está accesible
    try {
      await conectar_base_datos();
      await ModeloRuta.create(objeto_ruta);
    } catch (e_db: any) {
      console.warn("Ruta guardada localmente (MongoDB Atlas pendiente de conexión):", e_db.message);
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Ruta registrada exitosamente",
      datos: objeto_ruta,
    });
  } catch (error: any) {
    console.error("Error al guardar ruta:", error);
    return NextResponse.json(
      { exito: false, mensaje: "Error al guardar la ruta", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere el parámetro ID" },
        { status: 400 }
      );
    }

    // 1. Eliminar en respaldo local
    const almacen = leer_almacen_local();
    almacen.rutas = (almacen.rutas || []).filter((r: any) => r._id !== id && r.id_ruta !== id);
    guardar_almacen_local(almacen);

    // 2. Intentar eliminar en MongoDB Atlas
    try {
      await conectar_base_datos();
      await ModeloRuta.findByIdAndUpdate(id, { activa: false });
    } catch (e_db) {}

    return NextResponse.json({
      exito: true,
      mensaje: "Ruta eliminada con éxito",
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al eliminar la ruta", detalle: error.message },
      { status: 500 }
    );
  }
}
