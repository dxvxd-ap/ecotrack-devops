import { NextResponse, NextRequest } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloConductor } from "@/modelos/Conductor";
import { ModeloCamion } from "@/modelos/Camion";

export async function GET() {
  try {
    await conectar_base_datos();
    const conductores = await ModeloConductor.find({ activo: true })
      .populate("camion_asignado_id")
      .sort({ nombre_completo: 1 });
    return NextResponse.json({ exito: true, datos: conductores });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al listar conductores", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const cuerpo = await peticion.json();
    const { nombre_completo, numero_licencia, telefono, camion_asignado_id } = cuerpo;

    if (!nombre_completo || !numero_licencia || !telefono) {
      return NextResponse.json(
        { exito: false, mensaje: "Nombre, licencia y teléfono son obligatorios" },
        { status: 400 }
      );
    }

    const nuevo_conductor = await ModeloConductor.create({
      nombre_completo: nombre_completo.trim(),
      numero_licencia: numero_licencia.trim().toUpperCase(),
      telefono: telefono.trim(),
      camion_asignado_id: camion_asignado_id || null,
      activo: true,
    });

    if (camion_asignado_id) {
      // Relación estricta 1:1
      await ModeloCamion.findByIdAndUpdate(camion_asignado_id, {
        conductor_asignado_id: nuevo_conductor._id,
      });
    }

    return NextResponse.json({
      exito: true,
      mensaje: "Conductor registrado exitosamente",
      datos: nuevo_conductor,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al registrar el conductor", detalle: error.message },
      { status: 500 }
    );
  }
}

