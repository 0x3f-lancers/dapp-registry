import path from "path";

// Mock 'fs' module FIRST
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();
jest.mock("fs", () => ({
  promises: {
    readdir: mockReaddir,
    readFile: mockReadFile,
  },
}));

// Mock logger
jest.mock("../lib/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
}));

// Mock node-fetch BEFORE importing check-links
const mockFetch = jest.fn();
jest.mock("node-fetch", () => ({
  __esModule: true,
  default: mockFetch,
}));

// NOW import the modules
import checkLinks from "../scripts/check-links";
import logger from "../lib/logger";

const mockedLogger = jest.mocked(logger);

describe("Link Checker Script (scripts/check-links.ts)", () => {
  const MOCKED_APPS_DIR = "C:\\data\\apps";

  const VALID_META_DATA_1 = {
    slug: "dapp1",
    name: "DApp 1",
    logoUrl: "https://valid-logo.com/logo.png",
    category: "DeFi",
    chains: ["Ethereum"],
    tags: ["Dex"],
    pricing: "Free",
    content: { short: "", description: "", meta: "", pageTitle: "" },
    links: { website: "https://valid-site.com" },
    relations: { alternatives: [], related: [] },
    source: { fullyScraped: true },
  };

  const VALID_META_DATA_2 = {
    slug: "dapp2",
    name: "DApp 2",
    logoUrl: "./logo.png",
    category: "NFT",
    chains: ["Polygon"],
    tags: ["Marketplace"],
    pricing: "Paid",
    content: { short: "", description: "", meta: "", pageTitle: "" },
    links: {
      website: "https://another-valid-site.com",
      github: "https://valid-github.com/repo",
      twitter: "https://twitter.com/valid",
    },
    relations: { alternatives: [], related: [] },
    source: { fullyScraped: true },
  };

  const BROKEN_META_DATA = {
    slug: "broken-dapp",
    name: "Broken DApp",
    logoUrl: "https://broken-logo.com/logo.png",
    category: "Tool",
    chains: ["Arbitrum"],
    tags: ["Utils"],
    pricing: "Free",
    content: { short: "", description: "", meta: "", pageTitle: "" },
    links: { website: "https://broken-site.com" },
    relations: { alternatives: [], related: [] },
    source: { fullyScraped: true },
  };

  const MOCKED_PROCESS_EXIT = jest
    .spyOn(process, "exit")
    .mockImplementation((() => {}) as never);

  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
    mockFetch.mockClear();
    mockedLogger.error.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
    MOCKED_PROCESS_EXIT.mockClear();

    // Default fetch mock - return a plain object
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        url: url,
      }),
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should pass if all external links are accessible", async () => {
    mockReaddir.mockResolvedValue(["dapp1", "dapp2"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes("dapp1")) {
        return Promise.resolve(JSON.stringify(VALID_META_DATA_1));
      }
      return Promise.resolve(JSON.stringify(VALID_META_DATA_2));
    });

    await checkLinks(MOCKED_APPS_DIR);

    expect(mockedLogger.info).toHaveBeenCalledWith(
      "Starting link accessibility check...",
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://valid-logo.com/logo.png",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://valid-site.com",
      expect.any(Object),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://another-valid-site.com",
      expect.any(Object),
    );
    expect(mockedLogger.info).toHaveBeenCalledWith(
      "All external links are accessible.",
    );
    expect(mockedLogger.error).not.toHaveBeenCalled();
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should fail if any external link is inaccessible (HTTP error)", async () => {
    mockReaddir.mockResolvedValue(["dapp1", "broken-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes("dapp1")) {
        return Promise.resolve(JSON.stringify(VALID_META_DATA_1));
      }
      return Promise.resolve(JSON.stringify(BROKEN_META_DATA));
    });

    mockFetch.mockImplementation((url: string) => {
      if (
        url === "https://broken-site.com" ||
        url === "https://broken-logo.com/logo.png"
      ) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          url: url,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        url: url,
      });
    });

    await expect(checkLinks(MOCKED_APPS_DIR)).rejects.toThrow(
      "Link accessibility check failed",
    );

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://broken-site.com",
        statusCode: 404,
      }),
      "Link inaccessible.",
    );
  });

  it("should fail if any external link is inaccessible (network error)", async () => {
    mockReaddir.mockResolvedValue(["broken-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(BROKEN_META_DATA));

    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(checkLinks(MOCKED_APPS_DIR)).rejects.toThrow(
      "Link accessibility check failed",
    );

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://broken-logo.com/logo.png",
        error: "Network error",
      }),
      "Link inaccessible.",
    );
  });

  it("should handle errors when reading APPS_DIR", async () => {
    const readDirError = new Error("Permission denied");
    (readDirError as any).code = "EACCES";
    mockReaddir.mockRejectedValue(readDirError);

    await expect(checkLinks(MOCKED_APPS_DIR)).rejects.toThrow(
      "Link accessibility check failed",
    );

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: readDirError }),
      "Error reading APPS_DIR or during link checking process.",
    );
  });

  it("should handle errors when processing meta.json for link extraction", async () => {
    mockReaddir.mockResolvedValue(["dapp1", "invalid-json-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes("dapp1")) {
        return Promise.resolve(JSON.stringify(VALID_META_DATA_1));
      }
      return Promise.resolve('{"slug": "invalid-json",');
    });

    await expect(checkLinks(MOCKED_APPS_DIR)).rejects.toThrow(
      "Link accessibility check failed",
    );

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: expect.stringContaining("invalid-json-dapp"),
        error: expect.any(SyntaxError),
      }),
      "Error processing meta.json for link extraction.",
    );
  });
});
