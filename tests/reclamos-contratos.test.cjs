const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { entorno } = require('./helpers/entorno.cjs');
const base = { confirmada: true, domicilio_referencia: ' Frente al parque ', descripcion: 'Acumulación de basura en la entrada.', latitud: 20, longitud: -97, tipo_incidencia: 'BASURA_TIRADA' };
function contrato() { return entorno().load(path.resolve(__dirname, '../src/contratos/reclamos.ts')); }
const limpio = x => JSON.parse(JSON.stringify(x));

function modeloReal() {
  // Compila el modelo existente en memoria; Mongoose no abre conexiones al importar/hidratar.
  const fs = require('node:fs');
  const Module = require('node:module');
  const ts = require('typescript');
  const archivo = path.resolve(__dirname, '../src/modelos/Reclamo.ts');
  const mod = new Module(archivo, module);
  mod.filename = archivo; mod.paths = Module._nodeModulePaths(path.dirname(archivo));
  mod._compile(ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, archivo);
  return mod.exports.ModeloReclamo;
}

test('DTO desde documento Mongoose real conserva ObjectId, fechas y punto sin campos privados',async()=>{
  const Modelo = modeloReal();
  const entrada = new Modelo({...documento(), operacion: undefined, historial_atencion: undefined});
  await entrada.validate();
  // Metadatos desconocidos simulados como documento histórico/futuro hidratado, sin cambiar el esquema.
  const doc = Modelo.hydrate({...entrada.toObject(),operacion:{id:'OPERACION PRIVADA'},
    notas_internas:'NOTA INTERNA',funcionario_id_clerk:'user_funcionario',historial_atencion:[{nota:'PRIVADA'}]});
  const antes = doc.toObject();const c=contrato();
  for(const serializar of [c.serializarResumenCiudadano,c.serializarDetalleCiudadano]){
    const dto=limpio(serializar(doc));
    assert.equal(dto.id,'000000000000000000000001');
    assert.equal(dto.fecha_reporte,'2026-11-16T18:00:00.000Z');
    for(const campo of ['ciudadano_id_clerk','contacto','ciudadano_nombre','ciudadano_telefono','ciudadano_email',
      'solucion_notas','solucion_notas_heredada','fotografia_url','operacion','notas_internas','funcionario_id_clerk','historial_atencion'])
      assert.equal(Object.hasOwn(dto,campo),false,campo);
    assert.doesNotMatch(JSON.stringify(dto),/user_actor|2291234567|persona@example|NOTA INTERNA|user_funcionario|OPERACION PRIVADA|privado.example/);
  }
  assert.deepEqual(limpio(c.serializarDetalleCiudadano(doc)).ubicacion,{type:'Point',coordinates:[-97,20]});
  const admin=limpio(c.serializarDetalleAdministrativo(doc));
  assert.equal(admin.contacto.telefono,'2291234567');assert.equal(admin.propietario_vinculado,true);
  assert.equal(admin.solucion_notas_heredada,'NOTA INTERNA');
  assert.equal(Object.hasOwn(admin,'operacion'),false);
  const heredado=limpio(c.serializarReclamoHeredado(doc, "administrativa"));
  assert.equal(heredado._id,'000000000000000000000001');assert.equal(heredado.ciudadano_id_clerk,'user_actor');
  assert.equal(heredado.solucion_notas,'NOTA INTERNA');assert.equal(Object.hasOwn(heredado,'operacion'),false);
  assert.deepEqual(doc.toObject(),antes);
  assert.equal(Modelo.db.readyState,0);
});

test('histórico Mongoose sin propietario conserva ruta de código, contacto y nota solo en DTO autorizado',()=>{
  const Modelo=modeloReal();const c=contrato();
  const doc=Modelo.hydrate({_id:'000000000000000000000002',folio:'REC-HISTORICO',
    ciudadano_nombre:'Histórico',ciudadano_telefono:'123',ciudadano_email:'historia@example.test',
    ruta_id:'RUTA-1',domicilio_referencia:'Referencia antigua',descripcion:'Descripción antigua',
    ubicacion:{type:'Point',coordinates:[-97,20]},tipo_incidencia:'CAMION_NO_PASO',estado:'RESUELTO',
    solucion_notas:'Nota heredada privada',fecha_reporte:new Date('2020-01-02T03:04:05Z')});
  const detalle=limpio(c.serializarDetalleCiudadano(doc));
  assert.equal(detalle.ruta_id,'RUTA-1');assert.equal(detalle.respuesta_publica,null);
  assert.equal(detalle.version,0);assert.equal(detalle.origen_ubicacion,null);
  assert.equal(detalle.fecha_reporte,'2020-01-02T03:04:05.000Z');
  assert.doesNotMatch(JSON.stringify(detalle),/123|historia@example|Nota heredada privada/);
  const admin=limpio(c.serializarDetalleAdministrativo(doc));
  assert.equal(admin.propietario_vinculado,false);assert.equal(admin.solucion_notas_heredada,'Nota heredada privada');
  const anterior=limpio(c.serializarReclamoHeredado(doc, "administrativa"));
  assert.equal(anterior.ruta_id,'RUTA-1');assert.equal(anterior.ciudadano_telefono,'123');
  assert.equal(anterior.fecha_reporte,'2020-01-02T03:04:05.000Z');
  assert.equal(anterior.solucion_notas,'Nota heredada privada');assert.equal(Object.hasOwn(anterior,'ciudadano_id_clerk'),false);
  assert.equal(Modelo.db.readyState,0);
});

