import {
  parseGitHubLink,
  toCanonicalGitHubUrl,
  verifyGitHubRepo,
} from "../lib/githubLinks";

describe("githubLinks", () => {
  it("parses a standard GitHub repo URL", () => {
    expect(parseGitHubLink("https://github.com/aiken-lang/aiken")).toEqual({
      isValid: true,
      originalUrl: "https://github.com/aiken-lang/aiken",
      normalizedUrl: toCanonicalGitHubUrl("aiken-lang", "aiken"),
      owner: "aiken-lang",
      repo: "aiken",
      reason: null,
      detail: "GitHub repository extracted successfully.",
    });
  });

  it("normalizes subpaths and .git suffixes", () => {
    expect(parseGitHubLink("https://github.com/CardanoSolutions/ogmios/tree/main")).toEqual({
      isValid: true,
      originalUrl: "https://github.com/CardanoSolutions/ogmios/tree/main",
      normalizedUrl: toCanonicalGitHubUrl("CardanoSolutions", "ogmios"),
      owner: "CardanoSolutions",
      repo: "ogmios",
      reason: null,
      detail: "GitHub repository extracted successfully.",
    });
  });

  it("rejects non-github domains", () => {
    expect(parseGitHubLink("https://gitlab.com/example/repo")).toMatchObject({
      isValid: false,
      reason: "non_github_domain",
    });
  });

  it("marks an existing repo as working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        full_name: "aiken-lang/aiken",
      }),
    });

    await expect(
      verifyGitHubRepo(parseGitHubLink("https://github.com/aiken-lang/aiken"), fetchMock as unknown as typeof fetch),
    ).resolves.toEqual({
      status: "working",
      reason: "repo_confirmed",
      detail: "GitHub repository aiken-lang/aiken is reachable.",
      normalizedUrl: toCanonicalGitHubUrl("aiken-lang", "aiken"),
      owner: "aiken-lang",
      repo: "aiken",
    });
  });

  it("marks a missing repo as not working", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 404,
      ok: false,
    });

    await expect(
      verifyGitHubRepo(parseGitHubLink("https://github.com/aiken-lang/does-not-exist"), fetchMock as unknown as typeof fetch),
    ).resolves.toEqual({
      status: "not_working",
      reason: "repo_not_found",
      detail: "GitHub API returned 404 for aiken-lang/does-not-exist.",
      normalizedUrl: toCanonicalGitHubUrl("aiken-lang", "does-not-exist"),
      owner: "aiken-lang",
      repo: "does-not-exist",
    });
  });
});
