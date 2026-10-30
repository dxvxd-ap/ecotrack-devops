"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ShieldAlert, ArrowLeft, Radio, Building2 } from "lucide-react";

export default function PaginaAccesoDenegado() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 selection:bg-rose-600">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl relative">
        <div className="absolute top-6 right-6">
          <UserButton />
        </div>

        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h1 className="texto-anton text-2xl tracking-wide text-white mb-2">
          ACCESO AL PANEL RESTRINGIDO
        </h1>

        <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 my-5 text-xs font-mono space-y-1.5 text-zinc-300">
          <div className="flex justify-between">
            <span className="text-zinc-500">ROL ACTUAL:</span>
            <span className="text-amber-400 font-bold uppercase">Ciudadano / Periférico</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">ACCESO DASHBOARD:</span>
            <span className="text-rose-400 font-bold">DENEGADO (RBAC)</span>
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed font-sans mb-6">
          De acuerdo con las directivas de seguridad de <strong>EcoRuta</strong>, todo registro nuevo se asigna como rol <strong>Ciudadano</strong>. El acceso a las herramientas operativas de rutas y logística está reservado para personal autorizado (<em>superadmin, admin, secretario, moderador</em>). Un administrador debe autorizar tu cuenta en el panel.
        </p>

        <div className="space-y-3 font-sans">
          <Link
            href="/ciudadano"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-3 px-4 rounded-xl transition-all shadow-md shadow-blue-900/20"
          >
            <Radio className="w-4 h-4" />
            <span>Ir al Portal de Alertas Ciudadanas</span>
          </Link>

          <Link
            href="/"
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold py-3 px-4 rounded-xl transition-all border border-zinc-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la Página Principal</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

