import { autorizar_administracion } from '@/lib/autorizacion';
import { idReclamo, validarAtencion, entradaInvalida } from '@/contratos/reclamos_admin';
import { validarOperacionReclamo } from '@/contratos/reclamos';
import { negociarContratoReclamos, leerJsonReclamos, respuestaReclamos, errorReclamos } from '@/lib/http_reclamos';
import { validar_origen_ciudadano } from '@/lib/http_ciudadano';
import { atenderReclamoAdmin } from '@/lib/gestion_reclamos';
export async function POST(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const actor = await autorizar_administracion('reclamos:gestionar'); negociarContratoReclamos(peticion);
    validar_origen_ciudadano(peticion); if (new URL(peticion.url).search) entradaInvalida();
    const id = idReclamo((await contexto.params).id);
    const clave = validarOperacionReclamo(peticion.headers.get('Idempotency-Key'));
    const entrada = validarAtencion(await leerJsonReclamos(peticion));
    const r = await atenderReclamoAdmin(actor,id,entrada,clave);
    return respuestaReclamos(r.resultado,undefined,r.nuevo ? 201 : 200);
  } catch (error) { return errorReclamos(error); }
}
