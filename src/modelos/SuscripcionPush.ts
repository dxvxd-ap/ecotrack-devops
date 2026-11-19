import mongoose, { Schema, Document, Model } from "mongoose";

export type PlataformaDispositivo = "android" | "ios" | "web";

export interface InterfazSuscripcionPush extends Document {
  token: string;
  plataforma: PlataformaDispositivo;
  rutasSuscritas: string[];
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EsquemaSuscripcionPush = new Schema<InterfazSuscripcionPush>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    plataforma: {
      type: String,
      enum: ["android", "ios", "web"],
      default: "android",
      index: true,
    },
    rutasSuscritas: {
      type: [String],
      default: [],
      index: true,
    },
    activo: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ModeloSuscripcionPush: Model<InterfazSuscripcionPush> =
  mongoose.models.SuscripcionPush ||
  mongoose.model<InterfazSuscripcionPush>("SuscripcionPush", EsquemaSuscripcionPush);
