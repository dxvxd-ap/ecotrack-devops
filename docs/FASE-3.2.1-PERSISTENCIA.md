# Fase 3.2.1: validación de persistencia y concurrencia

Fecha: 15 de noviembre de 2026.

## Resultado y límite de la auditoría

No se identificó una base MongoDB aislada y autorizada disponible. Se detuvieron
las pruebas de integración sin abrir conexiones MongoDB. No se crearon índices,
colecciones ni datos. No se instalaron dependencias ni se inició Docker.

La inspección de configuración imprimió únicamente nombres de variables y
clasificaciones, nunca valores, credenciales, hosts remotos o cadenas de conexión:

- El proceso no tiene configuración Mongo de pruebas.
- `.env.local` contiene MONGODB_URI remota, sin identificación como base de
  pruebas. No se presume que sea segura ni se utiliza para esta auditoría.
- No se encontraron `.env.test`, `.env.test.local` o `.env.integration`.
- La configuración ciudadana no contiene configuración Mongo.
- No se encontraron binarios mongod/mongosh en PATH ni un listener visible en
  el puerto local 27017. Esto no demuestra ausencia de servidores en otros puertos.
- Existe CLI de Docker; la consulta de contenedores terminó con código 1 y
  error relacionado con socket/conexión. No fue posible acreditar un daemon
  accesible ni un contenedor Mongo de pruebas.
- La documentación revisada no contiene una autorización/configuración de base
  aislada vigente. Tener una URI o Docker instalado no constituye autorización.

## Índice y persistencia comprobados en código

Mongoose real, desconectado (readyState 0), registra:

```text
Modelo: DomicilioCiudadano
Colección resuelta: domiciliociudadanos
Índice: { ciudadano_id_clerk: 1 }, unique: true
autoCreate: false
autoIndex: false
```

El mismo campo se usa en la consulta por propietario, construcción del primer
documento y filtro adicional `$where` de actualización. El propietario proviene
del autorizador de servidor. No existe un segundo identificador controlado por
cliente que seleccione el documento.

`verificar_indice_domicilio()` lee `collection.indexes()` y exige un índice único
de una sola clave, ascendente, exactamente ciudadano_id_clerk, no sparse y sin
partialFilterExpression. No depende de su nombre ni confunde el índice `_id_`
con el del ciudadano. No instala índices ni sustituye fallos por respaldo local.

POST y PUT conectan y verifican metadatos antes de leer/preparar la escritura.
Un índice ausente o incompatible produce 503/INDICE_NO_DISPONIBLE. Un fallo de
conexión o lectura de metadatos produce 503/SERVICIO_NO_DISPONIBLE, sin revelar
el error interno. Si ocurre durante preparación, no se llama save() y se libera
la exclusión adquirida siempre que Mongo permita ejecutar su liberación.

GET puede devolver datos:null para un ciudadano autorizado sin domicilio; no
necesita el índice único para leer. El control no elimina las otras condiciones
de autorización, conexión y ausencia de bloqueos.

## Concurrencia y errores: resultados aislados

Se ejecutó:

```sh
node --test tests/domicilio-ciudadano.test.cjs tests/api-domicilio.test.cjs tests/seguridad-ciudadano.test.cjs
```

Resultado: **104/104 aprobadas**. Se ejecutan Mongoose, handlers, validadores y
autorizadores reales, sustituyendo los transportes Mongo/Clerk por memoria.
Las pruebas de índices simulan metadatos; no demuestran un índice instalado.

| Caso | Resultado comprobado con transporte simulado | Mongo real |
|---|---|---|
| Índice válido, POST inicial | 201, versión 0, estado pendiente | Pendiente |
| Índice válido, PUT | 200, incremento de versión y reinicio de asignación | Pendiente |
| Duplicado previo y error 11000 durante inserción | 409, sin reemplazo del domicilio | Pendiente |
| Dos altas concurrentes | Una 201, otra 409, un solo documento | Pendiente |
| Lectura por propietario | Solo documento de la identidad autenticada | Pendiente |
| Versión enviada obsoleta | 409 antes de guardar | Pendiente |
| Dos ediciones concurrentes | Una 200, otra 409; un incremento | Pendiente |
| Modificación externa tras lectura | CAS de save() produce conflicto 409 | Pendiente |
| Índice ausente/parcial/sparse/no único | 503 sin escritura | Pendiente |
| Dependencia Mongo inaccesible | 503 genérico y privado | Pendiente |
| Error tras insertar, antes de confirmar respuesta | 503; documento puede existir y bloqueo permanece | Pendiente |

