# AGENTS.md - Dashboard_V3

## Dashboard Web EcoTrack (Next.js)

**Rol:** Panel de administración + API + vista conductores  
**Stack:** Next.js 15.2.1, React 19, TypeScript, Clerk Auth, MongoDB/Mongoose, Tailwind CSS, Leaflet  
**Grafo:** `graphify-out/graph.json` → `graphify-out/GRAPH_REPORT.md`  
**Frescura del grafo:** comparar `built_at_commit` de `graphify-out/graph.json` con `git rev-parse HEAD` y los hashes de `graphify-out/manifest.json` con los archivos actuales; un HEAD coincidente no garantiza que incluya cambios sin commit.

---

## Arquitectura Clave (desde GRAPH_REPORT.md)

### Módulos Principales (Community Hubs)
- `next` / `package.json` — Configuración framework y dependencias
- `conectar_base_datos()` — Conexión MongoDB central (41 edges)
- `simular-gps/route.ts` — API simulación GPS
- `inicializar_datos.ts` — Seed roles, camiones, usuarios
- `roles/route.ts` — API gestión roles

### God Nodes (abstracciones centrales)
| Nodo | Conexiones | Función |
|------|------------|---------|
| `conectar_base_datos()` | 41 | Conexión MongoDB singleton |
| `next` | 25 | Framework Next.js (bridge cross-community) |
| `leer_almacen_local()` | 21 | Lectura cache/localStorage |
| `guardar_almacen_local()` | 18 | Escritura cache/localStorage |
| `mongoose` | 17 | ODM MongoDB |
| `lucide-react` | 16 | Iconos UI |
| `@clerk/nextjs` | 12 | Autenticación + middleware |

### Comunidades Destacadas
- **Community 0 (next):** App Router, Clerk, componentes UI
- **Community 1 (conectar_base_datos):** Todas las API routes usan este nodo
- **Community 3 (simular-gps):** Endpoints GPS simulado + cálculos distancia
- **Community 8 (leaflet):** Mapas interactivos rutas

---

## Flujo de Trabajo en Este Repo

### 1. Contexto Inicial (obligatorio)
```bash
cat AGENTS.md
cat graphify-out/GRAPH_REPORT.md
```

### 2. Consultas Graphify Típicas
Antes de abrir múltiples archivos para comprender relaciones entre módulos, consulta el grafo con una pregunta concreta, una semilla y salida limitada:
```bash
graphify query "Quién llama a sincronizarPerfil" --seed 'sincronizarPerfil()' --context call --depth 1 --budget 800
```
Abre después solo los archivos y fragmentos relevantes indicados por la consulta. En Graphify 0.9.105, `--budget` puede excederse al incluir aristas: reduce el alcance con `--seed`, `--context` y `--depth`. El código fuente es la autoridad final; si el grafo está desactualizado o no contiene el símbolo, usa una búsqueda puntual con `rg`. No cargues `graph.json` completo en el contexto.

```bash
# Qué APIs usan la BD
graphify query "Qué llama a conectar_base_datos"

# Estructura de modelos Mongoose
graphify query "Modelos definidos en mongoose"

# Rutas de autenticación Clerk
graphify query "Cómo se usa clerk en middleware"
```

### 3. Archivos Críticos a Conocer
| Archivo | Propósito |
|---------|-----------|
| `src/lib/base_datos.ts` | `conectar_base_datos()` singleton |
| `src/middleware.ts` | Clerk auth protection |
| `src/app/api/*/route.ts` | API routes (alertas, conductores, roles, simular-gps) |
| `src/lib/almacen_local.ts` | Cache localStorage (leer/guardar) |
| `src/components/mapa/*` | Leaflet mapas interactivos |
| `src/app/(dashboard)/*` | Páginas protegidas (admin, conductores) |

---

## Reglas Específicas Dashboard

1. **Auth:** Clerk middleware protege `/dashboard/*` y API routes
2. **BD:** Siempre `await conectar_base_datos()` al inicio de API routes
3. **Modelos:** Definidos en `src/models/` o inline en API routes
4. **UI:** Tailwind + lucide-react + shadcn/ui patterns
5. **Mapas:** Leaflet (no Google Maps) — `leaflet` community cohesion 0.47
6. **TypeScript:** `npx tsc --noEmit` debe pasar
7. **Build:** `npm run build` debe pasar sin errores

---

## Verificación Local
```bash
npx tsc --noEmit
npm run build
npm run lint
# Todos deben pasar
```

---

## Actualizar Grafo
```bash
graphify update .
# Después de cambios en API routes, modelos, middleware, o estructura app/
```

---

## Integración con Otros Repos

| Este Repo | Proporciona | Consumido Por |
|-----------|-------------|---------------|
| Dashboard_V3 | API REST (alertas, conductores, roles) | ecotrack-movil-equipo |
| Dashboard_V3 | Auth Clerk (JWT + roles) | ecotrack-movil-equipo |
| Dashboard_V3 | Modelos MongoDB (Camión, Alerta, Usuario) | ecotrack-servidor-gps (mongoose) |
