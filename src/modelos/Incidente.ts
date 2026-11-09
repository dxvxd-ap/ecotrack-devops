import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazIncidente extends Document {
  folio: string;
  camion_id: mongoose.Types.ObjectId;
  matricula_camion: string;
  conductor_nombre: string;
  tipo: "TRAFICO" | "FALLA_MECANICA" | "TIEMPO_DESCANSO" | "IMPREVISTO_OTRO";
  descripcion?: string;
  ubicacion: {
    type: "Point";
    coordinates: [number, number]; // [longitud, latitud]
  };
  gravedad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  estado: "ACTIVO" | "EN_ATENCION" | "RESUELTO";
  fecha_inicio: Date;
  fecha_resolucion?: Date;
}

const EsquemaIncidente = new Schema<InterfazIncidente>(
  {
    folio: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    camion_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      required: true,
    },
    matricula_camion: {
      type: String,
      required: true,
      trim: true,
    },
    conductor_nombre: {
      type: String,
      required: true,
      trim: true,
    },
    tipo: {
      type: String,
      enum: ["TRAFICO", "FALLA_MECANICA", "TIEMPO_DESCANSO", "IMPREVISTO_OTRO"],
      required: true,
    },
    descripcion: {
      type: String,
      default: "",
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
    gravedad: {
      type: String,
      enum: ["BAJA", "MEDIA", "ALTA", "CRITICA"],
      default: "MEDIA",
    },
    estado: {
      type: String,
      enum: ["ACTIVO", "EN_ATENCION", "RESUELTO"],
      default: "ACTIVO",
    },
    fecha_inicio: {
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

EsquemaIncidente.index({ ubicacion: "2dsphere" });

export const ModeloIncidente: Model<InterfazIncidente> =
  mongoose.models.Incidente || mongoose.model<InterfazIncidente>("Incidente", EsquemaIncidente);

