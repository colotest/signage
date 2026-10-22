import { notFound } from "next/navigation";
import { GlitterTuner } from "./GlitterTuner";

// A workbench for the Glitter page, like the Lava Lamp's: the real
// component with every dial on it live. Development only.
export default function GlitterTunerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GlitterTuner />;
}
