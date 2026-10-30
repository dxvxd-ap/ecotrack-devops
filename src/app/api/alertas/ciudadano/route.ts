import { NextResponse, NextRequest } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloAlertaCiudadano } from "@/modelos/AlertaCiudadano";
import { ModeloHistorialAlerta } from "@/modelos/HistorialAlerta";

export async function GET() {
  try {
    await conectar_base_datos();
    const usuario = await currentUser();

    if (!usuario) {
      return NextResponse.json(
        { exito: false, mensaje: "Sesión no autenticada" },
        { status: 401 }
      );
    }

    const zonas = await ModeloAlertaCiudadano.find({ ciudadano_id: usuario.id });
    const historial = await ModeloHistorialAlerta.find({ ciudadano_id: usuario.id })
      .populate("camion_id")
      .populate("ruta_id")
      .sort({ fecha_envio: -1 })
      .limit(20);

    return NextResponse.json({
      exito: true,
      datos: {
        zonas_suscritas: zonas,
        historial_alertas: historial,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al consultar alertas del ciudadano", detalle: error.message },
      { status: 500 }
    );
  }
}

export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();
    const usuario = await currentUser();

    if (!usuario) {
      return NextResponse.json(
        { exito: false, mensaje: "Sesión no autenticada" },
        { status: 401 }
      );
    }

    const cuerpo = await peticion.json();
    const { etiqueta_zona, direccion_texto, latitud, longitud, radio_cobertura_metros } = cuerpo;

    if (!direccion_texto || latitud === undefined || longitud === undefined) {
      return NextResponse.json(
        { exito: false, mensaje: "Dirección y coordenadas (latitud, longitud) son requeridas" },
        { status: 400 }
      );
    }

    const correo = usuario.emailAddresses[0]?.emailAddress || "ciudadano@ecoruta.local";
    const nombre = [usuario.firstName, usuario.lastName].filter(Boolean).join(" ") || "Ciudadano EcoRuta";

    const nueva_zona = await ModeloAlertaCiudadano.create({
      ciudadano_id: usuario.id,
      nombre_ciudadano: nombre,
      correo_ciudadano: correo,
      etiqueta_zona: etiqueta_zona || "Mi Domicilio",
      direccion_texto,
      latitud: Number(latitud),
      longitud: Number(longitud),
      radio_cobertura_metros: Number(radio_cobertura_metros) || 400,
      notificaciones_habilitadas: true,
    });

    return NextResponse.json({
      exito: true,
      mensaje: "Ubicación de alerta registrada exitosamente",
      datos: nueva_zona,
    });
  } catch (error: any) {
    return NextResponse.json(
      { exito: false, mensaje: "Error al registrar la alerta del ciudadano", detalle: error.message },
      { status: 500 }
    );
  }
}

