import {
  normalizeDiscordInvite,
  parseDiscordInvite,
  toCanonicalDiscordUrl,
  verifyDiscordInvite,
} from "../lib/discordLinks";

describe("discordLinks", () => {
  describe("parseDiscordInvite", () => {
    it("normalizes a discord.gg invite URL", () => {
      expect(parseDiscordInvite("https://discord.gg/nH2bbUDxd3")).toEqual({
        isValid: true,
        originalUrl: "https://discord.gg/nH2bbUDxd3",
        resolvedUrl: "https://discord.gg/nH2bbUDxd3",
        normalizedUrl: toCanonicalDiscordUrl("nH2bbUDxd3"),
        inviteCode: "nH2bbUDxd3",
        reason: null,
        detail: "Discord invite extracted successfully.",
      });
    });

    it("normalizes a discord.com invite URL", () => {
      expect(parseDiscordInvite("https://discord.com/invite/DBQJzfdASG")).toEqual({
        isValid: true,
        originalUrl: "https://discord.com/invite/DBQJzfdASG",
        resolvedUrl: "https://discord.com/invite/DBQJzfdASG",
        normalizedUrl: toCanonicalDiscordUrl("DBQJzfdASG"),
        inviteCode: "DBQJzfdASG",
        reason: null,
        detail: "Discord invite extracted successfully.",
      });
    });

    it("rejects placeholder values", () => {
      expect(parseDiscordInvite("https://-")).toMatchObject({
        isValid: false,
        reason: "no_discord_link",
      });
    });

    it("rejects non-invite discord URLs", () => {
      expect(parseDiscordInvite("https://discord.com/channels/906918177173299240")).toMatchObject({
        isValid: false,
        reason: "non_invite_url",
      });
    });

    it("rejects non-discord domains", () => {
      expect(parseDiscordInvite("https://matrix.to/#/#blockchain:forum.balanceanalytics.io")).toMatchObject(
        {
          isValid: false,
          reason: "non_discord_domain",
        },
      );
    });
  });

  describe("normalizeDiscordInvite", () => {
    it("resolves a shortener to a Discord invite", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        url: "https://discord.gg/resolvedCode",
        text: async () => "",
      });

      await expect(normalizeDiscordInvite("https://t.co/example", fetchMock as unknown as typeof fetch)).resolves
        .toMatchObject({
          isValid: true,
          originalUrl: "https://t.co/example",
          resolvedUrl: "https://discord.gg/resolvedCode",
          normalizedUrl: toCanonicalDiscordUrl("resolvedCode"),
          inviteCode: "resolvedCode",
        });
    });

    it("extracts a Discord invite from a custom landing page", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        url: "https://wizardcrypt.com/discord",
        text: async () =>
          '<html><head><link rel="canonical" href="https://discord.com/invite/uN7ZKBY5As"></head></html>',
      });

      await expect(
        normalizeDiscordInvite("https://wizardcrypt.com/discord", fetchMock as unknown as typeof fetch),
      ).resolves.toMatchObject({
        isValid: true,
        originalUrl: "https://wizardcrypt.com/discord",
        resolvedUrl: "https://discord.com/invite/uN7ZKBY5As",
        normalizedUrl: toCanonicalDiscordUrl("uN7ZKBY5As"),
        inviteCode: "uN7ZKBY5As",
      });
    });
  });

  describe("verifyDiscordInvite", () => {
    it("marks a valid Discord invite as working from invite page metadata", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        url: "https://discord.com/invite/validCode",
        text: async () =>
          '<title>My Guild</title><meta property="og:title" content="Join the My Guild Discord Server!" /><meta property="og:url" content="https://discord.com/invite/validCode" /><meta property="og:description" content="A cool guild | 100 members" />',
      });

      await expect(verifyDiscordInvite("validCode", fetchMock as unknown as typeof fetch)).resolves.toEqual({
        status: "working",
        reason: "invite_confirmed",
        detail: "Discord invite validCode resolved to guild My Guild.",
        normalizedUrl: toCanonicalDiscordUrl("validCode"),
        inviteCode: "validCode",
        attempts: [
          {
            source: "invite_page",
            kind: "exists",
            detail: "Discord invite page exposed guild metadata for My Guild.",
            httpStatus: 200,
          },
        ],
      });
    });

    it("marks a missing Discord invite as not working from generic fallback metadata", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        url: "https://discord.com/invite/missingCode",
        text: async () =>
          '<title>Discord</title><meta property="og:title" content="Discord - Group Chat That’s All Fun &amp; Games"><meta property="og:description" content="Discord is great for playing games and chilling with friends, or even building a worldwide community.">',
      });

      await expect(verifyDiscordInvite("missingCode", fetchMock as unknown as typeof fetch)).resolves.toEqual({
        status: "not_working",
        reason: "invite_not_found",
        detail: "Discord invite page fell back to Discord's generic homepage metadata for code missingCode.",
        normalizedUrl: toCanonicalDiscordUrl("missingCode"),
        inviteCode: "missingCode",
        attempts: [
          {
            source: "invite_page",
            kind: "missing",
            detail: "Discord invite page fell back to Discord's generic homepage metadata for code missingCode.",
            httpStatus: 200,
          },
        ],
      });
    });

    it("falls back to the invite API when the invite page is inconclusive", async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          url: "https://discord.com/invite/edgeCode",
          text: async () => "<title>Discord</title><meta property=\"og:title\" content=\"Something odd\" />",
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            code: "edgeCode",
            guild: {
              id: "123",
              name: "Edge Guild",
            },
            expires_at: null,
          }),
        });

      await expect(verifyDiscordInvite("edgeCode", fetchMock as unknown as typeof fetch)).resolves.toEqual({
        status: "working",
        reason: "invite_confirmed",
        detail: "Discord invite edgeCode resolved to guild Edge Guild.",
        normalizedUrl: toCanonicalDiscordUrl("edgeCode"),
        inviteCode: "edgeCode",
        attempts: [
          {
            source: "invite_page",
            kind: "review",
            detail: "Discord invite page was inconclusive for code edgeCode.",
            httpStatus: 200,
          },
          {
            source: "invite_api",
            kind: "exists",
            detail: "Discord invite edgeCode resolved to guild Edge Guild.",
            httpStatus: 200,
          },
        ],
      });
    });
  });
});
