# EcoTrack Ciudadano

Actualización 16/11/2026: fase 3.5 integrada; el usuario reportó 9/9 comprobaciones manuales aprobadas en Safari iOS. Para arrancar y colaborar, usar la [guía actual del equipo](../../docs/GUIA-EQUIPO-ECOTRACK.md) y el [handoff 3.5B](../../docs/HANDOFF-FASE-3.5B.md). Los apartados de entregas anteriores que siguen documentan su estado histórico; no acreditan validación en producción.

Estado: build web/PWA y build de assets Android comprobados. Cartografía OpenFreeMap, rutas seleccionables y panel compacto implementados. La primera interfaz fue validada por el usuario en Safari iPhone; la segunda entrega requiere repetir la comprobación física. Resultados: [docs/ENTREGA-2.md](docs/ENTREGA-2.md). El registro histórico de preparación está en [docs/FASE-1.md](docs/FASE-1.md).

## Requisitos

Node >=22.18, acceso al registro npm y un proveedor de mapa autorizado para mostrar calles. La aplicación no copia claves de otros proyectos ni crea otra instancia Clerk. Todas las variables `VITE_*` se incorporan al cliente: nunca introducir secretos.

## Navegador

```sh
cd /Users/baldo/Documents/INTEGRADORA/Dashboard_V3/apps/ciudadano
npm install
[ -e .env.local ] || cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:5173/eco/index.html`. `.env.local` se crea una vez, sin sobrescribir configuraciones existentes. Configurar únicamente los valores públicos necesarios:

- `VITE_MAP_STYLE_URL`: estilo HTTPS alternativo de un proveedor autorizado. Vacío utiliza OpenFreeMap Liberty con atribuciones visibles; no necesita clave.
- `VITE_CLERK_PUBLISHABLE_KEY`: clave pública de la instancia existente, con origen/retornos autorizados. Sin ella se puede explorar y la cuenta indica pendiente. No se ha probado login real.
- `VITE_DEV_API_ORIGIN`: proxy de desarrollo y preview al backend existente. Vacío usa `http://127.0.0.1:3000`. Configurar el origen realmente activo; no iniciar otro backend sobre un servicio existente. Solo se permite HTTP para localhost y HTTPS para hosts remotos.
- `VITE_API_ORIGIN`: vacío para PWA del mismo origen. Para Android y API real se requiere un origen HTTPS absoluto; todavía deben validarse CORS y sesión en APK.

Las rutas se consultan automáticamente con GET `/api/rutas`. Abre el panel inferior de Inicio para seleccionar y consultar detalles. En producción/PWA y APK no se muestra ningún control de demostración. Para desarrollo local, habilitar explícitamente `VITE_ENABLE_DEV_TOOLS=true` con `npm run dev` o `npm run dev:https`; incluso así, la aplicación abre con rutas reales y requiere pulsar **Ver demostración**. Salir de demo hace otro GET y retira todos los datos simulados. Un error de API nunca activa demo.

## Verificación

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
```

La prueba de navegador usa Google Chrome ya instalado en macOS. En otro equipo indicar `CHROME_BIN`. La preview es un proceso de prueba propio; no modifica el servidor existente. Para observar manualmente el build: `npm run preview`, abrir `http://localhost:4173/`. Para probar la salida bajo el prefijo, ejecutar `npm run build:eco` y `npm run preview:eco`. Service worker desactivado en desarrollo; comprobarlo en preview/build.

La prueba de navegador intercepta la API con fixtures explícitos. Para ejecutarla sin red cartográfica se puede usar `ECOTRACK_SMOKE_FIXTURES=1 npm run test:browser`: en ese modo el fondo es un fixture, nunca acredita calles reales. En esta sesión el servidor de preview no pudo abrirse por `EPERM`; no se afirma que la prueba visual haya pasado.

Con `ECOTRACK_SMOKE_DEV=1` el smoke inicia un servidor de desarrollo aislado en 4173, habilita la herramienta demo para esa prueba y comprueba salida a un GET nuevo; sin esa variable, comprueba que producción no expone la herramienta. No usa el servidor del usuario en 5173.

## HTTPS local e iPhone

