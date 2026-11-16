const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {validarDestino}=require('../scripts/preparar-rutas-desarrollo.cjs');
const script=path.resolve(__dirname,'../scripts/preparar-rutas-desarrollo.cjs');
const local='mongodb://127.0.0.1:27018/ecotrack_rutas_dev_equipo';
test('sin confirmación solo presenta un plan, sin conectar ni usar el entorno real',()=>{
 const r=spawnSync(process.execPath,[script,'--uri='+local],{encoding:'utf8',env:{PATH:process.env.PATH,MONGODB_URI:'mongodb+srv://no-usar.example.test/produccion'}});
 assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout),{sin_escrituras:true,sin_conexion:true,base:'ecotrack_rutas_dev_equipo',rutas_ficticias:2});
});
for(const uri of ['mongodb+srv://cluster.example.test/ecotrack_rutas_dev_x','mongodb://192.168.1.20:27017/ecotrack_rutas_dev_x','mongodb://localhost:27017/ecotrack_rutas_dev_x','mongodb://127.0.0.1:27017/produccion','mongodb://127.0.0.1/ecotrack_rutas_dev_x','mongodb://usuario:secreto@127.0.0.1:27017/ecotrack_rutas_dev_x',local+'?replicaSet=externo',local+'#fragmento','mongodb://127.0.0.1:27017/ecotrack_rutas_dev_x/otra'])test('preparación rechaza destino no autorizado sin mostrar sus valores',()=>{
 assert.throws(()=>validarDestino(uri));
 const r=spawnSync(process.execPath,[script,'--uri='+uri,'--confirm'],{encoding:'utf8',timeout:5000});assert.equal(r.status,1);assert.doesNotMatch(r.stderr,/usuario|secreto|192\.168/);
});
test('preparación no usa URI del entorno como alternativa a la explícita',()=>{
 const r=spawnSync(process.execPath,[script,'--confirm'],{encoding:'utf8',env:{PATH:process.env.PATH,MONGODB_URI:local}});assert.equal(r.status,1);
});
