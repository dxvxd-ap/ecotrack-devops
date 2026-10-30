import mongoose from "mongoose";
import dns from "node:dns";

// Configurar DNS público para resolver SRV de MongoDB Atlas en Windows sin bloqueos locales
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignorar si el entorno no permite modificar servidores DNS
}

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Por favor define la variable de entorno MONGODB_URI en .env.local");
}

interface CacheMongoose {
  conexion: typeof mongoose | null;
  promesa: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var cache_mongoose: CacheMongoose | undefined;
}

let en_cache = global.cache_mongoose;

if (!en_cache) {
  en_cache = global.cache_mongoose = { conexion: null, promesa: null };
}

export async function conectar_base_datos(): Promise<typeof mongoose> {
  if (en_cache?.conexion) {
    return en_cache.conexion;
  }

  if (!en_cache?.promesa) {
    const opciones: mongoose.ConnectOptions = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000, // Tiempo límite de 5s para evitar bloqueos si la IP no está en whitelist
    };

    en_cache!.promesa = mongoose.connect(MONGODB_URI as string, opciones).then((mongoose_instancia) => {
      return mongoose_instancia;
    });
  }

  try {
    en_cache!.conexion = await en_cache!.promesa;
  } catch (error) {
    en_cache!.promesa = null;
    throw error;
  }

  return en_cache!.conexion;
}
