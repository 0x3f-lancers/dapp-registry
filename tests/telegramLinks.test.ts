import {
  normalizeTelegramLink,
  parseTelegramLink,
  toInviteUrl,
  toUsernameUrl,
  verifyTelegramLink,
} from "../lib/telegramLinks";

describe("telegramLinks", () => {
  it("parses a username link", () => {
    expect(parseTelegramLink("https://t.me/indigo_protocol")).toEqual({
      isValid: true,
      originalUrl: "https://t.me/indigo_protocol",
      resolvedUrl: "https://t.me/indigo_protocol",
      normalizedUrl: toUsernameUrl("indigo_protocol"),
      target: "indigo_protocol",
      kind: "username",
      reason: null,
      detail: "Telegram target extracted successfully.",
    });
  });

  it("parses an invite link", () => {
    expect(parseTelegramLink("https://t.me/+U5pdhXEoUI0wNTYy")).toEqual({
      isValid: true,
      originalUrl: "https://t.me/+U5pdhXEoUI0wNTYy",
      resolvedUrl: "https://t.me/+U5pdhXEoUI0wNTYy",
      normalizedUrl: toInviteUrl("+U5pdhXEoUI0wNTYy"),
      target: "+U5pdhXEoUI0wNTYy",
      kind: "invite",
      reason: null,
      detail: "Telegram target extracted successfully.",
    });
  });

  it("rejects non-telegram domains", () => {
    expect(parseTelegramLink("https://www.facebook.com/test")).toMatchObject({
      isValid: false,
      reason: "non_telegram_domain",
    });
  });

  it("resolves a shortener to Telegram", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: "https://t.me/CoinlinkOfficial",
    });

    await expect(normalizeTelegramLink("https://t.co/example", fetchMock as unknown as typeof fetch)).resolves
      .toMatchObject({
        isValid: true,
        normalizedUrl: toUsernameUrl("CoinlinkOfficial"),
        target: "CoinlinkOfficial",
      });
  });

  it("marks a public Telegram page as working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<meta property="og:title" content="Indigo"><div class="tgme_page_extra">883 subscribers</div><a class="tgme_action_button_new shine">View in Telegram</a>',
    });

    await expect(
      verifyTelegramLink(parseTelegramLink("https://t.me/indigo_protocol"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "working",
      reason: "link_confirmed",
    });
  });

  it("marks a generic invite page as not working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<meta property="og:title" content="Join group chat on Telegram"><meta property="og:description" content=""><div class="tgme_page_description">You are invited to a <strong>group chat</strong> on <strong>Telegram</strong>.</div>',
    });

    await expect(
      verifyTelegramLink(parseTelegramLink("https://t.me/+aaaaaaaaaaaaaaaa"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "not_working",
      reason: "invite_not_found",
    });
  });
});
