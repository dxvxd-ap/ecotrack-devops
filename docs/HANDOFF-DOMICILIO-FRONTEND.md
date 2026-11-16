# Transferencia a OpenCode: domicilio ciudadano / fase 3.3

Fuente: código actual de `src/contratos/domicilio.ts`, handlers y servicios;
informes [3.2.3](FASE-3.2.3-INTEGRACION-REAL.md) y
[3.2.5](FASE-3.2.5-FALLOS-CONCILIACION.md). Esta transferencia no autoriza cambios
backend, despliegue, nuevas pruebas de fallos ni limpieza.

## Contrato real

Reutilizar los tipos/validadores compartidos; no duplicar ni ampliar el contrato.
Ruta única: `/api/ciudadano/domicilio`, sin parámetros de consulta ni ID de usuario.

Autenticación: token actual obtenido mediante Clerk `getToken()`, enviado como
`Authorization: Bearer <token>` igual que el servicio de autenticación existente.
Servidor exige rol ciudadano, correo principal verificado, cuenta sin
restricciones/bloqueos y perfil Mongo activo vinculado al mismo id_clerk.
El éxito de sincronizarPerfil() no sustituye la autorización de cada petición.
No usar encabezados ficticios de las suites, secretos Clerk ni credenciales Mongo.

| Método | Petición | Éxito |
|---|---|---|
| GET | Sin cuerpo | 200: `{exito:true,mensaje:"Domicilio consultado",datos:DTO|null}` |
| POST | Objeto de registro siguiente | 201: `{exito:true,mensaje:"Domicilio registrado",datos:DTO}` |
| PUT | Registro más `version` | 200: `{exito:true,mensaje:"Domicilio actualizado",datos:DTO}` |

POST (todos los campos obligatorios):

```json
{"latitud":20.45,"longitud":-97.09,"tipo_seleccion":"manual","confirmada":true}
```

PUT añade `"version":0` usando la versión del último DTO leído, sin incrementarla
antes del envío. Versión inicial 0; cada actualización exitosa incrementa una
vez. Guardar la versión devuelta por servidor. Es entero seguro no negativo.
`tipo_seleccion` admite manual/gps; 3.3 enviará manual. `confirmada` debe ser true.
Coordenadas: números finitos, latitud ±90 y longitud ±180 inclusivas; sin strings,
null ni coerción. Se rechazan campos adicionales, incluidos propietario, rol,
ruta, estados y fechas. POST no admite version. POST/PUT requieren
Content-Type: application/json; límite de 4096 bytes reales.

DTO de guardado actual (fechas ISO generadas por servidor; ejemplo ilustrativo):

```json
{
  "ubicacion":{"type":"Point","coordinates":[-97.09,20.45]},
  "tipo_seleccion":"manual",
  "fecha_confirmacion":"2026-11-15T12:00:00.000Z",
  "fecha_creacion":"2026-11-15T12:00:00.000Z",
  "fecha_actualizacion":"2026-11-15T12:00:00.000Z",
  "version":0,
  "asignacion":{
    "estado":"pendiente","ruta_id":null,"metodo":null,
    "fecha_evaluacion":null,"version_politica":null,
    "huella_catalogo":null,"motivo":null
  }
}
```

GeoJSON utiliza **[longitud, latitud]**. No se exponen propietario, _id ni correo.
POST y PUT reinician la asignación a pendiente; no significa sin cobertura.
Los tipos contemplan otros estados futuros, pero no hay motor ni endpoint de
recálculo/ruta asignada implementado. No presentar una ruta cercana como asignada.
Todas las respuestas de los handlers tienen Cache-Control: private, no-store.

Error: `{exito:false,mensaje:string,codigo:string}`; **no incluye datos**.

| HTTP | codigo real | Significado / acción |
|---|---|---|
| 400 | ENTRADA_INVALIDA, CUERPO_INVALIDO, PARAMETROS_NO_PERMITIDOS | Corregir petición; no repetir idéntica |
| 401 | SIN_SESION | Resolver sesión antes de guardar |
| 403 | ACCESO_DENEGADO, ORIGEN_NO_AUTORIZADO | Cuenta/correo/rol restringido u origen rechazado; no insistir |
| 404 | DOMICILIO_NO_ENCONTRADO | PUT sin domicilio; consultar GET, no convertir automáticamente a POST |
| 409 | VERSION_CONFLICTIVA | Versión obsoleta |
| 409 | DOMICILIO_EXISTENTE | POST sobre domicilio existente |
| 409 | CONFLICTO_PERSISTENCIA | Duplicado nativo, VersionError o documento cambiado/no encontrado al guardar |
| 409 | CUENTA_EN_CONFLICTO | Bloqueo/operación pendiente, identidad divergente o perfil sin sincronizar |
| 413 | CUERPO_EXCESIVO | Excede límite de tamaño |
| 415 | TIPO_NO_ADMITIDO | Falta application/json |
| 503 | INDICE_NO_DISPONIBLE | Backend no habilitado para guardar; no intentar resolver desde cliente |
| 503 | SERVICIO_NO_DISPONIBLE | Dependencia inaccesible o resultado incierto; no asumir que no se guardó |

No hay códigos dedicados para distinguir bloqueo transitorio, conciliación e
inexistencia de perfil: comparten CUENTA_EN_CONFLICTO. No inferir esa distinción
solo por HTTP 409 ni depender de comparar textos como contrato estable.

## Recuperación desde frontend

