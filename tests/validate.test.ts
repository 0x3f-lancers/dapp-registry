import path from "path";

// Mock 'fs' module (not 'fs/promises')
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();
jest.mock("fs", () => ({
  promises: {
    readdir: mockReaddir,
    readFile: mockReadFile,
    access: jest.fn(), // Mock fs.promises.access, though not used, still good practice
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

// NOW import the modules that use the mocks
import validate from "../scripts/validate";
import logger from "../lib/logger";

const mockedLogger = jest.mocked(logger);
const mockedFsPromises = jest.mocked(require("fs").promises); // Cast fs.promises to a mocked type

describe("Validation Script (scripts/validate.ts)", () => {
  const MOCKED_APPS_DIR = "C:\\data\\apps";
  const TAXONOMY_PATH = path.resolve(process.cwd(), "data", "taxonomy.json");
  const CHAINS_PATH = path.resolve(process.cwd(), "data", "chains.json");

  const VALID_META_DATA = {
    slug: "valid-dapp",
    name: "Valid DApp Name",
    logoUrl: "./logo.png", // Default to local for initial tests
    category: "DeFi Dapps",
    subcategory: ["Decentralized Lending Dapps"],
    chains: ["Ethereum"],
    tags: ["Dex"],
    pricing: "Free",
    content: {
      short: "A short description.",
      description: "A longer description.",
      meta: "SEO meta description.",
      pageTitle: "Valid DApp | Title",
    },
    links: {
      website: "https://valid.com",
    },
    relations: {
      alternatives: [],
      related: [],
    },
  };
  const VALID_TAXONOMY = {
    categories: ["DeFi Dapps", "NFT Dapps"],
    subcategories: [
      "Decentralized Lending Dapps",
      "NFT Marketplaces",
    ],
    category_to_subcategories: {
      "DeFi Dapps": ["Decentralized Lending Dapps"],
      "NFT Dapps": ["NFT Marketplaces"],
    },
    subcategory_to_categories: {
      "decentralized-lending-dapps": ["defi-dapps"],
      "nft-marketplaces": ["nft-dapps"],
    },
  };
  const VALID_CHAINS = {
    chains: [
      {
        name: "Ethereum",
        slug: "ethereum",
        logoUrl: "https://example.com/ethereum.svg",
      },
      {
        name: "Polygon",
        slug: "polygon",
        logoUrl: "https://example.com/polygon.svg",
      },
    ],
  };

  const MOCKED_PROCESS_EXIT = jest
    .spyOn(process, "exit")
    .mockImplementation((() => {}) as never);

  function mockRegistryReads() {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(VALID_META_DATA));
    });
  }

  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
    mockedFsPromises.access.mockClear();
    mockedLogger.error.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
    MOCKED_PROCESS_EXIT.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should pass validation for valid data", async () => {
    mockReaddir.mockResolvedValue(["valid-dapp"]);
    mockRegistryReads();

    await validate(MOCKED_APPS_DIR);

    expect(mockReaddir).toHaveBeenCalledWith(MOCKED_APPS_DIR);
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(MOCKED_APPS_DIR, "valid-dapp", "meta.json"),
      "utf-8",
    );
    expect(mockedLogger.info).toHaveBeenCalledWith("Validation successful.");
    expect(mockedLogger.error).not.toHaveBeenCalled();
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should fail validation for mismatched slug", async () => {
    const invalidMetaData = { ...VALID_META_DATA, slug: "wrong-slug" };
    mockReaddir.mockResolvedValue(["mismatched-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(invalidMetaData));
    });

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow(
      "Validation failed",
    );

    expect(mockReaddir).toHaveBeenCalledWith(MOCKED_APPS_DIR);
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(MOCKED_APPS_DIR, "mismatched-dapp", "meta.json"),
      "utf-8",
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "mismatched-dapp", "meta.json"),
        expectedSlug: "mismatched-dapp",
        actualSlug: "wrong-slug",
      }),
      "Slug does not match folder name.",
    );
    expect(mockedLogger.info).not.toHaveBeenCalled();
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });


  it("should fail validation for non-existent relation", async () => {
    const invalidMetaData = {
      ...VALID_META_DATA,
      slug: "related-dapp",
      relations: { alternatives: ["non-existent"], related: [] },
    };
    mockReaddir.mockResolvedValue(["related-dapp", "another-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      if (filePath.includes("related-dapp")) {
        return Promise.resolve(JSON.stringify(invalidMetaData));
      }
      return Promise.resolve(JSON.stringify(VALID_META_DATA));
    });

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow(
      "Validation failed",
    );

    expect(mockReaddir).toHaveBeenCalledWith(MOCKED_APPS_DIR);
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(MOCKED_APPS_DIR, "related-dapp", "meta.json"),
      "utf-8",
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "related-dapp", "meta.json"),
        relation: "non-existent",
      }),
      "Relation does not exist in src/apps/.",
    );
    expect(mockedLogger.info).not.toHaveBeenCalled();
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should fail validation for invalid JSON format", async () => {
    const invalidMetaData = { ...VALID_META_DATA, slug: "bad-json-dapp" };
    mockReaddir.mockResolvedValue(["bad-json-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(invalidMetaData).slice(0, -1));
    }); // Intentionally malformed JSON

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow(expect.any(Error));

    expect(mockReaddir).toHaveBeenCalledWith(MOCKED_APPS_DIR);
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(MOCKED_APPS_DIR, "bad-json-dapp", "meta.json"),
      "utf-8",
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "bad-json-dapp", "meta.json"),
        error: expect.any(SyntaxError),
      }),
      "Error reading or parsing meta.json.",
    );
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should fail validation for Zod schema errors", async () => {
    const invalidMetaData = { ...VALID_META_DATA, slug: "zod-error-dapp", name: 123 };
    mockReaddir.mockResolvedValue(["zod-error-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(invalidMetaData));
    });

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow(
      "Validation failed",
    );

    expect(mockReaddir).toHaveBeenCalledWith(MOCKED_APPS_DIR);
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(MOCKED_APPS_DIR, "zod-error-dapp", "meta.json"),
      "utf-8",
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "zod-error-dapp", "meta.json"),
        issues: expect.any(Array),
      }),
      "Zod validation failed.",
    );
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should exit if APPS_DIR does not exist", async () => {
    const readDirError = new Error("ENOENT: no such file or directory");
    (readDirError as any).code = "ENOENT";
    mockReaddir.mockRejectedValue(readDirError);

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow(readDirError);

    expect(mockReaddir).toHaveBeenCalledWith(MOCKED_APPS_DIR);
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: readDirError }),
      expect.stringContaining(
        `Could not read ${MOCKED_APPS_DIR}. Ensure the directory exists.`,
      ),
    );
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should fail validation for unknown category", async () => {
    const invalidMetaData = {
      ...VALID_META_DATA,
      category: "DeFi Apps",
    };
    mockReaddir.mockResolvedValue(["valid-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(invalidMetaData));
    });

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "valid-dapp", "meta.json"),
        category: "DeFi Apps",
      }),
      "Category does not exist in taxonomy registry.",
    );
  });

  it("should fail validation for subcategory outside category taxonomy", async () => {
    const invalidMetaData = {
      ...VALID_META_DATA,
      subcategory: ["NFT Marketplaces"],
    };
    mockReaddir.mockResolvedValue(["valid-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(invalidMetaData));
    });

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "valid-dapp", "meta.json"),
        category: "DeFi Dapps",
        subcategory: "NFT Marketplaces",
      }),
      "Subcategory is not allowed for category.",
    );
  });

  it("should fail validation for unknown chain", async () => {
    const invalidMetaData = {
      ...VALID_META_DATA,
      chains: ["Etherem"],
    };
    mockReaddir.mockResolvedValue(["valid-dapp"]);
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath === TAXONOMY_PATH) {
        return Promise.resolve(JSON.stringify(VALID_TAXONOMY));
      }
      if (filePath === CHAINS_PATH) {
        return Promise.resolve(JSON.stringify(VALID_CHAINS));
      }
      return Promise.resolve(JSON.stringify(invalidMetaData));
    });

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "valid-dapp", "meta.json"),
        chain: "Etherem",
      }),
      "Chain does not exist in chain registry.",
    );
  });
});
