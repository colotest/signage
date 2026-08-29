import type { MediaType } from "@/types/domain";

export type FileMetadata = {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

const EMPTY_METADATA: FileMetadata = { width: null, height: null, durationSeconds: null };

// Reads intrinsic dimensions/duration straight out of the decoded file in
// the browser, before upload — there's no server-side ffprobe pipeline, so
// this is the only place this information is ever available.
export function inspectFile(file: File, mediaType: MediaType): Promise<FileMetadata> {
  if (mediaType === "pdf") return Promise.resolve(EMPTY_METADATA);

  const url = URL.createObjectURL(file);

  if (mediaType === "image") {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight, durationSeconds: null });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve(EMPTY_METADATA);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(EMPTY_METADATA);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}
