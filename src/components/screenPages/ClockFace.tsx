"use client";

import { useEffect, useRef } from "react";
import { brandFont } from "@/lib/fonts";

// An Apple Watch–style analog face. Everything is sized in container query
// units against its own box rather than the viewport, so the same component
// fills a rotated portrait TV, a landscape one, or a 32px library thumbnail
// alike: the dial takes the largest circle that fits below the wordmark's
// band (and a mirrored band underneath, so it stays visually centred).

// The dial is drawn on a 200-unit square centred on the origin.
const R = 100;
const NUMERALS: { label: string; angle: number }[] = [
  { label: "12", angle: 0 },
  { label: "3", angle: 90 },
  { label: "6", angle: 180 },
  { label: "9", angle: 270 },
];
const NUMERAL_FONT = `"SF Pro Rounded", "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Roboto, sans-serif`;

const ORANGE = "#ff9f0a";

// Rounded so the server's and the browser's floating-point trig agree to
// the digit — otherwise the tick coordinates trip a hydration mismatch.
function polar(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { x: round(Math.cos(a) * radius), y: round(Math.sin(a) * radius) };
}

export function ClockFace({ now = Date.now }: { now?: () => number }) {
  const hourRef = useRef<SVGGElement>(null);
  const minuteRef = useRef<SVGGElement>(null);
  const secondRef = useRef<SVGGElement>(null);
  const handsRef = useRef<SVGGElement>(null);

  // Hands are rotated straight on the DOM every frame rather than through
  // React state — a re-render per frame for three transforms would be pure
  // overhead on a set-top box. The hands stay hidden until the first frame
  // has placed them, so the server-rendered 12:00 never flashes up.
  const nowRef = useRef(now);
  useEffect(() => {
    nowRef.current = now;
  });

  useEffect(() => {
    let frame = 0;
    function tick() {
      const t = new Date(nowRef.current());
      const ms = t.getMilliseconds();
      const s = t.getSeconds() + ms / 1000;
      const m = t.getMinutes() + s / 60;
      const h = (t.getHours() % 12) + m / 60;
      hourRef.current?.setAttribute("transform", `rotate(${h * 30})`);
      minuteRef.current?.setAttribute("transform", `rotate(${m * 6})`);
      secondRef.current?.setAttribute("transform", `rotate(${s * 6})`);
      if (handsRef.current) handsRef.current.style.opacity = "1";
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black" style={{ containerType: "size" }}>
      <div
        className={`${brandFont.className} absolute inset-x-0 text-center uppercase leading-none tracking-tight text-white`}
        style={{ top: "4.5cqmin", fontSize: "5.5cqmin" }}
      >
        Colo Cloud
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
          style={{ width: "min(90cqw, 100cqh - 28cqmin)", aspectRatio: "1" }}
          aria-label="Clock"
          role="img"
        >
          {/* Minute track: 60 fine ticks, with bolder bars at the hours not
              already marked by a numeral. */}
          {Array.from({ length: 60 }, (_, i) => {
            const angle = i * 6;
            if (i % 5 === 0) {
              if (i % 15 === 0) return null;
              const a = polar(angle, 97);
              const b = polar(angle, 83);
              return (
                <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
              );
            }
            const a = polar(angle, 97);
            const b = polar(angle, 91);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8e8e93" strokeWidth={1} strokeLinecap="round" />;
          })}

          {NUMERALS.map(({ label, angle }) => {
            const p = polar(angle, 74);
            return (
              <text
                key={label}
                x={p.x}
                y={p.y}
                fill="#fff"
                fontFamily={NUMERAL_FONT}
                fontWeight={600}
                fontSize={28}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {label}
              </text>
            );
          })}

          <g ref={handsRef} style={{ opacity: 0 }}>
            <g ref={hourRef}>
              <Hand length={50} />
            </g>
            <g ref={minuteRef}>
              <Hand length={86} />
            </g>
            <circle r={5} fill="#fff" />
            <g ref={secondRef}>
              <line x1={0} y1={20} x2={0} y2={-94} stroke={ORANGE} strokeWidth={1.4} strokeLinecap="round" />
              <line x1={0} y1={20} x2={0} y2={8} stroke={ORANGE} strokeWidth={3} strokeLinecap="round" />
            </g>
            <circle r={3.6} fill={ORANGE} />
            <circle r={1.4} fill="#000" />
          </g>
        </svg>
      </div>
    </div>
  );
}

// Apple's hour/minute hand: a slim stalk out of the centre that steps up
// into a broad rounded bar, outlined in black so it reads cleanly where it
// crosses the tick marks or the other hand. Drawn pointing to 12.
function Hand({ length }: { length: number }) {
  const stalk = 15;
  const width = 7.5;
  return (
    <g stroke="#000" strokeWidth={1.2}>
      <rect x={-1.6} y={-stalk - 2} width={3.2} height={stalk + 2} fill="#fff" />
      <rect x={-width / 2} y={-length} width={width} height={length - stalk} rx={width / 2} fill="#fff" />
    </g>
  );
}
