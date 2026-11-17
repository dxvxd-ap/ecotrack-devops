# Entrega 2 — Cartografía, rutas y prueba segura en iPhone

Fecha: 14 de noviembre de 2026.

## Cambios

- OpenFreeMap Liberty como estilo predeterminado MapLibre, centrado en Gutiérrez Zamora; `VITE_MAP_STYLE_URL` sigue permitiendo otro proveedor. Sin claves nuevas ni dependencias adicionales.
- Atribuciones del estilo (OpenMapTiles/OpenStreetMap) conservadas mediante el control MapLibre, y enlace OpenFreeMap explícito. Atribuciones fuera del panel, con ajuste específico en horizontal. Sin descargas masivas ni caché de tiles añadida.
- GET `/api/rutas` automático al abrir. Validación de contrato/HTTP/JSON; no se sustituyen fallos por datos demo. Se mantienen LineString y partes separadas de MultiLineString, con flechas alineadas al sentido de coordenadas. Esto no certifica sentidos legales de tránsito ni secuencia GPS.
- Selección de ruta desde lista o trazado, resaltado, encuadre de todas sus partes y detalles publicados: nombre, descripción, kilómetros y minutos. No se inventan horarios ni ETA.
- Panel inferior compacto, expandible por botón accesible; lista y detalle con desplazamiento interno. Navegación visible. Se conserva la composición visual y paleta existentes.
- Mensajes de carga/error/desconexión para ciudadanos; diagnósticos de MapLibre, claves o fases retirados de la UI. La ausencia de telemetría sigue indicada sin simular posiciones reales.
- Cancelación/timeout con AbortController y listeners, sin depender de `AbortSignal.any` en Safari. El mapa se redimensiona al volver desde otra pestaña.
- HTTPS local opcional para desarrollo/preview, con CA exclusiva de desarrollo y certificado con SAN para la IP LAN. No se instaló confianza automáticamente, no se cambiaron servicios activos ni se compartieron claves.

## Proveedor y condiciones

