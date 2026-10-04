"use client";

// Short side of an uploaded image, in pixels. The screens are 1080p, so
// anything past this is detail none of them can show — and a 12 MP phone
// photo is a lot for a TV stick to decode and scale on every slide change.
const MAX_SHORT_SIDE = 1080;
// Same as the rendered PDF pages: indistinguishable at screen size.
const JPEG_QUALITY = 0.92;

// Formats a canvas can write back out as themselves. GIFs would lose their
// animation and SVGs their scalability, so those (and anything else) go up
// untouched.
const REENCODABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Gets an image ready for the screens, in the uploader's browser: rotation
// baked into the pixels, and scaled down to MAX_SHORT_SIDE. A phone photo
// taken upright is usually stored sideways with an EXIF flag saying "turn
// this when showing it", and older TV browsers apply that flag
// inconsistently — with object-fit: cover, some place the photo against an
// edge instead of centring it. Redrawn upright, there's no flag left to get
// wrong. Anything this can't handle comes back as the original file.
export async function prepareImage(file: File): Promise<File> {
  if (!REENCODABLE_TYPES.includes(file.type)) return file;

  try {
    const [orientation, img] = await Promise.all([readJpegOrientation(file), loadImage(file)]);
    // naturalWidth/Height are already the upright dimensions — every
    // browser that can reach the dashboard applies the flag when decoding.
    const { naturalWidth: width, naturalHeight: height } = img;
    const scale = Math.min(1, MAX_SHORT_SIDE / Math.min(width, height));
    if (scale === 1 && orientation === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.imageSmoothingQuality = "high";
    context.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, JPEG_QUALITY));
    canvas.width = 0;
    canvas.height = 0;
    // A browser that can't write this format (Safari and WebP) quietly
    // hands back a PNG instead, which wouldn't match the file's extension.
    if (!blob || blob.type !== file.type) return file;

    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  return img
    .decode()
    .then(() => img)
    .finally(() => URL.revokeObjectURL(url));
}

// The EXIF orientation tag of a JPEG (1 = upright, the default when there's
// none). Only the file's first 64 KB are read — the EXIF block sits right
// at the start. Other formats rarely carry the tag, so they count as 1.
async function readJpegOrientation(file: File): Promise<number> {
  if (file.type !== "image/jpeg") return 1;
  const view = new DataView(await file.slice(0, 64 * 1024).arrayBuffer());
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    // APP1 holding "Exif\0\0", then a TIFF header.
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    // Start of scan: the image data itself, no EXIF past this point.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return 1;
    offset += 2 + length;
  }
  return 1;
}
