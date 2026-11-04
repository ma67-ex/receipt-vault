import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit, readJson, clientIp } from "./rate-limit.js";

test("rateLimit allows up to the limit per minute, then refuses until the window resets", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit("u1", 3, t0 + i).ok, true);
  const r = rateLimit("u1", 3, t0 + 10);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfter >= 59 && r.retryAfter <= 60);
  assert.equal(rateLimit("u2", 3, t0 + 10).ok, true, "other keys are independent");
  assert.equal(rateLimit("u1", 3, t0 + 60_001).ok, true, "window reset");
});

test("readJson caps the body regardless of Content-Length and tolerates junk", async () => {
  const mk = (body) => new Request("http://x/", { method: "POST", body });
  assert.deepEqual(await readJson(mk('{"id":"abc"}'), 1024), { id: "abc" });
  assert.deepEqual(await readJson(mk("x".repeat(2000)), 1024), {});
  assert.deepEqual(await readJson(mk("{not json"), 1024), {});
});

test("clientIp prefers x-real-ip, takes the first forwarded hop, and is empty when unknown", () => {
  const h = (o) => ({ headers: new Headers(o) });
  assert.equal(clientIp(h({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(clientIp(h({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" })), "5.6.7.8");
  assert.equal(clientIp(h({})), "");
});
