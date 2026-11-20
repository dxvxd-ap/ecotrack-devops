export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloCamion } from "@/modelos/Camion";
import { ModeloAsignacionCalendario } from "@/modelos/AsignacionCalendario";
import { ModeloAlertaCiudadano } from "@/modelos/AlertaCiudadano";
import { ModeloHistorialAlerta } from "@/modelos/HistorialAlerta";

// Función matemática en español para calcular distancia geodésica (fórmula de Haversine)
function calcular_distancia_metros(
  latitud1: number,
  longitud1: number,
  latitud2: number,
  longitud2: number
): number {
  const RADIO_TIERRA_METROS = 6371000;
  const rad = (grados: number) => (grados * Math.PI) / 180;

  const d_latitud = rad(latitud2 - latitud1);
  const d_longitud = rad(longitud2 - longitud1);

  const a =
    Math.sin(d_latitud / 2) * Math.sin(d_latitud / 2) +
    Math.cos(rad(latitud1)) *
      Math.cos(rad(latitud2)) *
      Math.sin(d_longitud / 2) *
      Math.sin(d_longitud / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIO_TIERRA_METROS * c;
}

export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const cuerpo = await peticion.json();
    const { camion_id, latitud, longitud, velocidad_kmh } = cuerpo;

    if (!camion_id || latitud === undefined || longitud === undefined) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere camion_id, latitud y longitud" },
        { status: 400 }
      );
    }

    // 1. Actualizar telemetría del camión
    const camion = await ModeloCamion.findByIdAndUpdate(
      camion_id,
      {
        ultima_latitud: latitud,
        ultima_longitud: longitud,
        ultima_velocidad_kmh: velocidad_kmh || 0,
        ultima_actualizacion_gps: new Date(),
      },
      { new: true }
    );

    if (!camion) {
      return NextResponse.json(
        { exito: false, mensaje: "Camión no encontrado" },
        { status: 404 }
      );
    }

    // 2. Buscar si el camión tiene una asignación 'en_progreso' en el calendario
    const fecha_actual = new Date().toISOString().split("T")[0];
    const asignacion_activa = await ModeloAsignacionCalendario.findOne({
      camion_id: camion._id,
      fecha: fecha_actual,
      estado: "en_progreso",
    });

    const alertas_disparadas: any[] = [];

    // 3. Evaluar proximidad con las casas de los ciudadanos suscritas
    const zonas_ciudadanos = await ModeloAlertaCiudadano.find({
      notificaciones_habilitadas: true,
    });

    const ahora = new Date();

    for (const zona of zonas_ciudadanos) {
      const distancia = calcular_distancia_metros(
        latitud,
        longitud,
        zona.latitud,
        zona.longitud
      );

      // Si el camión está dentro del radio de cobertura
      if (distancia <= zona.radio_cobertura_metros) {
        // Evitar spam: no reenviar si ya se alertó en los últimos 15 minutos
        const ultima_vez = zona.ultima_notificacion_enviada
          ? new Date(zona.ultima_notificacion_enviada).getTime()
          : 0;
        const diferencia_minutos = (ahora.getTime() - ultima_vez) / (1000 * 60);

        if (diferencia_minutos >= 15) {
          const mensaje_alerta =
            "El camión de basura está cerca de tu zona o está a punto de pasar.";

          const nuevo_registro = await ModeloHistorialAlerta.create({
            ciudadano_id: zona.ciudadano_id,
            camion_id: camion._id,
            ruta_id: asignacion_activa?.ruta_id || null,
            mensaje: mensaje_alerta,
            distancia_metros: Math.round(distancia),
            leido: false,
            fecha_envio: ahora,
          });

          zona.ultima_notificacion_enviada = ahora;
          await zona.save();

          alertas_disparadas.push({
            ciudadano_id: zona.ciudadano_id,
            nombre_ciudadano: zona.nombre_ciudadano,
            distancia_metros: Math.round(distancia),
            alerta_id: nuevo_registro._id,
          });
        }
      }
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Telemetría GPS procesada",
      datos: {
        camion: {
          numero_unidad: camion.numero_unidad,
          matricula: camion.matricula,
          latitud,
          longitud,
          velocidad_kmh,
        },
        alertas_disparadas,
        total_alertas: alertas_disparadas.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al procesar simulación GPS", detalle: error.message },
      { status: 500 }
    );
  }
}

