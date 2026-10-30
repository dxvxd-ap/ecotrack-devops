import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloCamion } from "@/modelos/Camion";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";

export async function GET() {
  try {
    try {
      await conectar_base_datos();
      const camiones_db = await ModeloCamion.find({ activo: true })
        .populate("conductor_asignado_id")
        .sort({ numero_unidad: 1 });
      if (camiones_db && camiones_db.length > 0) {
        return NextResponse.json({ exito: true, datos: camiones_db });
      }
    } catch (e_db: any) {
      console.warn("MongoDB Atlas no disponible para camiones, usando respaldo local:", e_db.message);
    }

    const almacen = leer_almacen_local();
    return NextResponse.json({ exito: true, datos: almacen.camiones || [] });
  } catch (error: any) {
    const almacen = leer_almacen_local();
    return NextResponse.json({ exito: true, datos: almacen.camiones || [] });
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { matricula, numero_unidad, modelo, capacidad_toneladas, conductor_asignado_id } = cuerpo;

    if (!matricula || !numero_unidad || !modelo) {
      return NextResponse.json(
        { exito: false, mensaje: "Matrícula, número de unidad y modelo son obligatorios" },
        { status: 400 }
      );
    }

    const nuevo_camion = {
      _id: `camion_${Date.now()}`,
      matricula: matricula.trim().toUpperCase(),
      numero_unidad: numero_unidad.trim(),
      modelo: modelo.trim(),
      capacidad_toneladas: Number(capacidad_toneladas) || 5,
      conductor_asignado_id: conductor_asignado_id || null,
      estado: "disponible",
      activo: true,
      ultima_latitud: 20.4514,
      ultima_longitud: -97.0886,
      ultima_velocidad_kmh: 0,
    };

    const almacen = leer_almacen_local();
    almacen.camiones = [nuevo_camion, ...(almacen.camiones || [])];
    guardar_almacen_local(almacen);

    try {
      await conectar_base_datos();
      await ModeloCamion.create(nuevo_camion);
    } catch (e_db) {}

    return NextResponse.json({
      exito: true,
      mensaje: "Camión registrado exitosamente",
      datos: nuevo_camion,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al registrar camión", detalle: error.message },
      { status: 500 }
    );
  }
}
