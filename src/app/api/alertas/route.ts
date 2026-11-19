import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloAlerta, MotivoAlerta, AlcanceAlerta } from "@/modelos/Alerta";
import {
  buscarTokensPorRuta,
  enviarNotificacionesPush,
} from "@/lib/pushNotifications";

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
      filtro.motivo = motivo;
    }

    if (alcance && ["todas_las_rutas", "ruta_especifica"].includes(alcance)) {
      filtro.alcance = alcance;
    }

    if (rutaId) {
      filtro.rutaId = rutaId;
    }

    let consulta: any = ModeloAlerta.find(filtro);

    if (typeof consulta?.populate === "function") {
      consulta = consulta.populate("rutaId", "nombre id_ruta color_mapa");
    }

    const alertas = await consulta.sort({ createdAt: -1 }).limit(limite);

    return NextResponse.json({
      exito: true,
      datos: alertas,
      total: alertas.length,
    });
  } catch (error: any) {
    console.error("[Alertas] Error al consultar alertas:", error);
    return NextResponse.json(
      {
        exito: false,
        mensaje: "Error interno al consultar el historial de alertas.",
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

    // 1. Guardar la alerta en MongoDB
    const nuevaAlerta = await ModeloAlerta.create({
      titulo: titulo.trim(),
      mensaje: mensaje.trim(),
      motivo,
      alcance,
      rutaId: alcance === "ruta_especifica" ? rutaId : null,
      fechaSuspension: fechaSuspension ? new Date(fechaSuspension) : null,
      enviadosCount: 0,
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
    console.error("[Alertas] Error al emitir alerta:", error);
    return NextResponse.json(
      {
        exito: false,
        mensaje: "Error interno al emitir la alerta.",
        detalle: error.message,
      },
      { status: 500 }
    );
  }
}
