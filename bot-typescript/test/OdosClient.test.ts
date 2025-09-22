import { expect } from "chai";
import sinon from "sinon";

import { OdosClient } from "../src/bot/OdosClient";
import { AssembleRequest, QuoteRequest } from "../src/bot/types";

describe("OdosClient", function () {
  let odosClient: OdosClient;
  let mockAxiosInstance: any;

  beforeEach(function () {
    // Create OdosClient instance
    odosClient = new OdosClient("https://api.odos.xyz", 1);

    // Replace axios instance with mock
    mockAxiosInstance = {
      post: sinon.stub(),
    };
    (odosClient as any).axiosInstance = mockAxiosInstance;
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("constructor", function () {
    it("should create an instance with default base URL", function () {
      const client = new OdosClient();
      expect(client).to.be.instanceOf(OdosClient);
    });

    it("should create an instance with custom base URL and chain ID", function () {
      const client = new OdosClient("https://custom.api.odos.xyz", 137);
      expect(client).to.be.instanceOf(OdosClient);
    });
  });

  describe("getQuote", function () {
    it("should throw error when chain ID mismatch", async function () {
      const request: QuoteRequest = {
        chainId: 2,
        inputTokens: [],
        outputTokens: [],
        userAddr: "0x1234567890123456789012345678901234567890",
        slippageLimitPercent: 0.5,
      };

      try {
        await odosClient.getQuote(request);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal(
          "Chain ID mismatch. Expected 1, got 2",
        );
      }
    });

    it("should successfully get a quote", async function () {
      const request: QuoteRequest = {
        chainId: 1,
        inputTokens: [
          {
            tokenAddress: "0x1111111111111111111111111111111111111111",
            amount: "1000000000000000000",
          },
        ],
        outputTokens: [
          {
            tokenAddress: "0x2222222222222222222222222222222222222222",
            amount: "500000000000000000",
          },
        ],
        userAddr: "0x1234567890123456789012345678901234567890",
        slippageLimitPercent: 0.5,
      };

      const mockResponse = {
        data: {
          pathId: "path123",
          inTokens: ["0x1111111111111111111111111111111111111111"],
          inAmounts: ["1000000000000000000"],
          outTokens: ["0x2222222222222222222222222222222222222222"],
          outAmounts: ["500000000000000000"],
          priceImpact: 0.01,
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.post.resolves(mockResponse);

      const result = await odosClient.getQuote(request);

      expect(result.pathId).to.equal("path123");
      expect(result.outTokens[0]).to.equal(
        "0x2222222222222222222222222222222222222222",
      );
      expect(result.outAmounts[0]).to.equal("500000000000000000");
    });

    it("should throw error when response is invalid", async function () {
      const request: QuoteRequest = {
        chainId: 1,
        inputTokens: [],
        outputTokens: [],
        userAddr: "0x1234567890123456789012345678901234567890",
        slippageLimitPercent: 0.5,
      };

      const mockResponse = {
        data: {
          // Missing required fields
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.post.resolves(mockResponse);

      try {
        await odosClient.getQuote(request);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal(
          "Invalid response from ODOS API: Missing required fields",
        );
      }
    });
  });

  describe("assembleTransaction", function () {
    it("should successfully assemble a transaction", async function () {
      const request: AssembleRequest = {
        userAddr: "0x1234567890123456789012345678901234567890",
        pathId: "path123",
        simulate: true,
      };

      const mockResponse = {
        data: {
          transaction: {
            to: "0x3333333333333333333333333333333333333333",
            data: "0xabcdef123456",
            value: "0",
          },
          simulation: {
            isSuccess: true,
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.post.resolves(mockResponse);

      const result = await odosClient.assembleTransaction(request);

      expect(result.transaction.to).to.equal(
        "0x3333333333333333333333333333333333333333",
      );
      expect(result.transaction.data).to.equal("0xabcdef123456");
    });

    it("should throw error when simulation fails", async function () {
      const request: AssembleRequest = {
        userAddr: "0x1234567890123456789012345678901234567890",
        pathId: "path123",
        simulate: true,
      };

      const mockResponse = {
        data: {
          transaction: {
            to: "0x3333333333333333333333333333333333333333",
            data: "0xabcdef123456",
            value: "0",
          },
          simulation: {
            isSuccess: false,
            simulationError: {
              type: "INSUFFICIENT_BALANCE",
              errorMessage: "Insufficient token balance",
            },
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {} as any,
      };

      mockAxiosInstance.post.resolves(mockResponse);

      try {
        await odosClient.assembleTransaction(request);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.equal(
          "Transaction simulation failed: INSUFFICIENT_BALANCE - Insufficient token balance",
        );
      }
    });
  });

  describe("formatTokenAmount", function () {
    it("should format token amounts correctly", function () {
      const result = OdosClient.formatTokenAmount(1.5, 18);
      expect(result).to.equal("1500000000000000000");

      const result2 = OdosClient.formatTokenAmount("2.25", 6);
      expect(result2).to.equal("2250000");
    });

    it("should throw error for invalid amount", function () {
      try {
        OdosClient.formatTokenAmount("invalid", 18);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
      }
    });
  });

  describe("parseTokenAmount", function () {
    it("should parse token amounts correctly", function () {
      const result = OdosClient.parseTokenAmount("1500000000000000000", 18);
      expect(result).to.equal("1.5");

      const result2 = OdosClient.parseTokenAmount("2250000", 6);
      expect(result2).to.equal("2.25");
    });
  });

  describe("retryRequest", function () {
    it("should retry on retryable errors", async function () {
      const request: QuoteRequest = {
        chainId: 1,
        inputTokens: [],
        outputTokens: [],
        userAddr: "0x1234567890123456789012345678901234567890",
        slippageLimitPercent: 0.5,
      };

      // First call fails with retryable error, second succeeds
      mockAxiosInstance.post
        .onFirstCall()
        .rejects({ isAxiosError: true, code: "ETIMEDOUT" })
        .onSecondCall()
        .resolves({
          data: {
            pathId: "path123",
            inTokens: ["0x1111111111111111111111111111111111111111"],
            inAmounts: ["1000000000000000000"],
            outTokens: ["0x2222222222222222222222222222222222222222"],
            outAmounts: ["500000000000000000"],
            priceImpact: 0.01,
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {} as any,
        });

      const result = await odosClient.getQuote(request);

      expect(result.pathId).to.equal("path123");
      expect(mockAxiosInstance.post.calledTwice).to.be.true;
    });

    it("should fail after max retries", async function () {
      const request: QuoteRequest = {
        chainId: 1,
        inputTokens: [],
        outputTokens: [],
        userAddr: "0x1234567890123456789012345678901234567890",
        slippageLimitPercent: 0.5,
      };

      // Always fail with retryable error
      mockAxiosInstance.post.rejects({ isAxiosError: true, code: "ETIMEDOUT" });

      try {
        await odosClient.getQuote(request);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect(mockAxiosInstance.post.callCount).to.equal(3); // Default retry attempts
      }
    });
  });
});
