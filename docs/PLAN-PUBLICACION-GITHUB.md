# Consolidación de EcoTrack para GitHub

Preparación: 16 de noviembre de 2026. Push pendiente de autorización explícita del usuario. No se ha realizado despliegue.

## Destino y base

- Rama de trabajo: `feature/consolidacion-fase-3-5`.
- Remoto `origin`: `https://github.com/calavanda/Dashboard_V3.git`.
- Destino propuesto: rama remota homónima; revisión posterior por pull request hacia `main`.
- Base al comenzar: `9cc30c679430a3218ffbed2d138ed2d5edab7d6d`.
- `git fetch origin` completado; `HEAD...origin/main` al comenzar: 0 commits delante y 0 detrás. No se hizo pull ni merge.
- Publicar la rama requiere confirmar que no hay automatizaciones de hosting que creen despliegues si eso queda fuera de la autorización. No se verificó la configuración externa de hosting en esta tarea.

## Orden de commits

1. Higiene de Git/configuración: exclusiones, plantillas vacías, retirada de credenciales incrustadas en scripts y fin del seguimiento de respaldo/caché (copias locales conservadas).
2. Backend ciudadano y seguridad: sincronización, domicilio, permisos de rutas/reclamos, herramientas de conciliación, dotenv ya añadido y pruebas correspondientes.
3. Geoapify servidor: contrato de dirección, proveedor, endpoint y sus pruebas.
4. PWA ciudadana: código y assets intencionales, lockfile, configuración, HTTPS local, pruebas, preparación Android y redirección `/eco` del dashboard. Incluye el estado funcional consolidado hasta 3.5B, sin reconstruir artificialmente versiones intermedias.
5. Documentación y coordinación: guía de equipo, handoff 3.5B con reporte Safari 9/9 del usuario, registros de fases y AGENTS.md.

Los commits separan responsabilidades sobre el código existente; no pretenden recrear commits históricos que nunca se hicieron. La PWA se incorpora después del backend y Geoapify porque importa el contrato real del servidor. El README de la PWA enlaza la guía que se añade en el último commit; la rama se comparte como conjunto.

## Exclusiones preservadas en disco

- `.env*` reales, claves privadas, certificados locales y seriales OpenSSL. Solo las plantillas `.env.example` se incluyen.
- `node_modules` de cualquier aplicación.
- `.next/`, `.next-respaldo-*/`, `dist`, `dist-android`, `public/eco`, `*.tsbuildinfo`.
- `datos_locales_respaldo.json`; se incluye una plantilla equivalente vacía para nuevas instalaciones.
- `.playwright-mcp/`, capturas/snapshots locales y `apps/ciudadano/artifacts/`.
- Páginas temporales `diag-*.html`, `test-icon.html`, `manifest-test.json` de la PWA.
- `graphify-out/`: salidas/caché generadas y rutas de la máquina original. `.graphifyignore` sí se incluye.
- Backups y archivos locales ignorados preexistentes.

Los iconos distribuidos en `apps/ciudadano/public` son assets de la aplicación y sí se incluyen. No se borró ningún archivo local sin seguimiento. Las eliminaciones de `datos_locales_respaldo.json` y `tsconfig.tsbuildinfo` en Git representan únicamente su salida del control de versiones.

## Riesgos y comprobaciones

Se retiraron literales de credenciales de `scripts/probar_mongo.mjs`, `scripts/promover_admin.mjs` y `scripts/test_usuarios_api.mjs`. Ahora exigen variables explícitas antes de operar. Las credenciales siguen en commits previos y pudieron haberse expuesto ya: sus responsables deben rotarlas. No se rotaron secretos ni se reescribió el historial. La comprobación del árbol actual no asegura limpieza del historial.

Se verificaron patrones de claves Clerk, URI Mongo con credenciales, claves privadas y JWT, además de buscar coincidencias exactas con los secretos configurados en archivos de entorno locales, sin imprimir sus valores. También se comprueban los blobs añadidos al índice antes de confirmar cada grupo. Esto reduce el riesgo, pero no es una garantía de detectar cualquier formato de secreto.

