import './avisos.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronLeft, Filter, Loader2, MessageSquare, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { crearServicioAvisos, obtenerTokenAvisos, type Aviso, type FiltroAvisos, type ListaAvisos, ErrorAvisos } from '../servicios/avisos.ts';

export type SesionAvisos = { clave: string; obtenerToken: () => Promise<string | null> };
type Props = {
  perfilSincronizado: boolean; configurada: boolean; cargandoSesion: boolean; sesion: SesionAvisos | null; activo: boolean; online: boolean;
  irInicio: () => void; irCuenta: () => void;
  abrirReporte: (id: string) => void; abrirRuta: (id: string) => void; rutaDisponible: (id: string) => boolean;
  onContadorCambio: (clave: string, total: number | null) => void;
};

const FILTROS: { valor: FiltroAvisos; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'sin_leer', etiqueta: 'Sin leer' },
  { valor: 'mi_zona', etiqueta: 'Mi zona' },
];

const PRIORIDAD_ETIQUETA: Record<string, string> = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const TIPO_ETIQUETA: Record<string, string> = { comunicado: 'Comunicado', cambio_ruta: 'Cambio de ruta', retraso: 'Retraso', suspension: 'Suspensión', reporte: 'Reporte' };
const PRIORIDAD_CLASE: Record<string, string> = { normal: '', alta: 'prioridad-alta', urgente: 'prioridad-urgente' };

function Encabezado({ onVolver }: { onVolver: () => void }) {
  return (
    <header className="avisos-cabecera">
      <button className="icono" aria-label="Volver al inicio" onClick={onVolver}><ChevronLeft size={22} /></button>
      <div className="avisos-titulo">
        <p className="eyebrow">BANDEJA CIUDADANA</p>
        <h1>Avisos municipales</h1>
      </div>
    </header>
  );
}

function Descripcion() {
  return (
    <p className="avisos-descripcion">
      Recibe comunicados oficiales, actualizaciones de rutas y respuestas a tus reportes.
      Los avisos sin leer aparecen destacados.
    </p>
  );
}

