function hasUnsafeCharacters(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) <= 32 || character === '\\');
}

// Only local application paths are accepted, including after URL normalization.
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || hasUnsafeCharacters(value)) return '/dashboard';
  try {
    const base = 'https://app.invalid';
    const url = new URL(value, base);
    const pathname = decodeURIComponent(url.pathname);
    if (url.origin !== base || hasUnsafeCharacters(pathname) || pathname.startsWith('//')
      || /^\/(?:api|auth|login|register|complete-profile)(?:\/|$)/.test(pathname)) return '/dashboard';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/dashboard';
  }
}
