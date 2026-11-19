import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReporte, EstadoReporte, PrioridadReporte } from "@/modelos/Reporte";

export async function PATCH(
  peticion: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await conectar_base_datos();

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { exito: false, mensaje: "ID de reporte no proporcionado." },
        { status: 400 }
      );
    }

    const cuerpo = await peticion.json();
    const { estado, notasAdmin, prioridad } = cuerpo;

    const actualizaciones: Record<string, any> = {};

    if (estado !== undefined) {
      if (!["pendiente", "en_proceso", "resuelto"].includes(estado)) {
        return NextResponse.json(
          {
            exito: false,
            mensaje: "Estado inválido. Debe ser 'pendiente', 'en_proceso' o 'resuelto'.",
          },
          { status: 400 }
        );
      }
      actualizaciones.estado = estado as EstadoReporte;
    }

    if (notasAdmin !== undefined) {
      actualizaciones.notasAdmin = typeof notasAdmin === "string" ? notasAdmin.trim() : "";
    }

    if (prioridad !== undefined) {
      if (!["baja", "media", "alta", "critica"].includes(prioridad)) {
        return NextResponse.json(
          {
            exito: false,
            mensaje: "Prioridad inválida. Debe ser 'baja', 'media', 'alta' o 'critica'.",
          },
          { status: 400 }
        );
      }
      actualizaciones.prioridad = prioridad as PrioridadReporte;
    }

    if (Object.keys(actualizaciones).length === 0) {
      return NextResponse.json(
        { exito: false, mensaje: "No se proporcionaron campos para actualizar." },
        { status: 400 }
      );
    }

    const reporteActualizado = await ModeloReporte.findByIdAndUpdate(
      id,
      { $set: actualizaciones },
      { new: true, runValidators: true }
    )
      .populate("rutaId", "nombre id_ruta color_mapa")
      .populate("camionId", "numero_unidad modelo matricula estado");

    if (!reporteActualizado) {
      return NextResponse.json(
        { exito: false, mensaje: "No se encontró el reporte especificado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Reporte actualizado exitosamente.",
      datos: reporteActualizado,
    });
  } catch (error: any) {
    console.error("[Reportes] Error al actualizar reporte:", error);
    return NextResponse.json(
      {
        exito: false,
        mensaje: "Error interno al actualizar el reporte.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }
}
