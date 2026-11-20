export const dynamic = "force-dynamic";
export const revalidate = 0;
import { NextResponse, NextRequest } from "next/server";
import { ModeloPreasignacionUsuario } from "@/modelos/PreasignacionUsuario";
import { autorizar_administracion, respuesta_error_administrativo, texto_opcional,
  correo_validado, validar_rol_asignable, ErrorAdministrativo } from "@/lib/autorizacion";
import { con_objetivo_bloqueado, actualizar_objetivo } from "@/lib/usuarios_administrativos";

export async function POST(peticion: NextRequest) {
  try {
    const actor = await autorizar_administracion("preasignaciones:gestionar");
    const cuerpo = await peticion.json();
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw new ErrorAdministrativo(400, "Cuerpo inválido");
    const correo = correo_validado(cuerpo.correo_electronico);
    const nombre = texto_opcional(cuerpo.nombre_completo, "nombre_completo");
    if (!correo || !nombre) throw new ErrorAdministrativo(400, "Correo y nombre completo son obligatorios");
    const rol = validar_rol_asignable(actor, cuerpo.rol_asignado);
    return await con_objetivo_bloqueado(actor, undefined, correo, { rol, crear_preasignacion: true }, async objetivo => {
      // Preasignar no es una vía alternativa para degradar cuentas protegidas.
      if (objetivo.usuario) await actualizar_objetivo(objetivo, { rol, nombre_completo: nombre });
      const objeto = { _id: `pre_${Date.now()}`, correo_electronico: objetivo.correo,
        nombre_completo: nombre, rol_asignado: rol, completado: Boolean(objetivo.usuario),
        fecha_creacion: new Date().toISOString() };
      const datos = await ModeloPreasignacionUsuario.findOneAndUpdate(
        { correo_electronico: objetivo.correo }, { $set: { nombre_completo: nombre, rol_asignado: rol,
          completado: objeto.completado } }, { upsert: true, new: true, runValidators: true });
      return NextResponse.json({ exito: true,
        mensaje: `Rol '${rol}' pre-asignado a ${objetivo.correo}.`, datos: datos || objeto });
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}

export async function DELETE(peticion: NextRequest) {
  try {
    const actor = await autorizar_administracion("preasignaciones:gestionar");
    const correo = correo_validado(new URL(peticion.url).searchParams.get("correo"));
    if (!correo) throw new ErrorAdministrativo(400, "Se requiere el parámetro correo");
    return await con_objetivo_bloqueado(actor, undefined, correo, { cancelar_preasignacion: true }, async objetivo => {
      await ModeloPreasignacionUsuario.deleteOne({ correo_electronico: objetivo.correo });
      return NextResponse.json({ exito: true, mensaje: "Preasignación eliminada correctamente" });
    });
  } catch (error: unknown) {
    return respuesta_error_administrativo(error);
  }
}
