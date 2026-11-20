"use client";

export interface OpcionesClienteHttp extends RequestInit {
  reintentos?: number;
  desactivarReintentos?: boolean;
}

const ESPERAS_MS = [700, 1400];

/**
 * Cliente HTTP universal y seguro para las vistas del Dashboard de EcoTrack.
 * - Desactiva el caché en peticiones GET ('no-store', 'Cache-Control: no-cache, no-store').
 * - Implementa reintento automático transparente (hasta 2 reintentos con 700ms y 1400ms)
 *   ante caídas de red, 401 por hidratación tardía de Clerk o 500/502/503/504 en Serverless.
 */
export async function clienteFetch<T = any>(
  input: string | URL | Request,
  opciones: OpcionesClienteHttp = {}
): Promise<T> {
  const { reintentos = 2, desactivarReintentos = false, ...init } = opciones;
  const metodo = (init.method || "GET").toUpperCase();

  const cabeceras = new Headers(init.headers || {});
  if (metodo === "GET") {
    cabeceras.set("Cache-Control", "no-cache, no-store, must-revalidate");
    cabeceras.set("Pragma", "no-cache");
    cabeceras.set("Expires", "0");
  }

  const configuracion: RequestInit = {
    ...init,
    method: metodo,
    headers: cabeceras,
    cache: metodo === "GET" ? "no-store" : init.cache,
  };

  let intento = 0;
  let ultimoError: any = null;

  while (intento <= reintentos) {
    try {
      const respuesta = await fetch(input, configuracion);

      // Si falla con código reintentable en peticiones GET
      const esReintentable =
        metodo === "GET" &&
        !desactivarReintentos &&
        intento < reintentos &&
        (respuesta.status === 401 ||
          respuesta.status === 500 ||
          respuesta.status === 502 ||
          respuesta.status === 503 ||
          respuesta.status === 504);

      if (esReintentable) {
        await new Promise((res) => setTimeout(res, ESPERAS_MS[intento] || 1000));
        intento++;
        continue;
      }

      const tipoContenido = respuesta.headers.get("content-type") || "";
      let cuerpo: any = null;

      if (tipoContenido.includes("application/json")) {
        try {
          cuerpo = await respuesta.json();
        } catch {
          cuerpo = null;
        }
      } else {
        try {
          cuerpo = await respuesta.text();
        } catch {
          cuerpo = null;
        }
      }

      if (!respuesta.ok && intento >= reintentos) {
        return cuerpo as T;
      }

      return cuerpo as T;
    } catch (error: any) {
      ultimoError = error;
      if (metodo === "GET" && !desactivarReintentos && intento < reintentos) {
        await new Promise((res) => setTimeout(res, ESPERAS_MS[intento] || 1000));
        intento++;
        continue;
      }
      break;
    }
  }

  throw ultimoError || new Error("Error de conexión con el servidor");
}

/**
 * Extractor seguro y universal de listas para el Dashboard.
 * Soporta respuestas en múltiples formatos:
 * - Arreglo directo: `[...]`
 * - Objeto con datos: `{ ok: true, datos: [...] }` o `{ exito: true, datos: [...] }`
 * - Objeto con clave de modelo: `{ camiones: [...] }`, `{ conductores: [...] }`, `{ rutas: [...] }`, etc.
 * - Primer arreglo encontrado en cualquier propiedad.
 * - Garantiza que NUNCA devuelva null o undefined (retorna `[]` como valor seguro).
 */
export function extraerLista<T = any>(respuesta: any, clavePreferida?: string): T[] {
  if (!respuesta) return [];
  if (Array.isArray(respuesta)) return respuesta;

  if (typeof respuesta === "object") {
    // 1. Clave preferida explícita
    if (clavePreferida && Array.isArray(respuesta[clavePreferida])) {
      return respuesta[clavePreferida];
    }

    // 2. Claves comunes estándar
    if (Array.isArray(respuesta.datos)) return respuesta.datos;
    if (Array.isArray(respuesta.data)) return respuesta.data;
    if (Array.isArray(respuesta.items)) return respuesta.items;

    // 3. Claves de colecciones específicas
    const clavesComunes = [
      "camiones",
      "conductores",
      "rutas",
      "turnos",
      "calendario",
      "asignaciones",
      "reportes",
      "reclamos",
      "alertas",
      "usuarios",
      "roles",
    ];

    for (const c of clavesComunes) {
      if (Array.isArray(respuesta[c])) {
        return respuesta[c];
      }
    }

    // 4. Primer campo con formato array
    for (const k of Object.keys(respuesta)) {
      if (Array.isArray(respuesta[k])) {
        return respuesta[k];
      }
    }
  }

  return [];
}
