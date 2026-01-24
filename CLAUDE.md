# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**thesun** is a security-first autonomous platform for generating, testing, and operating MCP (Model Context Protocol) servers with near-zero human involvement. Given a list of tools/APIs, it automatically:

1. Researches and discovers all API endpoints (web search, vendor docs, OpenAPI specs)
2. Generates production-ready MCP server implementations
3. Builds and runs comprehensive tests (unit, integration, contract)
4. Iterates until tests pass, then optimizes for performance
5. Continuously validates for functionality drift and dependency changes

### Core Design Principles

- **Zero-involvement development loop**: Human action limited to auth provision and deployment approval
- **Per-tool isolation via bob instances**: Each tool build runs in its own isolated Claude Code session
- **Exhaustive API discovery**: Never generate an MCP without first cataloging ALL available endpoints
- **Speed-optimized feedback loops**: Continuously profile and optimize generated MCPs
- **Security by default**: Least privilege, vault-based secrets, automated scanning
- **Configuration abstraction**: All company-specific data MUST be environment variables - generated MCPs must be generic and publishable
- **Cross-platform compatibility**: Must work on Windows, macOS, and Linux

### Model Selection Strategy

Use appropriate Claude model for each task type to optimize cost and quality:

| Task Type                               | Model      | Rationale                                  |
| --------------------------------------- | ---------- | ------------------------------------------ |
| Planning, architecture, security review | **Opus**   | Critical decisions need maximum capability |
| Initial code generation, discovery      | **Sonnet** | Good balance of quality and cost           |
| Test iterations, bug fixes (passes 2+)  | **Sonnet** | Bulk of work, cost-efficient               |
| Simple validation, lookups              | **Haiku**  | Fast and cheap for simple tasks            |

## Plugin Usage

thesun is a Claude Code plugin. After installation, use these commands:

```bash
# Generate an MCP server autonomously
/sun dynatrace

# Generate with specific output directory
/sun servicenow --output=./servicenow-mcp

# Check build status
/sun-status

# Research APIs without generating (exploration)
# Use the research-api skill via natural language
```

The `/sun` command spawns the `mcp-builder` agent which runs autonomously through all phases.

### Three Modes

thesun supports three modes of operation:

| Mode                 | Trigger                                              | Use Case                                       |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| **CREATE** (default) | `thesun({ target: "api-name" })`                     | Build MCP from documented APIs                 |
| **FIX**              | `thesun({ target: "name", fix: "/path" })`           | Fix existing broken MCP                        |
| **INTERACTIVE**      | `thesun({ target: "name", siteUrl: "https://..." })` | Reverse-engineer undocumented APIs via browser |

### Interactive Mode (Browser Capture)

For sites without public APIs, thesun can reverse-engineer API endpoints by capturing network traffic:

```bash
# Interactive mode - reverse-engineer via browser capture
thesun({ target: "myapp", siteUrl: "https://app.example.com" })

# With login URL pre-specified
thesun({ target: "myapp", siteUrl: "https://app.example.com", loginUrl: "/login" })

# With specific actions to capture
thesun({
  target: "myapp",
  siteUrl: "https://app.example.com",
  loginUrl: "/auth/signin",
  actions: ["view profile", "list orders", "create item"]
})

# If API docs exist, skip browser capture
thesun({
  target: "myapp",
  siteUrl: "https://app.example.com",
  apiDocsUrl: "https://app.example.com/api/docs"
})
```

**Interactive Mode Workflow:**

1. **Clarifying Questions** - Asks for login URL, main actions, API docs availability
2. **Browser Launch** - Opens Chrome via chrome-devtools-mcp (required dependency)
3. **Manual Login** - User logs in manually (handles CAPTCHA/2FA)
4. **Traffic Capture** - Monitors all XHR/fetch requests while user performs actions
5. **Analysis** - Extracts endpoints, auth patterns, request/response shapes
6. **User Approval** - Presents captured endpoints for review before generating
7. **MCP Generation** - Creates TypeScript MCP with auto-refresh authentication
8. **Registration** - Registers globally in ~/.claude/user-mcps.json

**Requirements for Interactive Mode:**

