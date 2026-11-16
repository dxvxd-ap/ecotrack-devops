import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aparienciaAutenticacion} from '../src/app/apariencia-clerk.ts';
function contraste(a:string,b:string){const l=(h:string)=>h.slice(1).match(/../g)!.map(v=>{const n=parseInt(v,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,n,i)=>s+n*[.2126,.7152,.0722][i],0);const x=[l(a),l(b)].sort((a,b)=>b-a);return(x[0]+.05)/(x[1]+.05);}
for(const tema of ['light','dark'] as const)test(`apariencia ${tema} ofrece colores directos y pares de contraste legibles`,()=>{
 const appearance=aparienciaAutenticacion(tema);const v=appearance.variables;
 for(const color of Object.values(v))assert.match(color as string,/^#[\da-f]{6}$/i);
 for(const [texto,fondo] of [[v.colorForeground,v.colorBackground],[v.colorMutedForeground,v.colorBackground],[v.colorInputForeground,v.colorInput],[v.colorPrimaryForeground,v.colorPrimary],[v.colorDanger,v.colorBackground]])assert.ok(contraste(texto!,fondo!)>=4.5,`${texto}/${fondo}`);
 assert.equal(appearance,aparienciaAutenticacion(tema));
});
