import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloSuscripcionPush } from "@/modelos/SuscripcionPush";

export interface ParametrosEnvioPush {
  tokens: string[];
  titulo: string;
  mensaje: string;
  datos?: Record<string, any>;
  canalId?: string;
}

export interface ResultadoEnvioPush {
  exito: boolean;
  enviados: number;
  fallidos: number;
  errores: string[];
  detallesExpo?: any[];
}

/**
 * Determina si una cadena tiene el formato estándar de Expo Push Token
 */
export function esTokenExpo(token: string): boolean {
  if (typeof token !== "string") return false;
  const t = token.trim();
  return (
    (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")) &&
    t.endsWith("]")
  );
}

/**
 * Envía notificaciones push a través de la API oficial de Expo Push.
 * Diseñado para manejar lotes de hasta 100 mensajes por petición según los lineamientos de Expo.
 */
export async function enviarNotificacionesPush(
  params: ParametrosEnvioPush
): Promise<ResultadoEnvioPush> {
  const { tokens, titulo, mensaje, datos = {} } = params;

  if (!tokens || tokens.length === 0) {
    return {
      exito: true,
      enviados: 0,
      fallidos: 0,
      errores: [],
    };
  }

  // Filtrar tokens duplicados y no vacíos
  const tokensUnicos = Array.from(new Set(tokens.map((t) => t.trim()))).filter(Boolean);

  if (tokensUnicos.length === 0) {
    return { exito: true, enviados: 0, fallidos: 0, errores: [] };
  }

  // Construir mensajes para tokens de Expo
  const mensajesExpo = tokensUnicos.map((token) => ({
    to: token,
    sound: "default",
    title: titulo,
    body: mensaje,
    data: datos,
    priority: "high" as const,
    channelId: "alertas-ciudadano",
  }));

  const CHUNK_SIZE = 100;
  let totalEnviados = 0;
  let totalFallidos = 0;
  const errores: string[] = [];
  const detallesExpo: any[] = [];

  for (let i = 0; i < mensajesExpo.length; i += CHUNK_SIZE) {
    const lote = mensajesExpo.slice(i, i + CHUNK_SIZE);
    try {
      const respuesta = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(lote),
      });

      if (!respuesta.ok) {
        const cuerpoError = await respuesta.text().catch(() => "");
        console.warn(
          `[Push] Error HTTP ${respuesta.status} desde servicio Expo: ${cuerpoError}`
        );
        totalFallidos += lote.length;
        errores.push(`HTTP ${respuesta.status}: ${cuerpoError}`);
        continue;
      }

      const resultado = await respuesta.json();
      if (resultado && Array.isArray(resultado.data)) {
        resultado.data.forEach((ticket: any) => {
          detallesExpo.push(ticket);
          if (ticket.status === "ok") {
            totalEnviados++;
          } else {
            totalFallidos++;
            if (ticket.message) errores.push(ticket.message);
          }
        });
      } else {
        totalEnviados += lote.length;
      }
    } catch (error: any) {
      console.warn("[Push] Error de conexión al enviar notificaciones:", error.message);
      totalFallidos += lote.length;
      errores.push(error.message || "Fallo de conexión al servicio push");
    }
  }

  return {
    exito: totalEnviados > 0 || totalFallidos === 0,
    enviados: totalEnviados,
    fallidos: totalFallidos,
    errores,
    detallesExpo,
  };
}

/**
 * Consulta en la base de datos los tokens activos de celulares
 * que deben recibir la alerta según el alcance (general o ruta específica).
 */
export async function buscarTokensPorRuta(
  rutaId?: string | null
): Promise<string[]> {
  try {
    await conectar_base_datos();

    let filtro: any = { activo: true };

    if (rutaId) {
      // Suscriptores específicos de esta ruta O suscriptores con lista vacía (reciben todas)
      filtro = {
        activo: true,
        $or: [
          { rutasSuscritas: rutaId },
          { rutasSuscritas: { $size: 0 } },
          { rutasSuscritas: null },
          { rutasSuscritas: { $exists: false } },
        ],
      };
    }

    const suscripciones = await ModeloSuscripcionPush.find(filtro).select("token");
    return suscripciones.map((s) => s.token).filter(Boolean);
  } catch (error: any) {
    console.warn("[Push] Error al consultar tokens activos en BD:", error.message);
    return [];
  }
}
