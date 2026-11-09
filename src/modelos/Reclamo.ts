import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazReclamo extends Document {
  folio: string;
  ciudadano_nombre: string;
  ciudadano_telefono: string;
  ciudadano_email?: string;
  domicilio_referencia: string;
  ubicacion: {
    type: "Point";
    coordinates: [number, number]; // [longitud, latitud]
  };
  tipo_incidencia: "CAMION_NO_PASO" | "HORARIO_IRREGULAR" | "BASURA_TIRADA" | "MALA_ATENCION" | "OTRO";
  descripcion: string;
  fotografia_url?: string;
  ruta_id?: string;
  camion_asignado_id?: mongoose.Types.ObjectId;
  estado: "PENDIENTE" | "EN_REVISION" | "ATENDIDO" | "RECHAZADO";
  solucion_notas?: string;
  fecha_reporte: Date;
  fecha_resolucion?: Date;
}

const EsquemaReclamo = new Schema<InterfazReclamo>(
  {
    folio: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ciudadano_nombre: {
      type: String,
      required: true,
      trim: true,
    },
    ciudadano_telefono: {
      type: String,
      required: true,
      trim: true,
    },
    ciudadano_email: {
      type: String,
      trim: true,
      default: "",
    },
    domicilio_referencia: {
      type: String,
      required: true,
      trim: true,
    },
    ubicacion: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    tipo_incidencia: {
      type: String,
      enum: ["CAMION_NO_PASO", "HORARIO_IRREGULAR", "BASURA_TIRADA", "MALA_ATENCION", "OTRO"],
      default: "CAMION_NO_PASO",
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    fotografia_url: {
      type: String,
      default: "",
    },
    ruta_id: {
      type: String,
      default: null,
    },
    camion_asignado_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      default: null,
    },
    estado: {
      type: String,
      enum: ["PENDIENTE", "EN_REVISION", "ATENDIDO", "RECHAZADO"],
      default: "PENDIENTE",
    },
    solucion_notas: {
      type: String,
      default: "",
    },
    fecha_reporte: {
      type: Date,
      default: Date.now,
    },
    fecha_resolucion: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

EsquemaReclamo.index({ ubicacion: "2dsphere" });

export const ModeloReclamo: Model<InterfazReclamo> =
  mongoose.models.Reclamo || mongoose.model<InterfazReclamo>("Reclamo", EsquemaReclamo);

