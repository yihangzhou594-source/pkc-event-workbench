import assert from "node:assert/strict";
import { createAuthGate } from "../lib/auth-gate.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls = [];
const remote = async (url, init = {}) => {
  calls.push({ url, init });
  if (url.includes("grant_type=password")) {
    const body = JSON.parse(init.body);
    if (body.password !== "correct-password") {
      return jsonResponse({ error_description: "Invalid login credentials" }, 400);
    }
    return jsonResponse({
      access_token: "access-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
      user: { id: "user-1", email: body.email },
    });
  }
  if (url.startsWith("/auth/v1/signup")) {
    const body = JSON.parse(init.body);
    return jsonResponse({
      id: "new-user-1",
      email: body.email,
      confirmation_sent_at: "2026-10-27T00:00:00.000Z",
      session: null,
    });
  }
  if (url.includes("grant_type=refresh_token")) {
    return jsonResponse({
      access_token: "access-2",
      refresh_token: "refresh-2",
      expires_in: 3600,
      user: { id: "user-1", email: "owner@example.com" },
    });
  }
  if (url.endsWith("/auth/v1/user")) {
    const token = init.headers.Authorization.replace(/^Bearer\s+/, "");
    if (token === "access-1" || token === "access-2") {
      return jsonResponse({ id: "user-1", email: "owner@example.com" });
    }
    return jsonResponse({ message: "invalid JWT" }, 401);
  }
  if (url.endsWith("/auth/v1/logout")) return new Response("", { status: 204 });
  throw new Error("unexpected request: " + url);
};

const gate = createAuthGate({
  enabled: true,
  supabaseUrl: "https://example.supabase.co",
  anonKey: "anon-test",
  fetchImpl: remote,
  now: () => 1_000_000,
  secureCookies: false,
});

assert.equal(gate.publicPath("/login"), true);
assert.equal(gate.publicPath("/api/auth/login"), true);
assert.equal(gate.publicPath("/api/auth/register"), true);
assert.equal(gate.publicPath("/healthz"), true);
assert.equal(gate.publicPath("/api/store/library"), false);

const login = await gate.login("owner@example.com", "correct-password");
assert.equal(login.ok, true);
assert.equal(login.user.email, "owner@example.com");
assert.equal(login.accessToken, "access-1");
const loginCookies = gate.sessionCookies(login);
assert.ok(loginCookies.some((cookie) => cookie.startsWith("pkc_auth_access=access-1;")));
assert.ok(loginCookies.every((cookie) => cookie.includes("HttpOnly")));
assert.ok(loginCookies.every((cookie) => cookie.includes("SameSite=Strict")));

const ordinaryUser = await gate.login("new@example.com", "correct-password");
assert.equal(ordinaryUser.ok, true);
assert.equal(ordinaryUser.user.email, "new@example.com");

const badPassword = await gate.login("owner@example.com", "wrong-password");
assert.equal(badPassword.ok, false);
assert.equal(badPassword.status, 401);

const registration = await gate.register(
  "new@example.com",
  "strong-password",
  "https://pkc.example.com/login?confirmed=1",
);
assert.equal(registration.ok, true);
assert.equal(registration.requiresConfirmation, true);
assert.equal(registration.email, "new@example.com");
assert.match(registration.message, /验证邮件/);
const signupCall = calls.find((call) => call.url.startsWith("/auth/v1/signup"));
assert.ok(signupCall.url.includes(encodeURIComponent("https://pkc.example.com/login?confirmed=1")));
assert.deepEqual(JSON.parse(signupCall.init.body), {
  email: "new@example.com",
  password: "strong-password",
  data: {},
});

const weakRegistration = await gate.register("new@example.com", "short", "https://pkc.example.com/login");
assert.equal(weakRegistration.ok, false);
assert.equal(weakRegistration.status, 400);
assert.equal(weakRegistration.error, "weak_password");

const valid = await gate.resolveSession({
  accessToken: "access-1",
  refreshToken: "refresh-1",
});
assert.equal(valid.ok, true);
assert.equal(valid.user.email, "new@example.com");

const refreshed = await gate.resolveSession({
  accessToken: "expired-access",
  refreshToken: "refresh-1",
});
assert.equal(refreshed.ok, true);
assert.equal(refreshed.accessToken, "access-2");
assert.equal(refreshed.refreshToken, "refresh-2");
assert.equal(refreshed.refreshed, true);

const missing = await gate.resolveSession({});
assert.deepEqual(missing, {
  ok: false,
  status: 401,
  error: "auth_required",
  message: "请先登录",
});

const cleared = gate.clearCookies();
assert.ok(cleared.some((cookie) => cookie.includes("Max-Age=0")));

console.log("test-auth-gate: ok");
