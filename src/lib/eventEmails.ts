// Addresses an event's Checkliste can be emailed to besides Events
// Management and the event's contact (0044), added from its share button.
export const MAX_EMAIL = 254;
export const MAX_CHECKLIST_EMAILS = 30;

// An email address, near enough: something@somewhere.tld, no spaces.
export function isEmail(text: string): boolean {
  return text.length <= MAX_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

// Whatever's stored, as addresses: anything that isn't one is dropped.
export function parseEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && isEmail(v)).slice(0, MAX_CHECKLIST_EMAILS);
}
