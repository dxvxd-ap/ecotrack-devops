#!/usr/bin/env node
'use strict';
// Nunca carga .env. Solo base ficticia explícita loopback; sin syncIndexes ni dropIndexes.
const path=require('node:path'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript');
function especificacion(){
 const f=path.resolve(__dirname,'../src/lib/indices_reclamos.ts'),m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));
 m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);return m.exports;
}
function validarDestino(uri){
 let u;try{u=new URL(uri);}catch{throw Error('Destino aislado explícito requerido');}
 if(u.protocol!=='mongodb:'||u.hostname!=='127.0.0.1'||!u.port||Number(u.port)<1024||u.username||u.password||u.search||u.hash||!/^\/ecotrack_reclamos_test_[a-z0-9_]+$/.test(u.pathname))throw Error('Solo loopback, puerto explícito y base ecotrack_reclamos_test_NOMBRE sin credenciales ni opciones');
 return{uri:u.href,base:u.pathname.slice(1)};
}
async function main(args=process.argv.slice(2)){
 if(args.some(a=>a!=='--confirm'&&!a.startsWith('--uri='))||args.filter(a=>a.startsWith('--uri=')).length!==1)throw Error('Uso: --uri=mongodb://127.0.0.1:PUERTO/ecotrack_reclamos_test_NOMBRE [--confirm]');
 const d=validarDestino(args.find(a=>a.startsWith('--uri=')).slice(6));const s=especificacion();
 if(!args.includes('--confirm'))return{sin_conexion:true,sin_escrituras:true,base:d.base,indices:s.INDICES_RECLAMOS_R1};
 const{MongoClient}=require('mongoose').mongo;const c=new MongoClient(d.uri,{directConnection:true,serverSelectionTimeoutMS:3000});
 try{
  await c.connect();const col=c.db(d.base).collection('reclamos');
  if(await col.countDocuments({})!==0)throw Error('Se requiere una colección vacía de pruebas; no se modifica una poblada');
  for(const{key,...opciones}of s.INDICES_RECLAMOS_R1)await col.createIndex(key,{...opciones,writeConcern:{w:'majority',j:true,wtimeout:5000}});
  if(!s.indicesReclamosDisponibles(await col.indexes()))throw Error('Los índices no coinciden');
  return{base:d.base,indices_verificados:true};
 }finally{await c.close();}
}
if(require.main===module)main().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error('Preparación rechazada o no confirmada; revisa el destino aislado y los índices');process.exitCode=1;});
module.exports={validarDestino,especificacion,main};
