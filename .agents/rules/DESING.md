# SISTEMA DE DISEÑO (TASTE-SKILL & ONCE UI)
- **Estética:** Utilitaria, limpia, enfocada en la densidad de datos para los mapas y calendarios. Evitar sombras exageradas o paddings inconsistentes.
- **Mapas Interactivos:** Los controles de dibujo (polígonos/líneas) deben tener un contraste alto para que los secretarios tracen rutas de recolección cómodamente.
- **Manejo de Componentes Externos:**
  Para instalar componentes animados o específicos (ej. títulos), utilizar la CLI de `shadcn` o `jsrepo`. 
  *Instrucción de ejecución para el Agente:* Si necesitas un componente como `SplitText`, ejecuta `npx jsrepo@latest add https://reactbits.dev/r/SplitText-TS-CSS` o `npx shadcn@latest add @react-bits/SplitText-TS-CSS`. Las dependencias como `gsap` se instalan con `npm install gsap`.