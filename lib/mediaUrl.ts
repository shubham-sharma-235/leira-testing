/**
 * Resolve product/blog/video media paths to a public URL.
 * Prefer CloudFront (`NEXT_PUBLIC_MEDIA_URL`); fall back to backend `/uploads` in dev.
 *
 * Site assets that live in `public/` (banners, logos, how-to-use images, videos…)
 * go through `staticAssetUrl`, which points at `NEXT_PUBLIC_STATIC_ASSETS_URL`
 * (e.g. https://media.leiraindia.com/static) when set, else the local `public/` path.
 */

export const PLACEHOLDER_IMAGE = "/images/placeholder.png";

/** Hosts whose `/uploads/...` URLs were stored in the DB before the S3 cutover. */
const LEGACY_UPLOAD_HOSTS = new Set(["leiraindia.com", "www.leiraindia.com"]);

function safeEncodeUrl(value: string): string {
  try {
    return encodeURI(decodeURI(value));
  } catch {
    return encodeURI(value);
  }
}

export function getMediaBaseUrl(): string {
  const media = process.env.NEXT_PUBLIC_MEDIA_URL?.replace(/\/$/, "");
  if (media) return media;
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") || "http://localhost:5000"
  );
}

export function getStaticAssetBaseUrl(): string {
  return process.env.NEXT_PUBLIC_STATIC_ASSETS_URL?.trim().replace(/\/$/, "") || "";
}

/**
 * URL for a file under `public/` (pass the same path you'd use locally, e.g. "/images/logo.png").
 * The placeholder stays local so image `onError` fallbacks still work if the CDN is unreachable.
 */
export function staticAssetUrl(path: string): string {
  const localPath = path.startsWith("/") ? path : `/${path}`;
  const base = getStaticAssetBaseUrl();
  if (!base || localPath === PLACEHOLDER_IMAGE) return localPath;
  return safeEncodeUrl(`${base}${localPath}`);
}

function isUploadPath(normalizedPath: string): boolean {
  return (
    normalizedPath.startsWith("/uploads/") ||
    normalizedPath.startsWith("uploads/") ||
    normalizedPath.startsWith("/api/uploads/") ||
    normalizedPath.startsWith("api/uploads/")
  );
}

function uploadPathToKey(normalizedPath: string): string {
  const withoutApi = normalizedPath.replace(/^\/?api\//, "/");
  const withSlash = withoutApi.startsWith("/") ? withoutApi : `/${withoutApi}`;
  return withSlash.replace(/^\/?uploads\/?/, "").replace(/^\/+/, "");
}

function legacyUploadUrlToMedia(absoluteUrl: string): string | null {
  if (!process.env.NEXT_PUBLIC_MEDIA_URL) return null;
  try {
    const u = new URL(absoluteUrl);
    if (!LEGACY_UPLOAD_HOSTS.has(u.hostname) || !isUploadPath(u.pathname)) return null;
    return `${getMediaBaseUrl()}/${uploadPathToKey(u.pathname)}`;
  } catch {
    return null;
  }
}

/**
 * Resolve any stored media reference to a browser-loadable URL.
 */
export function resolveMediaUrl(path: string | undefined | null): string {
  if (!path) return PLACEHOLDER_IMAGE;

  const normalizedPath = String(path).replace(/\\/g, "/").trim();
  if (!normalizedPath) return PLACEHOLDER_IMAGE;

  if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
    return safeEncodeUrl(legacyUploadUrlToMedia(normalizedPath) ?? normalizedPath);
  }

  if (isUploadPath(normalizedPath)) {
    const key = uploadPathToKey(normalizedPath);
    return safeEncodeUrl(`${getMediaBaseUrl()}/${key}`);
  }

  return staticAssetUrl(normalizedPath);
}

/** @deprecated use resolveMediaUrl */
export const getImageUrl = resolveMediaUrl;
