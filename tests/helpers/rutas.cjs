const { entorno } = require('./entorno.cjs');
const A='000000000000000000000001',B='000000000000000000000002';
const entrada=()=>({id_ruta:'R1',nombre:'Ruta ficticia',descripcion:'Solo pruebas',trazado_geojson:{type:'LineString',coordinates:[[0,0],[0.01,0.01]]},color_mapa:'#047857',distancia_estimada_km:1,duracion_estimada_min:12});
function preparar(rol='admin') {
 const estado={docs:[],fallo:null,lecturasJSON:0,escriturasJSON:0,antesCrear:null,antesActualizar:null,consultas:[],creaciones:[]};
 const comprobar=()=>{if(estado.fallo)throw estado.fallo;};
 const coincide=(d,f)=>Object.entries(f).every(([k,v])=>k==='$and'?v.every(x=>coincide(d,x)):v&&typeof v==='object'&&'$exists'in v?Object.hasOwn(d,k)===v.$exists:v&&typeof v==='object'&&'$eq'in v?JSON.stringify(d[k])===JSON.stringify(v.$eq):d[k]===v);
 const modelo={
  collection:{indexes:async()=>[{key:{id_ruta:1},unique:true}]},
  findOne(filtro){comprobar();return{lean:async()=>structuredClone(estado.docs.find(d=>coincide(d,filtro))||null)};},
  find(filtro){comprobar();estado.consultas.push(filtro);return{sort:async()=>structuredClone(estado.docs.filter(d=>coincide(d,filtro)))};},
  async create(datos,opciones){comprobar();if(estado.antesCrear)await estado.antesCrear();estado.creaciones.push({datos:structuredClone(datos),opciones});const varios=Array.isArray(datos);const salida=[];for(const d of varios?datos:[datos]){if(estado.docs.some(x=>x.id_ruta===d.id_ruta))throw Object.assign(Error('Dato privado duplicado'),{code:11000});const doc={...structuredClone(d),_id:d._id||A,activa:d.activa??true,fecha_creacion:new Date().toISOString()};estado.docs.push(doc);salida.push(doc);}return varios?salida:salida[0];},
  async findOneAndUpdate(filtro,cambio,opciones){comprobar();if(estado.antesActualizar)await estado.antesActualizar();estado.consultas.push(structuredClone(filtro));const doc=estado.docs.find(d=>coincide(d,filtro));if(!doc)return null;Object.assign(doc,cambio.$set);return structuredClone(doc);},
  async findByIdAndUpdate(id,cambio){comprobar();const doc=estado.docs.find(d=>d._id===id);if(doc)Object.assign(doc,cambio);return doc||null;},
 };
 const e=entorno(rol,{dependencias:{'@/modelos/Ruta':{ModeloRuta:modelo},'@/lib/almacen_local':{
  leer_almacen_local(){estado.lecturasJSON++;return{rutas:[{...entrada(),_id:'ruta_antigua',activa:true}]};},
  guardar_almacen_local(){estado.escriturasJSON++;},
 }}});
 return{e,estado,modelo};
}
module.exports={preparar,entrada,A,B};
