"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import {
  MapPin,
  Truck,
  Calendar,
  Bell,
  ShieldCheck,
  ArrowRight,
  Gauge,
  Radio,
} from "lucide-react";

export default function PaginaInicio() {
  const { isSignedIn } = useAuth();
  const contenedor_ref = useRef<HTMLDivElement>(null);
  const video_ref = useRef<HTMLVideoElement>(null);

  const [velocidad_kmh, fijar_velocidad_kmh] = useState("00");
  const [asentado, fijar_asentado] = useState(false);
  const [posicion_tira_x, fijar_posicion_tira_x] = useState(100);
  const [posicion_letras_x, fijar_posicion_letras_x] = useState(100);

  useEffect(() => {
    const video = video_ref.current;
    if (!video) return;

    let ultimo_y = window.scrollY;
    let ultimo_tiempo = performance.now();
    let velocidad_suavizada = 0;
    let animacion_id: number;

    const manejar_desplazamiento = () => {
      const y_actual = window.scrollY;
      const tiempo_actual = performance.now();
      const delta_y = Math.abs(y_actual - ultimo_y);
      const delta_t = Math.max(1, tiempo_actual - ultimo_tiempo);

      const velocidad_instantanea = (delta_y / delta_t) * 28;
      velocidad_suavizada += (velocidad_instantanea - velocidad_suavizada) * 0.15;
      const kmh = Math.min(99, Math.round(velocidad_suavizada));
      fijar_velocidad_kmh(kmh < 10 ? `0${kmh}` : `${kmh}`);

      ultimo_y = y_actual;
      ultimo_tiempo = tiempo_actual;

      const altura_ventana = window.innerHeight;
      const A = 2.4; // Viewports para el video
      const B = 2.8; // Viewports para el carrusel de servicios

      // Progreso de video (0 a 1)
      const q = Math.min(1, Math.max(0, y_actual / (A * altura_ventana)));

      if (video.duration) {
        const tiempo_objetivo = q * (video.duration - 0.05);
        if (Math.abs(video.currentTime - tiempo_objetivo) > 0.04) {
          video.currentTime = tiempo_objetivo;
        }
      }

      // Bandera de asentamiento del camión
      const esta_asentado = q >= 0.92;
      fijar_asentado(esta_asentado);

      // Progreso de la tira de servicios (0 a 1)
      const r = Math.min(1, Math.max(0, (y_actual - A * altura_ventana) / (B * altura_ventana)));

      // Desplazamiento horizontal de las letras y la tira
      const letras_px = (1 - r * 1.8) * 100;
      const tira_px = (1 - r * 1.15) * 100;

      fijar_posicion_letras_x(letras_px);
      fijar_posicion_tira_x(tira_px);

      animacion_id = requestAnimationFrame(manejar_desplazamiento);
    };

    animacion_id = requestAnimationFrame(manejar_desplazamiento);

    return () => {
      cancelAnimationFrame(animacion_id);
    };
  }, []);

  return (
    <div ref={contenedor_ref} className="relative bg-white text-zinc-950 font-sans">
      {/* Barra de navegación superior fija en el inicio */}
      <nav className="absolute top-0 left-0 w-full z-40 px-6 md:px-16 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center text-white font-black text-xl shadow-md">
            E
          </div>
          <div>
            <span className="texto-anton text-2xl tracking-tight font-extrabold text-black">
              ECORUTA
            </span>
            <span className="hidden sm:inline-block ml-2 text-[10px] font-mono tracking-wider bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded border border-zinc-200">
              LOGÍSTICA URBANA
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold tracking-wider uppercase font-sans">
          <Link
            href="/ciudadano"
            className="hidden md:inline-flex items-center gap-1.5 text-zinc-600 hover:text-black transition-colors"
          >
            <Radio className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            Portal Ciudadano
          </Link>

          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-black hover:bg-zinc-800 text-white px-4 py-2.5 rounded-full transition-all shadow-sm"
            >
              <span>Panel de Control</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="text-zinc-700 hover:text-black px-3 py-2 transition-colors"
              >
                Ingresar
              </Link>
              <Link
                href="/dashboard"
                className="border border-black hover:bg-black hover:text-white px-4 py-2 rounded-full transition-all"
              >
                Panel Operativo
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Escenario Fijo (Sticky Viewport) que dura todo el scroll */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-white">
        {/* Capa 1: Video scrubbed de la grúa y el camión */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <video
            ref={video_ref}
            muted
            playsInline
            preload="auto"
            poster="https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/2307e4bf-be39-42b4-b579-e168aeccabf0.jpg"
            className="w-full h-full object-cover md:object-contain object-bottom"
          >
            <source
              src="https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/409763c0-95f4-49d3-a601-dc564d55072b.mp4"
              type="video/mp4"
            />
          </video>
        </div>

        {/* Capa 2: Letras gigantes "NUESTROS SERVICIOS" detrás del camión (mix-blend-mode: darken) */}
        <div
          className="absolute left-0 bottom-[44%] w-full overflow-hidden letras-fondo-hero z-10"
          style={{
            transform: `translateX(${posicion_letras_x}%)`,
            transition: "transform 0.05s linear",
          }}
        >
          <div className="texto-anton text-[16vw] md:text-[14vw] leading-none text-[#e2e2e2] whitespace-nowrap pl-6 select-none">
            NUESTROS SERVICIOS
          </div>
        </div>

        {/* Capa 3: Telemetría / Lectura de velocidad (Speed readout) */}
        <div
          className={`absolute top-24 left-6 md:left-16 z-30 transition-opacity duration-500 ${
            asentado ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex items-center gap-2 bg-black/90 backdrop-blur-md text-white px-3.5 py-1.5 rounded-md border border-white/10 shadow-lg">
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
            <span className="texto-mono text-xs tracking-wider">
              {velocidad_kmh} KM/H
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping ml-1" />
          </div>
        </div>

        {/* Capa 4: Banda oscura inferior con tira horizontal de servicios */}
        <div className="absolute left-0 bottom-0 w-full h-[45%] bg-[#111111] z-20 flex items-center overflow-hidden border-t border-zinc-800">
          <div
            className="flex items-center gap-12 md:gap-20 px-8 md:px-20 min-w-max transition-transform duration-75 ease-linear"
            style={{
              transform: `translateX(${posicion_tira_x * 0.7 - 20}%)`,
            }}
          >
            {/* Bloque Principal / Titular */}
            <div className="w-[300px] md:w-[420px] shrink-0 text-white space-y-3">
              <div className="texto-anton text-3xl md:text-5xl leading-tight">
                TODO LO QUE TU CIUDAD NECESITA.{" "}
                <span className="text-blue-500">BAJO UNA SOLA GESTIÓN.</span>
              </div>
              <p className="text-xs md:text-sm text-zinc-400 leading-relaxed font-sans">
                Sistema centralizado de recolección de residuos, optimización de rutas calle por calle y notificación geolocalizada a los ciudadanos en tiempo real.
              </p>
            </div>

            {/* Tarjeta 1: Trazado de Rutas */}
            <div className="w-64 md:w-80 shrink-0 border-l border-white/10 pl-8 space-y-2.5 text-white">
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="texto-anton text-xl tracking-wide text-white">
                Trazado de Rutas
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Editor geográfico interactivo de alta precisión para diseñar y ajustar vértices de recolección calle por calle en MongoDB Atlas.
              </p>
            </div>

            {/* Tarjeta 2: Monitoreo de Flota */}
            <div className="w-64 md:w-80 shrink-0 border-l border-white/10 pl-8 space-y-2.5 text-white">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="texto-anton text-xl tracking-wide text-white">
                Telemetría de Flota
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Asignación estricta 1 a 1 entre operador y camión, con seguimiento de velocidad, estado de carga y ubicación GPS en tiempo real.
              </p>
            </div>

            {/* Tarjeta 3: Calendario Logístico */}
            <div className="w-64 md:w-80 shrink-0 border-l border-white/10 pl-8 space-y-2.5 text-white">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="texto-anton text-xl tracking-wide text-white">
                Calendario Logístico
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Planificación semanal y mensual por turnos, sincronización automática de estado y activación instantánea a estado en progreso.
              </p>
            </div>

            {/* Tarjeta 4: Alertas Ciudadanas */}
            <div className="w-64 md:w-80 shrink-0 border-l border-white/10 pl-8 space-y-2.5 text-white">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Bell className="w-5 h-5" />
              </div>
              <h3 className="texto-anton text-xl tracking-wide text-white">
                Alertas al Ciudadano
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Geocerca espacial vecinal: el ciudadano recibe una alerta push preventiva justo cuando el camión se aproxima a su domicilio.
              </p>
            </div>

            {/* Tarjeta 5: Seguridad RBAC */}
            <div className="w-64 md:w-80 shrink-0 border-l border-white/10 pl-8 space-y-2.5 text-white">
              <div className="w-10 h-10 rounded-lg bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="texto-anton text-xl tracking-wide text-white">
                Roles Dinámicos RBAC
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Control estricto con Clerk y MongoDB: dashboard blindado para administradores y secretarios, con creación dinámica de roles.
              </p>
            </div>
          </div>

          {/* Botón flotante inferior para saltar al dashboard */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-white/20 bg-black/60 backdrop-blur-md text-white text-xs font-mono uppercase tracking-widest hover:border-white transition-all shadow-md"
            >
              <span>Acceder al Sistema</span>
              <ArrowRight className="w-3 h-3 text-blue-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* Riel invisible para generar la altura del scroll (A + B viewports) */}
      <div className="h-[520vh] w-full pointer-events-none" />
    </div>
  );
}

