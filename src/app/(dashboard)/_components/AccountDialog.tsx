"use client";

import { useActionState, useEffect, useState, type InputHTMLAttributes } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_BLUE_BUTTON, POPUP_WHITE_BUTTON, Popup } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { changeEmailAction, changePasswordAction } from "@/lib/actions/account";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { useViewer } from "@/lib/auth/ViewerContext";

export type AccountChange = "password" | "email";

const FORM_ID = "account-form";

// The account menu's Change Password… and Change Email…: the go-ahead on
// the right submits, and once it's gone through the popup says what
// happened in place of the form, its go-ahead then closing it.
export function AccountDialog({ change, onClose }: { change: AccountChange | null; onClose: () => void }) {
  // Kept after closing so the content doesn't blank out mid-animation.
  const [shown, setShown] = useState(change);
  // Each open starts a fresh form (and so a fresh action state).
  const [opens, setOpens] = useState(0);
  if (change && change !== shown) setShown(change);
  const [wasOpen, setWasOpen] = useState(!!change);
  if (!!change !== wasOpen) {
    setWasOpen(!!change);
    if (change) setOpens((n) => n + 1);
  }
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Popup
      open={!!change}
      onOpenChange={(open) => !open && onClose()}
      title={shown === "email" ? "Change Email" : "Change Password"}
      leading={
        done ? undefined : (
          <button type="button" onClick={onClose} title="Cancel" aria-label="Cancel" className={POPUP_WHITE_BUTTON}>
            <CloseIcon className="h-5 w-5" />
          </button>
        )
      }
      trailing={
        done ? (
          <button type="button" onClick={onClose} title="Done" aria-label="Done" className={POPUP_BLUE_BUTTON}>
            <CheckIcon className="h-5 w-5" />
          </button>
        ) : (
          <button type="submit" form={FORM_ID} disabled={pending} title="Save" aria-label="Save" className={POPUP_BLUE_BUTTON}>
            {pending ? <Spinner className="h-5 w-5" /> : <CheckIcon className="h-5 w-5" />}
          </button>
        )
      }
    >
      {shown === "email" ? (
        <EmailForm key={opens} onDone={setDone} onPending={setPending} />
      ) : (
        <PasswordForm key={opens} onDone={setDone} onPending={setPending} />
      )}
    </Popup>
  );
}

type FormProps = { onDone: (done: boolean) => void; onPending: (pending: boolean) => void };

function PasswordForm({ onDone, onPending }: FormProps) {
  const viewer = useViewer();
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  useReport(!!state?.done, pending, { onDone, onPending });

  if (state?.done) {
    return (
      <p className="px-1 py-2 text-[14px] text-muted">
        Your password has been changed. Every other device that was signed in has been signed out.
      </p>
    );
  }
  return (
    <form id={FORM_ID} action={action} className="flex flex-col gap-4 px-1">
      {/* For password managers, to know whose password this is. */}
      <input type="email" name="username" autoComplete="username" value={viewer.email} readOnly hidden />
      <Field label="Current password" type="password" name="current" autoComplete="current-password" autoFocus required />
      <Field
        label="New password"
        type="password"
        name="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <p className="text-[12px] text-muted">At least {MIN_PASSWORD_LENGTH} characters. You&rsquo;ll get an email to say it was changed.</p>
    </form>
  );
}

function EmailForm({ onDone, onPending }: FormProps) {
  const viewer = useViewer();
  const [state, action, pending] = useActionState(changeEmailAction, undefined);
  useReport(!!state?.sent, pending, { onDone, onPending });

  if (state?.sent) {
    return (
      <p className="px-1 py-2 text-[14px] text-muted">
        We&rsquo;ve sent a link to <span className="font-medium text-foreground">{state.sent}</span>. Open it to finish the
        change — until then you still log in with {viewer.email}.
      </p>
    );
  }
  return (
    <form id={FORM_ID} action={action} className="flex flex-col gap-4 px-1">
      <Field
        label="New email"
        type="email"
        name="email"
        autoComplete="email"
        autoCapitalize="none"
        placeholder={viewer.email}
        autoFocus
        required
      />
      <Field label="Password" type="password" name="current" autoComplete="current-password" required />
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
      <p className="text-[12px] text-muted">We&rsquo;ll email the new address a link to confirm it.</p>
    </form>
  );
}

// Hands the form's progress up to the popup's buttons, which sit outside it.
function useReport(done: boolean, pending: boolean, { onDone, onPending }: FormProps) {
  useEffect(() => {
    onDone(done);
    onPending(pending);
  }, [done, pending, onDone, onPending]);
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <input
        {...props}
        className="rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent"
      />
    </label>
  );
}