Se comprobaron sintaxis y rechazo de ejecución sin variables en los tres scripts sanitizados. No se ejecutaron operaciones remotas con esos scripts. La plantilla de respaldo es JSON válido y vacía; las copias locales del respaldo y caché siguen presentes.

Verificación funcional conservada de la sesión previa: 118 pruebas PWA, 379 raíz, typechecks y builds correctos; Chrome 3.5B con servicios simulados. Safari iOS: el usuario reporta 9/9 pruebas manuales. No se repiten suites completas por cambios de documentación/exclusión; no se afirma validación de Geoapify en producción. El aviso de bundle PWA >500 kB permanece.

Los arneses de integración real de Mongo/Docker tienen destinos locales de la máquina original, documentados en la guía; no ejecutarlos como instalación habitual. Los scripts de conciliación/promoción son herramientas operativas con objetivos que requieren revisión y autorización, no servicios de arranque.

La revisión de espacios del código preparado pasó tras retirar espacios finales sin efecto funcional en `concilia-admin.mjs`, `apps/ciudadano/src/main.tsx` y `styles.css`. La documentación conserva los dobles espacios Markdown de AGENTS.md y los espacios de contexto del parche histórico `docs/auditorias/fase-2a-seguridad.patch`; `git diff --check` los señala, por lo que se revisan con esas dos excepciones explícitas, sin modificar el parche.

## Inventario exacto preparado

Incluye cambios funcionales preexistentes, archivos nuevos y las dos salidas del control de versiones. Las exclusiones anteriores permanecen locales.

