/**
 * Pattern Detection Engine
 *
 * Identifies API patterns from known services (Stripe, GitHub, AWS) to improve
 * MCP generation reliability. Detects pagination, error handling, rate limiting,
 * and authentication patterns.
 */

import { KNOWN_PATTERNS } from "./default-patterns.js";

// ============================================================================
// Type Definitions
// ============================================================================

export type PaginationStyle =
  | "cursor"
  | "offset"
  | "page"
  | "link-header"
  | "none";
export type ErrorFormatStyle = "stripe" | "rfc7807" | "simple" | "unknown";
export type AuthType =
  | "bearer"
  | "basic"
  | "api-key"
  | "signature-v4"
  | "edgegrid"
  | "none";

export interface PaginationPattern {
  style: PaginationStyle;
  params: string[];
}

export interface ErrorPattern {
  style: ErrorFormatStyle;
  errorPath: string;
  messagePath: string;
}

export interface RateLimitPattern {
  hasRateLimiting: boolean;
  limitHeader?: string;
  remainingHeader?: string;
  resetHeader?: string;
  retryAfterHeader?: string;
}

export interface AuthHeaderPattern {
  type: AuthType;
  header?: string;
}

export interface ApiPattern {
  name: string;
  pagination: PaginationPattern;
  errorFormat: ErrorPattern;
  rateLimiting: RateLimitPattern;
  auth: AuthHeaderPattern;
  idempotency?: {
    header: string;
  };
  regions?: boolean;
}

// ============================================================================
// Pattern Detection Constants
// ============================================================================

const CURSOR_PARAMS = [
  "starting_after",
  "ending_before",
  "cursor",
  "nexttoken",
  "next_token",
  "pagetoken",
  "page_token",
  "after",
  "before",
  "search_after",
  "nextpagekey",
  "next_page_key",
  "nextrecordsurl",
];

const OFFSET_PARAMS = ["offset", "skip", "startat", "start_at"];

const PAGE_PARAMS = ["page", "pagenumber", "page_number"];

const LIMIT_PARAMS = [
  "limit",
  "per_page",
  "perpage",
  "page_size",
  "pagesize",
  "maxresults",
  "max_results",
  "maxitems",
  "max_items",
  "count",
  "size",
];

const RATE_LIMIT_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit",
  "ratelimit-limit",
  "ratelimit-remaining",
  "x-rate-limit",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
];

const API_KEY_HEADERS = [
  "x-api-key",
  "api-key",
  "apikey",
  "x-auth-token",
  "dd-api-key",
  "x-shopify-access-token",
];

// ============================================================================
// PatternEngine Class
// ============================================================================

export class PatternEngine {
  /**
   * Detect pagination style from parameter names
   */
  detectPagination(params: string[]): PaginationPattern {
    const normalizedParams = params.map((p) => p.toLowerCase());
    const matchedParams: string[] = [];

    // Check for cursor-style pagination (most specific first)
    for (const param of params) {
      const lower = param.toLowerCase();
      if (CURSOR_PARAMS.some((cp) => lower === cp || lower.includes(cp))) {
        matchedParams.push(param);
      }
    }

    if (matchedParams.length > 0) {
      // Add limit params if present
      for (const param of params) {
        const lower = param.toLowerCase();
        if (LIMIT_PARAMS.some((lp) => lower === lp)) {
          if (!matchedParams.includes(param)) {
            matchedParams.push(param);
          }
        }
      }
      return { style: "cursor", params: matchedParams };
    }

    // Check for offset pagination
    const hasOffset = normalizedParams.some((p) =>
      OFFSET_PARAMS.some((op) => p === op),
    );

    if (hasOffset) {
      const offsetParams: string[] = [];
      for (const param of params) {
        const lower = param.toLowerCase();
        if (
          OFFSET_PARAMS.some((op) => lower === op) ||
          LIMIT_PARAMS.some((lp) => lower === lp)
        ) {
          offsetParams.push(param);
        }
      }
      return { style: "offset", params: offsetParams };
    }

    // Check for page-based pagination
    const hasPage = normalizedParams.some((p) =>
      PAGE_PARAMS.some((pp) => p === pp),
    );

    if (hasPage) {
      const pageParams: string[] = [];
      for (const param of params) {
        const lower = param.toLowerCase();
        if (
          PAGE_PARAMS.some((pp) => lower === pp) ||
          LIMIT_PARAMS.some((lp) => lower === lp || lower.includes("page"))
        ) {
          pageParams.push(param);
        }
      }
      return { style: "page", params: pageParams };
    }

    return { style: "none", params: [] };
  }

  /**
   * Detect error format from a response object
   */
  detectErrorFormat(response: unknown): ErrorPattern {
    if (!response || typeof response !== "object") {
      return { style: "unknown", errorPath: "", messagePath: "" };
    }

    const obj = response as Record<string, unknown>;

    // Check for Stripe-style error format: { error: { type, code, message } }
    if (
      obj.error &&
      typeof obj.error === "object" &&
      !Array.isArray(obj.error)
    ) {
      const errorObj = obj.error as Record<string, unknown>;
      if ("type" in errorObj || "code" in errorObj) {
        if ("message" in errorObj) {
          return {
            style: "stripe",
            errorPath: "error",
            messagePath: "error.message",
          };
        }
      }
      // Nested error with message only
      if ("message" in errorObj) {
        return {
          style: "simple",
          errorPath: "error",
          messagePath: "error.message",
        };
      }
    }

    // Check for RFC 7807 Problem Detail format
    if (
      "type" in obj &&
      "title" in obj &&
      "status" in obj &&
      typeof obj.type === "string"
    ) {
      return {
        style: "rfc7807",
        errorPath: "",
        messagePath: "detail" in obj ? "detail" : "title",
      };
    }

    // Check for simple error formats
    if ("message" in obj && typeof obj.message === "string") {
      return { style: "simple", errorPath: "", messagePath: "message" };
    }

    if ("error" in obj && typeof obj.error === "string") {
      return { style: "simple", errorPath: "", messagePath: "error" };
    }

    if ("errors" in obj) {
      return { style: "simple", errorPath: "errors", messagePath: "errors" };
    }

    return { style: "unknown", errorPath: "", messagePath: "" };
  }

