import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazConductor extends Document {
  nombre_completo: string;
  numero_licencia: string;
  licencia?: string;
  telefono: string;
  activo: boolean;
  camion_asignado_id?: mongoose.Types.ObjectId | null;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaConductor = new Schema<InterfazConductor>(
  {
    nombre_completo: {
      type: String,
      required: true,
      trim: true,
    },
    numero_licencia: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    licencia: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
    },
    telefono: {
      type: String,
      required: true,
      trim: true,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    camion_asignado_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      default: null,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
    collection: "conductors",
  }
);

export const ModeloConductor: Model<InterfazConductor> =
  mongoose.models.Conductor ||
  mongoose.model<InterfazConductor>("Conductor", EsquemaConductor, "conductors");
