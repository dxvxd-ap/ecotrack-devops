# Fase 3.2.5: fallos controlados y conciliación

## Alcance y entorno

Sin cambios de producción. Suite explícita:
`tests/integracion/fallos-conciliacion-real.cjs`.

Se verificaron antes de escribir el ID
`f4e95d3a33837be25a672f4bc1df3f9517dbd910971c317e11e7bce633591b00`,
las etiquetas pruebas-322/sesión, estado running, publicación exclusiva en
127.0.0.1:27018, base ecotrack_pruebas_322_d8d77bcd3c02, usuario limitado
ecotrack_pruebas con readWrite sobre esa base e índice único completo de
ciudadano_id_clerk. Se reutilizan las verificaciones estrictas de 3.2.3.

El loader no permite cargar base_datos.ts ni dependencias externas arbitrarias;
Clerk se simula solo en el arnés. La conexión Mongo está fijada a loopback con
directConnection:true y retryWrites:false. El bloqueo de sockets solo permite
el Mongo autorizado y el HTTP efímero propio. No se carga .env.local.

## Matriz final: 8 aprobadas, 0 fallidas

| Escenario | Punto exacto | HTTP | Estado persistido | Bloqueos / recuperación |
|---|---|---|---|---|
| Duplicado nativo POST | Después de preparar/validar, antes del insert: otro cliente inserta el mismo ciudadano | 409 CONFLICTO_PERSISTENCIA | Un documento, del escritor independiente | Liberados |
| VersionError nativo PUT | Antes del update del handler: otro cliente guarda versión 1 | 409 CONFLICTO_PERSISTENCIA | Versión 1 y selección GPS del ganador | Liberados |
| Contención determinista | Primer POST retenido antes de su insert, conservando bloqueo Mongo real | Segundo 409; primero 201 al liberar barrera | Cero antes de liberar; una escritura al finalizar | El segundo no retira el bloqueo del primero |
| Fallo previo al escritor | Conector rechazado en el loader de prueba | 503 | Ningún documento | No hay bloqueos adquiridos |
| Fallo durante preparación | Hook de lectura de índices lanza error | 503 | Ningún documento | Liberados |
| Escritor iniciado sin enviar insert | Hook insertOne lanza antes de llamar al transporte | 503; GET posterior 409 | Ningún documento | Retenidos; conciliación y GET 200 después |
| Escritura aplicada y confirmación ocultada | insertOne real termina; hook lanza error antes de devolver su resultado | 503; GET posterior 409 | Un documento real, versión 0 | Retenidos; conciliación y GET 200 después |
| Respuesta HTTP perdida | Socket propio destruido después de obtener NextResponse 201 del handler | Sin respuesta HTTP; fetch rechaza | Un documento confirmado | Ya liberados; GET 200 y nuevo POST 409 |

Los cuatro escenarios de conector/preparación/escritor/confirmación usan fallos
**simulados en hooks** y persistencia real para comprobar sus consecuencias.
La confirmación ocultada no es una pérdida real de ACK MongoDB. El corte del
socket HTTP sí es una pérdida real de transporte, limitada a la petición ficticia
seleccionada, después de completar el handler. No se inventa un 503 cuando no
llegó ninguna respuesta HTTP.

## Evidencia de conflictos nativos

Los hooks coordinan la carrera sin devolver respuestas Mongo falsas:

- POST: insertOne de un segundo cliente Mongoose independiente escribe primero;
  el insertOne original del handler recibe código 11000 del servidor. Se captura
  ese código y se relanza el mismo error. El HTTP real devuelve 409 y el código
  CONFLICTO_PERSISTENCIA; el documento ganador permanece único.
- PUT: el escritor independiente actualiza la versión 0 a 1. El update original
  del handler recibe matchedCount:0. Se observa explícitamente VersionError
  generado por save() de Mongoose y se relanza sin sustituirlo. HTTP devuelve
  409/CONFLICTO_PERSISTENCIA. Versión final 1 y selección del escritor ganador.
- Estos 409 no proceden de validación previa ni de contención. Los hooks se
  restauran en finally. No se modifica ningún archivo de producción.

La contención usa una barrera explícita: mientras la primera petición mantiene
su bloqueo y aún no existe domicilio, la segunda devuelve 409 y el bloqueo sigue
presente. Después se libera la primera, que termina en 201, y se verifica su
liberación normal.

HTTP se ejecuta sobre adaptador Node/Request/NextResponse y handlers reales;
Clerk y el proveedor de conexión son exclusivos del loader. No es una prueba de
middleware Next completo o JWT Clerk real.

## Conciliaciones ejecutadas

Cada identidad usa prefijo aleatorio propio user_it325_*. Después de esperar la
respuesta/error del handler y sus operaciones Mongo, sin reintentos de escritura:

