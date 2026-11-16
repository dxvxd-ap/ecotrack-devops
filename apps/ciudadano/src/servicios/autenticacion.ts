const API = import.meta.env.VITE_API_ORIGIN || '';

export interface DatosSincronizacion {
  exito: boolean;
  mensaje: string;
  datos: {
    id_clerk: string;
    nombre: string;
    correo: string;
    rol: string;
  };
}

export async function sincronizarPerfil(token: string, signal?: AbortSignal): Promise<DatosSincronizacion> {
  const resp = await fetch(`${API}/api/ciudadano/sincronizar`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({})) as { mensaje?: string };
    throw new Error(data.mensaje || 'Error al sincronizar perfil');
  }
  return resp.json() as Promise<DatosSincronizacion>;
}