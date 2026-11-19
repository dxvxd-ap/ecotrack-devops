import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Map,
  Calendar,
  Truck,
  Bell,
  Users,
  Radio,
  ExternalLink,
  Shield,
  Layers,
  AlertOctagon,
} from "lucide-react";
import { ProveedorTema } from "@/context/TemaContext";
import { BotonTema } from "@/componentes/dashboard/BotonTema";
import { BadgePendientesReportes } from "@/componentes/dashboard/BadgePendientesReportes";

export default function DisenoDashboard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProveedorTema>
      <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 flex font-sans">
        {/* Barra Lateral Izquierda (Sidebar Utilitaria) */}
        <aside className="w-64 border-r border-zinc-800/80 bg-zinc-900/60 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo y Encabezado */}
          <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-lg">
                E
              </div>
              <div>
                <span className="texto-anton text-lg tracking-wider text-white">
                  ECOTRACK
                </span>
                <span className="block text-[9px] font-mono text-zinc-400 tracking-wider">
                  DASHBOARD OPERATIVO
                </span>
              </div>
            </Link>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Sistema en línea" />
          </div>

          {/* Perfil del Usuario en la parte Superior */}
          <div className="p-3 mx-3 my-2 bg-zinc-950/60 border border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <UserButton />
              <div className="text-[11px] leading-tight">
                <span className="block text-zinc-200 font-semibold">Operador Activo</span>
                <span className="text-zinc-500 font-mono text-[10px]">Dashboard RBAC</span>
              </div>
            </div>
            <Shield className="w-3.5 h-3.5 text-blue-500" />
          </div>

          {/* Menú de Navegación Utilitario */}
          <div className="p-3 space-y-1 text-xs font-mono">
            <div className="px-3 py-2 text-[10px] text-zinc-500 uppercase tracking-widest">
              Logística Central
            </div>

            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4 text-blue-400" />
              <span>Resumen General</span>
            </Link>

            <Link
              href="/dashboard/rutas"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <Map className="w-4 h-4 text-emerald-400" />
              <span>Trazado de Rutas</span>
            </Link>

            <Link
              href="/dashboard/visor-rutas"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <Layers className="w-4 h-4 text-teal-400" />
              <span>Visor de Rutas</span>
            </Link>

            <Link
              href="/dashboard/calendario"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Calendario y Turnos</span>
            </Link>

            <Link
              href="/dashboard/flota"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <Truck className="w-4 h-4 text-cyan-400" />
              <span>Camiones y Conductores</span>
            </Link>

            <div className="px-3 pt-4 pb-2 text-[10px] text-zinc-500 uppercase tracking-widest">
              Supervisión y Seguridad
            </div>

            <Link
              href="/dashboard/reportes"
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span>Reportes e Incidentes</span>
              </div>
              <BadgePendientesReportes />
            </Link>

            <Link
              href="/dashboard/alertas"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <Bell className="w-4 h-4 text-purple-400" />
              <span>Alertas y Notificaciones</span>
            </Link>

            <Link
              href="/dashboard/usuarios"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
            >
              <Users className="w-4 h-4 text-rose-400" />
              <span>Usuarios y Roles RBAC</span>
            </Link>
          </div>
        </div>

        {/* Pie de Barra Lateral */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/40">
          <Link
            href="/ciudadano"
            target="_blank"
            className="flex items-center justify-between text-[11px] font-mono text-zinc-400 hover:text-white p-2.5 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/80 transition-all border border-zinc-800"
          >
            <span className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              Vista Ciudadana
            </span>
            <ExternalLink className="w-3 h-3 text-zinc-500" />
          </Link>
        </div>
      </aside>

      {/* Contenedor Principal de Vistas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header Superior del Dashboard */}
        <header className="h-14 border-b border-zinc-800/80 px-8 flex items-center justify-between shrink-0 bg-zinc-900/40 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="hidden sm:inline">PANEL DE CONTROL</span>
            <span className="text-zinc-600">//</span>
            <span className="text-zinc-300">GUTIÉRREZ ZAMORA, VER.</span>
          </div>

          <div className="flex items-center gap-3">
            <BotonTema />
          </div>
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
    </ProveedorTema>
  );
}

