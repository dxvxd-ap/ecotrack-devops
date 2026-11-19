import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  MapPin,
  Send,
  CheckCircle2,
  LocateFixed,
  Route,
  RefreshCw,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { enviarReporteCiudadano } from '../servicios/reportes.ts';
import type { ColeccionRutas } from '../servicios/contratos.ts';

const OPCIONES_PROBLEMA = [
  {
    id: 'no_paso_camion',
    etiqueta: 'El camión no pasó',
    descripcion: 'Horario oficial concluido sin paso de la unidad',
    icono: '🚛',
  },
  {
    id: 'retraso',
    etiqueta: 'Retraso en recolección',
    descripcion: 'El camión no ha llegado a la hora habitual',
    icono: '⏳',
  },
  {
    id: 'basura_acumulada',
    etiqueta: 'Basura acumulada',
    descripcion: 'Contenedores o esquinas saturadas de residuos',
    icono: '🗑️',
  },
  {
    id: 'otro',
    etiqueta: 'Otro problema',
    descripcion: 'Bolsas rotas, ramas u otra eventualidad',
    icono: '⚠️',
  },
] as const;

type TipoProblema = typeof OPCIONES_PROBLEMA[number]['id'];

interface PropsReportarProblema {
  rutas: ColeccionRutas;
  domicilioCoordenadas?: [number, number] | null;
  onReporteExitoso?: () => void;
}

