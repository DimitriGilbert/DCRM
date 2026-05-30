import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attachmentUploadFormSchema } from "./validation.js";

describe("attachment upload validation", () => {
  it("returns a validation error for an untouched file field", () => {
    const result = attachmentUploadFormSchema.safeParse({ file: null });

    assert.equal(result.success, false);
  });

  it("returns a validation error for an empty file", () => {
    const result = attachmentUploadFormSchema.safeParse({ file: new File([], "empty.txt") });

    assert.equal(result.success, false);
  });
});
