import {
  suggestAlternatives,
  suggestRelated,
} from "../scripts/fill-missing-relations";

describe("fill-missing-relations", () => {
  const baseApps = [
    {
      slug: "wingriders",
      name: "WingRiders",
      category: "DeFi Dapps",
      subcategory: ["Decentralized Exchanges"],
      chains: ["Cardano"],
      tags: ["AMM", "Cardano", "DEX"],
      relations: { alternatives: [], related: [] },
    },
    {
      slug: "sundaeswap",
      name: "SundaeSwap",
      category: "DeFi Dapps",
      subcategory: ["Decentralized Exchanges"],
      chains: ["Cardano"],
      tags: ["AMM", "DEX"],
      relations: { alternatives: [], related: [] },
    },
    {
      slug: "minswap",
      name: "Minswap",
      category: "DeFi Dapps",
      subcategory: ["Decentralized Exchanges"],
      chains: ["Cardano"],
      tags: ["DEX", "Liquidity"],
      relations: { alternatives: [], related: [] },
    },
    {
      slug: "liqwid",
      name: "Liqwid",
      category: "DeFi Dapps",
      subcategory: ["Decentralized Lending Dapps"],
      chains: ["Cardano"],
      tags: ["Lending", "Cardano"],
      relations: { alternatives: [], related: [] },
    },
    {
      slug: "jpg-store",
      name: "JPG Store",
      category: "NFT Dapps",
      subcategory: ["NFT Marketplaces"],
      chains: ["Cardano"],
      tags: ["NFT"],
      relations: { alternatives: [], related: [] },
    },
  ];

  it("suggests alternatives from the same category and subcategory first", () => {
    const target = baseApps[0];

    expect(suggestAlternatives(target, baseApps)).toEqual([
      "sundaeswap",
      "minswap",
    ]);
  });

  it("does not suggest alternatives from a different subcategory", () => {
    const target = baseApps[3];

    expect(suggestAlternatives(target, baseApps)).toEqual([]);
  });

  it("suggests related apps without duplicating alternatives", () => {
    const target = baseApps[0];
    const alternatives = suggestAlternatives(target, baseApps);

    expect(suggestRelated(target, baseApps, alternatives)).toEqual(["liqwid"]);
  });

  it("allows related matches through shared chain and category when subcategory differs", () => {
    const target = baseApps[3];

    expect(suggestRelated(target, baseApps, [])).toEqual([
      "wingriders",
      "minswap",
      "sundaeswap",
    ]);
  });
});
