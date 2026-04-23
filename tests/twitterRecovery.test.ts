import {
  dedupeCandidates,
  extractTwitterCandidatesFromHtml,
} from "../lib/twitterRecovery";

describe("twitterRecovery", () => {
  it("extracts normal twitter and x links from html", () => {
    const html = `
      <a href="https://twitter.com/ProjectAlpha">Twitter</a>
      <a href="https://x.com/project_beta">X</a>
    `;

    expect(extractTwitterCandidatesFromHtml(html)).toEqual([
      {
        url: "https://twitter.com/ProjectAlpha",
        normalizedUrl: "https://x.com/projectalpha",
        handle: "projectalpha",
      },
      {
        url: "https://x.com/project_beta",
        normalizedUrl: "https://x.com/project_beta",
        handle: "project_beta",
      },
    ]);
  });

  it("extracts escaped twitter links from json/html blobs", () => {
    const html = `
      {"social":"https:\\/\\/twitter.com\\/Aiken_lang","other":"https:\\/\\/x.com\\/aiken_lang"}
    `;

    expect(extractTwitterCandidatesFromHtml(html)).toEqual([
      {
        url: "https://twitter.com/Aiken_lang",
        normalizedUrl: "https://x.com/aiken_lang",
        handle: "aiken_lang",
      },
    ]);
  });

  it("dedupes candidates by handle", () => {
    expect(
      dedupeCandidates([
        {
          url: "https://twitter.com/TestUser",
          normalizedUrl: "https://x.com/testuser",
          handle: "testuser",
        },
        {
          url: "https://x.com/testuser",
          normalizedUrl: "https://x.com/testuser",
          handle: "testuser",
        },
      ]),
    ).toEqual([
      {
        url: "https://twitter.com/TestUser",
        normalizedUrl: "https://x.com/testuser",
        handle: "testuser",
      },
    ]);
  });
});
