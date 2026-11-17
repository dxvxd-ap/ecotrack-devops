# Fase 3.6A — Catálogo de rutas con MongoDB como única fuente

Fecha: 16 de noviembre de 2026. Implementación local sobre `main`; sin commits, push ni despliegue. No se importó el respaldo recuperado ni se ejecutaron operaciones contra Atlas, Clerk, usuarios, roles o domicilios.


## Inventario de archivos de esta fase

| Archivo | Responsabilidad |
| --- | --- |
| `src/app/api/rutas/route.ts` | CRUD Mongo exclusivo, confirmación y errores. |
| `src/contratos/rutas.ts` (nuevo) | Validación y selección exacta de rutas. |
| `src/lib/rutas_mapa.ts` (nuevo) | Popup DOM seguro, segmentos Leaflet y restricción de edición sin pérdida. |
| `src/componentes/mapas/MapaRutasInteractivo.tsx` | Popup sin interpolación HTML y visualización de todos los segmentos. |
| `src/app/dashboard/rutas/page.tsx` | Restricción explícita del editor para geometrías no preservables. |
| `apps/ciudadano/tests/rutas-dashboard-browser.mjs` (nuevo) | DOM/Leaflet y formulario real en Chrome, sin servicios externos. |
| `src/modelos/Ruta.ts` | Desactivar creación automática de colección/índices. |
| `scripts/preparar-rutas-desarrollo.cjs` (nuevo) | Preparación explícita de Mongo local. |
| `datos/desarrollo/rutas-ficticias.json` (nuevo) | Dos recorridos sintéticos reproducibles. |
| `tests/helpers/entorno.cjs` | Adaptar exclusivamente el doble de persistencia de rutas. |
| `tests/helpers/rutas.cjs` (nuevo) | Entorno unitario controlado del CRUD. |
| `tests/helpers/rutas-reales.cjs` (nuevo) | Carga aislada de handlers/modelo reales. |
| `tests/rutas-persistencia.test.cjs` (nuevo) | Regresiones del CRUD y errores. |
| `tests/rutas-desarrollo.test.cjs` (nuevo) | Guardas del preparador local. |
| `tests/integracion/rutas-mongo-local.cjs` (nuevo) | Persistencia Mongo real aislada. |
| `docs/superpowers/plans/2026-11-16-fase-3.6A.md` (nuevo) | Plan y decisiones. |
| `docs/FASE-3.6A-RUTAS-MONGODB.md` (nuevo) | Resultados y procedimiento seguro. |
| `docs/GUIA-EQUIPO-ECOTRACK.md` | Actualización de la fuente de rutas y enlace a esta fase. |

## Cambio de comportamiento

`src/app/api/rutas/route.ts` ya no importa ni lee/escribe `almacen_local`. GET siempre consulta MongoDB, devuelve únicamente `{ activa: true }` y no sustituye una lista vacía ni un error por datos antiguos. Se declara dinámico y responde sin caché.

POST deja generar el ObjectId al modelo; espera `create` con confirmación `w: majority` antes de devolver éxito. PUT y DELETE esperan `findOneAndUpdate`, no usan upsert y requieren un documento retornado. DELETE es baja lógica; conserva el documento y sus identificadores. No se borran físicamente rutas.

La validación específica admite campos del formulario actual, LineString/MultiLineString y coordenadas finitas en rango. Impide operadores Mongo, IDs manipulados, campos ajenos y actualizaciones vacías. PUT permite `_id` válido y/o `id_ruta`; si llegan ambos, deben corresponder al mismo documento. No cambia `id_ruta` ni `_id`. DELETE conserva `?id=`: interpreta 24 hexadecimales como ObjectId y otros valores como código de ruta. Para códigos de negocio con aspecto de ObjectId, usar el `_id` real retornado por GET.

Los controles existentes se mantienen: GET público; escrituras con `rutas:gestionar`, tanto en el middleware existente como en el handler. No se cambió el middleware ni ninguna Server Action.

