import { consultarDomicilio, ErrorSinSesion, type DomicilioDTO } from './domicilio.ts';

type Snapshot = { domicilio: DomicilioDTO | null; cargado: boolean };

/** Crear una instancia por sesión; no persistir ni compartir entre identidades. */
export function crearEstadoDomicilio(consultar: (token: string) => Promise<DomicilioDTO | null> = consultarDomicilio) {
  let snapshot: Snapshot = { domicilio: null, cargado: false };
  let pendiente: Promise<DomicilioDTO | null> | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();
  const publicar = (domicilio: DomicilioDTO | null) => {
    snapshot = { domicilio, cargado: true };
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    guardar(domicilio: DomicilioDTO | null) { revision++; publicar(domicilio); },
    leer(obtenerToken: () => Promise<string | null>, forzar = false): Promise<DomicilioDTO | null> {
      if (!forzar && snapshot.cargado) return Promise.resolve(snapshot.domicilio);
      if (pendiente) return pendiente;
      const versionLectura = revision;
      const solicitud = (async () => {
        const token = await obtenerToken();
        if (!token) throw new ErrorSinSesion('No hay sesión activa.');
        const dto = await consultar(token);
        if (versionLectura === revision) publicar(dto);
        return snapshot.domicilio;
      })();
      pendiente = solicitud.finally(() => { pendiente = null; });
      return pendiente;
    },
  };
}
export type EstadoDomicilio = ReturnType<typeof crearEstadoDomicilio>;
