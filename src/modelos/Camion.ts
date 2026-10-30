import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazCamion extends Document {
  matricula: string;
  numero_unidad: string;
  modelo: string;
  capacidad_toneladas: number;
  estado: "disponible" | "en_ruta" | "en_mantenimiento" | "fuera_servicio";
  conductor_asignado_id?: mongoose.Types.ObjectId;
  ultima_latitud?: number;
  ultima_longitud?: number;
  ultima_velocidad_kmh?: number;
  ultima_actualizacion_gps?: Date;
  activo: boolean;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaCamion = new Schema<InterfazCamion>(
  {
    matricula: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    numero_unidad: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    modelo: {
      type: String,
      required: true,
      trim: true,
    },
    capacidad_toneladas: {
      type: Number,
      required: true,
      default: 5,
    },
    estado: {
      type: String,
      enum: ["disponible", "en_ruta", "en_mantenimiento", "fuera_servicio"],
      default: "disponible",
    },
    conductor_asignado_id: {
      type: Schema.Types.ObjectId,
      ref: "Conductor",
      default: null,
    },
    ultima_latitud: {
      type: Number,
      default: null,
    },
    ultima_longitud: {
      type: Number,
      default: null,
    },
    ultima_velocidad_kmh: {
      type: Number,
      default: 0,
    },
    ultima_actualizacion_gps: {
      type: Date,
      default: null,
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

export const ModeloCamion: Model<InterfazCamion> =
  mongoose.models.Camion || mongoose.model<InterfazCamion>("Camion", EsquemaCamion);

