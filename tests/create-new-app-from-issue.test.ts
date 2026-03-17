import {
  buildNewAppMetaFromIssue,
  parseIssueSections,
} from "../scripts/create-new-app-from-issue";

describe("create-new-app-from-issue", () => {
  const registries = {
    categories: new Set(["DeFi Dapps"]),
    subcategories: new Set([
      "Decentralized Exchanges",
      "DeFi Yield Aggregators",
    ]),
    categoryToSubcategories: new Map([
      [
        "DeFi Dapps",
        new Set(["Decentralized Exchanges", "DeFi Yield Aggregators"]),
      ],
    ]),
    chainNames: new Set(["Ethereum", "Polygon", "Arbitrum"]),
  };

  const issueBody = `
### App name
Sample Swap

### Slug
sample-swap

### Category
DeFi Dapps

### Subcategories
Decentralized Exchanges, DeFi Yield Aggregators

### Chains
- [x] Ethereum
- [ ] Base
- [x] Polygon

### Tags
dex, swaps, liquidity

### Pricing
Free

### Website URL
https://sampleswap.xyz

### GitHub URL
https://github.com/example/sample-swap

### Docs URL
https://docs.sampleswap.xyz

### X / Twitter URL
https://x.com/sampleswap

### Telegram URL
https://t.me/sampleswap

### Discord URL
https://discord.gg/sampleswap

### Short description
Sample Swap is a decentralized exchange for token swaps across EVM networks.

### Full description
Sample Swap is a decentralized exchange built for fast token swaps and yield routing. It supports multiple EVM networks and aims to simplify onchain trading for retail users.

### Logo URL
https://sampleswap.xyz/logo.png

### Related or alternative apps
uniswap, missing-slug, 1inch

### Maintainer notes
No additional notes.

### Submitter confirmation
- [x] I checked the registry browser and used the closest existing category, subcategory, and chain values where possible.
- [x] I confirm the submitted links and description are accurate to the best of my knowledge.
`;

  it("parses issue form sections by heading", () => {
    const sections = parseIssueSections(issueBody);

    expect(sections["App name"]).toBe("Sample Swap");
    expect(sections["Slug"]).toBe("sample-swap");
    expect(sections["Chains"]).toContain("- [x] Ethereum");
  });

  it("builds a valid meta payload from the issue body", () => {
    const { meta, warnings } = buildNewAppMetaFromIssue(issueBody, [
      "uniswap",
      "1inch",
    ], registries);

    expect(meta.slug).toBe("sample-swap");
    expect(meta.name).toBe("Sample Swap");
    expect(meta.category).toBe("DeFi Dapps");
    expect(meta.subcategory).toEqual([
      "Decentralized Exchanges",
      "DeFi Yield Aggregators",
    ]);
    expect(meta.chains).toEqual(["Ethereum", "Polygon"]);
    expect(meta.pricing).toBe("Free");
    expect(meta.tags).toEqual(["dex", "swaps", "liquidity"]);
    expect(meta.links.website).toBe("https://sampleswap.xyz");
    expect(meta.links.github).toBe("https://github.com/example/sample-swap");
    expect(meta.links.docs).toBe("https://docs.sampleswap.xyz");
    expect(meta.links.twitter).toBe("https://x.com/sampleswap");
    expect(meta.links.telegram).toBe("https://t.me/sampleswap");
    expect(meta.links.discord).toBe("https://discord.gg/sampleswap");
    expect(meta.relations.alternatives).toEqual(["uniswap", "1inch"]);
    expect(meta.relations.related).toEqual([]);
    expect(meta.content.pageTitle).toBe(
      "Sample Swap - DeFi Dapps - Lancers Web3 Explorer",
    );
    expect(meta.content.meta.length).toBeLessThanOrEqual(200);
    expect(warnings).toEqual([
      "Ignored related apps without matching slugs: missing-slug",
    ]);
  });

  it('maps "Not sure" pricing to an empty metadata value', () => {
    const pricingBody = issueBody.replace("### Pricing\nFree", "### Pricing\nNot sure");

    const { meta } = buildNewAppMetaFromIssue(pricingBody, [], registries);

    expect(meta.pricing).toBe("");
  });

  it("throws when a required field is missing", () => {
    const invalidBody = issueBody.replace("### Slug\nsample-swap", "### Slug\n");

    expect(() => buildNewAppMetaFromIssue(invalidBody, [], registries)).toThrow(
      'Issue form field "Slug" is required.',
    );
  });

  it("throws on invalid slug format", () => {
    const invalidBody = issueBody.replace("### Slug\nsample-swap", "### Slug\nSample Swap!");

    expect(() => buildNewAppMetaFromIssue(invalidBody, [], registries)).toThrow(
      'Slug "Sample Swap!" is not URL-safe. Use lowercase letters, numbers, and hyphens only.',
    );
  });

  it("throws on invalid category before repo validation runs", () => {
    const invalidBody = issueBody.replace("### Category\nDeFi Dapps", "### Category\nFake Category");

    expect(() => buildNewAppMetaFromIssue(invalidBody, [], registries)).toThrow(
      'Category "Fake Category" is not in the taxonomy registry.',
    );
  });

  it("throws on invalid chain before repo validation runs", () => {
    const invalidBody = issueBody.replace("- [x] Polygon", "- [x] Polygon\n- [x] FakeChain");

    expect(() => buildNewAppMetaFromIssue(invalidBody, [], registries)).toThrow(
      'Chain "FakeChain" is not in the chain registry.',
    );
  });
});
