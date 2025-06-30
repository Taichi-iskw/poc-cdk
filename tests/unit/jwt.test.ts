import { jwksCache } from "../../lib/utils/jwks-cache";

// Mock https module
jest.mock("https", () => ({
  get: jest.fn(),
}));

describe("JWKS Cache", () => {
  beforeEach(() => {
    jwksCache.clearCache();
    jest.clearAllMocks();
  });

  it("should fetch and cache JWKS", async () => {
    const mockJwks = {
      keys: [
        {
          kty: "RSA",
          kid: "test-kid-1",
          use: "sig",
          alg: "RS256",
          n: "test-n",
          e: "AQAB",
        },
      ],
    };

    const https = require("https");
    https.get.mockImplementation((url, callback) => {
      const mockResponse = {
        on: jest.fn((event, handler) => {
          if (event === "data") {
            handler(JSON.stringify(mockJwks));
          }
          if (event === "end") {
            handler();
          }
        }),
      };
      callback(mockResponse);
      return {
        on: jest.fn(),
      };
    });

    const result = await jwksCache.getJWKS("https://test.com/jwks.json");
    expect(result).toEqual(mockJwks);
  });

  it("should return cached JWKS if not expired", async () => {
    const mockJwks = {
      keys: [
        {
          kty: "RSA",
          kid: "test-kid-1",
          use: "sig",
          alg: "RS256",
          n: "test-n",
          e: "AQAB",
        },
      ],
    };

    const https = require("https");
    https.get.mockImplementation((url, callback) => {
      const mockResponse = {
        on: jest.fn((event, handler) => {
          if (event === "data") {
            handler(JSON.stringify(mockJwks));
          }
          if (event === "end") {
            handler();
          }
        }),
      };
      callback(mockResponse);
      return {
        on: jest.fn(),
      };
    });

    // First call should fetch from network
    const result1 = await jwksCache.getJWKS("https://test.com/jwks.json");
    expect(result1).toEqual(mockJwks);

    // Second call should return from cache
    const result2 = await jwksCache.getJWKS("https://test.com/jwks.json");
    expect(result2).toEqual(mockJwks);

    // Should only call https.get once
    expect(https.get).toHaveBeenCalledTimes(1);
  });

  it("should find signing key by kid", async () => {
    const mockJwks = {
      keys: [
        {
          kty: "RSA",
          kid: "test-kid-1",
          use: "sig",
          alg: "RS256",
          n: "test-n",
          e: "AQAB",
        },
        {
          kty: "RSA",
          kid: "test-kid-2",
          use: "sig",
          alg: "RS256",
          n: "test-n-2",
          e: "AQAB",
        },
      ],
    };

    const key = jwksCache.getSigningKey(mockJwks, "test-kid-1");
    expect(key).toEqual(mockJwks.keys[0]);

    const key2 = jwksCache.getSigningKey(mockJwks, "test-kid-2");
    expect(key2).toEqual(mockJwks.keys[1]);

    const nonExistentKey = jwksCache.getSigningKey(mockJwks, "non-existent-kid");
    expect(nonExistentKey).toBeNull();
  });

  it("should handle network errors", async () => {
    const https = require("https");
    https.get.mockImplementation((url, callback) => {
      const mockRequest = {
        on: jest.fn((event, handler) => {
          if (event === "error") {
            handler(new Error("Network error"));
          }
        }),
      };
      return mockRequest;
    });

    await expect(jwksCache.getJWKS("https://test.com/jwks.json")).rejects.toThrow(
      "Failed to fetch JWKS: Network error"
    );
  });

  it("should handle JSON parsing errors", async () => {
    const https = require("https");
    https.get.mockImplementation((url, callback) => {
      const mockResponse = {
        on: jest.fn((event, handler) => {
          if (event === "data") {
            handler("invalid json");
          }
          if (event === "end") {
            handler();
          }
        }),
      };
      callback(mockResponse);
      return {
        on: jest.fn(),
      };
    });

    await expect(jwksCache.getJWKS("https://test.com/jwks.json")).rejects.toThrow("Failed to parse JWKS");
  });
});
