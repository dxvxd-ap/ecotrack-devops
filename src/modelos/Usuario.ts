import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazUsuario extends Document {
  id_clerk: string;
  nombre_completo: string;
  correo_electronico: string;
  rol: string;
  activo: boolean;
  telefono?: string;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaUsuario = new Schema<InterfazUsuario>(
  {
    id_clerk: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    nombre_completo: {
      type: String,
      required: true,
      trim: true,
    },
    correo_electronico: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    rol: {
      type: String,
      required: true,
      default: "ciudadano",
      index: true,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    telefono: {
      type: String,
      default: "",
    },
    fecha_creacion: {
      type: Date,
      default: Date.now,
    },
    fecha_actualizacion: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

export const ModeloUsuario: Model<InterfazUsuario> =
  mongoose.models.Usuario || mongoose.model<InterfazUsuario>("Usuario", EsquemaUsuario);

