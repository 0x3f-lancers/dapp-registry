import {
  decideTwitterStatus,
  extractTwitterHandle,
  toCanonicalTwitterUrl,
} from "../lib/twitterLinks";

describe("twitterLinks", () => {
  describe("extractTwitterHandle", () => {
    it("normalizes a standard twitter.com profile URL", () => {
      expect(extractTwitterHandle("https://twitter.com/Cardano_Budz")).toEqual({
        isValid: true,
        originalUrl: "https://twitter.com/Cardano_Budz",
        normalizedUrl: toCanonicalTwitterUrl("cardano_budz"),
        handle: "cardano_budz",
        reason: null,
        detail: "Twitter handle extracted successfully.",
      });
    });

    it("accepts uppercase hosts and strips query strings", () => {
      expect(extractTwitterHandle("https://www.Twitter.com/CardanoWaifus?s=09")).toEqual({
        isValid: true,
        originalUrl: "https://www.Twitter.com/CardanoWaifus?s=09",
        normalizedUrl: toCanonicalTwitterUrl("cardanowaifus"),
        handle: "cardanowaifus",
        reason: null,
        detail: "Twitter handle extracted successfully.",
      });
    });

    it("extracts the profile handle from a status URL", () => {
      expect(extractTwitterHandle("https://x.com/WingRidersCom/status/1234567890")).toEqual({
        isValid: true,
        originalUrl: "https://x.com/WingRidersCom/status/1234567890",
        normalizedUrl: toCanonicalTwitterUrl("wingriderscom"),
        handle: "wingriderscom",
        reason: null,
        detail: "Twitter handle extracted successfully.",
      });
    });

    it("rejects placeholder values", () => {
      expect(extractTwitterHandle("https://-")).toMatchObject({
        isValid: false,
        reason: "no_twitter_link",
      });
    });

    it("rejects non-profile twitter routes", () => {
      expect(extractTwitterHandle("https://twitter.com/search?q=%23ProjectCatalyst")).toMatchObject({
        isValid: false,
        reason: "non_profile_url",
      });
    });

    it("rejects non-twitter domains", () => {
      expect(extractTwitterHandle("https://www.cardano-studio.app")).toMatchObject({
        isValid: false,
        reason: "non_twitter_domain",
      });
    });

    it("accepts direct handle syntax", () => {
      expect(extractTwitterHandle("@Aiken_Eng")).toEqual({
        isValid: true,
        originalUrl: "@Aiken_Eng",
        normalizedUrl: toCanonicalTwitterUrl("aiken_eng"),
        handle: "aiken_eng",
        reason: null,
        detail: "Twitter handle extracted successfully.",
      });
    });

    it("rejects invalid handles", () => {
      expect(extractTwitterHandle("https://twitter.com/this-handle-is-way-too-long")).toMatchObject({
        isValid: false,
        reason: "invalid_handle",
      });
    });
  });

  describe("decideTwitterStatus", () => {
    it("marks an account as working when any source confirms it", () => {
      expect(
        decideTwitterStatus([
          {
            source: "syndication",
            kind: "exists",
            detail: "Syndication lookup matched @wingriderscom.",
            httpStatus: 200,
          },
          {
            source: "oembed",
            kind: "review",
            detail: "oEmbed lookup returned 200 without a matching author URL.",
            httpStatus: 200,
          },
        ]),
      ).toEqual({
        status: "working",
        reason: "account_confirmed",
        detail: "Twitter account confirmed by syndication.",
      });
    });

    it("marks an account as not working when oEmbed and profile say the account is missing", () => {
      expect(
        decideTwitterStatus([
          {
            source: "syndication",
            kind: "review",
            detail: "Syndication lookup failed: timeout.",
            httpStatus: null,
          },
          {
            source: "oembed",
            kind: "missing",
            detail: "oEmbed lookup returned 404 for @missing.",
            httpStatus: 404,
          },
          {
            source: "profile",
            kind: "missing",
            detail: "Profile page content indicates @missing does not exist.",
            httpStatus: 200,
          },
        ]),
      ).toEqual({
        status: "not_working",
        reason: "account_not_found",
        detail: "oEmbed lookup returned 404 for @missing. Profile page content indicates @missing does not exist.",
      });
    });

    it("requires review when only oEmbed reports a missing account", () => {
      expect(
        decideTwitterStatus([
          {
            source: "syndication",
            kind: "review",
            detail: "Syndication lookup failed: timeout.",
            httpStatus: null,
          },
          {
            source: "oembed",
            kind: "missing",
            detail: "oEmbed lookup returned 404 for @possiblyvalid.",
            httpStatus: 404,
          },
        ]),
      ).toEqual({
        status: "review",
        reason: "review_required",
        detail:
          "syndication: Syndication lookup failed: timeout. | oembed: oEmbed lookup returned 404 for @possiblyvalid.",
      });
    });

    it("marks an account as restricted when a source reports restriction", () => {
      expect(
        decideTwitterStatus([
          {
            source: "syndication",
            kind: "review",
            detail: "Syndication lookup returned HTTP 429.",
            httpStatus: 429,
          },
          {
            source: "oembed",
            kind: "restricted",
            detail: "oEmbed lookup returned HTTP 403 for @blocked.",
            httpStatus: 403,
          },
        ]),
      ).toEqual({
        status: "not_working",
        reason: "account_restricted",
        detail: "oEmbed lookup returned HTTP 403 for @blocked.",
      });
    });

    it("falls back to review when the signals are inconclusive", () => {
      expect(
        decideTwitterStatus([
          {
            source: "syndication",
            kind: "review",
            detail: "Syndication lookup returned HTTP 429.",
            httpStatus: 429,
          },
          {
            source: "oembed",
            kind: "review",
            detail: "oEmbed lookup failed: timeout.",
            httpStatus: null,
          },
        ]),
      ).toEqual({
        status: "review",
        reason: "review_required",
        detail: "syndication: Syndication lookup returned HTTP 429. | oembed: oEmbed lookup failed: timeout.",
      });
    });
  });
});
