import { ClerkLoading, ClerkFailed, ClerkLoaded, Show, SignIn, SignUp, UserButton, useUser, useAuth } from '@clerk/react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Sun, Moon, Monitor, Mail, ShieldCheck } from 'lucide-react';
import { useDomicilioSesion } from './DomicilioSesion.tsx';
import { DireccionAproximada } from './DireccionAproximada.tsx';
import { aparienciaAutenticacion } from './apariencia-clerk.ts';
import { sincronizarPerfil } from '../servicios/autenticacion.ts';
import {
  consultarDomicilio,
  crearDomicilio,
  actualizarDomicilio,
  ErrorConflictoVersion,
  ErrorSinSesion,
  ErrorAccesoDenegado,
  ErrorServicioNoDisponible,
  ErrorEntradaInvalida,
  ErrorDomicilioExistente,
  ErrorDomicilioNoEncontrado,
  ErrorDomicilio,
  type DomicilioDTO,
  type TipoSeleccionDomicilio,
} from '../servicios/domicilio.ts';
import type { CentroPunto } from './SeleccionarDomicilio.tsx';
import { SeleccionarDomicilio } from './SeleccionarDomicilio.tsx';

type Tema = 'light' | 'dark' | 'auto';

// Estado posible tras escritura incierta (503/pérdida de ACK)
type EscrituraResultado = 'exitoso' | 'incierto' | null;

function Perfil() {
  const { user } = useUser();
  const nombre = user?.firstName || 'Tu cuenta EcoTrack';
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <article className="tarjeta-perfil isla">
      <div className="perfil-cabecera">
        <div className="perfil-avatar"><UserButton /></div>
        <div className="perfil-info">
          <h2>{nombre}</h2>
          {email && <p className="perfil-email"><Mail size={14} />{email}</p>}
          <p className="perfil-estado"><ShieldCheck size={14} />Sesión activa · validada por el municipio</p>
        </div>
      </div>
    </article>
  );
}

function Sincronizando() {
  return <p role="status" className="estado-carga">Sincronizando tu perfil con el municipio…</p>;
}

function ErrorSync({ onReintentar }: { onReintentar: () => void }) {
  return (
    <div className="aviso isla">
      <p>No pudimos sincronizar tu perfil. Puede que ya esté registrado o hay un problema de conexión.</p>
      <button className="secundario" onClick={onReintentar}>Reintentar</button>
    </div>
  );
}

