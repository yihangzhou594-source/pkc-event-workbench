export function isLoopbackAddress(address) {
  const value = String(address || "").toLowerCase();
  return value === "127.0.0.1"
    || value === "::1"
    || value === "0:0:0:0:0:0:0:1"
    || value === "::ffff:127.0.0.1";
}

export function remoteRequestAllowed(pathname) {
  const path = String(pathname || "");
  return path === "/remote"
    || path === "/remote/"
    || path.startsWith("/api/remote/");
}
