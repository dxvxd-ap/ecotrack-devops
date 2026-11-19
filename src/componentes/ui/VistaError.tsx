"use client";

import React from "react";
import Link from "next/link";
import {
  Compass,
  ShieldAlert,
  KeyRound,
  ServerCrash,
  WifiOff,
  ArrowLeft,
  RotateCcw,
  LogIn,
  Home,
} from "lucide-react";

export type TipoErrorVista = "404" | "403" | "401" | "500" | "OFFLINE";

interface PropsVistaError {
  tipo?: TipoErrorVista;
  tituloPersonalizado?: string;
  mensajePersonalizado?: string;
  alReintentar?: () => void;
  enlaceVolver?: string;
  textoVolver?: string;
  mostrarBotonInicio?: boolean;
}

const CONFIGURACION_ERRORES: Record<
  TipoErrorVista,
  {
    codigo: string;
    titulo: string;
    mensaje: string;
    icono: React.ElementType;
    colorIcono: string;
    fondoIcono: string;
    bordeIcono: string;
  }
> = {
  "404": {
    codigo: "404",
    titulo: "Página o recurso no encontrado",
    mensaje:
      "La dirección que buscas no existe, fue movida o cambió de ubicación dentro del sistema EcoTrack.",
    icono: Compass,
    colorIcono: "text-blue-500 dark:text-blue-400",
    fondoIcono: "bg-blue-500/10",
    bordeIcono: "border-blue-500/20",
  },
  "403": {
    codigo: "403",
    titulo: "Acceso denegado",
    mensaje:
      "No cuentas con los privilegios suficientes para consultar este módulo. Solicita autorización a un administrador de EcoTrack.",
    icono: ShieldAlert,
    colorIcono: "text-rose-500 dark:text-rose-400",
    fondoIcono: "bg-rose-500/10",
    bordeIcono: "border-rose-500/20",
  },
  "401": {
    codigo: "401",
    titulo: "Sesión expirada o no autenticada",
    mensaje:
      "Tu sesión de seguridad ha finalizado o requiere validación de credenciales para continuar.",
    icono: KeyRound,
    colorIcono: "text-amber-500 dark:text-amber-400",
    fondoIcono: "bg-amber-500/10",
    bordeIcono: "border-amber-500/20",
  },
  "500": {
    codigo: "500",
    titulo: "Error interno del sistema",
    mensaje:
      "Ocurrió un problema inesperado al procesar la información. El incidente ha sido notificado al equipo técnico.",
    icono: ServerCrash,
    colorIcono: "text-red-500 dark:text-red-400",
    fondoIcono: "bg-red-500/10",
    bordeIcono: "border-red-500/20",
  },
  "OFFLINE": {
    codigo: "OFFLINE",
    titulo: "Sin conexión con el servidor",
    mensaje:
      "No pudimos conectar con los servicios de EcoTrack. Verifica tu conexión a internet o intenta nuevamente en unos momentos.",
    icono: WifiOff,
    colorIcono: "text-amber-500 dark:text-amber-400",
    fondoIcono: "bg-amber-500/10",
    bordeIcono: "border-amber-500/20",
  },
};

export function VistaError({
  tipo = "500",
  tituloPersonalizado,
  mensajePersonalizado,
  alReintentar,
  enlaceVolver = "/dashboard",
  textoVolver = "Volver al Dashboard",
  mostrarBotonInicio = true,
}: PropsVistaError) {
  const config = CONFIGURACION_ERRORES[tipo] || CONFIGURACION_ERRORES["500"];
  const Icono = config.icono;
  const titulo = tituloPersonalizado || config.titulo;
  const mensaje = mensajePersonalizado || config.mensaje;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 sm:p-10 shadow-2xl transition-colors">
        {/* Badge de código */}
        <div className="flex justify-center mb-6">
          <div
            className={`w-16 h-16 rounded-2xl ${config.fondoIcono} ${config.bordeIcono} border flex items-center justify-center ${config.colorIcono} shadow-inner`}
          >
            <Icono className="w-8 h-8" />
          </div>
        </div>

        {/* Encabezado */}
        <div className="space-y-2 mb-6">
          <div className="text-xs font-mono font-bold tracking-widest uppercase text-zinc-500 dark:text-zinc-400">
            ESTADO // {config.codigo}
          </div>
          <h1 className="texto-anton text-2xl sm:text-3xl text-zinc-900 dark:text-white tracking-wide">
            {titulo}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed font-sans">
            {mensaje}
          </p>
        </div>

        {/* Acciones principales */}
        <div className="space-y-3 font-sans pt-2">
          {alReintentar && (
            <button
              onClick={alReintentar}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold uppercase tracking-wider py-3 px-4 rounded-xl transition-all shadow-md active:scale-98"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reintentar operación</span>
            </button>
          )}

          {tipo === "401" ? (
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold uppercase tracking-wider py-3 px-4 rounded-xl transition-all shadow-md active:scale-98"
            >
              <LogIn className="w-4 h-4" />
              <span>Iniciar Sesión</span>
            </Link>
          ) : (
            <Link
              href={enlaceVolver}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold uppercase tracking-wider py-3 px-4 rounded-xl transition-all shadow-md active:scale-98"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{textoVolver}</span>
            </Link>
          )}

          {mostrarBotonInicio && enlaceVolver !== "/" && (
            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-mono font-semibold py-2.5 px-4 rounded-xl transition-all border border-zinc-200 dark:border-zinc-700"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Página de Inicio</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
