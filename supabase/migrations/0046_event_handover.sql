-- An event's Übergabeprotokoll (src/lib/uebergabeprotokoll.ts), its two
-- copies — handing the venue over (Ausgabe) and back (Rückgabe) — each as
-- filled in on its Ablauf page:
-- { "ausgabe": { "items": { "<key>": { "state": "ok" | "issue",
--   "note": "…", "photos": ["handover/<event>/<id>.jpg", …] } },
--   "contactName": "…", "signatures": { "veranstalter": "data:image/png;…",
--   "eigentuemer": "…" }, "signedOn": "YYYY-MM-DD" }, "rueckgabe": { … } }
-- Photos live in the media bucket, under handover/<event id>/.

alter table events add column handover jsonb not null default '{}'::jsonb;
