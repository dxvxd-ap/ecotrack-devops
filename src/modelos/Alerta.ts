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
  tipo?: string;
  alcance: AlcanceAlerta;
  global?: boolean;
  es_global?: boolean;
  rutaId?: mongoose.Types.ObjectId | string | null;
  ruta_id?: mongoose.Types.ObjectId | string | null;
  fechaSuspension?: Date | null;
  enviadosCount: number;
  activo?: boolean;
  activa?: boolean;
  estado?: string;
  fecha_creacion?: Date;
  fecha_actualizacion?: Date;
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
    tipo: {
      type: String,
      default: function (this: any) {
        return this.motivo || "aviso_general";
      },
    },
    alcance: {
      type: String,
      enum: ["todas_las_rutas", "ruta_especifica"],
      required: true,
      index: true,
    },
    global: {
      type: Boolean,
      default: function (this: any) {
        return this.alcance === "todas_las_rutas";
      },
    },
    es_global: {
      type: Boolean,
      default: function (this: any) {
        return this.alcance === "todas_las_rutas";
      },
    },
    rutaId: {
      type: Schema.Types.ObjectId,
      ref: "Ruta",
      required: false,
      default: null,
      index: true,
    },
    ruta_id: {
      type: Schema.Types.Mixed,
      required: false,
      default: null,
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
    activo: {
      type: Boolean,
      default: true,
    },
    activa: {
      type: Boolean,
      default: true,
    },
    estado: {
      type: String,
      default: "activa",
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
    timestamps: true,
    collection: "alertaciudadano",
  }
);

// Se apunta explícitamente a la colección 'alertaciudadano' compartida con la app móvil ciudadana
export const ModeloAlerta: Model<InterfazAlerta> =
  mongoose.models.Alerta ||
  mongoose.model<InterfazAlerta>("Alerta", EsquemaAlerta, "alertaciudadano");
