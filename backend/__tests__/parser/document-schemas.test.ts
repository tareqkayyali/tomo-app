/**
 * Methodology document schema tests — lock in the regression where saving
 * a partial-update body triggered the create-time `source_text || source_file_url`
 * refine and rejected the save with a generic "Validation failed".
 */

import {
  documentWriteSchema,
  documentUpdateSchema,
} from "@/lib/validation/admin/directiveSchemas";

describe("document schemas", () => {
  describe("documentWriteSchema (create)", () => {
    it("accepts a valid create body with source_text", () => {
      const result = documentWriteSchema.safeParse({
        title: "How tomo talks",
        source_format: "markdown",
        source_text: "Tomo speaks like a steady, knowledgeable coach.",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a create body that has neither source_text nor source_file_url", () => {
      const result = documentWriteSchema.safeParse({
        title: "Empty doc",
        source_format: "markdown",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.flatten().formErrors;
        expect(messages.some((m) => m.includes("source_text or source_file_url"))).toBe(true);
      }
    });

    it("accepts a create body with source_file_url only", () => {
      const result = documentWriteSchema.safeParse({
        title: "PDF upload",
        source_format: "pdf",
        source_file_url: "https://storage.example.com/doc.pdf",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("documentUpdateSchema (partial update)", () => {
    it("accepts a partial body with only the title (regression for 'Save failed')", () => {
      const result = documentUpdateSchema.safeParse({ title: "Renamed" });
      expect(result.success).toBe(true);
    });

    it("accepts the exact body the document editor sends after editing", () => {
      const result = documentUpdateSchema.safeParse({
        title: "How tomo talks",
        audience: "all",
        source_format: "markdown",
        source_text: "Tomo speaks like a steady, knowledgeable coach.",
        status: "draft",
      });
      expect(result.success).toBe(true);
    });

    it("does NOT re-apply the create-time source_text-or-file_url refine", () => {
      // Even with neither source_text nor source_file_url, the update schema
      // should accept the body — partial updates don't re-prove existing
      // content.
      const result = documentUpdateSchema.safeParse({
        title: "Just a rename",
      });
      expect(result.success).toBe(true);
    });

    it("still validates source_file_url as a URL when set", () => {
      const result = documentUpdateSchema.safeParse({
        source_file_url: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("accepts an empty source_file_url (the editor sends '' when no file)", () => {
      const result = documentUpdateSchema.safeParse({
        source_file_url: "",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a title that's too long (>200 chars)", () => {
      const result = documentUpdateSchema.safeParse({
        title: "x".repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it("rejects a status not in the allowed enum", () => {
      const result = documentUpdateSchema.safeParse({
        status: "totally-bogus",
      });
      expect(result.success).toBe(false);
    });
  });
});