| Situación | HTTP y respuesta |
| --- | --- |
| Lista vacía | 200, `{ exito: true, datos: [] }` |
| POST, PUT, DELETE confirmados | 200, `{ exito: true, mensaje, datos: ruta }` |
| Datos inválidos, selector inválido, JSON malformado | 400, `ENTRADA_INVALIDA` |
| Ruta inexistente o selectores que no coinciden | 404, `RUTA_NO_ENCONTRADA` |
| Duplicado MongoDB | 409, `RUTA_EN_CONFLICTO` |
| Índice único ausente/incompatible en colección existente | 503, `INDICE_NO_DISPONIBLE` |
| Conexión/lectura/escritura no confirmada | 503, `BASE_DATOS_NO_DISPONIBLE` |
| Rechazo administrativo | Se conservan status/mensaje existentes de autorización |

En errores de rutas se incluyen `exito: false`, `mensaje` controlado y `codigo`, sin excepciones Mongo, URI, nombres de índices ni valores privados. Una colección inexistente puede producir `BASE_DATOS_NO_DISPONIBLE` al intentar comprobar sus índices; la preparación local explícita crea la colección y el índice.

Un 503 de escritura significa que no se pudo confirmar el resultado: si hubo pérdida de conexión tras aplicar la operación, puede existir un cambio en MongoDB. Leer el estado antes de reintentar; no prometer que toda respuesta 503 equivale a ausencia de escritura.

## Índices y modelo

`src/modelos/Ruta.ts` conserva su esquema y ObjectId implícito. Se desactivan `autoCreate` y `autoIndex` para este modelo: una lectura/arranque no prepara ni migra colecciones. Las escrituras comprueban un índice único completo sobre `id_ruta`, sin sparse ni filtro parcial. No lo crean automáticamente. El código de negocio se normaliza a mayúsculas en los selectores y creaciones, como ocurría en las altas anteriores.

La preparación de cualquier índice fuera del entorno local es una tarea separada que requiere revisión y autorización. No se inspeccionaron ni modificaron índices de Atlas durante esta fase. Reiniciar el backend al adoptar el cambio para evitar reutilizar un modelo Mongoose compilado previamente con otras opciones.

## Compatibilidad y límites de alcance

Dashboard conserva el endpoint, métodos, status 200 de éxito y campos `_id`, `id_ruta`, `nombre`, `descripcion`, `trazado_geojson`, `color_mapa`, métricas, `activa` y fechas. PWA conserva el envelope `exito/datos`, soporta ambos GeoJSON y recibe un ID serializado estable. DELETE añade `datos` sin retirar `exito/mensaje`.

La integración alimentó el normalizador real de la PWA con respuestas del handler/Mongoose reales. No se afirma una nueva validación manual de dashboard o Safari 3.6A.

Los módulos de camiones, calendario, preasignaciones y demás consumidores de JSON no se tocaron. En particular, calendario todavía busca nombres/referencias de rutas en el respaldo local: resolver esa dependencia es un pendiente separado. La guía puede seguir requiriendo JSON para esas APIs; el catálogo de rutas ya no lo necesita ni lo mantiene sincronizado.

El documento heredado e inactivo de Atlas no se migró. Las rutas antiguas del JSON no se recuperan ni se incorporan al nuevo catálogo. La recuperación del catálogo municipal vigente queda pendiente; una instalación sin rutas activas mostrará una lista vacía.

## Preparación explícita de desarrollo

No requiere instalar dependencias nuevas. Puede utilizarse MongoDB local existente; Docker es una opción. En un equipo donde el nombre y el puerto estén libres:

```sh
docker run -d --name ecotrack-rutas-dev -p 127.0.0.1:27019:27017 mongo:8.0
```

Este contenedor es exclusivamente de desarrollo, sin exposición a la LAN. Si ya existe, revisar su estado en lugar de recrearlo; `docker start ecotrack-rutas-dev` permite reiniciarlo. No conectar esta preparación a un túnel hacia un servicio de producción.

Desde la raíz del repo, primero mostrar el plan sin conexión ni escritura:

```sh
node scripts/preparar-rutas-desarrollo.cjs --uri=mongodb://127.0.0.1:27019/ecotrack_rutas_dev_equipo
```

Después, únicamente sobre la base local de desarrollo elegida:

```sh
node scripts/preparar-rutas-desarrollo.cjs --uri=mongodb://127.0.0.1:27019/ecotrack_rutas_dev_equipo --confirm
```

El script:

