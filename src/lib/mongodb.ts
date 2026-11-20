import { conectar_base_datos, registrarModelosMongoose } from "./base_datos";

/**
 * Conector Mongoose central con registro global de modelos.
 * Exportado para compatibilidad y uso transversal en APIs y lambdas.
 */
export async function conectarDB() {
  return await conectar_base_datos();
}

export { conectar_base_datos, registrarModelosMongoose };
export default conectar_base_datos;
