import { filterApps, SelectedFilters } from "../lib/filterUtils";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod"; // Import z
import { appsMinSchema } from "../schema/appsMinSchema"; // Import appsMinSchema
import { FacetsIndex } from "../schema/faucetIndexJson";


// Define AppMin type locally for the test file
type AppMin = z.infer<typeof appsMinSchema>[number];

// Mock fs.readFileSync
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

// Mock path.resolve (optional, but good for consistent paths in tests)
jest.mock("path", () => ({
  resolve: jest.fn((...args) => args.join("/")), // Simplified path resolution for mocks
}));

// Mock Data
const mockAppsMin: AppMin[] = [
  {
    slug: "aave",
    name: "Aave",
    logoUrl: "url1",
    category: "DeFi",
    chains: ["Ethereum", "Polygon"],
    tags: ["Lending", "Borrowing"],
    pricing: "Free",
    short: "Short description Aave",
    updatedAt: "2023-01-01T00:00:00Z",
  },
  {
    slug: "uniswap",
    name: "Uniswap",
    logoUrl: "url2",
    category: "DeFi",
    chains: ["Ethereum", "Arbitrum"],
    tags: ["DEX", "Swap"],
    pricing: "Free",
    short: "Short description Uniswap",
    updatedAt: "2023-01-01T00:00:00Z",
  },
  {
    slug: "opensea",
    name: "OpenSea",
    logoUrl: "url3",
    category: "NFT Marketplace",
    chains: ["Polygon"],
    tags: ["NFT", "Marketplace"],
    pricing: "Free",
    short: "Short description OpenSea",
    updatedAt: "2023-01-01T00:00:00Z",
  },
  {
    slug: "gamefi-dapp",
    name: "GameFi Dapp",
    logoUrl: "url4",
    category: "Gaming",
    chains: ["Arbitrum"],
    tags: ["GameFi", "P2E"],
    pricing: "Paid",
    short: "Short description GameFi",
    updatedAt: "2023-01-01T00:00:00Z",
  },
];

const mockFacetsIndex: FacetsIndex = {
  options: {
    network: [
      { slug: "ethereum", label: "Ethereum", count: 2 },
      { slug: "polygon", label: "Polygon", count: 2 },
      { slug: "arbitrum", label: "Arbitrum", count: 2 },
    ],
    category: [
      { slug: "defi", label: "DeFi", count: 2 },
      { slug: "nft-marketplace", label: "NFT Marketplace", count: 1 },
      { slug: "gaming", label: "Gaming", count: 1 },
    ],
    subcategory: [
      { slug: "lending", label: "Lending", count: 1 },
      { slug: "borrowing", label: "Borrowing", count: 1 },
      { slug: "dex", label: "DEX", count: 1 },
      { slug: "swap", label: "Swap", count: 1 },
      { slug: "nft", label: "NFT", count: 1 },
      { slug: "marketplace", label: "Marketplace", count: 1 },
      { slug: "gamefi", label: "GameFi", count: 1 },
      { slug: "p2e", label: "P2E", count: 1 },
    ],
  },
  index: {
    network: {
      ethereum: ["aave", "uniswap"],
      polygon: ["aave", "opensea"],
      arbitrum: ["uniswap", "gamefi-dapp"],
    },
    category: {
      defi: ["aave", "uniswap"],
      "nft-marketplace": ["opensea"],
      gaming: ["gamefi-dapp"],
    },
    subcategory: {
      lending: ["aave"],
      borrowing: ["aave"],
      dex: ["uniswap"],
      swap: ["uniswap"],
      nft: ["opensea"],
      marketplace: ["opensea"],
      gamefi: ["gamefi-dapp"],
      p2e: ["gamefi-dapp"],
    },
  },
};

describe("filterApps", () => {
  beforeEach(() => {
    (readFileSync as jest.Mock).mockClear();
    (readFileSync as jest.Mock)
      .mockReturnValueOnce(JSON.stringify(mockAppsMin)) // For getAppsMin
      .mockReturnValueOnce(JSON.stringify(mockFacetsIndex)); // For getFacets
  });

  it("should return all apps if no filters are selected", async () => {
    const selected: SelectedFilters = {};
    const result = await filterApps(selected);
    expect(result).toEqual(mockAppsMin);
  });

  it("should filter by single network", async () => {
    const selected: SelectedFilters = { network: ["ethereum"] };
    const result = await filterApps(selected);
    expect(result.map((app) => app.slug)).toEqual(["aave", "uniswap"]);
  });

  it("should filter by multiple networks (OR logic)", async () => {
    const selected: SelectedFilters = { network: ["ethereum", "polygon"] };
    const result = await filterApps(selected);
    expect(result.map((app) => app.slug)).toEqual(["aave", "uniswap", "opensea"]);
  });

  it("should filter by single category", async () => {
    const selected: SelectedFilters = { category: ["defi"] };
    const result = await filterApps(selected);
    expect(result.map((app) => app.slug)).toEqual(["aave", "uniswap"]);
  });

  it("should filter by single subcategory (tag)", async () => {
    const selected: SelectedFilters = { subcategory: ["nft"] };
    const result = await filterApps(selected);
    expect(result.map((app) => app.slug)).toEqual(["opensea"]);
  });

  it("should filter by multiple criteria (AND logic across groups)", async () => {
    const selected: SelectedFilters = { network: ["ethereum"], category: ["defi"] };
    const result = await filterApps(selected);
    expect(result.map((app) => app.slug)).toEqual(["aave", "uniswap"]);
  });

  it("should filter by multiple criteria including subcategory", async () => {
    const selected: SelectedFilters = {
      network: ["arbitrum"],
      category: ["gaming"],
      subcategory: ["gamefi"],
    };
    const result = await filterApps(selected);
    expect(result.map((app) => app.slug)).toEqual(["gamefi-dapp"]);
  });

  it("should return empty array if no apps match", async () => {
    const selected: SelectedFilters = { network: ["ethereum"], category: ["gaming"] };
    const result = await filterApps(selected);
    expect(result).toEqual([]);
  });

  it("should handle non-existent slugs gracefully in selected filters", async () => {
    const selected: SelectedFilters = { network: ["non-existent-chain"], category: ["defi"] };
    const result = await filterApps(selected);
    expect(result).toEqual([]);
  });
});
