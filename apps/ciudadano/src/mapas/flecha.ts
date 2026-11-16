/** Chevrón que apunta al este antes de la rotación de MapLibre según la línea. */
export function crearFlecha() {
  const width = 24; const height = 24; const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const distance = Math.abs(y - 12);
    if (x >= 6 && x <= 18 && distance <= (19 - x) / 1.15 && distance >= Math.max(0, (14 - x) / 1.15 - 2)) {
      const i = (y * width + x) * 4;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
  }
  return { width, height, data };
}
