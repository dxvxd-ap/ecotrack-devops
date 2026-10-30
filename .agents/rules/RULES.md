# REGLAS ESTRICTAS DE PROYECTO
1. **IDIOMA OBLIGATORIO:** Todo el código, variables, funciones, bases de datos (MongoDB), comentarios, commits y textos en la interfaz DEBEN estar en español. Cero excepciones. (Ej: usar `camion` no `truck`, `obtener_rutas()` no `getRoutes()`).
2. **PILA TECNOLÓGICA (WEB DASHBOARD):** 
   - Framework Principal: Next.js (Usando estricta y obligatoriamente el App Router `/app`).
   - Autenticación: Clerk (configurado vía middleware.ts).
   - Base de Datos: MongoDB Atlas (usando Mongoose).
   - UI: Once UI / componentes agregados vía CLI (Shadcn/jsrepo).
   - Estilos: Tailwind CSS.
3. **ARQUITECTURA DE USUARIOS (RBAC):**
   - Panel de Control (Dashboard): Solo accesible para `superadmin`, `admin`, `secretario`, `moderador`. El sistema debe permitir la creación dinámica de nuevos roles de dashboard.
   - Periféricos (Sin acceso al dashboard): `ciudadano`, `conductor`, `camion`.
   - Flujo de Registro Clerk: Cualquier registro externo por defecto es `ciudadano` y se bloquea su entrada al `/dashboard`. Un `admin` debe reasignar el rol manualmente en el panel para darle acceso.