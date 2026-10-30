import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
import mongoose from "mongoose";

const MONGODB_URI = "mongodb+srv://22610282_db_user:lyVyeVjseMMAHA2l@clusterecoruta.cgt7pmk.mongodb.net/ecoruta?retryWrites=true&w=majority&appName=ClusterEcoRuta";

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