function SelectorTema({ temaActual }: { temaActual: Tema }) {
  const temas: Tema[] = ['light', 'dark', 'auto'];
  const etiquetas: Record<Tema, string> = { light: 'Claro', dark: 'Oscuro', auto: 'Automático' };
  const descripciones: Record<Tema, string> = {
    light: 'Siempre claro',
    dark: 'Siempre oscuro',
    auto: 'Según el sistema',
  };
  const iconos: Record<Tema, React.ReactNode> = {
    light: <Sun size={20} />,
    dark: <Moon size={20} />,
    auto: <Monitor size={20} />,
  };

  return (
    <section className="seccion-apariencia" aria-labelledby="apariencia-titulo">
      <p id="apariencia-titulo" className="eyebrow">APARIENCIA</p>
      <div className="opciones-tema" role="radiogroup" aria-label="Tema de la aplicación">
        {temas.map(t => (
          <button
            key={t}
            className={`opcion-tema ${temaActual === t ? 'seleccionada' : ''}`}
            onClick={() => {
              if (typeof window !== 'undefined' && window.ecoCambiarTema) {
                window.ecoCambiarTema(t);
              }
            }}
            role="radio"
            aria-checked={temaActual === t}
            aria-label={`${etiquetas[t]}: ${descripciones[t]}`}
          >
            <span className="icono-tema" aria-hidden="true">{iconos[t]}</span>
            <div className="texto-contenedor">
              <span className="texto-tema">{etiquetas[t]}</span>
              <span className="texto-descripcion">{descripciones[t]}</span>
            </div>
            {temaActual === t && <span className="check-tema" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Domicilio section ────────────────────────────────────────────────────────

function asignacionEstadoTexto(estado: string): string {
  switch (estado) {
    case 'pendiente': return 'En evaluación';
    case 'asignada': return 'Asignada a ruta';
    case 'ambigua': return 'Ubicación ambigua';
    case 'sin_evidencia': return 'Sin evidencia de cobertura';
    case 'sin_cobertura': return 'Sin cobertura de recolección';
    case 'requiere_revision': return 'Requiere revisión';
    default: return estado;
  }
}

function DomicilioSeccion({
  dto,
  onEditar,
  guardando = false,
}: {
  dto: DomicilioDTO | null;
  onEditar: () => void;
  guardando?: boolean;
}) {
  const fechaTexto = dto
    ? new Date(dto.fecha_confirmacion).toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  return (
    <section className="domicilio-seccion isla" aria-label="Tu domicilio registrado">
      <div className="domicilio-cabecera">
        <p className="eyebrow">TU DOMICILIO</p>
        {dto ? (
          <span className={`domicilio-estado-badge domicilio-estado-${dto.asignacion.estado}`}>
            {asignacionEstadoTexto(dto.asignacion.estado)}
          </span>
        ) : null}
      </div>

      {dto ? (
        <>
          <div className="domicilio-resumen">
            <DireccionAproximada punto={dto.ubicacion.coordinates} guardado />
            <p className="domicilio-confirmacion"><ShieldCheck size={16} aria-hidden="true" />Confirmado por ti · {fechaTexto}</p>
          </div>
          <details className="domicilio-detalles">
            <summary>Detalles de ubicación</summary>
            <div className="domicilio-datos">
              <div className="domicilio-dato-fila"><span>Coordenadas</span><code className="domicilio-coord">{dto.ubicacion.coordinates[1].toFixed(5)}, {dto.ubicacion.coordinates[0].toFixed(5)}</code></div>
              <div className="domicilio-dato-fila"><span>Selección</span><span>{dto.tipo_seleccion === 'gps' ? 'GPS automático' : 'Selección manual'}</span></div>
              <div className="domicilio-dato-fila"><span>Versión</span><span>v{dto.version}</span></div>
            </div>
          </details>
          <button className="primario domicilio-btn-editar" disabled={guardando} onClick={onEditar}>
            Cambiar domicilio
          </button>
        </>
      ) : (
        <div className="domicilio-vacio">
          <p>Aún no tienes un domicilio registrado. Permite conocer tu ubicación para notificarte cuando pase el camión de recolección cerca de tu casa.</p>
          <button className="primario" disabled={guardando} onClick={onEditar}>Registrar domicilio</button>
        </div>
      )}

      <p className="nota">
        El municipio evaluará la cobertura de recolección en este punto.
      </p>
    </section>
  );
}

function ErrorDomicilioAviso({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <div className="aviso isla" role="alert">
      <p>{mensaje}</p>
      <button className="secundario" onClick={onReintentar}>Volver a intentar</button>
    </div>
  );
}

function IncertidumbreAviso({ onConsultar }: { onConsultar: () => void }) {
  return (
    <div className="aviso isla" role="alert">
      <p>
        No estamos seguros de si se guardó tu domicilio. Consulta tu estado actual
        para verificar si ya aparece registrado.
      </p>
      <button className="secundario" onClick={onConsultar}>Consultar estado</button>
    </div>
  );
}

export function Cuenta({ configurada, tema, temaMapa, alSincronizar }: { configurada: boolean; tema?: Tema; temaMapa?: 'light' | 'dark'; alSincronizar?: () => void }) {
  if (!configurada) return <section className="panel"><p className="eyebrow">TU ECOTRACK</p><h1>Tu cuenta, cerca de ti.</h1><div className="aviso isla">Acceso pendiente de habilitar. Mientras tanto, puedes consultar las rutas sin iniciar sesión.</div></section>;
  return <CuentaConProveedor tema={tema} temaMapa={temaMapa} alSincronizar={alSincronizar} />;
}

function CuentaConProveedor({ tema, temaMapa, alSincronizar }: { tema?: Tema; temaMapa?: 'light' | 'dark'; alSincronizar?: () => void }) {
  const { userId, sessionId } = useAuth();
  // Una sesión nueva obtiene un estado nuevo, incluso en un cambio directo A → B.
  return <CuentaSesion key={`${userId ?? 'visitante'}:${sessionId ?? ''}`} configurada tema={tema} temaMapa={temaMapa} alSincronizar={alSincronizar} />;
}

function CuentaSesion({ configurada, tema, temaMapa, alSincronizar }: { configurada: boolean; tema?: Tema; temaMapa?: 'light' | 'dark'; alSincronizar?: () => void }) {
  const { isSignedIn, isLoaded } = useUser();
  const auth = useAuth();
  const [mostrarSignUp, setMostrarSignUp] = useState(false);
  const [syncEstado, setSyncEstado] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const syncCompletadoRef = useRef(false);

  // Domicilio state
  const { domicilio: domicilioDto, guardar: setDomicilioDto, leer: leerDomicilio } = useDomicilioSesion();
  const [domicilioCargando, setDomicilioCargando] = useState(false);
  const [domicilioError, setDomicilioError] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [guardandoDomicilio, setGuardandoDomicilio] = useState(false);
  const [escrituraResultado, setEscrituraResultado] = useState<EscrituraResultado>(null);
  const domicilioFetchHandledRef = useRef(false);
  const escrituraActivaRef = useRef(false);
  const lecturaSecuenciaRef = useRef(0);
  const lecturaActivaRef = useRef(false);

  const syncEnCursoRef = useRef(false);
  const vigenteRef = useRef(true);
  useEffect(() => {
    vigenteRef.current = true;
    return () => { vigenteRef.current = false; };
  }, []);

  const handleSync = useCallback(async () => {
    if (syncCompletadoRef.current || syncEnCursoRef.current) return;
    syncEnCursoRef.current = true;
    setSyncEstado('syncing');
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          const token = await auth.getToken();
          if (!token || controller.signal.aborted || !vigenteRef.current) throw new Error('Sin sesión vigente');
          await sincronizarPerfil(token, controller.signal);
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(new Error('Tiempo de espera agotado')); }, 10000);
        }),
      ]);
      if (!vigenteRef.current) return;
      syncCompletadoRef.current = true;
      setSyncEstado('done');
      alSincronizar?.();
    } catch {
      if (vigenteRef.current) setSyncEstado('error');
    } finally {
      clearTimeout(timeout);
      syncEnCursoRef.current = false;
    }
  }, [auth.getToken, alSincronizar]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void handleSync();
  }, [isSignedIn, isLoaded, handleSync]);

  // Cargar domicilio después de sincronización exitosa
  useEffect(() => {
    if (syncEstado !== 'done' || !isSignedIn || domicilioFetchHandledRef.current) return;
    domicilioFetchHandledRef.current = true;
    setDomicilioError(null);
    setEscrituraResultado(null);

    void consultarEstado(true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEstado, isSignedIn]);

  function reintentarSync() {
    syncCompletadoRef.current = false;
    void handleSync();
  }

  useEffect(() => {
    if (!isSignedIn) {
      syncCompletadoRef.current = false;
      setSyncEstado('idle');
      domicilioFetchHandledRef.current = false;
      setDomicilioError(null);
      setEscrituraResultado(null);
      escrituraActivaRef.current = false;
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (syncEstado !== 'done') return;
    const revalidar = () => {
      if (document.visibilityState === 'visible' && !escrituraActivaRef.current && !showSelector) void consultarEstado(true);
    };
    window.addEventListener('online', revalidar);
    document.addEventListener('visibilitychange', revalidar);
    return () => {
      window.removeEventListener('online', revalidar);
      document.removeEventListener('visibilitychange', revalidar);
    };
  }, [syncEstado, showSelector]);

  // Consultar domicilio directamente (para recuperación tras error/incertidumbre)
  async function consultarEstado(deshabilitarRefresh = false, forzar = true) {
    if (lecturaActivaRef.current || escrituraActivaRef.current) return;
    lecturaActivaRef.current = true;
    const secuencia = ++lecturaSecuenciaRef.current;
    setDomicilioCargando(true);
    try {
      const token = await auth.getToken();
      if (!vigenteRef.current) return;
      if (!token) { setDomicilioError('No hay sesión activa.'); return; }
      await leerDomicilio(async () => token, forzar);
      if (!vigenteRef.current || secuencia !== lecturaSecuenciaRef.current) return;
      setDomicilioError(null);
      setEscrituraResultado(null);
    } catch (err) {
      if (!vigenteRef.current || secuencia !== lecturaSecuenciaRef.current) return;
      if (err instanceof ErrorConflictoVersion || err instanceof ErrorDomicilioExistente) {
        // GET también devolvió 409: el servidor indica conflicto activo.
        // Detener recuperación automática y mostrar necesidad de conciliación.
        setDomicilioError('El servidor reporta un conflicto con tu cuenta. Contacta al soporte para resolverla.');
      } else if (err instanceof ErrorSinSesion) {
        setDomicilioError('La sesión expiró. Inicia sesión de nuevo.');
      } else if (err instanceof ErrorAccesoDenegado) {
        setDomicilioError('No tienes permiso para acceder a esta información.');
      } else {
        setDomicilioError('No se pudo consultar el estado. Inténtalo de nuevo.');
      }
    } finally {
      setDomicilioCargando(false);
      lecturaActivaRef.current = false;
      if (!deshabilitarRefresh) domicilioFetchHandledRef.current = false;
    }
  }

  // Handler principal de confirmación del selector
  async function manejarConfirmacion(punto: CentroPunto) {
    if (guardandoDomicilio || escrituraActivaRef.current) throw new Error('Hay un guardado en curso.');
    escrituraActivaRef.current = true;
    lecturaSecuenciaRef.current++;
    setGuardandoDomicilio(true);
    setDomicilioError(null);
    setEscrituraResultado(null);

    try {
      const token = await auth.getToken();
      if (!vigenteRef.current) return;
      if (!token) {
        throw new ErrorSinSesion('La sesión expiró. Inicia sesión de nuevo.');
      }

      let dto: DomicilioDTO | null = null;

      if (domicilioDto) {
        // Actualizar con versión actual leída
        dto = await actualizarDomicilio(token, { ...punto, version: domicilioDto.version });
      } else {
        // Crear nuevo domicilio
        dto = await crearDomicilio(token, punto);
      }

      if (!vigenteRef.current) return;
      // Éxito confirmado: actualizar estado local y cerrar
      setDomicilioDto(dto);
      setShowSelector(false);
      setEscrituraResultado('exitoso');

    } catch (error) {
      if (error instanceof ErrorConflictoVersion) {
        // Versión obsoleta: consultar GET para obtener el estado real y pedir reconfirmación
        setDomicilioError('Tu domicilio cambió mientras editabas. Estamos recuperando los datos actuales…');
        try {
          const token = await auth.getToken();
          if (!token) {
            throw new ErrorSinSesion('La sesión expiró durante la recuperación. Inicia sesión de nuevo.');
          }
          const actual = await consultarDomicilio(token);
          if (!vigenteRef.current) return;
          // Si GET también falla con conflicto, detener y mostrar mensaje de bloqueo
          if (actual === null || actual === undefined) {
            setDomicilioError('No se pudo recuperar el domicilio. Intenta de nuevo más tarde.');
          } else {
            setDomicilioDto(actual);
            setDomicilioError(null);
          }
        } catch { /* GET también falló; dejar el error original */ }
        // No cerrar selector — el usuario ve el dato actual y puede intentar de nuevo
      } else if (error instanceof ErrorDomicilioExistente) {
        // POST duplicado: consultar GET para ver qué hay
        setDomicilioError('Ya existe un domicilio registrado. Recuperando los datos actuales…');
        try {
          const token = await auth.getToken();
          if (!token) {
            throw new ErrorSinSesion('La sesión expiró durante la recuperación. Inicia sesión de nuevo.');
          }
          const actual = await consultarDomicilio(token);
          if (!vigenteRef.current) return;
          if (actual === null || actual === undefined) {
            setDomicilioError('No se pudo recuperar el domicilio. Intenta de nuevo más tarde.');
          } else {
            setDomicilioDto(actual);
            setDomicilioError(null);
          }
        } catch { /* dejar error */ }
      } else if (error instanceof ErrorSinSesion) {
        setDomicilioError('La sesión expiró. Inicia sesión de nuevo.');
      } else if (error instanceof ErrorAccesoDenegado) {
        setDomicilioError('No tienes permiso para guardar este domicilio.');
      } else if (error instanceof ErrorServicioNoDisponible) {
        // 503: resultado incierto. No reintentar escritura; ofrecer consultar GET.
        setEscrituraResultado('incierto');
        setDomicilioError(null);
      } else if (error instanceof ErrorEntradaInvalida) {
        setDomicilioError('Los datos enviados no son válidos. Corrígelos e intenta de nuevo.');
      } else if (error instanceof ErrorDomicilio && error.status === 409) {
        // Conflictos genéricos (CONFLICTO_PERSISTENCIA, CUENTA_EN_CONFLICTO, etc.)
        setDomicilioError('Hubo un conflicto con tu cuenta. Contacta al soporte para resolverlo.');
      } else {
        setDomicilioError('No se pudo guardar el domicilio. Intenta de nuevo.');
      }
      // Propagar el fallo para que el selector no anuncie un guardado exitoso.
      throw error;
    } finally {
      setGuardandoDomicilio(false);
      escrituraActivaRef.current = false;
    }
  }

  function abrirSelector() {
    if (escrituraActivaRef.current) return;
    setShowSelector(true);
    setDomicilioError(null);
    setEscrituraResultado(null);
  }

  function cerrarSelector() {
    setShowSelector(false);
  }

  const temaFinal = tema || 'light';
  const aparienciaClerk = aparienciaAutenticacion(temaMapa ?? (temaFinal === 'dark' ? 'dark' : 'light'));

  return (
    <section className="panel">
      <header className="panel-cabecera">
        <p className="eyebrow">TU ECOTRACK</p>
        <h1>Tu cuenta, cerca de ti.</h1>
      </header>

      <p className="panel-descripcion">Consulta libremente el mapa. Tu domicilio y tus reportes requerirán una sesión validada por el municipio.</p>

      {!configurada ? (
        <div className="aviso isla">Acceso pendiente de habilitar. Mientras tanto, puedes consultar las rutas sin iniciar sesión.</div>
      ) : null}

      <ClerkLoading>
        <p role="status" className="estado-carga">Preparando acceso seguro…</p>
      </ClerkLoading>
      <ClerkFailed>
        <div className="aviso isla">El servicio de acceso no pudo cargar. Comprueba la conexión e inténtalo de nuevo.</div>
      </ClerkFailed>
      <ClerkLoaded>
        <Show when="signed-out">
          <div className="auth-container">
            {!mostrarSignUp ? (
              <>
                <SignIn
                  appearance={aparienciaClerk}
                />
                <div className="auth-footer">
                  <span>¿No tienes cuenta? <button className="link-button" style={{ color: aparienciaClerk.variables.colorPrimary }} onClick={() => setMostrarSignUp(true)}>Regístrate con Google</button></span>
                </div>
              </>
            ) : (
              <>
                <SignUp
                  appearance={aparienciaClerk}
                />
                <div className="auth-footer">
                  <button className="link-button" style={{ color: aparienciaClerk.variables.colorPrimary }} onClick={() => setMostrarSignUp(false)}>← Volver a iniciar sesión</button>
                </div>
              </>
            )}
          </div>
        </Show>
        <Show when="signed-in">
          {syncEstado === 'syncing' && <Sincronizando />}
          {syncEstado === 'error' && <ErrorSync onReintentar={reintentarSync} />}
          {syncEstado === 'done' && <Perfil />}
          {syncEstado === 'done' && <SelectorTema temaActual={temaFinal} />}

          {/* ── Sección Domicilio ── */}
          {syncEstado === 'done' && isSignedIn && (
            <>
              {domicilioCargando && (
                <p role="status" className="estado-carga">Cargando tu domicilio…</p>
              )}
              {!domicilioCargando && !domicilioError && escrituraResultado === 'incierto' && (
                <IncertidumbreAviso onConsultar={() => consultarEstado()} />
              )}
              {!domicilioCargando && domicilioError && (
                <ErrorDomicilioAviso
                  mensaje={domicilioError}
                  onReintentar={() => { void consultarEstado(); }}
                />
              )}
              {(!domicilioCargando || domicilioDto) && (!domicilioError || domicilioDto) && escrituraResultado !== 'incierto' && (
                <DomicilioSeccion
                  dto={domicilioDto}
                  guardando={guardandoDomicilio}
                  onEditar={abrirSelector}
                />
              )}
            </>
          )}
        </Show>
      </ClerkLoaded>

      {/* Selector de domicilio (pantalla completa) */}
      {showSelector && isSignedIn && (
        <SeleccionarDomicilio
          domicilioExistente={domicilioDto}
          tema={temaMapa ?? temaFinal}
          onConfirmar={manejarConfirmacion}
          onCancelado={cerrarSelector}
          onGuardado={cerrarSelector}
        />
      )}
    </section>
  );
}