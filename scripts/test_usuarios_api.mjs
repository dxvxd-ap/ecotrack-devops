import { createClerkClient } from "@clerk/backend";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY) throw new Error("Configura CLERK_SECRET_KEY en el entorno antes de ejecutar este script.");

async function test() {
  const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  const lista = await clerk.users.getUserList({ limit: 10 });
  console.log("Usuarios en Clerk encontrados:", lista.data.length);
  for (const u of lista.data) {
    console.log("- ID:", u.id);
    console.log("  Correo:", u.emailAddresses[0]?.emailAddress);
    console.log("  Nombre:", u.firstName, u.lastName);
    console.log("  Metadata:", u.publicMetadata);
  }
}

test();
