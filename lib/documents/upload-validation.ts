/**
 * Pure validation helpers for the document upload endpoint.
 * No server-only imports — safe to import in unit tests.
 */

/**
 * Strip path traversal sequences, control characters, NUL bytes, and any
 * characters outside the safe set [a-zA-Z0-9._-].  Collapses consecutive
 * underscores and caps at 100 characters.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\x00-\x1f\x7f]/g, "") // control chars + DEL
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
  return cleaned || "upload";
}

/**
 * Verify the leading bytes of a buffer match the declared MIME type.
 * Defends against MIME spoofing where an attacker sends arbitrary content
 * under a trusted Content-Type. Covers the image types plus PDF — the real
 * format of transcripts, offer letters, loan sanctions, and CoEs.
 */
export function verifyFileMagic(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 12) return false;

  // PDF: 25 50 44 46 ("%PDF")
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return declaredType === "application/pdf";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return declaredType === "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return declaredType === "image/png";
  }

  // WebP: "RIFF" ?? ?? ?? ?? "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return declaredType === "image/webp";
  }

  return false;
}

/** Map a validated MIME type to a safe file extension. */
export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}
