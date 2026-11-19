import { NextResponse } from "next/server";
import { ErrorAdministrativo } from "@/lib/autorizacion";
import { ErrorRuta } from "@/contratos/rutas";

export interface RespuestaErrorApi {
  ok: false;
  exito: false;
  codigo: string;
  mensaje: string;
}

/**
 * Manejador centralizado y seguro para capturar errores en endpoints API.
 * Evita cualquier filtración de stack traces, rutas internas o mensajes crudos de base de datos.
 */
export function manejarErrorApi(error: unknown, contexto?: string): NextResponse<RespuestaErrorApi> {
  // 1. Registro seguro en consola del servidor
  const prefijo = contexto ? `[API Error // ${contexto}]` : "[API Error]";
  if (error instanceof Error) {
    console.error(prefijo, `${error.name}: ${error.message}\n${error.stack || ""}`);
  } else {
    console.error(prefijo, "Excepción no tipada:", error);
  }

  // 2. Errores administrativos conocidos (RBAC / Clerk / Bloqueos)
  if (error instanceof ErrorAdministrativo) {
    const status = error.status || 403;
    const codigo = status === 401 ? "ERR_NO_AUTENTICADO" : status === 403 ? "ERR_NO_AUTORIZADO" : "ERR_ADMINISTRATIVO";
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo,
        mensaje: error.message || "Operación no autorizada.",
      },
      { status }
    );
  }

  // 3. Errores de Dominio de Rutas
  if (error instanceof ErrorRuta) {
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: error.codigo || "ERR_RUTA",
        mensaje: error.message || "Error al procesar la ruta.",
      },
      { status: error.status || 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // 4. Errores de Sintaxis JSON
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: "ERR_SOLICITUD_INVALIDA",
        mensaje: "El formato de los datos enviados es inválido (JSON malformado).",
      },
      { status: 400 }
    );
  }

  // 5. Errores de Mongoose / MongoDB
  const mongoErr = error as { name?: string; code?: number };
  if (mongoErr?.code === 11000) {
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: "ERR_CONFLICTO",
        mensaje: "El registro o identificador ya existe en el sistema.",
      },
      { status: 409 }
    );
  }

  if (mongoErr?.name === "ValidationError") {
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: "ERR_DATOS_INVALIDOS",
        mensaje: "Los datos enviados no cumplen con los requisitos de validación.",
      },
      { status: 400 }
    );
  }

  if (mongoErr?.name === "CastError") {
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: "ERR_FORMATO_ID_INVALIDO",
        mensaje: "El identificador proporcionado no tiene una estructura válida.",
      },
      { status: 400 }
    );
  }

  // 6. Errores personalizados con status explícito
  const errorConStatus = error as { status?: number; statusCode?: number; message?: string; codigo?: string };
  const statusPersonalizado = errorConStatus?.status || errorConStatus?.statusCode;
  if (typeof statusPersonalizado === "number" && statusPersonalizado >= 400 && statusPersonalizado < 500) {
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: errorConStatus.codigo || "ERR_SOLICITUD_CLIENTE",
        mensaje: errorConStatus.message || "Solicitud rechazada por el servidor.",
      },
      { status: statusPersonalizado }
    );
  }

  // 7. Error interno por defecto (500) - Sin filtrar detalles técnicos
  return NextResponse.json(
    {
      ok: false,
      exito: false,
      codigo: "ERR_INTERNO_SERVIDOR",
      mensaje: "Ocurrió un error inesperado al procesar la solicitud. Inténtalo de nuevo más tarde.",
    },
    { status: 500 }
  );
}
