const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(".env.local") });

async function migrar() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI no definida en .env.local");
    process.exit(1);
  }

  console.log("Conectando a MongoDB Atlas...");
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const alertas = await db.collection("alertas").find({}).toArray();
  console.log(`Encontradas ${alertas.length} alertas en la colección 'alertas'.`);

  const colDestino = db.collection("alertaciudadano");

  for (const doc of alertas) {
    const esGlobal = doc.alcance === "todas_las_rutas";
    const docNormalizado = {
      ...doc,
      tipo: doc.motivo || "aviso_general",
      motivo: doc.motivo || "aviso_general",
      alcance: doc.alcance || (esGlobal ? "todas_las_rutas" : "ruta_especifica"),
      global: esGlobal,
      es_global: esGlobal,
      ruta_id: doc.rutaId || null,
      rutaId: doc.rutaId || null,
      fechaSuspension: doc.fechaSuspension || null,
      enviadosCount: doc.enviadosCount ?? 0,
      activo: true,
      activa: true,
      estado: "activa",
      fecha_creacion: doc.createdAt || doc.fecha_creacion || new Date(),
      fecha_actualizacion: doc.updatedAt || doc.fecha_actualizacion || new Date(),
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date(),
    };

    await colDestino.updateOne(
      { _id: doc._id },
      { $set: docNormalizado },
      { upsert: true }
    );
    console.log(`✔ Migrada alerta [${doc._id}]: "${doc.titulo}"`);
  }

  const conteoDestino = await colDestino.countDocuments();
  console.log(`\nColección 'alertaciudadano' cuenta ahora con ${conteoDestino} documentos.`);

  await mongoose.disconnect();
  console.log("Desconectado de MongoDB.");
}

migrar().catch((err) => {
  console.error("Error durante migración:", err);
  process.exit(1);
});
