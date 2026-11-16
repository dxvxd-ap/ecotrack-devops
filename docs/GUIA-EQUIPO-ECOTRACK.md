# Guía del equipo EcoTrack

Actualizada el 16 de noviembre de 2026. Esta guía describe la configuración real de Dashboard_V3 y su PWA ciudadana. Los documentos de entregas anteriores conservan resultados históricos; este documento y el handoff de 3.5B indican el estado actual.

## Arquitectura y repositorios

| Repositorio o aplicación | Responsabilidad |
| --- | --- |
| `Dashboard_V3` (este repositorio) | Dashboard administrativo, vista conductores y API HTTP en Next.js 15/React 19/TypeScript. Clerk autentica; MongoDB/Mongoose persiste. |
| `Dashboard_V3/apps/ciudadano` | Aplicación ciudadana React/Vite, PWA con ámbito `/eco/`, mapas MapLibre y preparación Capacitor Android. Consume la API del mismo Dashboard; no levanta otro backend. |
| `ecotrack-movil-equipo` (repositorio separado) | Aplicación Expo/React Native de ciudadanos y conductores; consume API/Auth del Dashboard. Consultar sus instrucciones para arrancarla. |
| `ecotrack-servidor-gps` (repositorio separado) | Recepción de telemetría GPS TCP y distribución WebSocket. Su integración definitiva como fuente de vehículos de esta PWA sigue pendiente. |
| `ecotrack-web`, `ecotrack-movil-original` | Repositorios históricos; no destinarlos a nuevas integraciones. |

El App Router vive en `src/app`, las APIs en `src/app/api`, los modelos en `src/modelos` y el conector singleton en `src/lib/base_datos.ts`. La autorización administrativa está en `src/lib/autorizacion.ts`; la ciudadana en `autorizacion_ciudadana.ts`. No asumir que toda API es privada: por ejemplo, la lectura de rutas es pública y sus escrituras requieren permiso administrativo.

El dashboard existente usa Leaflet. La PWA usa MapLibre; sus fuentes de rutas, ubicación del teléfono, vehículos y marcador de domicilio son independientes. No intercambiar ambos motores al hacer cambios puntuales.

Flujo ciudadano: Clerk → sincronización del perfil → GET/POST/PUT de domicilio → consulta opcional de dirección aproximada por el backend Geoapify. La geocodificación no decide el punto guardado ni bloquea su guardado. Los resultados de dirección se comparten en memoria por sesión y coordenadas; no se guardan en MongoDB por esta integración.

## Requisitos

- Git y Node.js **>=22.18.0**, según `apps/ciudadano/package.json`; se recomienda que el equipo acuerde una misma versión compatible. La raíz y la PWA tienen instalaciones y lockfiles independientes.
- Acceso al registro npm para instalar. No hace falta Docker para instalar, compilar ni ejecutar las pruebas unitarias.
- Para usar autenticación y persistencia reales: configuración autorizada de la instancia Clerk existente y una base MongoDB de desarrollo preparada. No usar Atlas de producción como base de pruebas.
- Para HTTPS local: OpenSSL disponible y permiso para confiar una CA de desarrollo en el dispositivo de prueba.
- Chrome para las pruebas de navegador actuales. Estas usan por defecto la ruta de Chrome de macOS; algunos arneses aceptan `CHROME_BIN`, otros tienen la ruta fija y requieren adaptación en otro sistema. No se incluyen navegadores ni `node_modules` en Git.

## Instalación y configuración inicial

Desde la carpeta clonada `Dashboard_V3`:

```sh
npm ci
cd apps/ciudadano
npm ci
cd ../..
```

`npm ci` instala las versiones de cada lockfile. No ejecutarlo innecesariamente sobre una sesión en uso. No existe un workspace npm raíz que instale automáticamente la PWA.

Crear las configuraciones locales solo si no existen:

