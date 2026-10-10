import { brandFont } from "@/lib/fonts";
import { QrCode } from "@/components/QrCode";

// Where the placeholder's QR code leads — the production domain, so a
// screen points people there whichever deployment URL it was opened from.
const DASHBOARD_URL = "https://colo-cloud.app/dashboard";

// What a screen shows when nothing's assigned to it (or while a video's
// first load is hidden). The dashboard's preview renders this same
// component, scaled down, so the tile matches the screen.
export function NoContentPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6">
      <span className={`${brandFont.className} text-[40px] uppercase tracking-tight text-[var(--screen-ink)]`}>
        Colo Cloud
      </span>
      <QrCode value={DASHBOARD_URL} size={200} />
    </div>
  );
}
