import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazRol extends Document {
  nombre: string;
  descripcion: string;
  acceso_dashboard: boolean;
  es_sistema: boolean;
  permisos: string[];
  fecha_creacion: Date;
}

const EsquemaRol = new Schema<InterfazRol>(
  {
    nombre: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    descripcion: {
      type: String,
      required: true,
    },
    acceso_dashboard: {
      type: Boolean,
      default: false,
    },
    es_sistema: {
      type: Boolean,
      default: false,
    },
    permisos: {
      type: [String],
      default: [],
    },
    fecha_creacion: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const ModeloRol: Model<InterfazRol> =
  mongoose.models.Rol || mongoose.model<InterfazRol>("Rol", EsquemaRol);

