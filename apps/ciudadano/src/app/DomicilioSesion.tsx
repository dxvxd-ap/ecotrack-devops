import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, useRef, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { crearEstadoDomicilio, type EstadoDomicilio } from '../servicios/estado-domicilio.ts';

import { crearEstadoDireccion } from '../servicios/estado-direccion.ts';
import { ContextoDirecciones } from './DireccionAproximada.tsx';

const Contexto = createContext<EstadoDomicilio | null>(null);

function ConSesion({ children }: { children: ReactNode }) {
  const { userId, sessionId, getToken } = useAuth();
  const tokenRef=useRef(getToken);tokenRef.current=getToken;
  const direcciones=useMemo(()=>crearEstadoDireccion(()=>tokenRef.current()),[userId,sessionId]);
  useEffect(()=>()=>direcciones.limpiar(),[direcciones]);
  // Cambiar el valor del contexto, no la key del árbol: el mapa sigue montado.
  const estado = useMemo(() => crearEstadoDomicilio(), [userId, sessionId]);
  useEffect(() => {
    if (!userId || !sessionId) return;
    // Lectura de un registro existente; no crea perfiles ni inicia sincronización.
    // Cuenta podrá reintentar errores después de su sincronización habitual.
    void estado.leer(getToken).catch(() => undefined);
  }, [estado, userId, sessionId, getToken]);
  return <Contexto.Provider value={estado}><ContextoDirecciones.Provider value={direcciones}>{children}</ContextoDirecciones.Provider></Contexto.Provider>;
}

export function DomicilioSesion({ configurada, children }: { configurada: boolean; children: ReactNode }) {
  const publico = useMemo(() => crearEstadoDomicilio(), []);
  const direccionesPublicas=useMemo(()=>crearEstadoDireccion(async()=>null),[]);
  return configurada ? <ConSesion>{children}</ConSesion> : <Contexto.Provider value={publico}><ContextoDirecciones.Provider value={direccionesPublicas}>{children}</ContextoDirecciones.Provider></Contexto.Provider>;
}

export function useDomicilioSesion() {
  const estado = useContext(Contexto);
  if (!estado) throw new Error('El domicilio requiere su contexto de sesión.');
  const snapshot = useSyncExternalStore(estado.subscribe, estado.getSnapshot, estado.getSnapshot);
  return { ...snapshot, leer: estado.leer, guardar: estado.guardar };
}
