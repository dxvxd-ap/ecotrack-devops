import { configurar } from './contratos.ts';

export interface ParametrosReporteCiudadano {
  tipo: 'no_paso_camion' | 'retraso' | 'basura_acumulada' | 'otro';
  titulo: string;
  descripcion: string;
  rutaId?: string | null;
  lat: number;
  lng: number;
  direccion?: string;
  nombre?: string;
  contacto?: string;
}

export interface RespuestaReporte {
  exito: boolean;
  mensaje: string;
  datos?: any;
}

/**
 * Envía un reporte de incidencia ciudadana al backend de EcoTrack
 */
export async function enviarReporteCiudadano(
  params: ParametrosReporteCiudadano
): Promise<RespuestaReporte> {
  try {
    const api = configurar({
      android: typeof __ANDROID_BUILD__ !== 'undefined' ? __ANDROID_BUILD__ : false,
      api: import.meta.env.VITE_API_ORIGIN?.trim(),
    }).api;

    const respuesta = await fetch(`${api}/api/reportes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origen: 'ciudadano',
        tipo: params.tipo,
        titulo: params.titulo.trim(),
        descripcion: params.descripcion.trim(),
        rutaId: params.rutaId || null,
        ubicacion: {
          lat: params.lat,
          lng: params.lng,
          direccion: params.direccion?.trim() || '',
        },
        reportadoPor: {
          nombre: params.nombre?.trim() || '',
          contacto: params.contacto?.trim() || '',
        },
      }),
    });

    const datos = await respuesta.json();
    if (!respuesta.ok || !datos.exito) {
      return {
        exito: false,
        mensaje: datos.mensaje || 'No se pudo guardar el reporte.',
      };
    }

    return {
      exito: true,
      mensaje: datos.mensaje || 'Reporte enviado exitosamente.',
      datos: datos.datos,
    };
  } catch (error: any) {
    console.error('[Reportes] Error al enviar reporte ciudadano:', error);
    return {
      exito: false,
      mensaje: error.message || 'Error de conexión al enviar el reporte.',
    };
  }
}
