import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRegistroDomicilio, validarActualizacionDomicilio } from '../../../src/contratos/domicilio.ts';
import type { RegistroDomicilio, AsignacionDomicilio, RespuestaConsultaDomicilio, RutaDomicilioDTO } from '../../../src/contratos/domicilio.ts';

test('la PWA puede consumir el contrato compartido sin dependencias de servidor', () => {
  const registro: RegistroDomicilio = { latitud: 20.45, longitud: -97.09, tipo_seleccion: 'gps', confirmada: true };
  assert.deepEqual(validarRegistroDomicilio(registro), registro);
  assert.equal(validarActualizacionDomicilio({ ...registro, version: 3 }).version, 3);
});

test('la consulta propia admite ausencia de domicilio y distingue errores', () => {
  const respuesta: RespuestaConsultaDomicilio = { exito: true, datos: null };
  assert.equal(respuesta.datos, null);
  const error: RespuestaConsultaDomicilio = { exito: false, mensaje: 'Conflicto', codigo: 'VERSION_CONFLICTIVA' };
  assert.equal(error.codigo, 'VERSION_CONFLICTIVA');
});

// Se verifican con typecheck; no son ejemplos ejecutables de entradas aceptadas.
function comprobarRechazosDeTipos() {
  // @ts-expect-error El propietario jamás forma parte del cuerpo ciudadano.
  const propietario: RegistroDomicilio = { latitud: 20, longitud: -97, tipo_seleccion: 'gps', confirmada: true, ciudadano_id_clerk: 'user_otro' };
  // @ts-expect-error La confirmación no puede ser falsa.
  const sinConfirmar: RegistroDomicilio = { latitud: 20, longitud: -97, tipo_seleccion: 'gps', confirmada: false };
  // @ts-expect-error Una asignación definitiva necesita ruta, método y evidencia.
  const incompleta: AsignacionDomicilio = { estado: 'asignada', ruta_id: null };
  // @ts-expect-error Un candidato no es un estado de asignación.
  const candidata: AsignacionDomicilio = { estado: 'candidata' };
  // @ts-expect-error La respuesta de error no admite datos de éxito.
  const errorConDatos: RespuestaConsultaDomicilio = { exito: false, mensaje: 'Error', codigo: 'ERROR', datos: null };
  // @ts-expect-error Un resultado asignado debe incluir resumen de la ruta.
  const rutaAusente: RutaDomicilioDTO = { asignacion: { estado: 'asignada', ruta_id: '507f1f77bcf86cd799439011', metodo: 'cobertura_oficial', fecha_evaluacion: '2026-11-15T12:00:00.000Z', version_politica: '1', huella_catalogo: '1', motivo: 'oficial' }, ruta: null };
  return [propietario, sinConfirmar, incompleta, candidata, errorConDatos, rutaAusente];
}
void comprobarRechazosDeTipos;
