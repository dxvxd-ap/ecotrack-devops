const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { entorno } = require('./helpers/entorno.cjs');
const cuerpo={confirmada:true,ciudadano_telefono:'2291234567',domicilio_referencia:'Referencia',descripcion:'Descripción suficientemente larga',latitud:20,longitud:-97,tipo_incidencia:'OTRO'};
const archivo=path.resolve(__dirname,'../src/app/api/v1/reclamos/route.ts');
function preparar(rol='ciudadano'){
  const e=entorno(rol);e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:e.actor.emailAddresses[0].emailAddress,rol,activo:true});const h=e.load(archivo);
  return {e,call:(metodo,body,contrato,query='',headers={})=>h[metodo](new Request('http://localhost/api/v1/reclamos'+query,{method:metodo,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(contrato!==undefined?{'EcoTrack-Contrato':contrato}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}))};
}
function privada(r){assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('vary'),/EcoTrack-Contrato/i);}
test('GET R1 consulta el folio normalizado y conserva propiedad y detalle',async()=>{
  const {e,call}=preparar();
  e.state.reclamos=[{folio:'REC-CAFÉ',ciudadano_id_clerk:e.actor.id,descripcion:'Detalle propio'},
    {folio:'REC-CAFÉ',ciudadano_id_clerk:e.target.id,descripcion:'Detalle ajeno'}];
  const r=await call('GET',undefined,'reclamos-r1','?'+new URLSearchParams({folio:'  REC-CAFE\u0301  '}));
  assert.equal(r.status,200);privada(r);
  assert.deepEqual((await r.json()).datos.map(d=>d.descripcion),['Detalle propio']);
  assert.equal(e.state.queries[0][1].folio,'REC-CAFÉ');
  assert.equal(e.state.queries[0][1].ciudadano_id_clerk,e.actor.id);
});
for(const folio of ['','   ','REC\u0000INVALIDO','REC\nINVALIDO','x'.repeat(101)])test(`GET R1 rechaza folio inválido ${JSON.stringify(folio).slice(0,40)}`,async()=>{
  const {e,call}=preparar();
  const r=await call('GET',undefined,'reclamos-r1','?'+new URLSearchParams({folio}));
  assert.equal(r.status,400);assert.equal((await r.json()).codigo,'ENTRADA_INVALIDA');privada(r);
  assert.equal(e.state.queries.length+e.state.writes.length,0);
});
test('GET heredado conserva el folio literal sin normalizar',async()=>{
  const {e,call}=preparar();e.state.reclamos=[{folio:' REC-ANTERIOR ',ciudadano_id_clerk:e.actor.id}];
  const r=await call('GET',undefined,undefined,'?folio=%20REC-ANTERIOR%20');
  assert.equal((await r.json()).datos[0].folio,' REC-ANTERIOR ');
  assert.equal(e.state.queries[0][1].folio,' REC-ANTERIOR ');
});
for(const metodo of ['GET','POST'])test(`cabecera de contrato vacía ${metodo} se rechaza sin efectos`,async()=>{
  const {e,call}=preparar();const r=await call(metodo,metodo==='POST'?cuerpo:undefined,'');
  assert.equal(r.status,400);assert.equal((await r.json()).codigo,'CONTRATO_NO_ADMITIDO');privada(r);
  assert.equal(e.state.queries.length+e.state.writes.length,0);
});
for(const contrato of [undefined,'reclamos-r1'])test(`UTF-8 inválido no llega a persistencia (${contrato||'heredado'})`,async()=>{
  const {e}=preparar();const h=e.load(archivo);
  for(const bytes of [[34,195,40,34],[34,195]]){
    const r=await h.POST(new Request('http://localhost/api/v1/reclamos',{method:'POST',
      headers:{'Content-Type':'application/json',...(contrato?{'EcoTrack-Contrato':contrato}:{})},body:Uint8Array.from(bytes)}));
    assert.equal(r.status,400);assert.equal((await r.json()).codigo,'ENTRADA_INVALIDA');privada(r);
  }
  assert.equal(e.state.queries.length+e.state.writes.length,0);
});
for(const contrato of [undefined,'reclamos-r1'])for(const metodo of ['GET','POST'])test(`bloqueo administrativo devuelve 409 privado ${metodo} ${contrato||'heredado'}`,async()=>{
  const {e,call}=preparar();e.state.locks.add(e.actor.id);
  const r=await call(metodo,metodo==='POST'?cuerpo:undefined,contrato);
  assert.equal(r.status,409);assert.equal((await r.json()).codigo,'CUENTA_EN_CONFLICTO');privada(r);
  assert.equal(e.state.queries.length+e.state.writes.length,0);
});
test('colisión de folio heredado devuelve 409 privado sin revelar el error Mongo',async()=>{
  const e=entorno('ciudadano',{dependencias:{'@/modelos/Reclamo':{ModeloReclamo:{create:async()=>{
    throw Object.assign(Error('E11000 teléfono privado mongodb://secreto'),{code:11000});
  }}}}});
  const r=await e.load(archivo).POST(new Request('http://localhost/api/v1/reclamos',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo)}));
  assert.equal(r.status,409);const b=await r.json();assert.equal(b.codigo,'CUENTA_EN_CONFLICTO');privada(r);
  assert.doesNotMatch(JSON.stringify(b),/E11000|teléfono|mongodb|secreto/);
});
for(const metodo of ['GET','POST'])test(`contrato desconocido ${metodo} no consulta ni escribe reclamos`,async()=>{
  const {e,call}=preparar();const r=await call(metodo,metodo==='POST'?cuerpo:undefined,'desconocido');
  assert.equal(r.status,400);assert.equal((await r.json()).codigo,'CONTRATO_NO_ADMITIDO');privada(r);
  assert.equal(e.state.queries.length+e.state.writes.length,0);
});
test('POST R1 bloquea creación sin índice verificado, incluso con Idempotency-Key',async()=>{
  const {e,call}=preparar();const {ciudadano_telefono,...sinTelefono}=cuerpo;
  const r=await call('POST',sinTelefono,'reclamos-r1','',{'Idempotency-Key':'4b80d965-625c-4cad-a7a4-5ace8313e1db'});
  assert.equal(r.status,503);assert.equal((await r.json()).codigo,'INDICE_NO_DISPONIBLE');privada(r);
  assert.equal(e.state.writes.length,0);assert.equal(e.state.reclamos.length,0);
});
test('POST R1 inválido se valida antes de devolver deshabilitado',async()=>{
  const {e,call}=preparar();const r=await call('POST',{...cuerpo,fotografia_url:'foto'},'reclamos-r1');
  assert.equal(r.status,400);assert.equal((await r.json()).codigo,'ENTRADA_INVALIDA');assert.equal(e.state.writes.length,0);
});
test('GET R1 aplica propiedad en Mongo y devuelve solo resumen seguro',async()=>{
  const {e,call}=preparar();
  e.state.reclamos=[{_id:'000000000000000000000001',folio:'PROPIO',ciudadano_id_clerk:e.actor.id,ciudadano_telefono:'PRIVADO',solucion_notas:'SECRETO',estado:'PENDIENTE',operacion:{id:'OPERACION'}},{folio:'AJENO',ciudadano_id_clerk:e.target.id}];
  const r=await call('GET',undefined,'reclamos-r1');assert.equal(r.status,200);privada(r);
  const d=(await r.json()).datos;assert.equal(d.length,1);assert.equal(d[0].folio,'PROPIO');
  assert.doesNotMatch(JSON.stringify(d),/user_actor|PRIVADO|SECRETO|OPERACION/);
  assert.equal(e.state.queries[0][1].ciudadano_id_clerk,e.actor.id);
});
test('GET R1 por id conserva arreglo pero utiliza detalle; ID ajeno no revela existencia',async()=>{
  const {e,call}=preparar();const id='000000000000000000000001';
  e.state.reclamos=[{_id:id,ciudadano_id_clerk:e.actor.id,descripcion:'Descripción visible',solucion_notas:'SECRETO'}];
  const r=await call('GET',undefined,'reclamos-r1','?id='+id);assert.equal((await r.json()).datos[0].descripcion,'Descripción visible');
  assert.deepEqual((await(await call('GET',undefined,'reclamos-r1','?id=000000000000000000000002')).json()).datos,[]);
});
for(const rol of ['admin','superadmin'])test(`GET R1 ${rol} usa DTO administrativo con permiso existente`,async()=>{
  const {e,call}=preparar(rol);e.state.reclamos=[{folio:'HISTORICO',ciudadano_email:'contacto@example.test',solucion_notas:'Privada',operacion:{hash:'NO'}}];
  const r=await call('GET',undefined,'reclamos-r1');const d=(await r.json()).datos[0];
  assert.equal(d.contacto.correo,'contacto@example.test');assert.equal(d.solucion_notas_heredada,'Privada');assert.doesNotMatch(JSON.stringify(d),/hash/);
});
test('legacy mantiene envelope, identidad servidor, defaults y oculta nuevos metadatos',async()=>{
  const {e,call}=preparar();const {tipo_incidencia,descripcion,...minimo}=cuerpo;
  const r=await call('POST',{...minimo,ciudadano_nombre:'Falso',ciudadano_email:'falso@example.test',rol:'admin'});
  assert.equal(r.status,200);privada(r);const d=(await r.json()).datos;
  assert.equal(d.ciudadano_nombre,'Nombre Prueba');assert.equal(d.ciudadano_id_clerk,e.actor.id);
  assert.equal(d.tipo_incidencia,'CAMION_NO_PASO');assert.equal(d.descripcion,'Reporte sin descripción adicional.');
  e.state.reclamos[0].operacion={id:'SECRETO'};
  assert.doesNotMatch(JSON.stringify(await(await call('GET')).json()),/operacion|SECRETO/);
});
for(const [body,headers,status,codigo] of [
  ['{',{},400,'ENTRADA_INVALIDA'], ['[]',{},400,'ENTRADA_INVALIDA'],
  [cuerpo,{'Content-Type':'text/plain'},415,'TIPO_NO_ADMITIDO'],
  [{...cuerpo,descripcion:'x'.repeat(17000)},{},413,'CUERPO_EXCESIVO'],
  [{...cuerpo,latitud:91},{},400,'ENTRADA_INVALIDA'],
  [cuerpo,{Origin:'https://ajeno.example'},403,'ACCESO_DENEGADO'],
])test(`HTTP legado inválido ${status} ${codigo}`,async()=>{
  const {e,call}=preparar();const r=await call('POST',body,undefined,'',headers);
  assert.equal(r.status,status);assert.equal((await r.json()).codigo,codigo);privada(r);assert.equal(e.state.writes.length,0);
});
test('lector limita bytes UTF-8 y acepta exactamente 16 KiB sin exigir Content-Length',async()=>{
  const e=entorno();const {leerJsonReclamos}=e.load(path.resolve(__dirname,'../src/lib/http_reclamos.ts'));
  const leer=body=>leerJsonReclamos(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body}));
  assert.equal((await leer('"'+'x'.repeat(16382)+'"')).length,16382);
  await assert.rejects(leer('"'+'á'.repeat(8192)+'"'),e=>e.status===413);
});
for(const rol of [null,'ciudadano','conductor','moderador'])for(const metodo of ['GET','POST'])test(`R1 autorización ${rol} ${metodo}`,async()=>{
  const {e,call}=preparar(rol||'ciudadano');if(!rol)e.state.sesion=null;
  const r=await call(metodo,metodo==='POST'?cuerpo:undefined,'reclamos-r1');
  assert.equal(r.status,!rol?401:rol==='ciudadano'?(metodo==='GET'?200:400):403);privada(r);
  assert.equal(e.state.writes.length,0);
});
test('fallo interno produce 503 estable sin detalles y con privacidad',async()=>{
  const {e,call}=preparar();e.state.failDB=true;const r=await call('GET',undefined,'reclamos-r1');
  assert.equal(r.status,503);assert.equal((await r.json()).codigo,'SERVICIO_NO_DISPONIBLE');privada(r);
});
for(const query of ['?id=','?_id=','?id=no','?id=000000000000000000000001&id=000000000000000000000002','?estado=OTRO','?ruta_id=RUTA-1','?folio=','?extra=1','?id=000000000000000000000001&_id=000000000000000000000002'])test(`R1 rechaza filtro inválido ${query}`,async()=>{
  const {e,call}=preparar();const r=await call('GET',undefined,'reclamos-r1',query);
  assert.equal(r.status,400);assert.equal((await r.json()).codigo,'ENTRADA_INVALIDA');privada(r);assert.equal(e.state.queries.length,0);
});
test('lector mantiene UTF-8 entre chunks y no confía en Content-Length menor al cuerpo',async()=>{
  const e=entorno();const {leerJsonReclamos}=e.load(path.resolve(__dirname,'../src/lib/http_reclamos.ts'));
  const stream=new ReadableStream({start(c){c.enqueue(Uint8Array.from([34,195]));c.enqueue(Uint8Array.from([161,34]));c.close();}});
  assert.equal(await leerJsonReclamos(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'})),'á');
  await assert.rejects(leerJsonReclamos(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'1'},body:'"'+'x'.repeat(17000)+'"'})),e=>e.status===413);
});

