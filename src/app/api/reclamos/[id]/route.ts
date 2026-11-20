import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReclamo } from "@/modelos/Reclamo";
import { autorizar_administracion } from "@/lib/autorizacion";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * PATCH /api/reclamos/[id]
 * Permite al administrador actualizar el estado y notas de resolución de un reclamo ciudadano
 */
export async function PATCH(
  peticion: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await autorizar_administracion("reclamos:gestionar");
    await conectar_base_datos();

    const { id } = await params;
    if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
      return NextResponse.json(
        { exito: false, mensaje: "Identificador de reclamo inválido." },
        { status: 400 }
      );
    }

    const cuerpo = await peticion.json();
    const { estado, notasAdmin, solucion_notas } = cuerpo;

    const actualizaciones: Record<string, any> = {};

    if (estado !== undefined) {
      const estadoStr = String(estado).toUpperCase();
      let estadoFinal: string;

      if (["PENDIENTE", "EN_REVISION", "ATENDIDO", "RECHAZADO"].includes(estadoStr)) {
        estadoFinal = estadoStr;
      } else if (estado === "en_proceso") {
        estadoFinal = "EN_REVISION";
      } else if (estado === "resuelto") {
        estadoFinal = "ATENDIDO";
      } else if (estado === "pendiente") {
        estadoFinal = "PENDIENTE";
      } else {
        return NextResponse.json(
          { exito: false, mensaje: "Estado de reclamo no válido." },
          { status: 400 }
        );
      }

      actualizaciones.estado = estadoFinal;

      if (estadoFinal === "ATENDIDO" || estadoFinal === "RECHAZADO") {
        actualizaciones.fecha_resolucion = new Date();
      } else {
        actualizaciones.fecha_resolucion = null;
      }
    }

    const notas = solucion_notas !== undefined ? solucion_notas : notasAdmin;
    if (notas !== undefined) {
      actualizaciones.solucion_notas = typeof notas === "string" ? notas.trim() : "";
    }

    if (Object.keys(actualizaciones).length === 0) {
      return NextResponse.json(
        { exito: false, mensaje: "No se proporcionaron campos para actualizar." },
        { status: 400 }
      );
    }

    // Un histórico atendido por R1 también queda protegido, aunque no tenga contrato de creación.
    const reclamoActualizado = await ModeloReclamo.findOneAndUpdate(
      {
        _id: id,
        contrato_creacion: { $exists: false },
        version_atencion: { $exists: false },
        historial_atencion: { $exists: false },
        operacion: { $exists: false },
        respuesta_publica: { $exists: false },
      },
      { $set: actualizaciones },
      { new: true, runValidators: true }
    );

    if (!reclamoActualizado) {
      if (await ModeloReclamo.exists({ _id: id })) {
        return NextResponse.json(
          { exito: false, codigo: "RECLAMO_REQUIERE_R1", mensaje: "Gestiona este reclamo mediante las atenciones R1." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { exito: false, mensaje: "No se encontró el reclamo especificado." },
        { status: 404 }
      );
    }

    const nota = reclamoActualizado.solucion_notas ?? "";
    return NextResponse.json({
      exito: true,
      mensaje: "Reclamo ciudadano actualizado exitosamente.",
      datos: {
        _id: String(reclamoActualizado._id),
        estado: reclamoActualizado.estado,
        fecha_resolucion: reclamoActualizado.fecha_resolucion ?? null,
        solucion_notas: nota,
        notasAdmin: nota,
      },
    });
  } catch (error: unknown) {
    return manejarErrorApi(error, "reclamos:actualizar");
  }
}
