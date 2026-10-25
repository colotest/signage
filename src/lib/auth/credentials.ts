// What the login, signup and account forms accept, checked by their
// Server Actions.

export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordProblem(password: string) {
  return password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` : null;
}
