export function safeNext(input: string | null | undefined): string | null {
  if (!input) return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  if (input.startsWith("/\\")) return null;
  return input;
}