- chrome-devtools-mcp must be configured and available
- User must be able to log in manually during capture phase
- Works best with SPAs that make clear API calls

## Architecture

```
thesun/
├── .claude-plugin/           # Plugin configuration
│   ├── plugin.json          # Plugin manifest
│   ├── commands/            # Slash commands (/sun, /sun-status)
│   ├── skills/              # Invocable skills
│   └── agents/              # Autonomous agents
├── governance/              # Watcher and supervisor system
│   ├── job-watcher.ts      # Per-job watcher (maintains context)
│   └── supervisor.ts       # Global supervisor (watches watchers)
├── orchestrator/           # Central coordinator (state machine, persistence)
│   ├── index.ts           # Main orchestrator entry point
│   ├── state-machine.ts   # Build lifecycle state management
│   ├── scheduler.ts       # Parallel build scheduling with resource limits
│   └── persistence.ts     # Idempotent state storage (SQLite)
├── discovery/             # API research and spec collection
│   ├── web-research.ts    # Search for existing MCPs, vendor APIs, docs
│   ├── openapi-fetcher.ts # Download and validate OpenAPI/Swagger specs
│   ├── endpoint-mapper.ts # Enumerate all endpoints from specs
│   └── gap-analyzer.ts    # Compare against reference implementations
├── generator/             # MCP server code generation
│   ├── templates/         # TypeScript MCP server templates
│   ├── tool-generator.ts  # Generate tools from OpenAPI operations
│   ├── auth-generator.ts  # Generate auth handlers (OAuth, API key, etc.)
│   └── test-generator.ts  # Generate test suites from specs
├── bob/                   # Bob instance lifecycle manager
│   ├── instance-manager.ts # Create/destroy isolated Claude sessions
│   ├── session-store.ts   # Track active sessions, env vars, state
│   └── isolation.ts       # Filesystem, env var, and process isolation
├── testing/               # Test execution and validation
│   ├── runner.ts          # Execute test suites (vitest/jest)
│   ├── contract-tests.ts  # Verify against OpenAPI schemas
│   ├── mock-server.ts     # Mock backend APIs for testing
│   └── coverage.ts        # Track and enforce coverage thresholds
├── security/              # Security scanning and validation
│   ├── sast.ts            # Static analysis (eslint-security, bandit)
│   ├── dependency-scan.ts # CVE scanning (Snyk, npm audit)
│   ├── secret-scan.ts     # Detect hardcoded secrets
│   └── threat-model.ts    # Auto-generate threat models per tool
├── workflows/             # Post-MCP workflow automation
│   ├── jira-integration.ts # Read issues, execute fixes, create MCPs
│   ├── workflow-engine.ts # Define and execute organizational workflows
│   └── triggers.ts        # Event-based workflow triggers
├── agents/                # Dynamically created per-phase agents
│   ├── researcher.ts      # API discovery and documentation gathering
│   ├── implementer.ts     # Code generation and iteration
│   ├── tester.ts          # Test execution and failure diagnosis
│   └── optimizer.ts       # Performance profiling and optimization
├── observability/         # Metrics, logging, tracing
│   ├── metrics.ts         # Prometheus-compatible metrics
│   ├── logger.ts          # Structured logging (Winston)
│   └── tracer.ts          # OpenTelemetry tracing
└── cli/                   # Command-line interface
    └── index.ts           # CLI entry point
```

## Build & Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run development mode (watch)
npm run dev

# Run tests
npm test

# Run single test file
npm test -- path/to/test.ts

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format

# Generate MCP for a tool (example)
npm run generate -- --tool=dynatrace --output=./output/dynatrace-mcp

# Start orchestrator in daemon mode
npm run orchestrator:start