```sh
[ -e .env.local ] || cp .env.example .env.local
[ -e apps/ciudadano/.env.local ] || cp apps/ciudadano/.env.example apps/ciudadano/.env.local
[ -e datos_locales_respaldo.json ] || cp datos_locales_respaldo.example.json datos_locales_respaldo.json
```

El último archivo es el respaldo local usado por APIs existentes. La plantilla contiene colecciones vacías, no datos municipales. El lector falla si el archivo falta o está mal formado; una copia nueva no incluye las rutas de otra persona. Nunca reemplazar un respaldo existente para arrancar el proyecto.

### Variables del servidor: `.env.local` raíz

| Nombre | Uso |
| --- | --- |
| `MONGODB_URI` | Conexión de Mongoose a la base autorizada de desarrollo. Secreto; puede incluir usuario y contraseña. |
| `CLERK_SECRET_KEY` | Acceso servidor a Clerk. Secreto. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clave pública Clerk del dashboard. Debe corresponder a la misma instancia usada por la PWA. |
| `GEOAPIFY_API_KEY` | Geocodificación inversa del servidor. Secreto, nunca `VITE_*` ni `NEXT_PUBLIC_*`. |
| `SUPERADMIN_USER_ID`, `ADMIN_CORREO` | Opcionales, reconocidos por las reglas existentes de fundador. No sustituyen las comprobaciones de rol, estado, identidad y bloqueos. |

Next carga `.env.local`. Los scripts Node operativos no comparten necesariamente esa carga: los de conciliación usan dotenv explícitamente; los scripts antiguos de comprobación/promoción ahora exigen variables del proceso. No ejecutar operaciones administrativas como parte del arranque.

El domicilio ciudadano exige un índice único compatible sobre `ciudadano_id_clerk`; no basta con que MongoDB responda. El endpoint devuelve 503 si falta el índice requerido. La preparación de índices es una tarea de base de desarrollo coordinada con su responsable; consultar `docs/FASE-3.2.1-PERSISTENCIA.md`. No ejecutar los comandos históricos de ese documento contra otra base sin revisarlos.

### Variables públicas de la PWA: `apps/ciudadano/.env.local`

| Nombre | Configuración |
| --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clave pública de la misma instancia Clerk. Sin clave, la cuenta indica que el acceso está pendiente. |
| `VITE_API_ORIGIN` | Vacío para PWA del mismo origen. Android/API de otro origen requiere HTTPS absoluto y validación adicional de CORS/sesión. |
| `VITE_DEV_API_ORIGIN` | Proxy de Vite en desarrollo y preview. Vacío utiliza `http://127.0.0.1:3000`. HTTP solo para localhost/loopback permitido por la configuración; hosts remotos requieren HTTPS. |
| `VITE_MAP_STYLE_URL` | Vacío usa OpenFreeMap. Un estilo alternativo debe ser HTTPS autorizado; cualquier clave incluida aquí es pública. |
| `VITE_ENABLE_DEV_TOOLS` | `false` por defecto. Demo solo si se habilita explícitamente en desarrollo; producción/PWA y Android la ocultan. |

Toda variable `VITE_*` se incorpora al cliente. Los secretos se comparten por un canal privado y se almacenan únicamente en el entorno del servidor. Reiniciar Vite/Next tras cambiar configuración; reconstruir para cambiar variables de un build.

## Iniciar backend/dashboard y PWA

Primero comprobar que no exista ya un backend en 3000. No iniciar otra instancia sobre una sesión del equipo.

Terminal 1, desde la raíz:

```sh
npm run dev
```

Dashboard: `http://localhost:3000/dashboard`. Este mismo proceso atiende `/api/*`. No hay un backend Express separado que deba arrancarse en este repo.

Terminal 2:

```sh
cd apps/ciudadano
npm run dev
```

PWA en desarrollo: `http://localhost:5173/eco/index.html`. Vite está configurado con `strictPort` y proxy `/api` hacia 3000; una colisión de puerto falla en lugar de elegir otro silenciosamente. El service worker está desactivado en desarrollo.

Para inspeccionar el build PWA:

