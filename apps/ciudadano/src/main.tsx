import { Component, StrictMode, type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { App } from './app/App.tsx';
import { DomicilioSesion } from './app/DomicilioSesion.tsx';
import './styles.css';

type Tema = 'light' | 'dark' | 'auto';

class ErrorAplicacion extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) {
    // No registrar el mensaje/stack: pueden incluir URLs o datos de una sesión.
    const categoria = /Clerk|useAuth|useUser|AuthContext/.test(error.message) ? 'autenticacion' : /setInteractive/.test(error.message) ? 'mapa' : 'interfaz';
    console.warn('EcoTrack: fallo de inicialización', { categoria, online: navigator.onLine, contextoSeguro: window.isSecureContext });
  }
  render() {
    return this.state.error ? <main className="panel"><h1>No se pudo abrir EcoTrack</h1><p>Revisa la conexión e inténtalo de nuevo. No pudimos comprobar tu sesión en esta pantalla.</p><button onClick={() => location.reload()}>Volver a intentar</button></main> : this.props.children;
  }
}

function obtenerTemaPreferido(): Tema {
  try {
    const guardado = localStorage.getItem('eco-tema');
    if (guardado === 'light' || guardado === 'dark' || guardado === 'auto') return guardado;
  } catch { /* Safari puede bloquear almacenamiento; el tema no debe impedir el arranque. */ }
  return 'light';
}

function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'dark') {
    raiz.setAttribute('data-theme', 'dark');
  } else if (tema === 'light') {
    raiz.setAttribute('data-theme', 'light');
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      raiz.setAttribute('data-theme', 'dark');
    } else {
      raiz.setAttribute('data-theme', 'light');
    }
  }
}

function AplicacionConTema({ configurada, inicial }: { configurada: boolean; inicial: Tema }) {
  const [preferencia, setPreferencia] = useState<Tema>(inicial);
  const [oscuroSistema, setOscuroSistema] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const resuelto = preferencia === 'auto' ? (oscuroSistema ? 'dark' : 'light') : preferencia;
  useLayoutEffect(() => aplicarTema(resuelto), [resuelto]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const actualizar = () => setOscuroSistema(media.matches);
    actualizar();
    if (media.addEventListener) media.addEventListener('change', actualizar);
    else media.addListener(actualizar);
    window.ecoCambiarTema = tema => {
      try { localStorage.setItem('eco-tema', tema); } catch { /* Preferencia opcional. */ }
      setPreferencia(tema);
    };
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', actualizar);
      else media.removeListener(actualizar);
    };
  }, []);
  return <DomicilioSesion configurada={configurada}><App clerkConfigurado={configurada} tema={preferencia} temaResuelto={resuelto} /></DomicilioSesion>;
}

function renderConTemaPreaplicado(tema: Tema) {
  aplicarTema(tema);

  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
  const configured = !!key && /^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key);
  const basePath = import.meta.env.BASE_URL || '/eco/';
  const redirectUrl = `${location.origin}${basePath}index.html`;

  const clerkAppearance = {
    variables: {
      colorPrimary: 'var(--eco-verde)',
      colorBackground: 'var(--color-tarjeta)',
      colorText: 'var(--color-texto)',
      colorTextSecondary: 'var(--color-texto-secundario)',
      colorTextMuted: 'var(--color-texto-secundario)',
      colorInputBackground: 'var(--color-fondo)',
      colorInputText: 'var(--color-texto)',
      colorDanger: 'var(--color-error)',
      colorSuccess: 'var(--color-acentro)',
      colorWarning: 'var(--color-estado)',
      colorBorder: 'var(--color-borde)',
      colorCardBackground: 'var(--color-tarjeta)',
    },
    elements: {
      card: 'isla',
      formButtonPrimary: 'primario',
      userButtonPopoverCard: 'isla',
      userButtonPopoverActionButton: 'secundario',
      userButtonPopoverActionButtonDanger: 'secundario',
      userButtonPopoverActionButtonIcon: 'secundario',
    },
  };

  const app = <AplicacionConTema configurada={configured} inicial={tema} />;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorAplicacion>
        {configured ? (
          <ClerkProvider
            publishableKey={key!}
            appearance={clerkAppearance}
            signInFallbackRedirectUrl={redirectUrl}
            signUpFallbackRedirectUrl={redirectUrl}
          >
            {app}
          </ClerkProvider>
        ) : app}
      </ErrorAplicacion>
    </StrictMode>
  );

}

const temaInicial = obtenerTemaPreferido();
renderConTemaPreaplicado(temaInicial);

if (!__ANDROID_BUILD__ && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        const button = document.createElement('button');
        button.className = 'actualizacion'; button.textContent = 'Nueva versión disponible · Actualizar';
        button.addEventListener('click', () => void update(true));
        document.body.append(button);
      },
      onRegisterError() { console.warn('EcoTrack: instalación sin conexión pendiente.'); },
    });
  }).catch(() => console.warn('EcoTrack: service worker no disponible.'));
}

// Exportar función para cambiar tema desde componentes
declare global {
  interface Window {
    ecoCambiarTema: (tema: Tema) => void;
    ecoSeleccionarRuta?: (id: string) => void;
  }
}
