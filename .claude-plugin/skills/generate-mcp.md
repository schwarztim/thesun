---
name: generate-mcp
description: Generate a production-ready MCP server for any tool/API
---

# Generate MCP Skill

This skill generates complete, production-ready MCP servers autonomously.

## When to Use

Use this skill when:
- User asks to "create an MCP server for X"
- User wants to "integrate with X API"
- User needs to "automate X tool"
- A workflow requires an MCP that doesn't exist

## How It Works

1. **Spawn the mcp-builder agent** with the tool specification
2. Agent runs autonomously through all phases
3. Returns completed MCP server code

## Invocation

```
To generate an MCP server for {tool}, I'll spawn the mcp-builder agent.

<Task subagent_type="mcp-builder">
Generate a complete MCP server for {tool}.

Tool: {tool}
Output: {output_path or default}
Spec URL: {spec_url if provided}

Run through all phases:
1. Discovery - research all APIs
2. Generation - create TypeScript MCP server
3. Testing - run and iterate until passing
4. Security - scan and remediate
5. Optimization - performance tuning
6. Documentation - README and usage guide

Report back with:
- Endpoint count
- Test results
- Any issues encountered
</Task>
```

## What Gets Generated

```
{tool}-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/                # Tool implementations
│   │   ├── {resource}-tools.ts
│   │   └── ...
│   ├── auth/                 # Authentication
│   ├── utils/                # Utilities (retry, logging, etc.)
│   └── types/                # TypeScript types
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example              # Config template (no real secrets)
├── README.md                 # Usage documentation
└── CLAUDE.md                 # Claude Code guidance
```

## Configuration Abstraction

**CRITICAL**: Generated MCPs must be generic and publishable.

All configuration via environment variables:
- `{TOOL}_API_KEY` - API credentials
- `{TOOL}_BASE_URL` - API endpoint (with default)
- `LOG_LEVEL` - Logging verbosity
- etc.

NO hardcoded:
- Company URLs
- API keys/tokens
- Email addresses
- IP addresses

## Quality Gates

The generated MCP must pass:
- ✅ All tests passing
- ✅ 70%+ code coverage
- ✅ No critical security issues
- ✅ No hardcoded secrets
- ✅ Startup time <1s
- ✅ Complete documentation

## Error Handling

If generation fails:
1. Check the error in the build log
2. Most issues are auto-remediated via iteration
3. Persistent failures are documented in the output
4. Unresolved issues require manual intervention
