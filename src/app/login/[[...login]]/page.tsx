import { SignIn } from "@clerk/nextjs";

export default function PaginaIniciarSesion() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-black text-white font-black text-2xl mb-3 shadow">
            E
          </div>
          <h1 className="texto-anton text-2xl tracking-wide text-zinc-900">
            ECOTRACK DASHBOARD
          </h1>
          <p className="text-xs text-zinc-500 font-sans mt-1">
            Plataforma centralizada de gestión logística y rutas
          </p>
        </div>
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/registro"
          fallbackRedirectUrl="/dashboard"
        />
      </div>
    </div>
  );
}

