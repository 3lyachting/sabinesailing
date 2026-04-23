const normalizeBasePath = (rawPath: string | undefined): string => {
  const fallback = "/home/";
  const candidate = (rawPath || fallback).trim();
  if (!candidate) return fallback;
  const withLeadingSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

export const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL);

export const withBasePath = (relativePath: string): string => {
  const clean = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
  return `${APP_BASE_PATH}${clean}`;
};
