---
name: calendario-logistica
version: 1.0.0
---
# Contexto
Gestiona la asignación temporal de los camiones a las rutas específicas.

# Lógica de Negocio
- **Vista de Calendario:** El dashboard debe tener un calendario interactivo (mensual/semanal).
- **Asignación:** Se debe poder hacer clic en un día y asignar: `Camion_X` + `Ruta_Y` + `Hora_Entrada_Aprox` + `Hora_Salida_Aprox`.
- **Alertas de Inicio:** Un cronjob o trigger debe evaluar la hora actual contra la `Hora_Entrada_Aprox`. Cuando falte poco tiempo o el conductor marque "iniciar", cambia el estado a `en_progreso`.