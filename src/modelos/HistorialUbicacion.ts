import mongoose, { Schema, Document, Model } from "mongoose";

export interface InterfazHistorialUbicacion extends Document {
  camion_id: mongoose.Types.ObjectId;
  matricula: string;
  imei_gps?: string;
  ubicacion: {
    type: "Point";
    coordinates: [number, number]; // [longitud, latitud]
  };
  velocidad_kmh: number;
  rumbo_grados: number;
  ignicion: boolean;
  bateria_porcentaje?: number;
  origen_dato: "COBAN_TK303F_TCP" | "TRACCAR_WEBHOOK" | "SIMULADOR_GPS" | "APP_MOVIL";
  fecha_hora_gps: Date;
  fecha_registro_servidor: Date;
}

const EsquemaHistorialUbicacion = new Schema<InterfazHistorialUbicacion>(
  {
    camion_id: {
      type: Schema.Types.ObjectId,
      ref: "Camion",
      required: true,
      index: true,
    },
    matricula: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    imei_gps: {
      type: String,
      index: true,
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
    velocidad_kmh: {
      type: Number,
      default: 0,
    },
    rumbo_grados: {
      type: Number,
      default: 0,
    },
    ignicion: {
      type: Boolean,
      default: true,
    },
    bateria_porcentaje: {
      type: Number,
      default: 100,
    },
    origen_dato: {
      type: String,
      enum: ["COBAN_TK303F_TCP", "TRACCAR_WEBHOOK", "SIMULADOR_GPS", "APP_MOVIL"],
      default: "COBAN_TK303F_TCP",
    },
    fecha_hora_gps: {
      type: Date,
      required: true,
      index: true,
    },
    fecha_registro_servidor: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

EsquemaHistorialUbicacion.index({ ubicacion: "2dsphere" });
EsquemaHistorialUbicacion.index({ camion_id: 1, fecha_hora_gps: -1 });

export const ModeloHistorialUbicacion: Model<InterfazHistorialUbicacion> =
  mongoose.models.HistorialUbicacion ||
  mongoose.model<InterfazHistorialUbicacion>("HistorialUbicacion", EsquemaHistorialUbicacion);

