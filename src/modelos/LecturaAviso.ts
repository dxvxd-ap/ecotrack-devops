import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

const esquema = new Schema({
  _id: { type: String, required: true },
  ciudadano_id_clerk: { type: String, required: true, immutable: true },
  aviso_id: { type: String, required: true, immutable: true },
  leido_en: { type: Date, required: true, immutable: true },
}, { strict: "throw", versionKey: false, autoCreate: false, autoIndex: false });
esquema.index({ ciudadano_id_clerk: 1, aviso_id: 1 }, { unique: true });
type Lectura = InferSchemaType<typeof esquema>;
export const ModeloLecturaAviso = (mongoose.models.LecturaAviso as Model<Lectura> | undefined) ??
  mongoose.model<Lectura>("LecturaAviso", esquema);
