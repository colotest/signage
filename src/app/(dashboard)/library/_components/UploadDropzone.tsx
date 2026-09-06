"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export function UploadDropzone({
  uploading,
  onUploadFiles,
}: {
  uploading: number;
  onUploadFiles: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onUploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={uploading > 0}>
        {uploading > 0 ? <Spinner /> : null}
        {uploading > 0 ? `Uploading ${uploading}…` : "+ Upload"}
      </Button>
    </div>
  );
}
