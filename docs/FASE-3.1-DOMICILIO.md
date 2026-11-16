# Fase 3.1: modelo y contratos de domicilio ciudadano

Alcance aprobado: un domicilio vigente por ciudadano, modelo Mongo independiente,
identidad Clerk, punto GeoJSON confirmado, selección GPS/manual, asignación inicial
pendiente, sin historial de coordenadas. No incluye endpoints, UI, motor de
asignación, cambios de Clerk/sincronizador ni operaciones sobre una BD real.

## Implementación

- `src/modelos/DomicilioCiudadano.ts`: modelo Mongoose, propietario inmutable,
  índice único declarado sobre `ciudadano_id_clerk`, validación y concurrencia.
- `src/contratos/domicilio.ts`: tipos de solicitud y respuesta JSON, punto,
  asignación discriminada y validadores puros de cuerpos `unknown`. Sin imports
  de Mongoose/Clerk; reutilizable desde backend y PWA.
- Pruebas backend con Mongoose real desconectado; pruebas cliente y typecheck
  que importan directamente el mismo contrato, sin duplicarlo.

El modelo conserva exclusivamente el punto vigente, selección, fecha de
confirmación, fechas de creación/actualización, versión y resultado de asignación.
No guarda precisión, lecturas GPS preliminares, coordenadas antiguas, correo,
teléfono, rol ni preferencias de notificación. La confirmación se recibe como
`confirmada: true` y la fecha persistida deberá generarla el servidor.

Las coordenadas son exactamente dos números finitos `[longitud, latitud]`, con
rangos inclusivos ±180/±90. Se rechazan strings, booleanos, null, NaN, Infinity,
coordenadas adicionales y pares incompletos, sin coerción numérica. Los elementos
del array conservan su tipo original y las ediciones se detectan por Mongoose.
No es posible detectar por rangos una inversión si ambos valores caben en ±90;
el contrato de entrada separa `latitud` y `longitud` para evitar esa ambigüedad.

## Estados e invariantes

| Estado | Ruta/método | Evidencia |
|---|---|---|
| pendiente (predeterminado) | ambos null | fecha, política, huella y motivo null |
| asignada | ObjectId de Ruta; cobertura_oficial o revision_administrativa | fecha válida, política, huella y motivo no vacíos |
| ambigua, sin_evidencia, sin_cobertura, requiere_revision | ambos null | fecha válida, política, huella y motivo no vacíos |

La referencia `ruta_id` es un ObjectId de MongoDB; un ID local `ruta_*` es inválido.
Una referencia válida **no prueba** que la ruta exista, esté activa o cubra el
domicilio. Eso deberá validarse en servidor al implementar asignación. Ningún
candidato ni método de proximidad equivale a una asignación definitiva.

## Persistencia y concurrencia

- `version` es un entero seguro no negativo, comienza en cero y es el versionKey
  de Mongoose. `optimisticConcurrency: true` hace que `save()` compare la versión
  leída y la incremente; una escritura obsoleta produce `VersionError`.
- Una versión inicial distinta de cero o su alteración manual en un documento
  persistido se rechaza. No se debe construir un documento nuevo para reemplazar
  una versión existente. Se rechazan escrituras con el contador ya en
  Number.MAX_SAFE_INTEGER para evitar desbordamiento en el siguiente incremento.
- El futuro servicio debe cargar el documento con el propietario de la sesión,
  comparar la versión esperada enviada por cliente, aplicar el cambio completo
  (incluida invalidación de asignación) y usar `save()`. El esquema no autentica
  solicitudes ni compara por sí solo la versión recibida por HTTP.
- Se bloquean updateOne/updateMany/findOneAndUpdate/replaceOne/findOneAndReplace
  y bulkWrite del modelo porque omiten el flujo completo de validación y CAS.
  Las inserciones deben usar documentos validados; no usar escrituras nativas
  `collection`, desactivar validación ni operaciones que eludan estas garantías.
- `autoCreate: false` y `autoIndex: false` evitan crear colecciones/índices al
  registrar este modelo. `unique` declara un índice, no es un validador Mongoose.
  Sin un índice realmente instalado MongoDB no garantiza la unicidad.
- No se conecta con Atlas ni se ejecutan `init`, `syncIndexes`, migraciones o
  creación de índices. La instalación y prueba del índice requieren un entorno
  Mongo aislado autorizado antes de habilitar escrituras de la fase 3.2.
