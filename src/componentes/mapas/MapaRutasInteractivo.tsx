"use client";

import { crearPopupRuta, segmentosRuta, normalizarRuta } from "@/lib/rutas_mapa";
import { useEffect, useRef, useState, useCallback } from "react";
import { Maximize2, Minimize2, Plus, Minus, MoveVertical, Eye, EyeOff } from "lucide-react";

const COORDENADAS_GUTIERREZ_ZAMORA: [number, number] = [20.4514, -97.0886];

/** Filtra coordenadas inválidas (null, undefined, NaN, fuera de rango) y duplicados consecutivos. */
function filtrarCoordenadasValidas(coords: [number, number][]): [number, number][] {
  const resultado: [number, number][] = [];
  for (const punto of coords) {
    if (
      !punto ||
      !Array.isArray(punto) ||
      punto.length < 2 ||
      typeof punto[0] !== "number" ||
      typeof punto[1] !== "number" ||
      !Number.isFinite(punto[0]) ||
      !Number.isFinite(punto[1]) ||
      Math.abs(punto[0]) > 90 ||
      Math.abs(punto[1]) > 180
    ) {
      continue;
    }
    // Eliminar duplicados consecutivos
    if (resultado.length > 0) {
      const ultimo = resultado[resultado.length - 1];
      if (ultimo[0] === punto[0] && ultimo[1] === punto[1]) continue;
    }
    resultado.push(punto);
  }
  return resultado;
}

interface PropsMapaRutas {
  rutas_existentes: any[];
  coordenadas_trazado: [number, number][]; // Coordenadas detalladas calle por calle
  al_cambiar_coordenadas: (
    nuevas_coords: [number, number][],
    puntos_clave: [number, number][],
    distancia_metros: number,
    tramos_calles?: [number, number][][]
  ) => void;
  puntos_clave: [number, number][];
  tramos_historicos?: [number, number][][];
  color_activo: string;
  modo_dibujo: boolean;
  ajustar_a_calles: boolean;
  al_cambiar_ajuste_calles: (activo: boolean) => void;
  altura_inicial_px?: number;
  id_ruta_activa?: string;
}

