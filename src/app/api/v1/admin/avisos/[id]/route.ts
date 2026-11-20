export const dynamic = "force-dynamic";
export const revalidate = 0;
import { cambio, claveOperacion, identificador } from "@/contratos/avisos";
import { detalleAviso, editarAviso } from "@/lib/avisos_admin";
import { autorizar_administracion } from "@/lib/autorizacion";
import { leer_json_ciudadano, rechazar_parametros_domicilio, respuesta_ciudadana, respuesta_error_ciudadano, validar_origen_ciudadano } from "@/lib/http_ciudadano";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(peticion: Request, contexto: Contexto) {
  try {
    await autorizar_administracion("avisos:gestionar");
    rechazar_parametros_domicilio(peticion);
    return respuesta_ciudadana(await detalleAviso(identificador((await contexto.params).id)), "Aviso consultado");
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}

export async function PATCH(peticion: Request, contexto: Contexto) {
  try {
    const actor = await autorizar_administracion("avisos:gestionar");
    validar_origen_ciudadano(peticion);
    rechazar_parametros_domicilio(peticion);
    const id = identificador((await contexto.params).id);
    const clave = claveOperacion(peticion);
    const entrada = cambio(await leer_json_ciudadano(peticion));
    const resultado = await editarAviso(actor.usuario.id, id, clave, entrada);
    const respuesta = respuesta_ciudadana(resultado.aviso, "Cambio confirmado");
    if (resultado.repetida) respuesta.headers.set("Idempotency-Replayed", "true");
    return respuesta;
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}
