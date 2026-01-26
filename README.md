<p align="center">
  <img src="docs/assets/thesun-logo.svg" alt="thesun" width="200" />
</p>

<h1 align="center">thesun</h1>

<p align="center">
  <strong>Autonomous MCP Server Generation Platform</strong>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/features-8+-blue?style=flat-square" alt="Features" /></a>
  <a href="#"><img src="https://img.shields.io/badge/tests-234%20passing-success?style=flat-square" alt="Tests" /></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-95%25-brightgreen?style=flat-square" alt="Coverage" /></a>
  <a href="#"><img src="https://img.shields.io/badge/typescript-strict-blue?style=flat-square" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/license-proprietary-red?style=flat-square" alt="License" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#security">Security</a>
</p>

---

## What is thesun?

**thesun** is a security-first, autonomous platform that generates production-ready [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) servers with near-zero human involvement. Given any API, it:

1. **Discovers** all endpoints via web research, OpenAPI specs, and browser automation
2. **Generates** complete TypeScript MCP server with proper auth, error handling, and rate limiting
3. **Validates** every tool against the live API before declaring done
4. **Self-heals** by detecting API changes and regenerating affected endpoints
5. **Registers** globally for immediate use in Claude, Copilot, Gemini, and Codex

```bash
# That's it. One command.
thesun stripe
```

---

## Features

<table>
<tr>
<td width="50%">

### Zero-Config Generation

Single command generates complete, working MCP. Auth type, pagination style, rate limits - all auto-detected.

```bash
thesun stripe           # Full generation
thesun stripe --har ~/f # Skip browser discovery
thesun stripe --update  # Refresh existing MCP
thesun stripe --fix     # Quick patch
```

</td>
<td width="50%">

### Perfect First Run

Every tool validated against the live API before completion. No more "it builds but doesn't work."

```
✅ MCP Generation Complete

stripe-mcp v1.0.0
├─ 47 tools generated
├─ 47/47 validated against live API
├─ Auth: OAuth 2.0 + PKCE (token saved)
└─ Self-healing: enabled
```

</td>
</tr>
<tr>
<td width="50%">

### Browser-Based Discovery

Reverse-engineer undocumented APIs by capturing network traffic and tokens via **Playwright MCP + Firefox**. Full localStorage, sessionStorage, and cookie access.

</td>
<td width="50%">

### Cross-Platform Compatible

Generated MCPs work with:

- Claude Code
- GitHub Copilot
- Google Gemini
- OpenAI Codex

</td>
</tr>
<tr>
<td width="50%">

### Self-Healing MCPs

Health monitoring detects API drift, deprecated endpoints, and auth failures - automatically triggering fixes.

</td>
<td width="50%">

### Smart Caching

Incremental updates only regenerate changed endpoints. User modifications preserved across updates.

</td>
</tr>
</table>

---

## Architecture

### High-Level System Design

```mermaid
flowchart TB
    subgraph Input["📥 Input"]
        CMD[/"thesun stripe"/]
        HAR["HAR File"]
        URL["Site URL"]
    end

    subgraph Preflight["🔍 Preflight Checks"]
        DEP["Dependency Checker"]
        PW["Playwright MCP"]
        FIREFOX["Firefox Browser"]
        DIR["Directory Setup"]
    end

    subgraph Discovery["🔎 Parallel Discovery"]
        WEB["Web Research Agent"]
        BROWSER["Browser Test Agent"]
        EXISTING["Existing MCP Search"]
    end

    subgraph Analysis["📊 Analysis"]
        MERGE["Merge & Dedupe"]
        PATTERN["Pattern Detection"]
        AUTH["Auth Detection"]
    end

    subgraph Generation["⚙️ Generation"]
        GEN["MCP Generator"]
        SELFHEAL["Self-Healing Injection"]
        CACHE["Smart Cache"]
    end

    subgraph Validation["✅ Validation Gate"]
        BUILD["Build Test"]
        ENDPOINT["Endpoint Tests"]
        AUTHTEST["Auth Flow Test"]
        INTEGRATION["Integration Test"]
    end

    subgraph Output["📤 Output"]
        REGISTER["Auto-Register"]
        CREDS["Store Credentials"]
        DONE["Ready to Use"]
    end

    CMD --> Preflight
    HAR -.-> Analysis
    URL -.-> BROWSER

    Preflight --> Discovery
    Discovery --> Analysis
    Analysis --> Generation
    Generation --> Validation
    Validation -->|Pass| Output
    Validation -->|Fail| GEN
```

### Module Architecture