```sh
cd apps/ciudadano
npm run build
npm run preview -- --host 0.0.0.0
```

Abrir `http://localhost:4173/eco/index.html`; necesita el mismo backend para operaciones reales. El build contiene el service worker, pero no convierte por sí mismo una IP LAN HTTP en contexto seguro.

## Otro dispositivo en la misma red

1. Conectar ordenador y teléfono a la misma red y obtener la IP LAN desde la configuración del sistema. `scripts/obtener_ip.mjs` consulta la IP pública, por lo que no sirve para obtener esta IP local.
2. Usar esa IP en lugar de `localhost` en el teléfono. `localhost` en el teléfono apunta al propio teléfono.
3. Para comprobaciones visuales básicas, `npm run dev` de la PWA ya escucha en `0.0.0.0`; abrir `http://<IP-LAN>:5173/eco/index.html`. El proxy llega al backend loopback del ordenador. Comprobar firewall y aislamiento Wi-Fi si no conecta.
4. Para GPS, autenticación y PWA instalada, usar HTTPS confiable. No dar una prueba por válida ignorando advertencias TLS.

Desde `apps/ciudadano`, solo en un equipo sin certificados existentes:

```sh
npm run https:prepare -- <IP-LAN>
npm run https:check -- <IP-LAN>
npm run dev:https
```

Abrir `https://<IP-LAN>:5443/eco/index.html`. El script genera `.certs/localhost.key`, `.certs/localhost.pem` y una CA exclusiva; no instala confianza. Conserva certificados existentes y falla si ya los encuentra. Si cambia la IP, coordinar su renovación en lugar de sobrescribir archivos.

Transferir **solo** `.certs/ecotrack-ca.cer` al iPhone de prueba y habilitar su confianza siguiendo `apps/ciudadano/docs/VALIDACION-IPHONE.md`. Nunca compartir la clave privada ni la clave de CA. La configuración de orígenes y retornos de Clerk debe permitir el origen elegido; coordinar cambios de servicio con el responsable, no modificar producción para una prueba local.

Para el build con service worker:

```sh
npm run build
npm run preview:https
```

Abrir `https://<IP-LAN>:4443/eco/index.html` y agregar a inicio desde Safari. `https:check` comprueba los archivos y el host; la confianza del dispositivo se comprueba en el dispositivo. El frontend HTTPS sigue usando su proxy hacia el backend local; no se necesita exponer MongoDB al teléfono.

Si hace falta acceder directamente al dashboard desde la LAN, el CLI instalado admite `npm run dev -- --hostname 0.0.0.0`; la URL será `http://<IP-LAN>:3000/dashboard`. Esto no acredita autenticación/GPS seguros por HTTP en el teléfono.

## Servicios externos y Docker

- **Clerk:** autenticación, sesiones y metadatos; el backend verifica identidad y autorización. No crear otra instancia sin coordinación.
- **MongoDB/Mongoose:** perfiles, domicilios y demás datos municipales. Puede usarse una base de desarrollo autorizada. Atlas requiere conectividad y acceso configurado; no modificar sus reglas de producción durante el arranque.
- **Geoapify:** el backend consulta dirección inversa para un punto confirmado. La dirección es aproximada, con campos parciales y atribución; no constituye una asignación automática de ruta.
- **OpenFreeMap:** estilos/cartografía por defecto de la PWA, con atribución. No se cachean tiles ni APIs privadas por el service worker.
- **Servidor GPS separado:** previsto como fuente autorizada. La PWA aún declara `sinProveedor` para vehículos reales; los datos demo solo son una herramienta opt-in de desarrollo.

**Docker es opcional para el funcionamiento normal.** No hay Dockerfile ni Compose de arranque en este repo. Se utilizó un MongoDB aislado en Docker para integración real de fases 3.2.3/3.2.5. Los arneses `tests/integracion/*.cjs` están vinculados a un contenedor, base, ruta temporal y binario Docker de la máquina original; no son portables ni se ejecutan con `npm test`. Su reproducción requiere preparar y autorizar un entorno aislado equivalente. No ejecutarlos en Atlas ni presentarlos como parte de la instalación habitual.

