import { redirect } from "next/navigation";
import { landingPath } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";

// Where someone whose roles reach no page at all lands: nothing but the
// header. Anyone who can reach a page is sent on to it.
export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    const path = landingPath(user.access);
    if (path !== "/home") redirect(path);
  }
  return null;
}