[OpenFreeMap](https://openfreemap.org/) permite uso comercial y de demostración, sin registro ni clave para su instancia pública. No ofrece SLA garantizado. Su [guía MapLibre](https://openfreemap.org/quick_start/) proporciona el estilo `https://tiles.openfreemap.org/styles/liberty`. Los datos proceden de OSM y se respetan las atribuciones del estilo. No se usa el servidor raster público OSM como atajo y no se implementa cartografía offline en esta entrega.

## Pruebas ejecutadas

| Comprobación | Resultado real |
|---|---|
| Cliente typecheck | Salida 0 |
| Cliente `npm test` | 19 pruebas aprobadas, 0 fallidas |
| Cliente `npm run build` | Salida 0; manifest y service worker generados |
| Cliente `npm run build:android` | Salida 0; assets compartidos, sin SW. No equivale a APK |
| Backend pruebas | 197 aprobadas, 0 fallidas |
| Backend `tsc --noEmit --incremental false` | Salida 0 |
| OpenSSL sobre certificado LAN | Cadena válida `localhost.pem: OK`; certificado del servidor hasta 12-feb-2027 |
| Certificados/claves ignorados por Git | Comprobado con `git check-ignore` |
| Protección HTTP de claves | Prueba de config efectiva Vite con `isFileServingAllowed`: `.certs/`, `.key`, `.env` y `.git` denegados; fuente pública permitida |
| Browser smoke | No pudo arrancar preview; `listen EPERM 127.0.0.1:4173`. No hay captura ni validación visual nueva |
| API pública desplegada | Solicitud de lectura falló por DNS (`Could not resolve host`). No se acredita conexión real desde este entorno |

Las pruebas de rutas utilizan contratos controlados y las de TLS verifican certificados reales generados con OpenSSL, sin abrir puertos ni instalar confianza. La prueba browser preparada cubre selección, error/vacío, separación demo, tamaños 390×844, 320×568 y 844×390, panel abierto/cerrado y colisiones con cabecera/atribuciones/navegación. Esa cobertura está escrita, **no ejecutada satisfactoriamente** en esta sesión. No sustituye Safari físico.

Vite advierte sobre un chunk mayor de 500 kB (mapa y aplicación). Se registra como deuda de rendimiento; no se ocultó el aviso ni se añadió una optimización ajena a la entrega. No se alteró React Native, GPS ni los endpoints existentes; los cambios previos del dashboard se conservaron por comparación de hashes.

## Revisión independiente y correcciones

- Se reprodujo mediante prueba el riesgo de servir `.certs/localhost.key` desde Vite: la extensión `.key` no estaba cubierta por los bloqueos predeterminados. Se amplió `server.fs.deny`, conservando `.env`, certificados y `.git`; la prueba pasó de rojo a verde. No se solicitó ninguna clave por HTTP.
- Se identificó por geometría CSS que el panel expandido invadía cabecera/atribuciones en horizontal. Se añadió distribución para poca altura, atribución en el lateral y prueba browser de intersecciones también con el panel expandido. Falta confirmar visualmente en iPhone.
- Se añadió protección frente a sobrescribir configuraciones TLS y salidas auxiliares preexistentes; su prueba pasó de rojo a verde.

## Archivos principales

Modificados: `src/mapas/Mapa.tsx`, `src/app/App.tsx`, `src/app/Cuenta.tsx`, `src/styles.css`, `src/servicios/contratos.ts`, `vite.config.ts`, `package.json` (solo scripts), `.gitignore`, `.env.example`, `scripts/browser-smoke.mjs`, `tests/cuenta.test.mjs`, `README.md`.

Creados: `src/servicios/rutas.ts`, `tests/rutas.test.ts`, `scripts/prepare-https.mjs`, `tests/https.test.mjs`, `tests/seguridad-vite.test.ts`, este documento. `.certs/` contiene únicamente artefactos locales ignorados. No se modificó el lockfile ni se añadieron dependencias.

## Volver a comprobar en iPhone

La validación de la interfaz anterior en iPhone/Safari por HTTP y la inicialización MapLibre fueron **confirmadas por el usuario**; no se atribuyen a pruebas automáticas de esta entrega.

1. Conectar Mac/iPhone a la misma Wi-Fi. La IP detectada al preparar certificados fue `192.168.1.69`; comprobar que siga siendo esa.
2. Configurar `VITE_DEV_API_ORIGIN` con el backend realmente activo. Vacío utiliza `http://127.0.0.1:3000`; tanto dev como preview proxyan `/api` desde el Mac. Si ese backend no está disponible, se mostrará un error comprensible, sin demo automática. No hace falta exponer HTTP inseguro al iPhone para consultar la API a través del proxy HTTPS local.
3. Transferir por AirDrop **solo** `apps/ciudadano/.certs/ecotrack-ca.cer`. No transferir `.key`, `ca-key.pem` ni carpetas completas de certificados.
4. Instalar el perfil en General → VPN y administración de dispositivos; después activar confianza para **EcoTrack desarrollo local** en General → Información → Config. certificados de confianza. [Instrucciones de Apple](https://support.apple.com/es-lamr/102390). No se ha realizado este paso automáticamente.
5. Desde `Dashboard_V3/apps/ciudadano`, ejecutar `npm run build` y `npm run preview:https`. No usa el puerto del Vite HTTP existente.
6. En Safari abrir `https://192.168.1.69:4443/eco/index.html`, sin advertencias TLS. Para cambios en desarrollo usar `npm run dev:https` y puerto 5443; para PWA usar la preview del build, donde sí se registra el service worker.
7. Comprobar calles, referencias y atribuciones; zoom/arrastre; panel compacto; expandir; seleccionar ruta; nombre/detalles/flechas; volver a Inicio y probar orientación horizontal.
8. Con backend de prueba autorizado, comprobar error de red y recuperación con Actualizar rutas. El botón Ver demostración debe ser la única entrada a datos simulados.
9. Pulsar ubicación, conceder permiso y verificar el marcador. Denegar el permiso también debe permitir seguir consultando el mapa.
10. Compartir → Agregar a inicio; abrir desde el icono. Probar recarga y actualización. Sin red, el shell puede estar disponible, pero no se prometen calles offline, rutas actualizadas ni vehículos en vivo.

No se inició/reinició ningún servicio del usuario, ni se hicieron push, merge o commits. No se regeneró el grafo: esta entrega cambia UI y adaptadores acotados, sin reestructurar los repositorios activos.
