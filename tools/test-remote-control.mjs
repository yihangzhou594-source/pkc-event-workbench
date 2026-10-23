import assert from "node:assert/strict";
import { createRemoteControl, RemoteControlError } from "../lib/remote-control.mjs";
import { isLoopbackAddress, remoteRequestAllowed } from "../lib/remote-access-policy.mjs";

let now = Date.UTC(2026, 9, 23, 10, 0, 0);
let tokenNo = 0;
let pinNo = 0;
const remote = createRemoteControl({
  now: () => now,
  pinGenerator: () => ["123456", "654321"][pinNo++] || "654321",
  tokenGenerator: () => "session-" + (++tokenNo).toString().padStart(2, "0"),
  pinTtlMs: 10 * 60 * 1000,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  maxSessions: 2,
});

const access = remote.accessInfo();
assert.equal(access.pin, "123456");
assert.equal(access.pinExpiresAt, now + 10 * 60 * 1000);

const paired = remote.pair({ pin: "123456", ip: "10.68.20.7", deviceName: "iPhone" });
assert.equal(paired.sessionId, "session-01");
assert.ok(paired.csrf.length >= 16);
assert.equal(remote.authenticate(paired.sessionId)?.deviceName, "iPhone");
assert.equal(remote.verifyCsrf(paired.sessionId, paired.csrf), true);
assert.equal(remote.verifyCsrf(paired.sessionId, "wrong"), false);

for (let i = 0; i < 5; i++) {
  assert.throws(
    () => remote.pair({ pin: "000000", ip: "10.68.20.8", deviceName: "bad" }),
    (error) => error instanceof RemoteControlError && error.code === "invalid_pin",
  );
}
assert.throws(
  () => remote.pair({ pin: "123456", ip: "10.68.20.8", deviceName: "locked" }),
  (error) => error.code === "rate_limited" && error.retryAfterMs > 0,
);

now += 2 * 60 * 1000 + 1;
const second = remote.pair({ pin: "123456", ip: "10.68.20.8", deviceName: "Android" });
assert.equal(remote.sessionCount(), 2);
const third = remote.pair({ pin: "123456", ip: "10.68.20.9", deviceName: "Tablet" });
assert.equal(remote.sessionCount(), 2);
assert.equal(remote.authenticate(paired.sessionId), null);
assert.ok(remote.authenticate(second.sessionId));
assert.ok(remote.authenticate(third.sessionId));

now += 10 * 60 * 1000 + 1;
assert.notEqual(remote.accessInfo().pin, "123456");

now += 8 * 60 * 60 * 1000;
assert.equal(remote.authenticate(second.sessionId), null);
assert.equal(remote.authenticate(third.sessionId), null);
assert.equal(remote.sessionCount(), 0);

assert.equal(isLoopbackAddress("127.0.0.1"), true);
assert.equal(isLoopbackAddress("::1"), true);
assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
assert.equal(isLoopbackAddress("10.68.20.7"), false);
assert.equal(remoteRequestAllowed("/remote"), true);
assert.equal(remoteRequestAllowed("/api/remote/pair"), true);
assert.equal(remoteRequestAllowed("/api/remote/state"), true);
assert.equal(remoteRequestAllowed("/api/store/library"), false);
assert.equal(remoteRequestAllowed("/generator"), false);

console.log("test-remote-control: ok");
