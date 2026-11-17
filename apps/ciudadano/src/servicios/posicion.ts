export function posicionParaMapa(p: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }): { coordenadas: [number, number]; precisionMetros: number; timestamp: number } {
  const { latitude, longitude, accuracy } = p.coords;
  if (![latitude, longitude, accuracy, p.timestamp].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0 || p.timestamp <= 0) throw new Error('Lectura de ubicación inválida.');
  return { coordenadas: [longitude, latitude], precisionMetros: Math.ceil(accuracy), timestamp: p.timestamp };
}
