import mongoose, { Schema } from "mongoose";

// _id tiene índice único nativo. Sin TTL: un proceso interrumpido no debe
// permitir que otra instancia escriba mientras una petición a Clerk sigue viva.
const EsquemaBloqueoAdministrativo = new Schema({
  _id: { type: String, required: true },
  fecha_creacion: { type: Date, default: Date.now },
});

export const ModeloBloqueoAdministrativo = mongoose.models.BloqueoAdministrativo ||
  mongoose.model("BloqueoAdministrativo", EsquemaBloqueoAdministrativo);
