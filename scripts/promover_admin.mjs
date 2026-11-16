import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import { createClerkClient } from "@clerk/backend";
import mongoose from "mongoose";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY) throw new Error("Configura CLERK_SECRET_KEY en el entorno antes de ejecutar este script.");
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error("Configura MONGODB_URI en el entorno antes de ejecutar este script.");
const CORREO_OBJETIVO = "22610282@utgz.edu.mx";

async function promover() {
  console.log(`Buscando usuario con correo: ${CORREO_OBJETIVO}...`);
  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

  const lista_usuarios = await clerk.users.getUserList({
    emailAddress: [CORREO_OBJETIVO],
  });

  if (lista_usuarios.data.length > 0) {
    const usuario_clerk = lista_usuarios.data[0];
    console.log(`Usuario encontrado en Clerk! ID: ${usuario_clerk.id}`);
    
    await clerk.users.updateUser(usuario_clerk.id, {
      publicMetadata: {
        rol: "superadmin",
        acceso_dashboard: true,
      },
    });
    console.log(`✓ Rol 'superadmin' asignado en Clerk.`);

    console.log("Conectando a MongoDB Atlas con DNS de Google/Cloudflare...");
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Conectado a MongoDB Atlas.");

    const db = mongoose.connection.db;
    const usuarios_col = db.collection("usuarios");

    await usuarios_col.updateOne(
      { $or: [{ id_clerk: usuario_clerk.id }, { correo_electronico: CORREO_OBJETIVO }] },
      {
        $set: {
          id_clerk: usuario_clerk.id,
          nombre_completo: [usuario_clerk.firstName, usuario_clerk.lastName].filter(Boolean).join(" ") || "Super Administrador",
          correo_electronico: CORREO_OBJETIVO,
          rol: "superadmin",
          activo: true,
          fecha_actualizacion: new Date(),
        },
        $setOnInsert: {
          fecha_creacion: new Date(),
        },
      },
      { upsert: true }
    );

    console.log(`✓ Registro en MongoDB actualizado a 'superadmin'.`);
    await mongoose.disconnect();
  }
}

promover().catch(console.error);