- El control de versión de domicilio no coordina cambios concurrentes de rutas.

## Contratos

Registro: `{ latitud, longitud, tipo_seleccion: 'gps' | 'manual', confirmada: true }`.
Actualización: el mismo cuerpo más `version`. Recálculo: `{ version }`.
Los validadores rechazan campos ausentes o adicionales, incluidos propietario,
rol, asignación, ruta y fechas. No aceptar un objeto de cliente directamente
como argumento del modelo ni utilizar `...cuerpo` para persistirlo.

Los DTO privados omiten el propietario, usan fechas ISO y ObjectId serializado
como string. La respuesta es éxito con datos tipados o error con mensaje/código.
La consulta de domicilio admite `datos: null`. La respuesta de ruta distingue
asignación definitiva con resumen de ruta de los demás estados con ruta null.
Los tipos describen respuestas, no implementan serializadores ni validación de
respuestas de red. El futuro serializador debe hacer una proyección explícita;
no devolver directamente el documento Mongoose.

## Riesgos y requisitos para fase 3.2

El sincronizador actual `/api/ciudadano/sincronizar` verifica identidad y correo,
pero omite `estado_cuenta`, bloqueos pendientes y concordancia Clerk/Mongo. En la
auditoría aislada devolvió 200 y realizó escritura simulada con cuenta banned,
registro Mongo inactivo o bloqueo pendiente. Además devuelve éxito con
`datos: null` ante colisión de correo. No se modifica en esta fase.

**Su respuesta de éxito y `syncEstado === 'done'` no autorizan domicilios.**
Los nuevos handlers deben obtener el propietario desde identidad autenticada
en servidor, exigir perfil vinculado por id_clerk, cuenta activa y rol coherente,
rechazar identificadores del cliente y comprobar autorización en cada operación.
El modelo valida forma y consistencia, no demuestra autenticación ni residencia.

Otros pendientes: instalar/verificar índice en Mongo de prueba; convertir
duplicados 11000 y VersionError a 409; generar todas las fechas en servidor;
consultar estado antes de repetir una creación de resultado incierto; no usar
respaldo local para domicilios o rutas asignadas; respuestas privadas no-store;
limpiar datos al cambiar de cuenta; definir eliminación/retención de respaldos.
Las rutas locales y Mongo necesitan conciliación autorizada antes de asignar.

## Verificación prevista

`npm test` en raíz; typecheck backend sin caché incremental; `npm test` y
`npm run typecheck` en apps/ciudadano. La prueba CAS conserva Mongoose real y
sustituye únicamente collection.updateOne por un transporte en memoria que
comprueba la versión. No demuestra comportamiento de un servidor Mongo real.
La prueba de unicidad verifica la declaración del índice, no su cumplimiento.

## Resultados de esta fase

- Backend `npm test`: 221/221, incluyendo 21 pruebas nuevas de domicilio.
- Backend `tsc --noEmit --incremental false`: salida 0.
- Backend `npm run build`: salida 0, incluida comprobación de tipos.
- PWA `npm run typecheck`: salida 0, incluidos rechazos de tipos con
  `@ts-expect-error` sobre propietario, confirmación, estados y respuestas.
- PWA `npm test`: 26/28. Las dos pruebas nuevas de contratos pasan. Fallan las
  pruebas preexistentes de `cuenta.test.mjs`: «cuenta web configurada muestra
  acceso sin consultar perfil de visitante» y «sin clave pública la cuenta
  informa pendiente y no ofrece login ficticio». Ambas reproducidas ejecutando
  únicamente ese archivo: `require is not defined in ES module scope` al cargar
  `lucide-react/dist/cjs/lucide-react.js`. No se modifican UI, dependencias ni
  esas pruebas para resolver un fallo ajeno al alcance.
- Node emite aviso MODULE_TYPELESS_PACKAGE_JSON al importar el contrato TS de
  raíz desde las pruebas ESM de la PWA; las pruebas pasan. No se altera el tipo
  de módulo del repositorio para ocultar ese aviso.
- Revisión independiente final del modelo: 21/21 pruebas focalizadas, sin
  hallazgos adicionales. Se verificaron y corrigieron validación síncrona,
  cambios aislados en asignación y agotamiento de versión mediante regresiones.
- Sin conexiones de prueba a MongoDB/Clerk, instalación de índices, migraciones
  ni commits. No se acredita unicidad ni concurrencia contra un servidor Mongo.
