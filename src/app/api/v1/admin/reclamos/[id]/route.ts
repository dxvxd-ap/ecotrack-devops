export const dynamic = "force-dynamic";
export const revalidate = 0;
import { autorizar_administracion } from '@/lib/autorizacion';
import { idReclamo, entradaInvalida } from '@/contratos/reclamos_admin';
import { negociarContratoReclamos, respuestaReclamos, errorReclamos } from '@/lib/http_reclamos';
import { detalleReclamoAdmin } from '@/lib/gestion_reclamos';
export async function GET(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    await autorizar_administracion('reclamos:ver'); negociarContratoReclamos(peticion);
    if (new URL(peticion.url).search) entradaInvalida();
    return respuestaReclamos(await detalleReclamoAdmin(idReclamo((await contexto.params).id)));
  } catch (error) { return errorReclamos(error); }
}
