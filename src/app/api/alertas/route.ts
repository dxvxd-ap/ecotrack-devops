import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloAlerta, MotivoAlerta, AlcanceAlerta } from "@/modelos/Alerta";
import {
  buscarTokensPorRuta,
  enviarNotificacionesPush,
} from "@/lib/pushNotifications";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(peticion: NextRequest) {
  try {
    await conectar_base_datos();

    const { searchParams } = new URL(peticion.url);
    const motivo = searchParams.get("motivo") as MotivoAlerta | null;
    const alcance = searchParams.get("alcance") as AlcanceAlerta | null;
    const rutaId = searchParams.get("rutaId");
    const limite = Math.min(200, Math.max(1, Number(searchParams.get("limite")) || 50));

    const filtro: Record<string, any> = {};

    if (
      motivo &&
      ["dia_festivo", "suspension_ruta", "falla_camion", "retraso", "aviso_general"].includes(
        motivo
      )
    ) {
      filtro.$or = [{ motivo }, { tipo: motivo }];
    }

    if (alcance && ["todas_las_rutas", "ruta_especifica"].includes(alcance)) {
      if (alcance === "todas_las_rutas") {
        filtro.$or = [{ alcance: "todas_las_rutas" }, { global: true }, { es_global: true }];
      } else {
        filtro.$or = [{ alcance: "ruta_especifica" }, { global: false }, { es_global: false }];
      }
    }

    if (rutaId) {
      filtro.$or = [{ rutaId }, { ruta_id: rutaId }];
    }

    const alertasRaw = await ModeloAlerta.find(filtro)
      .sort({ fecha_creacion: -1, createdAt: -1, _id: -1 })
      .limit(limite)
      .lean();

    // Normalizar alertas para compatibilidad bidireccional entre Dashboard y App Ciudadana
    const alertas = alertasRaw.map((a: any) => ({
      ...a,
      _id: String(a._id),
      titulo: a.titulo || a.title || "Alerta Municipal",
      mensaje: a.mensaje || a.message || a.descripcion || "",
      motivo: a.motivo || a.tipo || "aviso_general",
      tipo: a.tipo || a.motivo || "aviso_general",
      alcance: a.alcance || (a.global || a.es_global ? "todas_las_rutas" : "ruta_especifica"),
      global: a.global ?? a.es_global ?? (a.alcance === "todas_las_rutas"),
      es_global: a.es_global ?? a.global ?? (a.alcance === "todas_las_rutas"),
      rutaId: a.rutaId || a.ruta_id || null,
      ruta_id: a.ruta_id || a.rutaId || null,
      fechaSuspension: a.fechaSuspension || null,
      enviadosCount: a.enviadosCount ?? a.enviados_count ?? 0,
      activo: a.activo ?? a.activa ?? true,
      activa: a.activa ?? a.activo ?? true,
      estado: a.estado || (a.activo === false || a.activa === false ? "inactiva" : "activa"),
      createdAt: a.createdAt || a.fecha_creacion || new Date().toISOString(),
      updatedAt: a.updatedAt || a.fecha_actualizacion || new Date().toISOString(),
      fecha_creacion: a.fecha_creacion || a.createdAt || new Date().toISOString(),
    }));

    return NextResponse.json({
      exito: true,
      datos: alertas,
      total: alertas.length,
    });
  } catch (error: any) {
    return manejarErrorApi(error, "alertas:consultar");
  }
}

export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();

    const cuerpo = await peticion.json();
    const { titulo, mensaje, motivo, alcance, rutaId, fechaSuspension } = cuerpo;

    if (!titulo || typeof titulo !== "string" || !titulo.trim()) {
      return NextResponse.json(
        { exito: false, mensaje: "El título de la alerta es obligatorio." },
        { status: 400 }
      );
    }

    if (!mensaje || typeof mensaje !== "string" || !mensaje.trim()) {
      return NextResponse.json(
        { exito: false, mensaje: "El mensaje de la alerta es obligatorio." },
        { status: 400 }
      );
    }

    if (
      !motivo ||
      !["dia_festivo", "suspension_ruta", "falla_camion", "retraso", "aviso_general"].includes(
        motivo
      )
    ) {
      return NextResponse.json(
        {
          exito: false,
          mensaje:
            "El motivo de alerta es obligatorio y debe ser: dia_festivo, suspension_ruta, falla_camion, retraso o aviso_general.",
        },
        { status: 400 }
      );
    }

    if (!alcance || !["todas_las_rutas", "ruta_especifica"].includes(alcance)) {
      return NextResponse.json(
        {
          exito: false,
          mensaje:
            "El alcance de alerta es obligatorio y debe ser 'todas_las_rutas' o 'ruta_especifica'.",
        },
        { status: 400 }
      );
    }

    if (alcance === "ruta_especifica" && !rutaId) {
      return NextResponse.json(
        {
          exito: false,
          mensaje: "Para alertas con alcance 'ruta_especifica' debes especificar 'rutaId'.",
        },
        { status: 400 }
      );
    }

    const esGlobal = alcance === "todas_las_rutas";
    const rutaIdFinal = esGlobal ? null : rutaId;

    // 1. Guardar la alerta en MongoDB en la colección 'alertaciudadano' con compatibilidad total
    const nuevaAlerta = await ModeloAlerta.create({
      titulo: titulo.trim(),
      mensaje: mensaje.trim(),
      motivo,
      tipo: motivo,
      alcance,
      global: esGlobal,
      es_global: esGlobal,
      rutaId: rutaIdFinal,
      ruta_id: rutaIdFinal,
      fechaSuspension: fechaSuspension ? new Date(fechaSuspension) : null,
      enviadosCount: 0,
      activo: true,
      activa: true,
      estado: "activa",
      fecha_creacion: new Date(),
      fecha_actualizacion: new Date(),
    });

    // 2. Buscar tokens push destinatarios según el alcance
    const tokensDestinatarios = await buscarTokensPorRuta(
      alcance === "ruta_especifica" ? String(rutaId) : undefined
    );

    // 3. Enviar notificaciones push a los celulares
    let enviadosReales = 0;
    if (tokensDestinatarios.length > 0) {
      const resultadoPush = await enviarNotificacionesPush({
        tokens: tokensDestinatarios,
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
        datos: {
          alertaId: nuevaAlerta._id.toString(),
          motivo,
          alcance,
          rutaId: rutaId ? String(rutaId) : null,
        },
      });
      enviadosReales = resultadoPush.enviados;

      // Actualizar conteo de notificaciones emitidas
      nuevaAlerta.enviadosCount = enviadosReales;
      await nuevaAlerta.save();
    }

    return NextResponse.json(
      {
        exito: true,
        mensaje:
          tokensDestinatarios.length > 0
            ? `Alerta guardada y enviada a ${enviadosReales} dispositivo(s).`
            : "Alerta guardada. No hay dispositivos con tokens activos para este alcance.",
        datos: nuevaAlerta,
        enviadosCount: enviadosReales,
        totalTokensObjetivo: tokensDestinatarios.length,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return manejarErrorApi(error, "alertas:emitir");
  }
}
