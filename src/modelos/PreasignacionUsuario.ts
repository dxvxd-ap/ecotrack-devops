import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazPreasignacionUsuario extends Document {
  correo_electronico: string;
  nombre_completo: string;
  rol_asignado: string;
  asignado_por_correo?: string;
  completado: boolean;
  fecha_registro_completado?: Date;
  fecha_creacion: Date;
}

const EsquemaPreasignacionUsuario = new Schema<InterfazPreasignacionUsuario>(
  {
    correo_electronico: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    nombre_completo: {
      type: String,
      required: true,
      trim: true,
    },
    rol_asignado: {
      type: String,
      required: true,
      default: "secretario",
      trim: true,
      lowercase: true,
    },
    asignado_por_correo: {
      type: String,
      default: "sistema",
    },
    completado: {
      type: Boolean,
      default: false,
    },
    fecha_registro_completado: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion" },
  }
);

export const ModeloPreasignacionUsuario: Model<InterfazPreasignacionUsuario> =
  mongoose.models.PreasignacionUsuario ||
  mongoose.model<InterfazPreasignacionUsuario>(
    "PreasignacionUsuario",
    EsquemaPreasignacionUsuario
  );

