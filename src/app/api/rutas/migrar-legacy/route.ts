import { NextResponse, NextRequest } from 'next/server';
import { autorizar_administracion, ErrorAdministrativo, respuesta_error_administrativo } from '@/lib/autorizacion';
import { conectar_base_datos } from '@/lib/base_datos';
import { ModeloRuta } from '@/modelos/Ruta';
import { normalizarRuta } from '@/lib/rutas_mapa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(_peticion: NextRequest) {
  try {
    // 1. Verificación de permisos de administración
    await autorizar_administracion('rutas:gestionar');
    await conectar_base_datos();

    // 2. Obtener todas las rutas sin filtrar para detectar inconsistencias legacy
    const todasLasRutas = await ModeloRuta.find({}).lean();

    let migradas = 0;
    const detalles: Array<{
      id: string;
      nombre: string;
      cambios: string[];
    }> = [];

    for (const doc of todasLasRutas) {
      const normalizada = normalizarRuta(doc);
      if (!normalizada) continue;

      const camposActualizar: Record<string, unknown> = {};
      const cambiosDetectados: string[] = [];

      // Validar trazado GeoJSON
      const tieneGeoJsonValido =
        doc.trazado_geojson &&
        typeof doc.trazado_geojson === 'object' &&
        Array.isArray(doc.trazado_geojson.coordinates) &&
        doc.trazado_geojson.coordinates.length >= 2;

      if (!tieneGeoJsonValido && normalizada.trazado_geojson) {
        camposActualizar.trazado_geojson = normalizada.trazado_geojson;
        cambiosDetectados.push('trazado_geojson reconstruido desde coordenadas legacy');
      }

      // Validar id_ruta
      if (!doc.id_ruta || typeof doc.id_ruta !== 'string' || !doc.id_ruta.trim()) {
        camposActualizar.id_ruta = normalizada.id_ruta;
        cambiosDetectados.push(`id_ruta asignado: ${normalizada.id_ruta}`);
      }

      // Validar color_mapa
      if (!doc.color_mapa || !/^#[\da-f]{6}$/i.test(doc.color_mapa)) {
        camposActualizar.color_mapa = normalizada.color_mapa;
        cambiosDetectados.push(`color_mapa normalizado a ${normalizada.color_mapa}`);
      }

      // Validar estado activa
      if (doc.activa === undefined || doc.activa === null) {
        camposActualizar.activa = true;
        cambiosDetectados.push('campo activa inicializado en true');
      }

      // Validar nombre
      if (!doc.nombre || typeof doc.nombre !== 'string' || !doc.nombre.trim()) {
        camposActualizar.nombre = normalizada.nombre;
        cambiosDetectados.push('nombre asignado por defecto');
      }

      // Validar diasRecoleccion y horarioHabitual
      if (!Array.isArray(doc.diasRecoleccion) || doc.diasRecoleccion.length === 0) {
        camposActualizar.diasRecoleccion = normalizada.diasRecoleccion;
        cambiosDetectados.push('diasRecoleccion asignados');
      }

      if (!doc.horarioHabitual || !doc.horarioHabitual.horaInicio || !doc.horarioHabitual.horaFin) {
        camposActualizar.horarioHabitual = normalizada.horarioHabitual;
        cambiosDetectados.push('horarioHabitual asignado');
      }

      if (Object.keys(camposActualizar).length > 0) {
        await ModeloRuta.updateOne(
          { _id: doc._id },
          {
            $set: {
              ...camposActualizar,
              fecha_actualizacion: new Date(),
            },
          }
        );
        migradas++;
        detalles.push({
          id: String(doc._id || doc.id_ruta),
          nombre: String(doc.nombre || normalizada.nombre),
          cambios: cambiosDetectados,
        });
      }
    }

    return NextResponse.json({
      exito: true,
      mensaje: `Migración completada. ${migradas} rutas actualizadas de ${todasLasRutas.length} evaluadas.`,
      total_analizadas: todasLasRutas.length,
      total_migradas: migradas,
      detalles,
    });
  } catch (error: unknown) {
    if (error instanceof ErrorAdministrativo) {
      return respuesta_error_administrativo(error);
    }
    console.error('[MigrarLegacyRutas] Error en migración:', error);
    return NextResponse.json(
      {
        ok: false,
        exito: false,
        codigo: 'ERROR_MIGRACION',
        mensaje: 'Ocurrió un error al procesar la migración de rutas legacy.',
      },
      { status: 500 }
    );
  }
}
