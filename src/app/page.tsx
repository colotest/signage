import { redirect } from "next/navigation";

// colo-cloud.app itself leads to the Guest page, for everyone (proxy.ts
// sends it there first; this is the fallback).
export default function RootPage() {
  redirect("/guest");
}
