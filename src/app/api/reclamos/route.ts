import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReclamo } from "@/modelos/Reclamo";
import { autorizar_administracion } from "@/lib/autorizacion";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Sanitiza URLs de fotografías para evitar enlaces o recursos locales inseguros (file:///)
 * Solo permite protocolos web estándar (https, http) o data URIs de imagen.
 */
function sanitizarUrlFotografia(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (/^file:\/\//i.test(trimmed) || /^file:/i.test(trimmed)) {
    return "";
  }
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return "";
}

/**
 * GET /api/reclamos
 * Endpoint administrativo para listar y filtrar reclamos ciudadanos
 */
export async function GET(peticion: NextRequest) {
  try {
    const { usuario } = await autorizar_administracion("reclamos:ver");
    await conectar_base_datos();

    const { searchParams } = new URL(peticion.url);
    const estado = searchParams.get("estado");
    const rutaId = searchParams.get("rutaId") || searchParams.get("ruta_id");
    const tipo = searchParams.get("tipo");
    const busqueda = searchParams.get("busqueda");
    const limite = Math.min(200, Math.max(1, Number(searchParams.get("limite")) || 50));
    const soloPropios = searchParams.get("solo_propios") === "true";

    const filtro: Record<string, any> = {};

    // Filtro opcional aplicado después de la autorización municipal.
    if (soloPropios) {
      filtro.ciudadano_id_clerk = usuario.id;
    }

    if (estado && estado !== "todos") {
      const estadoNorm = estado.toUpperCase();
      if (["PENDIENTE", "EN_REVISION", "ATENDIDO", "RECHAZADO"].includes(estadoNorm)) {
        filtro.estado = estadoNorm;
      } else if (estado === "en_proceso") {
        filtro.estado = "EN_REVISION";
      } else if (estado === "resuelto") {
        filtro.estado = "ATENDIDO";
      } else if (estado === "pendiente") {
        filtro.estado = "PENDIENTE";
      }
    }

    if (rutaId && rutaId !== "todas") {
      filtro.ruta_id = rutaId;
    }

    if (tipo && tipo !== "todos") {
      filtro.tipo_incidencia = tipo.toUpperCase();
    }

    if (busqueda && busqueda.trim()) {
      const regex = new RegExp(busqueda.trim(), "i");
      filtro.$or = [
        { folio: regex },
        { ciudadano_nombre: regex },
        { descripcion: regex },
        { domicilio_referencia: regex },
      ];
    }

    // Consulta directa y blindada sin populate estricto para evitar fallos si camion_asignado_id o ruta_id son nulos/inválidos
    const reclamosRaw = await ModeloReclamo.find(filtro)
      .sort({ fecha_creacion: -1, fecha_reporte: -1, _id: -1 })
      .limit(limite)
      .lean();

    // Normalizar para que la UI del dashboard tenga coordenadas amigables {lat, lng} y campos unificados
    const reclamos = reclamosRaw.map((r: any) => {
      const coords = r.ubicacion?.coordinates || [-97.0886, 20.4514];
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);

      return {
        _id: String(r._id),
        folio: r.folio || `REC-${String(r._id).slice(-6)}`,
        origen: "ciudadano" as const,
        ciudadano_id_clerk: r.ciudadano_id_clerk,
        ciudadano_nombre: r.ciudadano_nombre || "Ciudadano",
        ciudadano_telefono: r.ciudadano_telefono || "",
        ciudadano_email: r.ciudadano_email || "",
        domicilio_referencia: r.domicilio_referencia || "",
        tipo: r.tipo_incidencia || "CAMION_NO_PASO",
        titulo: `Reclamo: ${r.tipo_incidencia || "Incidencia ciudadana"}`,
        descripcion: r.descripcion || "",
        fotografia_url: sanitizarUrlFotografia(r.fotografia_url),
        ruta_id: r.ruta_id || null,
        camion_asignado_id: r.camion_asignado_id ? String(r.camion_asignado_id) : null,
        ubicacion: {
          lat: Number.isFinite(lat) ? lat : 20.4514,
          lng: Number.isFinite(lng) ? lng : -97.0886,
          direccion: r.domicilio_referencia || "",
        },
        estado: r.estado || "PENDIENTE",
        solucion_notas: r.solucion_notas || "",
        notasAdmin: r.solucion_notas || "",
        fecha_reporte: r.fecha_reporte || r.fecha_creacion || new Date().toISOString(),
        fecha_resolucion: r.fecha_resolucion || null,
        createdAt: r.fecha_creacion || r.fecha_reporte || new Date().toISOString(),
        updatedAt: r.fecha_actualizacion || new Date().toISOString(),
      };
    });

    return NextResponse.json({
      exito: true,
      datos: reclamos,
      total: reclamos.length,
    });
  } catch (error: unknown) {
    return manejarErrorApi(error, "reclamos:consultar");
  }
}
