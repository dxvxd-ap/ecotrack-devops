# Fase 1 — Base ciudadana EcoTrack

Fecha: 14 de noviembre de 2026. **Estado: parcialmente implementada y bloqueada; no cerrada como entrega funcional.**

Entrega autorizada: React/TypeScript/Vite, PWA, MapLibre, frontera Clerk y proyecto Android Capacitor. No incluye todavía domicilio, reportes municipales ni integración con proveedor GPS definitivo.

## Decisiones

- Cliente independiente en `Dashboard_V3/apps/ciudadano`, sin worktree adicional: el usuario autorizó esa ubicación y exige conservar los cambios locales del backend. No se altera React Native ni se realizan commits.
- Web bajo `/eco/`; APK con base `/`, salida separada `dist-android` y sin service worker. Comparten todo el código de interfaz y dominio.
- No se copian claves ni archivos `.env` de otros repositorios. Clerk sin clave muestra configuración pendiente y permite explorar. La validación de login real requiere configuración y cuenta autorizadas.
- Primer mapa de diagnóstico autocontenido: renderizador real MapLibre con estilo local sin proveedor externo. Solo datos DEMO al elegir ese modo. Proveedor de tiles HTTPS configurable por entorno, sin credenciales secretas en cliente.
- El backend no se despliega. Se prepara un paso explícito para copiar el build web a `public/eco`; no se altera el build existente ni se inicia/reinicia el servicio activo.

## Registro de ejecución

- Línea base: `npm test` en Dashboard: 197/197 aprobadas.
- Pruebas RED→GREEN observadas para contratos, flecha y staging: el primer intento falló por módulos aún inexistentes; después de implementar, pasaron. La prueba de cuenta configurada reprodujo el uso de componentes retirados de Clerk Core 3; corregido a `Show`, y pasó.
- Revisión independiente de solo lectura: detectó la incompatibilidad Clerk, ya corregida. Recomendó iconos PNG, preparados con Sharp ya instalado en Dashboard, sin añadir paquetes. Dimensiones verificadas: 192×192, 512×512, Apple 180×180.
- `npm install --cache /private/tmp/ecotrack-npm-cache --fetch-retries=0 --fetch-timeout=20000 --no-audit --no-fund`: salida 1, `ENOTFOUND registry.npmjs.org` al descargar Capacitor Android. La solicitud de ejecución ampliada fue rechazada automáticamente por la política `sandbox_approval: false`. No hay dependencias nuevas instaladas, `node_modules` propio ni lockfile generado.

## Resultados reales

| Comprobación | Resultado |
|---|---|
| Cliente `npm test` | **11/11 aprobadas**, 0 fallidas |
| Cliente `npm run typecheck` | **Bloqueado**, salida 2: TS2688, falta `vite/client` |
| Cliente `npm run build` | **Bloqueado** en typecheck por la misma dependencia faltante; Vite no llegó a ejecutar |
| Cliente `npm run build:android` | **Bloqueado** en typecheck por la misma dependencia faltante |
| Cliente `npm run test:browser` | **Bloqueado**, `ERR_MODULE_NOT_FOUND` para Playwright; no se inició preview ni Chrome |
| Backend `npm test`, después de cambios | **197/197 aprobadas**, 0 fallidas |
| Backend `tsc --noEmit --incremental false` | **Salida 0**, sin diagnósticos; subproyecto aislado del tipado Next |
| Sintaxis de ocho fuentes nuevas TS/TSX | Sin diagnósticos de sintaxis con `transpileModule`; **no sustituye typecheck o build** |
| `git diff --check` | Salida 0 |
| Redirección Next | Cargada y evaluada: `/eco` → `/eco/index.html`. No prueba despliegue ni respuesta HTTP de un build |
| Integridad de archivos previos | Solo cambiaron `next.config.ts` y `tsconfig.json` de Dashboard; React Native, GPS y demás archivos previos conservan su hash |

Las pruebas de cuenta utilizan React/TypeScript ya disponibles en el repositorio padre y un stub externo con los exports documentados de Clerk Core 3. No prueban el SDK instalado, criptografía, identidad real, Google OAuth ni conectividad. Las pruebas geométricas y del sprite no prueban renderizado GPU. Staging se ejecutó sobre fixtures temporales, nunca se publicaron esos fixtures como datos municipales.

No se ejecutó `next build` sobre `.next` del backend: podía interferir con un servicio de desarrollo existente. No se alteró ni reinició ningún servicio. No se modificaron endpoints de negocio en esta fase. No se creó una rama, worktree, commit, merge ni push.