Las carreras de handlers también están protegidas por el bloqueo compartido de
cuenta. No sustituyen la prueba de duplicados del servidor: una carrera directa
entre procesos sobre la colección debe validar separadamente el índice único.
La prueba de CAS conserva la lógica de versión de Mongoose, pero simula la
coincidencia y modificación del documento en el transporte de colección.

Verificación adicional de esta auditoría:

- `npm run build`: salida 0.
- `tsc --noEmit --incremental false`: salida 0, ejecutado después del build.
  El intento inicial en paralelo falló con TS6053 mientras Next regeneraba
  `.next/types`; la repetición secuencial pasó sin cambiar código.
- Sintaxis del bloque Node de preparación comprobada mediante vm.Script,
  sin ejecutar el procedimiento ni conectar a MongoDB.
- `git diff --check`: correcto.
- Solo se añade este informe; no hay cambios en la lógica de persistencia,
  Clerk ni interfaz. El build regenera sus artefactos habituales.

Duplicados y fallos CAS conocidos liberan bloqueos al retornar 409. Errores de
resultado incierto después de comenzar la escritura conservan bloqueos sin TTL;
una operación posterior puede devolver 409 hasta conciliación. No hay reintento
automático ni eliminación automática de bloqueos. Si falla la propia liberación,
también puede requerirse conciliación. No afirmar que un 503 implica que no se
guardó nada; no repetir POST a ciegas.

El modelo solo declara `ubicacion` vigente, y PUT la reemplaza con `$set` junto
con la asignación pendiente. No hay campo/array de coordenadas antiguas, `$push`,
colección de historial domiciliario ni almacenamiento de GPS preliminar en este
flujo. Esto no implica eliminar versiones de backups, journals u otros sistemas
externos; su retención requiere política aparte.

## Procedimiento exacto para preparar un entorno nuevo

Los comandos siguientes **no se ejecutaron**. Requieren autorización para un
servidor desechable local. No utilizar `.env.local`, la base de ciudadanos,
credenciales de producción ni scripts históricos que puedan cargar ese entorno.

### 1. Confirmar aislamiento antes de conectar

Preferir un servidor Mongo dedicado a pruebas, con almacenamiento nuevo y sin
montar volúmenes de otra aplicación. Si se usa Docker, debe estar ya instalado y
operativo. Confirmar que el contexto apunta al daemon local:

```sh
docker context inspect --format '{{(index .Endpoints "docker").Host}}'
docker info --format '{{.ServerVersion}}'
docker image inspect mongo:8.0 --format '{{.Id}}'
```

Continuar solo si el endpoint es el socket local conocido (`unix://...`), el
daemon responde y la imagen está ya disponible y aprobada. No cambiar contextos,
instalar software, descargar imágenes ni iniciar servicios automáticamente. Si
falta alguno, solicitar preparación/autorización al responsable.

### 2. Crear únicamente el servidor desechable aprobado

Tras comprobar que el nombre y el puerto 27018 están libres:

```sh
docker run --detach --rm --pull=never \
  --name ecotrack-mongo-pruebas-321 \
  --publish 127.0.0.1:27018:27017 \
  --tmpfs /data/db --tmpfs /data/configdb \
  mongo:8.0 --bind_ip_all
```

`--pull=never` impide descargas. El almacenamiento es nuevo y temporal; no hay
bind mounts ni volúmenes de producción. El puerto solo se publica en loopback.
Los datos desaparecen al detener ese contenedor; no colocar datos personales.

### 3. Preparar el índice con el driver ya instalado

Desde la raíz del repositorio, ejecutar únicamente contra ese servidor local
verificado. El script no carga dotenv, no toma MONGODB_URI y no puede seleccionar
un host remoto. Rechaza una base con colecciones existentes, incluso si parecen
vacías. No elimina datos ni repara duplicados automáticamente.

