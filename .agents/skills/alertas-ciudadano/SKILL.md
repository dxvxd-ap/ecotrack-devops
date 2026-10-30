---
name: alertas-ciudadano
version: 1.0.0
---
# Contexto
Motor de geolocalización y notificaciones push para los usuarios con rol `ciudadano`.

# Lógica de Negocio
- **Suscripción Espacial:** El ciudadano registra su ubicación o polígono de interés (su casa).
- **Cálculo de Proximidad:** Cuando el estado de una asignación del calendario pasa a `en_progreso`, el sistema monitorea el GPS del camión.
- **Disparador:** Si la ubicación en tiempo real del camión se acerca al radio de la ruta vinculada a la casa del ciudadano, disparar notificación push a la app móvil/web del ciudadano: "El camión de basura está cerca de tu zona o está a punto de pasar".
- **Idioma:** Todos los payloads de notificaciones y logs deben procesarse en español.