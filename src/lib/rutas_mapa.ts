/**
 * Normalizador y utilidades cartográficas para rutas de EcoTrack (Dashboard y App Ciudadano).
 * Asegura compatibilidad con esquemas modernos y legacy (MongoDB -> Frontend -> Leaflet).
 */

export interface PuntoLatLng {
  lat: number;
  lng: number;
}

/** Limpia y normaliza un color hexadecimal (ej. #2f63ff, #10b981). Si es inválido, devuelve el fallback. */
export function limpiarHexColor(color: unknown, fallback = "#10b981"): string {
  if (typeof color === "string") {
    const limpio = color.trim();
    if (/^#[\da-f]{6}$/i.test(limpio)) return limpio.toLowerCase();
    if (/^#[\da-f]{3}$/i.test(limpio)) {
      // Expandir #abc -> #aabbcc
      const r = limpio[1], g = limpio[2], b = limpio[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
  }
  return fallback;
}

/**
 * Normaliza un punto de coordenadas individual a una tupla [latitud, longitud] segura.
 * Reconoce formatos [lon, lat], [lat, lon], {lat, lng}, {latitude, longitude}, etc.
 * En Veracruz/México: Latitud ~[14, 33], Longitud ~[-120, -85].
 */
export function normalizarCoordenadasPunto(punto: unknown): [number, number] | null {
  if (!punto) return null;

  let lat: number | undefined;
  let lng: number | undefined;

  if (Array.isArray(punto) && punto.length >= 2) {
    const a = Number(punto[0]);
    const b = Number(punto[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

    // Caso México/Veracruz: Latitud es positiva (~14 a 33), Longitud es negativa (~-120 a -85)
    if (a >= 14 && a <= 33 && b <= -80 && b >= -120) {
      // punto es [lat, lng]
      lat = a;
      lng = b;
    } else if (b >= 14 && b <= 33 && a <= -80 && a >= -120) {
      // punto es [lng, lat] (estándar GeoJSON)
      lat = b;
      lng = a;
    } else if (a < 0 && b > 0 && Math.abs(a) <= 180 && Math.abs(b) <= 90) {
      // a es longitud negativa, b es latitud positiva
      lat = b;
      lng = a;
    } else if (a > 0 && b < 0 && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      // a es latitud positiva, b es longitud negativa
      lat = a;
      lng = b;
    } else if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      // Límites generales (fallback asumiendo [lat, lng])
      lat = a;
      lng = b;
    } else {
      return null;
    }
  } else if (typeof punto === "object") {
    const obj = punto as Record<string, unknown>;
    const pLat = Number(obj.lat ?? obj.latitude ?? obj.latitud);
    const pLng = Number(obj.lng ?? obj.longitude ?? obj.longitud ?? obj.lon);

    if (Number.isFinite(pLat) && Number.isFinite(pLng) && Math.abs(pLat) <= 90 && Math.abs(pLng) <= 180) {
      lat = pLat;
      lng = pLng;
    }
  }

  if (lat === undefined || lng === undefined) return null;
  return [lat, lng];
}

/**
 * Extrae y normaliza un array de coordenadas [latitud, longitud] desde cualquier formato.
 * Filtra valores corruptos, NaN y duplicados consecutivos.
 */
export function extraerCoordenadasLatLng(origen: unknown): [number, number][] {
  if (!origen) return [];

  const coordenadas_candidatas: unknown[] = [];

  if (Array.isArray(origen)) {
    coordenadas_candidatas.push(...origen);
  } else if (typeof origen === "object" && origen !== null) {
    const obj = origen as Record<string, unknown>;
    // 1. Caso GeoJSON
    if (obj.trazado_geojson && typeof obj.trazado_geojson === "object") {
      const geo = obj.trazado_geojson as Record<string, unknown>;
      if (geo.type === "LineString" && Array.isArray(geo.coordinates)) {
        // En GeoJSON estándar es [lng, lat] -> normalizarCoordenadasPunto lo detecta
        coordenadas_candidatas.push(...geo.coordinates);
      } else if (geo.type === "MultiLineString" && Array.isArray(geo.coordinates)) {
        for (const tramo of geo.coordinates) {
          if (Array.isArray(tramo)) coordenadas_candidatas.push(...tramo);
        }
      }
    } else if (obj.type === "LineString" && Array.isArray(obj.coordinates)) {
      coordenadas_candidatas.push(...obj.coordinates);
    } else if (obj.type === "MultiLineString" && Array.isArray(obj.coordinates)) {
      for (const tramo of obj.coordinates) {
        if (Array.isArray(tramo)) coordenadas_candidatas.push(...tramo);
      }
    }

    // 2. Caso campos legacy en MongoDB: coordenadas, puntos, trazado, waypoints
    const camposLegacy = ["coordenadas", "puntos", "trazado", "waypoints", "paradas"];
    for (const campo of camposLegacy) {
      if (Array.isArray(obj[campo]) && (obj[campo] as unknown[]).length > 0) {
        coordenadas_candidatas.push(...(obj[campo] as unknown[]));
        break;
      }
    }
  }

  // Normalizar y filtrar duplicados consecutivos
  const resultado: [number, number][] = [];
  for (const c of coordenadas_candidatas) {
    const normal = normalizarCoordenadasPunto(c);
    if (!normal) continue;

    if (resultado.length > 0) {
      const ultimo = resultado[resultado.length - 1];
      if (ultimo[0] === normal[0] && ultimo[1] === normal[1]) continue;
    }
    resultado.push(normal);
  }

  return resultado;
}

/**
 * Normaliza cualquier documento de Ruta (moderno o legacy) a un esquema estricto y seguro.
 * Garantiza que nunca se lancen errores en `.map()` o al renderizar en Leaflet.
 */
export function normalizarRuta(rawRuta: any): any {
  if (!rawRuta || typeof rawRuta !== "object") return null;

  // Extraer coordenadas en formato [lat, lng]
  const coords_lat_lng = extraerCoordenadasLatLng(rawRuta);

  // Reconstruir o validar trazado GeoJSON
  let trazado_geojson = rawRuta.trazado_geojson;
  if (
    !trazado_geojson ||
    typeof trazado_geojson !== "object" ||
    !Array.isArray(trazado_geojson.coordinates) ||
    trazado_geojson.coordinates.length < 2
  ) {
    // Generar GeoJSON estándar [lng, lat] a partir de coords_lat_lng
    if (coords_lat_lng.length >= 2) {
      trazado_geojson = {
        type: "LineString",
        coordinates: coords_lat_lng.map(([lat, lng]) => [lng, lat]),
      };
    } else {
      // Fallback mínimo con centro de Gutiérrez Zamora para evitar que rompa el mapa
      trazado_geojson = {
        type: "LineString",
        coordinates: [
          [-97.0886, 20.4514],
          [-97.0876, 20.4524],
        ],
      };
    }
  }

  const id_raw = rawRuta.id_ruta || rawRuta.codigo || rawRuta.id || rawRuta._id;
  const id_ruta = typeof id_raw === "string" && id_raw.trim()
    ? id_raw.trim().toUpperCase()
    : `RUTA-${String(rawRuta._id || Date.now()).slice(-6).toUpperCase()}`;

  const nombre_raw = rawRuta.nombre || rawRuta.nombre_ruta;
  const nombre = typeof nombre_raw === "string" && nombre_raw.trim()
    ? nombre_raw.trim()
    : "Ruta sin nombre";

  const color_mapa = limpiarHexColor(rawRuta.color_mapa || rawRuta.color, "#10b981");

  const distancia_estimada_km =
    typeof rawRuta.distancia_estimada_km === "number" && Number.isFinite(rawRuta.distancia_estimada_km)
      ? rawRuta.distancia_estimada_km
      : typeof rawRuta.distanciaKm === "number" && Number.isFinite(rawRuta.distanciaKm)
      ? rawRuta.distanciaKm
      : 0;

  const duracion_estimada_min =
    typeof rawRuta.duracion_estimada_min === "number" && Number.isFinite(rawRuta.duracion_estimada_min)
      ? rawRuta.duracion_estimada_min
      : typeof rawRuta.duracionMin === "number" && Number.isFinite(rawRuta.duracionMin)
      ? rawRuta.duracionMin
      : 0;

  return {
    _id: rawRuta._id ? String(rawRuta._id) : undefined,
    id_ruta,
    nombre,
    descripcion: typeof rawRuta.descripcion === "string" ? rawRuta.descripcion : "",
    trazado_geojson,
    color_mapa,
    distancia_estimada_km,
    duracion_estimada_min,
    activa: rawRuta.activa ?? true,
    diasRecoleccion: Array.isArray(rawRuta.diasRecoleccion)
      ? rawRuta.diasRecoleccion
      : Array.isArray(rawRuta.dias_recoleccion)
      ? rawRuta.dias_recoleccion
      : ["lunes", "miercoles", "viernes"],
    horarioHabitual: {
      horaInicio: rawRuta.horarioHabitual?.horaInicio || rawRuta.horario_habitual?.hora_inicio || "07:00",
      horaFin: rawRuta.horarioHabitual?.horaFin || rawRuta.horario_habitual?.hora_fin || "13:00",
    },
    camionAsignadoId: rawRuta.camionAsignadoId || rawRuta.camion_asignado_id || null,
    conductorHabitualId: rawRuta.conductorHabitualId || rawRuta.conductor_habitual_id || null,
    fecha_creacion: rawRuta.fecha_creacion || rawRuta.createdAt || new Date().toISOString(),
    fecha_actualizacion: rawRuta.fecha_actualizacion || rawRuta.updatedAt || new Date().toISOString(),
  };
}

/** Transformaciones de visualización para Leaflet: extrae segmentos de [lat, lon] de manera resiliente. */
export function segmentosRuta(geometria: any): [number, number][][] {
  if (!geometria) return [];

  // Si nos pasaron un objeto ruta completo
  if (typeof geometria === "object" && !geometria.type) {
    if (geometria.trazado_geojson) return segmentosRuta(geometria.trazado_geojson);
    const coords = extraerCoordenadasLatLng(geometria);
    return coords.length >= 2 ? [coords] : [];
  }

  const lineas =
    geometria?.type === "LineString"
      ? [geometria.coordinates]
      : geometria?.type === "MultiLineString"
      ? geometria.coordinates
      : [];

  if (!Array.isArray(lineas)) return [];

  const resultado: [number, number][][] = [];

  for (const linea of lineas) {
    if (!Array.isArray(linea) || linea.length < 2) continue;
    const puntos_segmento: [number, number][] = [];

    for (const p of linea) {
      const normal = normalizarCoordenadasPunto(p);
      if (normal) puntos_segmento.push(normal);
    }

    if (puntos_segmento.length >= 2) {
      resultado.push(puntos_segmento);
    }
  }

  return resultado;
}

export function puedeEditarGeometria(geometria: any): boolean {
  if (!geometria) return false;
  const segmentos = segmentosRuta(geometria);
  return segmentos.length === 1 && segmentos[0].length >= 2;
}

export function crearPopupRuta(ruta: {
  nombre?: unknown;
  id_ruta?: unknown;
  distancia_estimada_km?: unknown;
}): HTMLElement {
  const contenedor = document.createElement("div");
  contenedor.style.fontFamily = "sans-serif";
  contenedor.style.color = "#111";
  const nombre = document.createElement("strong");
  nombre.style.textTransform = "uppercase";
  nombre.textContent = typeof ruta.nombre === "string" && ruta.nombre ? ruta.nombre : "Ruta";
  const id = document.createElement("span");
  id.style.fontSize = "11px";
  id.style.color = "#666";
  id.textContent = `ID: ${typeof ruta.id_ruta === "string" && ruta.id_ruta ? ruta.id_ruta : "S/ID"}`;
  const distancia = document.createElement("span");
  distancia.style.fontSize = "12px";
  distancia.textContent = `Distancia: ${
    typeof ruta.distancia_estimada_km === "number" && Number.isFinite(ruta.distancia_estimada_km)
      ? ruta.distancia_estimada_km
      : 0
  } km`;
  contenedor.append(nombre, document.createElement("br"), id, document.createElement("br"), distancia);
  return contenedor;
}
