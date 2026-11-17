const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Solo módulos propios y node:crypto; ningún transporte real se utiliza en pruebas.
function cargarGeoapify() {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const modulo = { exports: {} }; cache.set(file, modulo);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', 'module', code)(id => {
      if (id === 'node:crypto') return require(id);
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id) + '.ts');
      throw Error('Dependencia no autorizada en prueba');
    }, modulo.exports, modulo);
    return modulo.exports;
  }
  return load(path.resolve(__dirname, '../../src/lib/geoapify_servidor.ts'));
}
module.exports = { cargarGeoapify };
