"use client";

import { useEffect, useState } from "react";

export function BadgePendientesReportes() {
  const [totalPendientes, fijarTotalPendientes] = useState<number | null>(null);
  const [tieneCriticos, fijarTieneCriticos] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function consultarResumen() {
      try {
        const res = await fetch("/api/reportes/resumen", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelado && data.exito && data.datos?.global) {
          fijarTotalPendientes(data.datos.global.pendientesTotal);
          fijarTieneCriticos((data.datos.global.criticosOperativos || 0) > 0);
        }
      } catch (e) {
        // Silencioso para no interferir con la navegación
      }
    }

    consultarResumen();

    // Actualización periódica cada 45 segundos
    const intervalo = setInterval(consultarResumen, 45000);

    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, []);

  if (totalPendientes === null || totalPendientes === 0) {
    return null;
  }

  return (
    <span
      className={`ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
        tieneCriticos
          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse"
          : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
      }`}
      title={`${totalPendientes} incidencias pendientes (${tieneCriticos ? "Incluye fallas críticas" : "Por atender"})`}
    >
      {tieneCriticos && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
      <span>{totalPendientes}</span>
    </span>
  );
}
