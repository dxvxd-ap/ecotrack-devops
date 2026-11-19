"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Radio, ShieldCheck, ArrowRight, Truck } from "lucide-react";

export default function PaginaInicio() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900">
      {/* Barra de navegación minimalista */}
      <nav className="w-full px-6 py-6 flex items-center justify-between border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center text-white font-black text-xl shadow-md">
            E
          </div>
          <div>
            <span className="texto-anton text-2xl tracking-tight font-extrabold text-black">
              ECOTRACK
            </span>
          </div>
        </div>
        
        {isSignedIn && (
          <div className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full flex items-center gap-2 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Sesión Activa
          </div>
        )}
      </nav>

      {/* Contenedor central de accesos */}
      <main className="flex-grow flex items-center justify-center p-6">
        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Tarjeta de Portal Ciudadano */}
          <Link 
            href="/ciudadano"
            className="group flex flex-col bg-white p-7 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all hover:border-blue-200"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Radio className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-black mb-2">Portal Ciudadano</h2>
            <p className="text-sm text-zinc-500 mb-6 flex-grow">
              Consulta de rutas, seguimiento del recolector en tiempo real y reporte de problemas vecinales.
            </p>
            <div className="flex items-center text-sm font-semibold text-blue-600 gap-2 group-hover:gap-3 transition-all">
              Acceder al portal <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Tarjeta de Cabina Conductor */}
          <Link 
            href="/conductor"
            className="group flex flex-col bg-white p-7 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all hover:border-amber-200"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Truck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-black mb-2">Cabina Conductor</h2>
            <p className="text-sm text-zinc-500 mb-6 flex-grow">
              Terminal móvil de camión. Consulta de ruta en curso y botón de reporte de incidentes mecánicos y viales.
            </p>
            <div className="flex items-center text-sm font-semibold text-amber-600 gap-2 group-hover:gap-3 transition-all">
              Abrir cabina <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Tarjeta de Acceso Operativo */}
          <Link 
            href={isSignedIn ? "/dashboard" : "/login"}
            className="group flex flex-col bg-zinc-950 p-7 rounded-2xl border border-zinc-800 shadow-sm hover:shadow-lg transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-800 text-white flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Panel Operativo</h2>
            <p className="text-sm text-zinc-400 mb-6 flex-grow">
              Acceso restringido. Gestión de flota, trazado de rutas geográficas, reportes y alertas push.
            </p>
            <div className="flex items-center text-sm font-semibold text-white gap-2 group-hover:gap-3 transition-all">
              {isSignedIn ? "Ingresar al Dashboard" : "Iniciar Sesión"} <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

        </div>
      </main>
    </div>
  );
}