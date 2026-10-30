"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Plus, Minus, MoveVertical, Layers } from "lucide-react";

const COORDENADAS_GUTIERREZ_ZAMORA: [number, number] = [20.4514, -97.0886];

interface PropsVisorRutas {
  rutas: any[];
  ruta_seleccionada_id: string | null;
  al_seleccionar_ruta: (id: string | null) => void;
  altura_inicial_px?: number;
}

export default function VisorCartograficoRutas({
  rutas,
  ruta_seleccionada_id,
  al_seleccionar_ruta,
  altura_inicial_px = 620,
}: PropsVisorRutas) {
  const contenedor_ref = useRef<HTMLDivElement>(null);
  const mapa_ref = useRef<any>(null);
  const capas_rutas_ref = useRef<Map<string, any>>(new Map());

  const [mapa_listo, fijar_mapa_listo] = useState(false);
  const [altura_mapa, fijar_altura_mapa] = useState(altura_inicial_px);
  const [es_pantalla_completa, fijar_es_pantalla_completa] = useState(false);

  // Invalidate size on height change
  useEffect(() => {
    const temporizador = setTimeout(() => {
      if (mapa_ref.current) {
        mapa_ref.current.invalidateSize();
      }
    }, 150);
    return () => clearTimeout(temporizador);
  }, [altura_mapa, es_pantalla_completa]);

  const cambiar_altura = (delta: number) => {
    fijar_es_pantalla_completa(false);
    fijar_altura_mapa((prev) => Math.min(1100, Math.max(380, prev + delta)));
  };

  const fijar_altura_predefinida = (px: number) => {
    fijar_es_pantalla_completa(false);
    fijar_altura_mapa(px);
  };

  const alternar_pantalla_completa = () => {
    fijar_es_pantalla_completa(!es_pantalla_completa);
  };

  // Inicializar mapa en cliente
  useEffect(() => {
    let cancelado = false;

    async function inicializar() {
      if (!contenedor_ref.current || mapa_ref.current) return;

      const modulo_leaflet = await import("leaflet");
      const L = modulo_leaflet.default || modulo_leaflet;

      if (cancelado || !contenedor_ref.current || mapa_ref.current) return;

      const mapa = L.map(contenedor_ref.current, {
        center: COORDENADAS_GUTIERREZ_ZAMORA,
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap // Visor Gutiérrez Zamora',
        maxZoom: 19,
      }).addTo(mapa);

      mapa_ref.current = mapa;
      fijar_mapa_listo(true);
    }

    inicializar();

    return () => {
      cancelado = true;
      if (mapa_ref.current) {
        mapa_ref.current.remove();
        mapa_ref.current = null;
        fijar_mapa_listo(false);
      }
    };
  }, []);

  // Dibujar y actualizar todas las rutas
  useEffect(() => {
    if (!mapa_listo || !mapa_ref.current) return;
    const mapa = mapa_ref.current;

    import("leaflet").then((mod) => {
      const L = mod.default || mod;

      // Limpiar capas anteriores
      capas_rutas_ref.current.forEach((capa: any) => mapa.removeLayer(capa));
      capas_rutas_ref.current.clear();

      rutas.forEach((ruta) => {
        if (
          ruta &&
          ruta.trazado_geojson &&
          Array.isArray(ruta.trazado_geojson.coordinates) &&
          ruta.trazado_geojson.coordinates.length > 0
        ) {
          const puntos_leaflet: [number, number][] = ruta.trazado_geojson.coordinates.map(
            (c: [number, number]) => [c[1], c[0]]
          );

          const es_la_seleccionada =
            ruta._id === ruta_seleccionada_id || ruta.id_ruta === ruta_seleccionada_id;

          const linea = L.polyline(puntos_leaflet, {
            color: ruta.color_mapa || "#2f63ff",
            weight: es_la_seleccionada ? 8 : 4,
            opacity: es_la_seleccionada ? 1 : 0.65,
          }).addTo(mapa);

          linea.bindPopup(`
            <div style="font-family: sans-serif; color: #111; min-width: 180px;">
              <strong style="text-transform: uppercase; font-size: 13px;">${ruta.nombre || "Ruta"}</strong><br/>
              <span style="font-size: 11px; color: #555;">ID: ${ruta.id_ruta || "S/ID"}</span><br/>
              <span style="font-size: 12px; font-weight: bold; color: ${ruta.color_mapa || "#2f63ff"};">
                Distancia: ${ruta.distancia_estimada_km || 0} km
              </span><br/>
              <p style="font-size: 11px; margin: 4px 0 0 0; color: #444;">${ruta.descripcion || "Sin descripción adicional"}</p>
            </div>
          `);

          linea.on("click", () => {
            al_seleccionar_ruta(ruta._id);
          });

          capas_rutas_ref.current.set(ruta._id, linea);
        }
      });
    });
  }, [mapa_listo, rutas, ruta_seleccionada_id, al_seleccionar_ruta]);

  // Si se selecciona una ruta específica, enfocar y ajustar zoom
  useEffect(() => {
    if (!mapa_listo || !mapa_ref.current || !ruta_seleccionada_id) return;
    const mapa = mapa_ref.current;

    const ruta = rutas.find(
      (r) => r && (r._id === ruta_seleccionada_id || r.id_ruta === ruta_seleccionada_id)
    );

    if (ruta && ruta.trazado_geojson?.coordinates?.length > 0) {
      import("leaflet").then((mod) => {
        const L = mod.default || mod;
        const puntos: [number, number][] = ruta.trazado_geojson.coordinates.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        const limites = L.latLngBounds(puntos);
        mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 16 });
      });
    }
  }, [mapa_listo, ruta_seleccionada_id, rutas]);

  return (
    <div className="space-y-2">
      {/* Barra de Ajuste de Tamaño del Mapa */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-zinc-950/80 backdrop-blur rounded-xl border border-zinc-800 text-xs font-mono text-zinc-300">
        <div className="flex items-center gap-2">
          <MoveVertical className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] text-zinc-400 uppercase">Tamaño del Visor:</span>
          <span className="text-white font-bold">
            {es_pantalla_completa ? "Pantalla Completa" : `${altura_mapa}px`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => fijar_altura_predefinida(420)}
            className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
              altura_mapa === 420 && !es_pantalla_completa
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
            }`}
          >
            Chico (420px)
          </button>

          <button
            type="button"
            onClick={() => fijar_altura_predefinida(620)}
            className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
              altura_mapa === 620 && !es_pantalla_completa
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
            }`}
          >
            Medio (620px)
          </button>

          <button
            type="button"
            onClick={() => fijar_altura_predefinida(850)}
            className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
              altura_mapa === 850 && !es_pantalla_completa
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
            }`}
          >
            Grande (850px)
          </button>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <button
            type="button"
            onClick={() => cambiar_altura(-100)}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title="Reducir altura (-100px)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => cambiar_altura(100)}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            title="Aumentar altura (+100px)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={alternar_pantalla_completa}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border transition-colors ml-1 ${
              es_pantalla_completa
                ? "bg-amber-600 text-white border-amber-500"
                : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"
            }`}
            title="Ajustar al alto de la ventana"
          >
            {es_pantalla_completa ? (
              <>
                <Minimize2 className="w-3 h-3" />
                <span>Restaurar</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3 h-3" />
                <span>Expandir Ventana</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Contenedor del Mapa */}
      <div
        style={{
          height: es_pantalla_completa ? "82vh" : `${altura_mapa}px`,
          transition: "height 0.25s ease-in-out",
        }}
        className="relative w-full rounded-xl overflow-hidden border border-zinc-700 shadow-inner"
      >
        <div ref={contenedor_ref} className="w-full h-full z-0" />

        <div className="absolute top-4 left-4 z-10 bg-black/85 backdrop-blur-md text-white border border-zinc-700 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Gutiérrez Zamora // {rutas.length} Rutas Cargadas</span>
        </div>
      </div>
    </div>
  );
}
