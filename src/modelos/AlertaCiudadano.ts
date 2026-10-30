import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazAlertaCiudadano extends Document {
  ciudadano_id: string; // ID de Clerk
  nombre_ciudadano: string;
  correo_ciudadano: string;
  etiqueta_zona: string; // Ej: "Mi Domicilio", "Local Comercial"
  direccion_texto: string;
  latitud: number;
  longitud: number;
  radio_cobertura_metros: number;
  ruta_preferida_id?: mongoose.Types.ObjectId;
  notificaciones_habilitadas: boolean;
  ultima_notificacion_enviada?: Date;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaAlertaCiudadano = new Schema<InterfazAlertaCiudadano>(
  {
    ciudadano_id: {
      type: String,
      required: true,
      index: true,
    },
    nombre_ciudadano: {
      type: String,
      required: true,
      trim: true,
    },
    correo_ciudadano: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    etiqueta_zona: {
      type: String,
      required: true,
      default: "Mi Domicilio",
      trim: true,
    },
    direccion_texto: {
      type: String,
      required: true,
      trim: true,
    },
    latitud: {
      type: Number,
      required: true,
    },
    longitud: {
      type: Number,
      required: true,
    },
    radio_cobertura_metros: {
      type: Number,
      default: 400, // Radio estándar de 400 metros
    },
    ruta_preferida_id: {
      type: Schema.Types.ObjectId,
      ref: "Ruta",
      default: null,
    },
    notificaciones_habilitadas: {
      type: Boolean,
      default: true,
    },
    ultima_notificacion_enviada: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

export const ModeloAlertaCiudadano: Model<InterfazAlertaCiudadano> =
  mongoose.models.AlertaCiudadano ||
  mongoose.model<InterfazAlertaCiudadano>("AlertaCiudadano", EsquemaAlertaCiudadano);