# Check orchestrator status
npm run orchestrator:status
```

## Key Concepts

### Bob Instance Isolation

Each tool build runs in its own isolated "bob" instance (a Claude Code session):

- Separate filesystem workspace (via git worktrees for parallel builds)
- Isolated environment variables (no cross-contamination)
- Independent caches and state
- No need to restart Claude between tools
- **Inherits user's MCP servers** (Confluence, Jira, Akamai, Teams, Elastic)
- **Inherits user's plugins** (thesun tools available in sub-agents)

```typescript
// Create isolated instance for tool build with parallel support
const instance = await bobManager.create({
  toolName: "dynatrace",
  // Git worktree for true parallel isolation
  gitRepo: "/path/to/workspace",
  branch: `build/dynatrace-${Date.now()}`,
  // Inherit user's MCP servers for knowledge access
  inheritMcpServers: true,
  // Inherit thesun plugin tools
  inheritPlugins: true,
});

// Execute work in isolation - bob can use Confluence, Jira, etc.
const result = await bobManager.execute(
  instance.id,
  "Research and generate MCP",
  {
    phase: "discovering",
  },
);

// Clean up (includes worktree removal)
await bobManager.destroy(instance.id);
```

### Parallel Multi-Tool Builds

Generate multiple MCPs simultaneously with true parallelism:

```bash
# Single command, multiple targets - runs in parallel
thesun({ target: "tesla, stripe, jira" })
# Or with explicit array
thesun({ targets: ["tesla", "stripe", "jira"] })
```

Each target gets:

- Its own git worktree (isolated working directory)
- Its own bob instance (separate Claude session)
- Access to all user's MCP servers (for searching docs, knowledge bases)
- Independent progress tracking

### API Discovery Flow

Before generating any MCP, the system exhaustively discovers APIs:

1. **Web Research**: Search for existing MCPs, vendor documentation, community resources
2. **Spec Fetching**: Download OpenAPI/Swagger specs from official sources
3. **Endpoint Enumeration**: Map ALL endpoints including pagination, filtering, permissions
4. **Gap Analysis**: Compare against best-in-class implementations, flag missing coverage
5. **Validation**: Test discovered endpoints against live APIs (with auth)

### Feedback Loops (Ralph Loops)

The system implements continuous improvement loops:

- **Test Failure Loop**: When tests fail, diagnose → fix → retest → repeat
- **Performance Loop**: Profile → identify bottlenecks → optimize → measure → repeat
- **Coverage Loop**: Check coverage → add missing tests → run → repeat
- **Drift Detection Loop**: Monitor for API changes → update specs → regenerate → test

### Security Gates

Every build passes through security gates:

```
[Discovery] → [Generation] → [SAST] → [Dependency Scan] → [Secret Scan] → [Tests] → [Release]
                               ↓            ↓                  ↓
                            BLOCK       BLOCK              BLOCK
                         (critical)  (critical CVE)    (any secrets)
```

### Governance Layer (Watchers)

Each job has its own dedicated watcher to prevent runaway processes:

```
                    ┌─────────────────────┐
                    │     SUPERVISOR      │  (watches all watchers)
                    │  - Global limits    │
                    │  - System health    │
                    │  - Emergency stop   │
                    └─────────┬───────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
