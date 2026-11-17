import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { autorizar_administracion, permiso_api_administrativa, respuesta_error_administrativo } from "@/lib/autorizacion";

const es_ruta_dashboard = createRouteMatcher(["/dashboard(.*)"]);
export default clerkMiddleware(async (auth, peticion) => {
  const { userId } = await auth();

  const permiso = permiso_api_administrativa(new URL(peticion.url).pathname, peticion.method);
  if (permiso) {
    try {
      await autorizar_administracion(permiso, userId);
      return NextResponse.next();
    } catch (error) {
      return respuesta_error_administrativo(error);
    }
  }

  // Si intenta acceder al dashboard
  if (es_ruta_dashboard(peticion)) {
    // Si no está autenticado, redirigir al login
    if (!userId) {
      const url_redireccion = new URL("/login", peticion.url);
      url_redireccion.searchParams.set("redirect_url", peticion.url);
      return NextResponse.redirect(url_redireccion);
    }

    try {
      await autorizar_administracion("dashboard:ver", userId);
    } catch (error) {
      return respuesta_error_administrativo(error);
    }
  }

  return NextResponse.next();
});

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
