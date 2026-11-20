export const dynamic = "force-dynamic";
export const revalidate = 0;
import { resumenAvisos } from "@/lib/avisos";
import { autorizar_ciudadano } from "@/lib/autorizacion_ciudadana";
import { rechazar_parametros_domicilio, respuesta_ciudadana, respuesta_error_ciudadano } from "@/lib/http_ciudadano";

export async function GET(peticion: Request) {
  try {
    const actor = await autorizar_ciudadano();
    rechazar_parametros_domicilio(peticion);
    return respuesta_ciudadana(await resumenAvisos(actor.usuario.id), "Resumen de avisos consultado");
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}
