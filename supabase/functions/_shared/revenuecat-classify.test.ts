import { describe, expect, it } from "vitest";
import { classifyFetchFailure } from "./revenuecat";

/**
 * Why a request to RevenueCat could not be made, coarsely. The one that matters operationally is the first: a
 * secret pasted with a newline or a smart quote is an invalid header value, and Deno's fetch throws before any
 * request leaves — indistinguishable from an outage unless it is named.
 */
describe("classifyFetchFailure", () => {
  it("names a secret that is not a valid header value", () => {
    expect(
      classifyFetchFailure(new TypeError("Header value is not valid")),
    ).toBe("invalid_secret_format");
    expect(classifyFetchFailure(new TypeError("Invalid header value"))).toBe(
      "invalid_secret_format",
    );
  });

  it("names a network failure", () => {
    expect(
      classifyFetchFailure(new TypeError("error sending request for url")),
    ).toBe("network");
    expect(classifyFetchFailure(new Error("dns error: failed to lookup"))).toBe(
      "network",
    );
  });

  it("falls back to unknown", () => {
    expect(classifyFetchFailure(new Error("something else"))).toBe("unknown");
    expect(classifyFetchFailure("not an error")).toBe("unknown");
  });
});
