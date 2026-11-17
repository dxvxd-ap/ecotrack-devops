# Validación ciudadana: rutas, confianza HTTPS, GPS y PWA

Fecha: 14 de noviembre de 2026. No se continúa con autenticación, domicilio ni reportes en este ajuste.

## Evidencia disponible y límites

El usuario confirmó en Safari/iPhone: calles de OpenFreeMap, `/api/rutas` HTTP 200, una ruta municipal morada con flechas, panel compacto correcto, demo verde claramente identificada y servidor HTTPS accesible. Es evidencia física reportada por el usuario; no se atribuye a automatización.

**Resultado nuevo reportado por el usuario: aparece advertencia de certificado o «No seguro».** No está acreditada la confianza del iPhone y no se dan por aprobadas geolocalización ni instalación PWA. Que el servidor responda por HTTPS no basta.

## Cambios pequeños realizados

- Rutas reales al iniciar y tras recargar; sin persistencia del modo demo.
- Control demo oculto de la interfaz ciudadana normal. Solo disponible con desarrollo web **y** `VITE_ENABLE_DEV_TOOLS=true`; producción, PWA y build Android lo deshabilitan incluso si se deja la variable activada. No es una función protegida por roles ni contiene datos privados: es una herramienta local de visualización.
- Salir de demo consulta de nuevo `/api/rutas`. Se guarda la procedencia junto a rutas/vehículos y no se dibuja un snapshot de otra fuente ni siquiera en el render anterior a los efectos. Respuestas canceladas no se aplican.
- GPS bajo demanda solicita una lectura sin caché (`maximumAge: 0`). El marcador utiliza esa lectura validada; el panel expandido informa hora y precisión aproximada para poder registrar la prueba. Posición y metadatos permanecen en memoria: no se guardan ni se envían a la API.
- `npm run https:check -- <IP>` revisa firma de la CA y del certificado, fechas y correspondencia del nombre/IP. Solo lee certificados públicos, no las claves. No instala confianza ni cambia certificados.

## Sentido de las flechas