│ Job Watcher │       │ Job Watcher │       │ Job Watcher │
│  (Tool A)   │       │  (Tool B)   │       │  (Tool C)   │
│             │       │             │       │             │
│ - Progress  │       │ - Progress  │       │ - Progress  │
│ - Timeouts  │       │ - Timeouts  │       │ - Timeouts  │
│ - Cost      │       │ - Cost      │       │ - Cost      │
│ - Context   │       │ - Context   │       │ - Context   │
└─────────────┘       └─────────────┘       └─────────────┘
```

**Per-Job Watcher** (`governance/job-watcher.ts`):

- Maintains full context for its job
- Tracks progress checkpoints
- Enforces phase timeouts (10 min default)
- Monitors API call rate
- Tracks cost and enforces limits ($50/job default)
- Can pause job for human review
- Triggers loop-back when needed

**Supervisor** (`governance/supervisor.ts`):

- Watches all job watchers
- Enforces global limits ($200/hour, 10 concurrent jobs)
- Performs system health checks
- Can pause ALL jobs in emergency
- Provides dashboard data

## Reference Implementation

The Akamai MCP server (`~/Scripts/akamai-mcp-server`) is the reference for generated MCPs:

- **100% API coverage**: 1,444 tools from 59 OpenAPI specs
- **Reliability patterns**: Circuit breaker, connection pooling, caching, graceful shutdown
- **Developer experience**: Interactive CLI, health checks, mock mode
- **Security**: Header allowlist, parameter validation, no secret leakage
- **Performance**: 6ms tool generation, <1s startup, 43% faster with connection reuse

### Knowledge Aggregation

The system pulls context from multiple enterprise sources:

- **Jira**: Issues, solutions, implementation patterns, team knowledge
- **Confluence**: Documentation, architecture, runbooks
- **ServiceNow**: Incidents, problems, changes, resolutions
- **GitHub**: Existing implementations, discussions, code patterns

This enables context-aware generation that learns from how similar tools were implemented, common issues and solutions, and team preferences.

## Integration Points

- **Jira**: Read issues, execute work items, create new issues for missing integrations
- **Confluence**: Publish documentation, architecture diagrams
- **GitHub**: Create PRs, run CI, manage releases
- **Greptile**: Code review, custom context
- **ServiceNow**: Incident patterns, problem resolutions, change tracking

## Self-Improvement System

thesun is itself subject to iterative improvement. The system:

1. **Tracks its own effectiveness**: Success/failure rates, iteration counts, common failure patterns
2. **Learns from failures**: When builds fail repeatedly, captures the pattern for future improvement
3. **Optimizes its prompts**: Adjusts agent prompts based on what produces best results
4. **Updates its own code**: Can propose improvements to its own modules via PR

```
[Build Attempt] → [Success?] → [Capture Pattern] → [Apply Learning] → [Next Build]
                      ↓
                 [Failure] → [Diagnose] → [Fix or Learn] → [Retry or Record]
```

To improve thesun itself, run:

```bash
npm run self-improve -- --analyze-failures
```

## Technology Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 18+
- **Testing**: Vitest
- **Validation**: Zod
- **Logging**: Winston
- **Build**: TSC with ESM modules
- **MCP Protocol**: @modelcontextprotocol/sdk

## Environment Variables

```bash
# Required for orchestrator
THESUN_DATA_DIR=/path/to/state      # Persistent state storage
THESUN_WORKSPACE=/path/to/builds    # Build workspace directory

# Optional
LOG_LEVEL=info                       # error, warn, info, debug
MAX_PARALLEL_BUILDS=4                # Concurrent tool builds
BOB_ISOLATION_MODE=process           # process, container, or vm
```

## Coding Conventions

- Use `async/await` for all async operations
- Prefer `Zod` for runtime validation over type assertions
- All public functions must have JSDoc comments
- Error handling: throw typed errors, catch at boundaries
- Logging: structured JSON logs with correlation IDs
- Tests: co-located with source (`*.test.ts`)

## Configuration Abstraction Rules

Generated MCPs MUST be generic and reusable. Follow these rules:

1. **Never hardcode company-specific data**: URLs, domains, API keys, emails, IPs
2. **All config via environment variables**: Use `process.env.TOOL_VAR` pattern
3. **Generate .env.example**: Document all required/optional config with fake examples
4. **Validate on startup**: Use Zod schemas to validate config presence and format
5. **Secrets never logged**: Mark secrets in config schema, filter from logs

```typescript
// GOOD - uses environment variable
const baseUrl = process.env.DYNATRACE_BASE_URL;

