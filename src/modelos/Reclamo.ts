import type { EventoAtencion } from "@/contratos/reclamos_admin";
import type { AcuseReclamoR1 } from "@/contratos/reclamos";
import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazReclamo extends Document {
  version_atencion?: number;
  respuesta_publica?: string;
  historial_atencion?: EventoAtencion[];
  ciudadano_id_clerk?: string;
  folio: string;
  ciudadano_nombre: string;
  ciudadano_telefono?: string;
  contrato_creacion?: "reclamos-r1";
  origen_ubicacion?: "manual" | "gps" | "domicilio";
  operacion?: { id: string; hash: string; normalizacion_version: number; acuse: AcuseReclamoR1 };
  ciudadano_email?: string;
  domicilio_referencia: string;
  ubicacion: {
    type: "Point";
    coordinates: [number, number]; // [longitud, latitud]
  };
  tipo_incidencia: "CAMION_NO_PASO" | "HORARIO_IRREGULAR" | "BASURA_TIRADA" | "MALA_ATENCION" | "OTRO";
  descripcion: string;
  fotografia_url?: string;
  ruta_id?: string;
  camion_asignado_id?: mongoose.Types.ObjectId;
  estado: "PENDIENTE" | "EN_REVISION" | "ATENDIDO" | "RECHAZADO";
  solucion_notas?: string;
  fecha_reporte: Date;
  fecha_resolucion?: Date;
}

const EsquemaAcuse = new Schema({
  id: { type: String, required: true, immutable: true }, folio: { type: String, required: true, immutable: true },
  recibido_en: { type: String, required: true, immutable: true }, estado_inicial: { type: String, enum: ["PENDIENTE"], required: true, immutable: true },
}, { _id: false });
const EsquemaOperacion = new Schema({
  id: { type: String, required: true, immutable: true }, hash: { type: String, required: true, immutable: true },
  normalizacion_version: { type: Number, enum: [1], required: true, immutable: true },
  acuse: { type: EsquemaAcuse, required: true, immutable: true },
}, { _id: false });

const EsquemaEventoAtencion = new Schema({
  id: { type: String, required: true, immutable: true },
  funcionario_id_clerk: { type: String, required: true, immutable: true },
  funcionario_nombre: { type: String, required: true, immutable: true },
  funcionario_rol: { type: String, enum: ["admin", "superadmin"], required: true, immutable: true },
  accion: { type: String, enum: ["CAMBIAR_ESTADO", "RESPONDER", "AGREGAR_NOTA"], required: true, immutable: true },
  estado_anterior: { type: String, required: true, immutable: true }, estado_nuevo: { type: String, required: true, immutable: true },
  fecha: { type: String, required: true, immutable: true }, version: { type: Number, required: true, immutable: true },
  respuesta_publica: { type: String, default: null, immutable: true }, nota_interna: { type: String, default: null, immutable: true },
  idempotencia: { type: new Schema({ id: String, hash: String, normalizacion_version: Number }, { _id: false }), required: true, immutable: true },
}, { _id: false });

const EsquemaReclamo = new Schema<InterfazReclamo>(
  {
    version_atencion: { type: Number, min: 0 },
    respuesta_publica: { type: String },
    historial_atencion: { type: [EsquemaEventoAtencion], default: undefined },
    contrato_creacion: { type: String, enum: ["reclamos-r1"], immutable: true },
    origen_ubicacion: { type: String, enum: ["manual", "gps", "domicilio"] },
    operacion: { type: EsquemaOperacion, immutable: true, required: function () { return this.contrato_creacion === "reclamos-r1"; } },
    // Opcional: los históricos permanecen sin propietario, sin atribución por correo.
    ciudadano_id_clerk: { type: String, index: true, immutable: true },
    folio: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ciudadano_nombre: {
      type: String,
      required: true,
      trim: true,
    },
    ciudadano_telefono: {
      type: String,
      required: function () { return this.contrato_creacion !== "reclamos-r1"; },
      trim: true,
    },
    ciudadano_email: {
      type: String,
      trim: true,
      default: "",
    },
    domicilio_referencia: {
      type: String,
      required: true,
      trim: true,
    },
    ubicacion: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    tipo_incidencia: {
      type: String,
      enum: ["CAMION_NO_PASO", "HORARIO_IRREGULAR", "BASURA_TIRADA", "MALA_ATENCION", "OTRO"],
      default: "CAMION_NO_PASO",
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    fotografia_url: {
      type: String,
      default: "",
    },
    ruta_id: {
      type: String,
      default: null,
    },
    camion_asignado_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      default: null,
    },
    estado: {
      type: String,
      enum: ["PENDIENTE", "EN_REVISION", "ATENDIDO", "RECHAZADO"],
      default: "PENDIENTE",
    },
    solucion_notas: {
      type: String,
      default: "",
    },
    fecha_reporte: {
      type: Date,
      default: Date.now,
    },
    fecha_resolucion: {
      type: Date,
      default: null,
    },
  },
  {
    // Solo este modelo: la preparación de índices/colección es una operación explícita.
    autoIndex: false,
    autoCreate: false,
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

EsquemaReclamo.index({ ubicacion: "2dsphere" });

export const ModeloReclamo: Model<InterfazReclamo> =
  mongoose.models.Reclamo || mongoose.model<InterfazReclamo>("Reclamo", EsquemaReclamo);