```sh
node <<'NODE'
const { MongoClient } = require('mongoose').mongo;
const nombre = 'ecotrack_pruebas_321';
const cliente = new MongoClient('mongodb://127.0.0.1:27018', {
  serverSelectionTimeoutMS: 5000,
});
(async () => {
  try {
    await cliente.connect();
    const base = cliente.db(nombre);
    if ((await base.listCollections({}, { nameOnly: true }).toArray()).length) {
      throw new Error('La base debe ser nueva');
    }
    const coleccion = await base.createCollection('domiciliociudadanos');
    await coleccion.createIndex(
      { ciudadano_id_clerk: 1 },
      { name: 'ciudadano_id_clerk_1', unique: true },
    );
    const indices = await coleccion.indexes();
    const valido = indices.some(i => i.unique === true && i.sparse !== true &&
      !i.partialFilterExpression && Object.keys(i.key).length === 1 &&
      i.key.ciudadano_id_clerk === 1);
    if (!valido) throw new Error('Índice no verificado');
    console.log('Índice único de pruebas preparado y comprobado');
  } catch {
    console.error('Preparación detenida; revisar el entorno aislado sin publicar secretos');
    process.exitCode = 1;
  } finally {
    await cliente.close().catch(() => undefined);
  }
})();
NODE
```

No ejecutar `syncIndexes`, dropDatabase, dropCollection o deduplicación como
alternativa a un fallo. Para un entorno existente/no vacío se necesita otra
revisión de duplicados y una preparación autorizada; no adaptar este bloque
cambiando la URI por la de producción.

### 4. Validar integración después de preparar y autorizar

Crear una suite separada que use exclusivamente este destino y compruebe nombre
de base y aislamiento antes de escribir. No sustituir MONGODB_URI en el servidor
habitual ni arrancar el Dashboard con su `.env.local`. No basta con exportar una
URI de pruebas y ejecutar los tests actuales: sus transportes siguen simulados.

Con el modelo real y conexión al servidor aislado, la suite deberá:

1. Comprobar por metadata la colección e índice preparados.
2. Insertar dos documentos con igual `ciudadano_id_clerk` y comprobar 11000.
3. Repetir la carrera de inserción entre conexiones/procesos independientes y
   comprobar que queda exactamente un documento.
4. Leer por propietario A y verificar que no se obtiene el documento de B.
5. Leer dos instancias de la misma versión; guardar una y verificar que la otra
   falla con VersionError y no modifica punto/asignación.
6. Conservar Clerk simulado, pero usar persistencia real para handlers y para
   BloqueoAdministrativo; verificar 201/200/409 y estado pendiente/versiones.
7. Usar otra base desechable nueva sin índice para verificar 503. No retirar el
   índice en un entorno compartido o con escrituras en curso.
8. Simular fallo de red antes y después de la escritura para verificar 503,
   estado persistido y retención de bloqueos, sin imprimir documentos privados.
9. Leer el documento final y confirmar ausencia de coordenadas antiguas.

Guardar solo resultados y cantidades. Limpiar únicamente ese contenedor
desechable una vez confirmada su identidad y autorizada su finalización:

```sh
docker stop ecotrack-mongo-pruebas-321
```

El `--rm` anterior retira el contenedor. No usar limpiezas globales de Docker,
volúmenes o bases. Ninguno de estos pasos se ejecutó durante esta auditoría.
Este servidor local valida índices y operaciones atómicas de documento; no
acredita failover, replicación o durabilidad de un despliegue distribuido.

## Recomendación para 3.3

La auditoría del código y las pruebas aisladas no identifican una incompatibilidad
entre índice, propietario y POST/PUT. Se comprueba que la API funciona con un
índice válido simulado. **No se confirma aún POST/PUT contra MongoDB real.**

Antes de aceptar un flujo de guardado de 3.3, preparar el entorno autorizado y
completar los casos reales anteriores. No eliminar el 503 ni presentar los mocks
como validación de persistencia. No se inicia 3.3 ni se modifica la interfaz.
