import { createClerkClient } from "@clerk/backend";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "sk_test_iuF6484mizoIX1kxlGUAbgXOdJ3W2oNtoo4MNSmnIB";

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
