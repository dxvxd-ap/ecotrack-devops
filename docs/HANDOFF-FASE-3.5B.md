# Handoff — EcoTrack fase 3.5B

Fecha: 16 de noviembre de 2026.
Estado: integración PWA y comprobaciones locales completadas; aceptación real en Safari iOS y Geoapify en producción pendiente. Sin commits ni despliegue.

## Alcance y recuperación

Se retomó el alcance A–E proporcionado por el usuario. No existía este handoff ni referencias documentadas a 3.5B. Se leyeron los AGENTS.md de INTEGRADORA y Dashboard_V3, el informe Graphify y el contrato real `src/contratos/direccion_aproximada.ts`.

Graphify localizó el proveedor, el endpoint, el contrato y las relaciones de `Mapa()`. HEAD y `built_at_commit` coinciden en `9cc30c679430a3218ffbed2d138ed2d5edab7d6d`; se contrastaron hashes MD5 del manifiesto con proveedor, endpoint y servicio de domicilio, coincidentes al recuperar. No se reconstruyó el grafo. Los cambios PWA de esta sesión no están incorporados en él; el código es la autoridad.

### Trabajo previo preservado

Ya existían:

- `servicios/direccion.ts`: cliente autenticado POST, cuerpo confirmado exacto, validación de respuesta, cancelación, timeout y Retry-After.
- `servicios/estado-direccion.ts`: almacén por punto, deduplicación, resultados con/sin dirección, expiración, cooldown 429, cancelación y descarte por revisión.
- `app/DomicilioSesion.tsx`: instancia por userId/sessionId y limpieza al cambiar o cerrar sesión.
- `app/DireccionAproximada.tsx`: hook compartido y presentación con atribución y fallback.
- `app/SeleccionarDomicilio.tsx`: consulta solo en revisión del punto confirmado, sin consultar al mover mapa ni bloquear guardado.
- `app/Cuenta.tsx`: dirección del DTO persistido y coordenadas en detalles secundarios.
- Pruebas previas del cliente y del almacén.

Faltaban interacción de la casa, presentación simultánea de localidad y municipio, estilos específicos y verificación de navegador de la integración.

Al comenzar había 11 archivos rastreados modificados: `datos_locales_respaldo.json`, `next.config.ts`, `package-lock.json`, `package.json`, `src/app/api/rutas/route.ts`, `src/app/api/v1/reclamos/route.ts`, `src/lib/autorizacion.ts`, `src/modelos/Reclamo.ts`, `tests/helpers/entorno.cjs`, `tsconfig.json`, `tsconfig.tsbuildinfo`. Se preservaron sin editar. También había numerosos archivos sin seguimiento, incluidos `apps/`, `docs/`, APIs ciudadanas, contratos, pruebas, grafos y respaldos; no se borraron. Git agrupa la PWA bajo `?? apps/`, por lo que `git diff --stat` no muestra sus cambios.

## Cambios de esta sesión

Todas las rutas siguientes, salvo el handoff, son relativas a `apps/ciudadano/`:

| Archivo | Cambio |
| --- | --- |
| `src/app/DireccionAproximada.tsx` | Muestra localidad y municipio cuando ambos existen; conserva deduplicación y omite valores faltantes. |
| `src/mapas/Mapa.tsx` | Casa como botón de 44 px; apertura de dirección asociada a almacén de sesión y coordenadas exactas. Retira la ventana si cambian sesión/punto o se oculta el mapa. |
| `src/mapas/DireccionCasa.tsx` (nuevo) | Popup MapLibre con portal React y componente compartido. Sin HTML del proveedor ni cambios de cámara. Limpieza de ventana y evento close al desmontar. |
| `src/styles.css` | Presentación, atribución, detalles y reintento; popup con variables claro/oscuro, contenido desplazable y controles táctiles. |
| `tests/estado-direccion.test.ts` | Tres casos nuevos: expiración con notificación, limpieza durante petición y remontaje inmediato deduplicado. |
| `tests/fase35b-browser.mjs` (nuevo) | Integración de componentes y MapLibre reales con API, Clerk y cartografía simulados. |
| `docs/HANDOFF-FASE-3.5B.md` (raíz) | Este registro. |

No se modificaron backend, contratos, Clerk, MongoDB Atlas, registro/edición del domicilio, rutas, GPS ni vehículos. No se instalaron dependencias. El build actualizó artefactos ignorados en `apps/ciudadano/dist` y `.next`; no se copiaron a `public/eco`.

