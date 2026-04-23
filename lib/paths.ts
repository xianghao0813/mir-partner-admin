export const ADMIN_BASE_PATH = "/admin";

export function adminPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${ADMIN_BASE_PATH}${normalized}`;
}
