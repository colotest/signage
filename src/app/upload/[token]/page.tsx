import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { shortName } from "@/lib/uploads/uploaders";
import { folderForUploadLink } from "@/lib/uploads/links";
import { LANG_COOKIE, parseLang } from "./copy";
import { UploadPage as UploadPageView, type UploadedFile } from "./UploadWindow";

export const metadata: Metadata = {
  title: "Upload — Colo Cloud",
  robots: { index: false, follow: false },
};

type Admin = ReturnType<typeof createAdminClient>;

// Someone outside the team, handed a folder's upload link. They can add
// files to that one folder, replace the ones already in it, and see what's
// there — nothing about any other folder is ever fetched for this page,
// let alone sent to it. The proxy leaves /upload/* open (see src/proxy.ts);
// the token is the whole of the access check, done again by every action
// the page calls.
export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lang = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const admin = createAdminClient();
  const folder = await folderForUploadLink(admin, token);

  const link = folder
    ? {
        folderName: folder.name,
        ...(await Promise.all([ownerName(admin, folder.id), folderFiles(admin, folder.id)]).then(
          ([owner, files]) => ({ ownerName: owner, files }),
        )),
      }
    : null;

  return <UploadPageView initialLang={lang} token={token} link={link} />;
}

// Who the files are for: whoever created the folder, or — for folders from
// before that was recorded — whoever shared the link.
async function ownerName(admin: Admin, folderId: string): Promise<string | null> {
  const [{ data: folder }, { data: link }] = await Promise.all([
    admin.from("folders").select("created_by").eq("id", folderId).maybeSingle(),
    admin.from("folder_upload_links").select("created_by").eq("folder_id", folderId).maybeSingle(),
  ]);
  const userId = folder?.created_by ?? link?.created_by;
  if (!userId) return null;
  const { data: user } = await admin.from("users").select("email").eq("id", userId).maybeSingle();
  return user ? shortName(user.email) : null;
}

// Just this folder's own files, as bare listing rows — no storage paths or
// subfolders, since none of those are anything this page needs.
async function folderFiles(admin: Admin, folderId: string): Promise<UploadedFile[]> {
  const [{ data: media, error: mediaError }, { data: decks, error: decksError }] = await Promise.all([
    admin
      .from("media_items")
      .select("id, name, media_type, created_at")
      .eq("folder_id", folderId)
      .is("deck_id", null)
      .neq("media_type", "page"),
    admin.from("decks").select("id, name, created_at").eq("folder_id", folderId),
  ]);
  if (mediaError) throw new Error(mediaError.message);
  if (decksError) throw new Error(decksError.message);

  const files: UploadedFile[] = [
    ...(media ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.media_type === "video" ? ("video" as const) : ("image" as const),
      createdAt: item.created_at,
    })),
    ...(decks ?? []).map((deck) => ({ id: deck.id, name: deck.name, icon: "pdf" as const, createdAt: deck.created_at })),
  ];
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
