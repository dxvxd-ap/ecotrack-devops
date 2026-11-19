import { NextRequest, NextResponse } from "next/server";
import { conectar_base_datos } from "@/lib/base_datos";
import { ModeloSuscripcionPush, PlataformaDispositivo } from "@/modelos/SuscripcionPush";
import { manejarErrorApi } from "@/lib/apiErrorHandler";

export async function POST(peticion: NextRequest) {
  try {
    await conectar_base_datos();

    const cuerpo = await peticion.json();
    const { token, plataforma, rutasSuscritas, activo } = cuerpo;

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { exito: false, mensaje: "El token de notificación push es obligatorio." },
        { status: 400 }
      );
    }

    const tokenLimpio = token.trim();
    let plataformaLimpia: PlataformaDispositivo = "android";
    if (plataforma && ["android", "ios", "web"].includes(plataforma)) {
      plataformaLimpia = plataforma as PlataformaDispositivo;
    }

    let rutasLimpias: string[] = [];
    if (Array.isArray(rutasSuscritas)) {
      rutasLimpias = rutasSuscritas.map((r) => String(r).trim()).filter(Boolean);
    }

    const suscripcionActualizada = await ModeloSuscripcionPush.findOneAndUpdate(
      { token: tokenLimpio },
      {
        $set: {
          plataforma: plataformaLimpia,
          rutasSuscritas: rutasLimpias,
          activo: activo !== undefined ? Boolean(activo) : true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({
      exito: true,
      mensaje: "Dispositivo y token push registrados correctamente.",
      datos: suscripcionActualizada,
    });
  } catch (error: any) {
    return manejarErrorApi(error, "push:registrar-token");
  }
}
