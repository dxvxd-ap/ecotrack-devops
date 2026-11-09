import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloCamion } from "@/modelos/Camion";
import { ModeloHistorialUbicacion } from "@/modelos/HistorialUbicacion";
import { ModeloAlertaCiudadano } from "@/modelos/AlertaCiudadano";
import { ModeloHistorialAlerta } from "@/modelos/HistorialAlerta";

/**
 * Fórmula de Haversine para calcular distancia en kilómetros entre dos puntos
 */
function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * POST /api/v1/telemetria/actualizar-ubicacion
 * Opción A: Webhook HTTP compatible con Traccar o dispositivos que envían telemetría JSON
 */
export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();

    const cuerpo = await peticion.json();

    // Soporte para formato Traccar Webhook o formato nativo EcoTrack
    let imei = cuerpo?.imei || cuerpo?.device?.uniqueId || cuerpo?.uniqueId;
    let latitud = cuerpo?.latitud ?? cuerpo?.position?.latitude ?? cuerpo?.latitude;
    let longitud = cuerpo?.longitud ?? cuerpo?.position?.longitude ?? cuerpo?.longitude;
    let velocidad = cuerpo?.velocidad ?? cuerpo?.position?.speed ?? cuerpo?.speed ?? 0;
    let rumbo = cuerpo?.rumbo ?? cuerpo?.position?.course ?? cuerpo?.course ?? 0;
    let matricula = cuerpo?.matricula || cuerpo?.device?.name;
    let estadoIgnicion = cuerpo?.ignicion ?? cuerpo?.position?.attributes?.ignition ?? true;
    let bateria = cuerpo?.bateria ?? cuerpo?.position?.attributes?.batteryLevel ?? 100;
    let fechaGps = cuerpo?.fecha_gps ? new Date(cuerpo.fecha_gps) : (cuerpo?.position?.fixTime ? new Date(cuerpo.position.fixTime) : new Date());

    if (latitud === undefined || longitud === undefined) {
      return NextResponse.json(
        { exito: false, mensaje: "Latitud y longitud son requeridas." },
        { status: 400 }
      );
    }

    latitud = Number(latitud);
    longitud = Number(longitud);

    // Buscar camión por IMEI o por matrícula
    let camion = null;
    if (imei) {
      camion = await ModeloCamion.findOne({ imei_gps: imei });
    }
    if (!camion && matricula) {
      camion = await ModeloCamion.findOne({ matricula: matricula.toUpperCase() });
    }
    if (!camion) {
      // Buscar primer camión disponible como fallback para pruebas de telemetría
      camion = await ModeloCamion.findOne({ activo: true });
    }

    if (!camion) {
      return NextResponse.json(
        { exito: false, mensaje: "No se encontró ningún camión asociado para este reporte GPS." },
        { status: 404 }
      );
    }

    // Actualizar datos del camión
    camion.ultima_latitud = latitud;
    camion.ultima_longitud = longitud;
    camion.ubicacion = {
      type: "Point",
      coordinates: [longitud, latitud],
    };
    camion.ultima_velocidad_kmh = Number(velocidad);
    camion.rumbo_grados = Number(rumbo);
    camion.estado_ignicion = Boolean(estadoIgnicion);
    camion.bateria_porcentaje = Number(bateria);
    camion.ultima_actualizacion_gps = fechaGps;
    if (velocidad > 3) {
      camion.estado = "en_ruta";
    }

    await camion.save();

    // Guardar en HistorialUbicacion para auditoría y trazabilidad
    await ModeloHistorialUbicacion.create({
      camion_id: camion._id,
      matricula: camion.matricula,
      imei_gps: imei || camion.imei_gps,
      ubicacion: {
        type: "Point",
        coordinates: [longitud, latitud],
      },
      velocidad_kmh: Number(velocidad),
      rumbo_grados: Number(rumbo),
      ignicion: Boolean(estadoIgnicion),
      bateria_porcentaje: Number(bateria),
      origen_dato: "TRACCAR_WEBHOOK",
      fecha_hora_gps: fechaGps,
    });

    // Evaluación en segundo plano de alertas ciudadanas de proximidad (Gutiérrez Zamora)
    const alertasActivas = await ModeloAlertaCiudadano.find({ notificaciones_habilitadas: true });
    const radioNotificacionKm = 0.5; // 500 metros
    let notificacionesGeneradas = 0;

    for (const alerta of alertasActivas) {
      const distancia = calcularDistanciaKm(
        latitud,
        longitud,
        alerta.latitud,
        alerta.longitud
      );

      if (distancia <= radioNotificacionKm) {
        // Evitar duplicar historial en menos de 30 minutos
        const fechaLimite = new Date(Date.now() - 30 * 60 * 1000);
        const yaNotificado = await ModeloHistorialAlerta.findOne({
          alerta_ciudadano_id: alerta._id,
          camion_id: camion._id,
          fecha_envio: { $gte: fechaLimite },
        });

        if (!yaNotificado) {
          await ModeloHistorialAlerta.create({
            alerta_ciudadano_id: alerta._id,
            camion_id: camion._id,
            distancia_metros: Math.round(distancia * 1000),
            mensaje: `El camión recolector ${camion.numero_unidad} está a ${Math.round(distancia * 1000)}m de tu domicilio en ${alerta.etiqueta_zona}.`,
            fecha_envio: new Date(),
          });
          notificacionesGeneradas++;
        }
      }
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Telemetría procesada exitosamente en Gutiérrez Zamora.",
      datos: {
        camion: camion.numero_unidad,
        matricula: camion.matricula,
        coordenadas: [longitud, latitud],
        velocidad: camion.ultima_velocidad_kmh,
        alertas_disparadas: notificacionesGeneradas,
      },
    });
  } catch (error: any) {
    console.error("Error al procesar webhook de telemetría:", error);
    return NextResponse.json(
      { exito: false, mensaje: "Error interno procesando telemetría.", error: error?.message },
      { status: 500 }
    );
  }
}
