# Fase 3.2: API privada de domicilio ciudadano

## Diagnóstico previo a modificar el sincronizador

El POST existente en `/api/ciudadano/sincronizar` obtiene identidad Clerk y
correo principal verificado, y hace upsert de Usuario por id_clerk. No consulta
estado_cuenta(), bloqueos pendientes, restricciones banned/locked/activo,
concordancia de rol ni colisiones de identidad antes de escribir. Una colisión
de correo puede responder 200 con datos:null, que el cliente considera éxito.
Esto se reprodujo con dependencias en memoria durante la auditoría anterior.

Corrección acotada: autorización ciudadana compartida basada en identidad Clerk
actual, estado_cuenta(), rol efectivo ciudadano y correo principal verificado.
El sincronizador puede admitir ausencia de perfil para crear ciudadanos nuevos;
la API de domicilio exige perfil existente, activo y vinculado por id_clerk.
Una colisión de correo o cambio de vinculación requiere conciliación, nunca
apropiación por correo. No modificar roles Clerk, redirecciones, HTTPS ni UI.

## Plan de ejecución y límites

1. Regresiones de autorización/sincronización y persistencia aislada.
2. Autorizador específico y sincronización bajo los bloqueos compartidos con
   administración, releyendo identidad y perfil dentro del bloqueo.
3. GET/POST/PUT de domicilio, reutilizando contratos 3.1 sin ampliarlos.
4. Cuerpos JSON acotados a 4096 bytes reales, propiedad por sesión, respuestas
   privadas no-store, serialización explícita y errores sin datos internos.
5. Verificación completa, revisión independiente y registro de resultados.

Archivos previstos: src/lib/autorizacion_ciudadana.ts,
src/lib/http_ciudadano.ts, src/lib/domicilio_ciudadano.ts,
src/app/api/ciudadano/domicilio/route.ts y sincronizador existente; pruebas
backend y su infraestructura. No implementar rutas/selector/recálculo ni tocar
archivos visuales o iconos que otro agente está investigando.

Las escrituras de domicilio comprobarán por lectura de metadatos que exista un
índice único completo de ciudadano_id_clerk. No lo crean: si falta, es parcial,
sparse o no se puede verificar, responden 503 antes de guardar. Sin un Mongo de
pruebas autorizado no se acredita la instalación real ni se conecta a Atlas.

POST inserta documento nuevo validado; PUT carga por propietario, compara versión
y usa save() con optimisticConcurrency. Punto y asignación pendiente se guardan
juntos. Los errores duplicados y VersionError se convierten a 409. Las mutaciones
usan la exclusión persistente ya existente con administración; errores de
resultado incierto conservan el bloqueo para conciliación conforme a su política.
Ninguna operación utiliza respaldo JSON ni escribe coordenadas en logs.

## API implementada

| Operación | Respuesta |
|---|---|
| GET /api/ciudadano/domicilio | 200 con DTO propio o datos:null si el perfil existe pero no tiene domicilio |
| POST /api/ciudadano/domicilio | 201 para el primer domicilio confirmado; 409 si ya existe |
| PUT /api/ciudadano/domicilio | 200 con versión incrementada; 404 si no existe; 409 si la versión es obsoleta |

POST recibe exactamente `{latitud,longitud,tipo_seleccion,confirmada:true}`.
PUT añade `version`. Ambos guardan `[longitud,latitud]` y reinician toda la
asignación a pendiente en la misma escritura. El servidor fija fecha de
confirmación y timestamps. No se conserva la ubicación anterior.

La respuesta de éxito conserva `{exito:true,mensaje,datos}`. Los errores
conservan el tipo aprobado en 3.1: `{exito:false,mensaje,codigo}`. No se modifica
src/contratos/domicilio.ts ni el modelo. Se proyectan explícitamente los campos
del DTO; no se devuelven propietario, _id, correo, rol ni documento Mongo bruto.
GET incluye `asignacion`, sin implementar motor, candidatos, horarios o ETA.

Todas las respuestas de estos handlers, incluidos errores y sincronización,
incluyen `Cache-Control: private, no-store`. Códigos adicionales: 400 para JSON,
coordenadas o campos inválidos; 401 sin sesión; 403 restricciones/rol/correo u
origen no permitido; 409 para perfil no sincronizado, identidad en conflicto o
bloqueo; 413 al superar 4096 bytes; 415 para tipo distinto de application/json;
503 para dependencia inaccesible, índice no verificable o escritura incierta.
No se admiten parámetros de consulta para seleccionar propietarios.

