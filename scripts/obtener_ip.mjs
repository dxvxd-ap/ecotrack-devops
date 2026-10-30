async function obtener_ip() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    console.log("IP_PUBLICA_ACTUAL:", data.ip);
  } catch (e) {
    console.error("Error obteniendo IP:", e.message);
  }
}
obtener_ip();