- No carga dotenv ni toma `MONGODB_URI` del entorno como alternativa.
- Solo acepta `mongodb://127.0.0.1:PUERTO/ecotrack_rutas_dev_NOMBRE`, sin credenciales, parámetros ni fragmento; rechaza SRV, host remoto y bases de otros nombres.
- Sin `--confirm`, no conecta a MongoDB.
- Con confirmación, exige que `rutas` esté vacía; crea su índice único e inserta los dos fixtures de `datos/desarrollo/rutas-ficticias.json` con confirmación de escritura.
- Repetirlo sobre la colección poblada falla sin sobrescribir registros.
- No crea cuentas, usuarios, roles ni domicilios; nunca se ejecuta al arrancar.

Para conectar un backend de desarrollo a esa base, configurar conscientemente su `MONGODB_URI` local y las claves de la instancia Clerk de desarrollo autorizada, siguiendo la guía del equipo. El script no modifica `.env.local`. Los fixtures están etiquetados como ficticios y no representan recorridos municipales ni domicilios.

## Verificación

Se escribieron regresiones antes del cambio y se observaron los fallos de vacío/fallback, falsos éxitos, ID, selectores, inexistentes y entradas inválidas. Se añadieron comprobaciones específicas para el índice y el preparador.

Comandos principales desde la raíz:

```sh
node --test tests/rutas-persistencia.test.cjs tests/rutas-desarrollo.test.cjs
node --test tests/seguridad-rutas-reclamos.test.cjs
npm test
./node_modules/.bin/tsc --noEmit --incremental false
```

Integración real, explícita y separada de `npm test`, con una base local vacía exclusiva:

```sh
node tests/integracion/rutas-mongo-local.cjs --uri=mongodb://127.0.0.1:27019/ecotrack_rutas_dev_integracion_nueva
```

Usar una base nueva por ejecución. No necesita ni carga `.env.local`, no importa el conector de producción ni utiliza Clerk real. Integra handler, contrato, modelo Mongoose, MongoDB real y un cliente independiente; la autorización se sustituye en este arnés y se cubre con las pruebas unitarias de seguridad existentes. No equivale a una prueba HTTP completa del middleware.

La ejecución de esta fase utilizó un contenedor efímero dedicado `ecotrack-rutas-36a`, imagen local `mongo:8.0`, publicación solo en `127.0.0.1` y ninguna carpeta/volumen de producción. La base de integración y el puerto fueron exclusivos de ese contenedor. Al terminar se verificó su ID/etiqueta y se cerró; `--rm` retiró únicamente ese contenedor y sus datos ficticios temporales.

Resultados registrados:

- Suite raíz: **421/421**.
- Regresiones de rutas + guardas de preparación: **42/42**.
- Seguridad de rutas/reclamos: **59/59** (incluidas en la suite raíz).
- Integración MongoDB real: **10/10** contando el contenedor de prueba de Node y nueve subcasos. Incluye cero escrituras al GET vacío, índice/preparación, lectura independiente tras POST, duplicados/carrera, PUT aislado, inexistentes, normalizador PWA real, baja lógica y fallos de escritura/conexión.
- Suite PWA: **118/118**.
- Typecheck raíz: correcto (`--incremental false`).
- Builds raíz y PWA: correctos; el de PWA incluye su typecheck y conserva el aviso de bundle >500 kB. No existe script lint en los package.json actuales.

El build raíz se ejecuta con `MONGODB_URI` sobrescrita solo para ese proceso hacia una base del contenedor local; nunca utiliza Atlas. Logs temporales en `/private/tmp/ecotrack-36a-*.log`.

Graphify actualizado mediante `graphify update .`, sin LLM: 1019 nodos, 2140 aristas. Los hashes de CRUD, modelo y contrato coinciden con el código. Las salidas generadas están ignoradas y no se publican. Documentos nuevos no reciben extracción semántica en esta actualización de código.

El JSON recuperado se mantiene intacto (comprobación SHA-256 antes y después). Sin commits ni push. No se modificaron datos ni configuraciones de servicios externos.


## Correcciones finales de auditoría — 16 de noviembre de 2026

Esta sección sustituye las conclusiones de compatibilidad y las cifras anteriores para el estado final.

### Popup y geometrías

El popup se construye con elementos DOM y `textContent` para nombre e identificador. Conserva estructura, estilos y comportamiento de Leaflet; nunca interpreta datos de rutas como HTML. La prueba de Chrome introduce cadenas img/onerror y svg/onload: se muestran literalmente, no crean esos nodos, no ejecutan eventos y un nombre normal se conserva.