export function ReportarProblema({ rutas, domicilioCoordenadas, onReporteExitoso }: PropsReportarProblema) {
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoProblema>('no_paso_camion');
  const [titulo, setTitulo] = useState('El camión no pasó por mi calle');
  const [descripcion, setDescripcion] = useState('');
  const [rutaId, setRutaId] = useState<string>('');
  const [direccion, setDireccion] = useState('');
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');

  // GPS
  const [latitud, setLatitud] = useState<number>(domicilioCoordenadas ? domicilioCoordenadas[1] : 20.4514);
  const [longitud, setLongitud] = useState<number>(domicilioCoordenadas ? domicilioCoordenadas[0] : -97.0886);
  const [obteniendoGPS, setObteniendoGPS] = useState(false);
  const [gpsCapturado, setGpsCapturado] = useState(Boolean(domicilioCoordenadas));

  const [enviando, setEnviando] = useState(false);
  const [enviadoExito, setEnviadoExito] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Capturar GPS automáticamente al montar si no hay coordenadas previas
  useEffect(() => {
    if (!gpsCapturado) {
      void capturarUbicacionGPS();
    }
  }, []);

  async function capturarUbicacionGPS() {
    setObteniendoGPS(true);
    setErrorEnvio(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        setLatitud(pos.coords.latitude);
        setLongitud(pos.coords.longitude);
        setGpsCapturado(true);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLatitud(pos.coords.latitude);
            setLongitud(pos.coords.longitude);
            setGpsCapturado(true);
            setObteniendoGPS(false);
          },
          (err) => {
            console.warn('[GPS] Error al obtener geolocalización:', err.message);
            // Usar coordenadas por defecto de Gutiérrez Zamora
            setLatitud(20.4514);
            setLongitud(-97.0886);
            setGpsCapturado(true);
            setObteniendoGPS(false);
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
        return;
      }
    } catch (e: any) {
      console.warn('[GPS] Fallo capturando ubicación:', e);
      setLatitud(20.4514);
      setLongitud(-97.0886);
      setGpsCapturado(true);
    } finally {
      setObteniendoGPS(false);
    }
  }

  function alCambiarTipo(nuevoTipo: TipoProblema) {
    setTipoSeleccionado(nuevoTipo);
    if (nuevoTipo === 'no_paso_camion') {
      setTitulo('El camión no pasó por mi calle');
    } else if (nuevoTipo === 'retraso') {
      setTitulo('Retraso en el horario de recolección');
    } else if (nuevoTipo === 'basura_acumulada') {
      setTitulo('Acumulación de basura en la vía pública');
    } else {
      setTitulo('Incidencia en servicio de recolección');
    }
  }

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();

    if (!descripcion.trim()) {
      setErrorEnvio('Por favor describe brevemente lo sucedido.');
      return;
    }

    try {
      setEnviando(true);
      setErrorEnvio(null);

      const resultado = await enviarReporteCiudadano({
        tipo: tipoSeleccionado,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        rutaId: rutaId || null,
        lat: latitud,
        lng: longitud,
        direccion: direccion.trim(),
        nombre: nombre.trim(),
        contacto: contacto.trim(),
      });

      if (resultado.exito) {
        setEnviadoExito(true);
        if (onReporteExitoso) onReporteExitoso();
      } else {
        setErrorEnvio(resultado.mensaje);
      }
    } catch (err: any) {
      setErrorEnvio(err.message || 'Error de conexión al enviar reporte');
    } finally {
      setEnviando(false);
    }
  }

  function reiniciarFormulario() {
    setEnviadoExito(false);
    setDescripcion('');
    setDireccion('');
  }

  if (enviadoExito) {
    return (
      <section className="panel" style={{ padding: '24px 16px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', padding: 12, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', marginBottom: 12 }}>
          <CheckCircle2 size={40} />
        </div>
        <p className="eyebrow" style={{ color: '#10b981' }}>REPORTE REGISTRADO CON ÉXITO</p>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '8px 0' }}>Gracias por tu colaboración ciudadana</h2>
        <p style={{ fontSize: '0.875rem', opacity: 0.85, marginBottom: 20 }}>
          Tu reporte fue transmitido al Centro de Control de Gutiérrez Zamora. Nuestro equipo operativo dará seguimiento a la cuadrilla correspondiente.
        </p>
        <button
          type="button"
          className="primario"
          onClick={reiniciarFormulario}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Sparkles size={16} />
          <span>Generar otro reporte</span>
        </button>
      </section>
    );
  }

  return (
    <section className="panel" style={{ padding: '16px 12px', textAlign: 'left' }}>
      <header style={{ marginBottom: 16 }}>
        <p className="eyebrow" style={{ color: '#2f63ff', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={15} />
          <span>ATENCIÓN CIUDADANA // ECOTRACK</span>
        </p>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '4px 0 6px 0', lineHeight: 1.2 }}>
          Reportar un problema
        </h1>
        <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>
          Notifica incidencias en tu calle para que el equipo de recolección ajuste la logística.
        </p>
      </header>

      {errorEnvio && (
        <div style={{ padding: 10, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 10, color: '#ef4444', fontSize: '0.8rem', marginBottom: 12 }}>
          {errorEnvio}
        </div>
      )}

      <form onSubmit={manejarEnvio} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Selector de Tipo de Problema */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.7, display: 'block', marginBottom: 6 }}>
            ¿Qué problema deseas reportar?
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {OPCIONES_PROBLEMA.map((opc) => {
              const activo = tipoSeleccionado === opc.id;
              return (
                <button
                  type="button"
                  key={opc.id}
                  onClick={() => alCambiarTipo(opc.id)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 12,
                    border: activo ? '2px solid #2f63ff' : '1px solid rgba(150, 150, 150, 0.25)',
                    background: activo ? 'rgba(47, 99, 255, 0.12)' : 'rgba(150, 150, 150, 0.05)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{opc.icono}</span>
                  <strong style={{ fontSize: '0.8rem', color: activo ? '#2f63ff' : 'inherit' }}>
                    {opc.etiqueta}
                  </strong>
                  <span style={{ fontSize: '0.65rem', opacity: 0.7, lineHeight: 1.1 }}>
                    {opc.descripcion}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Captura de Ubicación GPS */}
        <div style={{ padding: 10, borderRadius: 12, background: 'rgba(150, 150, 150, 0.08)', border: '1px solid rgba(150, 150, 150, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'between', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} color="#10b981" />
              <span>UBICACIÓN GPS DEL REPORTE:</span>
            </span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', display: 'block', marginTop: 2 }}>
              {latitud.toFixed(4)}, {longitud.toFixed(4)} (G. Zamora, Ver.)
            </span>
          </div>
          <button
            type="button"
            disabled={obteniendoGPS}
            onClick={() => void capturarUbicacionGPS()}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(150,150,150,0.3)', background: 'transparent', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            title="Actualizar coordenadas GPS"
          >
            {obteniendoGPS ? <RefreshCw size={12} className="spin" /> : <LocateFixed size={12} />}
            <span>{obteniendoGPS ? 'GPS...' : 'Actualizar'}</span>
          </button>
        </div>

        {/* Dirección o Referencia */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.7, display: 'block', marginBottom: 4 }}>
            Calle y número o referencia:
          </label>
          <input
            type="text"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            placeholder="Ej: Av. Hidalgo esq. Arista, frente al parque"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(150, 150, 150, 0.25)', background: 'rgba(150, 150, 150, 0.05)', fontSize: '0.85rem' }}
          />
        </div>

        {/* Selector de Ruta (Opcional) */}
        {rutas.features.length > 0 && (
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.7, display: 'block', marginBottom: 4 }}>
              Ruta de recolección (Opcional):
            </label>
            <select
              value={rutaId}
              onChange={(e) => setRutaId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(150, 150, 150, 0.25)', background: 'rgba(150, 150, 150, 0.05)', fontSize: '0.85rem' }}
            >
              <option value="">-- No sé qué ruta corresponde --</option>
              {rutas.features.map((r) => (
                <option key={r.properties.id} value={r.properties.id}>
                  {r.properties.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Descripción detallada */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.7, display: 'block', marginBottom: 4 }}>
            Detalles del problema: *
          </label>
          <textarea
            required
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Describe brevemente la situación para que la cuadrilla sepa qué atender..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(150, 150, 150, 0.25)', background: 'rgba(150, 150, 150, 0.05)', fontSize: '0.85rem' }}
          />
        </div>

        {/* Datos de contacto (Opcional) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, opacity: 0.7, display: 'block', marginBottom: 2 }}>
              Tu nombre (Opcional):
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: María Hernández"
              style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(150, 150, 150, 0.25)', background: 'rgba(150, 150, 150, 0.05)', fontSize: '0.8rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.7rem', fontWeight: 600, opacity: 0.7, display: 'block', marginBottom: 2 }}>
              Teléfono / WhatsApp:
            </label>
            <input
              type="tel"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Ej: 766 123 4567"
              style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(150, 150, 150, 0.25)', background: 'rgba(150, 150, 150, 0.05)', fontSize: '0.8rem' }}
            />
          </div>
        </div>

        {/* Botón de Envío */}
        <button
          type="submit"
          disabled={enviando || !descripcion.trim()}
          className="primario"
          style={{ width: '100%', padding: 12, borderRadius: 12, fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginTop: 6 }}
        >
          {enviando ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
          <span>{enviando ? 'Transmitiendo reporte...' : 'Enviar Reporte al Municipio'}</span>
        </button>
      </form>
    </section>
  );
}