test('GET heredado ciudadano conserva la clave vacía y solo devuelve reclamos propios', async () => {
  const { e, call } = preparar();
  e.state.reclamos = [
    { folio: 'PROPIO', ciudadano_id_clerk: e.actor.id, solucion_notas: 'Nota privada', notasAdmin: 'Alias privado',
      respuesta_publica: 'Respuesta explícita', historial_atencion: [{ nota_interna: 'Interna R1' }] },
    { folio: 'AJENO', ciudadano_id_clerk: e.target.id, solucion_notas: 'Nota ajena' },
    { folio: 'HISTORICO', ciudadano_email: e.actor.emailAddresses[0].emailAddress },
  ];
  const r = await call('GET');
  assert.equal(r.status, 200);
  privada(r);
  const { datos } = await r.json();
  assert.equal(datos.length, 1);
  assert.equal(datos[0].folio, 'PROPIO');
  assert.equal(datos[0].solucion_notas, '');
  assert.doesNotMatch(JSON.stringify(datos), /notasAdmin|Nota privada|Interna R1|Alias privado/);
});

test('GET heredado administrativo conserva la nota autorizada sin metadatos R1', async () => {
  const { e, call } = preparar('admin');
  e.state.reclamos = [{ folio: 'HISTORICO', solucion_notas: 'Nota privada', operacion: { hash: 'OP-PRIVADA' } }];
  const r = await call('GET');
  assert.equal(r.status, 200);
  const { datos } = await r.json();
  assert.equal(datos[0].solucion_notas, 'Nota privada');
  assert.equal(Object.hasOwn(datos[0], 'operacion'), false);
});
