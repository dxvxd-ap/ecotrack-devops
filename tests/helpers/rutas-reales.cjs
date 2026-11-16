// Carga el handler y modelo reales. Solo autorización y conexión se sustituyen; nunca importa base_datos.ts.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {NextResponse}=require('next/server');
const raiz=path.resolve(__dirname,'../..');
function cargarRutas(mongooseAislado){
 const cache=new Map();
 class ErrorAdministrativo extends Error{constructor(status,mensaje){super(mensaje);this.status=status;}}
 const stubs={
  mongoose:mongooseAislado,
  'next/server':{NextResponse},
  '@/lib/base_datos':{conectar_base_datos:async()=>{if(mongooseAislado.connection.readyState!==1)throw Error('Conexión aislada no disponible');}},
  '@/lib/autorizacion':{ErrorAdministrativo,autorizar_administracion:async permiso=>{if(permiso!=='rutas:gestionar')throw Error('Permiso inesperado');},respuesta_error_administrativo:error=>NextResponse.json({exito:false,mensaje:error.message},{status:error.status})},
 };
 function load(relativa){
  const archivo=path.resolve(raiz,relativa);
  if(!archivo.startsWith(raiz+'/src/')||archivo.endsWith('/lib/base_datos.ts')||archivo.endsWith('/lib/autorizacion.ts'))throw Error('Importación no autorizada');
  if(cache.has(archivo))return cache.get(archivo).exports;
  const modulo={exports:{}};cache.set(archivo,modulo);
  const req=nombre=>{if(stubs[nombre])return stubs[nombre];if(nombre.startsWith('@/'))return load('src/'+nombre.slice(2)+'.ts');throw Error('Dependencia no permitida');};
  const codigo=ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext('(function(require,module,exports){'+codigo+'\n})',{Response,URL,URLSearchParams,Date,Error,SyntaxError,console})(req,modulo,modulo.exports);
  return modulo.exports;
 }
 const handler=load('src/app/api/rutas/route.ts');
 return{handler,modelo:mongooseAislado.models.Ruta,call:(metodo,cuerpo,query='')=>handler[metodo](new Request('http://localhost/api/rutas'+query,{method:metodo,...(cuerpo?{body:JSON.stringify(cuerpo),headers:{'Content-Type':'application/json'}}:{})}))};
}
module.exports={cargarRutas};
