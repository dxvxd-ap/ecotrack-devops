export const dynamic = "force-dynamic";
export const revalidate = 0;
import { autorizar_ciudadano, con_ciudadano_bloqueado } from "@/lib/autorizacion_ciudadana";
import { ErrorCiudadano, es_conflicto_persistencia, respuesta_ciudadana,
  respuesta_error_ciudadano, validar_origen_ciudadano } from "@/lib/http_ciudadano";
import { ModeloUsuario } from "@/modelos/Usuario";

export async function POST(peticion: Request) {
  try {
    const actor = await autorizar_ciudadano({ permitir_registro: true });
    validar_origen_ciudadano(peticion);
    return await con_ciudadano_bloqueado(actor, async actual => {
      const { usuario, correo } = actual;
      const nombre = [usuario.firstName, usuario.lastName].filter(Boolean).join(" ") || "Ciudadano EcoTrack";
      return async () => {
        try {
          const resultado = await ModeloUsuario.findOneAndUpdate(
            { id_clerk: usuario.id, rol: "ciudadano", activo: true },
            { $set: { nombre_completo: nombre, correo_electronico: correo, fecha_actualizacion: new Date() },
              $setOnInsert: { rol: "ciudadano", activo: true } },
            { upsert: true, new: true, runValidators: true },
          );
          if (!resultado) throw new ErrorCiudadano(503, "No se pudo verificar la sincronización del perfil", "SINCRONIZACION_INCIERTA");
          return respuesta_ciudadana({ id_clerk: usuario.id, nombre, correo, rol: "ciudadano" }, "Perfil sincronizado");
        } catch (error) {
          if (es_conflicto_persistencia(error)) return respuesta_error_ciudadano(error);
          throw error;
        }
      };
    }, true);
  } catch (error: unknown) {
    return respuesta_error_ciudadano(error);
  }
}
