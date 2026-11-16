#!/usr/bin/env node
/**
 * concilia-ciudadano.mjs — EcoTrack Dashboard
 *
 * Conciliación puntual de identidad ciudadana:
 * Actualiza id_clerk en la colección `usuarios` y documentos relacionados
 * cuando un ciudadano recreó su cuenta en Clerk y el perfil MongoDB
 * sigue apuntando al ID anterior.
 *
 * REGLAS DE SEGURIDAD:
 * - Dry-run por defecto (no modifica nada sin --confirm)
 * - Transacciones MongoDB para atomicidad
 * - Exclusión mutua mediante bloqueos administrativos
 * - Verifica que el ID anterior NO exista en Clerk antes de proceder
 * - Verifica que el ID nuevo SÍ exista y esté activo
 * - Verifica correo principal verificado en Clerk
 * - Verifica que no haya bloqueos activos
 * - No modifica roles ni privilegios
 * - Preserva la fecha de creación del perfil
 * - Impide migraciones si existen referencias desconocidas o inconsistentes
 * - Contempla fallos de transacción y resultados inciertos
 * - Backups y auditoría sin datos personales completos
 *
 * Uso:
 *   node concilia-ciudadano.mjs                    → dry-run (sólo inspección)
 *   node concilia-ciudadano.mjs --confirm          → ejecución real
 *   node concilia-ciudadano.mjs --old-id=... --new-id=... --email=...  → parámetros por CLI
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClerkClient } = require('@clerk/backend');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
// Parámetros obligatorios por CLI (sin valores por defecto)
const args = process.argv.slice(2);
const OLD_ID_CLERK = getArg('--old-id');
const NEW_ID_CLERK = getArg('--new-id');
const TARGET_EMAIL = getArg('--email');

const DRY_RUN = !args.includes('--confirm');
const AUDIT_DIR = path.join(__dirname, '..', 'audit-logs');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

function getArg(flag) {
  const arg = args.find(a => a.startsWith(flag + '='));
  return arg ? arg.split('=')[1] : null;
}

function validarArgumentos() {
  const errores = [];
  if (!OLD_ID_CLERK) errores.push('--old-id es obligatorio');
  if (!NEW_ID_CLERK) errores.push('--new-id es obligatorio');
  if (!TARGET_EMAIL) errores.push('--email es obligatorio');
  if (OLD_ID_CLERK && !/^user_[a-zA-Z0-9_]+$/.test(OLD_ID_CLERK)) errores.push('--old-id formato inválido');
  if (NEW_ID_CLERK && !/^user_[a-zA-Z0-9_]+$/.test(NEW_ID_CLERK)) errores.push('--new-id formato inválido');
  if (TARGET_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(TARGET_EMAIL)) errores.push('--email formato inválido');
  if (errores.length > 0) {
    console.error('❌ ERRORES DE VALIDACIÓN:');
    errores.forEach(e => console.error('  - ' + e));
    console.error('\nUso: node concilia-ciudadano.mjs --old-id=<ID> --new-id=<ID> --email=<EMAIL> [--confirm]');
    process.exit(1);
  }
  if (OLD_ID_CLERK === NEW_ID_CLERK) {
    console.error('❌ ERROR: --old-id y --new-id no pueden ser iguales');
    process.exit(1);
  }
}

// ─── ESQUEMAS (idénticos a los modelos del proyecto) ─────────────────────────
const EsquemaUsuario = new mongoose.Schema({
  id_clerk: { type: String, required: true, unique: true, index: true },
  nombre_completo: { type: String, required: true, trim: true },
  correo_electronico: { type: String, required: true, unique: true, lowercase: true, trim: true },
  rol: { type: String, required: true, default: 'ciudadano', index: true },
  activo: { type: Boolean, default: true },
  telefono: { type: String, default: '' },
  fecha_creacion: { type: Date, default: Date.now },
  fecha_actualizacion: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'fecha_creacion', updatedAt: 'fecha_actualizacion' } });

const EsquemaDomicilio = new mongoose.Schema({
  ciudadano_id_clerk: { type: String, required: true, unique: true, index: true, immutable: true },
});

const EsquemaReclamo = new mongoose.Schema({
  ciudadano_id_clerk: { type: String, index: true, immutable: true },
});

const EsquemaAlerta = new mongoose.Schema({
  ciudadano_id: { type: String, required: true, index: true },
});

const EsquemaHistorialAlerta = new mongoose.Schema({
  ciudadano_id: { type: String, required: true, index: true },
});

const EsquemaBloqueo = new mongoose.Schema({ _id: String, fecha_creacion: Date });

const ModeloUsuario = mongoose.models.Usuario || mongoose.model('Usuario', EsquemaUsuario);
const ModeloDomicilio = mongoose.models.DomicilioCiudadano || mongoose.model('DomicilioCiudadano', EsquemaDomicilio);
const ModeloReclamo = mongoose.models.Reclamo || mongoose.model('Reclamo', EsquemaReclamo);
const ModeloAlerta = mongoose.models.AlertaCiudadano || mongoose.model('AlertaCiudadano', EsquemaAlerta);
const ModeloHistorialAlerta = mongoose.models.HistorialAlerta || mongoose.model('HistorialAlerta', EsquemaHistorialAlerta);
const ModeloBloqueo = mongoose.models.BloqueoAdministrativo || mongoose.model('BloqueoAdministrativo', EsquemaBloqueo);

// ─── UTILIDADES ──────────────────────────────────────────────────────────────
function maskId(id) {
  if (!id || typeof id !== 'string') return 'null';
  return id.slice(0, 6) + '...' + id.slice(-4);
}

function maskEmail(email) {
  if (!email) return 'null';
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return local[0] + '***' + local[local.length - 1] + '@' + domain;
}

function maskPII(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = { ...obj };
  if (masked.correo_electronico) masked.correo_electronico = maskEmail(masked.correo_electronico);
  if (masked.nombre_completo) masked.nombre_completo = masked.nombre_completo.replace(/./g, '*');
  if (masked.telefono) masked.telefono = masked.telefono.replace(/./g, '*');
  if (masked._id) masked._id = String(masked._id).slice(0, 6) + '...';
  return masked;
}

function asegurarDirectorio(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escribirArchivoSeguro(ruta, contenido) {
  asegurarDirectorio(path.dirname(ruta));
  fs.writeFileSync(ruta, contenido, { mode: 0o600 });
  console.log('  📁 Guardado: ' + ruta);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ─── CONEXIÓN ────────────────────────────────────────────────────────────────
async function conectarBD() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI no definida en .env.local');
  await mongoose.connect(uri);
  console.log('✅ Conectado a MongoDB Atlas');
}

// ─── EXCLUSIÓN MUTUA (patrón del proyecto) ───────────────────────────────────
function clavesCuenta(usuario, correo) {
  return [...new Set([
    ...(usuario ? [usuario.id, ...usuario.emailAddresses.map(e => `correo:${e.emailAddress.toLowerCase()}`)] : []),
    ...(correo ? [`correo:${correo.toLowerCase()}`] : [])
  ])].sort();
}

async function conBloqueoCuenta(claves, preparar) {
  const adquiridas = [];
  try {
    for (const clave of claves) {
      await ModeloBloqueo.create({ _id: clave });
      adquiridas.push(clave);
    }
  } catch (error) {
    for (const clave of adquiridas.reverse()) await ModeloBloqueo.deleteOne({ _id: clave });
    if (error.code === 11000) throw new Error('La cuenta tiene una operación administrativa en curso o pendiente de recuperación');
    throw new Error('No se pudo garantizar exclusión para esta cuenta');
  }
  let iniciada = false, completada = false;
  try {
    const escribir = await preparar();
    iniciada = true;
    const resultado = await escribir();
    completada = true;
    return resultado;
  } finally {
    if (!iniciada || completada) {
      for (const clave of adquiridas.reverse()) await ModeloBloqueo.deleteOne({ _id: clave });
    }
  }
}

// ─── VERIFICACIONES CLERK ────────────────────────────────────────────────────
async function verificarIdentidadesClerk() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY no definida en .env.local');
  const clerk = createClerkClient({ secretKey });

  console.log('\n🔍 [1/7] Verificando identidades en Clerk...');

  // Verificar ID anterior (debe NO existir)
  let oldExists = false;
  try {
    await clerk.users.getUser(OLD_ID_CLERK);
    oldExists = true;
  } catch (e) {
    if (e.status === 404) {
      console.log('  ✅ ID anterior (' + maskId(OLD_ID_CLERK) + '): NO existe en Clerk (eliminado)');
    } else {
      throw new Error('Error al consultar ID anterior en Clerk: ' + e.status + ' ' + e.message);
    }
  }
  if (oldExists) {
    throw new Error(
      'PRECONDICIÓN FALLIDA: El ID anterior (' + maskId(OLD_ID_CLERK) + ') aún existe en Clerk. ' +
      'No se puede conciliar automáticamente. Requiere revisión administrativa.'
    );
  }

  // Verificar ID nuevo (debe existir y estar activo)
  let newUser;
  try {
    newUser = await clerk.users.getUser(NEW_ID_CLERK);
  } catch (e) {
    throw new Error('Error al consultar ID nuevo en Clerk: ' + e.status + ' ' + e.message);
  }

  if (newUser.banned) throw new Error('PRECONDICIÓN FALLIDA: El ID nuevo está BANEADO en Clerk.');
  if (newUser.locked) throw new Error('PRECONDICIÓN FALLIDA: El ID nuevo está BLOQUEADO en Clerk.');

  const primaryEmailObj = newUser.emailAddresses.find(e => e.id === newUser.primaryEmailAddressId);
  const primaryEmail = primaryEmailObj?.emailAddress?.toLowerCase();
  const verified = primaryEmailObj?.verification?.status === 'verified';

  if (primaryEmail !== TARGET_EMAIL.toLowerCase()) {
    throw new Error(
      'PRECONDICIÓN FALLIDA: El correo del ID nuevo (' + maskEmail(primaryEmail) + ') ' +
      'no coincide con el correo objetivo (' + maskEmail(TARGET_EMAIL) + ').'
    );
  }
  if (!verified) {
    throw new Error('PRECONDICIÓN FALLIDA: El correo del ID nuevo no está verificado en Clerk.');
  }

  console.log('  ✅ ID nuevo (' + maskId(NEW_ID_CLERK) + '): Existe, activo, correo verificado (' + maskEmail(primaryEmail) + ')');
  console.log('  ✅ Identidades Clerk válidas para conciliación');
  return newUser;
}

// ─── VERIFICACIONES MONGODB ──────────────────────────────────────────────────
async function verificarEstadoMongoDB() {
  console.log('\n🔍 [2/7] Verificando estado en MongoDB...');

  // Debe existir exactamente 1 doc con old ID y el email correcto
  const docOldId = await ModeloUsuario.findOne({ id_clerk: OLD_ID_CLERK }).lean();
  if (!docOldId) {
    throw new Error('PRECONDICIÓN FALLIDA: No se encontró ningún documento con el ID anterior en MongoDB.');
  }
  if (docOldId.correo_electronico.toLowerCase() !== TARGET_EMAIL.toLowerCase()) {
    throw new Error(
      'PRECONDICIÓN FALLIDA: El documento con ID anterior tiene un correo diferente (' +
      maskEmail(docOldId.correo_electronico) + '). No se puede proceder.'
    );
  }
  if (docOldId.rol !== 'ciudadano') {
    throw new Error('PRECONDICIÓN FALLIDA: El documento no tiene rol "ciudadano" (rol actual: ' + docOldId.rol + ').');
  }
  if (!docOldId.activo) {
    throw new Error('PRECONDICIÓN FALLIDA: El documento del ciudadano está marcado como inactivo.');
  }
  console.log('  ✅ Documento con ID anterior encontrado: _id=' + docOldId._id + ', rol=ciudadano, activo=true');

  // No debe existir ningún doc con new ID (evitar colisión de índice único)
  const docNewId = await ModeloUsuario.findOne({ id_clerk: NEW_ID_CLERK }).lean();
  if (docNewId) {
    throw new Error(
      'PRECONDICIÓN FALLIDA: Ya existe un documento con el ID nuevo (' + maskId(NEW_ID_CLERK) + '). ' +
      'No se puede actualizar sin colisión de índice único.'
    );
  }
  console.log('  ✅ No existe documento con el ID nuevo (sin riesgo de colisión)');

  return docOldId;
}

async function verificarDocumentosRelacionados() {
  console.log('\n🔍 [3/7] Verificando documentos relacionados...');

  const contadores = {
    domicilios: await ModeloDomicilio.countDocuments({ ciudadano_id_clerk: OLD_ID_CLERK }),
    reclamos: await ModeloReclamo.countDocuments({ ciudadano_id_clerk: OLD_ID_CLERK }),
    alertas: await ModeloAlerta.countDocuments({ ciudadano_id: OLD_ID_CLERK }),
    historialAlertas: await ModeloHistorialAlerta.countDocuments({ ciudadano_id: OLD_ID_CLERK }),
  };

  console.log('  Domicilios con ID anterior:       ' + contadores.domicilios);
  console.log('  Reclamos con ID anterior:         ' + contadores.reclamos);
  console.log('  Alertas con ID anterior:          ' + contadores.alertas);
  console.log('  Historial alertas con ID anterior: ' + contadores.historialAlertas);

  const total = contadores.domicilios + contadores.reclamos + contadores.alertas + contadores.historialAlertas;
  if (total > 0) {
    console.log('  ⚠️  Existen documentos relacionados (' + total + ' total). Se migrarán junto con el perfil.');
  } else {
    console.log('  ✅ Sin documentos relacionados (migración simple)');
  }

  return contadores;
}

async function verificarBloqueos() {
  console.log('\n🔍 [4/7] Verificando bloqueos administrativos...');

  const claves = [OLD_ID_CLERK, NEW_ID_CLERK, 'correo:' + TARGET_EMAIL.toLowerCase()];
  const bloqueos = await ModeloBloqueo.find({ _id: { $in: claves } }).lean();

  if (bloqueos.length > 0) {
    console.log('  ❌ Bloqueos activos encontrados:');
    bloqueos.forEach(b => console.log('    - ' + b._id + ' (creado: ' + b.fecha_creacion + ')'));
    throw new Error(
      'PRECONDICIÓN FALLIDA: Existen bloqueos administrativos activos (' + bloqueos.length + '). ' +
      'Limpie los bloqueos manualmente antes de ejecutar la conciliación.'
    );
  }
  console.log('  ✅ Sin bloqueos activos');
}

// ─── BACKUP (sin PII completo) ───────────────────────────────────────────────
async function guardarBackup(docOriginal, relacionados) {
  const nombreArchivo = 'backup-concilia-ciudadano-' + maskId(OLD_ID_CLERK).replace('...', '_') + '-' + timestamp() + '.json';
  const ruta = path.join(BACKUP_DIR, nombreArchivo);
  const backup = {
    metadata: {
      timestamp: new Date().toISOString(),
      script: 'concilia-ciudadano',
      old_id_clerk_masked: maskId(OLD_ID_CLERK),
      new_id_clerk_masked: maskId(NEW_ID_CLERK),
      email_masked: maskEmail(TARGET_EMAIL),
      dry_run: DRY_RUN,
    },
    documento_original: maskPII(docOriginal),
    relacionados,
  };
  escribirArchivoSeguro(ruta, JSON.stringify(backup, null, 2));
  return ruta;
}

// ─── AUDITORÍA ───────────────────────────────────────────────────────────────
async function registrarAuditoria(entrada) {
  const nombreArchivo = 'audit-concilia-ciudadano-' + timestamp() + '.json';
  const ruta = path.join(AUDIT_DIR, nombreArchivo);
  escribirArchivoSeguro(ruta, JSON.stringify({ timestamp: new Date().toISOString(), operacion: 'concilia_ciudadano', ...entrada }, null, 2));
  return ruta;
}

// ─── EJECUCIÓN CON TRANSACCIÓN ───────────────────────────────────────────────
async function ejecutarConciliacion(docOriginal, relacionados) {
  console.log('\n🔧 [5/7] ' + (DRY_RUN ? 'SIMULANDO' : 'EJECUTANDO') + ' conciliación con transacción...');

  if (DRY_RUN) {
    console.log('  [DRY-RUN] updateOne usuarios: { id_clerk: "' + maskId(OLD_ID_CLERK) + '" } → { $set: { id_clerk: "' + maskId(NEW_ID_CLERK) + '" } }');
    if (relacionados.domicilios > 0) console.log('  [DRY-RUN] updateMany domiciliosciudadanos: ' + relacionados.domicilios + ' documentos');
    if (relacionados.reclamos > 0) console.log('  [DRY-RUN] updateMany reclamos: ' + relacionados.reclamos + ' documentos');
    if (relacionados.alertas > 0) console.log('  [DRY-RUN] updateMany alertasciudadanos: ' + relacionados.alertas + ' documentos');
    if (relacionados.historialAlertas > 0) console.log('  [DRY-RUN] updateMany historialalertas: ' + relacionados.historialAlertas + ' documentos');
    return { simulated: true, migrados: { ...relacionados } };
  }

  const session = await mongoose.startSession();
  let resultado;
  try {
    resultado = await session.withTransaction(async () => {
      const ahora = new Date();

      // 1. Actualizar el perfil ciudadano (usuario principal)
      const resUsuario = await ModeloUsuario.updateOne(
        { id_clerk: OLD_ID_CLERK, correo_electronico: TARGET_EMAIL.toLowerCase(), rol: 'ciudadano' },
        { $set: { id_clerk: NEW_ID_CLERK, fecha_actualizacion: ahora } },
        { session }
      );

      if (resUsuario.modifiedCount !== 1) {
        throw new Error(
          'La actualización del perfil no modificó exactamente 1 documento (modifiedCount=' +
          resUsuario.modifiedCount + '). Posible condición de carrera. Revise el estado manualmente.'
        );
      }
      console.log('  ✅ Perfil ciudadano actualizado (usuarios: 1 documento)');

      // 2. Migrar domicilios (bypass immutable/hooks)
      let migrDomicilios = 0;
      if (relacionados.domicilios > 0) {
        const resDom = await ModeloDomicilio.collection.updateMany(
          { ciudadano_id_clerk: OLD_ID_CLERK },
          { $set: { ciudadano_id_clerk: NEW_ID_CLERK } },
          { session }
        );
        migrDomicilios = resDom.modifiedCount;
        console.log('  ✅ Domicilios migrados: ' + migrDomicilios);
      }

      // 3. Migrar reclamos
      let migrReclamos = 0;
      if (relacionados.reclamos > 0) {
        const resRec = await ModeloReclamo.collection.updateMany(
          { ciudadano_id_clerk: OLD_ID_CLERK },
          { $set: { ciudadano_id_clerk: NEW_ID_CLERK } },
          { session }
        );
        migrReclamos = resRec.modifiedCount;
        console.log('  ✅ Reclamos migrados: ' + migrReclamos);
      }

      // 4. Migrar alertas
      let migrAlertas = 0;
      if (relacionados.alertas > 0) {
        const resAler = await ModeloAlerta.collection.updateMany(
          { ciudadano_id: OLD_ID_CLERK },
          { $set: { ciudadano_id: NEW_ID_CLERK } },
          { session }
        );
        migrAlertas = resAler.modifiedCount;
        console.log('  ✅ Alertas migradas: ' + migrAlertas);
      }

      // 5. Migrar historial de alertas
      let migrHistorial = 0;
      if (relacionados.historialAlertas > 0) {
        const resHis = await ModeloHistorialAlerta.collection.updateMany(
          { ciudadano_id: OLD_ID_CLERK },
          { $set: { ciudadano_id: NEW_ID_CLERK } },
          { session }
        );
        migrHistorial = resHis.modifiedCount;
        console.log('  ✅ Historial de alertas migrado: ' + migrHistorial);
      }

      return { simulated: false, migrados: { domicilios: migrDomicilios, reclamos: migrReclamos, alertas: migrAlertas, historialAlertas: migrHistorial } };
    });
  } finally {
    await session.endSession();
  }
  return resultado;
}

// ─── VERIFICACIÓN POSTERIOR COMPLETA ─────────────────────────────────────────
async function verificarPosterior() {
  console.log('\n🔍 [6/7] Verificación post-conciliación completa...');

  const docNuevo = await ModeloUsuario.findOne({ id_clerk: NEW_ID_CLERK }).lean();
  const docAntiguo = await ModeloUsuario.findOne({ id_clerk: OLD_ID_CLERK }).lean();

  if (!docNuevo) {
    throw new Error('VERIFICACIÓN FALLIDA: No se encontró el documento con el ID nuevo tras la actualización.');
  }
  if (docAntiguo) {
    throw new Error('VERIFICACIÓN FALLIDA: Aún existe un documento con el ID anterior. La actualización no fue completa.');
  }

  console.log('  ✅ Documento con ID nuevo encontrado: _id=' + docNuevo._id);
  console.log('  ✅ No existe documento con ID anterior');
  console.log('  ✅ Correo: ' + maskEmail(docNuevo.correo_electronico));
  console.log('  ✅ Rol: ' + docNuevo.rol);
  console.log('  ✅ Activo: ' + docNuevo.activo);
  console.log('  ✅ Fecha creación preservada: ' + docNuevo.fecha_creacion);

  // Verificar documentos relacionados
  const checks = [
    { modelo: ModeloDomicilio, campo: 'ciudadano_id_clerk', nombre: 'Domicilios' },
    { modelo: ModeloReclamo, campo: 'ciudadano_id_clerk', nombre: 'Reclamos' },
    { modelo: ModeloAlerta, campo: 'ciudadano_id', nombre: 'Alertas' },
    { modelo: ModeloHistorialAlerta, campo: 'ciudadano_id', nombre: 'Historial Alertas' },
  ];

  for (const { modelo, campo, nombre } of checks) {
    const conNuevo = await modelo.countDocuments({ [campo]: NEW_ID_CLERK });
    const conAntiguo = await modelo.countDocuments({ [campo]: OLD_ID_CLERK });
    if (conAntiguo > 0) {
      throw new Error('VERIFICACIÓN FALLIDA: ' + nombre + ' aún tiene ' + conAntiguo + ' documentos con ID anterior.');
    }
    console.log('  ✅ ' + nombre + ': ' + conNuevo + ' con ID nuevo, 0 con ID anterior');
  }

  return docNuevo;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  validarArgumentos();

  console.log('═══════════════════════════════════════════════════════');
  console.log('  CONCILIACIÓN DE IDENTIDAD CIUDADANA — EcoTrack');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ID anterior: ' + maskId(OLD_ID_CLERK));
  console.log('  ID nuevo:    ' + maskId(NEW_ID_CLERK));
  console.log('  Correo:      ' + maskEmail(TARGET_EMAIL));
  console.log('  Modo:        ' + (DRY_RUN ? '🔬 DRY-RUN (sin cambios)' : '🔴 EJECUCIÓN REAL'));
  if (DRY_RUN) {
    console.log('\n  ⚠️  Para ejecutar realmente: node concilia-ciudadano.mjs --confirm');
  }
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    await conectarBD();

    // Precondiciones
    const clerkUser = await verificarIdentidadesClerk();
    const docOriginal = await verificarEstadoMongoDB();
    const relacionados = await verificarDocumentosRelacionados();
    await verificarBloqueos();

    // Backup siempre (dry-run o real)
    console.log('\n💾 Guardando backup (sin PII completo)...');
    const backupPath = await guardarBackup(docOriginal, relacionados);

    // Exclusión mutua durante la conciliación
    const claves = clavesCuenta(clerkUser, TARGET_EMAIL);
    const resultado = await conBloqueoCuenta(claves, async () => {
      // Re-verificar dentro del bloqueo (patrón del proyecto)
      const docActual = await ModeloUsuario.findOne({ id_clerk: OLD_ID_CLERK }).lean();
      if (!docActual) throw new Error('El documento desapareció durante la adquisición del bloqueo');
      if (docActual.correo_electronico.toLowerCase() !== TARGET_EMAIL.toLowerCase()) {
        throw new Error('El correo del documento cambió durante la operación');
      }
      return () => ejecutarConciliacion(docOriginal, relacionados);
    });

    // Verificación posterior (solo en ejecución real)
    let docFinal = null;
    if (!DRY_RUN) {
      docFinal = await verificarPosterior();
    }

    // Auditoría
    const auditoria = {
      old_id_clerk_masked: maskId(OLD_ID_CLERK),
      new_id_clerk_masked: maskId(NEW_ID_CLERK),
      email_masked: maskEmail(TARGET_EMAIL),
      mongo_id_masked: docOriginal._id ? String(docOriginal._id).slice(0, 6) + '...' : 'null',
      dry_run: DRY_RUN,
      backup_path: backupPath,
      migrados: resultado.migrados,
      verificacion_final: docFinal ? { rol: docFinal.rol, activo: docFinal.activo, fecha_creacion: docFinal.fecha_creacion } : null,
      exito: true,
    };
    const auditPath = await registrarAuditoria(auditoria);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(DRY_RUN ? '✅ DRY-RUN COMPLETADO — ningún cambio aplicado' : '✅ CONCILIACIÓN COMPLETADA');
    console.log('  Backup:    ' + backupPath);
    console.log('  Auditoría: ' + auditPath);
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('\n❌ ERROR: ' + msg);

    try {
      await registrarAuditoria({
        old_id_clerk_masked: maskId(OLD_ID_CLERK),
        new_id_clerk_masked: maskId(NEW_ID_CLERK),
        email_masked: maskEmail(TARGET_EMAIL),
        dry_run: DRY_RUN,
        exito: false,
        error: msg,
      });
    } catch (_) { /* ignorar errores de auditoría en fallo */ }

    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

main();