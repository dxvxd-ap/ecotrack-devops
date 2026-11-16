# Fase 3.2.3: integración real de domicilios ciudadanos

Fecha: 15 de noviembre de 2026. No se modifica código de producción.

## 1. Entorno y precondiciones verificadas

| Elemento | Resultado |
|---|---|
| Contenedor | ecotrack-mongo-322-d8d77bcd3c02 |
| ID | f4e95d3a33837be25a672f4bc1df3f9517dbd910971c317e11e7bce633591b00 |
| Estado previo | running, sin OOM |
| MongoDB preparado | 8.0.38 |
| Etiquetas | ecotrack.entorno=pruebas-322; ecotrack.sesion coincide con nombre |
| Destino de las conexiones Mongo | Exclusivamente host 127.0.0.1, puerto 27018 |
| Base | ecotrack_pruebas_322_d8d77bcd3c02 |
| Autenticación | Usuario ecotrack_pruebas, readWrite solo sobre esta base |
| Colección | domiciliociudadanos, resuelta por el modelo real |
| Índice verificado en servidor | ciudadano_id_clerk_1: {ciudadano_id_clerk:1}, unique:true, no sparse/parcial |
| Documentos antes de las pruebas | 0 |

El manifiesto autorizado se lee de
`/private/tmp/ecotrack-mongo-322-BXtinf/entorno.json`; las credenciales se leen de
su archivo privado hermano, sin mostrarlas. Se utiliza únicamente la contraseña
del usuario limitado. No se utiliza el administrador para estas pruebas.

La suite comprueba ID, contexto Docker local, etiquetas, publicación, base,
autenticación y privilegios e índice antes de habilitar escrituras. Si falla una
precondición termina antes de crear datos ficticios.

La conexión usa destino constante y directConnection:true, con hosts del cliente
comprobados. Un bloqueo de sockets en el propio proceso rechaza destinos ajenos
al Mongo autorizado y al adaptador HTTP efímero en loopback. No hay descubrimiento
SRV, lectura de .env.local o reutilización de URI/configuración remota. El loader
prohíbe cargar src/lib/base_datos.ts: sustituye exclusivamente el proveedor de
conexión por la instancia Mongoose local ya autenticada. No se prueba el
conector de producción ni se llama a Clerk remoto.

## 2. Archivos y reproducción

Nuevo ejecutable de pruebas:

```text
tests/integracion/domicilio-real.cjs
```

Comando utilizado desde la raíz:

```sh
env -u MONGODB_URI -u CLERK_SECRET_KEY -u NODE_OPTIONS \
  node tests/integracion/domicilio-real.cjs
```

Se ejecuta explícitamente y no forma parte del glob de `npm test`. Está fijado al
entorno autorizado; al retirarlo o cambiar sus identificadores debe detenerse.
Cada ejecución genera un prefijo ciudadano ficticio distinto `user_it323_*`.
Los correos son ficticios bajo example.test. No se borran datos al terminar.

## 3. Pruebas ejecutadas y resultados finales

**21 aprobadas, 0 fallidas en la ejecución final.**

| Categoría | Aprobadas | Alcance |
|---|---:|---|
| Mongo/modelo | 6 | Creación/lectura independiente, duplicado 11000, GPS/manual, propietario inmutable, coordenadas, separación de propietarios |
| Concurrencia Mongo | 2 | Inserciones y actualizaciones desde dos clientes Mongoose independientes |
| Servicios | 2 | Servicio real, versión obsoleta, persistencia y documento sin historial |
| Rechazo real de autenticación Mongo | 1 | Contraseña ficticia errónea produce código 18 |
| HTTP con Clerk simulado | 8 | Flujos, propiedad y códigos de respuesta; uno incluye conector rechazado simulado |
| Concurrencia HTTP | 2 | Dos POST y dos PUT; documentos y bloqueos persistidos en Mongo real |

Casos y evidencia:

- Creación inicial persistida con versión 0, selección manual y estado pendiente;
  lectura desde otro cliente obtiene el mismo documento.
- Actualización a GPS persiste el nuevo punto y sube versión a 1.
- Cambiar propietario provoca ValidationError/StrictModeError y deja intacto
  propietario y versión en el servidor.
- Ocho entradas de coordenadas inválidas, incluyendo null, NaN, Infinity,
  strings, longitudes/latitudes fuera de rango y dimensiones incorrectas,
  se rechazan antes de guardar. Mongo confirma cero documentos para esos IDs.
