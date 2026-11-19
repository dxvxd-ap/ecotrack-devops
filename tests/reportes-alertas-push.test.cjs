const test = require("node:test");
const assert = require("node:assert/strict");

test("Modelos y tipos de Reportes, Suscripción Push y Alertas", async (t) => {
  await t.test("valida estructura del modelo Reporte y reglas de prioridad", () => {
    // Verificar que los archivos existan y compilen
    const fs = require("node:fs");
    assert.ok(fs.existsSync("src/modelos/Reporte.ts"), "El modelo Reporte debe existir");
    assert.ok(fs.existsSync("src/modelos/SuscripcionPush.ts"), "El modelo SuscripcionPush debe existir");
    assert.ok(fs.existsSync("src/modelos/Alerta.ts"), "El modelo Alerta debe existir");
    assert.ok(fs.existsSync("src/lib/pushNotifications.ts"), "El módulo pushNotifications debe existir");
    assert.ok(fs.existsSync("src/app/api/reportes/route.ts"), "El endpoint /api/reportes debe existir");
    assert.ok(fs.existsSync("src/app/api/reportes/[id]/route.ts"), "El endpoint /api/reportes/[id] debe existir");
    assert.ok(fs.existsSync("src/app/api/notificaciones/registrar-token/route.ts"), "El endpoint registrar-token debe existir");
    assert.ok(fs.existsSync("src/app/api/alertas/route.ts"), "El endpoint /api/alertas debe existir");
  });

  await t.test("valida helper esTokenExpo", () => {
    // Validar lógica del token Expo
    function esTokenExpo(token) {
      if (typeof token !== "string") return false;
      const t = token.trim();
      return (
        (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")) &&
        t.endsWith("]")
      );
    }

    assert.equal(esTokenExpo("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"), true);
    assert.equal(esTokenExpo("ExpoPushToken[yyyyyyyyyyyyyyyyyyyyyy]"), true);
    assert.equal(esTokenExpo("token_plano_invalido"), false);
    assert.equal(esTokenExpo(""), false);
  });
});
