import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("Configura MONGODB_URI en el entorno antes de ejecutar este script.");

async function testear() {
  console.log("Probando conexión a MongoDB Atlas...");
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    console.log("¡CONEXIÓN EXITOSA A MONGODB ATLAS!");
    const dbs = await mongoose.connection.db.admin().listDatabases();
    console.log("Bases de datos:", dbs.databases.map(d => d.name));
    await mongoose.disconnect();
  } catch (e) {
    console.error("Fallo de conexión:", e.message);
  }
}

testear();