Ya hay certificados de desarrollo en `.certs/` para `192.168.1.69`, localhost y loopback. No se instaló confianza en ningún dispositivo. No compartir claves; transferir únicamente `.certs/ecotrack-ca.cer` al iPhone por AirDrop y seguir [los pasos de confianza de Apple](https://support.apple.com/es-lamr/102390).

El usuario reportó posteriormente advertencia de certificado o «No seguro». **La confianza en Safari sigue pendiente de corregir**, aunque el servidor responda. Ejecutar `npm run https:check -- 192.168.1.69` comprueba firma, vigencia y host de los archivos locales; no comprueba la confianza del iPhone. Protocolo y hoja de resultados: [docs/VALIDACION-IPHONE.md](docs/VALIDACION-IPHONE.md).

1. Instalar el certificado en Ajustes → General → VPN y administración de dispositivos (o el perfil descargado).
2. En General → Información → Config. certificados de confianza, habilitar confianza para **EcoTrack desarrollo local**. Solo desarrollo, en un dispositivo autorizado.
3. Con Mac y iPhone en la misma Wi-Fi y el backend realmente accesible, ejecutar:

```sh
npm run build:eco
npm run preview:https
```

4. Abrir `https://192.168.1.69:4443/eco/index.html` en Safari, sin ignorar advertencias de certificado. Comprobar GPS con el botón de ubicación y luego Compartir → Agregar a inicio.

Para desarrollo con recarga: `npm run dev:https`, URL `https://192.168.1.69:5443/eco/index.html`. Usar **preview** para comprobar el service worker/PWA. Estas pruebas físicas aún están pendientes.

En otra Mac, la primera generación es `npm run https:prepare -- <IP-LAN>`. No ejecutarlo sobre certificados existentes: el script se detiene para conservarlos. Si cambia la IP actual, hay que preparar otro certificado con SAN correcto, conservando los anteriores; no continuar con advertencias TLS. Las claves están ignoradas por Git y bloqueadas por el servidor Vite, al igual que `.env` y `.git`.

## Vercel independiente

1. En tu cuenta de Vercel, importa el repositorio y selecciona la rama autorizada que contenga estos cambios.
2. Configura **Root Directory** como `apps/ciudadano` y habilita **Include source files outside of the Root Directory** para incluir los tipos compartidos del monorepo.
3. Usa el preset **Vite** y Node.js **22.x** (22.18 o posterior). `vercel.json` fija `npm ci`, `npm run build` y salida `dist`. El rewrite publica la API bajo el mismo origen de la PWA.
4. Configura las variables públicas descritas abajo. Antes de habilitar acceso ciudadano, confirma el dominio definitivo y los retornos con la persona administradora de la instancia Clerk del backend.
5. Cuando se autorice publicar, pulsa **Deploy**. La URL del despliegue aparece en **Deployments** y el dominio estable en **Domains**. Comprueba primero `/`, el manifest, `/sw.js` y una lectura no mutante como `GET /api/rutas`. Valida el acceso Clerk solo con una cuenta autorizada para pruebas.

| Variable | Valor en Vercel |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clave **pública** de la misma instancia y entorno Clerk que valida el backend. Requerida para iniciar sesión. |
| `VITE_API_ORIGIN` | Omitir o dejar vacía. La PWA llama a rutas relativas `/api/…`. |
| `VITE_CLERK_SATELLITE_DOMAIN` | Opcional. Nombre de host sin esquema, solo si el dominio ya está configurado como satélite de esa instancia. |
| `VITE_CLERK_SIGN_IN_URL`, `VITE_CLERK_SIGN_UP_URL` | Solo para el modo satélite cuando la configuración de Clerk las requiere. URLs HTTPS de acceso y registro en el sitio primario. |
| `VITE_MAP_STYLE_URL` | Opcional. URL HTTPS pública del estilo cartográfico. Omitir para OpenFreeMap. |

No crear una segunda instancia Clerk. El dominio de la PWA debe estar admitido por la instancia existente y su configuración de redirecciones. Si necesita un satélite en producción, coordina dominio propio, DNS y retornos con la administración de Clerk antes de publicar. Autoriza el origen HTTPS definitivo y el retorno a `/`. Las URL Preview solo pueden usar login si también están admitidas. No configurar claves secretas, URI de MongoDB, `VITE_DEV_API_ORIGIN` ni `VITE_ENABLE_DEV_TOOLS` en Vercel.

La aplicación usa pestañas internas y Clerk con navegación por hash. El hosting sirve `/` y archivos estáticos; no hay catch-all. El service worker solo aplica fallback a `/` o `/index.html`. Las solicitudes API y Clerk no se almacenan en Workbox. Ejecuta `npm run test:vercel` para comprobar el build de prueba, proxy local y actualización del service worker con dobles. Eso no verifica la red de Vercel ni la instancia Clerk real.

## Publicación prevista bajo /eco/

```sh
npm run build:eco
npm run stage:web
```

`stage:web` copia solo un build web válido a `Dashboard_V3/public/eco`, protege archivos ajenos y no elimina assets anteriores. No despliega. El Next existente redirige `/eco` a `/eco/index.html`; el ámbito del manifest/service worker es `/eco/`. Mantener este ámbito separado del dashboard. No cachear respuestas privadas, Clerk ni tiles sin licencia. No se publicó ni se copió el build al dashboard en esta entrega.

En iPhone, una vez publicado en un host HTTPS confiable: abrir `https://<host>/eco/index.html` en Safari → Compartir → Agregar a inicio. Una IP LAN por HTTP permite algunas comprobaciones visuales, pero **no acredita PWA instalable ni GPS seguro**. No hay URL HTTPS publicada por esta entrega.

## Android previsto

```sh
npm run build:android
./node_modules/.bin/cap add android
./node_modules/.bin/cap sync android
npm run android:open
```

Ejecutar `cap add android` solo cuando no exista la carpeta `android/`. El build Android usa la misma interfaz con base `/`, salida `dist-android`, sin service worker. Identificador: `com.ecotrack.ciudadano`.

**Pendiente:** generar el proyecto, verificar toolchain JDK/Gradle/SDK, configurar permisos de Internet/ubicación bajo demanda, iconos/splash del proyecto nativo y compilar/instalar una APK física. No hay un APK producido. No se implementa rastreo continuo del teléfono. El inicio OAuth Android se mantiene bloqueado en UI hasta validar un flujo seguro con navegador de sistema y callback; la PWA web utiliza el SDK React de Clerk.

## Próximas entregas

Perfil municipal validado en backend, domicilio, reportes reales, fuente de vehículos autorizada, navegación con historial/back y pruebas físicas. Las pantallas pendientes lo indican y no presentan operaciones simuladas como escrituras municipales.
