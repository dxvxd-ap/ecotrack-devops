import { autorizar_ciudadano, con_ciudadano_bloqueado } from "@/lib/autorizacion_ciudadana";
import { consultar_domicilio, preparar_guardado_domicilio, serializar_domicilio } from "@/lib/domicilio_ciudadano";
import { validarRegistroDomicilio, validarActualizacionDomicilio } from "@/contratos/domicilio";
import { ErrorCiudadano, es_conflicto_persistencia, leer_json_ciudadano, rechazar_parametros_domicilio,
  respuesta_ciudadana, respuesta_error_ciudadano, validar_origen_ciudadano } from "@/lib/http_ciudadano";

export async function GET(peticion: Request) {
  try {
    const actor = await autorizar_ciudadano();
    rechazar_parametros_domicilio(peticion);
    const domicilio = await consultar_domicilio(actor.usuario.id);
    return respuesta_ciudadana(domicilio ? serializar_domicilio(domicilio) : null, "Domicilio consultado");
  } catch (error) { return respuesta_error_ciudadano(error); }
}
async function guardar(peticion: Request, actualizar: boolean) {
  try {
    const actor = await autorizar_ciudadano();
    validar_origen_ciudadano(peticion);
    rechazar_parametros_domicilio(peticion);
    const cuerpo = await leer_json_ciudadano(peticion);
    let entrada;
    try { entrada = actualizar ? validarActualizacionDomicilio(cuerpo) : validarRegistroDomicilio(cuerpo); }
    catch { throw new ErrorCiudadano(400, "Datos de domicilio inválidos o campos no permitidos", "ENTRADA_INVALIDA"); }
    return await con_ciudadano_bloqueado(actor, async actual => {
      const escribir = await preparar_guardado_domicilio(actual.usuario.id, entrada, actualizar);
      return async () => {
        try { return respuesta_ciudadana(await escribir(), actualizar ? "Domicilio actualizado" : "Domicilio registrado", actualizar ? 200 : 201); }
        catch (error) {
          // Duplicados y CAS fallidos no escribieron: no dejar un bloqueo huérfano.
          if (es_conflicto_persistencia(error)) return respuesta_error_ciudadano(error);
          throw error;
        }
      };
    });
  } catch (error) { return respuesta_error_ciudadano(error); }
}
export async function POST(peticion: Request) { return guardar(peticion, false); }
export async function PUT(peticion: Request) { return guardar(peticion, true); }
