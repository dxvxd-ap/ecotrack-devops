import { borrador, claveOperacion, consulta } from "@/contratos/avisos";
import { crearAviso, listarAvisosAdmin } from "@/lib/avisos_admin";
import { autorizar_administracion } from "@/lib/autorizacion";
import { leer_json_ciudadano, rechazar_parametros_domicilio, respuesta_ciudadana, respuesta_error_ciudadano, validar_origen_ciudadano } from "@/lib/http_ciudadano";

export async function GET(peticion: Request) {
  try {
    const actor = await autorizar_administracion("avisos:gestionar");
    const entrada = consulta(new URL(peticion.url).searchParams, ["todos", "borrador", "publicado", "retirado"]);
    return respuesta_ciudadana(await listarAvisosAdmin(actor.usuario.id, entrada), "Avisos consultados");
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}

export async function POST(peticion: Request) {
  try {
    const actor = await autorizar_administracion("avisos:gestionar");
    validar_origen_ciudadano(peticion);
    rechazar_parametros_domicilio(peticion);
    const clave = claveOperacion(peticion);
    const entrada = borrador(await leer_json_ciudadano(peticion));
    const resultado = await crearAviso(actor.usuario.id, clave, entrada);
    const respuesta = respuesta_ciudadana(resultado.aviso, "Borrador confirmado", resultado.repetida ? 200 : 201);
    if (resultado.repetida) respuesta.headers.set("Idempotency-Replayed", "true");
    return respuesta;
  } catch (error) {
    return respuesta_error_ciudadano(error);
  }
}
