"use client";

export class ErrorHttp extends Error {
  public status: number;
  public codigo: string;
  public datos?: any;

  constructor(status: number, mensaje: string, codigo: string = "ERR_HTTP", datos?: any) {
    super(mensaje);
    this.name = "ErrorHttp";
    this.status = status;
    this.codigo = codigo;
    this.datos = datos;
  }
}

interface OpcionesClienteHttp extends RequestInit {
  desactivarRedireccionAuth?: boolean;
}

/**
 * Cliente HTTP seguro para el Frontend de EcoTrack.
 * Intercepta respuestas HTTP y gestiona automáticamente:
 * - 401 (Sesión Expirada): Redirige ordenadamente al inicio de sesión.
 * - 403 (Acceso Denegado): Redirige a la pantalla de permisos insuficientes.
 * - 404 / 500: Extrae mensajes limpios en español y previene caídas por JSON crudo o HTML.
 */
export async function clienteFetch<T = any>(
  input: string | URL | Request,
  opciones: OpcionesClienteHttp = {}
): Promise<T> {
  const { desactivarRedireccionAuth = false, ...init } = opciones;

  let respuesta: Response;
  try {
    respuesta = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (error: any) {
    // Error de red (offline / host inalcanzable)
    console.warn("[clienteFetch] Error de conexión de red:", error.message);
    throw new ErrorHttp(
      0,
      "No fue posible conectar con el servidor. Verifica tu conexión a internet.",
      "ERR_CONEXION_RED"
    );
  }

  // Manejo de códigos de estado de seguridad
  if (respuesta.status === 401 && !desactivarRedireccionAuth) {
    if (typeof window !== "undefined") {
      const rutaActual = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect_url=${encodeURIComponent(rutaActual)}`;
    }
    throw new ErrorHttp(401, "Tu sesión ha expirado. Redirigiendo a inicio de sesión...", "ERR_NO_AUTENTICADO");
  }

  if (respuesta.status === 403 && !desactivarRedireccionAuth) {
    if (typeof window !== "undefined") {
      window.location.href = "/dashboard/acceso-denegado";
    }
    throw new ErrorHttp(403, "No cuentas con privilegios para esta acción.", "ERR_ACCESO_DENEGADO");
  }

  // Parseo seguro del cuerpo de la respuesta
  let datosCuerpo: any = null;
  const tipoContenido = respuesta.headers.get("content-type") || "";

  if (tipoContenido.includes("application/json")) {
    try {
      datosCuerpo = await respuesta.json();
    } catch {
      datosCuerpo = null;
    }
  } else {
    try {
      datosCuerpo = await respuesta.text();
    } catch {
      datosCuerpo = null;
    }
  }

  // Si la respuesta no es 2xx
  if (!respuesta.ok) {
    const mensajeSeguro =
      typeof datosCuerpo === "object" && datosCuerpo !== null
        ? datosCuerpo.mensaje || datosCuerpo.error || "Ocurrió un error al procesar la solicitud."
        : respuesta.status === 404
        ? "El recurso solicitado no fue encontrado."
        : respuesta.status >= 500
        ? "El servidor experimentó un error temporal. Por favor reintenta en breve."
        : "No fue posible completar la operación.";

    const codigo =
      typeof datosCuerpo === "object" && datosCuerpo !== null && datosCuerpo.codigo
        ? datosCuerpo.codigo
        : `ERR_HTTP_${respuesta.status}`;

    throw new ErrorHttp(respuesta.status, mensajeSeguro, codigo, datosCuerpo);
  }

  return datosCuerpo as T;
}
