import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazHistorialAlerta extends Document {
  ciudadano_id: string;
  camion_id: mongoose.Types.ObjectId;
  ruta_id: mongoose.Types.ObjectId;
  mensaje: string;
  distancia_metros: number;
  leido: boolean;
  fecha_envio: Date;
}

const EsquemaHistorialAlerta = new Schema<InterfazHistorialAlerta>(
  {
    ciudadano_id: {
      type: String,
      required: true,
      index: true,
    },
    camion_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      required: true,
    },
    ruta_id: {
      type: Schema.Types.ObjectId,
      ref: "Ruta",
      required: true,
    },
    mensaje: {
      type: String,
      required: true,
      default: "El camión de basura está cerca de tu zona o está a punto de pasar.",
    },
    distancia_metros: {
      type: Number,
      required: true,
    },
    leido: {
      type: Boolean,
      default: false,
    },
    fecha_envio: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ModeloHistorialAlerta: Model<InterfazHistorialAlerta> =
  mongoose.models.HistorialAlerta ||
  mongoose.model<InterfazHistorialAlerta>("HistorialAlerta", EsquemaHistorialAlerta);

