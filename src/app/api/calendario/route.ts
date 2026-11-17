import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloAsignacionCalendario } from "@/modelos/AsignacionCalendario";
import { ModeloRuta } from "@/modelos/Ruta";
import "@/modelos/Camion"; // Asegurar registro del modelo Camion para populate
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";

function normalizarDia(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obtenerDiaSemana(fechaStr: string): string {
  try {
    const partes = fechaStr.split("-").map(Number);
    if (partes.length === 3) {
      const [anio, mes, dia] = partes;
      const dateObj = new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0));
      const dias = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
      return dias[dateObj.getUTCDay()];
    }
  } catch {}
  return "lunes";
}

export async function GET(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const fecha = searchParams.get("fecha");
    const fecha_consulta = fecha || new Date().toISOString().split("T")[0];
    const dia_consulta = normalizarDia(obtenerDiaSemana(fecha_consulta));

    let asignaciones_registradas: any[] = [];
    let rutas_activas: any[] = [];

    try {
      await conectar_base_datos();

      const filtro: any = {};
      if (fecha) filtro.fecha = fecha;

      asignaciones_registradas = await ModeloAsignacionCalendario.find(filtro)
        .populate("camion_id")
        .populate("ruta_id")
        .sort({ fecha: 1, hora_entrada_aprox: 1 })
        .lean();

      let consultaRutas: any = ModeloRuta.find({ activa: true });
      if (typeof consultaRutas?.populate === "function") {
        consultaRutas = consultaRutas.populate("camionAsignadoId");
      }
      rutas_activas = await consultaRutas.sort({ fecha_creacion: -1 }).lean();
    } catch (e_db: any) {
      console.warn("Fallo temporal en MongoDB, recurriendo a almacén local:", e_db.message);
      const almacen = leer_almacen_local();
      asignaciones_registradas = (almacen.calendario || []).filter((a: any) =>
        fecha ? a.fecha === fecha : true
      );
      rutas_activas = almacen.rutas || [];
    }

    // Mapa de excepciones registradas para la fecha consultada (por id de ruta)
    const excepcionesPorRuta = new Map<string, any>();
    asignaciones_registradas.forEach((asig) => {
      const idRuta = asig.ruta_id?._id?.toString() || asig.ruta_id?.id_ruta || asig.ruta_id;
      if (idRuta && asig.fecha === fecha_consulta) {
        excepcionesPorRuta.set(String(idRuta), asig);
      }
    });

    // Proyectar turnos base de rutas activas que operan este día de la semana
    const turnosProyectados: any[] = [];
    rutas_activas.forEach((r: any) => {
      const idRuta = String(r._id || r.id_ruta);
      const diasRuta: string[] = (r.diasRecoleccion || r.dias_recoleccion || [
        "lunes",
        "miercoles",
        "viernes",
      ]).map((d: string) => normalizarDia(d));

      const operaHoy = diasRuta.includes(dia_consulta);
      if (!operaHoy) return;

      // Si ya existe una asignación o excepción explícita para esta fecha, esa tiene precedencia
      if (excepcionesPorRuta.has(idRuta)) {
        return;
      }

      const camion = r.camionAsignadoId || {
        _id: `camion_titular_${idRuta}`,
        numero_unidad: "Unidad Titular",
        matricula: "GZ-OFICIAL",
        modelo: "Recolección Habitual",
        estado: "disponible",
      };

      const horaInicio = r.horarioHabitual?.horaInicio || r.horario_habitual?.hora_inicio || "07:00";
      const horaFin = r.horarioHabitual?.horaFin || r.horario_habitual?.hora_fin || "13:00";

      turnosProyectados.push({
        _id: `proy_${idRuta}_${fecha_consulta}`,
        ruta_id: r,
        camion_id: camion,
        fecha: fecha_consulta,
        hora_entrada_aprox: horaInicio,
        hora_salida_aprox: horaFin,
        estado: "programado",
        notas: `Turno oficial programado (${dia_consulta})`,
        tipo_asignacion: "base_recurrente",
        es_anulacion: false,
        motivo_excepcion: "",
      });
    });

    // Combinar asignaciones registradas y proyecciones
    const resultado = [...asignaciones_registradas, ...turnosProyectados].sort((a, b) =>
      (a.hora_entrada_aprox || "").localeCompare(b.hora_entrada_aprox || "")
    );

    return NextResponse.json({
      exito: true,
      datos: resultado,
      total: resultado.length,
      dia_semana: dia_consulta,
    });
  } catch (error: any) {
    const almacen = leer_almacen_local();
    return NextResponse.json({ exito: true, datos: almacen.calendario || [] });
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const {
      camion_id,
      ruta_id,
      fecha,
      hora_entrada_aprox,
      hora_salida_aprox,
      notas,
      estado,
      tipo_asignacion,
      es_anulacion,
      motivo_excepcion,
    } = cuerpo;

    if (!ruta_id || !fecha) {
      return NextResponse.json(
        { exito: false, mensaje: "Ruta y fecha son obligatorios para programar o registrar excepción" },
        { status: 400 }
      );
    }

    const almacen = leer_almacen_local();
    const camion_encontrado = (almacen.camiones || []).find((c: any) => c._id === camion_id);
    const camion_obj = camion_encontrado
      ? {
          _id: camion_encontrado._id,
          numero_unidad: camion_encontrado.numero_unidad,
          matricula: camion_encontrado.matricula,
          modelo: camion_encontrado.modelo,
        }
      : camion_id
      ? { _id: camion_id, numero_unidad: "Unidad Asignada", matricula: "GZ-S/M" }
      : null;

    const ruta_obj = (almacen.rutas || []).find((r: any) => r._id === ruta_id) || {
      _id: ruta_id,
      nombre: "Ruta de Recolección",
    };

    const estadoFinal = es_anulacion ? "cancelado" : estado || "programado";
    const tipoFinal = tipo_asignacion || "excepcion_dia";

    const nueva_asignacion = {
      _id: `asig_${Date.now()}`,
      camion_id: camion_obj,
      ruta_id: ruta_obj,
      fecha,
      hora_entrada_aprox: hora_entrada_aprox || "07:00",
      hora_salida_aprox: hora_salida_aprox || "13:00",
      estado: estadoFinal,
      notas: notas || "",
      tipo_asignacion: tipoFinal,
      es_anulacion: Boolean(es_anulacion),
      motivo_excepcion: motivo_excepcion || "",
    };

    // Actualizar almacén local
    almacen.calendario = [
      nueva_asignacion,
      ...(almacen.calendario || []).filter(
        (a: any) => !(String(a.ruta_id?._id || a.ruta_id) === String(ruta_id) && a.fecha === fecha)
      ),
    ];
    guardar_almacen_local(almacen);

    try {
      await conectar_base_datos();
      // Sobrescribir si ya existía registro específico para esta ruta y fecha
      const docPersistido = await ModeloAsignacionCalendario.findOneAndUpdate(
        { ruta_id, fecha },
        {
          $set: {
            camion_id: camion_id || null,
            hora_entrada_aprox: hora_entrada_aprox || "07:00",
            hora_salida_aprox: hora_salida_aprox || "13:00",
            estado: estadoFinal,
            notas: notas || "",
            tipo_asignacion: tipoFinal,
            es_anulacion: Boolean(es_anulacion),
            motivo_excepcion: motivo_excepcion || "",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (docPersistido) {
        nueva_asignacion._id = docPersistido._id.toString();
      }
    } catch (e_db: any) {
      console.warn("Escritura en MongoDB fallida, persistido en almacén local:", e_db.message);
    }

    return NextResponse.json({
      exito: true,
      mensaje: es_anulacion
        ? "Recorrido suspendido / anulado para esta fecha correctamente"
        : "Turno / Excepción registrada exitosamente",
      datos: nueva_asignacion,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al registrar turno o excepción", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { id, estado, notas, motivo_excepcion, camion_id } = cuerpo;

    if (!id || !estado) {
      return NextResponse.json(
        { exito: false, mensaje: "ID y estado requeridos" },
        { status: 400 }
      );
    }

    // Si el id es de una proyección (proy_<ruta_id>_<fecha>), convertirlo a registro real en DB
    if (String(id).startsWith("proy_")) {
      const [, rutaId, fecha] = String(id).split("_");
      return await POST(
        new NextRequest(peticion.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ruta_id: rutaId,
            fecha,
            camion_id: camion_id || null,
            estado,
            notas: notas || "",
            motivo_excepcion: motivo_excepcion || "",
            tipo_asignacion: "excepcion_dia",
          }),
        })
      );
    }

    const almacen = leer_almacen_local();
    const asig = (almacen.calendario || []).find((a: any) => a._id === id);
    if (asig) {
      asig.estado = estado;
      if (notas !== undefined) asig.notas = notas;
      if (motivo_excepcion !== undefined) asig.motivo_excepcion = motivo_excepcion;
      if (camion_id) asig.camion_id = camion_id;
      guardar_almacen_local(almacen);
    }

    try {
      await conectar_base_datos();
      await ModeloAsignacionCalendario.findByIdAndUpdate(id, {
        estado,
        ...(notas !== undefined && { notas }),
        ...(motivo_excepcion !== undefined && { motivo_excepcion }),
        ...(camion_id && { camion_id }),
      });
    } catch (e_db: any) {}

    return NextResponse.json({
      exito: true,
      mensaje: `Estado actualizado a ${estado}`,
      datos: asig,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al actualizar asignación", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { exito: false, mensaje: "ID requerido para eliminar" },
        { status: 400 }
      );
    }

    const almacen = leer_almacen_local();
    almacen.calendario = (almacen.calendario || []).filter((a: any) => a._id !== id);
    guardar_almacen_local(almacen);

    try {
      await conectar_base_datos();
      await ModeloAsignacionCalendario.findByIdAndDelete(id);
    } catch (e: any) {
      console.warn("Fallo al eliminar en BD:", e.message);
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Excepción eliminada. Se restaura el turno oficial recurrente.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al eliminar excepción", detalle: error.message },
      { status: 500 }
    );
  }
}
