import { NextRequest } from "next/server";
import { autorizar_reclamos, correo_principal, ErrorAdministrativo } from "@/lib/autorizacion";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReclamo } from "@/modelos/Reclamo";
import { validarOperacionReclamo, validarConsultaReclamosR1, validarCreacionReclamoR1, validarCreacionReclamoHeredado,
  serializarResumenCiudadano, serializarDetalleCiudadano, serializarDetalleAdministrativo, serializarReclamoHeredado } from "@/contratos/reclamos";
import { negociarContratoReclamos, leerJsonReclamos, respuestaReclamos, errorReclamos } from "@/lib/http_reclamos";
import { autorizar_ciudadano } from "@/lib/autorizacion_ciudadana";
import { persistirReclamoR1 } from "@/lib/persistencia_reclamos";
import { validar_origen_ciudadano } from "@/lib/http_ciudadano";

/**
 * GET /api/v1/reclamos
 * Consulta de reclamos ciudadanos con filtros opcionales por estado o ruta
 */
export async function GET(peticion: NextRequest) {
  try {
    const actor = await autorizar_reclamos();
    const contrato = negociarContratoReclamos(peticion);
    await conectar_base_datos();
    const { searchParams } = new URL(peticion.url);
    const consultaR1 = contrato === "r1" ? validarConsultaReclamosR1(searchParams) : null;
    const estado = searchParams.get("estado");
    const rutaId = searchParams.get("ruta_id");

    // El filtro se aplica EN MongoDB; nunca se recuperan registros ajenos para filtrarlos en memoria.
    const filtro: Record<string, string> = actor.rol === "ciudadano" ? { ciudadano_id_clerk: actor.usuario.id } : {};
    const id = searchParams.get("id") || searchParams.get("_id");
    if (id) {
      if (!/^[a-fA-F0-9]{24}$/.test(id)) throw new ErrorAdministrativo(400, "Identificador de reclamo inválido");
      filtro._id = id;
    }
    const folio = consultaR1 ? consultaR1.folio : searchParams.get("folio");
    if (folio) filtro.folio = folio;
    if (estado) filtro.estado = estado;
    if (rutaId) filtro.ruta_id = contrato === "r1" ? rutaId.toLowerCase() : rutaId;

    const orden: Record<string, -1> = contrato === "r1"
      ? { fecha_reporte: -1 }
      : { fecha_creacion: -1, fecha_reporte: -1, _id: -1 };
    const reclamos = await ModeloReclamo.find(filtro).sort(orden).limit(100);

    if (contrato === "heredado") {
      const vista = actor.rol === "ciudadano" ? "ciudadana" : "administrativa";
      return respuestaReclamos(reclamos.map(r => serializarReclamoHeredado(r, vista)));
    }
    const serializar = actor.rol !== "ciudadano" ? serializarDetalleAdministrativo
      : id || folio ? serializarDetalleCiudadano : serializarResumenCiudadano;
    return respuestaReclamos(reclamos.map(r => serializar(r)));
  } catch (error: unknown) {
    return errorReclamos(error);
  }
}

/**
 * POST /api/v1/reclamos
 * Registro de un nuevo reclamo ciudadano desde la app móvil o web
 */
export async function POST(peticion: NextRequest) {
  try {
    const actor = await autorizar_reclamos();
    const contrato = negociarContratoReclamos(peticion);
    validar_origen_ciudadano(peticion);
    const entrada = await leerJsonReclamos(peticion);
    if (contrato === "r1") {
      if (actor.rol !== "ciudadano") throw new ErrorAdministrativo(403, "Se requiere una cuenta ciudadana");
      const ciudadano = await autorizar_ciudadano();
      const datos = validarCreacionReclamoR1(entrada);
      const id = validarOperacionReclamo(peticion.headers.get("Idempotency-Key"));
      const resultado = await persistirReclamoR1(ciudadano, datos, id);
      return respuestaReclamos(resultado.acuse, undefined, resultado.nuevo ? 201 : 200);
    }
    await conectar_base_datos();
    const cuerpo = validarCreacionReclamoHeredado(entrada);
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

    const folio = `REC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

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
      fotografia_url: /^file:/i.test(fotografia_url.trim()) ? "" : fotografia_url.trim(),
      ruta_id: ruta_id || null,
      estado: "PENDIENTE",
    });

    return respuestaReclamos(serializarReclamoHeredado(nuevoReclamo, actor.rol === "ciudadano" ? "ciudadana" : "administrativa"), "Reclamo registrado exitosamente en el sistema municipal de Gutiérrez Zamora.");
  } catch (error: unknown) {
    return errorReclamos(error);
  }
}
