import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientFormValuesToInput, objectText } from "./forms-normalization.js";

describe("client and lead form normalization", () => {
  it("renders unsupported structured objects as JSON", () => {
    assert.equal(
      objectText({ links: ["https://example.com"], mastodon: "@ada@example.com" }, "links"),
      JSON.stringify({ links: ["https://example.com"], mastodon: "@ada@example.com" }, null, 2),
    );
    assert.equal(
      objectText({ text: "123 Main", country: "UK" }, "text"),
      JSON.stringify({ text: "123 Main", country: "UK" }, null, 2),
    );
    assert.equal(objectText({ links: ["https://example.com"] }, "links"), "https://example.com");
    assert.equal(objectText({ text: "123 Main" }, "text"), "123 Main");
  });

  it("round-trips social links with extra keys through the submitted normalization path", () => {
    const socialLinks = {
      links: ["https://example.com", "https://example.com/about"],
      mastodon: "@ada@example.com",
      metadata: { verified: true },
    };

    const input = clientFormValuesToInput({
      ...baseClientFormValues,
      socialLinksText: objectText(socialLinks, "links"),
    });

    assert.deepEqual(input.socialLinks, socialLinks);
  });

  it("round-trips addresses with extra keys through the submitted normalization path", () => {
    const address = {
      text: "123 Main",
      country: "UK",
      coordinates: { latitude: 51.5072, longitude: -0.1276 },
    };

    const input = clientFormValuesToInput({
      ...baseClientFormValues,
      addressText: objectText(address, "text"),
    });

    assert.deepEqual(input.address, address);
  });
});

const baseClientFormValues = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "",
  company: "Analytical Engines",
  website: "https://example.com",
  notes: "",
  socialLinksText: "",
  addressText: "",
};