```text
.env.example
.gitignore
.graphifyignore
AGENTS.md
apps/ciudadano/.env.example
apps/ciudadano/.gitignore
apps/ciudadano/README.md
apps/ciudadano/capacitor.config.ts
apps/ciudadano/docs/ENTREGA-2.md
apps/ciudadano/docs/FASE-1.md
apps/ciudadano/docs/VALIDACION-IPHONE.md
apps/ciudadano/index.html
apps/ciudadano/package-lock.json
apps/ciudadano/package.json
apps/ciudadano/public/apple-touch-icon.png
apps/ciudadano/public/favicon-16.png
apps/ciudadano/public/favicon-32.png
apps/ciudadano/public/favicon.ico
apps/ciudadano/public/icon-192-maskable.png
apps/ciudadano/public/icon-192.png
apps/ciudadano/public/icon-512-maskable.png
apps/ciudadano/public/icon-512.png
apps/ciudadano/public/icon.svg
apps/ciudadano/scripts/browser-smoke.mjs
apps/ciudadano/scripts/check-https.mjs
apps/ciudadano/scripts/prepare-https.mjs
apps/ciudadano/scripts/stage-web.mjs
apps/ciudadano/src/app/App.tsx
apps/ciudadano/src/app/ConsejosEcologicos.tsx
apps/ciudadano/src/app/Cuenta.tsx
apps/ciudadano/src/app/DireccionAproximada.tsx
apps/ciudadano/src/app/DomicilioSesion.tsx
apps/ciudadano/src/app/SeleccionarDomicilio.tsx
apps/ciudadano/src/app/apariencia-clerk.ts
apps/ciudadano/src/env.d.ts
apps/ciudadano/src/main.tsx
apps/ciudadano/src/mapas/DireccionCasa.tsx
apps/ciudadano/src/mapas/Mapa.tsx
apps/ciudadano/src/mapas/demo.ts
apps/ciudadano/src/mapas/flecha.ts
apps/ciudadano/src/servicios/autenticacion.ts
apps/ciudadano/src/servicios/contratos.ts
apps/ciudadano/src/servicios/datos-mapa.ts
apps/ciudadano/src/servicios/direccion.ts
apps/ciudadano/src/servicios/domicilio.ts
apps/ciudadano/src/servicios/estado-direccion.ts
apps/ciudadano/src/servicios/estado-domicilio.ts
apps/ciudadano/src/servicios/posicion.ts
apps/ciudadano/src/servicios/rutas.ts
apps/ciudadano/src/servicios/vehiculos.ts
apps/ciudadano/src/styles.css
apps/ciudadano/tests/apariencia-clerk.test.ts
apps/ciudadano/tests/clerk-contraste-browser.mjs
apps/ciudadano/tests/contratos.test.ts
apps/ciudadano/tests/cuenta-domicilio-integracion.test.ts
apps/ciudadano/tests/cuenta.test.mjs
apps/ciudadano/tests/datos-mapa.test.ts
apps/ciudadano/tests/diagnostico-arranque.mjs
apps/ciudadano/tests/direccion.test.ts
apps/ciudadano/tests/domicilio-contratos.test.ts
apps/ciudadano/tests/domicilio-servicio.test.ts
apps/ciudadano/tests/estabilizacion-browser.mjs
apps/ciudadano/tests/estado-direccion.test.ts
apps/ciudadano/tests/estado-domicilio.test.ts
apps/ciudadano/tests/fase34-browser.mjs
apps/ciudadano/tests/fase35b-browser.mjs
apps/ciudadano/tests/fixtures/clerk.tsx
apps/ciudadano/tests/flecha.test.ts
apps/ciudadano/tests/https.test.mjs
apps/ciudadano/tests/posicion.test.ts
apps/ciudadano/tests/rutas.test.ts
apps/ciudadano/tests/seguridad-vite.test.ts
apps/ciudadano/tests/seleccionar-domicilio.test.ts
apps/ciudadano/tests/stage-web.test.mjs
apps/ciudadano/tsconfig.json
apps/ciudadano/vite.config.ts
concilia-admin.mjs
concilia-ciudadano.mjs
datos_locales_respaldo.example.json
datos_locales_respaldo.json
docs/FASE-3.1-DOMICILIO.md
docs/FASE-3.2-DOMICILIO.md
docs/FASE-3.2.1-PERSISTENCIA.md
docs/FASE-3.2.3-INTEGRACION-REAL.md
docs/FASE-3.2.5-FALLOS-CONCILIACION.md
docs/FASE-3.3.8-ESTABILIZACION-PWA.md
docs/FASE-3.4-DOMICILIO-VISUAL.md
docs/FASE-3.4.2-CONTRASTE-CLERK.md
docs/GUIA-EQUIPO-ECOTRACK.md
docs/HANDOFF-DOMICILIO-FRONTEND.md
docs/HANDOFF-FASE-3.5B.md
docs/PLAN-PUBLICACION-GITHUB.md
docs/auditorias/fase-2a-seguridad.patch
docs/superpowers/plans/2026-11-11-fase-2a.md
docs/superpowers/plans/2026-11-11-fase-2b.md
docs/superpowers/plans/2026-11-15-fase-3.4.md
next.config.ts
package-lock.json
package.json
scripts/probar_mongo.mjs
scripts/promover_admin.mjs
scripts/test_usuarios_api.mjs
src/app/api/ciudadano/direccion-aproximada/route.ts
src/app/api/ciudadano/domicilio/route.ts
src/app/api/ciudadano/sincronizar/route.ts
src/app/api/rutas/route.ts
src/app/api/v1/reclamos/route.ts
src/contratos/direccion_aproximada.ts
src/contratos/domicilio.ts
src/lib/autorizacion.ts
src/lib/autorizacion_ciudadana.ts
src/lib/domicilio_ciudadano.ts
src/lib/geoapify_servidor.ts
src/lib/http_ciudadano.ts
src/modelos/DomicilioCiudadano.ts
src/modelos/Reclamo.ts
tests/api-direccion-aproximada.test.cjs
tests/api-domicilio.test.cjs
tests/concilia-ciudadano.test.cjs
tests/domicilio-ciudadano.test.cjs
tests/geoapify.test.cjs
tests/helpers/domicilio.cjs
tests/helpers/entorno.cjs
tests/helpers/geoapify.cjs
tests/integracion/domicilio-real.cjs
tests/integracion/fallos-conciliacion-real.cjs
tests/seguridad-ciudadano.test.cjs
tests/seguridad-rutas-reclamos.test.cjs
tsconfig.json
tsconfig.tsbuildinfo
```
