async function probar_osrm() {
  const p1 = [-97.0886, 20.4514];
  const p2 = [-97.0840, 20.4540];
  const url = `https://router.project-osrm.org/route/v1/driving/${p1[0]},${p1[1]};${p2[0]},${p2[1]}?overview=full&geometries=geojson`;
  console.log("Probando OSRM:", url);
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("Código OSRM:", data.code);
    if (data.routes && data.routes[0]) {
      console.log("Distancia en metros:", data.routes[0].distance);
      console.log("Puntos de calle recibidos:", data.routes[0].geometry.coordinates.length);
    }
  } catch (e) {
    console.error("Error probando OSRM:", e.message);
  }
}
probar_osrm();

