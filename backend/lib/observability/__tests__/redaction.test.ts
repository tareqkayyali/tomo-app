import { redactMessage, redactMetadata, redactStack } from "../redaction";

describe("redaction helpers", () => {
  it("redacts message secrets and contact info", () => {
    const msg =
      "Bearer abc.def.ghi contact me at test@example.com phone +966-555-123-456";
    const redacted = redactMessage(msg);
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("test@example.com");
    expect(redacted).not.toContain("+966");
  });

  it("deep-redacts nested metadata keys", () => {
    const redacted = redactMetadata({
      token: "secret",
      safe: "ok",
      nested: {
        email: "test@example.com",
        payload: {
          body: "hello",
          list: [{ password: "p" }],
        },
      },
    });

    expect(redacted.token).toBe("[redacted]");
    expect((redacted.nested as any).email).toBe("[redacted]");
    expect((redacted.nested as any).payload).toBe("[redacted]");
  });

  it("redacts stack traces", () => {
    const stack = "Error: boom\n at fn (/Users/a/eyJabc.def.ghi/file.ts:1:1)";
    const redacted = redactStack(stack);
    expect(redacted).not.toContain("eyJabc.def.ghi");
  });
});