  /**
   * Detect rate limiting from response headers
   */
  detectRateLimiting(headers: Record<string, string>): RateLimitPattern {
    const normalizedHeaders: Record<string, string> = {};
    const originalHeaders: Record<string, string> = {};

    // Normalize headers for matching while preserving originals
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      normalizedHeaders[lowerKey] = value;
      originalHeaders[lowerKey] = key;
    }

    const result: RateLimitPattern = {
      hasRateLimiting: false,
    };

    // Check for standard rate limit headers
    for (const headerKey of Object.keys(normalizedHeaders)) {
      if (RATE_LIMIT_HEADERS.includes(headerKey)) {
        result.hasRateLimiting = true;

        // Map specific header types
        if (headerKey.includes("limit") && !headerKey.includes("remaining")) {
          if (!headerKey.includes("reset")) {
            result.limitHeader = originalHeaders[headerKey];
          }
        }
        if (headerKey.includes("remaining")) {
          result.remainingHeader = originalHeaders[headerKey];
        }
        if (headerKey.includes("reset")) {
          result.resetHeader = originalHeaders[headerKey];
        }
      }

      // Check for Retry-After header
      if (headerKey === "retry-after") {
        result.hasRateLimiting = true;
        result.retryAfterHeader = originalHeaders[headerKey];
      }
    }

    return result;
  }

  /**
   * Detect authentication header format
   */
  detectAuthHeader(headers: Record<string, string>): AuthHeaderPattern {
    const normalizedHeaders: Record<string, string> = {};
    const originalHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      normalizedHeaders[lowerKey] = value;
      originalHeaders[lowerKey] = key;
    }

    // Check for Authorization header
    if (normalizedHeaders.authorization) {
      const authValue = normalizedHeaders.authorization;
      const originalKey = originalHeaders.authorization;

      if (authValue.toLowerCase().startsWith("bearer ")) {
        return { type: "bearer", header: originalKey };
      }
      if (authValue.toLowerCase().startsWith("basic ")) {
        return { type: "basic", header: originalKey };
      }
    }

    // Check for API key headers
    for (const apiKeyHeader of API_KEY_HEADERS) {
      if (normalizedHeaders[apiKeyHeader]) {
        return {
          type: "api-key",
          header: originalHeaders[apiKeyHeader],
        };
      }
    }

    return { type: "none" };
  }

  /**
   * Match an API name to known patterns
   */
  matchKnownPattern(apiName: string): ApiPattern | null {
    const lowerName = apiName.toLowerCase();

    // Direct match
    if (KNOWN_PATTERNS[lowerName]) {
      return KNOWN_PATTERNS[lowerName];
    }

    // Partial match (e.g., "stripe-api" matches "stripe")
    for (const [key, pattern] of Object.entries(KNOWN_PATTERNS)) {
      if (lowerName.includes(key)) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Analyze endpoints to infer API patterns
   */
  analyzeEndpoints(endpoints: EndpointInfo[]): ApiPattern {
    const result: ApiPattern = {
      name: "inferred",
      pagination: { style: "none", params: [] },
      errorFormat: { style: "unknown", errorPath: "", messagePath: "" },
      rateLimiting: { hasRateLimiting: false },
      auth: { type: "none" },
    };

    if (endpoints.length === 0) {
      return result;
    }

    // Collect all parameter names
    const allParams: string[] = [];
    const headerParams: string[] = [];

    for (const endpoint of endpoints) {
      if (endpoint.parameters) {
        for (const param of endpoint.parameters) {
          allParams.push(param.name);
          if (param.in === "header") {
            headerParams.push(param.name);
          }
        }
      }

      // Check security definitions
      if (endpoint.security) {
        for (const sec of endpoint.security) {
          if (typeof sec === "object") {
            const keys = Object.keys(sec);
            for (const key of keys) {
              const lowerKey = key.toLowerCase();
              if (lowerKey.includes("bearer") || lowerKey.includes("oauth")) {
                result.auth = { type: "bearer", header: "Authorization" };
              } else if (lowerKey.includes("basic")) {
                result.auth = { type: "basic", header: "Authorization" };
              } else if (lowerKey.includes("api")) {
                result.auth = { type: "api-key" };
              }
            }
          }
        }
      }
    }

    // Detect pagination from collected params
    const pagination = this.detectPagination(allParams);
    result.pagination = pagination;

    // Check for API key auth in header params
    for (const header of headerParams) {
      const lowerHeader = header.toLowerCase();
      if (
        API_KEY_HEADERS.includes(lowerHeader) ||
        lowerHeader.includes("api")
      ) {
        result.auth = { type: "api-key", header: header };
        break;
      }
    }

    return result;
  }
}

// ============================================================================
// Helper Types
// ============================================================================

interface EndpointInfo {
  path: string;
  method: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
  }>;
  security?: Array<Record<string, unknown>>;
}
