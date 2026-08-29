"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Rendered fully offline from a locally-bundled encoder — no third-party
// image API involved, since a screen with shaky connectivity should never
// depend on the network just to show a QR code.
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(
      (url) => {
        if (!cancelled) setDataUrl(url);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) return <div style={{ width: size, height: size }} />;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt={`QR code linking to ${value}`} width={size} height={size} />;
}
