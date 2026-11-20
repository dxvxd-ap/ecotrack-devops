import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloCamion } from "@/modelos/Camion";
import { leer_almacen_local, guardar_almacen_local } from "@/lib/almacen_local";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Validador estricto de IMEI para rastreador GPS Coban TK303F
 * Si se proporciona, debe contener exactamente 15 dígitos numéricos.
 */
function validarImei(imei?: unknown): { valido: boolean; error?: string; valorLimpio?: string } {
  if (imei === undefined || imei === null || imei === "") {
    return { valido: true, valorLimpio: undefined };
  }
  const str = String(imei).trim();
  if (str === "") {
    return { valido: true, valorLimpio: undefined };
  }
  if (!/^\d{15}$/.test(str)) {
    return {
      valido: false,
      error: "El IMEI del GPS debe contener exactamente 15 dígitos numéricos (ej. 869706062867504).",
    };
  }
  return { valido: true, valorLimpio: str };
}

export async function GET() {
  try {
    try {
      await conectar_base_datos();
      const camiones_db = await ModeloCamion.find({ activo: true })
        .populate("conductor_asignado_id")
        .sort({ numero_unidad: 1 })
        .lean();

      if (camiones_db && camiones_db.length > 0) {
        const camionesNormalizados = camiones_db.map((c: any) => ({
          ...c,
          _id: String(c._id),
          imei: c.imei || c.imei_gps || null,
          imei_gps: c.imei_gps || c.imei || null,
        }));
        return NextResponse.json({ exito: true, datos: camionesNormalizados });
      }
    } catch (e_db: any) {
      console.warn("MongoDB Atlas no disponible para camiones, usando respaldo local:", e_db.message);
    }

    const almacen = leer_almacen_local();
    const camionesLocales = (almacen.camiones || []).map((c: any) => ({
      ...c,
      imei: c.imei || c.imei_gps || null,
      imei_gps: c.imei_gps || c.imei || null,
    }));
    return NextResponse.json({ exito: true, datos: camionesLocales });
  } catch (error: any) {
    const almacen = leer_almacen_local();
    const camionesLocales = (almacen.camiones || []).map((c: any) => ({
      ...c,
      imei: c.imei || c.imei_gps || null,
      imei_gps: c.imei_gps || c.imei || null,
    }));
    return NextResponse.json({ exito: true, datos: camionesLocales });
  }
}

