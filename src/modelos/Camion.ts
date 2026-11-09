import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazCamion extends Document {
  matricula: string;
  numero_unidad: string;
  imei_gps?: string;
  modelo: string;
  capacidad_toneladas: number;
  estado: "disponible" | "en_ruta" | "en_mantenimiento" | "fuera_servicio";
  conductor_asignado_id?: mongoose.Types.ObjectId;
  ruta_asignada_id?: string;
  ultima_latitud?: number;
  ultima_longitud?: number;
  ubicacion?: {
    type: "Point";
    coordinates: [number, number]; // [longitud, latitud]
  };
  ultima_velocidad_kmh?: number;
  rumbo_grados?: number;
  bateria_porcentaje?: number;
  estado_ignicion?: boolean;
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
    imei_gps: {
      type: String,
      unique: true,
      sparse: true,
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
    ruta_asignada_id: {
      type: String,
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
    ubicacion: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [-97.1086, 20.4678], // Gutiérrez Zamora por defecto
      },
    },
    ultima_velocidad_kmh: {
      type: Number,
      default: 0,
    },
    rumbo_grados: {
      type: Number,
      default: 0,
    },
    bateria_porcentaje: {
      type: Number,
      default: 100,
    },
    estado_ignicion: {
      type: Boolean,
      default: true,
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

EsquemaCamion.index({ ubicacion: "2dsphere" });

export const ModeloCamion: Model<InterfazCamion> =
  mongoose.models.Camion || mongoose.model<InterfazCamion>("Camion", EsquemaCamion);