test('histórico Mongoose incompleto no inventa propietario, punto ni respuesta pública',()=>{
  const c=contrato();const doc=modeloReal().hydrate({_id:'000000000000000000000003',folio:'INCOMPLETO',
    ubicacion:{type:'Point',coordinates:[]},solucion_notas:'Solo privada'});
  const detalle=limpio(c.serializarDetalleAdministrativo(doc));
  assert.equal(detalle.ubicacion,null);assert.equal(detalle.propietario_vinculado,false);
  assert.equal(detalle.respuesta_publica,null);assert.equal(detalle.version,0);
  assert.equal(doc.ciudadano_id_clerk,undefined);
});

test('R1 normaliza texto, permite teléfono/ruta ausentes y devuelve GeoJSON sin asignación', () => {
  const { validarCreacionReclamoR1 } = contrato();
  const r = limpio(validarCreacionReclamoR1({ ...base, descripcion: '  Basura junto al cafe\u0301.\r\nRevisar.  ' }));
  assert.equal(r.descripcion,'Basura junto al café.\nRevisar.');
  assert.equal(r.domicilio_referencia,'Frente al parque');
  assert.deepEqual(r.ubicacion,{type:'Point',coordinates:[-97,20]});
  assert.equal(Object.hasOwn(r,'ciudadano_telefono'),false);
  assert.equal(r.ruta_id,null); assert.equal(r.origen_ubicacion,'manual');
  assert.equal(Object.hasOwn(r,'asignacion'),false);
});
for (const [campo, valores] of [
  ['latitud',['20',null,91,-91,NaN,Infinity,{},[]]],
  ['longitud',['-97',null,181,-181,NaN,Infinity]],
  ['tipo_incidencia',['CONTENEDOR',null,{},'']],
  ['descripcion',['corta','x'.repeat(4001),42,'texto válido\u0000prohibido']],
  ['domicilio_referencia',[' ', 'x'.repeat(501),false]],
  ['ciudadano_telefono',['',null,42,'abc1234567','1'.repeat(26)]],
  ['ruta_id',['RUTA-1',{$ne:null},12]],
  ['origen_ubicacion',['automatico',null]],
]) for(const valor of valores) test(`R1 rechaza ${campo}: ${String(valor).slice(0,35)}`,()=>{
  assert.throws(()=>contrato().validarCreacionReclamoR1({...base,[campo]:valor}),e=>e.status===400&&e.codigo==='ENTRADA_INVALIDA');
});
for (const campo of ['ciudadano_id_clerk','ciudadano_nombre','ciudadano_email','fotografia_url','estado','folio','camion_asignado_id','operacion','notas_internas','domicilio_id','extra']) test(`R1 rechaza campo no admitido ${campo}`,()=>{
  assert.throws(()=>contrato().validarCreacionReclamoR1({...base,[campo]:'no'}),e=>e.codigo==='ENTRADA_INVALIDA');
});
test('R1 acepta límites, todas las categorías actuales y ruta explícita sin cobertura',()=>{
  const c=contrato();
  for(const tipo of ['CAMION_NO_PASO','HORARIO_IRREGULAR','BASURA_TIRADA','MALA_ATENCION','OTRO']) {
    const d=limpio(c.validarCreacionReclamoR1({...base,tipo_incidencia:tipo,latitud:-90,longitud:180,descripcion:'x'.repeat(4000),domicilio_referencia:'x'.repeat(500),ciudadano_telefono:'+52 (229) 123-4567',ruta_id:'ABCDEF0123456789ABCDEF01',origen_ubicacion:'domicilio'}));
    assert.equal(d.ruta_id,'abcdef0123456789abcdef01');assert.equal(d.tipo_incidencia,tipo);
    assert.deepEqual(d.ubicacion.coordinates,[180,-90]);assert.equal(Object.hasOwn(d,'cobertura'),false);
  }
});
test('máximo se cuenta en puntos de código, no en unidades UTF-16',()=>{
  const d=contrato().validarCreacionReclamoR1({...base,descripcion:'🚛'.repeat(4000)});
  assert.equal(Array.from(d.descripcion).length,4000);
});