## Estado de las validaciones tempranas

- **Vite:** configuración y entradas preparadas; compilación pendiente de dependencias.
- **MapLibre:** componente, fuentes GeoJSON, flechas y manejo de errores preparados. Fondo de diagnóstico local para desacoplar la prueba GPU de credenciales; renderizado real y proveedor de calles todavía no verificados.
- **Clerk:** SDK declarado, provider y UI Core 3 preparados. Sin clave ofrece exploración; acceso real y perfil municipal no validados. OAuth Android se mantiene inhabilitado hasta disponer de retorno seguro comprobado.
- **PWA:** manifest, SW de ámbito `/eco/` y recursos configurados. Build/registro/offline/instalación no verificados. No se cachean API privadas ni tiles por configuración de runtime.
- **Capacitor:** configuración e identificador preparados. CLI/runtime no instalados; `android/` no generado; permisos nativos, splash y APK no disponibles.
- **GPS:** interfaz independiente del proveedor y fixture demo explícito. Ninguna fuente externa se declara disponible ni se implementó tracking telefónico.

## Archivos creados

Todos dentro de `Dashboard_V3/apps/ciudadano/`:

| Área | Archivos |
|---|---|
| Base | `package.json`, `.gitignore`, `.env.example`, `tsconfig.json`, `index.html`, `vite.config.ts`, `capacitor.config.ts`, `README.md` |
| Interfaz | `src/main.tsx`, `src/styles.css`, `src/env.d.ts`, `src/app/App.tsx`, `src/app/Cuenta.tsx` |
| Mapas y contratos | `src/mapas/Mapa.tsx`, `src/mapas/demo.ts`, `src/mapas/flecha.ts`, `src/servicios/contratos.ts`, `src/servicios/vehiculos.ts` |
| Recursos | `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` |
| Scripts | `scripts/stage-web.mjs`, `scripts/browser-smoke.mjs` |
| Pruebas | `tests/contratos.test.ts`, `tests/cuenta.test.mjs`, `tests/flecha.test.ts`, `tests/stage-web.test.mjs` |
| Registro | `docs/FASE-1.md` |

Archivos previos modificados: `Dashboard_V3/tsconfig.json` (exclusión del cliente) y `Dashboard_V3/next.config.ts` (redirección local a HTML estático). El build de Dashboard no se cambió para instalar ni compilar automáticamente el subproyecto.

## Dependencias declaradas, no instaladas

Runtime: React/React DOM 19.2.3; MapLibre GL 5.24.1; Clerk React 6.18.8; Lucide React 0.475.0; Capacitor Core/Android 8.6.2; Capacitor App/Geolocation 8.0.0.

Desarrollo: Vite 7.3.8; plugin React 5.2.0; TypeScript 6.0.3; plugin PWA 2.0.0; Capacitor CLI 8.6.2; Playwright 1.65.1; tipos React/DOM 19.3.0 y Node 22.13.9. Versiones directas fijadas; resolución completa de peers, transitivas y lockfile **pendiente de instalación real**. No se debe sustituir esta validación con metadatos de npm o mocks.

## Pendientes y deuda técnica

Bloqueantes: acceso al registro npm; instalación/lockfile; typecheck/build web y Android; prueba GPU real; configuración pública de proveedor/Clerk; generación Android y toolchain; URL HTTPS y dispositivos físicos. El permiso de instalar ya está concedido por el usuario: no se requiere pedirlo nuevamente; hace falta que el entorno permita la descarga.

Pendientes siguientes: sesión con perfil/rol servidor, domicilio/reportes, adaptador real de vehículos, CORS Android y navegación con historial/back. No se añaden funciones de conductor.

Menor diferido de revisión: en `browser-smoke.mjs`, pasar el timeout de `waitForFunction` como tercer argumento al habilitar la prueba (actualmente se utiliza el timeout por defecto). No impide las pruebas unitarias; no debe darse por ejecutada la prueba visual.

No se regeneró Graphify sobre esta entrega incompleta: el grafo existente corresponde al HEAD base y no representa todavía el subproyecto. Actualizarlo cuando la base compile, sin confundir ese grafo con verificación de ejecución.

## Comandos de prueba

Ver [README.md](../README.md). Los comandos de navegador/Android solo estarán operativos después de instalar las dependencias. No hay enlace de preview ni APK entregable en esta sesión. Para iPhone se documentó el recorrido previsto en HTTPS; no se afirma que se haya instalado una PWA.
