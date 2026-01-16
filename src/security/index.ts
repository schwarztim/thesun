/**
 * Security Module
 *
 * Provides comprehensive security for generated MCP servers:
 * - OAuth 2.1 authentication with PKCE
 * - Multi-provider support (Entra ID, Okta, Auth0, Keycloak)
 * - Token validation (audience, resource indicators)
 * - Security hardening (injection prevention, scope minimization)
 *
 * References:
 * - https://modelcontextprotocol.io/specification/draft/basic/authorization
 * - https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
 * - https://mcp-security.com
 */

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

export {
  SecurityHardening,
  SecurityConfigSchema,
  SecurityError,
  generateSecurityMiddleware,
  generateSecurityChecklist,
  type SecurityConfig,
} from './hardening.js';
