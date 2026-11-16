# Fase 3.4 — domicilio, tema y mapa

Fecha: 15 de noviembre de 2026. Estado: tema y casa implementados; tarjeta compacta provisional; geocodificación externa pendiente de autorización. El usuario reportó 8/8 pruebas de 3.3.8 en Safari; las pruebas nuevas de esta fase se hicieron en Chrome, no en iOS físico.

## Causas encontradas

- `main.tsx`: `ecoCambiarTema()` ejecutaba `window.location.reload()`. Se reconstruían React, Clerk, mapa y estado en memoria. El observador automático se creaba solo según la preferencia al arrancar.
- El domicilio solo pertenecía a Cuenta, que se monta al visitarla. El mapa inicial no podía recuperar ni conocer el registro existente.
- `Mapa.tsx` restauraba capas al cambiar estilo con valores capturados por un callback puntual; cambios de datos durante la carga podían quedar atrás. Los listeners de rutas se añadían en cada reconstrucción de capas.
- La tarjeta exponía cuatro filas técnicas y carecía de padding propio. La dirección postal no existe en el DTO actual ni se obtiene de un servicio de geocodificación.
- Durante la integración se reprodujo un desfase realista: useAuth identifica la sesión mientras useUser aún carga. El efecto antiguo de Cuenta publicaba null ante `!isSignedIn`, borrando el snapshot compartido. Se eliminó esa escritura; la identidad/sesión controla la limpieza.

## Cambios implementados

- Tema preferido y tema efectivo en estado React debajo de ClerkProvider. `auto` sigue el sistema; almacenamiento opcional. Sin reload, nuevas keys, sincronizaciones ni consultas de API por cambiar el tema.
- Almacén de domicilio en memoria, independiente por userId/sessionId; GET existente al abrir una sesión, sin ejecutar POST de sincronización. Cachea también el resultado null, deduplica solicitudes y permite revalidación/reintento. Una revisión interna impide que GET antiguos reviertan una actualización confirmada.
- Cuenta mantiene su sincronización habitual al visitarla y comparte el snapshot con el mapa. Sus escrituras exitosas actualizan la casa; se conservan conflictos, incertidumbre y reintentos de 3.3.8.
- Casa con SVG local y Marker DOM de MapLibre, anclado a `[longitud, latitud]` del DTO persistido, identificable como “Tu domicilio guardado”. Actualiza posición sin recrear mapa ni mover cámara. Se retira antes del pintado al cambiar/cerrar sesión. GPS y vehículos conservan sus fuentes/capas independientes.
- `style.load` reconstruye capas usando las referencias actuales, sin marcar la interfaz como cargando. Los listeners de rutas se registran una vez por instancia. El selector también puede actualizar estilo sin desmontarse.
- Tarjeta con estado de evaluación, “Ubicación guardada”, fallback explícito, confirmación del ciudadano y botón de cambio. Coordenadas/tipo/versión siguen disponibles bajo “Detalles de ubicación”; no se borran del sistema. CSS limitado a tarjeta y casa.

## Propuesta de tarjeta para dirección legible

Orden cuando exista un proveedor autorizado:

1. Encabezado “Tu domicilio” y estado de evaluación.
2. Dirección principal devuelta por el proveedor; marcarla como aproximada, sin afirmar validación postal.
3. Colonia y municipio solo cuando estén presentes y su significado esté verificado para México.
4. “Confirmado por ti” y fecha: confirma el punto elegido, no la exactitud del texto geocodificado.
5. “Cambiar domicilio”; detalles técnicos secundarios y nota de evaluación municipal.

Actualmente se muestra **“Ubicación guardada”** y **“La dirección no está disponible por ahora. Tu punto sigue guardado en el mapa.”** No se inventan colonia, municipio, número ni calle a partir de la ciudad del proyecto. La fuente de verdad sigue siendo el punto original; nunca sustituirlo por la coordenada del objeto devuelto por el geocodificador.

Captura de la propuesta: `apps/ciudadano/artifacts/fase34-tarjeta-fixture.png`. Usa datos ficticios y fallback, no representa una dirección real.