- Al abrir Cuenta/selector, GET: datos:null habilita registro; DTO habilita edición.
- VERSION_CONFLICTIVA / DOMICILIO_EXISTENTE / CONFLICTO_PERSISTENCIA: conservar el
  borrador solo en memoria y consultar GET. Mostrar el estado actual y pedir nueva
  revisión/confirmación; nunca sobrescribir ni reenviar automáticamente.
- CUENTA_EN_CONFLICTO: mostrar mensaje del servidor y acceso a Cuenta. Si procede
  una consulta puntual, hacer GET; si también devuelve 409, detener recuperación
  automática y mostrar necesidad de resolver perfil/operación o conciliación.
  No implementar polling indefinido, desbloqueo o sincronización automática de
  todos los conflictos. Un bloqueo pendiente impide también GET.
- Ante 503, timeout, abort o respuesta HTTP perdida, la escritura puede existir.
  Al recuperar conectividad, consultar GET antes de ofrecer otra escritura.
  Si GET funciona, contrastar el punto/versión actuales y solicitar confirmación
  para cualquier nuevo cambio. Un GET exitoso no identifica por sí solo qué
  petición originó el estado. Si GET falla o devuelve 409, no repetir POST/PUT.
- Una respuesta HTTP perdida después de confirmar Mongo puede dejar datos
  guardados y bloqueos liberados: se verificó GET 200 y posterior POST 409.
- Deshabilitar doble envío durante guardado. Cancelar fetch no garantiza cancelar
  una operación en servidor. No usar reintentos automáticos de mutaciones,
  colas offline ni temporizadores que vuelvan a guardar un borrador antiguo.

## Aceptación de 3.3: selector manual

- [ ] Cuenta permite registrar/consultar/cambiar ubicación, con carga/error/vacío.
- [ ] El punto se elige explícitamente por toque/arrastre o control accesible;
  no se guarda el centro municipal por defecto.
- [ ] Se muestran coordenadas; no se exige geocodificador ni permiso GPS.
- [ ] Mover el punto no envía mutaciones; existe revisión y confirmación final.
- [ ] Cancelar conserva el domicilio previo; borrador únicamente en memoria.
- [ ] POST para alta; PUT para edición con versión leída; aplicar DTO del éxito.
- [ ] Estados de guardado y recuperación cumplen las reglas anteriores.
- [ ] Limpiar estado privado/cancelar solicitudes al salir o cambiar de usuario;
  descartar respuestas tardías de una sesión anterior.
- [ ] Sin coordenadas/tokens en logs, URL, analítica, localStorage o caché SW.
- [ ] Mantener MapLibre, temas, atribuciones y navegación inferior; no tocar iconos.
- [ ] Separar ubicación domiciliaria de la ubicación GPS temporal del mapa.
- [ ] Comprobar interacciones, cancelación, doble toque y errores; validar luego
  Safari/iPhone y sesión real en entorno controlado, sin acreditar solo por mocks.

## Backend pendiente / límites de aceptación

Resultados previos, no reejecutados para esta transferencia: 3.2.3 21/21; 3.2.5
8/8; backend 301/301. Conflictos nativos→409 y contención se demostraron en 3.2.5.
HTTP usó adaptador Node con Clerk simulado; no servidor/middleware Next completo.

Pendientes: pérdida real de ACK Mongo mediante proxy Wire Protocol validado,
fallos de adquisición/liberación de bloqueos, recuperación operativa con
escritores externos (sin token de operación), Clerk real/iPhone y replicación.
Los errores de confirmación de 3.2.5 fueron hooks simulados; el corte HTTP sí fue
real. No generalizar conciliación de fixtures a cuentas reales. Índice de pruebas
verificado no acredita instalación/configuración en otro despliegue. No cambiar
el guard 503. Los dos fallos preexistentes de cuenta.test.mjs siguen documentados.

## Contenedor: conservar hasta autorización posterior

Estado consultado al preparar este documento: **running**, sesión coincidente,
AutoRemove=true, publicación exclusiva en 127.0.0.1:27018.

- Nombre: ecotrack-mongo-322-d8d77bcd3c02.
- ID: f4e95d3a33837be25a672f4bc1df3f9517dbd910971c317e11e7bce633591b00.
- Base: ecotrack_pruebas_322_d8d77bcd3c02.
- Manifiesto privado: /private/tmp/ecotrack-mongo-322-BXtinf/entorno.json.
- Último inventario 3.2.5: 39 domicilios, 43 perfiles ficticios, cero bloqueos.
  Hoy no se reconsultó la base. No entregar credenciales Mongo al frontend.

Limpieza futura, **no ejecutada y requiere autorización**: exportar evidencia sin
secretos, cerrar clientes/proxies/escritores y comprobar ID y etiquetas. Solo si
coinciden entorno=pruebas-322 y sesión=nombre anterior:

```sh
docker --context desktop-linux container inspect \
  f4e95d3a33837be25a672f4bc1df3f9517dbd910971c317e11e7bce633591b00 \
  --format '{{.Id}} {{index .Config.Labels "ecotrack.entorno"}} {{index .Config.Labels "ecotrack.sesion"}}'

# Tras revisar la coincidencia exacta y contar con autorización:
docker --context desktop-linux stop \
  f4e95d3a33837be25a672f4bc1df3f9517dbd910971c317e11e7bce633591b00
```

AutoRemove y tmpfs hacen que detenerlo elimine el contenedor y sus datos. No
detener Docker Desktop, no hacer prune/drop global ni eliminar la imagen. La
retirada de archivos secretos temporales requiere revisión y autorización aparte.
