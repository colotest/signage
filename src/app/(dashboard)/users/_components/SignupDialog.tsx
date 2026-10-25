"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { RoleDot } from "@/components/RoleDot";
import { POPUP_BLUE_BUTTON, Popup } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { createSignupLink, emailSignupLink, updateSignupInvite } from "@/lib/actions/users";
import { useViewer } from "@/lib/auth/ViewerContext";
import { cn } from "@/lib/utils/cn";

export type PendingSignup = {
  // Each press is a new link, and a fresh form to go with it.
  id: number;
  link: Promise<{ url: string; token: string }>;
  // Settles once the clipboard has the link — or refuses it.
  copied: Promise<void>;
};

// Pressing "New Signup" makes a single-use link and copies it, right in
// the press: Safari refuses clipboard writes that only begin after an
// await, which is where the link arrives — so it's handed to the
// clipboard as a promise instead. Returned for SignupDialog to show.
let signupCount = 0;

export function startSignup(): PendingSignup {
  const link = createSignupLink();
  const url = link.then((l) => l.url);
  const copied =
    typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
      ? navigator.clipboard.write([
          new ClipboardItem({ "text/plain": url.then((text) => new Blob([text], { type: "text/plain" })) }),
        ])
      : url.then((text) => navigator.clipboard.writeText(text));
  return { id: ++signupCount, link, copied };
}

// What opens with the new link: the link itself in a code box, to select
// by hand if copying didn't take (or for anyone who'd rather), and above
// it the new user's nickname and roles — the viewer's own roles only.
// Those go onto the link as they're set, so whoever opens it is greeted
// by name and starts out with those roles. Or the link can be emailed to
// them straight from here.
export function SignupDialog({ pending, onClose }: { pending: PendingSignup | null; onClose: () => void }) {
  // Kept after closing so the content doesn't blank out mid-animation.
  const [shown, setShown] = useState(pending);
  if (pending && pending !== shown) setShown(pending);

  return (
    <Popup
      open={!!pending}
      onOpenChange={(open) => !open && onClose()}
      title="New Signup"
      trailing={
        <button type="button" onClick={onClose} title="Done" aria-label="Done" className={POPUP_BLUE_BUTTON}>
          <CheckIcon className="h-5 w-5" />
        </button>
      }
    >
      {shown && <SignupForm key={shown.id} pending={shown} />}
    </Popup>
  );
}

function SignupForm({ pending }: { pending: PendingSignup }) {
  const viewer = useViewer();
  const [link, setLink] = useState<{ url: string; token: string } | null>(null);
  const [copyState, setCopyState] = useState<"copying" | "copied" | "failed">("copying");
  const [failed, setFailed] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<{ status: "idle" | "sending" | "error"; message?: string } | { status: "sent"; to: string }>({ status: "idle" });

  useEffect(() => {
    let live = true;
    pending.link.then(
      (l) => live && setLink(l),
      (err) => live && setFailed(err instanceof Error ? err.message : "Couldn't make a signup link"),
    );
    pending.copied.then(
      () => live && setCopyState("copied"),
      () => live && setCopyState("failed"),
    );
    return () => {
      live = false;
    };
  }, [pending]);

  // Saved onto the link a moment after each change, and straight away if
  // the popup closes before that moment's up.
  const latest = useRef({ nickname, roleIds, dirty: false });
  useEffect(() => {
    latest.current = { nickname, roleIds, dirty: latest.current.dirty };
  }, [nickname, roleIds]);

  useEffect(() => {
    if (!link || !latest.current.dirty) return;
    const id = setTimeout(() => {
      latest.current.dirty = false;
      updateSignupInvite(link.token, nickname, roleIds).then(
        () => setSaveError(null),
        (err) => setSaveError(err instanceof Error ? err.message : "Couldn't save that onto the link"),
      );
    }, 400);
    return () => clearTimeout(id);
  }, [link, nickname, roleIds]);

  useEffect(
    () => () => {
      const { nickname: n, roleIds: r, dirty } = latest.current;
      if (dirty && link) updateSignupInvite(link.token, n, r).catch(() => {});
    },
    [link],
  );

  function markDirty() {
    latest.current.dirty = true;
  }

  function toggleRole(id: string) {
    markDirty();
    setRoleIds((current) => (current.includes(id) ? current.filter((r) => r !== id) : [...current, id]));
  }

  async function sendEmail() {
    if (!link || !email.trim()) return;
    setEmailState({ status: "sending" });
    // Whatever's waiting to go onto the link goes first, so the email
    // greets them by the nickname as typed.
    if (latest.current.dirty) {
      latest.current.dirty = false;
      await updateSignupInvite(link.token, nickname, roleIds).catch(() => {});
    }
    const to = email.trim();
    try {
      const problem = await emailSignupLink(link.token, to);
      setEmailState(problem ? { status: "error", message: problem } : { status: "sent", to });
    } catch (err) {
      setEmailState({ status: "error", message: err instanceof Error ? err.message : "Couldn't send the email" });
    }
  }

  async function copyAgain() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  if (failed) return <p className="px-1 py-2 text-[13px] text-danger">{failed}</p>;

  return (
    <div className="flex flex-col gap-4 px-1">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-muted">Nickname</span>
        <input
          autoFocus
          value={nickname}
          maxLength={60}
          onChange={(e) => {
            markDirty();
            setNickname(e.target.value);
          }}
          placeholder="What they'll be called"
          className="rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent"
        />
      </label>

      {viewer.roles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">Roles</span>
          <div className="flex flex-wrap gap-2">
            {viewer.roles.map((role) => {
              const on = roleIds.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    on
                      ? "border-transparent bg-accent/12 text-foreground ring-2 ring-inset ring-accent"
                      : "border-border text-muted hover:text-foreground",
                  )}
                >
                  <RoleDot role={role} />
                  {role.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          sendEmail();
        }}
      >
        <span className="text-[12px] text-muted">Email it to</span>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailState.status !== "sending") setEmailState({ status: "idle" });
            }}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="name@example.com"
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!link || !email.trim() || emailState.status === "sending"}
            className="shrink-0 rounded-full bg-accent px-4 text-[14px] font-medium text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90 disabled:opacity-40"
          >
            {emailState.status === "sending" ? <Spinner /> : "Send"}
          </button>
        </div>
        {emailState.status === "sent" && <p className="text-[12px] text-success">Sent to {emailState.to} ✓</p>}
        {emailState.status === "error" && <p className="text-[12px] text-danger">{emailState.message}</p>}
      </form>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[12px] text-muted">
          Link
          {link && (
            <button type="button" onClick={copyAgain} className="press-ghost font-medium text-accent hover:opacity-70">
              {copyState === "copied" ? "Copied ✓" : copyState === "failed" ? "Copy" : "Copying…"}
            </button>
          )}
        </span>
        {link ? (
          <code
            // A click selects the whole link, for copying by hand.
            onClick={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}
            className="block cursor-text select-all break-all rounded-[var(--radius-sm)] bg-black/[.04] px-3 py-2.5 font-mono text-[12px] leading-relaxed dark:bg-white/[.06]"
          >
            {link.url}
          </code>
        ) : (
          <div className="flex justify-center py-3">
            <Spinner />
          </div>
        )}
        <p className="text-[12px] text-muted">Works once, for 7 days.</p>
        {saveError && <p className="text-[12px] text-danger">{saveError}</p>}
      </div>
    </div>
  );
}
