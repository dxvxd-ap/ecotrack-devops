import { NextResponse, NextRequest } from 'next/server';
import { autorizar_administracion, ErrorAdministrativo, respuesta_error_administrativo } from '@/lib/autorizacion';
import { conectar_base_datos } from '@/lib/base_datos';
import { ModeloRuta } from '@/modelos/Ruta';
import { ErrorRuta, validarRutaActiva, esRutaPublicable, validarCreacionRuta, validarActualizacionRuta, validarBajaRuta } from '@/contratos/rutas';
import { normalizarRuta } from '@/lib/rutas_mapa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function respuesta(datos: unknown, mensaje?: string) {
  return NextResponse.json(
    { exito: true, ...(mensaje ? { mensaje } : {}), datos },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
function fallo(error: unknown) {
  if (error instanceof ErrorAdministrativo) return respuesta_error_administrativo(error);
  const mongo = error as { code?: number; name?: string } | null;
  const conocido = error instanceof ErrorRuta ? error : mongo?.code === 11000
    ? new ErrorRuta(409, 'RUTA_EN_CONFLICTO', 'Ya existe una ruta con ese identificador')
    : mongo?.name === 'ValidationError' || mongo?.name === 'CastError' || mongo?.name === 'SyntaxError'
      ? new ErrorRuta(400, 'ENTRADA_INVALIDA', 'Los datos de la ruta no son válidos')
      : new ErrorRuta(503, 'BASE_DATOS_NO_DISPONIBLE', 'No se pudo confirmar la operación en la base de datos');
  return NextResponse.json({ ok: false, exito: false, mensaje: conocido.message, codigo: conocido.codigo },
    { status: conocido.status, headers: { 'Cache-Control': 'no-store' } });
}
function noEncontrada(): never { throw new ErrorRuta(404, 'RUTA_NO_ENCONTRADA', 'No se encontró la ruta indicada'); }

async function verificarIndice() {
  const indices = await ModeloRuta.collection.indexes();
  if (!indices.some(i => i.unique === true && Object.keys(i.key).length === 1 && i.key.id_ruta === 1 &&
      !i.sparse && !i.partialFilterExpression)) {
    throw new ErrorRuta(503, 'INDICE_NO_DISPONIBLE', 'El catálogo requiere un índice único completo de id_ruta');
  }
}

export async function GET() {
  try {
    await conectar_base_datos();
    let consulta: any = ModeloRuta.find({ activa: true });
    if (typeof consulta?.populate === 'function') {
      consulta = consulta.populate('camionAsignadoId', 'numero_unidad modelo matricula estado');
    }
    const rutas = await consulta.sort({ fecha_creacion: -1 });
    const normalizadas = rutas
      .map((r: any) => normalizarRuta(r.toObject ? r.toObject() : r))
      .filter((r: any) => r && r.activa !== false && esRutaPublicable(r));
    return respuesta(normalizadas);
  } catch (error: unknown) { return fallo(error); }
}
export async function POST(peticion: NextRequest) {
  try {
    await autorizar_administracion('rutas:gestionar');
    const datos = validarCreacionRuta(await peticion.json());
    await conectar_base_datos();
    await verificarIndice();
    // Sin _id del cliente: Mongoose genera ObjectId. No responder hasta confirmar la escritura.
    const [ruta] = await ModeloRuta.create([datos], { w: 'majority' });
    if (!ruta) throw new Error('Persistencia sin documento confirmado');
    return respuesta(ruta, 'Ruta registrada exitosamente');
  } catch (error: unknown) { return fallo(error); }
}
export async function PUT(peticion: NextRequest) {
  try {
    await autorizar_administracion('rutas:gestionar');
    const { selector, cambios } = validarActualizacionRuta(await peticion.json());
    await conectar_base_datos();
    await verificarIndice();
    // Si llegan ambos selectores deben identificar EL MISMO documento. Nunca upsert ni filtro vacío.
    const anterior = await ModeloRuta.findOne(selector).lean();
    if (!anterior) noEncontrada();
    const resultante = { ...anterior, ...cambios };
    if (resultante.activa === true) validarRutaActiva(resultante);
    // Comparación atómica de todos los campos que participan en la validación.
    // No depende de __v ni requiere migrar documentos existentes.
    const campos = [
      'id_ruta', 'nombre', 'descripcion', 'trazado_geojson', 'color_mapa',
      'distancia_estimada_km', 'duracion_estimada_min', 'activa',
      'diasRecoleccion', 'horarioHabitual', 'camionAsignadoId', 'conductorHabitualId'
    ];
    const condiciones = campos.map(campo => Object.hasOwn(anterior, campo)
      ? { [campo]: { $eq: (anterior as Record<string, unknown>)[campo] } }
      : { [campo]: { $exists: false } });
    const ruta = await ModeloRuta.findOneAndUpdate({ _id: anterior._id, $and: condiciones }, { $set: cambios },
      { new: true, runValidators: true, upsert: false, writeConcern: { w: 'majority' } });
    if (!ruta) throw new ErrorRuta(409, 'RUTA_EN_CONFLICTO', 'La ruta cambió durante la operación; vuelve a consultarla');
    return respuesta(ruta, 'Ruta actualizada exitosamente');
  } catch (error: unknown) { return fallo(error); }
}
export async function DELETE(peticion: NextRequest) {
  try {
    await autorizar_administracion('rutas:gestionar');
    const selector = validarBajaRuta(new URL(peticion.url).searchParams);
    await conectar_base_datos();
    await verificarIndice();
    const ruta = await ModeloRuta.findOneAndUpdate(selector, { $set: { activa: false } },
      { new: true, runValidators: true, upsert: false, writeConcern: { w: 'majority' } });
    if (!ruta) noEncontrada();
    return respuesta(ruta, 'Ruta eliminada con éxito');
  } catch (error: unknown) { return fallo(error); }
}
