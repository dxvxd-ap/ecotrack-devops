const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { entorno } = require('./helpers/entorno.cjs');

function fundador(e, verificado = true, idLegitimo = true) {
  if(idLegitimo) e.actor.id='user_3JzRT8FQJPrqKEfk2QdjZpFaRVN';
  e.state.sesion=e.actor.id;
  e.actor.emailAddresses[0].emailAddress='22610282@utgz.edu.mx';
  e.actor.emailAddresses[0].verification.status=verificado?'verified':'unverified';
}
test('sincronización anónima no siembra ni escribe',async()=>{
  const e=entorno();e.state.sesion=null;
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,401);
  assert.equal(e.state.writes.length,0);
});
for(const verified of [false,true]) test(`correo fundador sin ID fijado no eleva (verificado=${verified})`,async()=>{
  const e=entorno('ciudadano');fundador(e,verified,false);
  const r=await e.call('autenticacion/sincronizar','POST');
  assert.equal(r.status,403);assert.equal(e.actor.publicMetadata.rol,'ciudadano');
  assert.equal((await e.call('usuarios','GET')).status,403);
});
test('fundador fijado sin correo verificado no recibe elevación',async()=>{
  const e=entorno('ciudadano');fundador(e,false,true);
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,403);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');
});
test('fundador legítimo con correo principal verificado conserva superadmin',async()=>{
  const e=entorno('ciudadano');fundador(e);
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.actor.publicMetadata.rol,'superadmin');
  assert.equal(e.actor.publicMetadata.dato_conservado,'sí');
  assert.equal((await e.call('usuarios','GET')).status,200);
});
test('sincronizar respeta bloqueo persistente activo sin ninguna escritura de cuenta',async()=>{
  const e=entorno('ciudadano');e.state.locks.add(e.actor.id);
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,409);
  assert.equal(e.state.writes.length,0);
});
test('preasignación local obsoleta no concede permisos ni aparece en listado',async()=>{
  const e=entorno('ciudadano');e.state.local.preasignaciones.push({correo_electronico:'user_actor@example.test',rol_asignado:'admin'});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');
  e.state.sesion=e.target.id;e.target.publicMetadata.rol='superadmin';
  const data=await (await e.call('usuarios','GET')).json();
  assert.equal(data.datos.filter(u=>u.estado_cuenta==='pendiente_registro').length,0);
});
test('primera vinculación consume solo preasignación Mongo pendiente con correo verificado',async()=>{
  const e=entorno('ciudadano');e.state.pre.push({correo_electronico:'user_actor@example.test',rol_asignado:'conductor',completado:false});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.actor.publicMetadata.rol,'conductor');assert.equal(e.state.pre[0].completado,true);
});
test('preasignación consumida no restaura privilegios en primera vinculación',async()=>{
  const e=entorno('ciudadano');e.state.pre.push({correo_electronico:'user_actor@example.test',rol_asignado:'admin',completado:true});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');
});
test('preasignación pendiente no se aplica a correo sin verificar',async()=>{
  const e=entorno('ciudadano');e.actor.emailAddresses[0].verification.status='unverified';
  e.state.pre.push({correo_electronico:'user_actor@example.test',rol_asignado:'admin',completado:false});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,403);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');assert.equal(e.state.pre[0].completado,false);
});
test('revocación administrativa persiste tras sincronizar con preasignación antigua',async()=>{
  const e=entorno();e.target.publicMetadata.rol='admin';
  e.state.pre.push({correo_electronico:'user_target@example.test',rol_asignado:'admin',completado:false});
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nuevo_rol:'ciudadano'})).status,200);
  e.state.sesion=e.target.id;
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.target.publicMetadata.rol,'ciudadano');
});
for(const source of ['mongo','clerk']) test(`inactivo en ${source} deniega middleware, handler y sincronización`,async()=>{
  const e=entorno('admin');
  if(source==='mongo') e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:'user_actor@example.test',rol:'admin',activo:false});
  else e.actor.publicMetadata.activo=false;
  for(const endpoint of ['usuarios','roles']){
    assert.equal((await e.call(endpoint,'GET')).status,403);
    assert.equal((await e.middle(endpoint,'GET')).status,403);
  }
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,403);
  assert.equal(e.state.writes.length,0);
});
test('desactivar admin impide API sin afirmar revocación de sesiones',async()=>{
  const e=entorno();e.target.publicMetadata.rol='admin';
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,activo:false})).status,200);
  assert.equal(e.target.publicMetadata.activo,false);
  assert.equal(e.state.mongoUsers.find(u=>u.id_clerk===e.target.id).activo,false);
  e.state.sesion=e.target.id;
  assert.equal((await e.call('usuarios','GET')).status,403);
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,403);
});
test('discrepancia de roles Mongo y Clerk no se repara elevando desde sincronizar',async()=>{
  const e=entorno('ciudadano');e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:'user_actor@example.test',rol:'admin',activo:true});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,409);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');assert.equal(e.state.writes.length,0);
});
for(const fallo of ['failClerk','failDB']) test(`${fallo} bloquea sincronización sin mutaciones`,async()=>{
  const e=entorno('ciudadano');e.state[fallo]=true;
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,503);
  assert.equal(e.state.writes.length,0);
});
test('caída MongoDB no permite API aunque Clerk tenga rol admin',async()=>{
  const e=entorno('admin');e.state.failDB=true;
  assert.equal((await e.call('usuarios','GET')).status,503);
  assert.equal((await e.middle('usuarios','GET')).status,503);
});
test('archivo local inaccesible no interviene en sincronización ni permisos',async()=>{
  const e=entorno('admin');e.state.failLocalRead=true;e.state.failLocalWrite=true;
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal((await e.call('usuarios','GET')).status,200);
});
test('preasignar no escribe archivo operativo ni depende de él',async()=>{
  const e=entorno('admin');e.state.failLocalRead=true;e.state.failLocalWrite=true;
  assert.equal((await e.call('usuarios/preasignar','POST',{correo_electronico:'nuevo@example.test',nombre_completo:'Nuevo',rol_asignado:'conductor'})).status,200);
  assert.equal(e.state.pre[0].rol_asignado,'conductor');assert.equal(e.state.writes.some(w=>w[0]==='local:write'),false);
});
for(const fallo of ['lectura','json','escritura']) test(`almacén real propaga fallo de ${fallo}`,()=>{
  const fakefs={existsSync:()=>true,readFileSync:()=>{if(fallo==='lectura')throw Error('EACCES');return fallo==='json'?'invalido':'{}';},writeFileSync:()=>{throw Error('EROFS');}};
  const e=entorno('ciudadano',{fs:fakefs,almacenReal:true});const m=e.load(path.resolve('src/lib/almacen_local.ts'));
  assert.throws(()=>fallo==='escritura'?m.guardar_almacen_local({}):m.leer_almacen_local());
});
test('editar rol de preasignación pendiente conserva su aplicación inicial',async()=>{
  const e=entorno();e.state.pre.push({correo_electronico:'user_target@example.test',rol_asignado:'conductor',completado:false});
  // Caso pendiente real: la identidad aún no existe en Clerk.
  const target=e.target;e.state.users=e.state.users.filter(u=>u.id!==target.id);
  assert.equal((await e.call('usuarios','PUT',{correo_electronico:'user_target@example.test',nuevo_rol:'moderador'})).status,200);
  assert.equal(e.state.pre[0].completado,false);
  e.state.users.push(target);e.state.sesion=target.id;
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(target.publicMetadata.rol,'moderador');
});
test('sincronización y revocación simultáneas usan los mismos bloqueos',async()=>{
  const e=entorno();e.target.publicMetadata.rol='admin';
  let entrar,continuar;const dentro=new Promise(r=>entrar=r),gate=new Promise(r=>continuar=r);
  e.state.beforeUpdate=async()=>{e.state.beforeUpdate=null;entrar();await gate;};
  const revoke=e.call('usuarios','PUT',{id_usuario:e.target.id,nuevo_rol:'ciudadano'});await dentro;
  e.state.sesion=e.target.id;
  const sync=await e.call('autenticacion/sincronizar','POST');
  continuar();assert.equal((await revoke).status,200);assert.equal(sync.status,409);
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.target.publicMetadata.rol,'ciudadano');
});
test('sincronizar relee Clerk después de adquirir bloqueo, no usa identidad inicial obsoleta',async()=>{
  const e=entorno('admin');let primera=true;
  e.state.beforeConnect=async()=>{
    if(primera){primera=false;e.actor.publicMetadata.rol='ciudadano';
      e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:'user_actor@example.test',rol:'ciudadano',activo:true});}
  };
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');
});
test('registro existente ignora invitación pendiente obsoleta',async()=>{
  const e=entorno('ciudadano');
  e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:'user_actor@example.test',rol:'ciudadano',activo:true});
  e.state.pre.push({correo_electronico:'user_actor@example.test',rol_asignado:'admin',completado:false});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,200);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');
});
test('eliminar preasignación y crear otra no resucita el archivo histórico',async()=>{
  const e=entorno();e.state.pre.push({correo_electronico:'a@example.test',rol_asignado:'admin',completado:false});
  e.state.local.preasignaciones.push({correo_electronico:'a@example.test',rol_asignado:'admin'});
  const res=await Promise.all([
    e.call('usuarios/preasignar','DELETE',undefined,'?correo=a@example.test'),
    e.call('usuarios/preasignar','POST',{correo_electronico:'b@example.test',nombre_completo:'B',rol_asignado:'conductor'}),
  ]);
  assert.deepEqual(res.map(r=>r.status),[200,200]);
  assert.equal(e.state.pre.some(p=>p.correo_electronico==='a@example.test'),false);
  const data=await (await e.call('usuarios','GET')).json();
  assert.equal(data.datos.some(u=>u.correo_electronico==='a@example.test'),false);
});
for (const via of ['sincronizar','administrar']) test(`fallo después de elevar Clerk por ${via} no habilita API con lock pendiente`,async()=>{
  const e=entorno(via==='sincronizar'?'ciudadano':'superadmin');
  e.state.failUserWrite=true;
  let res,cuenta;
  if(via==='sincronizar'){
    cuenta=e.actor;e.state.pre.push({correo_electronico:'user_actor@example.test',rol_asignado:'admin',completado:false});
    res=await e.call('autenticacion/sincronizar','POST');
  }else{
    cuenta=e.target;res=await e.call('usuarios','PUT',{id_usuario:cuenta.id,nuevo_rol:'admin'});
  }
  assert.equal(res.status,503);assert.equal(cuenta.publicMetadata.rol,'admin');
  assert.equal(e.state.locks.has(cuenta.id),true);
  e.state.sesion=cuenta.id;e.state.failUserWrite=false;
  assert.equal((await e.call('usuarios','GET')).status,409);
  assert.equal((await e.middle('usuarios','GET')).status,409);
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,409);
});
test('fundador verificado con registro divergente requiere conciliación sin elevar',async()=>{
  const e=entorno('ciudadano');fundador(e);
  e.state.mongoUsers.push({id_clerk:e.actor.id,correo_electronico:'22610282@utgz.edu.mx',rol:'ciudadano',activo:true});
  assert.equal((await e.call('autenticacion/sincronizar','POST')).status,409);
  assert.equal(e.actor.publicMetadata.rol,'ciudadano');assert.equal(e.state.writes.length,0);
});
test('listado usa correo principal y estado inactivo persistido en Mongo',async()=>{
  const e=entorno();e.target.emailAddresses.unshift({id:'secundario',emailAddress:'secundario@example.test',verification:{status:'verified'}});
  e.state.mongoUsers.push({id_clerk:e.target.id,correo_electronico:'user_target@example.test',rol:'ciudadano',activo:false});
  const data=await (await e.call('usuarios','GET')).json();const target=data.datos.find(u=>u.id_clerk===e.target.id);
  assert.equal(target.correo_electronico,'user_target@example.test');assert.equal(target.activo,false);
});
