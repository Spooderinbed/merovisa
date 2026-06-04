import "server-only";
import sharp from "sharp";
import * as Tesseract from "tesseract.js";

export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 1000;
  const height = metadata.height ?? 1000;
  const shorter = Math.min(width, height);
  const scale = shorter < 2000 ? 2000 / shorter : 1;

  return sharp(buffer)
    .resize({ width: Math.round(width * scale) })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
}

export async function recognizeText(imageBuffer: Buffer): Promise<string> {
  const processed = await preprocessImage(imageBuffer);
  const { data } = await Tesseract.recognize(processed, "eng");
  return data.text;
}
