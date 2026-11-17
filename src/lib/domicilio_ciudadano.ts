import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloDomicilioCiudadano } from "@/modelos/DomicilioCiudadano";
import type { InterfazDomicilioCiudadano } from "@/modelos/DomicilioCiudadano";
import type { AsignacionDomicilio, DomicilioCiudadanoDTO, RegistroDomicilio, ActualizacionDomicilio } from "@/contratos/domicilio";
import { ErrorCiudadano } from "./http_ciudadano";

export function asignacion_pendiente(): Extract<AsignacionDomicilio, { estado: "pendiente" }> {
  return { estado: "pendiente", ruta_id: null, metodo: null, fecha_evaluacion: null,
    version_politica: null, huella_catalogo: null, motivo: null };
}
/** Lee metadatos: jamás crear índices o asumir que unique los instaló. */
export async function verificar_indice_domicilio() {
  const indices = await ModeloDomicilioCiudadano.collection.indexes();
  const existe = indices.some(indice => indice.unique === true && indice.sparse !== true &&
    !indice.partialFilterExpression && Object.keys(indice.key).length === 1 && indice.key.ciudadano_id_clerk === 1);
  if (!existe) throw new ErrorCiudadano(503, "El almacenamiento de domicilios todavía no está habilitado", "INDICE_NO_DISPONIBLE");
}
export async function consultar_domicilio(ciudadano_id_clerk: string) {
  await conectar_base_datos();
  return ModeloDomicilioCiudadano.findOne({ ciudadano_id_clerk });
}
export function serializar_domicilio(domicilio: InterfazDomicilioCiudadano): DomicilioCiudadanoDTO {
  const asignacion = domicilio.asignacion;
  let salida: AsignacionDomicilio;
  if (asignacion.estado === "pendiente") salida = asignacion_pendiente();
  else {
    const evidencia = { fecha_evaluacion: asignacion.fecha_evaluacion.toISOString(),
      version_politica: asignacion.version_politica, huella_catalogo: asignacion.huella_catalogo, motivo: asignacion.motivo };
    salida = asignacion.estado === "asignada"
      ? { ...evidencia, estado: "asignada", ruta_id: asignacion.ruta_id.toHexString(), metodo: asignacion.metodo }
      : { ...evidencia, estado: asignacion.estado, ruta_id: null, metodo: null };
  }
  return { ubicacion: { type: "Point", coordinates: [domicilio.ubicacion.coordinates[0], domicilio.ubicacion.coordinates[1]] },
    tipo_seleccion: domicilio.tipo_seleccion, fecha_confirmacion: domicilio.fecha_confirmacion.toISOString(),
    fecha_creacion: domicilio.fecha_creacion.toISOString(), fecha_actualizacion: domicilio.fecha_actualizacion.toISOString(),
    version: domicilio.version, asignacion: salida };
}
/** Validar antes de devolver la función escritora permite liberar bloqueos tras rechazos sin efectos. */
export async function preparar_guardado_domicilio(propietario: string, entrada: RegistroDomicilio | ActualizacionDomicilio,
  actualizar: boolean): Promise<() => Promise<DomicilioCiudadanoDTO>> {
  await conectar_base_datos();
  await verificar_indice_domicilio();
  const existente = await consultar_domicilio(propietario);
  if (!actualizar && existente) throw new ErrorCiudadano(409, "Ya tienes un domicilio registrado", "DOMICILIO_EXISTENTE");
  if (actualizar && !existente) throw new ErrorCiudadano(404, "Todavía no tienes un domicilio registrado", "DOMICILIO_NO_ENCONTRADO");
  if (actualizar && existente && (!Object.hasOwn(entrada, "version") || existente.version !== (entrada as ActualizacionDomicilio).version)) {
    throw new ErrorCiudadano(409, "El domicilio cambió; consulta la versión actual", "VERSION_CONFLICTIVA");
  }
  const domicilio = existente || new ModeloDomicilioCiudadano({ ciudadano_id_clerk: propietario });
  domicilio.ubicacion = { type: "Point", coordinates: [entrada.longitud, entrada.latitud] };
  domicilio.tipo_seleccion = entrada.tipo_seleccion;
  domicilio.fecha_confirmacion = new Date();
  domicilio.asignacion = asignacion_pendiente();
  if (existente) domicilio.$where = { ciudadano_id_clerk: propietario };
  await domicilio.validate();
  return async () => { await domicilio.save(); return serializar_domicilio(domicilio); };
}
