import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloReclamo } from "@/modelos/Reclamo";

/**
 * GET /api/v1/reclamos
 * Consulta de reclamos ciudadanos con filtros opcionales por estado o ruta
 */
export async function GET(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const { searchParams } = new URL(peticion.url);
    const estado = searchParams.get("estado");
    const rutaId = searchParams.get("ruta_id");

    const filtro: any = {};
    if (estado) filtro.estado = estado;
    if (rutaId) filtro.ruta_id = rutaId;

    const reclamos = await ModeloReclamo.find(filtro).sort({ fecha_reporte: -1 }).limit(100);

    return NextResponse.json({
      exito: true,
      datos: reclamos,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al obtener reclamos.", error: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/reclamos
 * Registro de un nuevo reclamo ciudadano desde la app móvil o web
 */
export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const cuerpo = await peticion.json();

    const {
      ciudadano_nombre,
      ciudadano_telefono,
      ciudadano_email,
      domicilio_referencia,
      latitud,
      longitud,
      tipo_incidencia,
      descripcion,
      fotografia_url,
      ruta_id,
    } = cuerpo;

    if (!ciudadano_nombre || !ciudadano_telefono || !domicilio_referencia || latitud === undefined || longitud === undefined) {
      return NextResponse.json(
        { exito: false, mensaje: "Faltan campos obligatorios: nombre, teléfono, domicilio y coordenadas." },
        { status: 400 }
      );
    }

    const folio = `REC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;

    const nuevoReclamo = await ModeloReclamo.create({
      folio,
      ciudadano_nombre,
      ciudadano_telefono,
      ciudadano_email: ciudadano_email || "",
      domicilio_referencia,
      ubicacion: {
        type: "Point",
        coordinates: [Number(longitud), Number(latitud)],
      },
      tipo_incidencia: tipo_incidencia || "CAMION_NO_PASO",
      descripcion: descripcion || "Reporte sin descripción adicional.",
      fotografia_url: fotografia_url || "",
      ruta_id: ruta_id || null,
      estado: "PENDIENTE",
    });

    return NextResponse.json({
      exito: true,
      mensaje: "Reclamo registrado exitosamente en el sistema municipal de Gutiérrez Zamora.",
      datos: nuevoReclamo,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al registrar reclamo.", error: error?.message },
      { status: 500 }
    );
  }
}
