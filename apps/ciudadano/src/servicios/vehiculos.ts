import { normalizarVehiculo, type Vehiculo } from './contratos.ts';

/** El proveedor definitivo se conecta aquí, sin acoplarlo al mapa ni a sus credenciales. */
export interface ProveedorVehiculos {
  consultar(signal: AbortSignal): Promise<Vehiculo[]>;
}

export const sinProveedor: ProveedorVehiculos = {
  async consultar() { throw new Error('La fuente GPS autorizada todavía no está configurada.'); },
};

export const proveedorDemostracion: ProveedorVehiculos = {
  async consultar() {
    const v = normalizarVehiculo({ id: 'demo-01', nombre: 'Unidad de demostración', latitud: 20.4524, longitud: -97.0877 }, 'demo');
    return v ? [v] : [];
  },
};
