import { conectar_base_datos } from "./base_datos";
import { ModeloRol } from "@/modelos/Rol";
import { ModeloRuta } from "@/modelos/Ruta";
import { ModeloCamion } from "@/modelos/Camion";
import { ModeloConductor } from "@/modelos/Conductor";
import { ModeloAsignacionCalendario } from "@/modelos/AsignacionCalendario";

export async function inicializar_roles_predeterminados() {
  await conectar_base_datos();

  const roles_base = [
    {
      nombre: "superadmin",
      descripcion: "Acceso total a la configuración del sistema, gestión de usuarios y roles.",
      acceso_dashboard: true,
      es_sistema: true,
      permisos: ["todo"],
    },
    {
      nombre: "admin",
      descripcion: "Administrador operativo con permisos de edición de rutas, flota y asignaciones.",
      acceso_dashboard: true,
      es_sistema: true,
      permisos: ["rutas:gestion", "flota:gestion", "calendario:gestion", "usuarios:ver", "usuarios:roles"],
    },
    {
      nombre: "secretario",
      descripcion: "Personal encargado del trazado de rutas, horarios de recolección y monitoreo.",
      acceso_dashboard: true,
      es_sistema: true,
      permisos: ["rutas:gestion", "calendario:gestion", "monitoreo:ver"],
    },
    {
      nombre: "moderador",
      descripcion: "Supervisión de alertas, reportes ciudadanos y lectura de telemetría.",
      acceso_dashboard: true,
      es_sistema: true,
      permisos: ["rutas:ver", "flota:ver", "alertas:gestion"],
    },
    {
      nombre: "ciudadano",
      descripcion: "Usuario residente con acceso exclusivo a alertas de su zona y notificaciones push.",
      acceso_dashboard: false,
      es_sistema: true,
      permisos: ["alertas:recibir", "domicilio:gestionar"],
    },
    {
      nombre: "conductor",
      descripcion: "Operador de vehículo recolector con acceso a su hoja de ruta diaria.",
      acceso_dashboard: false,
      es_sistema: true,
      permisos: ["rutas:ver_asignada", "estado:actualizar"],
    },
    {
      nombre: "camion",
      descripcion: "Dispositivo IoT o unidad física para reporte de telemetría GPS.",
      acceso_dashboard: false,
      es_sistema: true,
      permisos: ["gps:reportar"],
    },
  ];

  for (const rol of roles_base) {
    const existe = await ModeloRol.findOne({ nombre: rol.nombre });
    if (!existe) {
      await ModeloRol.create(rol);
    }
  }
}

export async function sembrar_datos_iniciales_si_esta_vacio() {
  await conectar_base_datos();
  await inicializar_roles_predeterminados();

  const conteo_rutas = await ModeloRuta.countDocuments();
  if (conteo_rutas === 0) {
    // Rutas de recolección en Gutiérrez Zamora, Veracruz
    const ruta_centro = await ModeloRuta.create({
      id_ruta: "RUTA-GZ-CENTRO",
      nombre: "Ruta 01 - Centro y Ribera Tecolutla",
      descripcion: "Recolección matutina en el centro de Gutiérrez Zamora, Av. Manuel Ávila Camacho y zona de malecón.",
      trazado_geojson: {
        type: "LineString",
        coordinates: [
          [-97.0886, 20.4514],
          [-97.0865, 20.4525],
          [-97.0840, 20.4540],
          [-97.0820, 20.4530],
          [-97.0850, 20.4495],
          [-97.0886, 20.4514],
        ],
      },
      color_mapa: "#2f63ff",
      distancia_estimada_km: 4.8,
      duracion_estimada_min: 75,
      activa: true,
    });

    const ruta_norte = await ModeloRuta.create({
      id_ruta: "RUTA-GZ-NORTE",
      nombre: "Ruta 02 - Sector Norte y UTGZ",
      descripcion: "Recolección vespertina en colonias del norte hacia la Universidad Tecnológica de Gutiérrez Zamora.",
      trazado_geojson: {
        type: "LineString",
        coordinates: [
          [-97.0886, 20.4514],
          [-97.0910, 20.4550],
          [-97.0945, 20.4580],
          [-97.0980, 20.4560],
          [-97.0920, 20.4530],
        ],
      },
      color_mapa: "#10b981",
      distancia_estimada_km: 6.2,
      duracion_estimada_min: 90,
      activa: true,
    });

    const conductor1 = await ModeloConductor.create({
      nombre_completo: "Carlos Mendoza Silva",
      numero_licencia: "LIC-VER-88392",
      telefono: "+52 766 123 4567",
      activo: true,
    });

    const conductor2 = await ModeloConductor.create({
      nombre_completo: "José Ramón Morales",
      numero_licencia: "LIC-VER-47201",
      telefono: "+52 766 987 6543",
      activo: true,
    });

    const camion1 = await ModeloCamion.create({
      matricula: "GZ-101-VER",
      numero_unidad: "UNIDAD-GZ-01",
      modelo: "International 4300 Compactador",
      capacidad_toneladas: 8,
      estado: "en_ruta",
      conductor_asignado_id: conductor1._id,
      ultima_latitud: 20.4525,
      ultima_longitud: -97.0865,
      ultima_velocidad_kmh: 22,
      ultima_actualizacion_gps: new Date(),
      activo: true,
    });

    const camion2 = await ModeloCamion.create({
      matricula: "GZ-204-VER",
      numero_unidad: "UNIDAD-GZ-02",
      modelo: "Freightliner M2 Recolector",
      capacidad_toneladas: 10,
      estado: "disponible",
      conductor_asignado_id: conductor2._id,
      ultima_latitud: 20.4514,
      ultima_longitud: -97.0886,
      ultima_velocidad_kmh: 0,
      ultima_actualizacion_gps: new Date(),
      activo: true,
    });

    conductor1.camion_asignado_id = camion1._id as any;
    await conductor1.save();
    conductor2.camion_asignado_id = camion2._id as any;
    await conductor2.save();

    const fecha_hoy = new Date().toISOString().split("T")[0];
    await ModeloAsignacionCalendario.create({
      camion_id: camion1._id,
      ruta_id: ruta_centro._id,
      fecha: fecha_hoy,
      hora_entrada_aprox: "07:00",
      hora_salida_aprox: "13:30",
      estado: "en_progreso",
      notas: "Recolección habitual matutina en Gutiérrez Zamora.",
    });

    await ModeloAsignacionCalendario.create({
      camion_id: camion2._id,
      ruta_id: ruta_norte._id,
      fecha: fecha_hoy,
      hora_entrada_aprox: "14:00",
      hora_salida_aprox: "20:00",
      estado: "programado",
      notas: "Turno vespertino para sector norte y colonias aledañas.",
    });
  }
}