// BAD - hardcoded company URL
const baseUrl = "https://mycompany.dynatrace.com";
```

## Cross-Platform Requirements

All code must work on Windows, macOS, and Linux:

- Use `path.join()` for file paths, never string concatenation
- Use `src/utils/platform.ts` utilities for shell commands
- Test file operations work with both forward and back slashes
- Use `cross-env` for npm scripts that set env vars
- Avoid Unix-specific commands (sed, awk) - use Node.js APIs

## Security Architecture

Generated MCPs follow the MCP Authorization Specification (OAuth 2.1) with enterprise-grade security.

### Critical Security Requirements

Based on [MCP Security Best Practices](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices):

| Requirement                   | Type     | Implementation                                         |
| ----------------------------- | -------- | ------------------------------------------------------ |
| **NO Token Passthrough**      | MUST NOT | Tokens are NEVER passed from client to downstream APIs |
| **NO Session Authentication** | MUST NOT | Sessions for state only, not auth                      |
| **Token Audience Validation** | MUST     | Every token validated for THIS server (RFC 8707)       |
| **PKCE Required**             | MUST     | All auth code flows use S256 code challenge            |
| **Short-lived Tokens**        | SHOULD   | 15-30 minute access tokens with refresh                |
| **Scope Minimization**        | SHOULD   | Start with `mcp:tools-basic`, elevate on demand        |

### Authentication Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Identity Provider                           │
│            (Entra ID / Okta / Auth0 / Keycloak)                │
└────────────────────────┬────────────────────────────────────────┘
                         │
              OAuth 2.1 + PKCE + Resource Indicators (RFC 8707)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    MCP Client                                    │
│              (Claude, Agent, etc.)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
               Bearer Token (short-lived, audience-validated)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                 MCP Server (Resource Server)                     │
│   - Validates token audience matches THIS server                │
│   - Enforces scopes and permissions                             │
│   - Uses On-Behalf-Of for downstream (NOT passthrough)          │
│   - NEVER stores tokens                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Identity Provider Support

The security module supports multiple identity providers:

```typescript
// Entra ID (Azure AD)
const authConfig = {
  provider: "entra_id",
  issuer: "https://login.microsoftonline.com/{tenant}/v2.0",
  tenantId: process.env.AZURE_TENANT_ID,
  useOnBehalfOf: true, // For downstream service access
};

// Okta, Auth0, Keycloak work similarly
```

### Security Hardening

Located in `src/security/hardening.ts`:

- **Input Sanitization**: Blocks SQL injection, command injection, path traversal
- **Session Binding**: Sessions bound to user ID format: `<user_id>:<uuid>`
- **Scope Validation**: Rejects wildcard scopes (`*`, `all`, `full-access`)
- **Sensitive Path Detection**: Warns on access to `.ssh`, `.aws`, credentials

### Known Vulnerabilities Mitigated

- CVE-2025-49596 (RCE in MCP Inspector)
- SQL injection in SQLite MCP Reference
- Command injection via unsanitized input
- Token misuse through passthrough attacks

### Security Checklist

Run `generateSecurityChecklist()` to get the full security review checklist for any generated MCP.

## Context Management

To prevent token bloat and context pollution from irrelevant search results:

### Relevance Filtering

All search results (Confluence, Jira, ServiceNow, GitHub, Web) pass through the `ContextManager`:

```typescript
// Search results are evaluated BEFORE entering context
const result = await contextManager.addSearchResult(
  source,
  content,
  query,
  relevanceEvaluator,
);

// Low relevance (<0.3): Discarded immediately
// Medium relevance (0.3-0.5): Key facts extracted
// High relevance (0.5-0.7): Compressed, irrelevant parts removed
// Very high relevance (>0.7): Kept in full
```

### Token Budget

| Budget Type            | Default       | Purpose                 |
| ---------------------- | ------------- | ----------------------- |
| Search Results         | 10,000 tokens | Per-search limit        |
| Total Context          | 50,000 tokens | All accumulated context |
| Reserved for Reasoning | 20,000 tokens | Agent thinking space    |
| Warning Threshold      | 80%           | Triggers pruning        |

### Automatic Eviction

When budget is exceeded, low-relevance items are evicted:

1. Never evict verified facts
2. Evict by relevance (lowest first)
3. Then by age (oldest first)

## Bob Orchestration

For background execution and plugin rotation:

### Parent-Child Bob Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Parent Bob (Tool Build)                       │
│   - Owns the workspace                                          │
│   - Receives plugin updates                                     │
│   - Tracked by Job Watcher                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
│  Sub-Bob 1  │  │  Sub-Bob 2  │  │  Sub-Bob 3  │
│ (Discovery) │  │ (Generate)  │  │  (Testing)  │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Plugin Auto-Refresh

The `BobOrchestrator` monitors plugin.json for changes:

- Background polling every 30 seconds
- Emits `pluginUpdated` event on changes
- Syncs new plugin files to bob workspaces
- Watchers can see all sub-bobs per task