## Verificación ejecutada

Desde `apps/ciudadano`:

- `npm test`: **118/118**, cero fallos.
- `node --test tests/direccion.test.ts tests/estado-direccion.test.ts`: 15/15 antes de añadir tres casos. Después se ejecutó el almacén con 8/8 y la suite completa con 118/118.
- `npm run typecheck`: correcto.
- `npm run build`: correcto, incluye typecheck y generación de service worker. Aviso de chunk JS mayor de 500 kB; no se amplió el alcance para optimizarlo.
- `node tests/fase35b-browser.mjs`: correcto en Chrome local, puerto aislado 4188/strictPort. Comprueba:
  - Cuenta muestra calle, número, colonia, localidad, municipio, estado, aproximación y atribución; coordenadas permanecen en detalles.
  - Casa y Cuenta comparten una consulta; abrir la ventana conserva cámara y datos de rutas/GPS/vehículos.
  - Ventana sin desbordamiento en claro/oscuro a 390 px.
  - Mover el selector no consulta; confirmar envía el punto exacto y `confirmada: true`.
  - Reeditar invalida una respuesta retenida; 503 permite guardar el punto nuevo.
  - Nueva sesión consulta con su propio token y no reutiliza el resultado anterior.
  - Logout retira casa y dirección abierta; cero pageerror de React.

Desde la raíz:

- `./node_modules/.bin/tsc --noEmit --incremental false`: correcto.
- `npm test`: **379/379**, cero fallos (arnés local, no aceptación de servicios reales).
- `npm run build`: correcto, compilación y 28 páginas generadas.
- `git diff --check`: correcto para cambios rastreados; no cubre archivos nuevos.
- No existe script `lint` en package.json raíz ni PWA.

La prueba nueva reprodujo primero la omisión de localidad y la ausencia del botón de casa. Después de los cambios ambas comprobaciones pasan. Durante preparación se corrigieron dos errores del arnés: nombre del botón de corrección y necesidad de situar el mapa sobre el domicilio editado antes del clic final. No se cambió el producto para mover automáticamente la cámara.

Logs locales: `/private/tmp/ecotrack-35b-pwa-tests.log`, `/private/tmp/ecotrack-35b-root-tests.log`, `/private/tmp/ecotrack-35b-pwa-build.log`, `/private/tmp/ecotrack-35b-root-build.log` (temporales).

## Pendientes de aceptación real

1. Safari iOS físico y PWA instalada: confirmar ubicación manual, dirección en revisión, corregir y volver a confirmar; comprobar que mover el mapa no dispara consultas.
2. Con servicios reales: dirección completa, parcial y ausente; no inventar número/colonia/municipio. Verificar atribución y texto de aproximación.
3. Simular red lenta, falta de red, 429 y fallo del proveedor; comprobar guardado independiente y reintento, sin respuestas antiguas al editar.
4. Cuenta y casa tras guardar/reabrir; comprobar claridad y disposición en claro/oscuro/automático, paisaje y pantallas pequeñas; pulsación y cierre del popup, sin mover cámara.
5. Cerrar sesión y cambiar de cuenta con consulta pendiente y ventana abierta: ningún dato anterior visible. Comprobar expiración al regresar de segundo plano en iOS.
6. Verificar autenticación, TLS y conectividad reales de Safari y ausencia de errores de consola.

No se afirma validación de Geoapify en producción ni de Safari iOS. Los servicios reales no fueron invocados por las pruebas de navegador. No se desplegó el build ni se hicieron commits.

## Actualización de aceptación — 16 de noviembre de 2026

El usuario reportó posteriormente **9/9 comprobaciones manuales aprobadas en Safari iOS** para la fase 3.5. Este reporte actualiza el pendiente de aceptación del dispositivo indicado arriba; no es una ejecución realizada por Codex. No se recibieron en esta conversación el detalle de las nueve comprobaciones, versión de iOS ni URL de prueba. No se deduce validación de Geoapify en producción ni cobertura física adicional. Se conserva el registro previo como evidencia histórica.

La consolidación para GitHub se prepara en `feature/consolidacion-fase-3-5`, con push sujeto a autorización explícita. Instrucciones actuales del equipo: `docs/GUIA-EQUIPO-ECOTRACK.md`.
