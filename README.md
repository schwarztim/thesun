# thesun

Autonomous MCP server generation and orchestration platform.

## Overview

thesun generates, tests, and operates MCP (Model Context Protocol) servers with minimal human involvement. Given a tool/API, it automatically:

1. Researches and discovers all API endpoints
2. Generates production-ready MCP server implementations
3. Runs comprehensive tests
4. Iterates until tests pass
5. Validates security and optimizes performance

## Installation

```bash
npm install
npm run build
```

## Usage

As a Claude Code plugin:

```bash
# Generate an MCP server
/mcp dynatrace

# Check build status
/sun-status
```

## Security

All generated MCPs follow the MCP Authorization Specification (OAuth 2.1) with:

- PKCE-required authentication
- Resource Indicators (RFC 8707)
- No token passthrough
- Multi-provider support (Entra ID, Okta, Auth0, Keycloak)

## License

Proprietary - Internal use only.
