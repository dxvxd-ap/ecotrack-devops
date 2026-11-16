import { sonCoordenadasDomicilio } from './domicilio';

export interface ConsultaDireccion {
  latitud: number;
  longitud: number;
  confirmada: true;
}
export interface DireccionAproximada {
  calle: string | null;
  numero: string | null;
  colonia: string | null;
  localidad: string | null;
  municipio: string | null;
  estado: string | null;
  pais: string | null;
}
export interface ResultadoDireccion {
  proveedor: 'geoapify';
  aproximada: true;
  direccion: DireccionAproximada | null;
  consultado_en: string;
  expira_en: string;
  atribucion: { proveedor: string; url: string; datos: string };
}
export function validarConsultaDireccion(valor: unknown): ConsultaDireccion {
  const campos = ['latitud', 'longitud', 'confirmada'];
  if (!valor || typeof valor !== 'object' || Array.isArray(valor) ||
    Object.keys(valor).some(c => !campos.includes(c)) || campos.some(c => !Object.hasOwn(valor, c))) {
    throw new Error('Se requieren únicamente latitud, longitud y confirmada');
  }
  const cuerpo = valor as Record<string, unknown>;
  if (!sonCoordenadasDomicilio([cuerpo.longitud, cuerpo.latitud]) || cuerpo.confirmada !== true) {
    throw new Error('Se requiere un punto válido y confirmado');
  }
  return { latitud: cuerpo.latitud as number, longitud: cuerpo.longitud as number, confirmada: true };
}
