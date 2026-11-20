export const dynamic = "force-dynamic";
export const revalidate = 0;
import { identificador, invalido } from "@/contratos/avisos";
import { marcarLectura } from "@/lib/avisos";
import { autorizar_ciudadano } from "@/lib/autorizacion_ciudadana";
import { rechazar_parametros_domicilio, respuesta_ciudadana, respuesta_error_ciudadano, validar_origen_ciudadano } from "@/lib/http_ciudadano";

export async function PUT(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const actor = await autorizar_ciudadano();
    validar_origen_ciudadano(peticion);
    rechazar_parametros_domicilio(peticion);
    if (peticion.body !== null) invalido("La lectura no acepta cuerpo");
    const id = identificador((await contexto.params).id);
    return respuesta_ciudadana(await marcarLectura(actor.usuario.id, id), "Lectura confirmada");
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}