- Un duplicado directo es rechazado por el servidor con código 11000.
- Las consultas por A/B obtienen documentos diferentes y propietarios correctos.
- La actualización con versión enviada obsoleta devuelve conflicto y no cambia
  la versión persistida.
- El documento final tiene únicamente los campos del modelo, un solo Point y
  dos coordenadas. No hay campos ni colección de historial de domicilio.
  Esta comprobación no implica borrar información de backups/journals externos.

### Carreras: estado final comprobado en Mongo

| Carrera | Resultados | Estado persistido |
|---|---|---|
| Dos inserciones directas, mismo ciudadano | Una cumple; otra 11000 | Exactamente un documento |
| Dos save() con versión 0, clientes independientes | Uno cumple; otro VersionError | Versión 1 y punto del ganador |
| Dos POST por HTTP | 201 y 409 | Un documento; sin bloqueo pendiente del ciudadano |
| Dos PUT por HTTP con versión 0 | 200 y 409 | Versión 1, estado pendiente, sin bloqueo pendiente del ciudadano |

Las carreras directas verifican índice y CAS sin depender del bloqueo del
handler. Las solicitudes HTTP se lanzan juntas y usan bloqueos de cuenta
persistidos en Mongo, pero no incluyen una barrera en su adquisición: sus 409
podrían deberse a bloqueo, duplicado o versión obsoleta. No se afirma demostrar
contención efectiva del bloqueo. Ninguna prueba usa un transporte Mongo simulado
ni un mutex en memoria para resolver las carreras.

## 4. Qué se probó por HTTP y qué no

Se levantó un servidor Node HTTP efímero enlazado solo a loopback. Recibe HTTP
real, construye Request, ejecuta los handlers originales GET/POST/PUT y transmite
su NextResponse real. Se ejecutan autorizadores y servicios de producción, con
Usuario, BloqueoAdministrativo y DomicilioCiudadano persistidos en Mongo real.

Solo el SDK de Clerk y el proveedor de conexión se sustituyen dentro del loader
de la suite. Las identidades ficticias se eligen mediante un encabezado de
pruebas que únicamente entiende ese servidor temporal. No se añade ningún bypass
a producción ni se usan sesiones/cookies/JWT reales.

| Código | Verificación |
|---|---|
| 200 | GET sin domicilio, GET persistido y PUT correcto |
| 201 | Primer POST confirmado |
| 400 | Coordenadas/campos prohibidos, incluido propietario o asignación del cliente |
| 401 | Ausencia de identidad simulada |
| 403 | Perfil Mongo inactivo, rol admin o correo Clerk ficticio no verificado |
| 409 | Domicilio duplicado, versión obsoleta y carreras |
| 503 | Conector rechazado deliberadamente dentro del adaptador; no es caída real de Mongo |

Se verificó Cache-Control: private, no-store. GET no expone propietario ni datos
de otro ciudadano. El flujo GET→POST→PUT→GET se contrastó con lectura independiente
del documento persistido.

**No** se arrancó Next.js como servidor HTTP, no se ejercitó su middleware global
y no se validó criptográficamente un token Clerk. Esto es HTTP sobre handlers
reales con autenticación simulada, no aceptación OAuth ni prueba de sesión real.

## 5. Fallos, límites y pendientes

Comprobados: validaciones anteriores a escritura, duplicado real, conflicto real
de versión, contraseña inválida rechazada por Mongo real y traducción HTTP de
conector rechazado simulado a 503.

No se ejecutó caída de red real, pérdida de confirmación de escritura ni un
resultado realmente incierto. No se detuvo/reinició el contenedor, no se alteró
su red, no se deshabilitó el índice ni se habilitaron failpoints.
La retención de bloqueos tras escritura incierta sigue cubierta por la suite
aislada anterior; **no se presenta como comprobación de un fallo real de red**.

Plan específico pendiente de autorización para esos casos:

1. Crear solo un proxy TCP efímero de pruebas en otro puerto loopback libre,
   con destino único al puerto Mongo actual; no alterar Docker ni el servidor.
2. Conectar exclusivamente clientes de prueba al proxy, con las mismas
   credenciales limitadas y retryWrites:false.
3. Con identidades ficticias nuevas, cortar una conexión antes de enviar una
   escritura y contrastar ausencia del documento mediante otro cliente directo.
4. En otro caso, retener y descartar la respuesta correspondiente a una escritura
   ya recibida desde Mongo, y contrastar por lectura directa si se persistió.
