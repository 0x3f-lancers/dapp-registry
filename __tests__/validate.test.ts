import path from "path";

// Mock 'fs' module (not 'fs/promises')
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();
jest.mock("fs", () => ({
  promises: {
    readdir: mockReaddir,
    readFile: mockReadFile,
    access: jest.fn(), // Mock fs.promises.access as it's used in validate.ts
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

// Mock node-fetch and AbortController
const mockFetch = jest.fn();

// Simple mock for node-fetch Response class
class MockResponse {
  status: number;
  ok: boolean;
  constructor(body: any, init: { status: number }) {
    this.status = init.status;
    this.ok = this.status >= 200 && this.status < 300;
  }
}

const mockAbortController = jest.fn(() => ({
  abort: jest.fn(),
  signal: new EventTarget(), // Mock a basic EventTarget for signal
}));
jest.mock("node-fetch", () => ({
  __esModule: true,
  default: mockFetch,
  Response: MockResponse, // Use our custom mock Response class
}));
jest.mock("abort-controller", () => ({
  __esModule: true,
  default: mockAbortController,
}));


// NOW import the modules that use the mocks
import validate from "../scripts/validate";
import logger from "../lib/logger";
import fetch, { Response } from "node-fetch"; // Import fetch and Response from node-fetch
import AbortController from "abort-controller";

const mockedLogger = jest.mocked(logger);
const mockedFsPromises = jest.mocked(require("fs").promises); // Cast fs.promises to a mocked type
const mockedFetch = jest.mocked(fetch);
const mockedAbortController = jest.mocked(AbortController);


describe("Validation Script (scripts/validate.ts)", () => {
  const MOCKED_APPS_DIR = "C:\\data\\apps";

  const VALID_META_DATA = {
    slug: "valid-dapp",
    name: "Valid DApp Name",
    logoUrl: "./logo.png", // Default to local for initial tests
    category: "DeFi",
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
    source: {
      fullyScraped: true,
    },
  };

  const MOCKED_PROCESS_EXIT = jest
    .spyOn(process, "exit")
    .mockImplementation((() => {}) as never);

  beforeEach(() => {
    mockReaddir.mockClear();
    mockReadFile.mockClear();
    mockedFsPromises.access.mockClear(); // Clear mock for fs.promises.access
    mockedLogger.error.mockClear();
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
    mockedFetch.mockClear();
    mockedAbortController.mockClear();
    MOCKED_PROCESS_EXIT.mockClear();

    // Default fetch mock to a successful response
    mockedFetch.mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should pass validation for valid data", async () => {
    mockReaddir.mockResolvedValue(["valid-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(VALID_META_DATA));

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
    mockReadFile.mockResolvedValue(JSON.stringify(invalidMetaData));

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
    mockReadFile.mockImplementation((filePath) => {
      if ((filePath as string).includes("related-dapp")) {
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
      "Relation does not exist in data/apps/.",
    );
    expect(mockedLogger.info).not.toHaveBeenCalled();
    expect(MOCKED_PROCESS_EXIT).not.toHaveBeenCalled();
  });

  it("should fail validation for invalid JSON format", async () => {
    const invalidMetaData = { ...VALID_META_DATA, slug: "bad-json-dapp" };
    mockReaddir.mockResolvedValue(["bad-json-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(invalidMetaData).slice(0, -1)); // Intentionally malformed JSON

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
    mockReadFile.mockResolvedValue(JSON.stringify(invalidMetaData));

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

  it("should fail validation for non-existent local logoUrl", async () => {
    const invalidMetaData = { ...VALID_META_DATA, slug: "invalid-logo-dapp", logoUrl: "./non-existent.png" };
    mockReaddir.mockResolvedValue(["invalid-logo-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(invalidMetaData));
    mockedFsPromises.access.mockRejectedValue(new Error("File not found"));

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedFsPromises.access).toHaveBeenCalledWith(
      path.join(MOCKED_APPS_DIR, "invalid-logo-dapp", "./non-existent.png")
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "invalid-logo-dapp", "meta.json"),
        logoPath: path.join(MOCKED_APPS_DIR, "invalid-logo-dapp", "./non-existent.png"),
      }),
      "Local logo file does not exist."
    );
  });

  it("should pass validation for accessible hosted logoUrl", async () => {
    const hostedLogoUrl = "https://example.com/hosted-logo.png";
    const metaData = { ...VALID_META_DATA, slug: "hosted-logo-dapp", logoUrl: hostedLogoUrl };
    mockReaddir.mockResolvedValue(["hosted-logo-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(metaData));
    mockedFetch.mockResolvedValue(new Response(null, { status: 200 }));

    await validate(MOCKED_APPS_DIR);

    expect(mockedFetch).toHaveBeenCalledWith(
      hostedLogoUrl,
      expect.objectContaining({ method: "HEAD", signal: expect.any(EventTarget) })
    );
    expect(mockedLogger.info).toHaveBeenCalledWith("Validation successful.");
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  it("should fail validation for inaccessible hosted logoUrl (non-2xx status)", async () => {
    const hostedLogoUrl = "https://example.com/inaccessible-logo.png";
    const metaData = { ...VALID_META_DATA, slug: "inaccessible-logo-dapp", logoUrl: hostedLogoUrl };
    mockReaddir.mockResolvedValue(["inaccessible-logo-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(metaData));
    mockedFetch.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedFetch).toHaveBeenCalledWith(
      hostedLogoUrl,
      expect.objectContaining({ method: "HEAD", signal: expect.any(EventTarget) })
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "inaccessible-logo-dapp", "meta.json"),
        logoUrl: hostedLogoUrl,
        status: 404,
      }),
      "Hosted logo URL is not accessible or returned an error status."
    );
  });

  it("should fail validation for hosted logoUrl network error or timeout", async () => {
    const hostedLogoUrl = "https://example.com/network-error-logo.png";
    const metaData = { ...VALID_META_DATA, slug: "network-error-dapp", logoUrl: hostedLogoUrl };
    mockReaddir.mockResolvedValue(["network-error-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(metaData));
    mockedFetch.mockRejectedValue(new Error("Network Error")); // Simulate network error

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedFetch).toHaveBeenCalledWith(
      hostedLogoUrl,
      expect.objectContaining({ method: "HEAD", signal: expect.any(EventTarget) })
    );
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "network-error-dapp", "meta.json"),
        logoUrl: hostedLogoUrl,
        error: expect.any(Error),
      }),
      "Failed to access hosted logo URL (network error or timeout)."
    );
  });

  it("should fail validation for invalid logoUrl format (neither local nor hosted)", async () => {
    const invalidLogoUrl = "ftp://invalid.com/logo.png"; // Neither http(s) nor ./
    const metaData = { ...VALID_META_DATA, slug: "invalid-format-dapp", logoUrl: invalidLogoUrl };
    mockReaddir.mockResolvedValue(["invalid-format-dapp"]);
    mockReadFile.mockResolvedValue(JSON.stringify(metaData));

    await expect(validate(MOCKED_APPS_DIR)).rejects.toThrow("Validation failed");

    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        metaPath: path.join(MOCKED_APPS_DIR, "invalid-format-dapp", "meta.json"),
        logoUrl: invalidLogoUrl,
      }),
      "Logo URL is neither a local path nor a valid hosted URL."
    );
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
});
