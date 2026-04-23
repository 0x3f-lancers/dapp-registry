import {
  normalizeWebsiteLink,
  parseWebsiteLink,
  verifyWebsiteLink,
} from "../lib/websiteLinks";

describe("websiteLinks", () => {
  it("parses a normal website URL", () => {
    expect(parseWebsiteLink("https://example.com")).toEqual({
      isValid: true,
      originalUrl: "https://example.com",
      resolvedUrl: "https://example.com",
      normalizedUrl: "https://example.com/",
      reason: null,
      detail: "Website URL parsed successfully.",
    });
  });

  it("rejects placeholders", () => {
    expect(parseWebsiteLink("-")).toMatchObject({
      isValid: false,
      reason: "no_website_link",
    });
  });

  it("resolves redirected URLs", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: "https://www.example.com/",
    });

    await expect(
      normalizeWebsiteLink("https://bit.ly/example", fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      isValid: true,
      resolvedUrl: "https://www.example.com/",
      normalizedUrl: "https://www.example.com/",
    });
  });

  it("marks direct social URLs as not working for websites", async () => {
    await expect(
      verifyWebsiteLink(parseWebsiteLink("https://twitter.com/example")),
    ).resolves.toMatchObject({
      status: "not_working",
      reason: "non_website_domain",
    });
  });

  it("marks reachable html websites as working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://example.com/",
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "text/html" : null),
      },
      text: async () => "<html><head><title>Example</title></head><body>Welcome to Example.</body></html>",
    });

    await expect(
      verifyWebsiteLink(parseWebsiteLink("https://example.com"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "working",
      reason: "website_confirmed",
    });
  });

  it("marks generic 404 pages as not working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://example.com/missing",
      headers: {
        get: () => "text/html",
      },
      text: async () => "<html><title>404 Not Found</title><body>Page not found</body></html>",
    });

    await expect(
      verifyWebsiteLink(parseWebsiteLink("https://example.com/missing"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "not_working",
      reason: "not_found",
    });
  });

  it("marks parked domains as not working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://forsale.example/",
      headers: {
        get: () => "text/html",
      },
      text: async () => "<html><body>This domain is for sale on Sedo Domain Parking</body></html>",
    });

    await expect(
      verifyWebsiteLink(parseWebsiteLink("https://forsale.example"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "not_working",
      reason: "parked_domain",
    });
  });

  it("marks pdf content as non-website content", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://example.com/file.pdf",
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "application/pdf" : null),
      },
      text: async () => "",
    });

    await expect(
      verifyWebsiteLink(parseWebsiteLink("https://example.com/file.pdf"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "not_working",
      reason: "non_website_content",
    });
  });
});
