import { mediaPublicUrl } from "@/types/domain";
import type { MediaItem } from "@/types/domain";

export function MediaThumb({ item }: { item: MediaItem }) {
  if (item.media_type === "image") {
    const url = mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={item.name} className="h-full w-full object-cover" />;
  }

  const icon = item.media_type === "video" ? "▶" : "▤";
  return (
    <div className="flex h-full w-full items-center justify-center text-2xl text-muted">
      {icon}
    </div>
  );
}
