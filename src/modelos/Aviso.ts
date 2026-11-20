import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";
import { audiencias, prioridades, tipos } from "@/contratos/avisos";

const esquema = new Schema({
  _id: { type: String, required: true },
  tipo: { type: String, enum: tipos, required: true },
  audiencia: { type: String, enum: audiencias, required: true },
  ruta_id: { type: String, default: null },
  titulo: { type: String, required: true, maxlength: 120 },
  mensaje: { type: String, required: true, maxlength: 800 },
  prioridad: { type: String, enum: prioridades, required: true },
  vigente_desde: { type: Date, default: null },
  vigente_hasta: { type: Date, default: null },
  publicado_en: { type: Date, default: null },
  creado_en: { type: Date, required: true },
  creado_por: { type: String, required: true, immutable: true },
  publicado_por: { type: String, default: null },
  retirado_por: { type: String, default: null },
  retirado_en: { type: Date, default: null },
  estado: { type: String, enum: ["borrador", "publicado", "retirado"], required: true },
  version: { type: Number, required: true, min: 0 },
  // Respuestas originales de las mutaciones limitadas por la versión editorial.
  operaciones: { type: [Schema.Types.Mixed], default: [], select: false },
}, { strict: "throw", versionKey: false, autoCreate: false, autoIndex: false });
esquema.index({ estado: 1, audiencia: 1, publicado_en: -1, _id: -1 });
esquema.index({ creado_en: -1, _id: -1 });
type Aviso = InferSchemaType<typeof esquema>;
export const ModeloAviso = (mongoose.models.Aviso as Model<Aviso> | undefined) ??
  mongoose.model<Aviso>("Aviso", esquema);
