import { useSyncExternalStore } from "react";
import { POWER_SAVING_KEY } from "@/lib/powerSaving";

// Power-saving mode: scroll windows end in a plain cut at the edge of their
// clear content, instead of blurring and fading out beyond it (see
// [data-power-saving] in globals.css). Stored per browser, and applied to
// <html> before first paint by the root layout's head script — so a page
// never flashes its blurred edges first.
const ATTRIBUTE = "data-power-saving";
const EVENT = "signage:power-saving-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // Another tab changing it.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isOn() {
  return document.documentElement.hasAttribute(ATTRIBUTE);
}

export function setPowerSaving(on: boolean) {
  document.documentElement.toggleAttribute(ATTRIBUTE, on);
  try {
    if (on) localStorage.setItem(POWER_SAVING_KEY, "1");
    else localStorage.removeItem(POWER_SAVING_KEY);
  } catch {
    // Storage blocked (a private window): it still applies for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function usePowerSaving(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, isOn, () => false);
  return [on, setPowerSaving];
}
