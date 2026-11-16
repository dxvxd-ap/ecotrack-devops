# Fase 3.4.2 — contraste de autenticación Clerk

## Causa demostrada

La PWA instala **@clerk/react 6.18.8 (Core 3)**; no usa @clerk/clerk-react. Sus tipos locales (`node_modules/@clerk/react/dist/types-kUVwkmSn.d.mts`, Variables/Theme) admiten nombres actuales:

| Configuración anterior | Propiedad válida |
| --- | --- |
| colorText | colorForeground |
| colorTextSecondary | colorMutedForeground |
| colorInputBackground | colorInput |
| colorInputText | colorInputForeground |
| colorInputBorder | colorBorder |
| appearance.darkMode | No existe; seleccionar la apariencia según el tema efectivo |

El typecheck previo fallaba TS2353 en los dos formularios por `colorText`. La API aplica el fondo válido pero conserva colores predeterminados para tokens desconocidos. Con Clerk real, Chrome mostró etiquetas `rgb(33,33,38)` sobre fondo efectivo `[15,23,41]`, contraste **1,12:1**. OAuth utilizaba negro al 62%, también **1,12:1**; subtítulo/separador **1,06:1**. No era solo una percepción visual ni un GET 200.

`data-theme` sí cambiaba: el título heredado y fondo respondían, mientras los estilos internos de etiquetas/OAuth seguían oscuros. El neutral predeterminado negro también afectaba colores derivados. Añadir `darkMode` o repetir nombres desconocidos no establece un tema oscuro compatible.

**Las variables CSS sí están admitidas por Clerk**; no se demuestra que `var()` fuese por sí sola la causa en Safari. La documentación recomienda colores directos para máxima compatibilidad. Se usaron valores explícitos y nombres actuales. Fuentes oficiales: [variables](https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/variables), [appearance](https://clerk.com/docs/react/guides/customizing-clerk/appearance-prop/overview).

## Corrección

- Nuevo helper tipado con `satisfies` sobre la propiedad appearance de SignIn; paletas HEX claras/oscuras, tokens de primer plano, neutral, fondos/campos, secundario, bordes y error.
- SignIn y SignUp comparten la apariencia según `temaMapa`, que ya contiene el tema efectivo resuelto por la aplicación. Dos objetos estables; sin nuevas keys, reload, observadores DOM ni reinicialización del proveedor.
- Se eliminó de estos formularios el bloque `darkMode` y los tokens inválidos. Overrides locales mediante `appearance.elements`, con nombres oficiales, sin selectores generados ni CSS global.
- Los botones alternativos de EcoTrack bajo Clerk no pertenecen a appearance. Se reprodujo su contraste insuficiente **3,49:1** y se aplicó localmente el color primario del mismo helper: **12,57:1** en oscuro.
- No se modificaron main.tsx, el proveedor global, CSS, lógica de autenticación, backend, usuarios ni marcador de domicilio.

## Colores efectivos finales — Chrome, SDK real

| Elemento oscuro | Color efectivo | Fondo efectivo | Contraste |
| --- | --- | --- | --- |
| Etiquetas | rgb(226,232,240) | rgb(15,23,41) | 14,52:1 |
| Subtítulo/separador | rgb(203,213,225) | rgb(15,23,41) | 12,05:1 |
| Texto OAuth | color(srgb 0.886275 0.909804 0.941176 / 0.62) | rgb(15,23,41) | 6,20:1 |
| Campos | rgb(248,250,252) | rgb(10,15,26) | 18,31:1 |
| Error de campo SignIn | rgb(252,165,165) | rgb(15,23,41) | 9,43:1 |
| Enlace interno Clerk | rgb(110,231,183) | rgb(30,41,59) | 9,60:1 |
| Botón principal heredado/legible | rgb(255,255,255) | rgb(4,120,87) | 5,48:1 |
| Acceso alternativo EcoTrack | rgb(110,231,183) | rgb(10,15,26) | 12,57:1 |

El botón principal conserva la clase primaria heredada del proveedor; se registra su resultado real, no se presume que cada valor configurado venza la cascada. En claro se midieron etiquetas/campos 17,85:1, secundarios 7,58:1 y error SignIn 6,47:1. El mínimo entre todas las filas registradas fue **4,91:1** (OAuth claro en hover). Se compusieron colores alfa sobre fondos ancestrales; no se certifican todas las posibles pantallas posteriores de Clerk.

## Assets y Service Worker

El SW existente precachea el HTML/assets y usa actualización con aviso (`registerType: prompt`). Una instalación antigua puede mantener el shell anterior hasta aceptar la actualización; esto es una posibilidad, no la causa demostrada en el iPhone. No se cambió el SW ni se borraron cachés del usuario.

Preview del build final, con SW permitido y contexto nuevo de Chrome: HTML y precaché incluyeron **`/eco/assets/index-BkH1BU2J.js`**; SW activo, página controlada y 32 entradas de caché observadas. Tras navegar bajo su control se volvió a medir SignIn oscuro con resultados correctos. Esto verifica el artefacto local actual, **no qué bundle está sirviendo la instalación de Safari del usuario**. No se desplegó ni copió a otro directorio; salida en `apps/ciudadano/dist`.

En Safari/iOS queda verificar el origen exacto, aceptar “Nueva versión disponible · Actualizar” si aparece y comprobar desde inspector remoto que carga el bundle citado o un build posterior. No se puede declarar resuelto en ese dispositivo hasta verlo. No asumir que recargar una pestaña actualiza también una PWA instalada.

## Archivos y pruebas

Producción:
- `apps/ciudadano/src/app/apariencia-clerk.ts` (nuevo).
- `apps/ciudadano/src/app/Cuenta.tsx`: únicamente import, selección de apariencia, props SignIn/SignUp y color de los dos accesos alternativos.

Regresión:
- `apps/ciudadano/tests/apariencia-clerk.test.ts`: paletas, colores directos y contraste de pares.
- `apps/ciudadano/tests/clerk-contraste-browser.mjs`: SDK real; 4 combinaciones formulario/tema, hover OAuth, error SignIn claro/oscuro, enlaces externos y nodos conservados; modo preview con SW.
- `apps/ciudadano/tests/cuenta.test.mjs`: carga el helper real en el arnés SSR.

Resultados desde `apps/ciudadano`:
- `npm test`: **100/100 pasan**.
- `npm run build`: typecheck y build PWA correctos; permanece aviso de bundle >500 kB, fuera del alcance.
- `node tests/clerk-contraste-browser.mjs`: pasó con SDK real.
- `node tests/clerk-contraste-browser.mjs --preview`: pasó con build final y SW; 9 estados de medición registrados.
- `git diff --check`: correcto. Revisión independiente limitada al cambio: sin hallazgos importantes.

Evidencia: `apps/ciudadano/artifacts/clerk-contraste.json`, `clerk-assets.json`, `clerk-signin-dark-preview.png` y `clerk-signup-dark.png`.

Limitaciones: no Safari físico, OAuth ni autenticación real; error SignIn provocado con respuesta interceptada, sin enviar datos de prueba a Clerk. Un intento de inducir error SignUp con fixture no produjo mensaje dentro del timeout; **no se afirma validación del estado de error de SignUp**. La prueba final solo renderiza SignUp y comprueba claro/oscuro/hover, sin enviar registro. Las rutas de intento de acceso/registro están interceptadas. Sin nuevas dependencias, conciliaciones, cambios de Atlas/usuarios, commits ni modificaciones del marcador.
