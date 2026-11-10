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

export async function PUT(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const {
      _id,
      id_ruta,
      nombre,
      descripcion,
      trazado_geojson,
      color_mapa,
      distancia_estimada_km,
      duracion_estimada_min,
      activa,
    } = cuerpo;

    if (!_id && !id_ruta) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere _id o id_ruta para actualizar" },
        { status: 400 }
      );
    }

    // 1. Actualizar en respaldo local
    const almacen = leer_almacen_local();
    const indice = (almacen.rutas || []).findIndex(
      (r: any) => (_id && r._id === _id) || (id_ruta && r.id_ruta === id_ruta)
    );

    let ruta_actualizada: any = null;
    if (indice >= 0) {
      almacen.rutas[indice] = {
        ...almacen.rutas[indice],
        ...(nombre ? { nombre: nombre.trim() } : {}),
        ...(descripcion !== undefined ? { descripcion: descripcion.trim() } : {}),
        ...(trazado_geojson ? { trazado_geojson } : {}),
        ...(color_mapa ? { color_mapa } : {}),
        ...(distancia_estimada_km !== undefined ? { distancia_estimada_km } : {}),
        ...(duracion_estimada_min !== undefined ? { duracion_estimada_min } : {}),
        ...(activa !== undefined ? { activa } : {}),
        fecha_actualizacion: new Date().toISOString(),
      };
      ruta_actualizada = almacen.rutas[indice];
      guardar_almacen_local(almacen);
    }

    // 2. Intentar actualizar en MongoDB Atlas
    try {
      await conectar_base_datos();
      const obj_set: any = { fecha_actualizacion: new Date() };
      if (nombre) obj_set.nombre = nombre.trim();
      if (descripcion !== undefined) obj_set.descripcion = descripcion.trim();
      if (trazado_geojson) obj_set.trazado_geojson = trazado_geojson;
      if (color_mapa) obj_set.color_mapa = color_mapa;
      if (distancia_estimada_km !== undefined) obj_set.distancia_estimada_km = distancia_estimada_km;
      if (duracion_estimada_min !== undefined) obj_set.duracion_estimada_min = duracion_estimada_min;
      if (activa !== undefined) obj_set.activa = activa;

      const filtro: any = {};
      if (_id && _id.length === 24) filtro._id = _id;
      else if (id_ruta) filtro.id_ruta = id_ruta;
      else filtro._id = _id;

      const res_db = await ModeloRuta.findOneAndUpdate(filtro, { $set: obj_set }, { new: true });
      if (res_db) ruta_actualizada = res_db;
    } catch (e_db: any) {
      console.warn("MongoDB no actualizado en PUT /api/rutas:", e_db.message);
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Ruta actualizada exitosamente",
      datos: ruta_actualizada,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al actualizar la ruta", detalle: error.message },
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
