import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazAsignacionCalendario extends Document {
  camion_id: mongoose.Types.ObjectId;
  ruta_id: mongoose.Types.ObjectId;
  fecha: string; // Formato YYYY-MM-DD
  hora_entrada_aprox: string; // Formato HH:MM (ej: "07:00")
  hora_salida_aprox: string; // Formato HH:MM (ej: "15:00")
  estado: "programado" | "en_progreso" | "completado" | "cancelado";
  notas?: string;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaAsignacionCalendario = new Schema<InterfazAsignacionCalendario>(
  {
    camion_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      required: true,
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
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

export const ModeloAsignacionCalendario: Model<InterfazAsignacionCalendario> =
  mongoose.models.AsignacionCalendario ||
  mongoose.model<InterfazAsignacionCalendario>("AsignacionCalendario", EsquemaAsignacionCalendario);

