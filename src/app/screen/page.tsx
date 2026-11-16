import { redirect } from "next/navigation";
import { currentDevice } from "@/lib/auth/screenDevice";
import { PairingCode } from "./_components/PairingCode";

export const dynamic = "force-dynamic";

// A TV setting itself up without knowing its screen yet: open /screen,
// pair it, and it goes on to whichever screen the code was entered for.
// One that's paired already goes straight there.
export default async function ScreenIndexPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const device = await currentDevice();
  if (device) {
    const { app } = await searchParams;
    redirect(`/screen/${device.screenId}${app ? `?app=${encodeURIComponent(app)}` : ""}`);
  }
  return <PairingCode />;
}
