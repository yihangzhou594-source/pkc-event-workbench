import crypto from 'node:crypto';
export function obsReadAllowed(method, path) {
  if (method !== 'GET') return false;
  return /^\/obs(?:\/|$)/.test(path) || ['/api/obs/stream','/api/obs/teams','/api/obs/hero-picks','/api/heroes','/api/tencent-heroes'].includes(path)
    || ['/assets/','/hero/','/thumb/','/opt/','/hicon/'].some(prefix=>path.startsWith(prefix));
}
export function tokenMatches(value, expected) {
  if (!value || !expected) return false;
  const a=Buffer.from(String(value)),b=Buffer.from(String(expected));
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
