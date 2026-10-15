/** Host + path key for joining the same page across Search Console, GA4, and
 *  audit URLs: lowercases the host, drops default ports, query, fragment, and
 *  trailing slashes. Returns null for empty or unparseable values. */
export function normalizePageKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(not set)") return null;
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    let host = url.hostname.toLowerCase();
    const defaultPort =
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443");
    if (url.port && !defaultPort) host += `:${url.port}`;
    let path = url.pathname || "/";
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}