```mermaid
graph LR
    subgraph Core["Core Modules"]
        MCP["mcp-server/index.ts<br/>Main Entry Point"]
        TYPES["types/index.ts<br/>Zod Schemas"]
    end

    subgraph Preflight["Preflight"]
        DC["dependency-checker.ts<br/>Playwright MCP + Firefox"]
    end

    subgraph Discovery["Discovery"]
        REG["mcp-registry-search.ts<br/>npm, GitHub, Smithery"]
    end

    subgraph Auth["Authentication"]
        CRED["credential-wizard.ts<br/>OAuth, API Key, Session"]
    end

    subgraph Patterns["Pattern Engine"]
        PE["pattern-engine.ts<br/>18 API Patterns"]
        DP["default-patterns.ts<br/>Stripe, GitHub, AWS..."]
    end

    subgraph Health["Self-Healing"]
        SH["self-healing.ts<br/>Health Checks, Recovery"]
    end

    subgraph Validation["Validation"]
        VG["validation-gate.ts<br/>4-Phase Testing"]
    end

    subgraph Cache["Caching"]
        SC["smart-cache.ts<br/>Incremental Updates"]
    end

    MCP --> DC
    MCP --> REG
    MCP --> CRED
    MCP --> PE
    MCP --> SH
    MCP --> VG
    MCP --> SC
    PE --> DP
    TYPES --> MCP
```

---

## How It Works

### Generation Pipeline

```mermaid
sequenceDiagram
    participant User
    participant thesun
    participant Registry as MCP Registry
    participant Browser as Playwright Firefox
    participant API as Target API
    participant Validator

    User->>thesun: thesun stripe

    Note over thesun: Phase 1: Preflight
    thesun->>thesun: Check dependencies
    thesun->>thesun: Setup directories

    Note over thesun,Registry: Phase 2: Existing MCP Check
    thesun->>Registry: Search npm, GitHub, Smithery
    Registry-->>thesun: Found: @stripe/mcp (score: 85)
    thesun->>thesun: Decision: Extend with missing endpoints

    Note over thesun,Browser: Phase 3: Parallel Discovery
    par Web Research
        thesun->>thesun: Search OpenAPI specs
        thesun->>thesun: Parse documentation
    and Browser Testing
        thesun->>Browser: Launch Firefox
        Browser->>API: Capture network requests
        Browser-->>thesun: HAR with endpoints
    end

    Note over thesun: Phase 4: Pattern Detection
    thesun->>thesun: Detect: Stripe-style pagination
    thesun->>thesun: Detect: OAuth 2.0 + PKCE
    thesun->>thesun: Detect: Rate limit headers

    Note over thesun,User: Phase 5: Authentication
    thesun->>Browser: Open auth flow
    User->>Browser: Login manually
    Browser-->>thesun: Capture tokens
    thesun->>thesun: Store credentials

    Note over thesun: Phase 6: Generate MCP
    thesun->>thesun: Apply patterns
    thesun->>thesun: Generate tools
    thesun->>thesun: Inject self-healing

    Note over thesun,Validator: Phase 7: Validation Gate
    loop Until All Pass (max 3)
        Validator->>Validator: Build test
        Validator->>API: Endpoint tests
        Validator->>API: Auth flow test
        Validator->>API: Integration test
        alt Tests Fail
            Validator->>thesun: Diagnose & fix
        end
    end

    Note over thesun: Phase 8: Register
    thesun->>thesun: Add to user-mcps.json
    thesun-->>User: ✅ Ready - restart Claude Code
```

### Self-Healing System

```mermaid
stateDiagram-v2
    [*] --> Healthy: MCP Starts

    Healthy --> Checking: Health Check Interval
    Checking --> Healthy: All Endpoints OK
    Checking --> Degraded: Some Failures
    Checking --> Unhealthy: Critical Failures

    Degraded --> Healthy: Auto-Recovery Success
    Degraded --> Unhealthy: Recovery Failed

    Unhealthy --> Regenerating: Trigger Update
    Regenerating --> Healthy: Update Success
    Regenerating --> [*]: Manual Intervention

    state Healthy {
        [*] --> Monitoring
        Monitoring --> Monitoring: Track success/failure
    }

    state Checking {
        [*] --> PingEndpoints
        PingEndpoints --> ValidateAuth
        ValidateAuth --> CheckVersion
    }

    state Degraded {
        [*] --> RetryWithBackoff
        RetryWithBackoff --> RefreshToken
        RefreshToken --> FlagForReview
    }
```

### Auto-Recovery Actions

