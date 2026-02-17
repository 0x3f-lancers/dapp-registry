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
    subcategory: ["Lending", "Borrowing"],
    chains: ["Ethereum", "Polygon"],
    short: "Short description Aave",
  },
  {
    slug: "uniswap",
    name: "Uniswap",
    logoUrl: "url2",
    category: "DeFi",
    subcategory: ["DEX", "Swap"],
    chains: ["Ethereum", "Arbitrum"],
    short: "Short description Uniswap",
  },
  {
    slug: "opensea",
    name: "OpenSea",
    logoUrl: "url3",
    category: "NFT Marketplace",
    subcategory: ["Marketplace"],
    chains: ["Polygon"],
    short: "Short description OpenSea",
  },
  {
    slug: "gamefi-dapp",
    name: "GameFi Dapp",
    logoUrl: "url4",
    category: "Gaming",
    subcategory: ["GameFi", "P2E"],
    chains: ["Arbitrum"],
    short: "Short description GameFi",
  },
];

const mockFacetsIndex: FacetsIndex = {
  filterableOptions: {
    network: [
      { slug: "ethereum", label: "Ethereum", stats: 2 },
      { slug: "polygon", label: "Polygon", stats: 2 },
      { slug: "arbitrum", label: "Arbitrum", stats: 2 },
    ],
    category: [
      { slug: "defi", label: "DeFi", stats: 2 },
      { slug: "nft-marketplace", label: "NFT Marketplace", stats: 1 },
      { slug: "gaming", label: "Gaming", stats: 1 },
    ],
    subcategory: [
      { slug: "lending", label: "Lending", stats: 1 },
      { slug: "borrowing", label: "Borrowing", stats: 1 },
      { slug: "dex", label: "DEX", stats: 1 },
      { slug: "swap", label: "Swap", stats: 1 },
      { slug: "marketplace", label: "Marketplace", stats: 1 },
      { slug: "gamefi", label: "GameFi", stats: 1 },
      { slug: "p2e", label: "P2E", stats: 1 },
    ],
  },
  buckets: {
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
      marketplace: ["opensea"],
      gamefi: ["gamefi-dapp"],
      p2e: ["gamefi-dapp"],
    },
  },
  stats: 4,
  counts: {
    apps: 4,
    networks: 3,
    categories: 3,
    subcategories: 7,
  },
  labels: {
    network: {
      ethereum: "Ethereum",
      polygon: "Polygon",
      arbitrum: "Arbitrum",
    },
    category: {
      defi: "DeFi",
      "nft-marketplace": "NFT Marketplace",
      gaming: "Gaming",
    },
    subcategory: {
      lending: "Lending",
      borrowing: "Borrowing",
      dex: "DEX",
      swap: "Swap",
      marketplace: "Marketplace",
      gamefi: "GameFi",
      p2e: "P2E",
    },
  },
  assets: {
    networkLogos: {
      ethereum: "https://res.cloudinary.com/lancers-technology/image/upload/v1770773626/web3-explorer/chain-logos/ethereum.svg",
      polygon: "https://res.cloudinary.com/lancers-technology/image/upload/v1770773628/web3-explorer/chain-logos/polygon.svg",
      arbitrum: "https://res.cloudinary.com/lancers-technology/image/upload/v1770773634/web3-explorer/chain-logos/arbitrum.svg",
    },
  },
  taxonomy: {
    categories: ["DeFi Dapps", "NFT Marketplace", "Gaming"],
    subcategories: ["Lending", "Borrowing", "DEX", "Swap", "Marketplace", "GameFi", "P2E"],
    category_to_subcategories: {
      "defi-dapps": ["lending", "borrowing", "dex", "swap"],
      "nft-marketplace": ["marketplace"],
      gaming: ["gamefi", "p2e"],
    },
    subcategory_to_categories: {
      lending: ["defi-dapps"],
      borrowing: ["defi-dapps"],
      dex: ["defi-dapps"],
      swap: ["defi-dapps"],
      marketplace: ["nft-marketplace"],
      gamefi: ["gaming"],
      p2e: ["gaming"],
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



  it("should filter by single subcategory", async () => {

    const selected: SelectedFilters = { subcategory: ["marketplace"] };

    const result = await filterApps(selected);

    expect(result.map((app) => app.slug)).toEqual(["opensea"]);

  });







  it("should filter by multiple criteria (AND logic across groups)", async () => {

    const selected: SelectedFilters = { network: ["ethereum"], category: ["defi"] };

    const result = await filterApps(selected);

    expect(result.map((app) => app.slug)).toEqual(["aave", "uniswap"]);

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

