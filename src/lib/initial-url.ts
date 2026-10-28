export function normalizeInitialUrl(href: string, rootPath: string): URL {
  const url = new URL(href);
  if (url.pathname === '') url.pathname = rootPath;
  return url;
}
