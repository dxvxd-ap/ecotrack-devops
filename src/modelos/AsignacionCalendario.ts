import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazAsignacionCalendario extends Document {
  camion_id?: mongoose.Types.ObjectId | null;
  ruta_id: mongoose.Types.ObjectId;
  fecha: string; // Formato YYYY-MM-DD
  hora_entrada_aprox: string; // Formato HH:MM (ej: "07:00")
  hora_salida_aprox: string; // Formato HH:MM (ej: "15:00")
  estado: "programado" | "en_progreso" | "completado" | "cancelado";
  notas?: string;
  tipo_asignacion?: "base_recurrente" | "excepcion_dia";
  es_anulacion?: boolean;
  motivo_excepcion?: string;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaAsignacionCalendario = new Schema<InterfazAsignacionCalendario>(
  {
    camion_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      required: false,
      default: null,
      index: true,
    },
    ruta_id: {
      type: Schema.Types.ObjectId,
      ref: "Ruta",
      required: true,
      index: true,
    },
    fecha: {
      type: String,
      required: true,
      index: true,
    },
    hora_entrada_aprox: {
      type: String,
      required: true,
      trim: true,
    },
    hora_salida_aprox: {
      type: String,
      required: true,
      trim: true,
    },
    estado: {
      type: String,
      enum: ["programado", "en_progreso", "completado", "cancelado"],
      default: "programado",
      index: true,
    },
    notas: {
      type: String,
      default: "",
    },
    tipo_asignacion: {
      type: String,
      enum: ["base_recurrente", "excepcion_dia"],
      default: "excepcion_dia",
      index: true,
    },
    es_anulacion: {
      type: Boolean,
      default: false,
    },
    motivo_excepcion: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

export const ModeloAsignacionCalendario: Model<InterfazAsignacionCalendario> =
  mongoose.models.AsignacionCalendario ||
  mongoose.model<InterfazAsignacionCalendario>("AsignacionCalendario", EsquemaAsignacionCalendario);