El límite cuenta bytes reales del stream, sin confiar en Content-Length. El
decodificador UTF-8 es estricto. En mutaciones con autenticación ambiente se
rechaza Origin ajeno cuando está presente. El Bearer explícito de la PWA sigue
siendo validado por Clerk y permite el proxy HTTPS existente; no se añaden
cabeceras CORS ni se cambian orígenes/variables. No se utiliza el resultado de
sincronizarPerfil() como autorización para llamadas posteriores.

## Sincronización corregida

La ruta conserva método, URL y DTO consumidos por el frontend. Admite un
ciudadano nuevo sin perfil Mongo tras validar correo/estado; lo crea activo con
rol ciudadano. Los perfiles existentes deben concordar en identidad, correo,
rol y actividad. No reactiva cuentas, no eleva roles, no modifica Clerk ni
consume preasignaciones. El cuerpo no decide ningún dato de identidad.

La sincronización y las mutaciones domiciliarias comparten los bloqueos de
cuenta con administración. Tras adquirirlos se relee Clerk y el perfil Mongo,
y se verifica que las claves de identidad no hayan cambiado. Un duplicado de
Mongo produce conflicto en lugar del antiguo 200 con datos:null.

## Resultados de verificación

- `npm test` backend: **301/301**. Incluye los 221 anteriores, 64 pruebas de
  API domiciliaria y 16 regresiones nuevas de sincronización.
- Focales de API/sincronización: **83/83**, también ejecutadas por un auditor
  independiente, sin hallazgos adicionales de seguridad.
- Backend `tsc --noEmit --incremental false`: salida 0.
- PWA `npm run typecheck`: salida 0.
- `npm run build` Next.js: salida 0; nueva ruta compilada como dinámica.
- Suite PWA completa: **26/28**; las pruebas de contratos de domicilio pasan.
  Se mantienen y se reportan los fallos preexistentes de cuenta.test.mjs:
  «cuenta web configurada muestra acceso sin consultar perfil de visitante» y
  «sin clave pública la cuenta informa pendiente y no ofrece login ficticio».
  Fallan al cargar lucide-react por `require is not defined in ES module scope`.
  No se modifican dependencias, autenticación frontend ni esas pruebas.
- Continúa el aviso MODULE_TYPELESS_PACKAGE_JSON al importar el contrato TS de
  raíz en Node; no se cambia la configuración de módulos para ocultarlo.
- `git diff --check`: correcto.
- `graphify update .`: completado según AGENTS.md, sin LLM. Se actualizan los
  artefactos de graphify-out y se conserva copia del grafo anterior en su carpeta
  2026-11-15. El extractor incluyó archivos del respaldo preexistente .next-respaldo;
  el grafo sirve de navegación, no de prueba ni de inventario limpio de fuentes.

Las pruebas ejecutan handlers, autorizadores y Mongoose reales; sustituyen
Clerk, conexión Mongo y transportes de colección por memoria. Comprueban filtros,
save/CAS, índice declarado y comprobación de metadatos simulados. No prueban la
unicidad ni exclusión contra un servidor Mongo real. No hubo escrituras de
prueba en Atlas, instalación de índices, migraciones ni cambios remotos Clerk.

## Pendientes y preparación para 3.3

- Verificar en Mongo aislado autorizado el índice único completo y carreras de
  inserción/actualización. Mientras el índice no exista, POST/PUT permanecen
  cerrados con 503; no se habilitan mediante un fallback local.
- La exclusión existente no tiene TTL. Un fallo de resultado incierto después
  de iniciar la escritura retiene los bloqueos, incluso si el documento llegó
  a guardarse. Nuevas operaciones pueden devolver 409 hasta conciliación por
  un operador autorizado. No se añade desbloqueo automático.
- Cambios directos externos en Clerk/Mongo no participan en estos bloqueos;
  no se promete una transacción distribuida con Clerk. No retirar el índice
  manualmente mientras existan escrituras.
- Falta validación con sesión real de iPhone/HTTPS y una base controlada. El
  login/redirecciones/frontend se conservan; las pruebas aisladas no acreditan
  OAuth físico ni despliegue.
- Para 3.3, el selector debe mantener borrador en memoria, confirmar antes del
  POST/PUT, enviar la versión consultada y recuperar estado tras 409. Un 503
  incierto nunca debe interpretarse como permiso para repetir ciegamente POST.
- El estado pendiente no significa falta de cobertura. No existe asignación
  automática ni se verifica cobertura en esta fase.

No se modifican mapa, temas, navegación, iconos PWA, API de rutas, geometrías,
contratos 3.1, modelo domiciliario, variables ni certificados. Sin dependencias
nuevas ni commits. Se detiene la ejecución al terminar esta fase.
