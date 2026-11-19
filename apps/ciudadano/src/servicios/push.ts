import { Capacitor } from '@capacitor/core';
import { configurar } from './contratos.ts';

const STORAGE_KEY_TOKEN = 'ecotrack_push_token';
const STORAGE_KEY_SUSCRIPCIONES = 'ecotrack_rutas_suscritas';

export interface RegistroPushRespuesta {
  exito: boolean;
  mensaje: string;
  token?: string;
}

/**
 * Obtiene o genera un identificador único de dispositivo para push
 */
function obtenerTokenDispositivoLocal(): string {
  try {
    let token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!token) {
      const randomPart = Math.random().toString(36).substring(2, 10);
      const timestamp = Date.now().toString(36);
      // Formato compatible con Expo Push Token para consistencia en el backend
      token = `ExponentPushToken[ecotrack_${randomPart}_${timestamp}]`;
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
    }
    return token;
  } catch {
    return `ExponentPushToken[ecotrack_anon_${Date.now()}]`;
  }
}

/**
 * Solicita permisos de notificación al usuario y registra el token en el backend
 */
export async function inicializarNotificacionesPush(
  rutasSuscritas: string[] = []
): Promise<RegistroPushRespuesta> {
  try {
    const esNativo = Capacitor.isNativePlatform();
    const plataforma = esNativo ? (Capacitor.getPlatform() === 'ios' ? 'ios' : 'android') : 'web';

    // 1. Solicitar permisos en navegador si está disponible Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          // Algunos navegadores móviles pueden restringir la promesa de Notification.requestPermission
        }
      }
    }

    // 2. Obtener el token del dispositivo
    const token = obtenerTokenDispositivoLocal();

    // 3. Determinar la URL del backend según el entorno (Capacitor o Web)
    const api = configurar({
      android: typeof __ANDROID_BUILD__ !== 'undefined' ? __ANDROID_BUILD__ : false,
      api: import.meta.env.VITE_API_ORIGIN?.trim(),
    }).api;

    const urlEndpoint = `${api}/api/notificaciones/registrar-token`;

    // 4. Registrar en el backend EcoTrack
    const respuesta = await fetch(urlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        plataforma,
        rutasSuscritas,
        activo: true,
      }),
    });

    const datos = await respuesta.json();

    try {
      localStorage.setItem(STORAGE_KEY_SUSCRIPCIONES, JSON.stringify(rutasSuscritas));
    } catch {}

    return {
      exito: datos.exito ?? true,
      mensaje: datos.mensaje || 'Token registrado exitosamente',
      token,
    };
  } catch (error: any) {
    console.warn('[Push] No se pudo registrar token de notificaciones:', error.message);
    return {
      exito: false,
      mensaje: error.message || 'Error de conexión al registrar notificaciones',
    };
  }
}
