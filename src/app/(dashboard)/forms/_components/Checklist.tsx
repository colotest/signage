"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHECKLISTE,
  MAX_CHECKLIST_TEXT,
  type ChecklistField,
  type ChecklistSection,
} from "@/lib/checkliste";
import { cn } from "@/lib/utils/cn";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { useChecklist, type Answer } from "./checklistState";

// How long typing in a text field rests before it's saved (leaving the
// field saves at once).
const TEXT_SAVE_MS = 800;

// An event's Checkliste (src/lib/checkliste.ts): every category in one long
// list, each of its sections a card of options. A box is saved the moment
// it's ticked; text as it's typed. Its answers are the page's (see
// checklistState), shared with the map's pins. Each category can be
// scrolled to by its id, checkliste-<key> (the Gastro pin does).
export function Checklist() {
  const { answer, save: saveAll, error } = useChecklist();
  const save = (key: string, value: Answer) => saveAll({ [key]: value });

  return (
    <div className="flex flex-col gap-9">
      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] bg-danger/10 px-3 py-2 text-[14px] text-danger">
          {error}
        </p>
      )}
      {CHECKLISTE.map((category) => (
        <section key={category.key} id={`checkliste-${category.key}`} className="flex scroll-mt-4 flex-col gap-5">
          <h2 className="text-[22px] font-semibold tracking-tight">{category.title}</h2>
          {category.sections.map((section) => (
            <Section key={section.key} section={section} answer={answer} onSave={save} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Section({
  section,
  answer,
  onSave,
}: {
  section: ChecklistSection;
  answer: (key: string) => Answer;
  onSave: (key: string, value: Answer) => void;
}) {
  return (
    <div>
      <h3 className="mb-1.5 px-1 text-[15px] font-semibold">{section.title}</h3>
      {section.note && <Note text={section.note} />}
      <ul
        role={section.single ? "radiogroup" : undefined}
        aria-label={section.single ? section.title : undefined}
        className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface"
      >
        {section.fields.map((field) => (
          <li key={field.key}>
            {field.kind === "check" ? (
              <CheckRow
                field={field}
                single={section.single}
                checked={answer(field.key) === true}
                onChange={(on) => onSave(field.key, on || null)}
              />
            ) : (
              <TextRow field={field} value={(answer(field.key) as string | null) ?? ""} onSave={(text) => onSave(field.key, text || null)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// A section's note: its first line as it is, the rest (examples) as a
// little list.
function Note({ text }: { text: string }) {
  const [lead, ...items] = text.split("\n").filter(Boolean);
  return (
    <div className="mb-2 px-1 text-[13px] text-muted">
      <p>{lead}</p>
      {items.length > 0 && (
        <ul className="mt-0.5 list-disc pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A box to tick — or, in a one-answer section, a round option (tapping the
// picked one again clears it, as everything here is optional).
function CheckRow({
  field,
  single,
  checked,
  onChange,
}: {
  field: ChecklistField;
  single: boolean;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role={single ? "radio" : "checkbox"}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="press-ghost-fit flex w-full items-center gap-3 px-3 py-2.5 text-left text-[15px] hover:bg-black/[.02] dark:hover:bg-white/[.03]"
    >
      <span
        aria-hidden
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center border-2 transition-colors",
          single ? "rounded-full" : "rounded-[7px]",
          checked ? "border-accent bg-accent text-accent-contrast" : "border-border",
        )}
      >
        {checked && <CheckIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">{field.label}</span>
    </button>
  );
}

// A text, date or notes field: what's typed is saved once it rests a
// moment, or straight away when the field is left.
function TextRow({ field, value, onSave }: { field: ChecklistField; value: string; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  const savedRef = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function flush(text: string) {
    clearTimeout(timer.current);
    if (text === savedRef.current) return;
    savedRef.current = text;
    onSave(text);
  }
  function change(text: string) {
    setDraft(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(text), TEXT_SAVE_MS);
  }

  if (field.kind === "textarea") {
    return (
      <textarea
        value={draft}
        onChange={(e) => change(e.target.value)}
        onBlur={(e) => flush(e.target.value)}
        maxLength={MAX_CHECKLIST_TEXT}
        placeholder="Notizen"
        aria-label={field.label}
        className="block min-h-[6.5rem] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none [field-sizing:content] placeholder:text-muted"
      />
    );
  }
  return (
    <label className="flex items-center gap-3 px-3 py-2">
      <span className="shrink-0 text-[15px] text-muted">{field.label}</span>
      <input
        type={field.kind === "date" ? "date" : "text"}
        value={draft}
        // A date is picked, not typed: saved as soon as it's set.
        onChange={(e) => (field.kind === "date" ? (setDraft(e.target.value), flush(e.target.value)) : change(e.target.value))}
        onBlur={(e) => flush(e.target.value)}
        maxLength={field.kind === "date" ? undefined : MAX_CHECKLIST_TEXT}
        className="min-w-0 flex-1 bg-transparent py-0.5 text-right text-[15px] outline-none"
      />
    </label>
  );
}