```mermaid
flowchart LR
    subgraph Detection["Issue Detection"]
        E401["401 Unauthorized"]
        E429["429 Rate Limited"]
        E404["404 Not Found"]
        E5xx["5xx Server Error"]
        SCHEMA["Schema Mismatch"]
    end

    subgraph Recovery["Auto-Recovery"]
        REFRESH["Refresh Token"]
        BACKOFF["Exponential Backoff"]
        FLAG["Flag for Regeneration"]
        RETRY["Retry with Jitter"]
        WARN["Warn User"]
    end

    subgraph Outcome["Outcome"]
        SUCCESS["✅ Recovered"]
        UPDATE["🔄 Update Needed"]
        NOTIFY["📢 User Notified"]
    end

    E401 --> REFRESH --> SUCCESS
    E429 --> BACKOFF --> SUCCESS
    E404 --> FLAG --> UPDATE
    E5xx --> RETRY --> SUCCESS
    SCHEMA --> WARN --> NOTIFY
```

---

## Credential Wizard

### Authentication Flow

```mermaid
flowchart TB
    subgraph Detection["Auth Detection"]
        ANALYZE["Analyze API Docs"]
        NETWORK["Check Network Requests"]
        DETECT["Identify Auth Type"]
    end

    subgraph AuthTypes["Auth Types"]
        OAUTH["OAuth 2.0 + PKCE"]
        APIKEY["API Key"]
        SESSION["Session/Cookie"]
        NONE["No Auth"]
    end

    subgraph BrowserFlow["Browser Auth Flow"]
        LAUNCH["Launch Firefox"]
        LOGIN["User Logs In"]
        CAPTURE["Capture Tokens"]
    end

    subgraph Storage["Secure Storage"]
        ENV["~/.thesun/credentials/<br/>target.env"]
        META["target.meta.json<br/>(expiry, scopes)"]
        REFRESH["target.refresh<br/>(encrypted)"]
    end

    subgraph AutoRefresh["Auto-Refresh"]
        CHECK["Check Expiry"]
        SILENT["Silent Refresh"]
        BROWSER["Browser Re-auth"]
    end

    Detection --> DETECT
    DETECT --> OAUTH & APIKEY & SESSION & NONE

    OAUTH --> BrowserFlow
    SESSION --> BrowserFlow
    APIKEY --> Storage

    BrowserFlow --> Storage
    Storage --> AutoRefresh

    CHECK -->|Token Valid| SILENT
    CHECK -->|Refresh Failed| BROWSER
```

---

## Pattern Detection

### Supported Patterns

| Pattern     | Detection            | Applied Features                        |
| ----------- | -------------------- | --------------------------------------- |
| **Stripe**  | `X-Stripe-*` headers | Idempotency, expand params, pagination  |
| **GitHub**  | `X-GitHub-*` headers | GraphQL + REST, rate limits, pagination |
| **AWS**     | Signature v4         | Regional endpoints, retry logic         |
| **Shopify** | GraphQL cursor       | Bulk operations, webhooks               |
| **Twilio**  | Basic auth           | Pagination, media handling              |
| **Slack**   | `X-Slack-*` headers  | Socket mode, rate limits                |

```mermaid
flowchart LR
    subgraph Input["API Response"]
        HEADERS["Response Headers"]
        BODY["Response Body"]
        ERRORS["Error Format"]
    end

    subgraph Detection["Pattern Matcher"]
        PAGINATION["Pagination Style<br/>cursor/offset/page/link"]
        RATELIMIT["Rate Limiting<br/>X-RateLimit-*/Retry-After"]
        ERRORFORMAT["Error Format<br/>stripe/rfc7807/simple"]
        AUTHSTYLE["Auth Style<br/>Bearer/X-API-Key/custom"]
    end

    subgraph Patterns["Known Patterns"]
        P1["stripe.pattern.json"]
        P2["github.pattern.json"]
        P3["aws.pattern.json"]
        P4["shopify.pattern.json"]
    end

    subgraph Apply["Applied Features"]
        RETRY["Retry Logic"]
        BACKOFF["Backoff Strategy"]
        IDEM["Idempotency"]
        WEBHOOKS["Webhook Validation"]
    end

    Input --> Detection
    Detection --> Patterns
    Patterns --> Apply
```

---

## Validation Gate

### Four-Phase Testing

