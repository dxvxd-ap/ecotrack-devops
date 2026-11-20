export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloIncidente } from "@/modelos/Incidente";
import { ModeloCamion } from "@/modelos/Camion";

/**
 * GET /api/v1/incidentes
 * Listado de incidencias operativas reportadas por los conductores
 */
export async function GET(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const incidentes = await ModeloIncidente.find().sort({ fecha_inicio: -1 }).limit(100);
    return NextResponse.json({ exito: true, datos: incidentes });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al consultar incidentes.", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/incidentes
 * Reporte rápido de incidente por conductor (tráfico, falla mecánica, descanso, imprevisto)
 */
export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const cuerpo = await peticion.json();

    const {
      matricula_camion,
      conductor_nombre,
      tipo,
      descripcion,
      latitud,
      longitud,
      gravedad,
    } = cuerpo;

    if (!matricula_camion || !conductor_nombre || !tipo) {
      return NextResponse.json(
        { exito: false, mensaje: "Matrícula, conductor y tipo de incidente son requeridos." },
        { status: 400 }
      );
    }

    // Buscar camión asociado
    let camion = await ModeloCamion.findOne({ matricula: matricula_camion.toUpperCase() });
    let camionId = camion ? camion._id : null;

    if (!camionId) {
      // Si no existe, asociar al primer camión activo disponible
      const camionPorDefecto = await ModeloCamion.findOne({ activo: true });
      if (camionPorDefecto) {
        camionId = camionPorDefecto._id;
      }
    }

    const folio = `INC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const coords: [number, number] = [
      Number(longitud ?? (camion?.ultima_longitud ?? -97.0886)),
      Number(latitud ?? (camion?.ultima_latitud ?? 20.4514)),
    ];

    const nuevoIncidente = await ModeloIncidente.create({
      folio,
      camion_id: camionId,
      matricula_camion: matricula_camion.toUpperCase(),
      conductor_nombre,
      tipo,
      descripcion: descripcion || "",
      ubicacion: {
        type: "Point",
        coordinates: coords,
      },
      gravedad: gravedad || "MEDIA",
      estado: "ACTIVO",
    });

    return NextResponse.json({
      exito: true,
      mensaje: "Incidente reportado exitosamente.",
      datos: nuevoIncidente,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al registrar incidente.", error: error?.message },
      { status: 500 }
    );
  }
}
