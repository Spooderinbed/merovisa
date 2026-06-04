import { describe, test, expect } from "vitest";
import {
  sanitizeFilename,
  verifyImageMagic,
  extensionFor,
} from "@/lib/documents/upload-validation";

describe("sanitizeFilename", () => {
  test("keeps safe characters", () => {
    expect(sanitizeFilename("photo.jpg")).toBe("photo.jpg");
    expect(sanitizeFilename("my-document_2024.png")).toBe("my-document_2024.png");
  });

  test("replaces path traversal characters", () => {
    // Dots are kept (valid in filenames); slashes are replaced with _.
    expect(sanitizeFilename("../etc/passwd")).toBe(".._etc_passwd");
  });

  test("strips control characters and NUL", () => {
    // space is replaced with _ then collapsed
    expect(sanitizeFilename("foo bar.png")).toBe("foo_bar.png");
    expect(sanitizeFilename("foo\x00bar.png")).toBe("foobar.png");
  });

  test("caps length at 100 chars", () => {
    const long = "a".repeat(200) + ".png";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(100);
  });

  test("returns 'upload' for empty input after cleaning", () => {
    expect(sanitizeFilename("\x00\x01")).toBe("upload");
    expect(sanitizeFilename("")).toBe("upload");
  });
});

describe("verifyImageMagic", () => {
  test("PNG bytes verify as image/png", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(verifyImageMagic(png, "image/png")).toBe(true);
    expect(verifyImageMagic(png, "image/jpeg")).toBe(false);
  });

  test("JPEG bytes verify as image/jpeg", () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(verifyImageMagic(jpeg, "image/jpeg")).toBe(true);
    expect(verifyImageMagic(jpeg, "image/png")).toBe(false);
  });

  test("WebP bytes verify as image/webp", () => {
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0,
      0x57, 0x45, 0x42, 0x50,
    ]);
    expect(verifyImageMagic(webp, "image/webp")).toBe(true);
    expect(verifyImageMagic(webp, "image/png")).toBe(false);
  });

  test("rejects garbage bytes", () => {
    expect(verifyImageMagic(Buffer.from("not an image yet"), "image/png")).toBe(false);
    expect(verifyImageMagic(Buffer.alloc(5), "image/png")).toBe(false);
  });
});

describe("extensionFor", () => {
  test("maps known MIME types", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
  });

  test("unknown returns 'bin'", () => {
    expect(extensionFor("application/pdf")).toBe("bin");
  });
});