export async function POST(peticion: NextRequest) {
  try {
    const cuerpo = await peticion.json();
    const {
      matricula,
      numero_unidad,
      modelo,
      capacidad_toneladas,
      conductor_asignado_id,
      imei,
      imei_gps,
    } = cuerpo;

    if (!matricula || !numero_unidad || !modelo) {
      return NextResponse.json(
        { exito: false, mensaje: "Matrícula, número de unidad y modelo son obligatorios" },
        { status: 400 }
      );
    }

    // Validar IMEI de 15 dígitos si se suministra
    const valImei = validarImei(imei ?? imei_gps);
    if (!valImei.valido) {
      return NextResponse.json(
        { exito: false, mensaje: valImei.error },
        { status: 400 }
      );
    }

    await conectar_base_datos();

    // Validar duplicidad de IMEI
    if (valImei.valorLimpio) {
      const duplicadoImei = await ModeloCamion.findOne({
        $or: [{ imei: valImei.valorLimpio }, { imei_gps: valImei.valorLimpio }],
      });
      if (duplicadoImei) {
        return NextResponse.json(
          {
            exito: false,
            mensaje: `El IMEI ${valImei.valorLimpio} ya está vinculado a la unidad "${duplicadoImei.numero_unidad}" (${duplicadoImei.matricula}).`,
          },
          { status: 409 }
        );
      }
    }

    // Validar duplicidad de matrícula o número de unidad
    const duplicadoUnidad = await ModeloCamion.findOne({
      $or: [
        { matricula: matricula.trim().toUpperCase() },
        { numero_unidad: numero_unidad.trim() },
      ],
    });
    if (duplicadoUnidad) {
      return NextResponse.json(
        {
          exito: false,
          mensaje: `Ya existe un camión con matrícula "${matricula.trim().toUpperCase()}" o número de unidad "${numero_unidad.trim()}".`,
        },
        { status: 409 }
      );
    }

    const nuevo_camion_payload: Record<string, any> = {
      matricula: matricula.trim().toUpperCase(),
      numero_unidad: numero_unidad.trim(),
      modelo: modelo.trim(),
      capacidad_toneladas: Number(capacidad_toneladas) || 5,
      conductor_asignado_id: conductor_asignado_id || null,
      estado: "disponible",
      activo: true,
      ultima_latitud: 20.4514,
      ultima_longitud: -97.0886,
      ultima_velocidad_kmh: 0,
    };

    // Sincronizar en imei e imei_gps para compatibilidad total con el daemon TCP
    if (valImei.valorLimpio) {
      nuevo_camion_payload.imei = valImei.valorLimpio;
      nuevo_camion_payload.imei_gps = valImei.valorLimpio;
    }

    const camionCreado = await ModeloCamion.create(nuevo_camion_payload);

    // Respaldo en almacén local
    try {
      const almacen = leer_almacen_local();
      almacen.camiones = [camionCreado.toObject(), ...(almacen.camiones || [])];
      guardar_almacen_local(almacen);
    } catch (e_local) {
      console.warn("No se pudo actualizar almacén local:", e_local);
    }

    return NextResponse.json(
      {
        exito: true,
        mensaje: "Camión registrado exitosamente en la flota",
        datos: {
          ...camionCreado.toObject(),
          imei: camionCreado.imei || camionCreado.imei_gps || null,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error?.code === 11000) {
      const campo = Object.keys(error?.keyPattern || {})[0] || "campo único";
      return NextResponse.json(
        { exito: false, mensaje: `Ya existe un camión con ese ${campo} en el sistema.` },
        { status: 409 }
      );
    }
    return manejarErrorApi(error, "camiones:crear");
  }
}

async function actualizarCamion(peticion: NextRequest) {
  try {
    const { searchParams } = new URL(peticion.url);
    const cuerpo = await peticion.json();
    const id = searchParams.get("id") || cuerpo.id || cuerpo._id;

    if (!id) {
      return NextResponse.json(
        { exito: false, mensaje: "Se requiere el ID del camión a actualizar" },
        { status: 400 }
      );
    }

    // Validar IMEI de 15 dígitos si viene en el cuerpo
    const tieneImeiEnCuerpo = "imei" in cuerpo || "imei_gps" in cuerpo;
    const valorImeiBruto = cuerpo.imei !== undefined ? cuerpo.imei : cuerpo.imei_gps;
    const valImei = validarImei(valorImeiBruto);

    if (tieneImeiEnCuerpo && !valImei.valido) {
      return NextResponse.json(
        { exito: false, mensaje: valImei.error },
        { status: 400 }
      );
    }

    await conectar_base_datos();

    // Comprobar colisión de IMEI con otras unidades
    if (valImei.valorLimpio) {
      const duplicadoImei = await ModeloCamion.findOne({
        _id: { $ne: id },
        $or: [{ imei: valImei.valorLimpio }, { imei_gps: valImei.valorLimpio }],
      });
      if (duplicadoImei) {
        return NextResponse.json(
          {
            exito: false,
            mensaje: `El IMEI ${valImei.valorLimpio} ya pertenece a la unidad "${duplicadoImei.numero_unidad}" (${duplicadoImei.matricula}).`,
          },
          { status: 409 }
        );
      }
    }

    const actualizacion: Record<string, any> = {};
    const desasignar: Record<string, any> = {};

    if (cuerpo.matricula) actualizacion.matricula = cuerpo.matricula.trim().toUpperCase();
    if (cuerpo.numero_unidad) actualizacion.numero_unidad = cuerpo.numero_unidad.trim();
    if (cuerpo.modelo) actualizacion.modelo = cuerpo.modelo.trim();
    if (cuerpo.capacidad_toneladas !== undefined) {
      actualizacion.capacidad_toneladas = Number(cuerpo.capacidad_toneladas) || 5;
    }
    if (cuerpo.conductor_asignado_id !== undefined) {
      actualizacion.conductor_asignado_id = cuerpo.conductor_asignado_id || null;
    }
    if (cuerpo.estado) actualizacion.estado = cuerpo.estado;
    if (cuerpo.activo !== undefined) actualizacion.activo = Boolean(cuerpo.activo);

    if (tieneImeiEnCuerpo) {
      if (valImei.valorLimpio) {
        actualizacion.imei = valImei.valorLimpio;
        actualizacion.imei_gps = valImei.valorLimpio;
      } else {
        desasignar.imei = 1;
        desasignar.imei_gps = 1;
      }
    }

    const updateQuery: Record<string, any> = {};
    if (Object.keys(actualizacion).length > 0) updateQuery.$set = actualizacion;
    if (Object.keys(desasignar).length > 0) updateQuery.$unset = desasignar;

    const camionActualizado = await ModeloCamion.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true, runValidators: true }
    ).populate("conductor_asignado_id");

    if (!camionActualizado) {
      return NextResponse.json(
        { exito: false, mensaje: "Camión no encontrado" },
        { status: 404 }
      );
    }

    // Actualizar respaldo local si existe
    try {
      const almacen = leer_almacen_local();
      almacen.camiones = (almacen.camiones || []).map((c: any) =>
        String(c._id) === String(id) ? { ...c, ...camionActualizado.toObject() } : c
      );
      guardar_almacen_local(almacen);
    } catch (e_local) {
      console.warn("No se pudo actualizar almacén local:", e_local);
    }

    const datosRespuesta = {
      ...camionActualizado.toObject(),
      imei: camionActualizado.imei || camionActualizado.imei_gps || null,
      imei_gps: camionActualizado.imei_gps || camionActualizado.imei || null,
    };

    return NextResponse.json({
      exito: true,
      mensaje: "Camión actualizado exitosamente",
      datos: datosRespuesta,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const campo = Object.keys(error?.keyPattern || {})[0] || "campo único";
      return NextResponse.json(
        { exito: false, mensaje: `Ya existe un camión con ese ${campo} en el sistema.` },
        { status: 409 }
      );
    }
    return manejarErrorApi(error, "camiones:actualizar");
  }
}

export async function PUT(peticion: NextRequest) {
  return actualizarCamion(peticion);
}

export async function PATCH(peticion: NextRequest) {
  return actualizarCamion(peticion);
}
