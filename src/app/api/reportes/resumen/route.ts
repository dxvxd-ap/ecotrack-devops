import { NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReclamo } from "@/modelos/Reclamo";
import { ModeloReporte } from "@/modelos/Reporte";
import { autorizar_administracion } from "@/lib/autorizacion";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/reportes/resumen
 * Métricas consolidadas en tiempo real de Reclamos Ciudadanos y Reportes de Conductores
 */
export async function GET() {
  try {
    await autorizar_administracion("rutas:gestionar");
    await conectar_base_datos();

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const [
      reclamosPendientes,
      reclamosEnRevision,
      reclamosAtendidos,
      reclamosHoy,
      totalReclamos,
      conductoresPendientes,
      conductoresEnProceso,
      conductoresResueltos,
      conductoresCriticos,
      conductoresHoy,
      totalConductores,
    ] = await Promise.all([
      ModeloReclamo.countDocuments({ estado: "PENDIENTE" }),
      ModeloReclamo.countDocuments({ estado: "EN_REVISION" }),
      ModeloReclamo.countDocuments({ estado: "ATENDIDO" }),
      ModeloReclamo.countDocuments({ fecha_reporte: { $gte: inicioHoy } }),
      ModeloReclamo.countDocuments({}),

      ModeloReporte.countDocuments({ origen: "conductor", estado: "pendiente" }),
      ModeloReporte.countDocuments({ origen: "conductor", estado: "en_proceso" }),
      ModeloReporte.countDocuments({ origen: "conductor", estado: "resuelto" }),
      ModeloReporte.countDocuments({
        origen: "conductor",
        prioridad: { $in: ["alta", "critica"] },
        estado: { $ne: "resuelto" },
      }),
      ModeloReporte.countDocuments({ origen: "conductor", createdAt: { $gte: inicioHoy } }),
      ModeloReporte.countDocuments({ origen: "conductor" }),
    ]);

    return NextResponse.json({
      exito: true,
      datos: {
        ciudadanos: {
          pendientes: reclamosPendientes,
          en_proceso: reclamosEnRevision,
          resueltos: reclamosAtendidos,
          hoy: reclamosHoy,
          total: totalReclamos,
        },
        conductores: {
          pendientes: conductoresPendientes,
          en_proceso: conductoresEnProceso,
          resueltos: conductoresResueltos,
          criticos: conductoresCriticos,
          hoy: conductoresHoy,
          total: totalConductores,
        },
        global: {
          pendientesTotal: reclamosPendientes + reclamosEnRevision + conductoresPendientes + conductoresEnProceso,
          criticosOperativos: conductoresCriticos,
          actividadHoy: reclamosHoy + conductoresHoy,
          totalHistorico: totalReclamos + totalConductores,
        },
      },
    });
  } catch (error: unknown) {
    return manejarErrorApi(error, "reportes:resumen");
  }
}
