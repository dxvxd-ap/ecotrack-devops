import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstadoDomicilio } from '../src/servicios/estado-domicilio.ts';
import type { DomicilioDTO } from '../src/servicios/domicilio.ts';
const dto = (version: number): DomicilioDTO => ({ubicacion:{type:'Point',coordinates:[-97.08,20.46]},version,tipo_seleccion:'manual',fecha_confirmacion:'2026-01-01',fecha_creacion:'2026-01-01',fecha_actualizacion:'2026-01-01',asignacion:{estado:'pendiente',ruta_id:null,metodo:null,fecha_evaluacion:null,version_politica:null,huella_catalogo:null,motivo:null}});
test('deduplica GET y conserva snapshot durante la sesión incluso con domicilio null', async () => {
 let llamadas=0;
 const estado=crearEstadoDomicilio(async token => {assert.equal(token,'token-ficticio'); llamadas++; return null;});
 await Promise.all([estado.leer(async()=> 'token-ficticio'),estado.leer(async()=> 'token-ficticio')]);
 await estado.leer(async()=> 'token-ficticio');
 assert.equal(llamadas,1); assert.deepEqual(estado.getSnapshot(),{domicilio:null,cargado:true});
});
test('respuesta GET anterior no revierte una actualización confirmada', async () => {
 let resolver!: (v:DomicilioDTO)=>void;
 const estado=crearEstadoDomicilio(()=>new Promise(r=>{resolver=r;}));
 const pendiente=estado.leer(async()=> 'token-ficticio');
 await Promise.resolve();
 estado.guardar(dto(2)); resolver(dto(1));
 assert.equal((await pendiente)?.version,2); assert.equal(estado.getSnapshot().domicilio?.version,2);
});
test('error no se cachea como domicilio vacío y permite reintento', async () => {
 let falla=true;
 const estado=crearEstadoDomicilio(async()=>{if(falla)throw new Error('fixture');return dto(1);});
 await assert.rejects(estado.leer(async()=> 'token-ficticio'));
 assert.equal(estado.getSnapshot().cargado,false);
 falla=false; await estado.leer(async()=> 'token-ficticio'); assert.equal(estado.getSnapshot().domicilio?.version,1);
});
test('almacenes de sesiones distintas nunca comparten domicilio ni respuesta pendiente',async()=>{
 let resolver!: (v:DomicilioDTO)=>void;
 const a=crearEstadoDomicilio(()=>new Promise(r=>{resolver=r;}));
 const b=crearEstadoDomicilio(async()=>null);
 const pendiente=a.leer(async()=> 'token-a'); await Promise.resolve();
 await b.leer(async()=> 'token-b'); resolver(dto(3)); await pendiente;
 assert.equal(b.getSnapshot().domicilio,null); assert.equal(a.getSnapshot().domicilio?.version,3);
});
test('sin token no consulta domicilio',async()=>{
 let llamadas=0;
 const estado=crearEstadoDomicilio(async()=>{llamadas++;return dto(1);});
 await assert.rejects(estado.leer(async()=>null)); assert.equal(llamadas,0);
});
