import { expect } from "chai";
import sinon from "sinon";
import axios, { AxiosError } from "axios";
import { OdosClient } from "../typescript/odos/client";

describe("OdosClient", function () {
  let axiosStub: sinon.SinonStub;
  let odosClient: OdosClient;

  beforeEach(function () {
    // Create a mock axios instance
    const mockAxiosInstance = {
      post: sinon.stub(),
    };
    
    axiosStub = sinon.stub(axios, 'create').returns(mockAxiosInstance as any);
    odosClient = new OdosClient("https://api.odos.xyz", 146);
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("getQuote", function () {
    it("should successfully get a quote", async function () {
      const mockResponse = {
        data: {
          pathId: "test-path-id",
          outTokens: ["0x1234"],
          outAmounts: ["1000"],
          inTokens: ["0x5678"],
          inAmounts: ["2000"],
          priceImpact: 0.02,
          gasEstimate: 300000,
          dataGasEstimate: 0,
          gweiPerGas: 20,
          gasEstimateValue: 0.006,
          inValues: [2000],
          outValues: [1000],
          netOutValue: -1000,
          percentDiff: 0,
          partnerFeePercent: 0,
        },
      };

      const mockAxiosInstance = axios.create() as any;
      mockAxiosInstance.post.resolves(mockResponse);
      axiosStub.returns(mockAxiosInstance);

      // Recreate client to use stubbed axios
      odosClient = new OdosClient("https://api.odos.xyz", 146);

      const quoteRequest = {
        chainId: 146,
        inputTokens: [{ tokenAddress: "0x5678", amount: "2000" }],
        outputTokens: [{ tokenAddress: "0x1234", amount: "1000" }],
        userAddr: "0xuser",
        slippageLimitPercent: 1,
      };

      const result = await odosClient.getQuote(quoteRequest);

      expect(result).to.deep.equal(mockResponse.data);
      expect(mockAxiosInstance.post.calledOnce).to.be.true;
    });

    it("should retry on retryable errors", async function () {
      const mockResponse = {
        data: {
          pathId: "test-path-id",
          outTokens: ["0x1234"],
          outAmounts: ["1000"],
          inTokens: ["0x5678"],
          inAmounts: ["2000"],
          priceImpact: 0.02,
          gasEstimate: 300000,
          dataGasEstimate: 0,
          gweiPerGas: 20,
          gasEstimateValue: 0.006,
          inValues: [2000],
          outValues: [1000],
          netOutValue: -1000,
          percentDiff: 0,
          partnerFeePercent: 0,
        },
      };

      const mockAxiosInstance = axios.create() as any;
      let callCount = 0;
      
      // First call fails with retryable error, second succeeds
      mockAxiosInstance.post = sinon.stub().callsFake(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error("Network Error");
          (error as any).isAxiosError = true;
          (error as any).code = 'ECONNRESET';
          return Promise.reject(error);
        } else {
          return Promise.resolve(mockResponse);
        }
      });

      axiosStub.returns(mockAxiosInstance);
      odosClient = new OdosClient("https://api.odos.xyz", 146);

      const quoteRequest = {
        chainId: 146,
        inputTokens: [{ tokenAddress: "0x5678", amount: "2000" }],
        outputTokens: [{ tokenAddress: "0x1234", amount: "1000" }],
        userAddr: "0xuser",
        slippageLimitPercent: 1,
      };

      const result = await odosClient.getQuote(quoteRequest);

      expect(result).to.deep.equal(mockResponse.data);
      expect(mockAxiosInstance.post.calledTwice).to.be.true;
    });

    it("should fail after max retries", async function () {
      const mockAxiosInstance = axios.create() as any;
      
      const error = new Error("Server Error");
      (error as any).isAxiosError = true;
      (error as any).code = 'ECONNRESET';
      mockAxiosInstance.post = sinon.stub().rejects(error);

      axiosStub.returns(mockAxiosInstance);
      odosClient = new OdosClient("https://api.odos.xyz", 146);

      const quoteRequest = {
        chainId: 146,
        inputTokens: [{ tokenAddress: "0x5678", amount: "2000" }],
        outputTokens: [{ tokenAddress: "0x1234", amount: "1000" }],
        userAddr: "0xuser",
        slippageLimitPercent: 1,
      };

      await expect(odosClient.getQuote(quoteRequest)).to.be.rejectedWith("Server Error");
      expect(mockAxiosInstance.post.callCount).to.equal(3); // Initial + 2 retries
    });

    it("should validate chain ID mismatch", async function () {
      const quoteRequest = {
        chainId: 1, // Different from client's chain ID (146)
        inputTokens: [{ tokenAddress: "0x5678", amount: "2000" }],
        outputTokens: [{ tokenAddress: "0x1234", amount: "1000" }],
        userAddr: "0xuser",
        slippageLimitPercent: 1,
      };

      await expect(odosClient.getQuote(quoteRequest)).to.be.rejectedWith(
        "Chain ID mismatch. Expected 146, got 1"
      );
    });

    it("should handle invalid response", async function () {
      const mockResponse = {
        data: {
          // Missing required fields
          pathId: "test-path-id",
        },
      };

      const mockAxiosInstance = axios.create() as any;
      mockAxiosInstance.post.resolves(mockResponse);
      axiosStub.returns(mockAxiosInstance);
      odosClient = new OdosClient("https://api.odos.xyz", 146);

      const quoteRequest = {
        chainId: 146,
        inputTokens: [{ tokenAddress: "0x5678", amount: "2000" }],
        outputTokens: [{ tokenAddress: "0x1234", amount: "1000" }],
        userAddr: "0xuser",
        slippageLimitPercent: 1,
      };

      await expect(odosClient.getQuote(quoteRequest)).to.be.rejectedWith(
        "Invalid response from ODOS API: Missing required fields"
      );
    });
  });

  describe("assembleTransaction", function () {
    it("should successfully assemble transaction", async function () {
      const mockResponse = {
        data: {
          gasEstimate: 300000,
          gasEstimateValue: 0.006,
          inputTokens: [{ tokenAddress: "0x5678", amountDeducted: "2000" }],
          outputTokens: [{ tokenAddress: "0x1234", amountReceived: "1000" }],
          netOutValue: -1000,
          outValues: [1000],
          transaction: {
            gas: 300000,
            gasPrice: 20000000000,
            value: "0",
            to: "0xrouter",
            from: "0xuser",
            data: "0x1234567890",
            nonce: 42,
          },
          simulation: {
            isSuccess: true,
            amountsOut: [1000],
            gasUsed: 250000,
          },
        },
      };

      const mockAxiosInstance = axios.create() as any;
      mockAxiosInstance.post.resolves(mockResponse);
      axiosStub.returns(mockAxiosInstance);
      odosClient = new OdosClient("https://api.odos.xyz", 146);

      const assembleRequest = {
        userAddr: "0xuser",
        pathId: "test-path-id",
        simulate: true,
      };

      const result = await odosClient.assembleTransaction(assembleRequest);

      expect(result).to.deep.equal(mockResponse.data);
      expect(mockAxiosInstance.post.calledOnce).to.be.true;
    });

    it("should handle simulation failure", async function () {
      const mockResponse = {
        data: {
          gasEstimate: 300000,
          gasEstimateValue: 0.006,
          inputTokens: [{ tokenAddress: "0x5678", amountDeducted: "2000" }],
          outputTokens: [{ tokenAddress: "0x1234", amountReceived: "1000" }],
          netOutValue: -1000,
          outValues: [1000],
          transaction: {
            gas: 300000,
            gasPrice: 20000000000,
            value: "0",
            to: "0xrouter",
            from: "0xuser",
            data: "0x1234567890",
            nonce: 42,
          },
          simulation: {
            isSuccess: false,
            simulationError: {
              type: "INSUFFICIENT_OUTPUT",
              errorMessage: "Insufficient output amount",
            },
          },
        },
      };

      const mockAxiosInstance = axios.create() as any;
      mockAxiosInstance.post.resolves(mockResponse);
      axiosStub.returns(mockAxiosInstance);
      odosClient = new OdosClient("https://api.odos.xyz", 146);

      const assembleRequest = {
        userAddr: "0xuser",
        pathId: "test-path-id",
        simulate: true,
      };

      await expect(odosClient.assembleTransaction(assembleRequest)).to.be.rejectedWith(
        "Transaction simulation failed: INSUFFICIENT_OUTPUT - Insufficient output amount"
      );
    });
  });

  describe("timeout configuration", function () {
    it("should use configured timeout", function () {
      // Test that axios.create is called with timeout
      expect(axiosStub.calledOnce).to.be.true;
      const createCall = axiosStub.getCall(0);
      expect(createCall.args[0]).to.have.property('timeout');
      expect(createCall.args[0].timeout).to.be.a('number');
      expect(createCall.args[0].timeout).to.be.greaterThan(0);
    });
  });
});