export default function MapaRutasInteractivo({
  rutas_existentes,
  coordenadas_trazado,
  al_cambiar_coordenadas,
  puntos_clave,
  tramos_historicos = [],
  color_activo,
  modo_dibujo,
  ajustar_a_calles,
  al_cambiar_ajuste_calles,
  altura_inicial_px = 580,
  id_ruta_activa,
}: PropsMapaRutas) {
  const contenedor_ref = useRef<HTMLDivElement>(null);
  const mapa_ref = useRef<any>(null);
  const capa_rutas_guardadas_ref = useRef<any>(null);
  const capa_ruta_nueva_ref = useRef<any>(null);
  const L_ref = useRef<any>(null);

  const [mapa_listo, fijar_mapa_listo] = useState(false);
  const [calculando_tramo, fijar_calculando_tramo] = useState(false);
  const [altura_mapa, fijar_altura_mapa] = useState(altura_inicial_px);
  const [es_pantalla_completa, fijar_es_pantalla_completa] = useState(false);
  const [mostrar_referencias, fijar_mostrar_referencias] = useState(false);

  // Menú contextual para eliminar puntos
  const [menu_contextual, fijar_menu_contextual] = useState<{
    x: number;
    y: number;
    indice_punto: number;
  } | null>(null);

  // Cerrar menú contextual al hacer clic en cualquier otro lugar
  useEffect(() => {
    const cerrar = () => fijar_menu_contextual(null);
    if (menu_contextual) {
      document.addEventListener("click", cerrar);
      document.addEventListener("contextmenu", cerrar);
      return () => {
        document.removeEventListener("click", cerrar);
        document.removeEventListener("contextmenu", cerrar);
      };
    }
  }, [menu_contextual]);

  // Al cambiar o salir del modo dibujo, restaurar referencias y cerrar popups pendientes
  useEffect(() => {
    if (!modo_dibujo) {
      fijar_mostrar_referencias(false);
      fijar_menu_contextual(null);
    } else if (mapa_ref.current) {
      mapa_ref.current.closePopup();
    }
  }, [modo_dibujo]);

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
      L_ref.current = L;

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

  // Recalcular un tramo específico entre dos puntos clave (usado al arrastrar vértices)
  const recalcular_tramo = useCallback(
    async (
      punto_a: [number, number],
      punto_b: [number, number]
    ): Promise<[number, number][]> => {
      if (ajustar_a_calles) {
        const { puntos } = await calcular_tramo_calles(punto_a, punto_b);
        return puntos.length > 0 ? puntos : [punto_a, punto_b];
      }
      return [punto_a, punto_b];
    },
    [ajustar_a_calles]
  );

  // Reconstruir todas las coordenadas detalladas a partir de los tramos
  const reconstruir_coordenadas = useCallback(
    (tramos: [number, number][][]): [number, number][] => {
      if (tramos.length === 0) return [];
      const coords: [number, number][] = [];
      tramos.forEach((tramo, idx) => {
        if (idx === 0) {
          coords.push(...tramo);
        } else {
          coords.push(...tramo.slice(1));
        }
      });
      return filtrarCoordenadasValidas(coords);
    },
    []
  );

  // Handler para arrastrar un vértice (punto clave)
  const manejar_arrastre_vertice = useCallback(
    async (indice: number, nueva_pos: [number, number]) => {
      if (calculando_tramo) return;

      const nuevos_claves = [...puntos_clave];
      nuevos_claves[indice] = nueva_pos;

      fijar_calculando_tramo(true);
      try {
        // Recalcular los tramos afectados (el anterior y el siguiente al punto movido)
        const nuevos_tramos = [...tramos_historicos];

        // Tramo anterior (indice - 1 → indice)
        if (indice > 0) {
          const tramo_previo = await recalcular_tramo(nuevos_claves[indice - 1], nueva_pos);
          nuevos_tramos[indice - 1] = tramo_previo;
        }

        // Tramo siguiente (indice → indice + 1)
        if (indice < nuevos_claves.length - 1) {
          const tramo_siguiente = await recalcular_tramo(nueva_pos, nuevos_claves[indice + 1]);
          nuevos_tramos[indice] = tramo_siguiente;
        }

        const nuevas_coords = reconstruir_coordenadas(nuevos_tramos);
        al_cambiar_coordenadas(nuevas_coords, nuevos_claves, 0, nuevos_tramos);
      } finally {
        fijar_calculando_tramo(false);
      }
    },
    [puntos_clave, tramos_historicos, calculando_tramo, recalcular_tramo, reconstruir_coordenadas, al_cambiar_coordenadas]
  );

  // Handler para insertar un punto intermedio (punto fantasma)
  const manejar_insertar_punto = useCallback(
    async (indice_despues_de: number, nueva_pos: [number, number]) => {
      if (calculando_tramo) return;

      // Insertar nuevo punto clave después del índice dado
      const nuevos_claves = [...puntos_clave];
      nuevos_claves.splice(indice_despues_de + 1, 0, nueva_pos);

      fijar_calculando_tramo(true);
      try {
        // El tramo original en indice_despues_de (que iba de punto[i] → punto[i+1])
        // se divide en dos: punto[i] → nueva_pos, y nueva_pos → punto[i+1] (que ahora es punto[i+2])
        const tramo_a = await recalcular_tramo(nuevos_claves[indice_despues_de], nueva_pos);
        const tramo_b = await recalcular_tramo(nueva_pos, nuevos_claves[indice_despues_de + 2]);

        const nuevos_tramos = [...tramos_historicos];
        // Reemplazar el tramo original por dos nuevos
        nuevos_tramos.splice(indice_despues_de, 1, tramo_a, tramo_b);

        const nuevas_coords = reconstruir_coordenadas(nuevos_tramos);
        al_cambiar_coordenadas(nuevas_coords, nuevos_claves, 0, nuevos_tramos);
      } finally {
        fijar_calculando_tramo(false);
      }
    },
    [puntos_clave, tramos_historicos, calculando_tramo, recalcular_tramo, reconstruir_coordenadas, al_cambiar_coordenadas]
  );

  // Handler para eliminar un punto clave específico
  const eliminar_punto_clave = useCallback(
    async (indice: number) => {
      fijar_menu_contextual(null);

      if (puntos_clave.length <= 2) {
        // Si quedan 2 o menos puntos, limpiar todo
        al_cambiar_coordenadas([], [], 0, []);
        return;
      }

      const nuevos_claves = puntos_clave.filter((_, i) => i !== indice);

      fijar_calculando_tramo(true);
      try {
        const nuevos_tramos: [number, number][][] = [];

        if (indice === 0) {
          // Eliminar primer punto: quitar primer tramo
          nuevos_tramos.push(...tramos_historicos.slice(1));
        } else if (indice === puntos_clave.length - 1) {
          // Eliminar último punto: quitar último tramo
          nuevos_tramos.push(...tramos_historicos.slice(0, -1));
        } else {
          // Eliminar punto intermedio: fusionar los dos tramos adyacentes en uno nuevo
          const tramo_fusionado = await recalcular_tramo(
            nuevos_claves[indice - 1],
            nuevos_claves[indice]
          );
          // Copiar tramos anteriores, reemplazar los dos afectados por el fusionado, copiar el resto
          nuevos_tramos.push(
            ...tramos_historicos.slice(0, indice - 1),
            tramo_fusionado,
            ...tramos_historicos.slice(indice + 1)
          );
        }

        const nuevas_coords = reconstruir_coordenadas(nuevos_tramos);
        al_cambiar_coordenadas(nuevas_coords, nuevos_claves, 0, nuevos_tramos);
      } finally {
        fijar_calculando_tramo(false);
      }
    },
    [puntos_clave, tramos_historicos, calculando_tramo, recalcular_tramo, reconstruir_coordenadas, al_cambiar_coordenadas]
  );

  // Manejar clic en el mapa para trazar
  const manejar_clic_mapa = useCallback(
    async (e: any) => {
      if (!modo_dibujo || calculando_tramo) return;

      const nuevo_punto: [number, number] = [e.latlng.lat, e.latlng.lng];

      if (puntos_clave.length === 0) {
        // Primer punto: punto de partida (0 tramos aún)
        al_cambiar_coordenadas([nuevo_punto], [nuevo_punto], 0, []);
      } else {
        const ultimo_clave = puntos_clave[puntos_clave.length - 1];
        const nuevos_claves = [...puntos_clave, nuevo_punto];

        if (ajustar_a_calles) {
          fijar_calculando_tramo(true);
          try {
            const { puntos: tramo_calle, distancia } = await calcular_tramo_calles(
              ultimo_clave,
              nuevo_punto
            );

            // Garantizar que el tramo comience en el último punto clave
            const tramo_normalizado = tramo_calle.length > 0 ? tramo_calle : [ultimo_clave, nuevo_punto];
            const nuevos_tramos = [...tramos_historicos, tramo_normalizado];

            // Reconstruir coordenadas limpias uniendo tramos de forma continua
            const coordenadas_unidas = [
              ...coordenadas_trazado,
              ...tramo_normalizado.slice(1),
            ];

            al_cambiar_coordenadas(
              filtrarCoordenadasValidas(coordenadas_unidas),
              nuevos_claves,
              distancia,
              nuevos_tramos
            );
          } finally {
            fijar_calculando_tramo(false);
          }
        } else {
          const tramo_directo: [number, number][] = [ultimo_clave, nuevo_punto];
          const nuevos_tramos = [...tramos_historicos, tramo_directo];
          al_cambiar_coordenadas(
            filtrarCoordenadasValidas([...coordenadas_trazado, nuevo_punto]),
            nuevos_claves,
            0,
            nuevos_tramos
          );
        }
      }
    },
    [modo_dibujo, calculando_tramo, puntos_clave, coordenadas_trazado, tramos_historicos, ajustar_a_calles, al_cambiar_coordenadas]
  );

  useEffect(() => {
    if (!mapa_listo || !mapa_ref.current) return;
    const mapa = mapa_ref.current;

    mapa.off("click");
    if (modo_dibujo) {
      mapa.on("click", manejar_clic_mapa);
    }
  }, [mapa_listo, modo_dibujo, manejar_clic_mapa]);

  // Renderizar rutas existentes con sincronización segura y aislamiento de errores por ruta
  useEffect(() => {
    if (!mapa_listo || !capa_rutas_guardadas_ref.current) return;
    capa_rutas_guardadas_ref.current.clearLayers();

    // 1. Modo de enfoque: ocultar rutas existentes mientras se traza, a menos que se activen como referencia
    if (modo_dibujo && !mostrar_referencias) {
      return;
    }

    if (!Array.isArray(rutas_existentes) || rutas_existentes.length === 0) {
      return;
    }

    import("leaflet").then((mod) => {
      const L = mod.default || mod;

      // Limpiar preventivamente para evitar duplicados en renderizados concurrentes
      capa_rutas_guardadas_ref.current?.clearLayers();

      rutas_existentes.forEach((ruta_raw) => {
        try {
          const ruta = normalizarRuta(ruta_raw) || ruta_raw;
          if (!ruta) return;

          // En modo edición/trazado, excluir la ruta activa si se está editando para no solaparla consigo misma
          if (
            modo_dibujo &&
            id_ruta_activa &&
            (ruta._id === id_ruta_activa || ruta.id_ruta === id_ruta_activa)
          ) {
            return;
          }

          const segmentos = segmentosRuta(ruta?.trazado_geojson || ruta);
          if (!segmentos || segmentos.length === 0) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                "[MapaRutasInteractivo] Ruta con geometría vacía o corrupta omitida de render:",
                ruta?.id_ruta || ruta?.nombre,
                ruta_raw
              );
            }
            return;
          }

          const es_referencia = modo_dibujo && mostrar_referencias;

          // Prevención de clics accidentales: en referencia usar opacidad 0.25 y desactivar interactividad
          const linea = L.polyline(segmentos, {
            color: ruta.color_mapa || "#10b981",
            weight: es_referencia ? 3 : 5,
            opacity: es_referencia ? 0.25 : 0.85,
            dashArray: es_referencia ? "6, 6" : undefined,
            interactive: !es_referencia,
          });

          // Solo vincular popup si NO está en modo trazado/referencia
          if (!es_referencia) {
            linea.bindPopup(crearPopupRuta(ruta));
          }

          capa_rutas_guardadas_ref.current?.addLayer(linea);
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[MapaRutasInteractivo] Error aislando render de ruta individual:",
              ruta_raw,
              err
            );
          }
        }
      });
    });
  }, [mapa_listo, rutas_existentes, modo_dibujo, mostrar_referencias, id_ruta_activa]);

  // Renderizar la ruta actual en dibujo con marcadores arrastrables y puntos fantasma
  useEffect(() => {
    if (!mapa_listo || !capa_ruta_nueva_ref.current) return;
    capa_ruta_nueva_ref.current.clearLayers();

    const coords_validas = filtrarCoordenadasValidas(coordenadas_trazado);

    if (coords_validas.length > 0) {
      import("leaflet").then((mod) => {
        const L = mod.default || mod;

        // Polilínea principal con color activo
        const linea_en_progreso = L.polyline(coords_validas, {
          color: color_activo || "#2f63ff",
          weight: 6,
          opacity: 0.95,
        });

        capa_ruta_nueva_ref.current?.addLayer(linea_en_progreso);

        // Renderizar vértices (puntos clave) como marcadores arrastrables
        puntos_clave.forEach((coord, indice) => {
          const es_inicio = indice === 0;
          const es_final = indice === puntos_clave.length - 1;

          if (modo_dibujo) {
            // === MODO EDICIÓN: Marcadores arrastrables con L.marker + divIcon ===
            const tamano = es_inicio || es_final ? 18 : 14;
            const color_fondo = es_inicio ? "#10b981" : es_final ? "#ef4444" : color_activo;

            const icono = L.divIcon({
              className: "",
              iconSize: [tamano, tamano],
              iconAnchor: [tamano / 2, tamano / 2],
              html: `<div style="
                width:${tamano}px;height:${tamano}px;border-radius:50%;
                background:${color_fondo};border:2.5px solid #fff;
                box-shadow:0 0 6px rgba(0,0,0,0.5);
                cursor:grab;
                transition:transform 0.1s;
              " title="${es_inicio ? 'Inicio' : es_final ? 'Final' : `Parada #${indice}`}"></div>`,
            });

            const marcador = L.marker(coord, {
              icon: icono,
              draggable: true,
              zIndexOffset: es_inicio || es_final ? 1000 : 500,
            });

            // Tooltip
            marcador.bindTooltip(
              es_inicio ? "Inicio de Ruta (arrastrar)" : es_final ? `Final (arrastrar)` : `Parada #${indice} (arrastrar)`,
              { permanent: false, direction: "top", offset: [0, -10] }
            );

            // Evento de arrastre: actualizar posición
            marcador.on("dragend", (ev: any) => {
              const pos = ev.target.getLatLng();
              manejar_arrastre_vertice(indice, [pos.lat, pos.lng]);
            });

            // Menú contextual (clic derecho) para eliminar
            marcador.on("contextmenu", (ev: any) => {
              ev.originalEvent.preventDefault();
              ev.originalEvent.stopPropagation();
              const punto_contenedor = mapa_ref.current?.latLngToContainerPoint(ev.latlng);
              if (punto_contenedor) {
                fijar_menu_contextual({
                  x: punto_contenedor.x,
                  y: punto_contenedor.y,
                  indice_punto: indice,
                });
              }
            });

            capa_ruta_nueva_ref.current?.addLayer(marcador);
          } else {
            // === MODO VISUALIZACIÓN: circleMarker estático ===
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
          }
        });

        // === PUNTOS FANTASMA (midpoints) entre cada par de vértices consecutivos ===
        if (modo_dibujo && puntos_clave.length >= 2) {
          for (let i = 0; i < puntos_clave.length - 1; i++) {
            const punto_a = puntos_clave[i];
            const punto_b = puntos_clave[i + 1];
            const medio: [number, number] = [
              (punto_a[0] + punto_b[0]) / 2,
              (punto_a[1] + punto_b[1]) / 2,
            ];

            const icono_fantasma = L.divIcon({
              className: "",
              iconSize: [12, 12],
              iconAnchor: [6, 6],
              html: `<div style="
                width:12px;height:12px;border-radius:50%;
                background:${color_activo};opacity:0.4;
                border:2px dashed #fff;
                cursor:pointer;
                transition:opacity 0.15s,transform 0.15s;
              " onmouseenter="this.style.opacity='0.9';this.style.transform='scale(1.3)'"
                 onmouseleave="this.style.opacity='0.4';this.style.transform='scale(1)'"
                 title="Clic para insertar parada aquí"
              ></div>`,
            });

            const indice_insertar = i; // captura para closure
            const fantasma = L.marker(medio, {
              icon: icono_fantasma,
              draggable: true,
              zIndexOffset: 100,
            });

            fantasma.bindTooltip("Clic o arrastra para añadir parada", {
              permanent: false,
              direction: "top",
              offset: [0, -8],
            });

            // Al hacer clic: insertar punto en la posición media
            fantasma.on("click", () => {
              manejar_insertar_punto(indice_insertar, medio);
            });

            // Al arrastrar: insertar punto en la nueva posición
            fantasma.on("dragend", (ev: any) => {
              const pos = ev.target.getLatLng();
              manejar_insertar_punto(indice_insertar, [pos.lat, pos.lng]);
            });

            capa_ruta_nueva_ref.current?.addLayer(fantasma);
          }
        }
      });
    }
  }, [mapa_listo, coordenadas_trazado, puntos_clave, color_activo, modo_dibujo, manejar_arrastre_vertice, manejar_insertar_punto]);

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

      {/* 4. Indicador visual discreto cuando el modo trazado está activo */}
      {modo_dibujo && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-xs font-mono text-zinc-200 shadow-sm transition-all">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <span className="text-[11px] text-zinc-300">
              {mostrar_referencias ? (
                <>
                  <strong className="text-blue-300 font-semibold">Modo trazado activo:</strong> Mostrando rutas de referencia (opacidad 0.25, clics deshabilitados).
                </>
              ) : (
                <>
                  <strong className="text-blue-300 font-semibold">Modo trazado:</strong> rutas existentes ocultas para evitar solapamiento.
                </>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={() => fijar_mostrar_referencias(!mostrar_referencias)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
              mostrar_referencias
                ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                : "bg-zinc-800/90 text-zinc-300 border-zinc-700 hover:text-white hover:bg-zinc-700"
            }`}
            title="Alternar rutas guardadas como referencia visual tenue en opacidad 0.25"
          >
            {mostrar_referencias ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ocultar rutas de referencia</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Mostrar rutas de referencia</span>
              </>
            )}
          </button>
        </div>
      )}

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

          {modo_dibujo && (
            <button
              type="button"
              onClick={() => fijar_mostrar_referencias(!mostrar_referencias)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono backdrop-blur-md shadow-lg border transition-all ${
                mostrar_referencias
                  ? "bg-blue-600/90 text-white border-blue-400"
                  : "bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:text-white"
              }`}
              title="Alterna la visibilidad de las rutas previas como guía con baja opacidad"
            >
              {mostrar_referencias ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{mostrar_referencias ? "Ocultar Ref." : "Rutas Referencia (25%)"}</span>
            </button>
          )}

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

        {/* Menú contextual (clic derecho) para eliminar punto */}
        {menu_contextual && (
          <div
            className="absolute z-[9999] bg-zinc-900 border border-zinc-600 rounded-lg shadow-2xl py-1 min-w-[180px]"
            style={{
              left: menu_contextual.x,
              top: menu_contextual.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => eliminar_punto_clave(menu_contextual.indice_punto)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Eliminar parada #{menu_contextual.indice_punto}</span>
            </button>
            <div className="border-t border-zinc-700 my-0.5" />
            <button
              type="button"
              onClick={() => fijar_menu_contextual(null)}
              className="w-full text-left px-3 py-2 text-xs font-mono text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Indicador de modo edición interactiva */}
        {modo_dibujo && puntos_clave.length >= 2 && (
          <div className="absolute bottom-4 left-4 z-10 bg-black/85 backdrop-blur-md text-zinc-300 border border-zinc-600/50 px-3 py-1.5 rounded-lg text-[10px] font-mono shadow-lg flex items-center gap-2">
            <span className="text-emerald-400">●</span>
            <span>Arrastra vértices · Clic en puntos semitransparentes para insertar · Clic derecho para eliminar</span>
          </div>
        )}
      </div>
    </div>
  );
}
