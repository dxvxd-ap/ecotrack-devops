"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface TelemetriaEnVivo {
  camion_id: string;
  latitud: number;
  longitud: number;
  velocidad_kmh: number;
  rumbo_grados: number;
  imei?: string;
  matricula?: string;
  numero_unidad?: string;
  ignicion?: boolean;
  bateria?: number;
  timestamp: string; // ISO string
}

export type EstadoConexionWs = "conectado" | "reconectando" | "desconectado";

const WS_DEFAULT_URL = "wss://servidorgps-production.up.railway.app/ws/v1/rastreo-en-vivo";

/**
 * Normaliza cualquier carga útil recibida por WebSocket a una estructura estándar de TelemetriaEnVivo.
 */
function normalizarMensajeTelemetria(payload: any): TelemetriaEnVivo | null {
  if (!payload || typeof payload !== "object") return null;

  // Extraer datos si vienen envueltos en { tipo, datos } o { type, data }
  const data = payload.datos || payload.data || payload;

  const lat = Number(data.latitud ?? data.lat ?? data.latitude ?? data.position?.latitude);
  const lng = Number(data.longitud ?? data.lng ?? data.lon ?? data.longitude ?? data.position?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  const camion_id = String(
    data.camion_id ??
    data.camionId ??
    data.id_camion ??
    data._id ??
    data.id ??
    data.device?.uniqueId ??
    data.uniqueId ??
    data.imei ??
    ""
  );

  const velocidad_kmh = Number(
    data.velocidad_kmh ??
    data.velocidad ??
    data.speed ??
    data.position?.speed ??
    0
  );

  const rumbo_grados = Number(
    data.rumbo_grados ??
    data.rumbo ??
    data.heading ??
    data.course ??
    data.position?.course ??
    0
  );

  const imei = data.imei || data.imei_gps || data.device?.uniqueId || undefined;
  const matricula = data.matricula || data.device?.name || undefined;
  const numero_unidad = data.numero_unidad || undefined;
  const ignicion = data.ignicion ?? data.position?.attributes?.ignition ?? true;
  const bateria = data.bateria ?? data.position?.attributes?.batteryLevel ?? 100;
  const timestamp = data.timestamp || data.fecha_gps || data.position?.fixTime || new Date().toISOString();

  return {
    camion_id,
    latitud: lat,
    longitud: lng,
    velocidad_kmh: Number.isFinite(velocidad_kmh) ? Math.max(0, velocidad_kmh) : 0,
    rumbo_grados: Number.isFinite(rumbo_grados) ? (rumbo_grados + 360) % 360 : 0,
    imei,
    matricula,
    numero_unidad,
    ignicion: Boolean(ignicion),
    bateria: Number.isFinite(bateria) ? bateria : 100,
    timestamp: typeof timestamp === "string" ? timestamp : new Date(timestamp).toISOString(),
  };
}

export function useRastreoWebSocket(urlPersonalizada?: string) {
  const [estadoConexion, fijar_estadoConexion] = useState<EstadoConexionWs>("reconectando");
  const [ultimoMensaje, fijar_ultimoMensaje] = useState<TelemetriaEnVivo | null>(null);
  const [telemetriaPorCamion, fijar_telemetriaPorCamion] = useState<Record<string, TelemetriaEnVivo>>({});
  const [ultimoTimestamp, fijar_ultimoTimestamp] = useState<Date | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerReconexionRef = useRef<NodeJS.Timeout | null>(null);
  const canceladoRef = useRef(false);

  const urlWs =
    urlPersonalizada ||
    process.env.NEXT_PUBLIC_WS_URL ||
    WS_DEFAULT_URL;

  const conectar = useCallback(() => {
    if (canceladoRef.current) return;

    // Cerrar socket previo si existe
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignorar fallo de cierre
      }
      wsRef.current = null;
    }

    fijar_estadoConexion("reconectando");

    try {
      const ws = new WebSocket(urlWs);
      wsRef.current = ws;

      ws.onopen = () => {
        if (canceladoRef.current) {
          ws.close();
          return;
        }
        fijar_estadoConexion("conectado");
        if (timerReconexionRef.current) {
          clearTimeout(timerReconexionRef.current);
          timerReconexionRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        if (canceladoRef.current) return;
        try {
          const raw = JSON.parse(event.data);

          // Si es array de ubicaciones
          if (Array.isArray(raw)) {
            const actualizados: Record<string, TelemetriaEnVivo> = {};
            let ultimo: TelemetriaEnVivo | null = null;
            for (const item of raw) {
              const normalizado = normalizarMensajeTelemetria(item);
              if (normalizado && normalizado.camion_id) {
                actualizados[normalizado.camion_id] = normalizado;
                if (normalizado.imei) actualizados[normalizado.imei] = normalizado;
                if (normalizado.matricula) actualizados[normalizado.matricula] = normalizado;
                ultimo = normalizado;
              }
            }
            if (Object.keys(actualizados).length > 0) {
              fijar_telemetriaPorCamion((prev) => ({ ...prev, ...actualizados }));
              if (ultimo) {
                fijar_ultimoMensaje(ultimo);
                fijar_ultimoTimestamp(new Date());
              }
            }
            return;
          }

          // Si es un objeto individual
          const normalizado = normalizarMensajeTelemetria(raw);
          if (normalizado && normalizado.camion_id) {
            fijar_telemetriaPorCamion((prev) => {
              const copia = { ...prev, [normalizado.camion_id]: normalizado };
              if (normalizado.imei) copia[normalizado.imei] = normalizado;
              if (normalizado.matricula) copia[normalizado.matricula] = normalizado;
              return copia;
            });
            fijar_ultimoMensaje(normalizado);
            fijar_ultimoTimestamp(new Date());
          }
        } catch {
          // Ignorar paquetes no JSON (ej. pings planos)
        }
      };

      ws.onerror = () => {
        if (canceladoRef.current) return;
        fijar_estadoConexion("reconectando");
      };

      ws.onclose = () => {
        if (canceladoRef.current) return;
        fijar_estadoConexion("reconectando");
        // Intentar reconectar tras 4 segundos con jitter
        if (!timerReconexionRef.current) {
          const delay = 3500 + Math.random() * 1500;
          timerReconexionRef.current = setTimeout(() => {
            timerReconexionRef.current = null;
            conectar();
          }, delay);
        }
      };
    } catch {
      fijar_estadoConexion("desconectado");
      if (!timerReconexionRef.current) {
        timerReconexionRef.current = setTimeout(() => {
          timerReconexionRef.current = null;
          conectar();
        }, 5000);
      }
    }
  }, [urlWs]);

  useEffect(() => {
    canceladoRef.current = false;
    conectar();

    return () => {
      canceladoRef.current = true;
      if (timerReconexionRef.current) {
        clearTimeout(timerReconexionRef.current);
        timerReconexionRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // Ignorar
        }
        wsRef.current = null;
      }
    };
  }, [conectar]);

  return {
    estadoConexion,
    ultimoMensaje,
    telemetriaPorCamion,
    ultimoTimestamp,
    reconectarManual: conectar,
    urlWs,
  };
}
