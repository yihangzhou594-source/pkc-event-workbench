import crypto from "node:crypto";

export class RemoteControlError extends Error {
  constructor(code, message, retryAfterMs = 0) {
    super(message);
    this.name = "RemoteControlError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function createRemoteControl(options = {}) {
  const now = options.now || Date.now;
  const pinTtlMs = Number(options.pinTtlMs) || 10 * 60 * 1000;
  const sessionTtlMs = Number(options.sessionTtlMs) || 8 * 60 * 60 * 1000;
  const maxSessions = Math.max(1, Number(options.maxSessions) || 3);
  const failureWindowMs = Number(options.failureWindowMs) || 5 * 60 * 1000;
  const maxFailures = Math.max(1, Number(options.maxFailures) || 5);
  const lockMs = Number(options.lockMs) || 2 * 60 * 1000;
  const pinGenerator = options.pinGenerator
    || (() => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"));
  const tokenGenerator = options.tokenGenerator
    || (() => crypto.randomBytes(32).toString("base64url"));
  const csrfGenerator = options.csrfGenerator
    || (() => crypto.randomBytes(24).toString("base64url"));

  let pin = "";
  let pinExpiresAt = 0;
  const sessions = new Map();
  const failures = new Map();

  function refreshPin() {
    pin = pinGenerator();
    pinExpiresAt = now() + pinTtlMs;
    return accessInfo();
  }

  function accessInfo() {
    if (!pin || now() >= pinExpiresAt) refreshPin();
    return {
      pin,
      pinExpiresAt,
      pinTtlMs,
      sessionTtlMs,
      sessionCount: sessions.size,
      maxSessions,
    };
  }

  function activeFailure(ip) {
    const item = failures.get(ip);
    if (!item) return null;
    if (item.lockedUntil && item.lockedUntil > now()) return item;
    if (item.lockedUntil && item.lockedUntil <= now()) failures.delete(ip);
    else if (now() - item.firstAt >= failureWindowMs) failures.delete(ip);
    return failures.get(ip) || null;
  }

  function recordFailure(ip) {
    const current = activeFailure(ip) || { firstAt: now(), count: 0, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= maxFailures) current.lockedUntil = now() + lockMs;
    failures.set(ip, current);
  }

  function pair({ pin: suppliedPin, ip = "unknown", deviceName = "远程设备" } = {}) {
    const address = String(ip || "unknown");
    const failure = activeFailure(address);
    if (failure?.lockedUntil > now()) {
      throw new RemoteControlError(
        "rate_limited",
        "口令尝试次数过多，请稍后再试",
        failure.lockedUntil - now(),
      );
    }
    accessInfo();
    if (!safeEqual(String(suppliedPin || "").trim(), pin)) {
      recordFailure(address);
      throw new RemoteControlError("invalid_pin", "远程口令不正确");
    }
    failures.delete(address);
    while (sessions.size >= maxSessions) {
      const oldest = Array.from(sessions.entries())
        .sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (!oldest) break;
      sessions.delete(oldest[0]);
    }
    const sessionId = tokenGenerator();
    const session = {
      id: sessionId,
      csrf: csrfGenerator(),
      ip: address,
      deviceName: String(deviceName || "远程设备").trim().slice(0, 40) || "远程设备",
      createdAt: now(),
      expiresAt: now() + sessionTtlMs,
    };
    sessions.set(sessionId, session);
    return { ...session, sessionId };
  }

  function authenticate(sessionId) {
    if (!sessionId) return null;
    const session = sessions.get(String(sessionId));
    if (!session) return null;
    if (session.expiresAt <= now()) {
      sessions.delete(session.id);
      return null;
    }
    return { ...session };
  }

  function verifyCsrf(sessionId, csrf) {
    const session = authenticate(sessionId);
    return !!session && safeEqual(session.csrf, csrf);
  }

  function revoke(sessionId) {
    return sessions.delete(String(sessionId || ""));
  }

  function sessionCount() {
    for (const session of sessions.values()) {
      if (session.expiresAt <= now()) sessions.delete(session.id);
    }
    return sessions.size;
  }

  refreshPin();

  return {
    accessInfo,
    refreshPin,
    pair,
    authenticate,
    verifyCsrf,
    revoke,
    sessionCount,
  };
}