```mermaid
flowchart TB
    subgraph Phase1["Phase 1: Build Validation"]
        TSC["TypeScript Compiles"]
        IMPORTS["All Imports Resolve"]
        START["MCP Server Starts"]
        REGISTER["Tools Register"]
    end

    subgraph Phase2["Phase 2: Endpoint Testing"]
        AUTH["Auth Works?"]
        REQUEST["Request Format?"]
        RESPONSE["Response Parses?"]
        PAGINATION["Pagination Works?"]
    end

    subgraph Phase3["Phase 3: Auth Flow"]
        INITIAL["Initial Auth"]
        STORE["Token Stored"]
        REFRESH["Refresh Works"]
        REAUTH["Re-auth Triggers"]
    end

    subgraph Phase4["Phase 4: Integration"]
        CRUD["CRUD Workflow"]
        RATELIMIT["Rate Limit Respect"]
        ERRORS["Error Handling"]
    end

    subgraph Iterate["Iteration Loop"]
        DIAGNOSE["Diagnose Failure"]
        FIX["Auto-Fix"]
        RETEST["Re-test"]
    end

    Phase1 -->|Pass| Phase2
    Phase2 -->|Pass| Phase3
    Phase3 -->|Pass| Phase4
    Phase4 -->|Pass| SUCCESS["✅ Complete"]

    Phase1 & Phase2 & Phase3 & Phase4 -->|Fail| Iterate
    Iterate -->|Max 3| Phase1
    Iterate -->|Exceeded| REPORT["📋 Error Report"]
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Firefox browser (for browser-based token capture)
- Playwright MCP (Claude plugin or manual install with `--browser firefox`)

### Installation

```bash
# Clone repository
git clone https://github.com/schwarztim/thesun.git
cd thesun

# Install dependencies
npm install

# Build
npm run build
```

### Usage

```bash
# Generate MCP for any API
thesun stripe

# With HAR file (skip browser discovery)
thesun stripe --har ~/Downloads/stripe.har

# Update existing MCP
thesun stripe --update

# Quick fix broken MCP
thesun stripe --fix

# Force full regeneration
thesun stripe --no-cache
```

### As Claude Code Plugin

```bash
# Generate an MCP server
/sun dynatrace

# Check build status
/sun-status
```

---

## Security

### MCP Authorization Specification

All generated MCPs follow [OAuth 2.1](https://oauth.net/2.1/) with enterprise-grade security:

| Requirement                   | Type     | Implementation                         |
| ----------------------------- | -------- | -------------------------------------- |
| **NO Token Passthrough**      | MUST NOT | Tokens never passed to downstream APIs |
| **NO Session Auth**           | MUST NOT | Sessions for state only                |
| **Token Audience Validation** | MUST     | RFC 8707 validation                    |
| **PKCE Required**             | MUST     | S256 code challenge                    |
| **Short-lived Tokens**        | SHOULD   | 15-30 min with refresh                 |

### Identity Providers

```mermaid
flowchart LR
    subgraph IdP["Identity Providers"]
        ENTRA["Entra ID"]
        OKTA["Okta"]
        AUTH0["Auth0"]
        KEYCLOAK["Keycloak"]
    end

    subgraph MCP["Generated MCP"]
        VALIDATE["Token Validation"]
        OBO["On-Behalf-Of"]
        SCOPE["Scope Enforcement"]
    end

    subgraph Downstream["Downstream APIs"]
        API1["API 1"]
        API2["API 2"]
        API3["API 3"]
    end

    IdP -->|OAuth 2.1 + PKCE| MCP
    MCP -->|OBO Token| Downstream
```

---

## Directory Structure

```
~/.thesun/
├── credentials/          # Secure credential storage
│   ├── stripe.env       # API keys, tokens
│   ├── stripe.refresh   # Encrypted refresh token
│   └── stripe.meta.json # Expiry, scopes
├── cache/               # Smart caching
│   └── stripe/
│       ├── openapi.json # Downloaded spec
│       ├── openapi.hash # SHA256 for diff
│       └── generated/   # Last generated source
├── health/              # Health monitoring
│   └── stripe/
│       ├── health.log   # Success/failure log
│       └── schema-drift.json
└── patterns/            # API pattern library
    ├── stripe.pattern.json
    ├── github.pattern.json
    └── aws.pattern.json
```

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific module tests
npm test -- src/preflight
npm test -- src/validation
```

**Current Status:** 234 tests passing across 9 test files.

---

## Technology Stack

| Category       | Technology                |
| -------------- | ------------------------- |
| **Language**   | TypeScript (strict mode)  |
| **Runtime**    | Node.js 18+               |
| **Testing**    | Vitest                    |
| **Validation** | Zod                       |
| **Logging**    | Winston                   |
| **Build**      | TSC with ESM              |
| **Protocol**   | @modelcontextprotocol/sdk |

---

## Roadmap

- [ ] GraphQL support
- [ ] WebSocket tool generation
- [ ] Multi-tenant credential isolation
- [ ] Kubernetes operator for MCP lifecycle
- [ ] Visual MCP builder UI

---

## License

Proprietary - Internal use only.

---

<p align="center">
  <sub>Built with ❤️ for autonomous AI tooling</sub>
</p>
