/**
 * Security Module
 *
 * Provides comprehensive security for generated MCP servers:
 * - OAuth 2.1 authentication with PKCE (when available)
 * - API Key authentication (common reality for many APIs)
 * - Multi-provider support (Entra ID, Okta, Auth0, Keycloak)
 * - Token validation (audience, resource indicators)
 * - Security hardening (injection prevention, scope minimization)
 *
 * References:
 * - https://modelcontextprotocol.io/specification/draft/basic/authorization
 * - https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
 * - https://mcp-security.com
 */

// OAuth 2.1 Authentication (recommended when available)
export {
  AuthManager,
  OAuthConfigSchema,
  PROVIDER_DEFAULTS,
  generateAuthCodeSnippet,
  generateAuthEnvExample,
  type OAuthConfig,
  type IdentityProvider,
  type TokenValidationResult,
  type ToolPermission,
} from './auth-manager.js';

// API Key Authentication (common reality)
export {
  ApiKeyAuth,
  ApiKeyConfigSchema,
  COMMON_API_KEY_PATTERNS,
  detectApiKeyPattern,
  generateApiKeyAuthSnippet,
  generateApiKeyEnvExample,
  type ApiKeyConfig,
  type ApiKeyPlacement,
} from './api-key-auth.js';

// Security Hardening (applies to both auth methods)
export {
  SecurityHardening,
  SecurityConfigSchema,
  SecurityError,
  generateSecurityMiddleware,
  generateSecurityChecklist,
  type SecurityConfig,
} from './hardening.js';