function FiltrosBarra({ filtro, onCambiar }: { filtro: FiltroAvisos; onCambiar: (f: FiltroAvisos) => void }) {
  return (
    <div className="avisos-filtros" role="group" aria-label="Filtrar avisos">
      {FILTROS.map(({ valor, etiqueta }) => (
        <button
          key={valor}
          className={`avisos-filtro ${filtro === valor ? 'activo' : ''}`}
          onClick={() => onCambiar(valor)}
          aria-pressed={filtro === valor}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

function BadgePrioridad({ prioridad }: { prioridad: string }) {
  return <span className={`avisos-badge prioridad ${PRIORIDAD_CLASE[prioridad] || ''}`}>{PRIORIDAD_ETIQUETA[prioridad] || prioridad}</span>;
}

function BadgeTipo({ tipo }: { tipo: string }) {
  return <span className="avisos-badge tipo">{TIPO_ETIQUETA[tipo] || tipo}</span>;
}

function formatearFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Fecha no disponible';
  }
}

function TarjetaAviso({
  aviso,
  onMarcarLeido,
  onAbrirReporte,
  onAbrirRuta,
  bloqueado,
}: {
  aviso: Aviso;
  bloqueado: boolean;
  onMarcarLeido: (id: string) => void;
  onAbrirReporte?: (id: string) => void;
  onAbrirRuta?: (id: string) => void;
}) {
  const leido = !!aviso.leido_en;
  return (
    <article
      className={`avisos-tarjeta isla ${leido ? 'leido' : 'no-leido'}`}
      aria-label={leido ? 'Aviso leído' : 'Aviso sin leer'}
    >
      <div className="avisos-tarjeta-cabecera">
        <div className="avisos-tarjeta-titulo">
          <strong>{aviso.titulo}</strong>
          {!leido && <span className="avisos-indicador" aria-label="Sin leer" />}
        </div>
        <div className="avisos-tarjeta-meta">
          <span className="avisos-fecha">{formatearFecha(aviso.publicado_en)}</span>
          {aviso.vigente_hasta && <span className="avisos-vigencia">Vigente hasta {formatearFecha(aviso.vigente_hasta)}</span>}
        </div>
      </div>
      <p className="avisos-mensaje">{aviso.mensaje}</p>
      <div className="avisos-tarjeta-pie">
        <div className="avisos-badges">
          <BadgeTipo tipo={aviso.tipo} />
          <BadgePrioridad prioridad={aviso.prioridad} />
        </div>
        <div className="avisos-acciones">
          {!leido && (
            <button
              className="avisos-btn-leer"
              disabled={bloqueado}
              onClick={() => onMarcarLeido(aviso.id)}
              aria-label="Marcar como leído"
            >
              <MessageSquare size={16} aria-hidden="true" />
              <span>Marcar como leído</span>
            </button>
          )}
          {aviso.referencia?.tipo === 'reporte' && onAbrirReporte && (
            <button className="avisos-btn-enlace" onClick={() => onAbrirReporte(aviso.referencia!.id)}>
              Ver mi reporte
            </button>
          )}
          {aviso.referencia?.tipo === 'ruta' && onAbrirRuta && (
            <button className="avisos-btn-enlace" onClick={() => onAbrirRuta(aviso.referencia!.id)}>
              Ver ruta en Inicio
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function EstadoZona({ estado, irCuenta }: { estado: ListaAvisos['estado_zona']; irCuenta: () => void }) {
  if (estado === 'sin_domicilio') {
    return (
      <div className="avisos-zona-aviso info">
        <Filter size={20} aria-hidden="true" />
        <div>
          <strong>Sin domicilio registrado</strong>
          <p>Configura tu domicilio en <button className="enlace-cuenta" onClick={irCuenta}>Cuenta</button> para recibir avisos de tu zona.</p>
        </div>
      </div>
    );
  }
  if (estado === 'sin_confirmacion') {
    return (
      <div className="avisos-zona-aviso advertencia">
        <Filter size={20} aria-hidden="true" />
        <div>
          <strong>Domicilio sin ruta confirmada</strong>
          <p>Tu domicilio está registrado pero el municipio aún no ha confirmado una ruta de recolección.</p>
        </div>
      </div>
    );
  }
  return null;
}

function ListaVacia({ filtro, estadoZona, irCuenta }: { filtro: FiltroAvisos; estadoZona: ListaAvisos['estado_zona']; irCuenta: () => void }) {
  if (filtro === 'mi_zona') {
    return (
      <div className="avisos-vacio isla">
        <Filter size={40} aria-hidden="true" />
        <h2>No hay avisos de tu zona</h2>
        <EstadoZona estado={estadoZona} irCuenta={irCuenta} />
      </div>
    );
  }
  return (
    <div className="avisos-vacio isla">
      <Bell size={40} aria-hidden="true" />
      <h2>{filtro === 'sin_leer' ? 'No tienes avisos sin leer' : 'No hay avisos disponibles'}</h2>
      <p>{filtro === 'sin_leer' ? 'Todos tus avisos están marcados como leídos.' : 'Cuando el municipio publique un aviso, aparecerá aquí.'}</p>
    </div>
  );
}

function esTransitorio(error: ErrorAvisos) {
  return error.status === 0 || error.status >= 500 || [408, 429].includes(error.status);
}
function esAcceso(error: ErrorAvisos) {
  return [401, 403, 409].includes(error.status);
}
function ErrorEstado({ error, onReintentar, irCuenta, lectura = false }: {
  error: ErrorAvisos; onReintentar: () => void; irCuenta: () => void; lectura?: boolean;
}) {
  return (
    <div className="avisos-error isla" role="alert">
      <X size={24} aria-hidden="true" />
      <div>
        <h2>{lectura ? 'No pudimos confirmar la lectura' : 'No pudimos cargar los avisos'}</h2>
        <p>{error.message}</p>
        <div className="avisos-acciones-error">
          {esTransitorio(error) && <button className="secundario" onClick={onReintentar}>Volver a consultar</button>}
          {esAcceso(error) && <button className="primario" onClick={irCuenta}>Revisar Cuenta</button>}
        </div>
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="avisos-cargando" role="status">
      <Loader2 size={28} className="girar" aria-hidden="true" />
      <p>Cargando avisos…</p>
    </div>
  );
}

function AvisosSinAcceso() {
  return (
    <div className="avisos-sin-acceso isla">
      <ShieldCheck size={32} aria-hidden="true" />
      <h2>Acceso pendiente</h2>
      <p>El acceso a Avisos todavía no está disponible en esta instalación.</p>
    </div>
  );
}

function AvisosSinSesion({ irCuenta }: { irCuenta: () => void }) {
  return (
    <div className="avisos-sin-acceso isla">
      <ShieldCheck size={32} aria-hidden="true" />
      <h2>Tu cuenta, tus avisos</h2>
      <p>Inicia sesión para consultar tus avisos municipales y respuestas a reportes.</p>
      <button className="primario" onClick={irCuenta}>Iniciar sesión desde Cuenta</button>
    </div>
  );
}

export function Avisos(props: Props) {
  if (props.sesion) return <AvisosSesion key={props.sesion.clave} {...props} sesion={props.sesion} />;
  if (!props.activo) return null;
  return <section className="avisos-panel" aria-label="Bandeja de avisos">
    <Encabezado onVolver={props.irInicio} />
    {!props.configurada ? <AvisosSinAcceso /> : props.cargandoSesion
      ? <p role="status">Comprobando tu sesión…</p>
      : <AvisosSinSesion irCuenta={props.irCuenta} />}
  </section>;
}

function errorDeAviso(error: unknown) {
  return error instanceof ErrorAvisos ? error : new ErrorAvisos(0, 'ERROR_RED');
}
type Pagina = ListaAvisos & { filtro: FiltroAvisos };

function AvisosSesion({
  sesion, activo, online, perfilSincronizado, irInicio, irCuenta, abrirReporte, abrirRuta, rutaDisponible, onContadorCambio,
}: Props & { sesion: SesionAvisos }) {
  const tokenRef = useRef(sesion.obtenerToken);
  tokenRef.current = sesion.obtenerToken;
  const api = useMemo(() => crearServicioAvisos(), []);
  const [total, setTotal] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<FiltroAvisos>('todos');
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<ErrorAvisos | null>(null);
  const [errorLectura, setErrorLectura] = useState<ErrorAvisos | null>(null);
  const [bloqueados, setBloqueados] = useState<Set<string>>(new Set());
  const vidaRef = useRef<AbortController | null>(null);
  const consultaRef = useRef<AbortController | null>(null);
  const pendientes = useRef(new Set<string>());
  const inciertos = useRef(new Set<string>());
  const errorPermanente = useRef<ErrorAvisos | null>(null);
  const activoAnterior = useRef(false);
  const perfilAnterior = useRef(false);

  useLayoutEffect(() => {
    const vida = new AbortController();
    vidaRef.current = vida;
    return () => {
      vida.abort();
      consultaRef.current?.abort();
    };
  }, []);

  const publicarTotal = useCallback((valor: number | null) => {
    setTotal(valor);
    onContadorCambio(sesion.clave, valor);
  }, [onContadorCambio, sesion.clave]);

  const consultar = useCallback(async (cursor: string | null = null, permitirAcceso = false) => {
    if (!vidaRef.current || vidaRef.current.signal.aborted || pendientes.current.size || !navigator.onLine ||
        (errorPermanente.current && !(permitirAcceso && esAcceso(errorPermanente.current)))) return;
    consultaRef.current?.abort();
    const control = new AbortController();
    consultaRef.current = control;
    const { signal } = control;
    setCargando(activo && !cursor);
    setCargandoMas(!!cursor);
    setError(null);
    try {
      const token = await obtenerTokenAvisos(tokenRef.current, signal);
      if (signal.aborted) return;
      if (!activo) {
        const resumen = await api.resumen(token, signal);
        if (!signal.aborted) {
          errorPermanente.current = null;
          publicarTotal(resumen.sin_leer_total);
        }
        return;
      }
      let lista;
      try {
        lista = await api.listar(token, filtro, 20, cursor, signal);
      } catch (causa) {
        if (!cursor || signal.aborted || !(causa instanceof ErrorAvisos) ||
            causa.status !== 400 || causa.codigo !== 'ENTRADA_INVALIDA') throw causa;
        lista = await api.listar(token, filtro, 20, null, signal);
        cursor = null;
      }
      if (signal.aborted) return;
      errorPermanente.current = null;
      publicarTotal(lista.sin_leer_total);
      if (cursor) {
        setPagina(anterior => {
          if (anterior?.filtro !== filtro) return { ...lista, filtro };
          const ids = new Set(anterior.avisos.map(aviso => aviso.id));
          return { ...lista, filtro, avisos: [...anterior.avisos, ...lista.avisos.filter(aviso => !ids.has(aviso.id))] };
        });
      } else {
        setPagina({ ...lista, filtro });
        inciertos.current.clear();
        setErrorLectura(anterior => anterior?.incierto ? null : anterior);
        setBloqueados(new Set());
      }
    } catch (causa) {
      if (signal.aborted) return;
      const fallo = errorDeAviso(causa);
      if (!esTransitorio(fallo)) errorPermanente.current = fallo;
      if (esAcceso(fallo)) {
        setPagina(null);
        publicarTotal(null);
      }
      setError(fallo);
    } finally {
      if (!signal.aborted) {
        setCargando(false);
        setCargandoMas(false);
      }
    }
  }, [activo, api, filtro, publicarTotal]);

  const consultarActual = useRef(consultar);
  useLayoutEffect(() => {
    consultarActual.current = consultar;
    const entrando = activo && !activoAnterior.current;
    const sincronizado = perfilSincronizado && !perfilAnterior.current;
    activoAnterior.current = activo;
    perfilAnterior.current = perfilSincronizado;
    // Volver a entrar permite comprobar si Cuenta ya resolvió un error de acceso.
    void consultarActual.current(null, entrando || sincronizado);
    return () => consultaRef.current?.abort();
  }, [activo, consultar, perfilSincronizado]);

  useEffect(() => {
    const revalidar = () => {
      if (document.visibilityState === 'visible') void consultarActual.current();
    };
    const alDesconectar = () => {
      consultaRef.current?.abort();
      setCargando(false);
      setCargandoMas(false);
    };
    window.addEventListener('online', revalidar);
    window.addEventListener('offline', alDesconectar);
    document.addEventListener('visibilitychange', revalidar);
    return () => {
      window.removeEventListener('online', revalidar);
      window.removeEventListener('offline', alDesconectar);
      document.removeEventListener('visibilitychange', revalidar);
    };
  }, []);

  async function marcarLeido(id: string) {
    const signal = vidaRef.current?.signal;
    if (!signal || signal.aborted || !navigator.onLine || (errorPermanente.current && esAcceso(errorPermanente.current)) ||
        pendientes.current.has(id) || inciertos.current.has(id)) return;
    pendientes.current.add(id);
    setBloqueados(new Set([...pendientes.current, ...inciertos.current]));
    if (!inciertos.current.size) setErrorLectura(null);
    consultaRef.current?.abort();
    setCargando(false);
    setCargandoMas(false);
    try {
      const token = await obtenerTokenAvisos(tokenRef.current, signal);
      if (signal.aborted) return;
      const resultado = await api.marcarLectura(token, id, signal);
      if (signal.aborted) return;
      publicarTotal(null);
      setPagina(anterior => anterior && ({
        ...anterior,
        avisos: anterior.filtro === 'sin_leer' ? anterior.avisos.filter(a => a.id !== id)
          : anterior.avisos.map(a => a.id === id ? { ...a, leido_en: resultado.leido_en } : a),
      }));
    } catch (causa) {
      if (signal.aborted) return;
      const fallo = errorDeAviso(causa);
      if (fallo.incierto) {
        inciertos.current.add(id);
        publicarTotal(null);
      }
      if (esAcceso(fallo)) {
        errorPermanente.current = fallo;
        setPagina(null);
        publicarTotal(null);
      }
      if (fallo.status !== 404) setErrorLectura(fallo);
    } finally {
      pendientes.current.delete(id);
      if (!signal.aborted) {
        setBloqueados(new Set([...pendientes.current, ...inciertos.current]));
        if (!pendientes.current.size) void consultarActual.current();
      }
    }
  }

  if (!activo) return null;
  const actual = pagina?.filtro === filtro ? pagina : null;
  const volverAConsultar = () => void consultar();
  return (
    <section className="avisos-panel" aria-label="Bandeja de avisos">
      <Encabezado onVolver={irInicio} />
      <Descripcion />
      {total !== null && total > 0 && <p className="avisos-contador-global" aria-live="polite">{total > 99 ? '99+' : total} {total === 1 ? 'aviso sin leer' : 'avisos sin leer'}</p>}
      <FiltrosBarra filtro={filtro} onCambiar={valor => {
        if (valor === filtro) return;
        consultaRef.current?.abort();
        setFiltro(valor);
        if (!errorPermanente.current) setError(null);
      }} />
      {!online && <p role="status">Sin conexión. Los avisos pueden estar desactualizados.</p>}
      {error && <ErrorEstado error={error} onReintentar={volverAConsultar} irCuenta={irCuenta} />}
      {errorLectura && <ErrorEstado error={errorLectura} onReintentar={volverAConsultar} irCuenta={irCuenta} lectura />}
      {cargando && !actual && <Cargando />}
      {actual && (actual.avisos.length === 0 && !actual.cursor_siguiente
        ? <ListaVacia filtro={filtro} estadoZona={actual.estado_zona} irCuenta={irCuenta} />
        : <>
          <ul className="avisos-lista">
            {actual.avisos.map(aviso => (
              <li key={aviso.id}>
                <TarjetaAviso aviso={aviso} bloqueado={!online || bloqueados.has(aviso.id)} onMarcarLeido={marcarLeido}
                  onAbrirReporte={abrirReporte}
                  onAbrirRuta={aviso.referencia?.tipo === 'ruta' && rutaDisponible(aviso.referencia.id) ? abrirRuta : undefined} />
              </li>
            ))}
          </ul>
          {actual.cursor_siguiente && (
            <button className="avisos-cargar-mas primario" onClick={() => void consultar(actual.cursor_siguiente)}
              disabled={cargandoMas || cargando || !online || pendientes.current.size > 0}>
              {cargandoMas ? 'Cargando más avisos…' : 'Cargar más avisos'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
