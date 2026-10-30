import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazRuta extends Document {
  id_ruta: string;
  nombre: string;
  descripcion?: string;
  trazado_geojson: {
    type: string;
    coordinates: any;
  };
  color_mapa: string;
  distancia_estimada_km: number;
  duracion_estimada_min: number;
  activa: boolean;
  fecha_creacion: Date;
  fecha_actualizacion: Date;
}

const EsquemaRuta = new Schema<InterfazRuta>(
  {
    id_ruta: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    descripcion: {
      type: String,
      default: "",
    },
    trazado_geojson: {
      type: {
        type: String,
        enum: ["LineString", "MultiLineString", "Polygon", "FeatureCollection"],
        default: "LineString",
      },
      coordinates: {
        type: Schema.Types.Mixed,
        required: true,
      },
    },
    color_mapa: {
      type: String,
      default: "#2f63ff",
    },
    distancia_estimada_km: {
      type: Number,
      default: 0,
    },
    duracion_estimada_min: {
      type: Number,
      default: 0,
    },
    activa: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" },
  }
);

export const ModeloRuta: Model<InterfazRuta> =
  mongoose.models.Ruta || mongoose.model<InterfazRuta>("Ruta", EsquemaRuta);