## Estado funcional y validación

Implementado: autorización administrativa, sincronización ciudadana, aislamiento de reclamos por propietario, domicilio único con control de concurrencia, selector GPS/manual, mapa de rutas, tema claro/oscuro/automático, casa del domicilio persistido y dirección aproximada compartida entre confirmación, Cuenta y casa. El guardado no depende del resultado Geoapify. No hay historial de coordenadas en esta funcionalidad.

Resultados de la sesión de implementación: **118 pruebas PWA y 379 raíz aprobadas**, typechecks y builds correctos; prueba Chrome 3.5B con API/Clerk/cartografía simulados. No se repiten suites completas durante esta consolidación documental. Build PWA con aviso conocido de bundle >500 kB.

El usuario reportó **9/9 comprobaciones manuales aprobadas en Safari iOS** para fase 3.5. No se proporcionaron el desglose, versión de iOS ni URL; no se deduce validación de Geoapify en producción ni pruebas adicionales. Se conserva el detalle histórico en `docs/HANDOFF-FASE-3.5B.md`.

Pendiente: fuente real de vehículos para PWA, reportes ciudadanos completos en la interfaz, asignación automática del domicilio a rutas/cobertura, validación de toolchain/APK física y OAuth Android, y cualquier aceptación de producción no documentada. No presentar pantallas pendientes ni demo como operaciones reales.

Comandos de verificación disponibles (ejecutarlos cuando un cambio lo justifique):

```sh
# Raíz
npm test
npx tsc --noEmit --incremental false
npm run build

# PWA
cd apps/ciudadano
npm test
npm run typecheck
npm run build
node tests/fase35b-browser.mjs
```

No existe script `lint` en ninguno de los dos package.json. Las pruebas de navegador levantan servidores aislados y deben ejecutarse por separado si comparten puerto. No usar scripts de conciliación, promoción o prueba de conexión real como sustituto de las suites locales.

## Builds, Git y colaboración

Los builds (`.next`, `apps/ciudadano/dist`, `dist-android`) y `public/eco` son artefactos locales excluidos. `npm run stage:web`, desde la PWA, copia un build web a `public/eco`; no hace despliegue. Su uso y la distribución deben coordinarse fuera de esta consolidación. No se publica ningún servicio al hacer commits.

Crear ramas por tarea desde la base actualizada, hacer commits pequeños por responsabilidad y proponer pull requests a `main`. Revisar `git diff --cached` antes de cada commit. Añadir rutas explícitas al índice; evitar `git add .` cuando haya respaldos o datos locales. No forzar push ni reescribir historia compartida sin acuerdo. El remoto actual es `https://github.com/calavanda/Dashboard_V3.git`.

No versionar `.env*` salvo `.env.example`, claves/certificados privados, datos locales, respaldos, dependencias, cachés, capturas de pruebas ni archivos generados. La plantilla de respaldo vacía sí se incluye. `git rm --cached` de datos/cachés durante esta consolidación conserva las copias locales; no elimina versiones históricas.

Se encontraron credenciales incrustadas en tres scripts históricos y se retiraron del código actual. **Requieren rotación por los responsables de Clerk/MongoDB:** borrar el literal no revoca la credencial ni borra el historial. No se rotaron secretos ni se reescribió el historial en esta tarea. Los scripts operativos de conciliación/promoción pueden modificar cuentas o datos y requieren un objetivo revisado y autorización específica; no forman parte del arranque.

Graphify es una herramienta local de navegación, no una dependencia de runtime. Sus salidas/cachés se excluyen de la publicación por ser generadas y contener rutas del equipo. Si se necesita el grafo, generarlo localmente según `AGENTS.md`, comprobar su frescura y tomar el código como autoridad. No hace falta reconstruirlo para ejecutar la aplicación.
