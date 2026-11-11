import assert from "node:assert/strict";
import { InfraiClient, registerTechnician } from "./field_service_signup.ts";

const calls: string[] = [];
const request: typeof fetch = async (input, init) => {
  calls.push(String(input));
  const path = String(input);
  const data = path.endsWith("/captcha/verify") ? { accepted: true } : { user_id: "user-42" };
  return new Response(JSON.stringify({ ok: true, data, metadata: {} }), { status: 200, headers: { "content-type": "application/json" } });
};

const result = await registerTechnician(new InfraiClient("test-key", request, "https://example.test/v1"), { email: "tech@example.com", password: "correct-horse", name: "Kai Chen", metadata: {}, vendor: "hcaptcha", mode: "default_vendor", idempotency_key: "signup-42" }, "captcha-token", "widget-42", "203.0.113.4");
assert.equal(result.status, "created");
if (result.status === "created") {
  assert.equal(result.profile.dispatchStatus, "unassigned");
  assert.equal(result.profile.technicianFollowUp, "pending");
  assert.deepEqual(result.profile.workOrderPhotos, []);
}
assert.deepEqual(calls, ["https://example.test/v1/captcha/verify", "https://example.test/v1/auth/user/create"]);
console.log("signup decision test passed");
