"use client";

import { crearPopupRuta, segmentosRuta } from "@/lib/rutas_mapa";
import { useEffect, useRef, useState, useCallback } from "react";
import { Maximize2, Minimize2, Plus, Minus, MoveVertical } from "lucide-react";

const COORDENADAS_GUTIERREZ_ZAMORA: [number, number] = [20.4514, -97.0886];

interface PropsMapaRutas {
  rutas_existentes: any[];
  coordenadas_trazado: [number, number][]; // Coordenadas detalladas calle por calle
  al_cambiar_coordenadas: (nuevas_coords: [number, number][], puntos_clave: [number, number][], distancia_metros: number) => void;
  puntos_clave: [number, number][];
  color_activo: string;
  modo_dibujo: boolean;
  ajustar_a_calles: boolean;
  al_cambiar_ajuste_calles: (activo: boolean) => void;
  altura_inicial_px?: number;
}

export default function MapaRutasInteractivo({
  rutas_existentes,
  coordenadas_trazado,
  al_cambiar_coordenadas,
  puntos_clave,
  color_activo,
  modo_dibujo,
  ajustar_a_calles,
  al_cambiar_ajuste_calles,
  altura_inicial_px = 580,
}: PropsMapaRutas) {
  const contenedor_ref = useRef<HTMLDivElement>(null);
  const mapa_ref = useRef<any>(null);
  const capa_rutas_guardadas_ref = useRef<any>(null);
  const capa_ruta_nueva_ref = useRef<any>(null);

  const [mapa_listo, fijar_mapa_listo] = useState(false);
  const [calculando_tramo, fijar_calculando_tramo] = useState(false);
  const [altura_mapa, fijar_altura_mapa] = useState(altura_inicial_px);
  const [es_pantalla_completa, fijar_es_pantalla_completa] = useState(false);

  // Reajustar dimensiones internas de Leaflet cuando cambia el tamaño del contenedor
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

  // Inicializar mapa centrado en Gutiérrez Zamora, Veracruz
  useEffect(() => {
    let cancelado = false;

    async function inicializar() {
      if (!contenedor_ref.current || mapa_ref.current) return;

      const modulo_leaflet = await import("leaflet");
      const L = modulo_leaflet.default || modulo_leaflet;

      if (cancelado || !contenedor_ref.current || mapa_ref.current) return;

      const mapa = L.map(contenedor_ref.current, {
        center: COORDENADAS_GUTIERREZ_ZAMORA,
        zoom: 15,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap // Gutiérrez Zamora, Ver.',
        maxZoom: 19,
      }).addTo(mapa);

      capa_rutas_guardadas_ref.current = L.layerGroup().addTo(mapa);
      capa_ruta_nueva_ref.current = L.layerGroup().addTo(mapa);

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

  // Función para obtener ruta vehicular calle por calle usando OSRM
  const calcular_tramo_calles = async (
    origen: [number, number],
    destino: [number, number]
  ): Promise<{ puntos: [number, number][]; distancia: number }> => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origen[1]},${origen[0]};${destino[1]},${destino[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code === "Ok" && data.routes && data.routes[0]) {
        const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
          ([lon, lat]: [number, number]) => [lat, lon]
        );
        return { puntos: coords, distancia: data.routes[0].distance || 0 };
      }
    } catch (e) {
      console.warn("Fallo en OSRM, conectando tramo directo:", e);
    }

    return { puntos: [origen, destino], distancia: 0 };
  };

  // Manejar clic en el mapa para trazar
  const manejar_clic_mapa = useCallback(
    async (e: any) => {
      if (!modo_dibujo) return;

      const nuevo_punto: [number, number] = [e.latlng.lat, e.latlng.lng];

      if (puntos_clave.length === 0) {
        al_cambiar_coordenadas([nuevo_punto], [nuevo_punto], 0);
      } else {
        const ultimo_clave = puntos_clave[puntos_clave.length - 1];
        const nuevos_claves = [...puntos_clave, nuevo_punto];

        if (ajustar_a_calles) {
          fijar_calculando_tramo(true);
          const { puntos: tramo_calle, distancia } = await calcular_tramo_calles(
            ultimo_clave,
            nuevo_punto
          );
          fijar_calculando_tramo(false);

          const coordenadas_unidas = [
            ...coordenadas_trazado,
            ...tramo_calle.slice(1),
          ];

          al_cambiar_coordenadas(coordenadas_unidas, nuevos_claves, distancia);
        } else {
          al_cambiar_coordenadas(
            [...coordenadas_trazado, nuevo_punto],
            nuevos_claves,
            0
          );
        }
      }
    },
    [modo_dibujo, puntos_clave, coordenadas_trazado, ajustar_a_calles, al_cambiar_coordenadas]
  );

  useEffect(() => {
    if (!mapa_listo || !mapa_ref.current) return;
    const mapa = mapa_ref.current;

    mapa.off("click");
    if (modo_dibujo) {
      mapa.on("click", manejar_clic_mapa);
    }
  }, [mapa_listo, modo_dibujo, manejar_clic_mapa]);

  // Renderizar rutas existentes
  useEffect(() => {
    if (!mapa_listo || !capa_rutas_guardadas_ref.current) return;
    capa_rutas_guardadas_ref.current.clearLayers();

    import("leaflet").then((mod) => {
      const L = mod.default || mod;

      rutas_existentes.forEach((ruta) => {
        const segmentos = segmentosRuta(ruta?.trazado_geojson);
        if (segmentos.length) {
          const linea = L.polyline(segmentos, {
            color: ruta.color_mapa || "#2f63ff", weight: 5, opacity: 0.85,
          });
          linea.bindPopup(crearPopupRuta(ruta));
          capa_rutas_guardadas_ref.current?.addLayer(linea);
        }
      });
    });
  }, [mapa_listo, rutas_existentes]);

  // Renderizar la ruta actual en dibujo
  useEffect(() => {
    if (!mapa_listo || !capa_ruta_nueva_ref.current) return;
    capa_ruta_nueva_ref.current.clearLayers();

    if (coordenadas_trazado.length > 0) {
      import("leaflet").then((mod) => {
        const L = mod.default || mod;

        const linea_en_progreso = L.polyline(coordenadas_trazado, {
          color: color_activo || "#2f63ff",
          weight: 6,
          opacity: 0.95,
        });

        capa_ruta_nueva_ref.current.addLayer(linea_en_progreso);

        puntos_clave.forEach((coord, indice) => {
          const es_inicio = indice === 0;
          const circulo = L.circleMarker(coord, {
            radius: es_inicio ? 9 : 6,
            color: "#ffffff",
            weight: 2,
            fillColor: es_inicio ? "#10b981" : color_activo,
            fillOpacity: 1,
          });

          circulo.bindTooltip(
            es_inicio ? "Inicio de Ruta" : `Parada #${indice}`,
            { permanent: false }
          );

          capa_ruta_nueva_ref.current?.addLayer(circulo);
        });
      });
    }
  }, [mapa_listo, coordenadas_trazado, puntos_clave, color_activo]);

  return (
    <div className="space-y-2">
      {/* Barra de Ajuste de Tamaño del Mapa */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-zinc-950/80 backdrop-blur rounded-xl border border-zinc-800 text-xs font-mono text-zinc-300">
        <div className="flex items-center gap-2">
          <MoveVertical className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] text-zinc-400 uppercase">Tamaño del Mapa:</span>
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
            onClick={() => fijar_altura_predefinida(600)}
            className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
              altura_mapa === 600 && !es_pantalla_completa
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
            }`}
          >
            Medio (600px)
          </button>

          <button
            type="button"
            onClick={() => fijar_altura_predefinida(820)}
            className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
              altura_mapa === 820 && !es_pantalla_completa
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
            }`}
          >
            Grande (820px)
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

      {/* Contenedor Físico del Mapa con Altura Dinámica */}
      <div
        style={{
          height: es_pantalla_completa ? "82vh" : `${altura_mapa}px`,
          transition: "height 0.25s ease-in-out",
        }}
        className="relative w-full rounded-xl overflow-hidden border border-zinc-700 shadow-inner"
      >
        <div ref={contenedor_ref} className="w-full h-full z-0" />

        {/* Controles Flotantes Superiores */}
        <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => al_cambiar_ajuste_calles(!ajustar_a_calles)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono backdrop-blur-md shadow-lg border transition-all ${
              ajustar_a_calles
                ? "bg-emerald-600/90 text-white border-emerald-400"
                : "bg-zinc-900/90 text-zinc-300 border-zinc-700"
            }`}
            title="Alterna entre seguir las calles de Gutiérrez Zamora o trazar líneas rectas"
          >
            <span className={`w-2 h-2 rounded-full ${ajustar_a_calles ? "bg-white animate-pulse" : "bg-zinc-500"}`} />
            <span>{ajustar_a_calles ? "Modo: Seguir Calles (Vehicular)" : "Modo: Línea Libre"}</span>
          </button>

          {calculando_tramo && (
            <div className="flex items-center gap-1.5 bg-black/90 text-amber-400 border border-amber-500/40 px-3 py-1.5 rounded-lg text-xs font-mono animate-pulse">
              <span>Ajustando a la calle...</span>
            </div>
          )}
        </div>

        {modo_dibujo && (
          <div className="absolute top-4 right-4 z-10 bg-black/85 backdrop-blur-md text-white border border-blue-500/50 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
            <span>Haz clic en dos o más puntos para que la ruta se adapte a las calles</span>
          </div>
        )}
      </div>
    </div>
  );
}
