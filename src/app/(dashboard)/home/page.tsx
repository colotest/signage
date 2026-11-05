import { redirect } from "next/navigation";
import { landingPath } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";

// Sends everyone on to the first page their roles reach — the Guest page,
// open to all, when they reach none.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  redirect(landingPath(user.access));
}