Las geometrías conservan el orden `[longitud, latitud]` recibido; no se ordenan, invierten ni conectan partes independientes de MultiLineString. El sprite apunta hacia su eje X positivo; MapLibre lo alinea con la línea mediante `symbol-placement: line`, `icon-rotation-alignment: map` e `icon-keep-upright: false`, evitando invertirlo para mantenerlo visualmente derecho. [Especificación MapLibre](https://maplibre.org/maplibre-style-spec/layers/).

Se probaron secuencias este/oeste/norte/sur, inversión y partes separadas, además de la orientación del sprite. Estas pruebas verifican el contrato y los datos, no sustituyen observar la rotación final en GPU. El usuario ya vio flechas sobre la ruta municipal; confirmar su orientación punto a punto sigue siendo una comprobación física. **No implica que el orden de ese GeoJSON certifique el sentido vial legal o la planificación aprobada del servicio.**

Para contrastar una ruta real: tomar dos coordenadas consecutivas reconocibles del GET y comprobar que la punta apunta de la primera hacia la segunda. Repetir en un tramo de regreso y al girar el mapa. En MultiLineString, revisar cada parte por separado; no debe haber flechas entre partes.

## 1. Resolver la advertencia HTTPS primero

1. Confirmar que Safari abre exactamente `https://192.168.1.69:4443/eco/index.html` para preview, o puerto 5443 para desarrollo. HTTP, otro nombre/IP o una red distinta no están cubiertos por esa comprobación.
2. En el Mac, desde `Dashboard_V3/apps/ciudadano`:

```sh
npm run https:check -- 192.168.1.69
```

El certificado local se verificó con salida correcta y vence el **12 de febrero de 2027**. La huella pública de su CA es:

```text
D0:71:12:F3:5B:9F:E1:70:45:30:54:4A:67:C5:21:EA:B6:36:85:89:4D:94:6E:C2:4D:72:D5:EE:FB:5A:C8:00
```

3. Transferir **solo** `.certs/ecotrack-ca.cer` por AirDrop al iPhone. Instalar el perfil de **EcoTrack desarrollo local** en Configuración → General → VPN y administración de dispositivos/perfil descargado. No transferir claves ni instalar perfiles ajenos.
4. Habilitar confianza explícita en Configuración → General → Información → Config. certificados de confianza. Instalar el perfil no activa automáticamente confianza TLS. Si había otra CA con el mismo nombre, contrastar que sea la actual. [Instrucciones de Apple](https://support.apple.com/es-lamr/102390).
5. Cerrar y volver a abrir Safari y el enlace. No continuar pasando por alto una advertencia. El indicador gráfico depende de la versión de Safari: no exigir un icono de candado concreto; exigir ausencia de advertencia/«No seguro», dirección correcta y contexto seguro.
6. Si persiste, comprobar el certificado que sirve el proceso activo, sin desactivar verificación:

```sh
curl --cacert .certs/ca.pem --head https://192.168.1.69:4443/eco/index.html
```

Este último comando queda para ejecución en una terminal con acceso al servidor. No se ha acreditado su resultado en esta sesión. Si falla, revisar dirección, certificado servido o conectividad; no usar `-k` ni cambiar el cliente para omitir TLS. El checker revisa archivos locales y no sustituye esta conexión ni la confianza instalada en Safari.

## 2. Preparar la versión ciudadana de prueba

Usar la misma Wi-Fi y el backend realmente activo. La preview proxy de `/api` usa `VITE_DEV_API_ORIGIN` o `http://127.0.0.1:3000`. No levantar servicios duplicados sobre puertos ocupados.

```sh
cd /Users/baldo/Documents/INTEGRADORA/Dashboard_V3/apps/ciudadano
npm run build
npm run preview:https
```

Abrir el enlace 4443. No debe aparecer Ver demostración ni Salir de demo. Una build anterior puede seguir en una pestaña o app instalada: aceptar el aviso de nueva versión y recargar. Si la página fue instalada antes, cerrarla y abrirla nuevamente para verificar la versión actual, sin borrar datos arbitrariamente.

Para probar la herramienta demo exclusivamente en desarrollo, sin alterar archivos de configuración existentes:

```sh
VITE_ENABLE_DEV_TOOLS=true npm run dev:https
```

En puerto 5443: la carga inicial sigue siendo real. Expandir panel → Ver demostración → comprobar etiqueta y recorrido simulado → Salir de demo → comprobar otro GET y recuperación de ruta morada. Si el backend falla al volver, debe quedar el error y no el recorrido verde bajo rótulos reales. No usar este servidor de desarrollo para acreditar instalación/offline del service worker.

## 3. Prueba GPS real

Precondición: confianza TLS resuelta. Solo GPS bajo demanda, sin tracking continuo.

1. Anotar modelo/iOS, hora y URL. Antes de pulsar ubicación, comprobar que no se muestra un punto ciudadano fijo por defecto.
2. Pulsar Obtener mi ubicación y conceder permiso. Expandir panel: registrar la hora de lectura, precisión ±m y que el marcador azul corresponde aproximadamente a la ubicación física dentro de ese margen. No confundirlo con la geometría de ruta ni un vehículo.
3. Solicitar una segunda lectura; la hora debe actualizarse. Si cambia la posición física, comparar el marcador teniendo en cuenta precisión, permiso de ubicación exacta y condiciones del dispositivo. Precisión insuficiente se registra como prueba inconclusa, no como éxito inventado.
4. Comprobar permiso denegado: debe aparecer aviso y seguir permitiendo consultar rutas. Una lectura anterior puede permanecer con su hora anterior; no debe contarse como lectura nueva.
5. Registrar resultado en la tabla inferior. No publicar coordenadas o capturas que revelen un domicilio privado; basta indicar correspondencia y precisión.

## 4. Prueba PWA instalada

1. Con el build servido por HTTPS confiable, en Safari usar Compartir → Agregar a inicio. Si existe la opción Abrir como app web, activarla. [Guía de Apple](https://support.apple.com/es-mx/guide/iphone/iphea86e5236/ios).
2. Abrir desde el icono EcoTrack, no desde la pestaña de Safari. Comprobar icono/nombre, navegación propia y carga de las rutas reales, sin controles demo.
3. Repetir GPS en la app instalada: el permiso puede requerir otra comprobación; no asumir que hereda la prueba de la pestaña.
4. Volver a abrir la app tras cerrarla. Probar carga del shell sin conexión solo después de una carga completa con red. Cartografía y rutas recientes pueden no estar disponibles offline; no se ofrecen posiciones en vivo ni se inventa éxito.

Opcional con Inspector Web de Safari del Mac conectado al iPhone: ejecutar esta lectura y registrar su resultado, sin solicitar GPS ni exponer coordenadas:

```js
(async () => ({
  protocolo: location.protocol,
  contextoSeguro: window.isSecureContext,
  instalada: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  controladorSW: navigator.serviceWorker?.controller?.scriptURL || null,
  registrosSW: navigator.serviceWorker
    ? (await navigator.serviceWorker.getRegistrations()).map(r => ({ scope: r.scope, estado: r.active?.state || null }))
    : [],
}))()
```

Criterios: protocolo HTTPS, contexto seguro verdadero, `instalada` verdadero al abrir desde el icono, SW activado en ámbito `/eco/`. En la primera carga puede no haber controlador hasta volver a abrir/recargar; documentarlo. Esta lectura no puede inspeccionar ni activar la confianza de certificados del sistema.

## Registro de aceptación física — pendiente de completar

| Punto | Estado actual / resultado por registrar |
|---|---|
| Calles, ruta morada, flechas, panel y HTTPS accesible | Confirmado por el usuario antes de este ajuste |
| Advertencia TLS resuelta | **Bloqueado:** el usuario reporta advertencia/«No seguro» |
| Demo ausente en versión ciudadana actual | Pendiente en iPhone; gate automático probado |
| Desarrollo: real → demo → real, GET nuevo | Probado con transporte controlado; comprobación física pendiente |
| Sentido de flechas en tramo real e invertido | Conservación de orden probada; contraste visual pendiente |
| GPS real con hora/precisión | Pendiente |
| Permiso denegado sin bloquear rutas | Pendiente físico |
| PWA desde icono y modo standalone | Pendiente |
| SW `/eco/` activo y recarga | Pendiente |

Completar por prueba: fecha/hora, modelo, iOS, URL/puerto, resultado y evidencia sin datos privados. No marcar GPS ni PWA como terminados por el solo hecho de tener un build correcto.

## Resultados de esta ejecución

- Cliente: 26 pruebas aprobadas y typecheck correcto. Pruebas de datos demo→API, errores, no mezcla de snapshots, orientación/orden, lectura GPS validada y certificados.
- Build web/PWA y de assets Android comprobados; sin APK nueva. Se conserva el aviso de bundle grande como deuda existente.
- Browser smoke preparado para producción sin demo y desarrollo opt-in; no se pudo iniciar preview desde este entorno. No se acredita ejecución visual automatizada.
- No se modificaron React Native, GPS, endpoints del backend, certificados existentes ni trust stores. Sin dependencias nuevas, push, merge o commits.
