'use client';

import { useRef, useState } from 'react';

/**
 * The photo upload, with the photo shrunk on the phone before it is sent.
 *
 * This exists because uploads were failing outright. A photo straight off a
 * phone camera is two to four megabytes; Next.js rejects any Server Action
 * request over one megabyte before the action even runs, so the upload never
 * reached the code that would have explained the problem, and the admin got a
 * generic error page instead.
 *
 * Raising the limit alone would not have been enough: Vercel caps a
 * function's request body at 4.5MB regardless, and newer phones shoot bigger
 * than that. Shrinking at the source fixes it for every phone, and is the
 * right thing anyway -- the largest place a face appears in this app is a
 * 128-pixel circle, so sending twelve megapixels to draw it wastes the
 * admin's data and everyone's page load.
 *
 * The longest side comes down to `MAX_EDGE`, re-encoded as JPEG. A typical
 * phone photo leaves at a few hundred kilobytes. If the browser cannot decode
 * the file for any reason, the original is sent untouched and the server's
 * own checks decide -- shrinking is an improvement, never a gate.
 */

/** Twice the largest display size, with room to spare for a crop. */
// Exported, with `shrink`, so the resize can be exercised in a real browser --
// jsdom has no canvas, and a faked one would test nothing that matters here.
export const MAX_EDGE = 640;
const QUALITY = 0.85;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // `createImageBitmap` with `from-image` honours the camera's orientation
  // flag. Without it a portrait phone photo can arrive lying on its side.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to the element path, which every browser supports.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function shrink(file: File): Promise<File> {
  const image = await decode(file);
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height;

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  // JPEG has no transparency. Without a fill, a transparent PNG's background
  // comes out black; white matches how the avatars sit on the page.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  // Keep whichever is smaller. A small image that was already well
  // compressed can come out larger after a re-encode.
  if (!blob || blob.size >= file.size) return file;

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}

export function PhotoUploadForm({
  action,
  leagueId,
  slug,
  playerId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  leagueId: string;
  slug: string;
  playerId: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'working' | 'ready'>('idle');

  async function onChange() {
    const el = input.current;
    const file = el?.files?.[0];
    if (!el || !file) {
      setState('idle');
      return;
    }
    setState('working');
    try {
      const smaller = await shrink(file);
      if (smaller !== file) {
        // Swap the chosen file for the shrunk one, so the form submits it
        // exactly as it would have submitted the original.
        const swap = new DataTransfer();
        swap.items.add(smaller);
        el.files = swap.files;
      }
    } catch {
      // Leave the original in place; the server decides.
    }
    setState('ready');
  }

  return (
    <form action={action} className="mt-1.5 flex flex-wrap items-center gap-2">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="playerId" value={playerId} />
      <input
        ref={input}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onChange}
        className="w-56 text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-slate-200 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
      />
      <button
        type="submit"
        disabled={state === 'working'}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:border-fairway-500 hover:text-fairway-600 disabled:opacity-50 dark:border-slate-800"
      >
        {state === 'working' ? 'Preparing…' : 'Upload photo'}
      </button>
    </form>
  );
}
