export function canonicalizeContentOptimizationUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  return url.toString();
}
