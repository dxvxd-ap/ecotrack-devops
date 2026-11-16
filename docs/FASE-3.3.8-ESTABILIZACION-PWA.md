# Fase 3.3.8 — estabilización ciudadana

Fecha: 15 de noviembre de 2026. Cambios locales; sin publicación ni commits.

## Causas y correcciones

| Área | Evidencia | Corrección |
| --- | --- | --- |
| Acceso sin configuración | `main.tsx` omitía ClerkProvider sin clave, pero Cuenta invocaba useUser/useAuth antes de comprobar `configurada`. El SDK requiere proveedor. | Separar cuenta pública y componente con contexto Clerk. |
| Arranque con almacenamiento bloqueado | Una prueba de navegador bloqueando localStorage dejó el arranque en blanco; las lecturas del tema ocurrían antes de React y fuera de ErrorAplicacion. | Preferencia opcional protegida con try/catch; sin almacenamiento se abre el mapa y el aviso de acceso pendiente. |
| Diagnóstico del mensaje genérico | ErrorAplicacion atrapaba cualquier fallo de descendientes y afirmaba que no había sesión privada. Esa frase no identificaba el origen ni comprobaba sesión. | Mensaje que no afirma estado de autenticación y diagnóstico de categoría, conectividad y contexto seguro; sin mensajes, stacks, URLs ni tokens. |
| Sincronización repetida | Chrome reprodujo 3 POST al abrir Cuenta: solo se bloqueaba tras completar; cambios de referencia y StrictMode podían iniciar solicitudes simultáneas. | Bloqueo desde antes de pedir token; sincronización una vez por sesión; timeout que cancela fetch, sin aceptar éxito tardío. |
| Reintento sin efecto | Se cambiaba syncEstado a idle, pero el efecto que inicia sync no dependía de ese estado. | Reintento llama la operación deduplicada. |
| Pestañas y usuarios | Cuenta ya permanecía montada, pero nunca se ocultaba. Sus refs no se reiniciaban ante un cambio directo A → B. | Contenedor hidden al salir; componente privado identificado por userId y sessionId. Perfil/domicilio solo en memoria. |
| Revalidación | Se necesitaba conservar datos conocidos durante GET y evitar que respuestas antiguas restaurasen versiones anteriores a un PUT. | Lectura inicial y revalidación comparten exclusión/secuencia; GET al recuperar conexión o visibilidad, sin otro POST de perfil; interfaz con dato conocido sigue visible. Errores siguen mostrándose. |
| Botones invisibles | `--eco-verde` se referenciaba sin definición. Estilo computado de “Cambiar domicilio”: fondo rgba(0,0,0,0), texto blanco. | Definir verde #047857 y hover #065f46: contraste blanco aproximado 5.48:1 y 7.68:1. Comprobados colores computados claros/oscuros, hover, activo y deshabilitado. |
| Cancelar bloqueado por CSS | Al forzar 503, Playwright detectó que `.selector-aviso` interceptaba los clics sobre Cancelar. La posición absoluta del aviso cartográfico se aplicaba también al aviso del panel. | Limitar posición absoluta a `.selector-mapa-contenedor > .selector-aviso`. El aviso del panel fluye junto a los botones. |
| Selector interrumpe aplicación | Typecheck previo falló TS2551: `Map.setInteractive` no existe en MapLibre instalado; su invocación también falla en ejecución. | Activar/desactivar handlers públicos de interacción. |
| Punto confirmado | Ya existía snapshot al revisar y se conservó. Había una reasignación de centroRef en cada render y actualizaciones desde props/GPS que podían interferir. | Conservar ref del centro editado, no incorporar props/GPS en revisión, impedir revisión durante GPS/movimiento y doble confirmación. |
| Falso guardado exitoso | Cuenta absorbía errores de escritura; selector interpretaba la promesa resuelta como éxito. Token nulo y escritura ocupada también podían resolver sin escribir. | Propagar fallos y rechazar esos casos; impedir reabrir edición mientras termina una escritura cancelada en UI. Un 503 conserva incertidumbre, sin repetir automáticamente POST/PUT. |

