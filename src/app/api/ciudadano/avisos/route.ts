export const dynamic = "force-dynamic";
export const revalidate = 0;
import { consulta } from "@/contratos/avisos";
import { listarAvisos } from "@/lib/avisos";
import { autorizar_ciudadano } from "@/lib/autorizacion_ciudadana";
import { respuesta_ciudadana, respuesta_error_ciudadano } from "@/lib/http_ciudadano";

export async function GET(peticion: Request) {
  try {
    const actor = await autorizar_ciudadano();
    const entrada = consulta(new URL(peticion.url).searchParams);
    return respuesta_ciudadana(await listarAvisos(actor.usuario.id, entrada), "Avisos consultados");
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}
