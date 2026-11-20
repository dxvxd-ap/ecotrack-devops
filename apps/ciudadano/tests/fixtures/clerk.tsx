import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let userId: string | null = (window as Window & { visitantePrueba?: boolean }).visitantePrueba ? null : 'ciudadano-prueba-a';
let sesionAlterna: string | null = null;
const getToken = async () => (window as any).sinToken ? null : sesionAlterna ?? userId;
(window as any).cambiarSesionPrueba = (id: string | null) => { sesionAlterna = id; listeners.forEach(cb => cb()); };
export function useAuth() {
  useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => `${userId}:${sesionAlterna}:${!!(window as any).usuarioCargando}`);
  return { isLoaded: !(window as any).usuarioCargando, userId, sessionId: sesionAlterna ?? userId, isSignedIn: !!userId, getToken, signOut: async () => { userId = null; sesionAlterna = null; listeners.forEach(cb => cb()); } };
}
export function useUser() {
  const { userId } = useAuth();
  if ((window as any).usuarioCargando) return { isLoaded: false, isSignedIn: undefined, user: undefined };
  return { isLoaded: true, isSignedIn: !!userId, user: userId ? { id: userId, firstName: userId } : null };
}
(window as any).cambiarUsuario = (id: string | null) => { userId = id; sesionAlterna = null; listeners.forEach(cb => cb()); };
export const ClerkProvider = ({ children }: any) => children;
export const ClerkLoaded = ClerkProvider;
export const ClerkLoading = () => null;
export const ClerkFailed = () => null;
export const Show = ({ when, children }: any) => {
  const { userId } = useAuth();
  return (when === 'signed-in' ? !!userId : !userId) ? children : null;
};
export const UserButton = () => null;
export const SignIn = () => <p>Acceso de prueba</p>;
export const SignUp = SignIn;

(window as any).cambiarCargaUsuario = (cargando: boolean) => { (window as any).usuarioCargando = cargando; listeners.forEach(cb => cb()); };
