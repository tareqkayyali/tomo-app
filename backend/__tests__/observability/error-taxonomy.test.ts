import { buildFingerprint } from "@/lib/observability/error-taxonomy";

describe("buildFingerprint", () => {
  it("returns exactly 16 lowercase hex characters", () => {
    const fp = buildFingerprint("TomoError", "/api/v1/chat/agent", "at chat:42");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildFingerprint("AuthError", "/api/v1/today", "at today:10");
    const b = buildFingerprint("AuthError", "/api/v1/today", "at today:10");
    expect(a).toBe(b);
  });

  it("differs across different inputs", () => {
    const a = buildFingerprint("TomoError", "/api/a", "stack-1");
    const b = buildFingerprint("TomoError", "/api/b", "stack-1");
    const c = buildFingerprint("TomoError", "/api/a", "stack-2");
    const d = buildFingerprint("AuthError", "/api/a", "stack-1");
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it("handles non-ASCII inputs without throwing", () => {
    const fp = buildFingerprint("TomoError", "/api/v1/today", "throw at المسار:42");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles empty stackTop without producing a duplicate of another input", () => {
    const a = buildFingerprint("TomoError", "/api/x", "");
    const b = buildFingerprint("TomoError", "/api/x", "no-stack");
    expect(a).not.toBe(b);
  });
});
