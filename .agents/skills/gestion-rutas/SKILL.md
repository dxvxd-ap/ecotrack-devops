---
name: gestion-rutas
version: 1.0.0
---
# Contexto
Esta skill maneja la creación, edición, eliminación y visualización de rutas de recolección de basura en el dashboard web.

# Lógica de Negocio
- **Trazado interactivo:** La interfaz de mapas debe permitir dibujar líneas (rutas calle por calle).
- **Edición/Eliminación:** Cada ruta guardada en MongoDB Atlas debe tener botones de edición (para modificar los vértices del trazado) y de eliminación lógica o física si ya no se usa.
- **Relaciones:** 
  - 1 Camión -> 1 Conductor (Asignación estricta).
  - 1 Camión -> Muchas Rutas (Depende del día y horario).

# Modelos Base (MongoDB)
- Colección `rutas`: `{ id_ruta, nombre, trazado_geojson, color_mapa }`