import mongoose, { Schema, Document, Model } from "mongoose";

export type OrigenReporte = "ciudadano" | "conductor";

export type TipoReporteCiudadano =
  | "no_paso_camion"
  | "retraso"
  | "basura_acumulada"
  | "otro";

export type TipoReporteConductor =
  | "falla_mecanica"
  | "incidente_vial"
  | "calle_bloqueada"
  | "unidad_llena"
  | "otro";

export type TipoReporte = TipoReporteCiudadano | TipoReporteConductor | string;

export type PrioridadReporte = "baja" | "media" | "alta" | "critica";

export type EstadoReporte = "pendiente" | "en_proceso" | "resuelto";

export interface UbicacionReporte {
  lat: number;
  lng: number;
  direccion?: string;
}

export interface ReportadoPor {
  nombre?: string;
  contacto?: string;
  usuarioId?: string;
}

export interface InterfazReporte extends Document {
  origen: OrigenReporte;
  tipo: TipoReporte;
  titulo: string;
  descripcion: string;
  rutaId?: mongoose.Types.ObjectId | null;
  camionId?: mongoose.Types.ObjectId | null;
  ubicacion: UbicacionReporte;
  prioridad: PrioridadReporte;
  estado: EstadoReporte;
  reportadoPor?: ReportadoPor;
  notasAdmin?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EsquemaReporte = new Schema<InterfazReporte>(
  {
    origen: {
      type: String,
      enum: ["ciudadano", "conductor"],
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    titulo: {
      type: String,
      required: true,
      trim: true,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    rutaId: {
      type: Schema.Types.ObjectId,
      ref: "Ruta",
      required: false,
      default: null,
      index: true,
    },
    camionId: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      required: false,
      default: null,
      index: true,
    },
    ubicacion: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      direccion: { type: String, default: "" },
    },
    prioridad: {
      type: String,
      enum: ["baja", "media", "alta", "critica"],
      default: "media",
      index: true,
    },
    estado: {
      type: String,
      enum: ["pendiente", "en_proceso", "resuelto"],
      default: "pendiente",
      index: true,
    },
    reportadoPor: {
      nombre: { type: String, default: "" },
      contacto: { type: String, default: "" },
      usuarioId: { type: String, default: "" },
    },
    notasAdmin: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const ModeloReporte: Model<InterfazReporte> =
  mongoose.models.Reporte ||
  mongoose.model<InterfazReporte>("Reporte", EsquemaReporte);
