# EcoRuta - Sistema Integral de Gestión Logística y Rutas de Residuos

Plataforma gubernamental y operativa para la administración de rutas de recolección de basura urbana, asignación temporal de camiones, monitoreo satelital en tiempo real y disparo de notificaciones push de proximidad al ciudadano.

---

## 1. Cumplimiento de Reglas Estrictas del Proyecto (`RULES.md`)

1. **Idioma Obligatorio:** Cero excepciones. Todo el código, nombres de funciones, variables, esquemas Mongoose de MongoDB Atlas, rutas de API y textos de interfaz de usuario están 100% en español.
2. **Pila Tecnológica:**
   - **Framework:** Next.js con el App Router (`/app`).
   - **Autenticación:** Clerk (gestionado mediante `src/middleware.ts`).
   - **Base de Datos:** MongoDB Atlas con Mongoose (`ClusterEcoRuta`).
   - **Estilos e Interfaz:** Tailwind CSS con estética utilitaria de alta densidad (`DESING.md`).
3. **Control de Acceso Basado en Roles (RBAC):**
   - **Acceso a `/dashboard`:** Restringido a `superadmin`, `admin`, `secretario`, `moderador` y roles dinámicos de dashboard.
   - **Periféricos:** `ciudadano`, `conductor`, `camion` (sin acceso a `/dashboard`).
   - **Flujo de Registro Externo:** Todo usuario registrado por Clerk recibe automáticamente el rol `ciudadano`. Solo un administrador puede promover su rol dentro del panel.

---

## 2. Módulos y Habilidades Implementadas (`.agents/skills`)

- **Trazado de Rutas (`gestion-rutas`):**
  - Mapa interactivo Leaflet de alto contraste.
  - Trazado calle por calle con edición de vértices.
  - Almacenamiento en colección `rutas` en formato GeoJSON (`LineString`).
  - Relación estricta: 1 Camión -> 1 Conductor; 1 Camión -> Múltiples Rutas.
- **Calendario Logístico (`calendario-logistica`):**
  - Planificador de turnos por fecha.
  - Asignación de `Camión` + `Ruta` + `Hora Entrada` + `Hora Salida`.
  - Transición de estados: `programado` -> `en_progreso` -> `completado`.
- **Alertas al Ciudadano (`alertas-ciudadano`):**
  - Portal ciudadano (`/ciudadano`) para suscripción de domicilio con coordenadas y radio de cobertura.
  - Motor de proximidad Haversine que calcula la cercanía del camión en ruta y dispara la notificación push: *"El camión de basura está cerca de tu zona o está a punto de pasar"*.
- **Hero Scroll-Driven (`text.txt`):**
  - Video scrubbed sincronizado con `requestAnimationFrame` al desplazarse en la página de inicio (`/`).
  - Letras gigantes *"NUESTROS SERVICIOS"* en Anton con `mix-blend-mode: darken` detrás del camión.
  - Tira horizontal con tarjetas de servicio con efecto de gradiente cobalto (`#2f63ff`) a blanco.
  - Velocímetro con lectura en tiempo real en mono (`NN KM/H`).

---

## 3. Comandos de Ejecución

```bash
# Modo desarrollo
npm run dev

# Compilación de producción
npm run build

# Servidor de producción
npm start
```

