import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import {
  ModeloReporte,
  OrigenReporte,
  PrioridadReporte,
  EstadoReporte,
} from "@/modelos/Reporte";

export async function GET(peticion: NextRequest) {
  try {
    await conectar_base_datos();

    const { searchParams } = new URL(peticion.url);
    const origen = searchParams.get("origen") as OrigenReporte | null;
    const estado = searchParams.get("estado") as EstadoReporte | null;
    const prioridad = searchParams.get("prioridad") as PrioridadReporte | null;
    const rutaId = searchParams.get("rutaId");
    const camionId = searchParams.get("camionId");
    const limite = Math.min(200, Math.max(1, Number(searchParams.get("limite")) || 50));

    const filtro: Record<string, any> = {};

    if (origen && ["ciudadano", "conductor"].includes(origen)) {
      filtro.origen = origen;
    }

    if (estado && ["pendiente", "en_proceso", "resuelto"].includes(estado)) {
      filtro.estado = estado;
    }

    if (prioridad && ["baja", "media", "alta", "critica"].includes(prioridad)) {
      filtro.prioridad = prioridad;
    }

    if (rutaId) {
      filtro.rutaId = rutaId;
    }

    if (camionId) {
      filtro.camionId = camionId;
    }

    let consulta: any = ModeloReporte.find(filtro);

    if (typeof consulta?.populate === "function") {
      consulta = consulta
        .populate("rutaId", "nombre id_ruta color_mapa")
        .populate("camionId", "numero_unidad modelo matricula estado");
    }

    const reportes = await consulta.sort({ createdAt: -1 }).limit(limite);

    return NextResponse.json({
      exito: true,
      datos: reportes,
      total: reportes.length,
    });
  } catch (error: any) {
    console.error("[Reportes] Error al consultar reportes:", error);
    return NextResponse.json(
      {
        exito: false,
        mensaje: "Error interno al consultar los reportes.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();

    const cuerpo = await peticion.json();
    const {
      origen,
      tipo,
      titulo,
      descripcion,
      rutaId,
      camionId,
      ubicacion,
      prioridad,
      reportadoPor,
      notasAdmin,
    } = cuerpo;

    // Validaciones requeridas
    if (!origen || !["ciudadano", "conductor"].includes(origen)) {
      return NextResponse.json(
        {
          exito: false,
          mensaje: "El campo 'origen' es obligatorio y debe ser 'ciudadano' o 'conductor'.",
        },
        { status: 400 }
      );
    }

    if (!tipo || typeof tipo !== "string" || !tipo.trim()) {
      return NextResponse.json(
        { exito: false, mensaje: "El campo 'tipo' es obligatorio." },
        { status: 400 }
      );
    }

    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return NextResponse.json(
        { exito: false, mensaje: "El campo 'titulo' es obligatorio." },
        { status: 400 }
      );
    }

    if (!descripcion || typeof descripcion !== "string" || !descripcion.trim()) {
      return NextResponse.json(
        { exito: false, mensaje: "El campo 'descripcion' es obligatorio." },
        { status: 400 }
      );
    }

    if (
      !ubicacion ||
      typeof ubicacion.lat !== "number" ||
      typeof ubicacion.lng !== "number"
    ) {
      return NextResponse.json(
        {
          exito: false,
          mensaje:
            "El objeto 'ubicacion' con 'lat' y 'lng' numéricos es obligatorio.",
        },
        { status: 400 }
      );
    }

    // Lógica inteligente de prioridad por defecto
    let prioridadFinal: PrioridadReporte = "media";
    if (prioridad && ["baja", "media", "alta", "critica"].includes(prioridad)) {
      prioridadFinal = prioridad as PrioridadReporte;
    } else if (origen === "conductor") {
      // Incidentes reportados por conductores: fallas mecánicas o viales son prioritarias
      if (tipo === "falla_mecanica") {
        prioridadFinal = "critica";
      } else if (tipo === "incidente_vial" || tipo === "calle_bloqueada") {
        prioridadFinal = "alta";
      } else {
        prioridadFinal = "media";
      }
    }

    const nuevoReporte = await ModeloReporte.create({
      origen,
      tipo: tipo.trim(),
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      rutaId: rutaId || null,
      camionId: camionId || null,
      ubicacion: {
        lat: Number(ubicacion.lat),
        lng: Number(ubicacion.lng),
        direccion: ubicacion.direccion?.trim() || "",
      },
      prioridad: prioridadFinal,
      estado: "pendiente",
      reportadoPor: {
        nombre: reportadoPor?.nombre?.trim() || "",
        contacto: reportadoPor?.contacto?.trim() || "",
        usuarioId: reportadoPor?.usuarioId?.trim() || "",
      },
      notasAdmin: notasAdmin?.trim() || "",
    });

    return NextResponse.json(
      {
        exito: true,
        mensaje: "Reporte registrado exitosamente",
        datos: nuevoReporte,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Reportes] Error al crear reporte:", error);
    return NextResponse.json(
      {
        exito: false,
        mensaje: "Error interno al crear el reporte.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }
}