1. Se consulta mediante el segundo cliente si existe el documento esperado.
2. Se verifica ausencia para antesInsert, o presencia/versión 0 para despuesInsert.
3. Se identifican las claves exactas de ciudadano y correo normalizado.
4. Se obtienen fecha_creacion y clave de cada bloqueo de ese caso.
5. Se retiran con deleteOne({_id,fecha_creacion}), verificando deletedCount:1.
6. Se comprueba ausencia de ambos bloqueos y GET 200 posterior.

En la pasada final hubo **dos conciliaciones, cuatro bloqueos retirados**. Un
centinela ficticio separado se mantuvo presente durante las conciliaciones y la
contención. Al terminar todas las solicitudes se retiró exclusivamente ese
fixture, también por clave y fecha. No representa una operación ajena real.

El esquema no tiene token de operación. La identificación fue suficiente solo
porque el arnés es el único creador de esas identidades, cada caso tiene un solo
escritor controlado y todos sus promises finalizaron. No debe generalizarse esta
conciliación a bloqueos de producción, escritores externos o identidades
reutilizadas. Ante esa ambigüedad se debe detener la retirada, no usar TTL.

## Incidencias registradas

- Primera ejecución: 5/7; segunda: 6/8. Los dos fallos fueron del conciliador de
  pruebas: no normalizaba a minúsculas el correo, mientras producción sí lo hace.
  Se retiraba el bloqueo de ID pero quedaba el de correo; GET seguía devolviendo
  409. Los contadores de bloqueos propios de esas pasadas tampoco incluían esas
  claves en minúsculas; no deben usarse como evidencia de ausencia global.
- Se corrigió solo el arnés, exigiendo encontrar y retirar las dos claves.
  La tercera ejecución pasó 8/8.
- Los cuatro bloqueos de correo restantes de las pasadas anteriores se
  conciliaron después de finalizar sus procesos: se contrastaron sus evidencias,
  perfiles ficticios, estado esperado y fecha exacta. Se preparó la lista completa
  antes de retirar cada clave. No hubo limpieza global ni desbloqueo por edad.

No se identificó un defecto de producción que requiriera modificar su código.

## Casos no ejecutados y riesgos residuales

No se creó un proxy TCP MongoDB ni se cortaron sus conexiones. No hay un
clasificador de frames Mongo Wire Protocol validado que garantice aislar la
operación y respuesta de prueba entre autenticación, monitoreo y otros comandos.
Por esa condición de seguridad se omitió el corte: no se afirma imposibilidad
técnica ni se presenta el error del hook como fallo real de red.

Pendientes: identificar comando/responseTo de forma fiable, validar el parser y
su tratamiento de fragmentación, y solo entonces descartar el ACK seleccionado
en un proxy loopback exclusivo. También quedan fuera fallo de liberación del
bloqueo, resultado incierto al adquirirlo, failover/replicación y Clerk real.
La retención después de error del escritor está comprobada con Mongo real y
error controlado; el comportamiento del driver ante una desconexión Mongo real
todavía no está acreditado.

## Calidad y evidencias

Comando de la suite nueva (no se ejecuta automáticamente con npm test):

```sh
env -u MONGODB_URI -u CLERK_SECRET_KEY -u NODE_OPTIONS \
  node tests/integracion/fallos-conciliacion-real.cjs
```

- Suite nueva final: 8/8.
- Backend existente: npm test, 301/301.
- Typecheck backend sin caché incremental: salida 0.
- Build relevante Next.js en copia temporal sin .env, con clave pública ficticia,
  sin credenciales reales y red remota bloqueada: salida 0.
- node --check y git diff --check: correctos.

Evidencias privadas sin contraseñas:

- resultado-325-1794776922415.json: primera pasada.
- resultado-325-1794776997409.json: segunda pasada.
- resultado-325-1794777052977.json: final, 8/8 y conciliaciones.
- conciliacion-final-325.json: cuatro bloqueos residuales conciliados y conteo global.

Todas están en /private/tmp/ecotrack-mongo-322-BXtinf/.
Build: /private/tmp/ecotrack-build-323-YsjboP/build.log.

## Estado final y frontend

La base conserva 39 domicilios y 43 perfiles ficticios de las fases y pasadas,
con **cero bloqueos pendientes**. No se borraron domicilios ni perfiles. El
contenedor autorizado sigue running; wizardly_dewdney permanece exited. No hubo
cambios Docker, descargas, reinicios, conexiones Atlas, cambios Clerk/frontend
ni commits. Se conserva el entorno para instrucciones posteriores.

Para frontend: tratar 409 de versión/duplicado como conflicto recuperable por
lectura, y 409 por cuenta pendiente como conciliación operativa. No reintentar
POST/PUT a ciegas ante 503. Una respuesta HTTP perdida puede corresponder a una
escritura confirmada y sin bloqueo: consultar primero. Si GET devuelve conflicto
de cuenta, no insistir ni prometer desbloqueo automático. No declarar cerrado el
ensayo de pérdida real de ACK MongoDB hasta completar el proxy validado.
