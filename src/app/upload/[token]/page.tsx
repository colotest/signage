import type { Metadata } from "next";
import { brandFont } from "@/lib/fonts";
import { createAdminClient } from "@/lib/supabase/admin";
import { folderForUploadLink } from "@/lib/uploads/links";
import { kindLabel } from "@/lib/utils/format";
import { UploadWindow, type UploadedFile } from "./UploadWindow";

export const metadata: Metadata = {
  title: "Upload Files — Colo Cloud",
  robots: { index: false, follow: false },
};

// Someone outside the team, handed a folder's upload link. They can add
// files to that one folder and see what's already in it — nothing about
// any other folder is ever fetched for this page, let alone sent to it.
// The proxy leaves /upload/* open (see src/proxy.ts); the token is the
// whole of the access check, done again by every action the page calls.
export default async function UploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const folder = await folderForUploadLink(admin, token);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pb-24 pt-10 sm:pt-14">
        <h1 className={`${brandFont.className} text-center text-[52px] uppercase leading-none tracking-tight`}>
          Colo Cloud
        </h1>
        {folder ? (
          <UploadWindow token={token} folderName={folder.name} files={await folderFiles(admin, folder.id)} />
        ) : (
          <div className="mt-10 max-w-sm text-center">
            <p className="text-[17px] font-semibold">This upload link isn&apos;t active.</p>
            <p className="mt-1 text-sm text-muted">
              It may have been turned off, or the folder it pointed to was removed. Ask whoever sent it for a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Just this folder's own files, as bare listing rows — no storage paths,
// ids or subfolders, since none of those are anything this page needs.
async function folderFiles(admin: ReturnType<typeof createAdminClient>, folderId: string): Promise<UploadedFile[]> {
  const [{ data: media, error: mediaError }, { data: decks, error: decksError }] = await Promise.all([
    admin
      .from("media_items")
      .select("id, name, media_type, mime_type, size_bytes, created_at")
      .eq("folder_id", folderId)
      .neq("media_type", "page"),
    admin.from("decks").select("id, name, size_bytes, page_count, created_at").eq("folder_id", folderId),
  ]);
  if (mediaError) throw new Error(mediaError.message);
  if (decksError) throw new Error(decksError.message);

  const files: UploadedFile[] = [
    ...(media ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      kind: kindLabel(item),
      icon: item.media_type === "video" ? ("video" as const) : ("image" as const),
      sizeBytes: item.size_bytes,
      createdAt: item.created_at,
    })),
    ...(decks ?? []).map((deck) => ({
      id: deck.id,
      name: deck.name,
      kind: `PDF · ${deck.page_count} page${deck.page_count === 1 ? "" : "s"}`,
      icon: "pdf" as const,
      sizeBytes: deck.size_bytes,
      createdAt: deck.created_at,
    })),
  ];
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
