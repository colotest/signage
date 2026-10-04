"use client";

import { useEffect } from "react";

// Records where each button press lands, as --press-x/--press-y on the
// button itself, so its press glow (see globals.css) spreads out from under
// the finger or cursor rather than from the centre. One listener for the
// whole app; it renders nothing.
export function PressOrigin() {
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const button = (e.target as Element | null)?.closest?.("button:not(.no-press)");
      if (!(button instanceof HTMLElement)) return;
      const rect = button.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      button.style.setProperty("--press-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      button.style.setProperty("--press-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    }
    document.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, []);

  return null;
}