function documento(){return {
  _id:'000000000000000000000001',folio:'REC-PRUEBA',ciudadano_id_clerk:'user_actor',ciudadano_nombre:'Nombre',ciudadano_telefono:'2291234567',ciudadano_email:'persona@example.test',
  domicilio_referencia:'Referencia',ubicacion:{type:'Point',coordinates:[-97,20],secreto:'NO'},tipo_incidencia:'OTRO',descripcion:'Una descripción válida',estado:'PENDIENTE',
  fecha_reporte:new Date('2026-11-16T18:00:00Z'),solucion_notas:'NOTA INTERNA',notas_internas:'NO',funcionario_id_clerk:'user_funcionario',operacion:{id:'OPERACION PRIVADA'},
  historial_atencion:[{nota_interna:'NO'}],fotografia_url:'https://privado.example/foto',version_atencion:2,__v:3
};}
test('DTO ciudadano resumen/detalle no filtra identidad, contacto, notas, fotografías ni operación',()=>{
  const c=contrato();const entrada=documento();const antes=structuredClone(entrada);
  for(const f of [c.serializarResumenCiudadano,c.serializarDetalleCiudadano]){
    const d=limpio(f(entrada));const texto=JSON.stringify(d);
    assert.equal(d.id,entrada._id);assert.equal(d.folio,'REC-PRUEBA');
    assert.doesNotMatch(texto,/user_actor|2291234567|persona@example|NOTA INTERNA|user_funcionario|OPERACION PRIVADA|privado.example|secreto/);
  }
  const detalle=limpio(c.serializarDetalleCiudadano(entrada));
  assert.deepEqual(detalle.ubicacion,{type:'Point',coordinates:[-97,20]});
  assert.equal(detalle.respuesta_publica,null);assert.equal(detalle.version,2);
  assert.deepEqual(entrada,antes);
});
test('DTO administrativo incluye contacto y nota heredada pero no operación ni propiedades nuevas',()=>{
  const d=limpio(contrato().serializarDetalleAdministrativo(documento()));
  assert.equal(d.contacto.telefono,'2291234567');assert.equal(d.contacto.correo,'persona@example.test');
  assert.equal(d.solucion_notas_heredada,'NOTA INTERNA');assert.equal(d.propietario_vinculado,true);
  assert.doesNotMatch(JSON.stringify(d),/OPERACION PRIVADA|user_funcionario|historial_atencion/);
});
test('históricos incompletos son legibles sin inventar coordenadas, respuesta ni propietario',()=>{
  const d=limpio(contrato().serializarDetalleAdministrativo({folio:'HISTORICO',ubicacion:{type:'Point',coordinates:[null,'20']},fecha_reporte:'invalida',solucion_notas:'Privada'}));
  assert.equal(d.ubicacion,null);assert.equal(d.fecha_reporte,null);assert.equal(d.respuesta_publica,null);
  assert.equal(d.version,0);assert.equal(d.propietario_vinculado,false);
});
test('serializador heredado conserva campos conocidos sin propagar futuros internos',()=>{
  const d=limpio(contrato().serializarReclamoHeredado(documento(), "administrativa"));
  assert.equal(d._id,'000000000000000000000001');assert.equal(d.ciudadano_id_clerk,'user_actor');
  assert.equal(d.ciudadano_telefono,'2291234567');assert.equal(d.solucion_notas,'NOTA INTERNA');
  assert.equal(Object.hasOwn(d,'operacion'),false);assert.equal(Object.hasOwn(d,'historial_atencion'),false);
  assert.equal(Object.hasOwn(d,'funcionario_id_clerk'),false);
});

test('serializador ciudadano heredado mantiene solucion_notas vacío incluso si falta en el registro', () => {
  const { serializarReclamoHeredado } = contrato();
  for (const registro of [documento(), { folio: 'HISTORICO' }]) {
    const datos = serializarReclamoHeredado(registro, 'ciudadana');
    assert.equal(datos.solucion_notas, '');
    assert.equal(Object.hasOwn(datos, 'notasAdmin'), false);
    assert.equal(Object.hasOwn(datos, 'historial_atencion'), false);
  }
});
