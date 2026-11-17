import { autorizar_ciudadano } from '@/lib/autorizacion_ciudadana';
import { ErrorCiudadano, leer_json_ciudadano, rechazar_parametros_domicilio,
  respuesta_ciudadana, respuesta_error_ciudadano, validar_origen_ciudadano } from '@/lib/http_ciudadano';
import { validarConsultaDireccion } from '@/contratos/direccion_aproximada';
import { ErrorGeocodificacion, geocodificadorGeoapify } from '@/lib/geoapify_servidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function metodoNoPermitido() {
  const r = respuesta_error_ciudadano(new ErrorCiudadano(405, 'Solo se permite POST', 'METODO_NO_PERMITIDO'));
  r.headers.set('Allow', 'POST');
  return r;
}
export const GET = metodoNoPermitido;
export const PUT = metodoNoPermitido;
export const PATCH = metodoNoPermitido;
export const DELETE = metodoNoPermitido;
export const HEAD = metodoNoPermitido;
export const OPTIONS = metodoNoPermitido;

export async function POST(peticion: Request) {
  if (peticion.method !== 'POST') return metodoNoPermitido();
  try {
    const actor = await autorizar_ciudadano();
    validar_origen_ciudadano(peticion);
    rechazar_parametros_domicilio(peticion);
    const cuerpo = await leer_json_ciudadano(peticion);
    let punto;
    try { punto = validarConsultaDireccion(cuerpo); }
    catch { throw new ErrorCiudadano(400, 'Se requieren latitud, longitud y confirmada: true, sin campos adicionales', 'ENTRADA_INVALIDA'); }
    const datos = await geocodificadorGeoapify.consultar(actor.usuario.id, punto);
    return respuesta_ciudadana(datos, datos.direccion ? 'Dirección aproximada consultada' : 'No se encontró una dirección para el punto');
  } catch (error) {
    if (error instanceof ErrorGeocodificacion) {
      const r = respuesta_error_ciudadano(new ErrorCiudadano(error.status, error.message, error.codigo));
      if (error.reintentarEn) r.headers.set('Retry-After', String(error.reintentarEn));
      return r;
    }
    return respuesta_error_ciudadano(error);
  }
}
