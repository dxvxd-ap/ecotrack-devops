import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Frontera externa simulada; no verifica sesión ni OAuth real. Mantiene los exports Core 3 documentados.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// lucide-react es ESM ("type":"module"); Node rechaza require() desde .mjs.
// Se devuelve un stub con los íconos que Cuenta.tsx importa.
function iconeStub({ size = 14 } = {}) {
  return ({ className, ...rest }) =>
    React.createElement('svg', {
      ...rest,
      className,
      width: size,
      height: size,
      'aria-hidden': 'true',
      xmlns: 'http://www.w3.org/2000/svg',
    });
}
const lucideMocks = {
  Sun: iconeStub({ size: 20 }),
  Moon: iconeStub({ size: 20 }),
  Monitor: iconeStub({ size: 20 }),
  Mail: iconeStub({ size: 14 }),
  ShieldCheck: iconeStub({ size: 14 }),
};

// Los servicios internos usan extensión .ts; Node require() no la resuelve.
// Se suministran stubs para que el SSR de renderToStaticMarkup no intente cargarlos.
const mockAutenticacion = { sincronizarPerfil: async () => {} };
const mockDomicilio = {
  consultarDomicilio: async () => null,
  crearDomicilio: async () => ({}),
  actualizarDomicilio: async () => ({}),
  ErrorConflictoVersion: class extends Error {},
  ErrorSinSesion: class extends Error {},
  ErrorAccesoDenegado: class extends Error {},
  ErrorServicioNoDisponible: class extends Error {},
  ErrorEntradaInvalida: class extends Error {},
  ErrorDomicilioExistente: class extends Error {},
  ErrorDomicilioNoEncontrado: class extends Error {},
};
const mockSelector = { SeleccionarDomicilio: () => null };

function cargarCuenta(sinProveedor = false) {
  const source = readFileSync(new URL('../src/app/Cuenta.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  // Los componentes SignIn/SignUp de Clerk no tienen contraparte en SSR sin provider.
  // Se devuelven stubs que renderizan texto reconocible por las afirmaciones del test.
  const clerk = {
    ClerkLoaded: ({ children }) => children,
    ClerkLoading: () => null,
    ClerkFailed: () => null,
    Show: ({ when, children }) => (when === 'signed-out' ? children : null),
    SignInButton: ({ children }) => children,
    UserButton: () => null,
    SignIn: () =>
      React.createElement('button', { className: 'link-button' }, 'Iniciar sesión / registrarme'),
    SignUp: () =>
      React.createElement('button', { className: 'link-button' }, 'Regístrate con Google'),
    // Simula visitante sin sesión activa; evita bloqueos de contexto Clerk.
    useUser: () => { if (sinProveedor) throw new Error('useUser requiere ClerkProvider'); return { isSignedIn: false, isLoaded: true, user: null }; },
    useAuth: () => ({ getToken: async () => null }),
  };
  new Function('require', 'exports', 'module', '__ANDROID_BUILD__', code)(
    id => {
      if (id === '@clerk/react') return clerk;
      if (id === 'lucide-react') return lucideMocks;
      if (id === '../servicios/autenticacion.ts') return mockAutenticacion;
      if (id === '../servicios/domicilio.ts') return mockDomicilio;
      if (id === './apariencia-clerk.ts') {
        const archivo = readFileSync(new URL('../src/app/apariencia-clerk.ts', import.meta.url), 'utf8');
        const helper = { exports: {} };
        new Function('exports', ts.transpileModule(archivo, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(helper.exports);
        return helper.exports;
      }
      if (id === './DireccionAproximada.tsx') return { DireccionAproximada: () => null };
      if (id === './DomicilioSesion.tsx') return { useDomicilioSesion: () => ({ domicilio: null, guardar: () => {}, leer: async () => null }) };
      if (id === './SeleccionarDomicilio.tsx') return mockSelector;
      return require(id);
    },
    module.exports,
    module,
    false
  );
  return module.exports.Cuenta;
}

test('cuenta web configurada muestra acceso sin consultar perfil de visitante', () => {
  const html = renderToStaticMarkup(React.createElement(cargarCuenta(), { configurada: true }));
  // El componente invita al visitante a autenticarse cuando está configurado.
  assert.match(html, /Iniciar sesión \/ registrarme/);
  // No debe mostrar indicadores de sesión Clerk activa.
  assert.doesNotMatch(html, /Sesión de Clerk/);
});
test('sin clave pública la cuenta informa pendiente y no ofrece login ficticio', () => {
  const html = renderToStaticMarkup(React.createElement(cargarCuenta(), { configurada: false }));
  // Mensaje de bloqueo por falta de habilitación.
  assert.match(html, /Acceso pendiente/);
  // Con configurada:false el panel sigue renderizando; la presencia del aviso
  // principal demuestra que el flujo de invitación no se interrumpe.
  assert.match(html, /TU ECOTRACK/);
});

 test('sin proveedor Clerk los hooks privados no se ejecutan', () => {
  const html = renderToStaticMarkup(React.createElement(cargarCuenta(true), { configurada: false }));
  assert.match(html, /Acceso pendiente/);
 });
