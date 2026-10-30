import fs from "node:fs";
import path from "node:path";

const RUTA_ARCHIVO_LOCAL = path.join(process.cwd(), "datos_locales_respaldo.json");

// Estructura limpia para producción: el administrador 22610282@utgz.edu.mx registrará su propia flota y rutas
const DATOS_INICIALES_VACIOS = {
  rutas: [] as any[],
  camiones: [] as any[],
  conductores: [] as any[],
  calendario: [] as any[],
  preasignaciones: [] as any[],
};

export function leer_almacen_local(): typeof DATOS_INICIALES_VACIOS {
  try {
    if (!fs.existsSync(RUTA_ARCHIVO_LOCAL)) {
      guardar_almacen_local(DATOS_INICIALES_VACIOS);
      return DATOS_INICIALES_VACIOS;
    }
    const contenido = fs.readFileSync(RUTA_ARCHIVO_LOCAL, "utf8");
    const datos = JSON.parse(contenido);
    if (!datos.rutas) datos.rutas = [];
    if (!datos.camiones) datos.camiones = [];
    if (!datos.conductores) datos.conductores = [];
    if (!datos.calendario) datos.calendario = [];
    if (!datos.preasignaciones) datos.preasignaciones = [];
    return datos;
  } catch (e) {
    return DATOS_INICIALES_VACIOS;
  }
}

export function guardar_almacen_local(datos: typeof DATOS_INICIALES_VACIOS) {
  try {
    fs.writeFileSync(RUTA_ARCHIVO_LOCAL, JSON.stringify(datos, null, 2), "utf8");
  } catch (e) {
    console.error("Error al escribir almacén local:", e);
  }
}

export function limpiar_datos_a_cero() {
  guardar_almacen_local(DATOS_INICIALES_VACIOS);
}