## Proveedor recomendado y limitaciones

Revisión de documentación oficial; no se hicieron llamadas de geocodificación ni se crearon cuentas/claves.

| Opción | Evaluación |
| --- | --- |
| MapLibre + OpenFreeMap actuales | Se mantienen para renderizado/cartografía. El código existente no incluye una fuente de direcciones. La cartografía no valida un domicilio postal. [OpenFreeMap](https://openfreemap.org/). |
| Nominatim público OSMF | No recomendado para domicilios ciudadanos. Límite absoluto de 1 solicitud/segundo agregado por aplicación, identificación/atribución, caché y política que pide no enviar datos personales/confidenciales. No se ha integrado. [Política](https://operations.osmfoundation.org/policies/nominatim/). |
| Nominatim propio | Alternativa si EcoTrack necesita controlar el alojamiento de consultas. Requiere infraestructura, operación, actualizaciones y autorización; no se instaló nada. El límite del servidor público no es el de una instalación propia. El resultado puede corresponder al objeto OSM adecuado más cercano, no al punto exacto. [Software](https://nominatim.org/), [reverse](https://nominatim.org/release-docs/5.0/api/Reverse/). |
| LocationIQ administrado | Candidato técnico recomendado para evitar operar un geocodificador. Reverse devuelve texto y componentes de dirección mediante token; compatible con el mapa actual porque se desacopla del renderizado. Requiere autorización del responsable sobre cuenta/plan, transferencia de coordenadas, condiciones y cobertura local. [Reverse](https://docs.locationiq.com/docs/reverse-geocoding). |

LocationIQ publica para Free 5,000 solicitudes/día, 2/segundo y 60/minuto, con enlace de atribución prominente para uso comercial. Las cuotas/planes pueden cambiar. Sus términos permiten caché de pares consulta/respuesta hasta 48 horas en Free; confirmar alcance de almacenamiento antes de diseñar persistencia. [Planes](https://locationiq.com/pricing), [términos](https://locationiq.com/tos).

Su política declara recogida de estadísticas, timestamps e IP; sus términos contemplan procesamiento de datos de ubicación. Publica un DPA, pero esto no demuestra por sí solo que todas las condiciones necesarias para domicilios municipales estén satisfechas: confirmar retención de consultas, ubicación de procesamiento y tratamiento de coordenadas antes de autorizar. [Privacidad](https://www.locationiq.com/privacy), [DPA](https://locationiq.com/dpa).

Integración futura propuesta: acceso controlado desde infraestructura de EcoTrack, sin exponer claves en VITE_*, sin enviar nombre, correo, ID Clerk o JWT al proveedor; solo punto y parámetros necesarios. No registrar URLs que contengan coordenadas/claves. Requiere autorización si se añade un endpoint o contrato backend. Consultar solo el punto guardado/cambiado, con cuotas agregadas, caché permitida, timeout y descarte de resultados anteriores al cambiar punto/sesión. Nunca consultar en cada movimiento del mapa ni en cada render/cambio de tema. Mostrar fallback ante error, límite, ausencia de resultado o dirección incompleta. No hay endpoint, configuración ni feature flag que active un servicio externo en esta entrega.

## Archivos modificados o añadidos

Producción:
- `apps/ciudadano/src/main.tsx`: tema reactivo y montaje del contexto compartido.
- `apps/ciudadano/src/app/DomicilioSesion.tsx` (nuevo): contexto por identidad/sesión, GET de recuperación.
- `apps/ciudadano/src/servicios/estado-domicilio.ts` (nuevo): snapshot, deduplicación, caché e invalidación de lecturas.
- `apps/ciudadano/src/app/App.tsx`: conecta domicilio y tema efectivo al mapa.
- `apps/ciudadano/src/app/Cuenta.tsx`: usa snapshot compartido y tarjeta compacta.
- `apps/ciudadano/src/mapas/Mapa.tsx`: casa, restauración actual de capas y listeners sin duplicación.
- `apps/ciudadano/src/app/SeleccionarDomicilio.tsx`: tema efectivo sin remontaje.
- `apps/ciudadano/src/styles.css`: padding, jerarquía compacta, detalles y marcador.

Pruebas/documentación:
- `apps/ciudadano/tests/estado-domicilio.test.ts` (nuevo).
- `apps/ciudadano/tests/fase34-browser.mjs` (nuevo).
- `apps/ciudadano/tests/fixtures/clerk.tsx`: simula user aún cargando con identidad conocida.
- `apps/ciudadano/tests/cuenta.test.mjs`: frontera del nuevo contexto para SSR.
- `apps/ciudadano/tests/estabilizacion-browser.mjs`: comprueba versión conservada dentro de detalles cerrados.
- `docs/superpowers/plans/2026-11-15-fase-3.4.md` y este informe.

## Pruebas y límites

Desde `apps/ciudadano`:

- `npm test`: 98/98 pasan, incluyendo 5 nuevas del almacén. Se observaron primero las pruebas nuevas fallar por módulo aún inexistente; después pasaron con la implementación.
- `npm run build`: incluye typecheck; build Vite y generación PWA correctos. Persiste aviso de bundle JS mayor de 500 kB, sin ampliar este ajuste para resolverlo.
- `node tests/fase34-browser.mjs`: 12 checks pasan. Cuenta conserva nodo DOM; mapa conserva instancia, centro, zoom y orientación; no hay nuevos POST sync, GET domicilio, GET rutas o navegación al cambiar tema; automático sigue el sistema; casa/GPS separados; vehículo demo, GPS y rutas sobreviven al estilo; Marker.getLngLat coincide con PUT; cambio de usuario/logout limpian casa con GET demorado.
- `node tests/estabilizacion-browser.mjs`: 18 checks anteriores pasan, incluyendo PUT/POST exactos, GET tardío, token nulo y escritura incierta.
- Reproducción adicional roja/verde de la carga parcial de useUser: antes desaparecía casa, después se conserva y no sincroniza hasta que el usuario está cargado.
- En raíz: `./node_modules/.bin/tsc --noEmit --incremental false` y `git diff --check` correctos.
- Revisión estática independiente de aislamiento, carreras y cambio de estilo: sin hallazgos importantes pendientes tras corregir carga parcial.

Pruebas de navegador con Clerk/API/cartografía simulados; no acreditan OAuth real, calles reales ni Safari físico. Se usa Vite aislado/strictPort en 4188 y se cierra al terminar; no se inicia Next sobre `.next`. Un intento de ejecutar dos suites a la vez fue rechazado por strictPort; se repitieron por separado. No se instalaron dependencias, no se cambiaron contratos API ni identidades, no se ejecutaron conciliaciones ni escrituras reales de Atlas. Sin commits, despliegue ni copia a `public/eco`.

## Pendientes específicos para OpenCode

- Tomar esta estructura compacta como base; revisar proporciones, wrapping de encabezado/badge y CTA en 320/390 px, paisaje y tablet. Selectores: `.domicilio-seccion`, `.domicilio-cabecera`, `.domicilio-resumen`, `.domicilio-direccion`, `.domicilio-localidad`, `.domicilio-confirmacion`, `.domicilio-detalles`, `.domicilio-btn-editar`.
- Pulir contraste de variantes `.domicilio-estado-*` en oscuro y foco/expansión de detalles; conservar objetivos táctiles de al menos 44 px. No devolver coordenadas/tipo/versión a la vista principal.
- Evaluar tamaño/visibilidad de `.marcador-domicilio` con calles reales, a distintos zooms y en ambos temas, manteniendo forma de casa y color distinto del GPS/vehículo. No editar fuentes GPS/vehículos para hacerlo.
- Tras autorización del geocodificador, sustituir fallback por campos reales y etiqueta “Dirección aproximada”, con casos de dirección larga/incompleta y error. No asumir municipio/colonia a partir del nombre EcoTrack o del centro inicial.
- Repetir en Safari iOS/PWA instalada: tema claro/oscuro/automático sin recarga, cámara conservada, edición actualiza casa, casa y GPS separados, logout sin casa, recuperación al abrir y variantes con dirección pendiente. El 8/8 previo corresponde a 3.3.8, no a esta fase.
