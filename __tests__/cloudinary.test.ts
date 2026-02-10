import path from "path";

// Mock cloudinary FIRST - before any imports
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
    },
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

// NOW import after mocks are set up
import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { uploadImage } from "../lib/cloudinary";
import logger from "../lib/logger";

const mockedCloudinary = jest.mocked(cloudinary);
const mockedLogger = jest.mocked(logger);

describe("Cloudinary Utility (lib/cloudinary.ts)", () => {
  const TEST_SLUG = "test-slug";
  const CLOUDINARY_CLOUD_NAME_ENV = "test_cloud_name";
  const CLOUDINARY_API_KEY_ENV = "test_api_key";
  const CLOUDINARY_API_SECRET_ENV = "test_api_secret";

  const MOCKED_IMAGE_URL = "https://example.com/image.png";
  const MOCKED_CLOUDINARY_URL =
    "https://res.cloudinary.com/test_cloud_name/image/upload/v12345/test_image.png";

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear env variables
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should upload image and return Cloudinary URL if configured", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = CLOUDINARY_CLOUD_NAME_ENV;
    process.env.CLOUDINARY_API_KEY = CLOUDINARY_API_KEY_ENV;
    process.env.CLOUDINARY_API_SECRET = CLOUDINARY_API_SECRET_ENV;

    const TEST_SLUG = "test-slug";

    // ... (rest of the code)

    mockedCloudinary.uploader.upload.mockResolvedValue({
      secure_url: MOCKED_CLOUDINARY_URL,
    } as UploadApiResponse);

    const result = await uploadImage(MOCKED_IMAGE_URL, TEST_SLUG);

    expect(mockedCloudinary.config).toHaveBeenCalledWith({
      cloud_name: CLOUDINARY_CLOUD_NAME_ENV,
      api_key: CLOUDINARY_API_KEY_ENV,
      api_secret: CLOUDINARY_API_SECRET_ENV,
    });
    expect(mockedCloudinary.uploader.upload).toHaveBeenCalledWith(
      MOCKED_IMAGE_URL,
      {
        folder: "dapp-store-logos",
        public_id: TEST_SLUG,
        overwrite: true,
        invalidate: true,
        fetch_format: "auto",
        quality: "auto",
        resource_type: "image",
      },
    );
    expect(result).toBe(MOCKED_CLOUDINARY_URL);
    expect(mockedLogger.error).not.toHaveBeenCalled();
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it("should return original URL and log warning if Cloudinary is not configured", async () => {
    const result = await uploadImage(MOCKED_IMAGE_URL, TEST_SLUG);

    expect(mockedCloudinary.config).not.toHaveBeenCalled();
    expect(mockedCloudinary.uploader.upload).not.toHaveBeenCalled();
    expect(result).toBe(MOCKED_IMAGE_URL);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      "Cloudinary credentials not properly configured. Image uploads will be skipped.",
    );
    expect(mockedLogger.error).not.toHaveBeenCalled();
  });

  it("should return original URL and log error if Cloudinary upload fails", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = CLOUDINARY_CLOUD_NAME_ENV;
    process.env.CLOUDINARY_API_KEY = CLOUDINARY_API_KEY_ENV;
    process.env.CLOUDINARY_API_SECRET = CLOUDINARY_API_SECRET_ENV;

    const uploadError = new Error("Cloudinary API Error");
    mockedCloudinary.uploader.upload.mockRejectedValue(uploadError);

    const result = await uploadImage(MOCKED_IMAGE_URL, TEST_SLUG);

    expect(mockedCloudinary.config).toHaveBeenCalled();
    expect(mockedCloudinary.uploader.upload).toHaveBeenCalledWith(
      MOCKED_IMAGE_URL,
      {
        folder: "dapp-store-logos",
        public_id: TEST_SLUG,
        overwrite: true,
        invalidate: true,
        fetch_format: "auto",
        quality: "auto",
        resource_type: "image",
      },
    );
    expect(result).toBe(MOCKED_IMAGE_URL);
    expect(mockedLogger.error).toHaveBeenCalledWith(
      { imageUrl: MOCKED_IMAGE_URL, slug: TEST_SLUG, error: uploadError },
      "Error uploading to Cloudinary.",
    );
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });
});
