/** Especificación operativa. NO se declara con schema.index para evitar autoIndex en Atlas. */
export const INDICES_RECLAMOS_R1 = [
  { name: 'reclamos_propietario_operacion_r1_unique', key: { ciudadano_id_clerk: 1, 'operacion.id': 1 }, unique: true,
    partialFilterExpression: { contrato_creacion: 'reclamos-r1', ciudadano_id_clerk: { $type: 'string' }, 'operacion.id': { $type: 'string' } },
    collation: { locale: 'simple' } },
  { name: 'folio_1', key: { folio: 1 }, unique: true, collation: { locale: 'simple' } },
] as const;
function canonico(x: unknown): string {
  if (Array.isArray(x)) return JSON.stringify(x.map(canonico));
  if (x && typeof x === 'object') return JSON.stringify(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonico(v)]));
  return JSON.stringify(x);
}
export function indicesReclamosDisponibles(indices: unknown): boolean {
  if (!Array.isArray(indices)) return false;
  return INDICES_RECLAMOS_R1.every(spec => indices.some(i => i && i.unique === true && !i.sparse && !i.hidden && !i.prepareUnique &&
    // Orden de los campos del índice compuesto también forma parte del contrato.
    JSON.stringify(i.key) === JSON.stringify(spec.key) &&
    canonico(i.partialFilterExpression ?? null) === canonico('partialFilterExpression' in spec ? spec.partialFilterExpression : null) &&
    (!i.collation || i.collation.locale === 'simple')));
}