5. Comprobar respuesta 503 y bloqueo persistente cuando corresponda. Registrar
   solo códigos/cantidades. Cerrar únicamente sockets/proxy creados para ese caso.

El proxy, las desconexiones y la inyección no están implementados ni autorizados
por esta ejecución. Requieren aprobación de ese plan antes de proceder.
También quedan pendientes Clerk real, middleware Next completo, Safari/iPhone,
failover/replicación y durabilidad distribuida; el servidor es standalone temporal.

## 6. Incidencias del arnés y defectos de producción

No se detectaron defectos de producción que requieran corrección. No se cambia
modelo, contratos, servicios, endpoints ni autorización.

Se registran las ejecuciones previas sin ocultarlas:

- Dos intentos se detuvieron durante precondiciones, sin escrituras: el bloqueo
  de red del arnés interpretaba incorrectamente un array de argumentos ya
  normalizado por Node. Se corrigió únicamente el arnés manteniendo el bloqueo.
- Primera pasada de casos: 19 aprobados y 1 fallido. La prueba combinaba una
  actualización GPS válida con un intento de cambiar propietario y esperaba
  que este se ignorara. El modelo strict:throw rechaza toda la escritura. Se
  confirmó el campo/causa mediante validate() sin guardar; es protección correcta.
- Se separaron actualización válida y rechazo de propietario. La ejecución
  final pasó 21/21. Permanecen los documentos ficticios de ambas pasadas como
  evidencia; no se limpiaron silenciosamente.

## 7. Calidad y evidencias

- Suite backend focalizada existente `npm test`: **301/301**.
- Suite real final: **21/21**.
- Typecheck backend `tsc --noEmit --incremental false`: salida 0.
- Build Next.js: salida 0 desde copia temporal limpia, sin copiar ni cargar .env,
  con publishable key ficticia, sin secret key real y red remota bloqueada.
  No se ejecutó el build habitual que cargaría .env.local automáticamente.
- `node --check tests/integracion/domicilio-real.cjs`: correcto.
- `git diff --check`: correcto.

Evidencias locales sin contraseñas ni documentos privados:

- Pasada exploratoria: `/private/tmp/ecotrack-mongo-322-BXtinf/resultado-323-1794775274559.json`.
- Pasada final: `/private/tmp/ecotrack-mongo-322-BXtinf/resultado-323-1794775398561.json`.
- Build: `/private/tmp/ecotrack-build-323-cuYlG9/build.log`.
- Inventario final: `/private/tmp/ecotrack-mongo-322-BXtinf/estado-final-323.json`.

La revisión independiente de lectura contrastó el arnés, informe y JSON final.
Se corrigió la secuencia HTTP descrita y se explicitó la ausencia de barrera de
contención HTTP. No ejecutó nuevas escrituras ni reprodujo typecheck/build.

La PWA no se modifica ni se reejecuta su suite en esta fase. Los dos fallos de
cuenta.test.mjs documentados en 3.2 siguen pendientes; no se afirma corregirlos.

## 8. Estado final y recomendación

La pasada final conserva 13 domicilios ficticios, cero duplicados y cero bloqueos
pendientes; todos sus domicilios tienen asignación pendiente. Junto con la pasada
exploratoria quedan 25 domicilios ficticios en la base. La lectura final verificó:

| Colección | Documentos |
|---|---:|
| domiciliociudadanos | 25 |
| usuarios | 20 |
| bloqueoadministrativos | 0 |

Los 25 domicilios pertenecen a identidades ficticias, tienen asignación pendiente,
no contienen campos de coordenadas históricas y no presentan duplicados. El
índice único sigue presente. Docker confirma el contenedor de pruebas running y
el contenedor ajeno wizardly_dewdney todavía exited. No se limpiaron documentos,
se reiniciaron servicios ni se modificaron recursos ajenos.

La persistencia básica, índice único y concurrencia han quedado comprobados
contra Mongo real. Se puede preparar la integración de un selector frontend
que confirme antes de guardar y maneje 409/503, manteniendo pendiente la aceptación
con sesión Clerk real y las pruebas de red incierta. Esto no habilita ni modifica
el frontend, ni cambia configuración o índices de producción.

El contenedor se conserva funcionando. No se modifica Clerk, frontend, mapas o
iconos; no se instalan dependencias ni imágenes; no se usan datos de ciudadanos,
no se conecta a Atlas y no se hacen commits. Se esperan nuevas instrucciones.
