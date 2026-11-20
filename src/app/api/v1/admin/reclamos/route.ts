import { autorizar_administracion } from '@/lib/autorizacion';
import { validarListado } from '@/contratos/reclamos_admin';
import { negociarContratoReclamos, respuestaReclamos, errorReclamos } from '@/lib/http_reclamos';
import { listarReclamosAdmin } from '@/lib/gestion_reclamos';
export async function GET(peticion: Request) {
  try {
    await autorizar_administracion('reclamos:ver'); negociarContratoReclamos(peticion);
    return respuestaReclamos(await listarReclamosAdmin(validarListado(new URL(peticion.url).searchParams)));
  } catch (error) { return errorReclamos(error); }
}
