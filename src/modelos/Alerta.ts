import mongoose, { Schema, Document, Model } from "mongoose";

export type MotivoAlerta =
  | "dia_festivo"
  | "suspension_ruta"
  | "falla_camion"
  | "retraso"
  | "aviso_general";

export type AlcanceAlerta = "todas_las_rutas" | "ruta_especifica";

export interface InterfazAlerta extends Document {
  titulo: string;
  mensaje: string;
  motivo: MotivoAlerta;
  alcance: AlcanceAlerta;
  rutaId?: mongoose.Types.ObjectId | null;
  fechaSuspension?: Date | null;
  enviadosCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const EsquemaAlerta = new Schema<InterfazAlerta>(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
    },
    mensaje: {
      type: String,
      required: true,
      trim: true,
    },
    motivo: {
      type: String,
      enum: ["dia_festivo", "suspension_ruta", "falla_camion", "retraso", "aviso_general"],
      required: true,
      index: true,
    },
    alcance: {
      type: String,
      enum: ["todas_las_rutas", "ruta_especifica"],
      required: true,
      index: true,
    },
    rutaId: {
      type: Schema.Types.ObjectId,
      ref: "Ruta",
      required: false,
      default: null,
      index: true,
    },
    fechaSuspension: {
      type: Date,
      required: false,
      default: null,
    },
    enviadosCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const ModeloAlerta: Model<InterfazAlerta> =
  mongoose.models.Alerta ||
  mongoose.model<InterfazAlerta>("Alerta", EsquemaAlerta);
