import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import { Express, Request, Response } from "express";
import { Server } from "http";
import { createApiServer, addErrorHandler } from "../../server.js";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "../../utils/response.js";

/**
 * Property-based tests for API Response Format
 * Using fast-check library with minimum 100 iterations per property
 */

// Type for parsed API responses
interface ParsedErrorResponse {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
}

interface ParsedSuccessResponse<T = unknown> {
  success: boolean;
  data?: T;
}

describe("API Response Property Tests", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    app = createApiServer();

    // Add test routes that return various responses
    app.get("/test/success", (_req: Request, res: Response) => {
      res.json(successResponse({ message: "ok" }));
    });

    app.get("/test/success-data", (req: Request, res: Response) => {
      const data = req.query.data ? JSON.parse(req.query.data as string) : {};
      res.json(successResponse(data));
    });

    app.get("/test/error", (req: Request, res: Response) => {
      const code = (req.query.code as string) || ErrorCode.INTERNAL_ERROR;
      const message = (req.query.message as string) || "Test error";
      res.status(400).json(errorResponse(code, message));
    });

    app.get("/test/error-500", (_req: Request, res: Response) => {
      res
        .status(500)
        .json(errorResponse(ErrorCode.INTERNAL_ERROR, "Server error"));
    });

    addErrorHandler(app);

    // Start server on random port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  /**
   * **Feature: web-ui, Property 12: API JSON format**
   * **Validates: Requirements 7.2**
   *
   * For any API response, the Content-Type header should be application/json.
   */
  describe("Property 12: API JSON format", () => {
    // Generator for various endpoint paths
    const endpointGen = fc.constantFrom(
      "/test/success",
      "/test/error",
      "/test/error-500",
      "/api/v1/health"
    );

    it("should return application/json Content-Type for all endpoints", async () => {
      await fc.assert(
        fc.asyncProperty(endpointGen, async (endpoint) => {
          const response = await fetch(`${baseUrl}${endpoint}`);
          const contentType = response.headers.get("content-type");

          expect(contentType).toBeDefined();
          expect(contentType?.toLowerCase()).toContain("application/json");
        }),
        { numRuns: 100 }
      );
    });

    it("should return valid JSON body for all responses", async () => {
      await fc.assert(
        fc.asyncProperty(endpointGen, async (endpoint) => {
          const response = await fetch(`${baseUrl}${endpoint}`);
          const body = await response.text();

          // Should be valid JSON
          expect(() => JSON.parse(body)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: web-ui, Property 13: Error response format**
   * **Validates: Requirements 7.3**
   *
   * For any API error response, it should contain success: false
   * and an error object with code and message fields.
   */
  describe("Property 13: Error response format", () => {
    // Generator for error codes
    const errorCodeGen = fc.constantFrom(
      ErrorCode.INVALID_USERNAME,
      ErrorCode.INVALID_URL,
      ErrorCode.INVALID_INTERVAL,
      ErrorCode.AUTHOR_NOT_FOUND,
      ErrorCode.AUTHOR_EXISTS,
      ErrorCode.NOT_FOUND,
      ErrorCode.INTERNAL_ERROR,
      ErrorCode.VALIDATION_ERROR
    );

    // Generator for error messages (non-empty strings)
    const errorMessageGen = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0);

    it("should have correct error response structure for all error codes", async () => {
      await fc.assert(
        fc.asyncProperty(
          errorCodeGen,
          errorMessageGen,
          async (code, message) => {
            const url = new URL(`${baseUrl}/test/error`);
            url.searchParams.set("code", code);
            url.searchParams.set("message", message);

            const response = await fetch(url.toString());
            const body = (await response.json()) as ParsedErrorResponse;

            // Must have success: false
            expect(body.success).toBe(false);

            // Must have error object
            expect(body.error).toBeDefined();
            expect(typeof body.error).toBe("object");

            // Error must have code field (string)
            expect(body.error!.code).toBeDefined();
            expect(typeof body.error!.code).toBe("string");
            expect(body.error!.code).toBe(code);

            // Error must have message field (string)
            expect(body.error!.message).toBeDefined();
            expect(typeof body.error!.message).toBe("string");
            expect(body.error!.message).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return error format for 404 not found", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .map((s) => s.replace(/[^a-z0-9]/gi, "")),
          async (randomPath) => {
            const response = await fetch(
              `${baseUrl}/nonexistent/${randomPath}`
            );
            const body = (await response.json()) as ParsedErrorResponse;

            expect(response.status).toBe(404);
            expect(body.success).toBe(false);
            expect(body.error).toBeDefined();
            expect(body.error!.code).toBeDefined();
            expect(body.error!.message).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional test: Success response format consistency
   */
  describe("Success response format", () => {
    // Generator for various data types
    const dataGen = fc.oneof(
      fc.record({ id: fc.integer(), name: fc.string() }),
      fc.array(fc.string(), { minLength: 0, maxLength: 5 }),
      fc.record({ count: fc.integer(), items: fc.array(fc.string()) })
    );

    it("should have correct success response structure", async () => {
      await fc.assert(
        fc.asyncProperty(dataGen, async (data) => {
          const url = new URL(`${baseUrl}/test/success-data`);
          url.searchParams.set("data", JSON.stringify(data));

          const response = await fetch(url.toString());
          const body = (await response.json()) as ParsedSuccessResponse;

          // Must have success: true
          expect(body.success).toBe(true);

          // Must have data field
          expect(body.data).toBeDefined();

          // Data should match what was sent
          expect(body.data).toEqual(data);
        }),
        { numRuns: 100 }
      );
    });
  });
});
