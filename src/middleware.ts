import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const es_ruta_dashboard = createRouteMatcher(["/dashboard(.*)"]);
const es_ruta_publica = createRouteMatcher([
  "/",
  "/login(.*)",
  "/registro(.*)",
  "/acceso-denegado(.*)",
  "/ciudadano(.*)",
  "/api/publico(.*)",
]);

const ROLES_CON_ACCESO_DASHBOARD = ["superadmin", "admin", "secretario", "moderador"];

// IDs y correos de superadministradores fundadores con acceso garantizado
const IDS_SUPERADMIN = [
  "user_3JzRT8FQJPrqKEfk2QdjZpFaRVN", // ID Clerk de 22610282@utgz.edu.mx
  process.env.SUPERADMIN_USER_ID,
].filter(Boolean);

export default clerkMiddleware(async (auth, peticion) => {
  const { userId, sessionClaims } = await auth();

  // Si intenta acceder al dashboard
  if (es_ruta_dashboard(peticion)) {
    // Si no está autenticado, redirigir al login
    if (!userId) {
      const url_redireccion = new URL("/login", peticion.url);
      url_redireccion.searchParams.set("redirect_url", peticion.url);
      return NextResponse.redirect(url_redireccion);
    }

    // 1. Acceso directo garantizado si es el usuario superadministrador principal
    if (IDS_SUPERADMIN.includes(userId)) {
      return NextResponse.next();
    }

    // 2. Extraer el rol de los metadatos públicos de Clerk
    const metadatos =
      (sessionClaims?.metadata as Record<string, any>) ||
      (sessionClaims?.publicMetadata as Record<string, any>) ||
      (sessionClaims?.public_metadata as Record<string, any>) ||
      {};

    const rol_usuario = (metadatos.rol as string) || "ciudadano";

    // Si el rol no tiene acceso al dashboard, redirigir a acceso denegado
    if (!ROLES_CON_ACCESO_DASHBOARD.includes(rol_usuario.toLowerCase())) {
      const url_denegado = new URL("/acceso-denegado", peticion.url);
      return NextResponse.redirect(url_denegado);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
