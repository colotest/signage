"use client";

import type { HandoverPin } from "@/lib/uebergabeprotokoll";
import { cn } from "@/lib/utils/cn";
import { AcceptAll, pickResult, ResultBox } from "./HandoverProtocol";
import { handoverPhotoUrl, type HandoverState } from "./handoverState";
import { MapCard } from "./VenueMap";

// A part of the Übergabeprotokoll on the venue map, at the standing pin it
// takes the place of (see protocolPins): in place of the Checkliste's
// switch, a ✓ that passes all its items (blue while they all are; gone
// once any has failed, as on the page) and a ✕ (red while any has) that
// opens it. Open, every item with its own ✓ and ✕ — a failed one's note
// and photos under it, to be changed on the page. Opening it scrolls the
// page there (onShow, with the part's anchor).
export function HandoverPinCard({
  pin,
  state,
  open,
  onOpenChange,
  onShow,
}: {
  pin: HandoverPin;
  state: HandoverState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShow: (anchor: string) => void;
}) {
  const answers = pin.items.map((item) => state.item(item.key));
  const failed = answers.some((a) => a?.state === "issue");
  const done = answers.filter((a) => a?.state).length;
  const toggle = () => {
    if (!open) onShow(pin.anchor);
    onOpenChange(!open);
  };
  return (
    <MapCard
      title={pin.title}
      // How far along, while it's partway.
      summary={done > 0 && done < pin.items.length ? `${done}/${pin.items.length}` : undefined}
      open={open}
      onToggle={toggle}
      onTitlePress={toggle}
      arrow={false}
      openWidth={300}
      control={
        <span className="flex shrink-0 items-center gap-1.5">
          <AcceptAll small items={pin.items} state={state} label={pin.title} />
          <ResultBox
            small
            kind="issue"
            picked={failed}
            label={open ? `${pin.title} schließen` : `${pin.title}: Mängel eintragen`}
            onPress={toggle}
          />
        </span>
      }
    >
      <ul className="-mx-1 flex max-h-[45vh] flex-col overflow-y-auto">
        {pin.items.map((item, i) => {
          const answer = answers[i];
          const issue = answer?.state === "issue";
          return (
            <li key={item.key} className="px-1 py-1">
              <div className="flex items-center gap-2 text-[14px]">
                <span className="w-7 shrink-0 text-[12px] tabular-nums text-muted">{item.number}</span>
                <span className="min-w-0 flex-1 leading-snug">{item.label}</span>
                <ResultBox
                  small
                  kind="ok"
                  picked={answer?.state === "ok"}
                  label={`${item.label}: in Ordnung`}
                  onPress={() => pickResult(state, item.key, "ok")}
                />
                <ResultBox
                  small
                  kind="issue"
                  picked={issue}
                  label={`${item.label}: Mangel`}
                  onPress={() => {
                    pickResult(state, item.key, "issue");
                    onShow(item.key.split("/")[0]);
                  }}
                />
              </div>
              {issue && (answer.note || answer.photos?.length) ? (
                <div className="mt-1 flex flex-col gap-1.5 pl-9">
                  {answer.note && <p className="line-clamp-3 whitespace-pre-wrap text-[13px] text-muted">{answer.note}</p>}
                  {answer.photos?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {answer.photos.map((path) => (
                        <a key={path} href={handoverPhotoUrl(path)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- a storage photo, shown as it is */}
                          <img src={handoverPhotoUrl(path)} alt="" className={cn("h-10 w-10 rounded-[6px] object-cover")} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </MapCard>
  );
}
