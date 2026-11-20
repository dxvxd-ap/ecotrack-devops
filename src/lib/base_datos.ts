import mongoose from "mongoose";
import dns from "node:dns";

// Configurar DNS público para resolver SRV de MongoDB Atlas en Windows sin bloqueos locales
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignorar si el entorno no permite modificar servidores DNS
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error("Por favor define la variable de entorno MONGODB_URI (o MONGO_URI) en .env.local");
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

/**
 * Registro explícito de todos los esquemas y modelos en el registro global de Mongoose.
 * En entornos Serverless de Vercel (Next.js App Router lambdas), previene el error crítico:
 * `MissingSchemaError: Schema hasn't been registered for model ...` al invocar `.populate()`.
 */
export function registrarModelosMongoose() {
  require("@/modelos/Rol");
  require("@/modelos/Usuario");
  require("@/modelos/Camion");
  require("@/modelos/Conductor");
  require("@/modelos/Ruta");
  require("@/modelos/AsignacionCalendario");
  require("@/modelos/Reporte");
  require("@/modelos/Reclamo");
  require("@/modelos/Incidente");
  require("@/modelos/Alerta");
  require("@/modelos/AlertaCiudadano");
  require("@/modelos/HistorialAlerta");
  require("@/modelos/HistorialUbicacion");
  require("@/modelos/Aviso");
  require("@/modelos/LecturaAviso");
  require("@/modelos/DomicilioCiudadano");
  require("@/modelos/SuscripcionPush");
  require("@/modelos/PreasignacionUsuario");
  require("@/modelos/BloqueoAdministrativo");
}

export async function conectar_base_datos(): Promise<typeof mongoose> {
  if (en_cache?.conexion) {
    registrarModelosMongoose();
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
    registrarModelosMongoose();
  } catch (error) {
    en_cache!.promesa = null;
    throw error;
  }

  return en_cache!.conexion;
}