## Archivos intervenidos

- `apps/ciudadano/src/main.tsx`: arranque y diagnóstico sin datos privados.
- `apps/ciudadano/src/app/App.tsx`: visibilidad de Cuenta sin desmontarla.
- `apps/ciudadano/src/app/Cuenta.tsx`: aislamiento de sesión, sincronización, revalidación y resultados de escritura.
- `apps/ciudadano/src/app/SeleccionarDomicilio.tsx`: interacción MapLibre y protección del punto revisado.
- `apps/ciudadano/src/servicios/autenticacion.ts`: señal opcional de cancelación; mismo contrato HTTP.
- `apps/ciudadano/src/styles.css`: variables faltantes y posición del aviso.
- `apps/ciudadano/tests/cuenta.test.mjs`: regresión sin proveedor.
- `apps/ciudadano/tests/fixtures/clerk.tsx`: frontera Clerk simulada para navegador.
- `apps/ciudadano/tests/estabilizacion-browser.mjs`: regresiones sobre componentes, efectos, CSS, mapa y servicios reales con API interceptada.
- `apps/ciudadano/tests/diagnostico-arranque.mjs`: arranque con SDK real, sin login ni API municipal real.

## Verificación

Desde `apps/ciudadano`:

- `npm test`: 93/93 pasan.
- `npm run build`: typecheck y build Vite/PWA correctos; aviso de chunk JS mayor de 500 kB pendiente, fuera de este ajuste.
- `node tests/estabilizacion-browser.mjs`: 18 comprobaciones pasan en Chrome. Incluyen StrictMode, pestañas, cambio de usuario, reintento, CSS computado, congelación del punto, corrección en mapa, cuerpos exactos de POST/PUT, GET retenido que termina después de PUT, 503, token nulo, cancelar escritura pendiente, revalidación y cierre de sesión.
- `node tests/diagnostico-arranque.mjs`: SDK Clerk real presenta formulario sin errores en Chrome nuevo/sin cookies previas. No inicia sesión.
- `node tests/diagnostico-arranque.mjs --sin-clave --sin-almacen`: sin error de arranque, acceso pendiente visible, sin formulario Clerk.
- `npm run https:check -- 192.168.1.69`: certificado local válido para ese host, hasta febrero de 2027; no demuestra confianza instalada en iOS.

En la raíz también pasó `./node_modules/.bin/tsc --noEmit --incremental false`. No se ejecutó build Next ni se inició otro Next sobre `.next`. Las pruebas de navegador usan Vite aislado en 4188, `strictPort`, y cierran su proceso; requieren permiso para abrir puerto/Chrome. Dependencias existentes, sin instalaciones.

## Límites y seguimiento de Safari

La clave pública local está presente y tiene formato válido; la API de producción usa mismo origen. Eso no acredita que la clave corresponda a la identidad esperada, OAuth, obtención de token o aceptación de este por la API. La comprobación real abrió solamente el formulario de acceso.

**No se reprodujo el mensaje original de Safari con la configuración actual. No se atribuye a una causa única ni se declara resuelta toda la autenticación en iOS.** Se corrigieron caminos demostrables de fallo, incluido un error de mapa que podía activar la misma barrera genérica. Sigue pendiente verificar en Safari físico/PWA instalada la secuencia Clerk cargado → login → getToken → POST sincronizar → GET domicilio, con confianza TLS y conectividad reales. Un GET 200 de rutas no prueba esa secuencia.

Si reaparece, capturar con inspector remoto la primera excepción y solicitudes fallidas, distinguiendo fallo de SDK, token, TLS/red y renderizado. El diagnóstico nuevo registra solo categoría/contexto, nunca credenciales ni datos del domicilio. No publicar HAR/cookies/cabeceras de autorización.

No se ejecutaron conciliaciones ni escrituras reales en Atlas, no se modificaron identidades, APIs ni dependencias. Se integraron correcciones sobre los archivos existentes de OpenCode; los demás cambios preexistentes se conservaron. No se copió el build a `public/eco` ni se desplegó: el resultado está en `apps/ciudadano/dist`.
