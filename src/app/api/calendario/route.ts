import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloAsignacionCalendario } from "@/modelos/AsignacionCalendario";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";

export async function GET(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const fecha = searchParams.get("fecha");

    try {
      await conectar_base_datos();
      const filtro: any = {};
      if (fecha) filtro.fecha = fecha;

      const asignaciones_db = await ModeloAsignacionCalendario.find(filtro)
        .populate("camion_id")
        .populate("ruta_id")
        .sort({ fecha: 1, hora_entrada_aprox: 1 });

      if (asignaciones_db && asignaciones_db.length > 0) {
        return NextResponse.json({ exito: true, datos: asignaciones_db });
      }
    } catch (e_db: any) {
      console.warn("MongoDB Atlas no disponible para calendario, usando respaldo local:", e_db.message);
    }

    const almacen = leer_almacen_local();
    let lista = almacen.calendario || [];
    if (fecha) {
      lista = lista.filter((a: any) => a.fecha === fecha);
    }
    return NextResponse.json({ exito: true, datos: lista });
  } catch (error: any) {
    const almacen = leer_almacen_local();
    return NextResponse.json({ exito: true, datos: almacen.calendario || [] });
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { camion_id, ruta_id, fecha, hora_entrada_aprox, hora_salida_aprox, notas } = cuerpo;

    if (!camion_id || !ruta_id || !fecha || !hora_entrada_aprox || !hora_salida_aprox) {
      return NextResponse.json(
        { exito: false, mensaje: "Todos los campos de logística son requeridos" },
        { status: 400 }
      );
    }

    const almacen = leer_almacen_local();
    const camion_encontrado = (almacen.camiones || []).find((c: any) => c._id === camion_id);
    const camion_obj = {
      numero_unidad: camion_encontrado?.numero_unidad || "UNIDAD-GZ",
      matricula: camion_encontrado?.matricula || "GZ-S/M",
    };
    const ruta_obj = (almacen.rutas || []).find((r: any) => r._id === ruta_id) || { nombre: "Ruta de Recolección" };

    const nueva_asignacion = {
      _id: `asig_${Date.now()}`,
      camion_id: camion_obj,
      ruta_id: ruta_obj,
      fecha,
      hora_entrada_aprox,
      hora_salida_aprox,
      estado: "programado",
      notas: notas || "",
    };

    almacen.calendario = [nueva_asignacion, ...(almacen.calendario || [])];
    guardar_almacen_local(almacen);

    try {
      await conectar_base_datos();
      await ModeloAsignacionCalendario.create({
        camion_id,
        ruta_id,
        fecha,
        hora_entrada_aprox,
        hora_salida_aprox,
        estado: "programado",
        notas: notas || "",
      });
    } catch (e_db) {}

    return NextResponse.json({
      exito: true,
      mensaje: "Asignación creada exitosamente",
      datos: nueva_asignacion,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al crear asignación", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { id, estado, notas } = cuerpo;

    if (!id || !estado) {
      return NextResponse.json(
        { exito: false, mensaje: "ID y estado requeridos" },
        { status: 400 }
      );
    }

    const almacen = leer_almacen_local();
    const asig = (almacen.calendario || []).find((a: any) => a._id === id);
    if (asig) {
      asig.estado = estado;
      if (notas !== undefined) asig.notas = notas;
      guardar_almacen_local(almacen);
    }

    try {
      await conectar_base_datos();
      await ModeloAsignacionCalendario.findByIdAndUpdate(id, {
        estado,
        ...(notas !== undefined && { notas }),
      });
    } catch (e_db) {}

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
