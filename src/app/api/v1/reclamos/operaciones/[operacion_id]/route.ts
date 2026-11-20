export const dynamic = "force-dynamic";
export const revalidate = 0;
import { autorizar_ciudadano } from "@/lib/autorizacion_ciudadana";
import { validarOperacionReclamo, ErrorReclamo } from "@/contratos/reclamos";
import { negociarContratoReclamos, respuestaReclamos, errorReclamos } from "@/lib/http_reclamos";
import { recuperarAcuseReclamo } from "@/lib/persistencia_reclamos";

export async function GET(peticion: Request, contexto: { params: Promise<{ operacion_id: string }> }) {
  try {
    const actor = await autorizar_ciudadano();
    negociarContratoReclamos(peticion);
    if (new URL(peticion.url).search) throw new ErrorReclamo(400, "ENTRADA_INVALIDA", "Esta consulta no admite filtros");
    const id = validarOperacionReclamo((await contexto.params).operacion_id);
    return respuestaReclamos(await recuperarAcuseReclamo(actor.usuario.id, id));
  } catch (error) { return errorReclamos(error); }
}
