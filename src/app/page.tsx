import { redirect } from "next/navigation";

// Auth gate (proxy.ts) handles the real routing decision; this is only
// reached in edge cases where the root path itself needs a fallback.
export default function RootPage() {
  redirect("/dashboard");
}
