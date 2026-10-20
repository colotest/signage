import { notFound } from "next/navigation";
import { LavaTuner } from "./LavaTuner";

// A workbench for the Lava Lamp page: the real component, with every dial
// on it live. Development only — it never reaches a screen in production,
// and it's the one place these numbers should be found, since it drives the
// same component the players run rather than a copy of it.
export default function LavaTunerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LavaTuner />;
}
