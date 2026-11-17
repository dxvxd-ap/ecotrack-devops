import mongoose, { Schema, Document, Model, Types } from "mongoose";
import {
  ESTADOS_ASIGNACION_DOMICILIO, esVersionDomicilio, sonCoordenadasDomicilio,
} from "../contratos/domicilio";
import type { AsignacionDomicilio, PuntoDomicilio, TipoSeleccionDomicilio } from "../contratos/domicilio";

export interface InterfazDomicilioCiudadano extends Document {
  ciudadano_id_clerk: string;
  ubicacion: PuntoDomicilio;
  tipo_seleccion: TipoSeleccionDomicilio;
  fecha_confirmacion: Date;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
  version: number;
  asignacion: AsignacionDomicilio<Types.ObjectId, Date>;
}

// El esquema conserva valores unknown hasta validarlos; la interfaz pública usa la tupla numérica.
const EsquemaPunto = new Schema({
  type: { type: String, enum: ["Point"], required: true },
  // Elementos Mixed conservan tipos originales; el array Mongoose detecta ediciones.
  coordinates: { type: [Schema.Types.Mixed], default: undefined, required: true,
    set: (valor: unknown) => {
      if (!sonCoordenadasDomicilio(valor)) throw new Error("Coordenadas GeoJSON inválidas");
      return valor;
    }, validate: {
    validator: sonCoordenadasDomicilio, message: "Se requieren [longitud, latitud] numéricas, finitas y dentro de rango",
  } },
}, { _id: false, strict: "throw" });

const EsquemaAsignacion = new Schema({
  estado: { type: String, enum: ESTADOS_ASIGNACION_DOMICILIO, required: true, default: "pendiente" },
  ruta_id: { type: Schema.Types.ObjectId, ref: "Ruta", default: null },
  metodo: { type: String, enum: ["cobertura_oficial", "revision_administrativa", null], default: null },
  fecha_evaluacion: { type: Date, default: null },
  version_politica: { type: String, default: null },
  huella_catalogo: { type: String, default: null },
  motivo: { type: String, default: null },
}, { _id: false, strict: "throw" });

function asignacionValida(asignacion: AsignacionDomicilio<Types.ObjectId, Date> | null): boolean {
  if (!asignacion || !ESTADOS_ASIGNACION_DOMICILIO.includes(asignacion.estado)) return false;
  const evidencia = [asignacion.version_politica, asignacion.huella_catalogo, asignacion.motivo];
  const fechaValida = asignacion.fecha_evaluacion instanceof Date && Number.isFinite(asignacion.fecha_evaluacion.getTime());
  const camposSinRuta = asignacion.ruta_id === null && asignacion.metodo === null;
  return asignacion.estado === "pendiente"
    ? camposSinRuta && asignacion.fecha_evaluacion === null && evidencia.every(valor => valor === null)
    : fechaValida && evidencia.every(valor => typeof valor === "string" && valor.trim().length > 0) &&
      (asignacion.estado === "asignada"
        ? asignacion.ruta_id instanceof Types.ObjectId &&
          (asignacion.metodo === "cobertura_oficial" || asignacion.metodo === "revision_administrativa")
        : camposSinRuta);
}

// Mongoose puede validar solo las rutas hijas modificadas de un subdocumento.
// Cada campo verifica la asignación completa, también en validateSync().
EsquemaAsignacion.eachPath((nombre, campo) => {
  if (nombre !== "estado") campo.set((valor: unknown) => valor === undefined ? null : valor);
  campo.validate(function (this: AsignacionDomicilio<Types.ObjectId, Date>) {
    return asignacionValida(this);
  }, "Estado de asignación incompatible con ruta, método o evidencia");
});

const EsquemaDomicilioCiudadano = new Schema<InterfazDomicilioCiudadano>({
  // Solo el futuro servicio autorizado podrá proporcionar este valor; no es entrada del cliente.
  ciudadano_id_clerk: { type: String, required: true, unique: true, index: true, immutable: true,
    set: (valor: unknown) => {
      if (typeof valor !== "string" || !/^user_[a-zA-Z0-9_]+$/.test(valor)) throw new Error("Identificador Clerk inválido");
      return valor;
    } },
  ubicacion: { type: EsquemaPunto, required: true },
  tipo_seleccion: { type: String, enum: ["gps", "manual"], required: true },
  fecha_confirmacion: { type: Date, required: true },
  fecha_creacion: { type: Date, default: Date.now, immutable: true },
  fecha_actualizacion: { type: Date, default: Date.now },
  version: { type: Number, required: true, default: 0,
    set: (valor: unknown) => {
      if (!esVersionDomicilio(valor)) throw new Error("Versión de domicilio inválida");
      return valor;
    }, validate: {
      validator: function (this: InterfazDomicilioCiudadano, valor: unknown) {
        return esVersionDomicilio(valor) && valor < Number.MAX_SAFE_INTEGER &&
          (this.isNew ? valor === 0 : !this.isModified("version"));
      }, message: "La versión debe comenzar en cero, no estar agotada y solo incrementarse mediante save()",
    } },
  asignacion: { type: EsquemaAsignacion, required: true, default: () => ({ estado: "pendiente" }),
    validate: { validator: asignacionValida, message: "Estado de asignación incompatible con ruta, método o evidencia" } },
}, {
  timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  versionKey: "version",
  optimisticConcurrency: true,
  strict: "throw",
  // Declarar el modelo no debe crear colecciones/índices en una BD real.
  autoCreate: false,
  autoIndex: false,
});

// Las actualizaciones parciales no ejecutan validación de documento ni CAS de save().
EsquemaDomicilioCiudadano.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"],
  function () { throw new Error("Actualizar el documento completo con save() y control de versión"); },
);
EsquemaDomicilioCiudadano.pre("bulkWrite", function () {
  throw new Error("Actualizar el documento completo con save() y control de versión");
});

export const ModeloDomicilioCiudadano: Model<InterfazDomicilioCiudadano> =
  mongoose.models.DomicilioCiudadano ||
  mongoose.model<InterfazDomicilioCiudadano>("DomicilioCiudadano", EsquemaDomicilioCiudadano);
