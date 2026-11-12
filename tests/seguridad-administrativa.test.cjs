const { test } = require('node:test');
const assert = require('node:assert/strict');
const { entorno, usuario } = require('./helpers/entorno.cjs');

const operaciones = [ ['usuarios','GET'], ['usuarios','PUT'], ['usuarios','DELETE'],
  ['roles','GET'], ['roles','POST'], ['usuarios/preasignar','POST'], ['usuarios/preasignar','DELETE'] ];
for (const rol of [null, 'ciudadano', 'conductor', 'secretario', 'moderador', 'camion', 'desconocido']) {
  for (const [endpoint,method] of operaciones) test(`${rol || 'anónimo'}: ${method} ${endpoint} denegado antes de escribir`, async () => {
    const e = entorno(rol); if (!rol) e.state.sesion = null;
    const r = await e.call(endpoint,method,method === 'PUT' || method === 'POST' ? {} : undefined);
    assert.equal(r.status, rol ? 403 : 401); assert.equal(e.state.writes.length,0);
  });
}
for (const [endpoint,method] of operaciones) test(`middleware deniega anónimo ${method} ${endpoint}`, async () => {
  const e=entorno(); e.state.sesion=null; assert.equal((await e.middle(endpoint,method)).status,401);
});
test('middleware ignora claims privilegiados obsoletos', async () => {
  const e=entorno('ciudadano'); assert.equal((await e.middle('usuarios','GET')).status,403);
});
for (const rol of ['admin','superadmin']) for (const endpoint of ['usuarios','roles']) test(`${rol} consulta ${endpoint}`, async () => {
  assert.equal((await entorno(rol).call(endpoint,'GET')).status,200);
});
test('admin cambia nombre y rol inferior', async () => {
  const e=entorno('admin'); const r=await e.call('usuarios','PUT',{id_usuario:e.target.id,correo_electronico:'user_target@example.test',nuevo_rol:'conductor',nombre_completo:'Nuevo Nombre'});
  assert.equal(r.status,200); assert.equal(e.state.users[1].publicMetadata.rol,'conductor');
  assert.equal(e.state.users[1].publicMetadata.dato_conservado,'sí');
});
for (const rol of ['admin','superadmin','dinamico']) test(`admin no modifica cuenta ${rol}, ni su nombre`, async () => {
  const e=entorno('admin'); e.target.publicMetadata.rol=rol;
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nombre_completo:'Cambio'})).status,403);
  assert.equal(e.state.writes.length,0);
});
for (const rol of ['admin','superadmin','dinamico']) test(`admin no asigna ${rol}`, async () => {
  const e=entorno('admin'); assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nuevo_rol:rol})).status,403);
  assert.equal(e.state.writes.length,0);
});
for (const [endpoint,method] of [['usuarios','DELETE'],['roles','POST']]) test(`admin no puede ${method} ${endpoint}`,async()=>{
  const e=entorno('admin'); assert.equal((await e.call(endpoint,method,method==='POST'?{nombre:'nuevo',descripcion:'Prueba'}:undefined,'?id=user_target')).status,403);
  assert.equal(e.state.writes.length,0);
});
test('admin no se autoeleva',async()=>{
  const e=entorno('admin'); assert.equal((await e.call('usuarios','PUT',{id_usuario:e.actor.id,nuevo_rol:'superadmin'})).status,403);
  assert.equal(e.state.writes.length,0);
});
for (const method of ['PUT','DELETE']) test(`fundador protegido de ${method}`,async()=>{
  const e=entorno(); e.target.id='user_3JzRT8FQJPrqKEfk2QdjZpFaRVN';
  const r=await e.call('usuarios',method,method==='PUT'?{id_usuario:e.target.id,nuevo_rol:'ciudadano',activo:false}:undefined,`?id=${e.target.id}`);
  assert.equal(r.status,403); assert.equal(e.state.writes.length,0);
});
for (const body of [{nuevo_rol:'ciudadano'},{activo:false}]) test(`superadmin protegido: ${JSON.stringify(body)}`,async()=>{
  const e=entorno(); e.target.publicMetadata.rol='superadmin';
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,...body})).status,403); assert.equal(e.state.writes.length,0);
});
test('último superadmin no puede eliminarse a sí mismo',async()=>{
  const e=entorno(); assert.equal((await e.call('usuarios','DELETE',undefined,'?id=user_actor')).status,403); assert.equal(e.state.writes.length,0);
});
test('borrados concurrentes de superadmins quedan bloqueados',async()=>{
  const e=entorno(); e.target.publicMetadata.rol='superadmin';
  const res=await Promise.all([e.call('usuarios','DELETE',undefined,'?id=user_actor'),e.call('usuarios','DELETE',undefined,'?id=user_target')]);
  assert.equal(res.every(r=>r.status===403 || r.status===409),true); assert.equal(e.state.writes.length,0);
});
for (const method of ['PUT','DELETE']) test(`ID/correo inconsistentes en ${method}`,async()=>{
  const e=entorno(); const r=await e.call('usuarios',method,method==='PUT'?{id_usuario:e.target.id,correo_electronico:'otra@example.test',nuevo_rol:'conductor'}:undefined,'?id=user_target&correo=otra@example.test');
  assert.equal(r.status,400); assert.equal(e.state.writes.length,0);
});
test('superadmin elimina cuenta inferior con identidad concordante',async()=>{
  const e=entorno(); const r=await e.call('usuarios','DELETE',undefined,'?id=user_target&correo=user_target@example.test');
  assert.equal(r.status,200); assert.equal(e.state.users.some(u=>u.id==='user_target'),false);
});
for (const rol of ['admin','superadmin','dinamico']) test(`preasignación no permite a admin asignar ${rol}`,async()=>{
  const e=entorno('admin'); const r=await e.call('usuarios/preasignar','POST',{correo_electronico:'nuevo@example.test',nombre_completo:'Nuevo',rol_asignado:rol});
  assert.equal(r.status,403); assert.equal(e.state.writes.length,0);
});
test('preasignar no permite degradar superadmin existente',async()=>{
  const e=entorno(); e.target.publicMetadata.rol='superadmin';
  const r=await e.call('usuarios/preasignar','POST',{correo_electronico:'user_target@example.test',nombre_completo:'Nuevo',rol_asignado:'ciudadano'});
  assert.equal(r.status,403); assert.equal(e.state.writes.length,0);
});
test('admin no altera preasignación admin pendiente en MongoDB',async()=>{
  const e=entorno('admin'); e.state.pre.push({correo_electronico:'pendiente@example.test',rol_asignado:'admin'});
  const r=await e.call('usuarios/preasignar','DELETE',undefined,'?correo=pendiente@example.test');
  assert.equal(r.status,403); assert.equal(e.state.writes.length,0);
});
test('admin crea preasignación inferior',async()=>{
  const e=entorno('admin'); const r=await e.call('usuarios/preasignar','POST',{correo_electronico:'nuevo@example.test',nombre_completo:'Nuevo',rol_asignado:'conductor'});
  assert.equal(r.status,200); assert.equal(e.state.pre[0].rol_asignado,'conductor');
  assert.equal(e.state.local.preasignaciones.length,0);
});
test('fallo Clerk deniega sin mutaciones',async()=>{
  const e=entorno(); e.state.failClerk=true; const r=await e.call('usuarios','DELETE',undefined,'?id=user_target');
  assert.equal(r.status,503); assert.equal(e.state.writes.length,0);
});
test('BD inaccesible bloquea verificación de preasignación',async()=>{
  const e=entorno('admin'); e.state.failDB=true;
  const r=await e.call('usuarios/preasignar','POST',{correo_electronico:'nuevo@example.test',nombre_completo:'Nuevo',rol_asignado:'conductor'});
  assert.equal(r.status,503); assert.equal(e.state.writes.length,0);
});
test('admin cancela preasignación inferior sin eliminar cuenta Clerk',async()=>{
  const e=entorno('admin'); e.state.pre.push({correo_electronico:'pendiente@example.test',rol_asignado:'conductor'});
  e.state.local.preasignaciones.push({correo_electronico:'pendiente@example.test',rol_asignado:'conductor'});
  const r=await e.call('usuarios/preasignar','DELETE',undefined,'?correo=pendiente@example.test');
  assert.equal(r.status,200); assert.equal(e.state.pre.length,0); assert.equal(e.state.local.preasignaciones.length,1);
  assert.equal(e.state.users.length,2);
});
test('superadmin crea rol dinámico sin habilitar su asignación',async()=>{
  const e=entorno();
  assert.equal((await e.call('roles','POST',{nombre:'auditor',descripcion:'Lectura',permisos:['usuarios:ver']})).status,200);
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nuevo_rol:'auditor'})).status,403);
});
test('superadmin asigna superadmin a otra cuenta inferior',async()=>{
  const e=entorno(); const r=await e.call('usuarios','PUT',{id_usuario:e.target.id,nuevo_rol:'superadmin'});
  assert.equal(r.status,200); assert.equal(e.state.users[1].publicMetadata.rol,'superadmin');
});
test('superadmin puede cambiar nombre de otro admin',async()=>{
  const e=entorno(); e.target.publicMetadata.rol='admin';
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nombre_completo:'Nombre Permitido'})).status,200);
  assert.equal(e.state.users[1].firstName,'Nombre');
});
test('identidad MongoDB discordante bloquea borrado antes de Clerk',async()=>{
  const e=entorno(); e.state.mongoUsers.push({id_clerk:'user_otro',correo_electronico:'user_target@example.test',rol:'ciudadano'});
  assert.equal((await e.call('usuarios','DELETE',undefined,'?id=user_target')).status,409);
  assert.equal(e.state.writes.length,0);
});
test('rol privilegiado local no concede autoridad frente a identidad real inferior',async()=>{
  const e=entorno('admin'); e.state.local.preasignaciones.push({correo_electronico:'user_target@example.test',rol_asignado:'superadmin'});
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nombre_completo:'Cambio'})).status,200);
  assert.equal(e.target.publicMetadata.rol,'ciudadano');
  assert.equal(e.state.local.preasignaciones[0].rol_asignado,'superadmin');
});
test('rol con nombre de propiedad heredada se deniega',async()=>{
  const e=entorno('__proto__'); assert.equal((await e.call('usuarios','GET')).status,403);
});
test('correo fundador no verificado no concede permisos',async()=>{
  const e=entorno('ciudadano'); e.actor.emailAddresses[0].emailAddress='22610282@utgz.edu.mx';
  e.actor.emailAddresses[0].verification.status='unverified';
  assert.equal((await e.call('usuarios','GET')).status,403);
});
test('correo fundador verificado conserva protección existente',async()=>{
  const e=entorno(); e.target.emailAddresses[0].emailAddress='22610282@utgz.edu.mx';
  assert.equal((await e.call('usuarios','DELETE',undefined,'?id=user_target')).status,403);
  assert.equal(e.state.writes.length,0);
});
test('Clerk no disponible al resolver objetivo bloquea antes de escribir',async()=>{
  const e=entorno(); e.state.users=e.state.users.filter(u=>u.id!==e.target.id);
  assert.equal((await e.call('usuarios','DELETE',undefined,'?id=user_target')).status,404);
  assert.equal(e.state.writes.length,0);
});
test('parámetros con objetos en lugar de identidad se rechazan',async()=>{
  const e=entorno(); assert.equal((await e.call('usuarios','PUT',{id_usuario:{$ne:null},nuevo_rol:'conductor'})).status,400);
  assert.equal(e.state.writes.length,0);
});
test('middleware permite consulta admin y bloquea creación de roles',async()=>{
  const e=entorno('admin'); assert.equal((await e.middle('roles','GET')).status,200);
  assert.equal((await e.middle('roles','POST')).status,403);
});
test('promoción y edición inferior concurrentes no pueden violar la matriz',async()=>{
  const e=entorno('admin'); let entrar; let continuar;
  const dentro=new Promise(resolve=>{entrar=resolve;});
  const desbloqueado=new Promise(resolve=>{continuar=resolve;});
  e.state.beforeUpdate=async()=>{e.state.beforeUpdate=null; entrar(); await desbloqueado;};
  const pendiente=e.call('usuarios','PUT',{id_usuario:e.target.id,nuevo_rol:'conductor'});
  await dentro;
  // Segunda solicitud autenticada por otro superadmin, mismo objetivo por correo.
  const superadmin=usuario('user_supervisor','superadmin'); e.state.users.push(superadmin); e.state.sesion=superadmin.id;
  const promocion=await e.call('usuarios','PUT',{correo_electronico:'user_target@example.test',nuevo_rol:'superadmin'});
  continuar(); const primera=await pendiente;
  assert.equal(promocion.status,409); assert.equal(primera.status,200);
  assert.equal(e.state.users[1].publicMetadata.rol,'conductor'); assert.equal(e.state.locks.size,0);
});
test('bloqueo persistente impide modificar cuenta hasta recuperación explícita',async()=>{
  const e=entorno(); e.state.locks.add('user_target');
  const r=await e.call('usuarios','DELETE',undefined,'?id=user_target');
  assert.equal(r.status,409); assert.equal(e.state.writes.length,0); assert.equal(e.state.locks.size,1);
});
test('fallo remoto incierto conserva bloqueo y evita reintentar escrituras',async()=>{
  const e=entorno(); e.state.beforeUpdate=async()=>{throw Error('Resultado remoto incierto');};
  const body={id_usuario:e.target.id,nuevo_rol:'conductor'};
  assert.equal((await e.call('usuarios','PUT',body)).status,503);
  assert.equal(e.state.locks.has('user_target'),true);
  assert.equal((await e.call('usuarios','PUT',body)).status,409);
});
test('rechazo por privilegios libera bloqueo sin mutaciones de cuenta',async()=>{
  const e=entorno('admin'); e.target.publicMetadata.rol='admin';
  assert.equal((await e.call('usuarios','PUT',{id_usuario:e.target.id,nombre_completo:'Cambio'})).status,403);
  assert.equal(e.state.locks.size,0); assert.equal(e.state.writes.length,0);
});
for (const method of ['PUT','DELETE']) test(`${method} inexistente no bloquea una preasignación posterior`,async()=>{
  const e=entorno();
  const r=await e.call('usuarios',method,method==='PUT'?{correo_electronico:'nuevo@example.test',nombre_completo:'Nuevo'}:undefined,'?correo=nuevo@example.test');
  assert.equal(r.status,404); assert.equal(e.state.writes.length,0); assert.equal(e.state.locks.size,0);
  const pre=await e.call('usuarios/preasignar','POST',{correo_electronico:'nuevo@example.test',nombre_completo:'Nuevo',rol_asignado:'conductor'});
  assert.equal(pre.status,200);
});
