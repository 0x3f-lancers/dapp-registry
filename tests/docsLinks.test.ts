import {
  normalizeDocsLink,
  parseDocsLink,
  verifyDocsLink,
} from "../lib/docsLinks";

describe("docsLinks", () => {
  it("parses a normal docs URL", () => {
    expect(parseDocsLink("https://docs.adadao.org")).toEqual({
      isValid: true,
      originalUrl: "https://docs.adadao.org",
      resolvedUrl: "https://docs.adadao.org",
      normalizedUrl: "https://docs.adadao.org/",
      reason: null,
      detail: "Docs URL parsed successfully.",
    });
  });

  it("rejects placeholders", () => {
    expect(parseDocsLink("-")).toMatchObject({
      isValid: false,
      reason: "no_docs_link",
    });
  });

  it("resolves shortened URLs", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      url: "https://example.com/whitepaper.pdf",
    });

    await expect(normalizeDocsLink("https://bit.ly/short", fetchMock as unknown as typeof fetch)).resolves
      .toMatchObject({
        isValid: true,
        resolvedUrl: "https://example.com/whitepaper.pdf",
        normalizedUrl: "https://example.com/whitepaper.pdf",
      });
  });

  it("marks reachable pdf docs as working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://example.com/doc.pdf",
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "application/pdf" : null),
      },
      text: async () => "",
    });

    await expect(
      verifyDocsLink(parseDocsLink("https://example.com/doc.pdf"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "working",
      reason: "docs_confirmed",
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
      verifyDocsLink(parseDocsLink("https://example.com/missing"), fetchMock as unknown as typeof fetch),
    ).resolves.toMatchObject({
      status: "not_working",
      reason: "not_found",
    });
  });

  it("marks discord-hosted docs links for review", async () => {
    await expect(
      verifyDocsLink(parseDocsLink("https://discord.gg/adagators")),
    ).resolves.toMatchObject({
      status: "review",
      reason: "unsupported_provider",
    });
  });
});
