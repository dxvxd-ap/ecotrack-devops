import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloConductor } from "@/modelos/Conductor";
import { ModeloCamion } from "@/modelos/Camion";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    try {
      await conectar_base_datos();
      const conductores_db = await ModeloConductor.find({ activo: true })
        .populate("camion_asignado_id")
        .sort({ nombre_completo: 1 })
        .lean();

      if (conductores_db && conductores_db.length > 0) {
        const normalizados = conductores_db.map((c: any) => ({
          ...c,
          _id: String(c._id),
          numero_licencia: c.numero_licencia || c.licencia || "",
          licencia: c.licencia || c.numero_licencia || "",
        }));
        return NextResponse.json({ exito: true, datos: normalizados });
      }
    } catch (e_db: any) {
      console.warn("MongoDB Atlas no disponible para conductores, usando respaldo local:", e_db.message);
    }

    const almacen = leer_almacen_local();
    const locales = (almacen.conductores || []).map((c: any) => ({
      ...c,
      _id: String(c._id || c.id || ""),
      numero_licencia: c.numero_licencia || c.licencia || "",
      licencia: c.licencia || c.numero_licencia || "",
    }));
    return NextResponse.json({ exito: true, datos: locales });
  } catch (error: any) {
    return manejarErrorApi(error, "conductores:listar");
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { nombre_completo, numero_licencia, licencia, telefono, camion_asignado_id } = cuerpo;

    const licVal = (numero_licencia || licencia || "").toString().trim().toUpperCase();
    const nomVal = (nombre_completo || "").toString().trim();
    const telVal = (telefono || "").toString().trim();

    if (!nomVal || !licVal || !telVal) {
      return NextResponse.json(
        { exito: false, mensaje: "Nombre completo, licencia y teléfono son campos obligatorios" },
        { status: 400 }
      );
    }

    // Normalizar ID de camión para evitar CastError si viene como string vacío o formato inválido
    const camionIdLimpio =
      camion_asignado_id && /^[a-fA-F0-9]{24}$/.test(String(camion_asignado_id))
        ? String(camion_asignado_id)
        : null;

    await conectar_base_datos();

    // Verificación previa de licencia duplicada
    const existente = await ModeloConductor.findOne({
      $or: [{ numero_licencia: licVal }, { licencia: licVal }],
    });

    if (existente) {
      return NextResponse.json(
        {
          exito: false,
          mensaje: `Ya existe un conductor registrado con la licencia ${licVal}.`,
        },
        { status: 409 }
      );
    }

    const nuevo_conductor = await ModeloConductor.create({
      nombre_completo: nomVal,
      numero_licencia: licVal,
      licencia: licVal,
      telefono: telVal,
      camion_asignado_id: camionIdLimpio,
      activo: true,
    });

    if (camionIdLimpio) {
      // Relación 1:1 con el camión
      await ModeloCamion.findByIdAndUpdate(camionIdLimpio, {
        conductor_asignado_id: nuevo_conductor._id,
      });
    }

    // Sincronizar respaldo local
    try {
      const almacen = leer_almacen_local();
      almacen.conductores = almacen.conductores || [];
      const itemSerializado = {
        _id: String(nuevo_conductor._id),
        nombre_completo: nuevo_conductor.nombre_completo,
        numero_licencia: nuevo_conductor.numero_licencia,
        licencia: nuevo_conductor.licencia,
        telefono: nuevo_conductor.telefono,
        camion_asignado_id: camionIdLimpio,
        activo: nuevo_conductor.activo,
        fecha_creacion: nuevo_conductor.fecha_creacion,
      };
      almacen.conductores.push(itemSerializado);
      guardar_almacen_local(almacen);
    } catch (errLocal) {
      console.warn("No se pudo guardar conductor en respaldo local:", errLocal);
    }

    return NextResponse.json(
      {
        exito: true,
        mensaje: "Conductor registrado exitosamente",
        datos: nuevo_conductor,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        {
          exito: false,
          mensaje: "Ya existe un conductor registrado con esa licencia.",
        },
        { status: 409 }
      );
    }
    return manejarErrorApi(error, "conductores:crear");
  }
}

export async function PUT(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const { id, _id, nombre_completo, numero_licencia, licencia, telefono, camion_asignado_id, activo } = cuerpo;

    const conductorId = String(id || _id || "");
    if (!conductorId || !/^[a-fA-F0-9]{24}$/.test(conductorId)) {
      return NextResponse.json(
        { exito: false, mensaje: "ID de conductor no válido" },
        { status: 400 }
      );
    }

    await conectar_base_datos();

    const actualizacion: Record<string, any> = {};
    if (nombre_completo !== undefined) actualizacion.nombre_completo = String(nombre_completo).trim();
    if (numero_licencia !== undefined || licencia !== undefined) {
      const licVal = String(numero_licencia || licencia).trim().toUpperCase();
      actualizacion.numero_licencia = licVal;
      actualizacion.licencia = licVal;
    }
    if (telefono !== undefined) actualizacion.telefono = String(telefono).trim();
    if (activo !== undefined) actualizacion.activo = Boolean(activo);

    if (camion_asignado_id !== undefined) {
      actualizacion.camion_asignado_id =
        camion_asignado_id && /^[a-fA-F0-9]{24}$/.test(String(camion_asignado_id))
          ? String(camion_asignado_id)
          : null;
    }

    const conductorActualizado = await ModeloConductor.findByIdAndUpdate(
      conductorId,
      actualizacion,
      { new: true }
    );

    if (!conductorActualizado) {
      return NextResponse.json(
        { exito: false, mensaje: "Conductor no encontrado" },
        { status: 404 }
      );
    }

    // Si se reasignó un camión, actualizar relación 1:1
    if (actualizacion.camion_asignado_id) {
      await ModeloCamion.findByIdAndUpdate(actualizacion.camion_asignado_id, {
        conductor_asignado_id: conductorActualizado._id,
      });
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Conductor actualizado exitosamente",
      datos: conductorActualizado,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        {
          exito: false,
          mensaje: "Ya existe otro conductor registrado con esa licencia.",
        },
        { status: 409 }
      );
    }
    return manejarErrorApi(error, "conductores:actualizar");
  }
}