El mapa convierte cada línea por separado a coordenadas Leaflet y pasa la lista anidada a `L.polyline`. No aplana, conecta, reordena ni modifica los segmentos del GeoJSON. La prueba utiliza dos segmentos separados de distinta longitud y verifica todos los puntos con Leaflet real.

**Limitación explícita:** el editor actual únicamente permite editar LineString válidas de dos dimensiones. Al pulsar Editar en MultiLineString (o en geometrías con dimensiones que el editor descartaría), aparece un aviso y no se abre el formulario ni se emite PUT. La función de guardado repite la guarda. No hay conversión silenciosa ni edición parcial de metadatos de esas geometrías. La PWA sigue mostrando ambos tipos y su contrato no cambia. Para LineString 2D se verifica el round-trip lon/lat → lat/lon → lon/lat, sin pérdida ni reordenación.

### Integridad y concurrencia

PUT lee el documento con `lean`, sin defaults de hidratación; combina los cambios y valida íntegramente el resultado si será activo. Un documento heredado incompleto no puede activarse mediante un parche parcial: devuelve 400 sin modificarlo. La validación no migra ni rellena datos antiguos.

La escritura usa una comparación atómica contra los campos leídos que participan en la validación, incluidos sus estados ausentes. Si otro escritor los cambia entre lectura y escritura, no se aplica el parche y se devuelve 409/RUTA_EN_CONFLICTO. No se depende de `__v`, de un campo de versión nuevo ni de timestamps migrados. El método y los envelopes HTTP permanecen iguales.

GET filtra documentos activos incompatibles con el contrato, aunque hayan sido introducidos fuera del CRUD; no los repara ni los expone como rutas válidas. Las bajas lógicas siguen permitidas.

### Evidencia final

- Suite raíz: **423/423** (incluye dos nuevas regresiones unitarias de reactivación y concurrencia).
- Suite PWA: **118/118**.
- Integración MongoDB real aislada: **12/12** (prueba principal y once subcasos), con dos nuevas reproducciones del defecto heredado y de escritura concurrente.
- Chrome local: **5 comprobaciones** de popup seguro, segmentos Leaflet, guardas/round-trip, rechazo del formulario MultiLineString sin escrituras y apertura del formulario LineString con código estable. El mapa del formulario se sustituye en ese arnés; DOM, Leaflet por separado, página y guardas son reales. API simulada, sin Clerk ni Atlas.
- Typechecks y builds raíz/PWA: correctos. El typecheck raíz se repitió secuencialmente tras el build porque la ejecución simultánea encontró tipos temporales de Next en regeneración; no fue un defecto del código.
- `git diff --check`: correcto.
- Build PWA: conserva el aviso de bundle JS >500 kB.
- Escaneo de seguridad: sin coincidencias con secretos configurados localmente. Una coincidencia de URI con credenciales corresponde exclusivamente al caso deliberadamente ficticio y rechazado de `tests/rutas-desarrollo.test.cjs`.
- Graphify de código actualizado: 1030 nodos y 2171 aristas; documentos sin extracción semántica nueva.

Los dos defectos de PUT se reprodujeron en rojo antes de corregir. Los payloads HTML y la transformación MultiLineString identificados en auditoría se comprobaron después con DOM/Leaflet y formulario reales. No se realizaron nuevas pruebas manuales en Safari ni escrituras en Atlas. Las comprobaciones manuales previas de persistencia en Atlas y PWA fueron reportadas por el usuario, no ejecutadas por este arnés.

Archivos afectados por estas correcciones: `src/lib/rutas_mapa.ts`, `src/componentes/mapas/MapaRutasInteractivo.tsx`, `src/app/dashboard/rutas/page.tsx`, `src/contratos/rutas.ts`, `src/app/api/rutas/route.ts`, `tests/helpers/rutas.cjs`, `tests/helpers/entorno.cjs`, `tests/rutas-persistencia.test.cjs`, `tests/integracion/rutas-mongo-local.cjs`, `apps/ciudadano/tests/rutas-dashboard-browser.mjs` y este informe. El inventario total de 3.6A queda en 18 archivos.

No se modificaron contratos públicos, esquema de versión, middleware, claves, cuentas o servicios externos. No hay migración requerida por estas correcciones. Se mantienen pendientes las referencias de calendario al JSON y la rotación de credenciales históricas. Veredicto técnico tras estas correcciones: **APTO PARA PUBLICAR**, con la limitación de edición indicada y autorización de publicación aún pendiente.
