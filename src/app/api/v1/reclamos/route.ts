import { NextRequest, NextResponse } from "next/server";
import { autorizar_reclamos, correo_principal, ErrorAdministrativo, respuesta_error_administrativo } from "@/lib/autorizacion";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReclamo } from "@/modelos/Reclamo";

/**
 * GET /api/v1/reclamos
 * Consulta de reclamos ciudadanos con filtros opcionales por estado o ruta
 */
export async function GET(peticion: NextRequest) {
  try {
    const actor = await autorizar_reclamos();
    await conectar_base_datos();
    const { searchParams } = new URL(peticion.url);
    const estado = searchParams.get("estado");
    const rutaId = searchParams.get("ruta_id");

    // El filtro se aplica EN MongoDB; nunca se recuperan registros ajenos para filtrarlos en memoria.
    const filtro: Record<string, string> = actor.rol === "ciudadano" ? { ciudadano_id_clerk: actor.usuario.id } : {};
    const id = searchParams.get("id") || searchParams.get("_id");
    if (id) {
      if (!/^[a-fA-F0-9]{24}$/.test(id)) throw new ErrorAdministrativo(400, "Identificador de reclamo inválido");
      filtro._id = id;
    }
    const folio = searchParams.get("folio");
    if (folio) filtro.folio = folio;
    if (estado) filtro.estado = estado;
    if (rutaId) filtro.ruta_id = rutaId;

    const reclamos = await ModeloReclamo.find(filtro)
      .sort({ fecha_creacion: -1, fecha_reporte: -1, _id: -1 })
      .limit(100);

    return NextResponse.json({
      exito: true,
      datos: reclamos,
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}

/**
 * POST /api/v1/reclamos
 * Registro de un nuevo reclamo ciudadano desde la app móvil o web
 */
export async function POST(peticion: NextRequest) {
  try {
    const actor = await autorizar_reclamos();
    await conectar_base_datos();
    const cuerpo = await peticion.json();
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw new ErrorAdministrativo(400, "Cuerpo de solicitud inválido");
    if (Object.hasOwn(cuerpo, "ciudadano_id_clerk")) throw new ErrorAdministrativo(400, "El propietario lo determina la sesión autenticada");
    const principal = correo_principal(actor.usuario);
    if (!principal || principal.verification?.status !== "verified") throw new ErrorAdministrativo(403, "Se requiere un correo principal verificado");
    const ciudadano_nombre = [actor.usuario.firstName, actor.usuario.lastName].filter(Boolean).join(" ") || "Ciudadano EcoTrack";
    const ciudadano_email = principal.emailAddress.toLowerCase();

    const {
      ciudadano_telefono,
      domicilio_referencia,
      latitud,
      longitud,
      tipo_incidencia,
      descripcion,
      fotografia_url,
      ruta_id,
    } = cuerpo;

    if (!ciudadano_telefono || !domicilio_referencia || latitud === undefined || longitud === undefined) {
      return NextResponse.json(
        { exito: false, mensaje: "Faltan campos obligatorios: teléfono, domicilio y coordenadas." },
        { status: 400 }
      );
    }

    const folio = `REC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    // Sanitizar fotografia_url para rechazar protocolos file:///
    const fotoLimpia = typeof fotografia_url === "string" && !/^file:/i.test(fotografia_url.trim())
      ? fotografia_url.trim()
      : "";

    const nuevoReclamo = await ModeloReclamo.create({
      folio,
      ciudadano_id_clerk: actor.usuario.id,
      ciudadano_nombre,
      ciudadano_telefono,
      ciudadano_email: ciudadano_email || "",
      domicilio_referencia,
      ubicacion: {
        type: "Point",
        coordinates: [Number(longitud), Number(latitud)],
      },
      tipo_incidencia: tipo_incidencia || "CAMION_NO_PASO",
      descripcion: descripcion || "Reporte sin descripción adicional.",
      fotografia_url: fotoLimpia,
      ruta_id: ruta_id || null,
      estado: "PENDIENTE",
    });

    return NextResponse.json({
      exito: true,
      mensaje: "Reclamo registrado exitosamente en el sistema municipal de Gutiérrez Zamora.",
      datos: nuevoReclamo,
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}
