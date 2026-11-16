#!/usr/bin/env node
/**
 * Script de conciliación administrativa puntual - EcoTrack Dashboard
 *
 * REGLAS DE SEGURIDAD:
 * - Dry-run por defecto (no modifica nada)
 * - Requiere confirmación explícita --confirm para ejecutar
 * - Usa modelos reales del proyecto
 * - Guarda backup en archivo JSON fuera del repo
 * - Registra auditoría persistente
 * - Verifica identidad de fundador con reglas reales
 * - No modifica Clerk, otras cuentas, organizaciones ni reglas de autorización
 * - Falla si pre-chequeos no pasan
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── CONFIGURACIÓN ───
const TARGET_ID_CLERK = "user_3LvAEEOTIddQsOPd8hQMExHCBCt";
const TARGET_EMAIL = "23610049@utgz.edu.mx";
const EXPECTED_CURRENT_ROL = "ciudadano";
const TARGET_NEW_ROL = "superadmin";

// Identificadores de fundador (desde autorizacion.ts)
const ID_FUNDADOR = "user_3JzRT8FQJPrqKEfk2QdjZpFaRVN";
const CORREO_FUNDADOR = "22610282@utgz.edu.mx";

const DRY_RUN = !process.argv.includes('--confirm');
const AUDIT_DIR = path.join(__dirname, '..', 'audit-logs');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// ─── ESQUEMAS (idénticos a los modelos del proyecto) ───
const EsquemaUsuario = new mongoose.Schema({
  id_clerk: { type: String, required: true, unique: true, index: true },
  nombre_completo: { type: String, required: true, trim: true },
  correo_electronico: { type: String, required: true, unique: true, lowercase: true, trim: true },
  rol: { type: String, required: true, default: "ciudadano", index: true },
  activo: { type: Boolean, default: true },
  telefono: { type: String, default: "" },
  fecha_creacion: { type: Date, default: Date.now },
  fecha_actualizacion: { type: Date, default: Date.now },
}, { timestamps: { createdAt: "fecha_creacion", updatedAt: "fecha_actualizacion" } });

const EsquemaPreasignacion = new mongoose.Schema({
  correo_electronico: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  nombre_completo: { type: String, required: true, trim: true },
  rol_asignado: { type: String, required: true },
  completado: { type: Boolean, default: false },
  fecha_creacion: { type: Date, default: Date.now },
  fecha_registro_completado: { type: Date },
});

const EsquemaBloqueo = new mongoose.Schema({ _id: String, fecha_creacion: Date });

const ModeloUsuario = mongoose.models.Usuario || mongoose.model("Usuario", EsquemaUsuario);
const ModeloPreasignacion = mongoose.models.PreasignacionUsuario || mongoose.model("PreasignacionUsuario", EsquemaPreasignacion);
const ModeloBloqueo = mongoose.models.BloqueoAdministrativo || mongoose.model("BloqueoAdministrativo", EsquemaBloqueo);

// ─── UTILIDADES ───
function esIdentidadFundador(id, correo) {
  const ids = [ID_FUNDADOR];
  if (process.env.SUPERADMIN_USER_ID) ids.push(process.env.SUPERADMIN_USER_ID);
  const correos = [CORREO_FUNDADOR];
  if (process.env.ADMIN_CORREO) correos.push(process.env.ADMIN_CORREO.trim().toLowerCase());

  return Boolean((id && ids.includes(id)) ||
    (correo && correos.includes(correo.toLowerCase())));
}

function asegurarDirectorio(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function escribirArchivoSeguro(ruta, contenido) {
  asegurarDirectorio(path.dirname(ruta));
  fs.writeFileSync(ruta, contenido, { mode: 0o600 });
  console.log('  📁 Archivo guardado: ' + ruta);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ─── FUNCIONES PRINCIPALES ───
async function conectarBD() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI no definida en .env.local');
  await mongoose.connect(uri);
  console.log('✅ Conectado a MongoDB');
}

async function buscarDocumentoObjetivo() {
  const filtro = { id_clerk: TARGET_ID_CLERK, rol: EXPECTED_CURRENT_ROL };
  console.log('\n🔍 Buscando documento con filtro: ' + JSON.stringify(filtro));

  const doc = await ModeloUsuario.findOne(filtro).lean();
  if (!doc) {
    throw new Error('No se encontró documento con id_clerk="' + TARGET_ID_CLERK + '" y rol="' + EXPECTED_CURRENT_ROL + '"');
  }
  return doc;
}

async function verificarNoEsFundador(doc) {
  const esFundador = esIdentidadFundador(doc.id_clerk, doc.correo_electronico);
  if (esFundador) {
    throw new Error('FALLO DE SEGURIDAD: El documento corresponde al fundador (según reglas de autorización)');
  }
  console.log('✅ Verificación: NO es el fundador (según reglas de autorización reales)');
}

async function verificarPreasignaciones() {
  const preasignaciones = await ModeloPreasignacion.find({ correo_electronico: TARGET_EMAIL }).lean();
  console.log('\n📋 Preasignaciones para ' + TARGET_EMAIL + ': ' + preasignaciones.length + ' encontrada(s)');
  if (preasignaciones.length > 0) {
    console.log(JSON.stringify(preasignaciones, null, 2));
  }
  return preasignaciones;
}

async function verificarBloqueos() {
  const claves = [TARGET_ID_CLERK, 'correo:' + TARGET_EMAIL];
  const bloqueos = await ModeloBloqueo.find({ _id: { $in: claves } }).lean();
  console.log('\n🔒 Bloqueos administrativos relacionados: ' + bloqueos.length + ' encontrado(s)');
  if (bloqueos.length > 0) {
    console.log(JSON.stringify(bloqueos, null, 2));
  }
  return bloqueos;
}

async function guardarBackup(doc) {
  const nombreArchivo = 'backup-' + TARGET_ID_CLERK + '-' + timestamp() + '.json';
  const ruta = path.join(BACKUP_DIR, nombreArchivo);
  const backup = {
    metadata: {
      timestamp: new Date().toISOString(),
      script: 'concilia-admin-puntual',
      target_id_clerk: TARGET_ID_CLERK,
      target_email: TARGET_EMAIL,
      dry_run: DRY_RUN,
    },
    documento_original: doc,
  };
  escribirArchivoSeguro(ruta, JSON.stringify(backup, null, 2));
  return ruta;
}

async function registrarAuditoria(entrada) {
  const nombreArchivo = 'audit-' + timestamp() + '.json';
  const ruta = path.join(AUDIT_DIR, nombreArchivo);
  const auditoria = {
    timestamp: new Date().toISOString(),
    operacion: 'concilia_admin_puntual',
    ...entrada,
  };
  escribirArchivoSeguro(ruta, JSON.stringify(auditoria, null, 2));
  return ruta;
}

async function ejecutarActualizacion(doc) {
  const filtro = { id_clerk: TARGET_ID_CLERK, rol: EXPECTED_CURRENT_ROL };

  if (DRY_RUN) {
    console.log('\n🔬 MODO DRY-RUN: Simulando actualización...');
    console.log('   Filtro: ' + JSON.stringify(filtro));
    console.log('   Actualización: { $set: { rol: "' + TARGET_NEW_ROL + '", fecha_actualizacion: new Date() } }');
    console.log('   Documento sería actualizado: _id=' + doc._id + ', versión actual=' + doc.__v);
    return { simulated: true, documento: doc };
  }

  console.log('\n🔧 Ejecutando actualización REAL...');

  const resultado = await ModeloUsuario.findOneAndUpdate(
    filtro,
    { $set: { rol: TARGET_NEW_ROL, fecha_actualizacion: new Date() } },
    { runValidators: true, new: true }
  ).lean();

  if (!resultado) {
    throw new Error('La actualización no modificó ningún documento (condición de carrera o estado cambiado)');
  }

  console.log('✅ Documento actualizado:');
  console.log(JSON.stringify(resultado, null, 2));
  return { simulated: false, documento: resultado };
}

async function verificarPosterior() {
  console.log('\n🔍 Verificación post-operación...');

  // Verificar en MongoDB
  const docMongo = await ModeloUsuario.findOne({ id_clerk: TARGET_ID_CLERK }).lean();
  console.log('   MongoDB rol: ' + docMongo.rol);

  return docMongo;
}

// ─── MAIN ───
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  CONCIALIACIÓN ADMINISTRATIVA PUNTUAL');
  console.log('  EcoTrack Dashboard - Reparación de rol');
  console.log('═══════════════════════════════════════════');
  console.log('\n🎯 Objetivo: ' + TARGET_ID_CLERK + ' (' + TARGET_EMAIL + ')');
  console.log('🔄 Rol esperado actual: ' + EXPECTED_CURRENT_ROL);
  console.log('🎯 Rol objetivo: ' + TARGET_NEW_ROL);
  console.log('🧪 Modo: ' + (DRY_RUN ? 'DRY-RUN (simulación)' : 'EJECUCIÓN REAL'));

  if (DRY_RUN) {
    console.log('\n⚠️  Para ejecutar realmente, use: node concilia-admin.mjs --confirm');
  }

  try {
    await conectarBD();

    // 1. Buscar documento
    const documento = await buscarDocumentoObjetivo();
    console.log('\n📄 DOCUMENTO ENCONTRADO:');
    console.log(JSON.stringify(documento, null, 2));

    // 2. Verificar que no es fundador
    await verificarNoEsFundador(documento);

    // 3. Verificar preasignaciones
    await verificarPreasignaciones();

    // 4. Verificar bloqueos
    await verificarBloqueos();

    // 5. Guardar backup
    console.log('\n💾 Guardando backup verificable...');
    const backupPath = await guardarBackup(documento);

    // 6. Ejecutar actualización (o simular)
    const resultado = await ejecutarActualizacion(documento);

    // 7. Registrar auditoría
    const auditoria = {
      target_id_clerk: TARGET_ID_CLERK,
      target_email: TARGET_EMAIL,
      rol_anterior: EXPECTED_CURRENT_ROL,
      rol_nuevo: TARGET_NEW_ROL,
      mongo_id: documento._id.toString(),
      version_antes: documento.__v,
      version_despues: resultado.documento.__v,
      dry_run: DRY_RUN,
      backup_path: backupPath,
      exito: true,
    };
    await registrarAuditoria(auditoria);

    // 8. Verificación posterior
    if (!DRY_RUN) {
      await verificarPosterior();
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(DRY_RUN ? '✅ DRY-RUN COMPLETADO (sin cambios)' : '✅ REPARACIÓN COMPLETADA');
    console.log('═══════════════════════════════════════════');
    console.log('\n📁 Backup: ' + backupPath);
    console.log('📋 Auditoría: ' + path.join(AUDIT_DIR, 'audit-' + timestamp() + '.json'));

  } catch (error) {
    console.error('\n❌ ERROR: ' + (error instanceof Error ? error.message : error));

    // Registrar auditoría de fallo
    await registrarAuditoria({
      target_id_clerk: TARGET_ID_CLERK,
      target_email: TARGET_EMAIL,
      rol_anterior: EXPECTED_CURRENT_ROL,
      rol_nuevo: TARGET_NEW_ROL,
      dry_run: DRY_RUN,
      exito: false,
      error: error instanceof Error ? error.message : String(error),
    });

    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Desconectado de MongoDB');
  }
}

main();
