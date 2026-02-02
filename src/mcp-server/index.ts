#!/usr/bin/env node
/**
 * thesun MCP Server (Browser-Enhanced)
 *
 * Single autonomous tool for MCP generation. Just say "use thesun for <target>"
 * and it handles everything: research, generation, testing, registration.
 *
 * KEY FEATURES:
 * - Uses ABSOLUTE paths for all output (never relative to current directory)
 * - All generated MCPs are registered globally in ~/.claude/user-mcps.json
 * - Supports bob instances for isolated parallel builds
 * - Model selection: Opus for planning/security, Sonnet for implementation
 *
 * BROWSER-ENHANCED MODULES:
 * - DependencyChecker: Preflight checks for Playwright MCP + Firefox browser
 * - McpRegistrySearch: Find existing MCPs before generating
 * - CredentialWizard: Browser-based auth capture and token refresh
 * - PatternEngine: Apply known API patterns (Stripe, GitHub, AWS)
 * - SelfHealingModule: Health monitoring and auto-recovery
 * - ValidationGate: Post-generation validation with retry
 * - SmartCache: Incremental updates and spec caching
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { homedir } from "os";
import { join } from "path";

// Browser-enhanced module imports
import { getDependencyChecker } from "../preflight/dependency-checker.js";
import { getMcpRegistrySearch } from "../discovery/mcp-registry-search.js";
import { CredentialWizard } from "../auth/credential-wizard.js";
import { PatternEngine } from "../patterns/pattern-engine.js";
import { SelfHealingModule } from "../health/self-healing.js";
import { ValidationGate } from "../validation/validation-gate.js";
import { SmartCache } from "../cache/smart-cache.js";

// Central MCP output directory - NEVER relative to current working directory
const MCP_OUTPUT_BASE = join(homedir(), "Scripts", "mcp-servers");

// Single unified tool
const TOOLS: Tool[] = [
  {
    name: "thesun",
    description: `Autonomous MCP server generator for ANY API or webapp. Creates, fixes, or reverse-engineers MCP servers.

**THREE MODES:**

1. **CREATE MODE** (default): "use thesun for Tesla" - Creates MCP from documented APIs
2. **FIX MODE**: "use thesun to fix /path/to/mcp" - Fixes existing broken MCP code
3. **INTERACTIVE MODE**: "use thesun for myapp with site url" - Reverse-engineers undocumented APIs via browser capture

thesun handles EVERYTHING autonomously:
- Researches the API (web search, docs, OpenAPI specs)
- Creates OR fixes MCP server code
- Captures tokens from browser for sites without APIs (Playwright + Firefox)
- Writes comprehensive tests
- Runs security scans
- Registers globally in ~/.claude/user-mcps.json

**CREATE Examples:**
- thesun({ target: "tesla" }) - Creates Tesla Fleet API MCP
- thesun({ target: "stripe" }) - Creates Stripe payments MCP

**FIX Examples:**
- thesun({ target: "atlassian", fix: "/Users/tim/Scripts/AtlassianPlugin" }) - Fix existing plugin
- thesun({ target: "jira", fix: "." }) - Fix MCP in current directory

**INTERACTIVE Examples (for sites WITHOUT public APIs):**
- thesun({ target: "myapp", siteUrl: "https://app.example.com" }) - Captures API from browser
- thesun({ target: "intranet", siteUrl: "https://intranet.corp.com", loginUrl: "/sso/login" }) - With SSO
- thesun({ target: "admin", siteUrl: "https://admin.tool.com", actions: ["list users", "create report"] }) - With specific actions`,
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description:
            'The API/service name (e.g., tesla, stripe, atlassian, jira). Can also be comma-separated for batch: "tesla, stripe, jira"',
        },
        targets: {
          type: "array",
          items: { type: "string" },
          description:
            'Array of API/service names for parallel batch generation (e.g., ["tesla", "stripe", "jira"])',
        },
        fix: {
          type: "string",
          description:
            "Path to existing MCP code to fix. If provided, runs in FIX mode instead of CREATE mode.",
        },
        output: {
          type: "string",
          description: `Output directory for CREATE mode. Defaults to ~/Scripts/mcp-servers/<target>-mcp/. Ignored in FIX mode.`,
        },
        spec: {
          type: "string",
          description: "Optional OpenAPI/Swagger spec URL or path",
        },
        parallel: {
          type: "boolean",
          description:
            "Run batch generation in parallel (default: true). Each target gets its own isolated bob instance.",
        },
        siteUrl: {
          type: "string",
          description:
            "Site URL for INTERACTIVE mode - reverse-engineer APIs by capturing browser traffic. thesun will open the site, let you log in, capture network requests, and generate an MCP from the observed API calls.",
        },
        loginUrl: {
          type: "string",
          description:
            "Login URL path (e.g., '/login' or '/auth/signin'). Used with siteUrl for interactive mode.",
        },
        actions: {
          type: "array",
          items: { type: "string" },
          description:
            'Actions to perform after login (e.g., ["view profile", "list orders"]). Used to capture specific API endpoints.',
        },
        apiDocsUrl: {
          type: "string",
          description:
            "If API docs exist at a known URL, provide it to skip browser capture and use documented endpoints.",
        },
        authMethod: {
          type: "string",
          enum: ["auto", "sso", "api_key", "oauth", "har", "none"],
          description:
            "Force a specific authentication method. 'sso' = Azure AD/corporate SSO via browser, 'api_key' = API key/token, 'oauth' = OAuth2 flow, 'har' = HAR file capture, 'none' = no auth needed, 'auto' = detect from API docs (default).",
        },
        skipApiKeySearch: {
          type: "boolean",
          description:
            "Skip searching for API key documentation. Use when you know the service requires SSO/browser auth and want to avoid API key prompts.",
        },
      },
      required: ["target"],
    },
  },
];

const TheSunInput = z.object({
  target: z.string().min(1),
  targets: z.array(z.string()).optional(),
  fix: z.string().optional(),
  output: z.string().optional(),
  spec: z.string().optional(),
  parallel: z.boolean().optional().default(true),
  // INTERACTIVE mode parameters
  siteUrl: z.string().url().optional(),
  loginUrl: z.string().optional(),
  actions: z.array(z.string()).optional(),
  apiDocsUrl: z.string().url().optional(),
  // Auth method override
  authMethod: z
    .enum(["auto", "sso", "api_key", "oauth", "har", "none"])
    .optional()
    .default("auto"),
  skipApiKeySearch: z.boolean().optional().default(false),
});

class TheSunMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "thesun",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === "thesun") {
          return await this.handleTheSun(args);
        }
        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  private async handleTheSun(
    args: unknown,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const input = TheSunInput.parse(args);

    const homeDir = homedir();
    // CRITICAL: Use user-mcps.json - this is auto-loaded by Claude without needing whitelist
    // DO NOT use .claude.json (not read for MCPs) or mcp.json (needs whitelist in settings.json)
    const mcpConfigPath = join(homeDir, ".claude", "user-mcps.json");

    // Parse targets: support array, comma-separated string, or single target
    let allTargets: string[] = [];
    if (input.targets && input.targets.length > 0) {
      allTargets = input.targets
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    } else if (input.target.includes(",")) {
      allTargets = input.target
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    } else {
      allTargets = [input.target.trim()];
    }

    // FIX MODE: Fix existing MCP code (single target only)
    if (input.fix) {
      const fixPath = input.fix.startsWith("/")
        ? input.fix
        : join(homeDir, "Scripts", input.fix);
      return this.handleFixMode(
        allTargets[0],
        fixPath,
        mcpConfigPath,
        input.spec,
      );
    }

    // INTERACTIVE MODE: Reverse-engineer APIs via browser capture
    if (input.siteUrl) {
      const outputDir = input.output
        ? input.output.startsWith("/")
          ? input.output
          : join(MCP_OUTPUT_BASE, input.output)
        : join(MCP_OUTPUT_BASE, `${allTargets[0]}-mcp`);

      return this.handleInteractiveMode(
        allTargets[0],
        input.siteUrl,
        outputDir,
        mcpConfigPath,
        input.loginUrl,
        input.actions,
        input.apiDocsUrl,
      );
    }

    // BATCH MODE: Multiple targets - generate parallel orchestration instructions
    if (allTargets.length > 1) {
      return this.handleBatchMode(
        allTargets,
        mcpConfigPath,
        input.parallel ?? true,
      );
    }

    // SINGLE MODE: Generate one MCP
    const target = allTargets[0];
    // ALWAYS use absolute path - never relative to current directory
    let outputDir: string;
    if (input.output) {
      // If user provided path, ensure it's absolute
      outputDir = input.output.startsWith("/")
        ? input.output
        : join(MCP_OUTPUT_BASE, input.output);
    } else {
      // Default to central MCP output location
      outputDir = join(MCP_OUTPUT_BASE, `${target}-mcp`);
    }

    const instructions = `
# thesun: Autonomous MCP Generation for "${target}" (Browser-Enhanced)

You are now operating as **thesun**, an autonomous MCP generation system.
Execute the complete pipeline below WITHOUT stopping for human input.

**Target:** ${input.target}
**Output:** ${outputDir}
**MCP Config:** ${mcpConfigPath}
${input.spec ? `**Spec:** ${input.spec}` : ""}
${input.authMethod !== "auto" ? `**Auth Method:** ${input.authMethod} (FORCED - do NOT search for or suggest API keys)` : ""}
${input.skipApiKeySearch ? `**Skip API Key Search:** YES - User explicitly wants browser/SSO auth, not API keys` : ""}

> **IMPORTANT**: This tool is directory-independent. The output path is ABSOLUTE.
> The generated MCP will be available globally in ALL Claude sessions.
${
  input.authMethod === "sso"
    ? `
> **SSO MODE**: Generate using Azure AD SSO browser authentication.
> - DO NOT look for or mention API keys/tokens
> - DO NOT prompt user to create API tokens
> - Use browser-based SSO auth (Playwright Firefox)
> - Capture session cookies for API calls
> - Auto-reauthenticate on 401 errors
`
    : ""
}${
      input.skipApiKeySearch
        ? `
> **NO API KEYS**: User explicitly does not want API key authentication.
> - Skip all API key documentation searches
> - Do not suggest creating API tokens
> - Use browser capture or SSO for authentication
`
        : ""
    }

---

## PHASE 0: PREFLIGHT CHECK

Run DependencyChecker.runPreflight() to verify all dependencies:
- Playwright MCP available? (with --browser firefox for token capture)
- Firefox browser available? (required for Playwright Firefox mode)
- ~/.thesun/ ready?

**Decision:**
- Pass -> Continue to Phase 1
- Fail -> Return error with install instructions

---

## PHASE 1: EXISTING MCP CHECK

### 1.1 Check Cache
SmartCache.getSpec("${target}")
- Cached spec available?
  - Yes + not stale -> Use cached
  - No or stale -> Continue

### 1.2 Search Registries
McpRegistrySearch.search("${target}")
- Score 90+ -> Install existing, done
- Score 70-89 -> Install + extend
- Score <70 -> Generate from scratch

### 1.3 Legacy Search (if no registry hits)
Search for existing MCP implementations:
- GitHub: "${input.target} MCP server"
- MCP registries: mcp.so, pulsemcp.com, mcpmarket.com
- npm: @*/*${input.target}*mcp*

**Decision Point:** If a high-quality existing MCP exists with good coverage:
- Recommend using it instead
- Provide installation instructions
- STOP here (no need to regenerate)

If no good existing MCP, continue to Phase 2.

---

## PHASE 2: DISCOVERY (Enhanced)

### 2.1 Pattern Matching
PatternEngine.matchKnownPattern("${target}")
- Apply known patterns if found (pagination, error handling, rate limiting)

### 2.2 Gather API Information
- Find official API documentation
- Locate OpenAPI/Swagger specifications
- Identify authentication method (OAuth, API key, etc.)
- Map main endpoint categories
- Note rate limits and quotas

---

## PHASE 3: AUTHENTICATION

CredentialWizard.loadCredentials("${target}")

### 3.1 Check Existing Credentials

Check for credentials in this order:
1. Environment variable: \`${input.target.toUpperCase().replace(/-/g, "_")}_API_KEY\`
2. Extracted token: \`${input.target.toUpperCase().replace(/-/g, "_")}_EXTRACTED_TOKEN\`
3. HAR file: \`~/.thesun/credentials/${input.target}.har\`
4. Credential file: \`~/.thesun/credentials/${input.target}.env\`

**If credentials found:**
- Valid? -> Use them
- Expired? -> Try refresh, else capture new

### 3.2 Browser Auth Flow (If No Credentials)

If no credentials exist, use Playwright to capture tokens:

**Step 1: Find the login URL**
\`\`\`
WebSearch: "${input.target} login URL"
WebSearch: "${input.target} authentication page"
\`\`\`

**Step 2: Open Browser (Playwright + Firefox)**
\`\`\`
Call: mcp__plugin_playwright_playwright__browser_navigate
Args: { "url": "https://login.${input.target.toLowerCase()}.com" }
\`\`\`

**Step 3: Message User**
\`\`\`
🔐 Browser opened for ${input.target} authentication.

Please log in manually (handles CAPTCHA, 2FA, SSO).
Say "done" when you've completed login.

I'll capture your session tokens automatically.
\`\`\`

**Step 4: After Login - Extract Tokens**

From localStorage:
\`\`\`
Call: mcp__plugin_playwright_playwright__browser_evaluate
Args: {
  "expression": "JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('session'))))"
}
\`\`\`

From sessionStorage:
\`\`\`
Call: mcp__plugin_playwright_playwright__browser_evaluate
Args: {
  "expression": "JSON.stringify(Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => k.toLowerCase().includes('token') || k.toLowerCase().includes('auth'))))"
}
\`\`\`

From network requests (captures Authorization headers):
\`\`\`
Call: mcp__plugin_playwright_playwright__browser_network_requests
\`\`\`

**Step 5: Store Extracted Credentials**
Save to \`~/.thesun/credentials/${input.target}.env\`:
\`\`\`
${input.target.toUpperCase().replace(/-/g, "_")}_EXTRACTED_TOKEN=[captured token]
${input.target.toUpperCase().replace(/-/g, "_")}_AUTH_TYPE=[Bearer/Cookie/ApiKey]
${input.target.toUpperCase().replace(/-/g, "_")}_EXPIRES_AT=[timestamp if detected]
\`\`\`

### 3.3 Authentication Type Detection

From captured data, determine auth type:
| Pattern | Auth Type | Usage |
|---------|-----------|-------|
| \`Authorization: Bearer xxx\` | OAuth2/JWT | Use as Bearer token |
| \`Authorization: ApiKey xxx\` | API Key | Use as API key |
| \`Cookie: session=xxx\` | Session Cookie | Pass cookies with requests |
| \`x-api-key: xxx\` | API Key Header | Use custom header |

---

## PHASE 4: GENERATE MCP (Only if no existing MCP)

### 2.1 Create Project Structure

First, ensure the output directory exists:
\`\`\`bash
mkdir -p "${outputDir}"
\`\`\`

Then create the project structure:
\`\`\`
${outputDir}/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── browser-auth.ts   # Auto-renewing browser authentication
│   └── types.ts          # Type definitions
├── scripts/
│   ├── install.sh        # Linux/macOS installer
│   └── install.ps1       # Windows PowerShell installer
├── package.json
├── tsconfig.json
├── .env.example          # Required environment variables
└── README.md             # With easy install instructions
\`\`\`

**CRITICAL: browser-auth.ts Module**

Copy the browser auth template from thesun:
\`\`\`bash
cp ${join(homedir(), "Scripts", "mcp-servers", "thesun", "src", "templates", "browser-auth.ts")} ${outputDir}/src/browser-auth.ts
\`\`\`

Then inject the Playwright capture logic at line 200 (captureAuthWithPlaywright method):

\`\`\`typescript
private async captureAuthWithPlaywright(): Promise<TokenData> {
  // Import Playwright MCP tool caller (injected at generation time)
  const { callMcpTool } = await import('./mcp-tool-caller.js');

  // Navigate to login
  await callMcpTool('mcp__plugin_playwright_playwright__browser_navigate', {
    url: this.loginUrl
  });

  console.error('Waiting for login... Press Enter when done.');
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Capture all auth data
  const [localStorage, sessionStorage, cookies, network] = await Promise.all([
    callMcpTool('mcp__plugin_playwright_playwright__browser_evaluate', {
      function: '() => JSON.stringify(localStorage)'
    }),
    callMcpTool('mcp__plugin_playwright_playwright__browser_evaluate', {
      function: '() => JSON.stringify(sessionStorage)'
    }),
    callMcpTool('mcp__plugin_playwright_playwright__browser_run_code', {
      code: \`async (page) => {
        const cookies = await page.context().cookies();
        return cookies;
      }\`
    }),
    callMcpTool('mcp__plugin_playwright_playwright__browser_network_requests', {})
  ]);

  // Extract tokens from captured data
  const tokens = this.extractTokens(localStorage, sessionStorage, cookies, network);

  // Close browser
  await callMcpTool('mcp__plugin_playwright_playwright__browser_close', {});

  return tokens;
}

private extractTokens(localStorage: string, sessionStorage: string, cookies: any[], network: any): TokenData {
  const data: TokenData = {
    capturedAt: Date.now(),
    additionalCookies: {}
  };

  // Parse localStorage
  try {
    const ls = JSON.parse(localStorage);
    for (const [key, value] of Object.entries(ls)) {
      if (key.toLowerCase().includes('token')) {
        data.accessToken = String(value);
      }
    }
  } catch {}

  // Parse cookies
  const sessionCookies: string[] = [];
  for (const cookie of cookies) {
    if (cookie.name.toLowerCase().includes('session') ||
        cookie.name.toLowerCase().includes('jsessionid')) {
      sessionCookies.push(\`\${cookie.name}=\${cookie.value}\`);
    } else {
      data.additionalCookies![cookie.name] = cookie.value;
    }
  }

  if (sessionCookies.length > 0) {
    data.sessionCookie = sessionCookies.join('; ');
  }

  return data;
}
\`\`\`

**mcp-tool-caller.ts Helper**

Create \`${outputDir}/src/mcp-tool-caller.ts\`:

\`\`\`typescript
// MCP tool caller for browser auth
// This allows the MCP to call other MCP tools (like Playwright)

export async function callMcpTool(toolName: string, args: any): Promise<any> {
  // This is injected by thesun at generation time
  // It uses the MCP SDK to call other registered MCP tools

  // For now, throw - the generator will inject the actual implementation
  throw new Error('MCP tool caller not injected yet');
}
\`\`\`

The generator will replace this with actual MCP tool calling logic.
\`\`\`

### 2.1.1 Cross-Platform Installation (REQUIRED)

Every generated MCP MUST include easy installation:

**install.sh** (Linux/macOS):
\`\`\`bash
#!/bin/bash
set -e
npm install && npm run build
echo "Add to ~/.claude/user-mcps.json or run: npx ${input.target}-mcp"
\`\`\`

**install.ps1** (Windows):
\`\`\`powershell
npm install; npm run build
Write-Host "Add to Claude config or run: npx ${input.target}-mcp"
\`\`\`

**README.md** must include:
\`\`\`markdown
## Quick Install
# Clone and install
git clone https://github.com/<owner>/${input.target}-mcp
cd ${input.target}-mcp
./scripts/install.sh  # or .\\scripts\\install.ps1 on Windows

## Or use npx (if published to npm)
npx ${input.target}-mcp
\`\`\`

### 2.2 Generate MCP Server with Auto-Renewing Browser Auth

**CRITICAL PATTERN: Auto-Renewing Authentication**

Every MCP server MUST use BrowserAuthManager for authentication.
This provides automatic token renewal when auth expires - NO manual re-running needed.

\`\`\`typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BrowserAuthManager } from "./browser-auth.js";

const server = new Server({
  name: "${input.target}-mcp",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// Initialize auto-renewing browser auth
const authManager = new BrowserAuthManager(
  "${input.target}",
  process.env.${input.target.toUpperCase()}_BASE_URL || "https://${input.target}.com",
  process.env.${input.target.toUpperCase()}_LOGIN_URL
);

// ALWAYS return tools - even without auth
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: allTools };
});

// Auto-retry on auth failure
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Auto-renewing auth wrapper
  const makeAuthenticatedRequest = async (retries = 1) => {
    try {
      // Get fresh auth (auto-renews if expired)
      const { headers, cookies } = await authManager.getAuthData();

      // Make API call with auth
      const response = await fetch(\`\${baseUrl}/api/endpoint\`, {
        headers: {
          ...headers,
          'Cookie': cookies
        }
      });

      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}\`);
      }

      return await response.json();

    } catch (error) {
      // Handle auth errors - auto-retry after browser re-auth
      if (retries > 0 && (
        error.response?.status === 401 ||
        error.response?.status === 403
      )) {
        await authManager.handleAuthError(error);
        return makeAuthenticatedRequest(retries - 1); // Retry once
      }
      throw error;
    }
  };

  try {
    const result = await makeAuthenticatedRequest();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error.message,
          hint: "Authentication may be required. The MCP will open a browser automatically on next retry."
        }, null, 2)
      }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
\`\`\`

**HOW IT WORKS:**
1. **First call**: Auth missing → Opens browser → Captures tokens → Stores in ~/.thesun/credentials → Continues
2. **Subsequent calls**: Uses stored tokens
3. **Token expires**: Detects 401/403 → Opens browser → Captures fresh tokens → Retries automatically
4. **Zero manual intervention**: User just logs in when browser opens, MCP handles everything else

**WHY THIS MATTERS:**
- Users NEVER manually re-run auth commands
- MCPs work seamlessly across token expiries
- Browser opens ONLY when needed
- Tokens stored securely in ~/.thesun/credentials/

### 2.3 Generate Tests
- Unit tests for each tool
- Integration test stubs
- Mock server for offline testing

---

### 4.4 Inject Self-Healing Code
SelfHealingModule code injection for health monitoring:

\`\`\`typescript
// Add health check capability to generated MCP
import { recordSuccess, recordFailure, handleError } from './health.js';

// In each tool handler, wrap API calls:
try {
  const response = await fetch(url, options);
  if (response.ok) {
    recordSuccess("${target}", endpoint);
    return response;
  } else {
    recordFailure("${target}", endpoint, response.status, await response.text());
    const recovery = await handleError("${target}", response.status, "");
    // Apply recovery action (backoff, retry, refresh-auth)
  }
} catch (error) {
  recordFailure("${target}", endpoint, 0, error.message);
}
\`\`\`

### 4.5 Apply Rate Limiting from Patterns
Based on PatternEngine patterns, apply rate limiting:
- Add delay between API calls if needed
- Respect Retry-After headers
- Implement exponential backoff

---

## PHASE 5: VALIDATION GATE

ValidationGate.runValidation("${target}", "${outputDir}")
Max 3 iterations to fix issues.

### 5.1 Build Validation
\`\`\`bash
cd "${outputDir}" && npm install && npm run build
\`\`\`
- TypeScript compiles without errors
- All imports resolve
- Fix any errors before proceeding

### 5.2 Endpoint Testing
- Test each generated tool can be called
- Verify auth headers work
- Check response parses correctly

### 5.3 Auth Flow Validation
- Initial auth succeeds
- Token stored correctly
- Refresh works (if OAuth)

### 5.4 Integration Test
- CRUD workflow test (if applicable)
- Rate limiting respected
- Errors handled gracefully

**CRITICAL**: If validation fails, attempt auto-fix and retry (up to 3 times)

---

## PHASE 6: AUTO-REGISTER (CRITICAL - DO NOT SKIP)

After successful validation, register the MCP as a **USER MCP** so it's available in ALL Claude sessions.

### IMPORTANT CONFIG FILE RULES:
- **USE**: \`~/.claude/user-mcps.json\` (User MCPs - auto-loaded globally)
- **DO NOT USE**: \`~/.claude/.claude.json\` (NOT read for MCP config!)
- **DO NOT USE**: \`~/.claude/mcp.json\` (requires whitelist in settings.json)
- **DO NOT USE**: \`~/.mcp.json\` or \`./.mcp.json\` (Project MCPs - causes confusion)

### 6.1 Cache the Spec
SmartCache.cacheSpec("${target}")
- Store spec hash for incremental updates
- Save endpoint list

### 6.2 Read existing config
\`\`\`bash
cat "${mcpConfigPath}"
\`\`\`

If the file doesn't exist, create it with this structure:
\`\`\`json
{
  "mcpServers": {}
}
\`\`\`

### 6.3 Add the new MCP entry
The config file is JSON with mcpServers wrapper. Add entry INSIDE mcpServers:
\`\`\`json
{
  "mcpServers": {
    "existing-mcp": { ... },
    "${input.target}": {
      "command": "node",
      "args": ["${outputDir}/dist/index.js"],
      "env": {
        // Add required env vars from .env.example
      }
    }
  }
}
\`\`\`

**CRITICAL**: Entries go INSIDE the "mcpServers" object, NOT at root level!

### 6.4 Write updated config
Use the Edit tool to add the new entry inside mcpServers in ${mcpConfigPath}

### 6.5 Verify registration
\`\`\`bash
cat "${mcpConfigPath}" | grep "${input.target}"
\`\`\`

### 6.6 Notify user
Tell the user: "MCP '${input.target}' registered as USER MCP at ${outputDir}. Restart Claude to use the new tools."

---

## PHASE 7: UPDATE & IMPROVE (Post-Generation Enhancement)

After successful registration, run a comprehensive improvement pass on the newly generated MCP.

### 5.1 Performance Analysis

Analyze the generated code for anti-patterns:

\`\`\`bash
cd "${outputDir}"

# Check for shell spawning (VERY BAD - kills performance)
grep -rn "child_process\\|spawn(" src/ || echo "No shell spawning found"

# Check for HTTP client reuse
grep -rn "axios\\|fetch\\|got\\|node-fetch" src/ || echo "No HTTP client found"

# Check for connection pooling
grep -rn "keepAlive\\|agent:\\|httpAgent\\|httpsAgent" src/ || echo "No connection pooling"

# Check for token caching
grep -rn "tokenCache\\|accessToken\\|expiresAt" src/ || echo "No token caching"
\`\`\`

**Apply these optimizations if missing:**

| Anti-Pattern | Fix |
|--------------|-----|
| No connection pooling | Add http.Agent with keepAlive: true |
| Auth on every call | Cache tokens with expiry timestamp |
| Sequential API calls | Batch with Promise.all() |
| New client per request | Use singleton pattern |

### 5.2 Security Scan

Search for vulnerabilities:

\`\`\`bash
# Dependency vulnerabilities
cd "${outputDir}" && npm audit 2>&1 | head -50

# Check for eval/exec patterns
grep -rn "eval\\|exec\\|Function(" src/ || echo "No dangerous patterns"
\`\`\`

**Web Search for security:**
- Search: "${input.target} API CVE vulnerability 2025"
- Search: "${input.target} security advisory"

Apply any critical security fixes found.

### 5.3 Feature Enhancement Research

Search for features we may have missed:

\`\`\`
WebSearch: "${input.target} API new features 2025"
WebSearch: "${input.target} API changelog"
WebSearch: "${input.target} MCP server" site:github.com
\`\`\`

If important features are found that we didn't implement:
1. Add them to the MCP
2. Rebuild and test
3. Update documentation

### 5.4 Local Documentation Updates

**Update CHANGELOG.md:**
\`\`\`markdown
# Changelog

## [1.0.0] - ${new Date().toISOString().split("T")[0]}

### Added
- Initial release
- [List all implemented tools]

### Security
- [List any security measures implemented]

### Performance
- [List any optimizations applied]
\`\`\`

**Update README.md:**
- Ensure all tools are documented
- Include usage examples
- Document all environment variables
- Add troubleshooting section

### 5.5 Remote Documentation (Confluence)

If Confluence MCP is available (check with Atlassian tools):

1. **Create Confluence Page**: Engineering/MCP Servers/${input.target}
   - Overview and purpose
   - Installation instructions
   - Tool reference table
   - Configuration guide
   - Troubleshooting

2. **Link to existing pages** if relevant

### 5.6 GitHub Release (if repository exists)

If the MCP has a GitHub repository:
1. Create initial commit with all files
2. Tag version 1.0.0
3. Create GitHub release with changelog

### 5.7 Publish History Tracking (MANDATORY)

Create \`.thesun/publish-history.md\` in the MCP directory:

\`\`\`bash
mkdir -p "${outputDir}/.thesun"
\`\`\`

Write to \`${outputDir}/.thesun/publish-history.md\`:
\`\`\`markdown
# ${input.target} MCP Publish History

This file tracks where documentation has been published.
DO NOT commit to public repositories.

## Local
- Path: ${outputDir}
- Created: ${new Date().toISOString()}
- Version: 1.0.0

## Confluence
- Page: Engineering/MCP Servers/${input.target}
- URL: [filled after publish]
- Last Updated: [timestamp]

## GitHub
- Repo: [filled after publish]
- Last Release: 1.0.0
- Last Updated: [timestamp]

## Changelog Updates
- ${new Date().toISOString()}: Initial release
\`\`\`

Add to .gitignore:
\`\`\`bash
echo ".thesun/" >> "${outputDir}/.gitignore"
\`\`\`

### 5.8 Auto-Generate Claude Skill (MANDATORY)

**Every MCP needs a skill so Claude knows how to use it effectively.**

Create \`${outputDir}/.claude-skill.md\` with authentication-aware wrapper:

\`\`\`markdown
---
name: ${input.target}
description: Use ${input.target} MCP for [primary use case]
tags: [security, api, ${input.target}]
---

# ${input.target} Skill

This skill provides convenient access to ${input.target} MCP tools.

## When to Use

Use this skill when:
- [Primary use case 1]
- [Primary use case 2]
- [Primary use case 3]

## Authentication Check

Before using any ${input.target} tools, verify authentication:

\`\`\`typescript
// Check if MCP is authenticated by testing a simple tool
const authCheck = await mcp.callTool('${input.target}', 'list_*', {});

if (authCheck.isError) {
  return {
    error: 'Authentication required',
    message: 'Configure credentials in ~/.claude/user-mcps.json',
    setup: [
      'Step 1: [How to get credentials]',
      'Step 2: Add to env config',
      'Step 3: Restart Claude',
    ],
  };
}
\`\`\`

## Available Tools

[List main tools with brief descriptions]

## Examples

### Example 1: [Common use case]
\`\`\`
[Tool name]:
  param1: value1
  param2: value2
\`\`\`

### Example 2: [Another common use case]
\`\`\`
[Tool name]:
  param1: value1
\`\`\`

## Best Practices

- [Practice 1]
- [Practice 2]
- [Practice 3]

## Troubleshooting

**Authentication Errors**
- Verify credentials in ~/.claude/user-mcps.json
- Check API token is valid
- Restart Claude after config changes

**API Errors**
- Check rate limits
- Verify API endpoint is accessible
- Check input parameter formats
\`\`\`

**Install the skill:**
\`\`\`bash
# Create skills directory if needed
mkdir -p ~/.claude/skills

# Copy skill to global skills directory
cp "${outputDir}/.claude-skill.md" ~/.claude/skills/${input.target}.md

echo "✓ Skill installed at ~/.claude/skills/${input.target}.md"
\`\`\`

**Update publish-history.md:**
\`\`\`bash
echo "| \$(date -Iseconds) | 1.0.0 | Skill generated | Local |" >> "${outputDir}/.thesun/publish-history.md"
\`\`\`

### 5.9 Final Report

After all improvements, provide a summary:
\`\`\`
## ${input.target} MCP - Generation Complete

### Summary
- **Tools Generated**: [count]
- **Performance Optimizations**: [list]
- **Security Fixes**: [list or "None needed"]
- **Documentation**: Local ✅ | Confluence [✅/❌] | GitHub [✅/❌]

### Files Created
- ${outputDir}/src/index.ts
- ${outputDir}/README.md
- ${outputDir}/CHANGELOG.md
- ${outputDir}/.thesun/publish-history.md

### Next Steps
1. Restart Claude to load the new MCP
2. Configure credentials in ~/.claude/user-mcps.json
3. Test with: "List available ${input.target} tools"
\`\`\`

---

## CROSS-PLATFORM COMPATIBILITY (REQUIRED)

Generated MCPs must be compatible with:
- Claude Code (native MCP)
- GitHub Copilot
- Gemini
- Codex

Ensure generated MCPs export universal tool schemas.

**Universal Tool Schema Pattern:**
\`\`\`typescript
// Export tools in standard MCP format AND JSON Schema format
export const tools = [
  {
    name: "tool_name",
    description: "Tool description",
    inputSchema: {
      type: "object",
      properties: { ... },
      required: [ ... ]
    }
  }
];

// Also export for non-MCP consumers
export const jsonSchemaTools = tools.map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.inputSchema
}));
\`\`\`

---

## EXECUTION RULES

1. **Run preflight first** - Always use DependencyChecker before starting
2. **Check existing MCPs** - Use SmartCache and McpRegistrySearch before regenerating
3. **Apply patterns** - Use PatternEngine for consistency
4. **Validate thoroughly** - Use ValidationGate with max 3 retry iterations
5. **Cache results** - Use SmartCache.cacheSpec() after successful generation
6. **Monitor health** - Inject SelfHealingModule code
7. **Be autonomous** - Don't ask for permission at each step
8. **Be thorough** - Research completely before generating
9. **Be practical** - If good MCP exists (Score 90+), recommend it
10. **Always register globally** - Every generated MCP MUST be in ${mcpConfigPath}
11. **Use absolute paths** - All paths in user-mcps.json must be absolute (starting with /)
12. **Directory independent** - This works from ANY directory

---

## MODEL SELECTION (for bob instances)

When spawning sub-agents:
- **Opus**: Planning, architecture, security reviews
- **Sonnet**: Code generation, testing, implementation
- **Haiku**: Quick validation, simple lookups

---

## RALPH LOOPS (Iterative Testing)

When tests fail during PHASE 5 (Validation Gate), the orchestrator should spin up a ralph loop:

1. **Trigger conditions**: Test failures, build errors, type errors
2. **Loop behavior**:
   - Analyze failure → Fix → Re-test → Repeat until pass
   - Maximum 5 iterations per issue type
3. **When to use**:
   - Tests fail after initial generation
   - Build errors that can be auto-fixed
   - Type errors in generated code

### ESCALATION IS ABSOLUTE LAST RESORT

Before EVER escalating to user, the agent MUST do its homework:

**Step 1: Search the web**
- Search for the exact error message
- Look for GitHub issues, Stack Overflow, official docs
- Check if others have solved this problem

**Step 2: Use available tools**
- **Confluence**: Search internal knowledge base for similar issues
- **Jira**: Check if this error has been reported/solved before
- **Akamai/Other MCPs**: Use any relevant tools available
- **API docs**: Re-read the official API documentation

**Step 3: Try alternative approaches**
- Different authentication methods
- Alternative endpoints
- Workarounds mentioned in docs

**Step 4: Analyze patterns**
- Look at similar successful MCPs (reference implementations)
- Check if the issue is environmental vs code

**Only escalate if ALL of these fail:**
- Web search found no solutions
- Internal tools (Confluence, Jira) have no relevant info
- Multiple alternative approaches attempted
- Root cause is truly unknown or requires human decision

When escalating, provide:
- What was tried (with links/references)
- Why each approach failed
- Specific question for the user (not just "it doesn't work")

---

**BEGIN EXECUTION NOW. Start with Phase 0: Preflight Check.**
`;

    return {
      content: [{ type: "text", text: instructions }],
    };
  }

  private async handleFixMode(
    target: string,
    fixPath: string,
    mcpConfigPath: string,
    spec?: string,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const instructions = `
# thesun: FIX MODE for "${target}"

You are now operating as **thesun** in FIX MODE - debugging and improving an existing MCP.
Execute autonomously WITHOUT stopping for human input unless absolutely necessary.

**Target API:** ${target}
**Code Location:** ${fixPath}
**MCP Config:** ${mcpConfigPath}
${spec ? `**API Spec:** ${spec}` : ""}

---

## PHASE 1: ANALYZE EXISTING CODE

### 1.1 Explore the codebase
- Read the main entry point (usually src/index.ts or index.ts)
- Understand the project structure
- Check package.json for dependencies and scripts
- Look at existing tests if any
- Read any README or documentation

### 1.2 Identify issues
Run these checks:
\`\`\`bash
cd "${fixPath}"
npm install 2>&1
npm run build 2>&1
npm test 2>&1
\`\`\`

Catalog ALL errors:
- Build/TypeScript errors
- Test failures
- Runtime errors
- Missing dependencies
- Configuration issues

### 1.3 Research the API
- Find official ${target} API documentation
- Check for OpenAPI/Swagger specs
- Understand authentication requirements
- Note any recent API changes

---

## PHASE 2: FIX ISSUES

### 2.1 Fix in priority order
1. **Critical**: Build errors, missing dependencies
2. **High**: Authentication issues, API connection failures
3. **Medium**: Test failures, type errors
4. **Low**: Code quality, missing features

### 2.2 For each fix
- Make the minimal change needed
- Test after each fix: \`npm run build && npm test\`
- If fix doesn't work, try alternative approaches
- Document what you changed and why

### 2.3 Use ralph loops
If tests fail:
- Analyze failure → Fix → Re-test → Repeat
- Maximum 5 iterations per issue
- Search web/docs before escalating

---

## PHASE 3: VALIDATE

### 3.1 Full test suite
\`\`\`bash
cd "${fixPath}" && npm run build && npm test
\`\`\`

### 3.2 Manual verification
- Start the server and verify it connects
- Test a few key tools manually

### 3.3 Security check
- No hardcoded secrets
- Proper input validation
- Safe error handling

---

## PHASE 4: REGISTER (if not already registered)

Check if already in ${mcpConfigPath}, if not add it:
\`\`\`json
{
  "mcpServers": {
    "${target}": {
      "command": "node",
      "args": ["${fixPath}/dist/index.js"],
      "env": {
        // Add required env vars
      }
    }
  }
}
\`\`\`

---

## ESCALATION RULES

Before EVER asking the user:
1. Search web for the exact error
2. Check Confluence/Jira for similar issues
3. Read official API docs thoroughly
4. Try at least 3 different approaches
5. Look at reference implementations

Only escalate with:
- What you tried (with links)
- Why each approach failed
- Specific question (not "it doesn't work")

---

## SELF-IMPROVEMENT NOTE

If fixing thesun itself (${fixPath} contains thesun code):
- Be extra careful with changes
- Test thoroughly before committing
- This is a recursive self-improvement loop!

---

## PHASE 5: UPDATE & IMPROVE (Post-Fix Enhancement)

After successful fixes, run a comprehensive improvement pass.

### 5.1 Performance Analysis

Check for performance anti-patterns:

\`\`\`bash
cd "${fixPath}"

# Check for shell spawning (should use native HTTP)
grep -rn "child_process\\|spawn(" src/ || echo "No shell spawning"

# Check for connection pooling
grep -rn "keepAlive\\|httpAgent\\|httpsAgent" src/ || echo "No connection pooling"

# Check for token caching
grep -rn "tokenCache\\|expiresAt" src/ || echo "No token caching"
\`\`\`

**Apply optimizations if missing:**
- Add HTTP connection pooling with keep-alive
- Implement token caching with expiry
- Batch sequential calls with Promise.all()
- Use singleton pattern for clients

### 5.2 Security Scan

\`\`\`bash
cd "${fixPath}" && npm audit 2>&1 | head -50
grep -rn "eval\\|exec\\|Function(" src/ || echo "No dangerous patterns"
\`\`\`

**Web Search:**
- Search: "${target} API CVE vulnerability 2025"
- Search: "${target} security advisory"

### 5.3 Feature Enhancement Research

\`\`\`
WebSearch: "${target} API new features 2025"
WebSearch: "${target} API changelog"
\`\`\`

If important missing features found, add them.

### 5.4 Documentation Updates

**Update CHANGELOG.md** with all fixes applied:
\`\`\`markdown
## [X.Y.Z] - ${new Date().toISOString().split("T")[0]}

### Fixed
- [List all bugs fixed]

### Changed
- [List improvements made]

### Security
- [List security fixes]

### Performance
- [List optimizations]
\`\`\`

**Update README.md** if needed:
- Document any new tools
- Update configuration requirements
- Add troubleshooting for fixed issues

### 5.5 Remote Documentation (Confluence)

If Confluence is available:
1. Update page: Engineering/MCP Servers/${target}
2. Add section for fixes applied
3. Update troubleshooting guide

### 5.6 Publish History Tracking (MANDATORY)

Create or update \`.thesun/publish-history.md\`:

\`\`\`bash
mkdir -p "${fixPath}/.thesun"
\`\`\`

Append to \`${fixPath}/.thesun/publish-history.md\`:
\`\`\`markdown
## Fix Applied - ${new Date().toISOString()}

### Issues Fixed
- [List issues]

### Performance Improvements
- [List if any]

### Documentation Updated
- Local: ✅
- Confluence: [✅/❌]
- GitHub: [✅/❌]
\`\`\`

### 5.7 Update/Generate Claude Skill

**Check if skill exists, update or create it:**

\`\`\`bash
if [ -f "${fixPath}/.claude-skill.md" ]; then
  echo "Skill exists - updating with fixes"
  # Append fix notes to troubleshooting section
else
  echo "No skill found - generating new skill"
  # Create skill following same template as CREATE mode
fi
\`\`\`

For new skills, follow same format as section 5.8 in CREATE mode.

For existing skills, add to troubleshooting section:
\`\`\`markdown
## Recent Fixes (${new Date().toISOString().split("T")[0]})

- [List fixes applied]
\`\`\`

### 5.8 Final Report

\`\`\`
## ${target} MCP - Fix Complete

### Summary
- **Issues Fixed**: [count]
- **Performance Optimizations**: [list or "None"]
- **Security Fixes**: [list or "None"]
- **Documentation Updated**: Local ✅ | Confluence [✅/❌] | GitHub [✅/❌]

### Files Modified
- [List changed files]

### Next Steps
1. Restart Claude to reload the MCP
2. Test the fixed functionality
3. Monitor for any remaining issues
\`\`\`

---

**BEGIN FIX MODE NOW. Start with Phase 1: Analyze Existing Code.**
`;

    return {
      content: [{ type: "text", text: instructions }],
    };
  }

  private async handleBatchMode(
    targets: string[],
    mcpConfigPath: string,
    parallel: boolean,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const targetList = targets
      .map((t) => `- **${t}**: ${join(MCP_OUTPUT_BASE, `${t}-mcp`)}`)
      .join("\n");

    const instructions = `
# thesun: BATCH MCP Generation

You are now operating as **thesun** in BATCH MODE - generating **${targets.length}** MCP servers ${parallel ? "IN PARALLEL" : "sequentially"}.

---

## TARGETS

${targetList}

**MCP Config:** ${mcpConfigPath}

---

## EXECUTION STRATEGY

${
  parallel
    ? `
### Parallel Execution (RECOMMENDED)

You MUST use the Task tool to spawn multiple agents IN PARALLEL. This means:

1. **Single message, multiple Task calls**: Send ONE message containing ${targets.length} separate Task tool invocations
2. **Each agent is isolated**: Gets its own bob instance with git worktree
3. **Each agent inherits your MCP servers**: Can use Confluence, Jira, Akamai, Teams, Elastic

**CRITICAL INSTRUCTION:**

Call the Task tool ${targets.length} times in a SINGLE response with these parameters:

${targets
  .map(
    (t, i) => `
**Agent ${i + 1}: ${t}**
- subagent_type: "general-purpose"
- description: "Generate ${t} MCP"
- prompt: [Full thesun generation prompt for ${t}]
- run_in_background: true (for true parallelism)
`,
  )
  .join("\n")}

The prompt for each agent should include:
1. Research phase: Search for existing MCPs, find API docs
2. Generation phase: Create TypeScript MCP server
3. Validation phase: Build, test, security scan
4. Registration phase: Add to ${mcpConfigPath}

`
    : `
### Sequential Execution

Process each target one at a time:
${targets.map((t, i) => `${i + 1}. Generate MCP for **${t}**`).join("\n")}
`
}

---

## MONITORING PROGRESS

Each parallel agent will run in the background. You can check progress by:
1. Reading the output_file returned by each Task call
2. Using "tail -f" on the output files
3. Waiting for completion notifications

---

## SUCCESS CRITERIA

All ${targets.length} MCPs must be:
- Built successfully (npm run build passes)
- Registered in ${mcpConfigPath}
- Ready for use in Claude sessions

---

**BEGIN BATCH EXECUTION NOW. Spawn ${targets.length} parallel Task agents.**
`;

    return {
      content: [{ type: "text", text: instructions }],
    };
  }

  private async handleInteractiveMode(
    target: string,
    siteUrl: string,
    outputDir: string,
    mcpConfigPath: string,
    loginUrl?: string,
    actions?: string[],
    apiDocsUrl?: string,
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const envPrefix = target.toUpperCase().replace(/-/g, "_");
    const actionsList = actions?.length
      ? actions.map((a, i) => `${i + 1}. ${a}`).join("\n")
      : "1. Browse main features\n2. Navigate key workflows\n3. Trigger API-heavy operations";

    const instructions = `
# thesun: INTERACTIVE MODE for "${target}"

You are now operating as **thesun** in INTERACTIVE MODE - reverse-engineering APIs from a webapp by capturing browser traffic.

**This mode is for sites WITHOUT official API documentation** - we'll watch what the site does and build an MCP from observed requests.

**Target:** ${target}
**Site URL:** ${siteUrl}
${loginUrl ? `**Login URL:** ${loginUrl}` : ""}
**Output:** ${outputDir}
**MCP Config:** ${mcpConfigPath}
${apiDocsUrl ? `**API Docs:** ${apiDocsUrl} (will use docs instead of browser capture)` : ""}

---

## PHASE 0: PREFLIGHT CHECK

### 0.1 Verify Playwright MCP is available
Check for Playwright MCP plugin or configuration. If not available:
\`\`\`
The Playwright MCP is required for interactive mode.

Install via Claude Code settings, or add to ~/.claude/user-mcps.json:
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "firefox"]
    }
  }
}
\`\`\`

### 0.2 Verify Firefox Browser
Playwright Firefox mode requires Firefox. If using remote browsers, ensure Firefox is available.

---

${
  apiDocsUrl
    ? `
## PHASE 1: API DOCS MODE (Skip Browser Capture)

API documentation URL provided: ${apiDocsUrl}

1. **Fetch and parse the API docs**
2. **Extract endpoints, auth, and schemas**
3. **Skip to PHASE 4: GENERATE MCP**

---
`
    : `
## PHASE 1: CLARIFYING QUESTIONS (If Needed)

Before starting browser capture, consider asking:

1. **Login Method**: How do you log in? (SSO, username/password, OAuth, MFA?)
2. **Key Actions**: What main tasks do you want the MCP to support?
3. **Admin Access**: Do you have admin/elevated permissions to see all features?

If the user provided sufficient context already, proceed to PHASE 2.

---

## PHASE 2: BROWSER LAUNCH & LOGIN

### 2.1 Launch Firefox via Playwright

**CRITICAL**: Use Playwright MCP with Firefox for full token capture capabilities.

\`\`\`
Call: mcp__plugin_playwright_playwright__browser_navigate
Args: { "url": "${siteUrl}${loginUrl || ""}" }
\`\`\`

This opens Firefox and navigates to the login page.

### 2.2 Manual Login (User Action Required)

**IMPORTANT MESSAGE TO USER:**
\`\`\`
🔐 BROWSER OPENED - Please complete login manually

1. A Firefox browser window has opened
2. Log in to ${target} normally (handle CAPTCHA, 2FA as needed)
3. After login, say "done" or "logged in" here
4. I'll then capture your session tokens

This is the ONLY step requiring your action. Everything else is automatic.
\`\`\`

**Wait for user confirmation before proceeding.**

### 2.3 Capture Network Traffic

After login confirmed, start monitoring network requests:

\`\`\`
Call: mcp__plugin_playwright_playwright__browser_network_requests
Args: { }
\`\`\`

This captures all XHR/fetch requests being made.

---

## PHASE 3: TOKEN EXTRACTION (The Magic)

### 3.1 Extract localStorage Tokens

Use Playwright's browser_evaluate to read localStorage:

\`\`\`
Call: mcp__plugin_playwright_playwright__browser_evaluate
Args: {
  "expression": "JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('session') || k.toLowerCase().includes('jwt') || k.toLowerCase().includes('access') || k.toLowerCase().includes('refresh') || k.toLowerCase().includes('id_token') || k.toLowerCase().includes('user'))))"
}
\`\`\`

**Parse the result** - look for:
- \`access_token\` / \`accessToken\`
- \`refresh_token\` / \`refreshToken\`
- \`id_token\` / \`idToken\`
- \`session_token\` / \`sessionToken\`
- \`jwt\` / \`JWT\`

### 3.2 Extract sessionStorage Tokens

\`\`\`
Call: mcp__plugin_playwright_playwright__browser_evaluate
Args: {
  "expression": "JSON.stringify(Object.fromEntries(Object.entries(sessionStorage).filter(([k]) => k.toLowerCase().includes('token') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('session') || k.toLowerCase().includes('jwt') || k.toLowerCase().includes('access'))))"
}
\`\`\`

### 3.3 Extract Cookies (Including HttpOnly)

\`\`\`
Call: mcp__plugin_playwright_playwright__browser_evaluate
Args: {
  "expression": "document.cookie"
}
\`\`\`

Note: HttpOnly cookies won't appear here but ARE captured in network requests.

### 3.4 Extract from Window Object

Some sites store tokens on the window object:

\`\`\`
Call: mcp__plugin_playwright_playwright__browser_evaluate
Args: {
  "expression": "JSON.stringify({__INITIAL_STATE__: window.__INITIAL_STATE__?.auth, __NUXT__: window.__NUXT__?.auth, __REDUX_STATE__: window.__REDUX_STATE__?.auth, _token: window._token, token: window.token, auth: window.auth})"
}
\`\`\`

### 3.5 Analyze Captured Network Traffic

Review network_requests output for:
1. **Authorization headers**: \`Bearer\`, \`ApiKey\`, etc.
2. **Cookie headers**: Session cookies
3. **API base URLs**: The endpoints being called
4. **Request/response patterns**: Data shapes

**Document all auth patterns found:**
- Auth type: Bearer / Cookie / API Key / Custom
- Token location: localStorage / sessionStorage / Cookie / Header
- Token key name: e.g., \`access_token\`
- Refresh mechanism: If refresh token exists

---

## PHASE 3.5: USER ACTION CAPTURE

### 3.5.1 Perform Key Actions

**MESSAGE TO USER:**
\`\`\`
📱 Now let's capture the API calls for key features.

Please perform these actions in the browser:
${actionsList}

After each action, I'll capture the API endpoints being called.
Say "done" after completing each action.
\`\`\`

### 3.5.2 After Each Action

Capture the network traffic:
\`\`\`
Call: mcp__plugin_playwright_playwright__browser_network_requests
\`\`\`

**Document for each action:**
- Endpoint URL and method (GET, POST, PUT, DELETE)
- Request headers (especially Authorization)
- Request body shape
- Response body shape
- Status codes

---

## PHASE 4: USER APPROVAL CHECKPOINT

### 4.1 Present Findings

Before generating the MCP, show the user what was captured:

\`\`\`
## Captured API Information for ${target}

### Authentication
- **Type**: [Bearer/Cookie/API Key]
- **Token Location**: [localStorage/sessionStorage/Cookie]
- **Token Key**: [key name]
- **Refresh Available**: [Yes/No]

### Endpoints Captured
| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | GET | /api/users/me | Get current user |
| 2 | GET | /api/items | List items |
| ... | ... | ... | ... |

### Token Validity
- Access Token: [extracted, X characters]
- Refresh Token: [extracted/not found]
- Expiry: [if detectable]

---

**Shall I proceed to generate an MCP from these endpoints?**
\`\`\`

### 4.2 Wait for Approval

Only proceed after user confirms they want to generate the MCP.

---
`
}

## PHASE 5: GENERATE MCP

### 5.1 Create Project Structure

\`\`\`bash
mkdir -p "${outputDir}"
\`\`\`

\`\`\`
${outputDir}/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── auth.ts           # Auto-refresh authentication
│   └── types.ts          # TypeScript types from observed responses
├── scripts/
│   ├── install.sh
│   └── install.ps1
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
\`\`\`

### 5.2 Generate Auth Module (CRITICAL)

**The auth module must support automatic token refresh:**

\`\`\`typescript
// src/auth.ts - Auto-refresh authentication from browser capture

import * as fs from 'fs';
import * as path from 'path';

interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
}

class AuthManager {
  private tokenData: TokenData | null = null;
  private harFilePath: string;

  constructor() {
    // Check for HAR file path (for manual capture)
    this.harFilePath = process.env.${envPrefix}_HAR_FILE_PATH || '';

    // Check for pre-extracted tokens
    const extractedToken = process.env.${envPrefix}_EXTRACTED_TOKEN;
    const extractedCookies = process.env.${envPrefix}_EXTRACTED_COOKIES;

    if (extractedToken) {
      this.tokenData = {
        accessToken: extractedToken,
        tokenType: 'Bearer',
      };
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.tokenData && this.harFilePath) {
      await this.extractFromHAR();
    }

    if (!this.tokenData) {
      throw new Error(
        'No authentication configured. Set ${envPrefix}_EXTRACTED_TOKEN or ${envPrefix}_HAR_FILE_PATH'
      );
    }

    // Check if token needs refresh
    if (this.tokenData.expiresAt && Date.now() > this.tokenData.expiresAt - 60000) {
      await this.refreshToken();
    }

    return {
      'Authorization': \`\${this.tokenData.tokenType} \${this.tokenData.accessToken}\`,
    };
  }

  private async extractFromHAR(): Promise<void> {
    if (!this.harFilePath || !fs.existsSync(this.harFilePath)) {
      return;
    }

    const harContent = JSON.parse(fs.readFileSync(this.harFilePath, 'utf-8'));
    // Extract auth from HAR entries...
  }

  private async refreshToken(): Promise<void> {
    if (!this.tokenData?.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }
    // Implement refresh logic based on observed patterns
  }
}

export const authManager = new AuthManager();
\`\`\`

### 5.3 Generate MCP Tools

For each captured endpoint, generate a tool:

\`\`\`typescript
// Example tool from captured endpoint
{
  name: "${target}_get_user",
  description: "Get current user information",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
\`\`\`

### 5.4 Graceful Startup (CRITICAL)

The MCP MUST start even without credentials configured:

\`\`\`typescript
// Don't crash at startup
const BASE_URL = process.env.${envPrefix}_BASE_URL || "${siteUrl}";

// Tools always visible
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: allTools };
});

// Check auth only when tool is called
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const headers = await authManager.getAuthHeaders();
    // ... execute request
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "Authentication required",
          message: error.message,
          setup: [
            "Option 1: Set ${envPrefix}_EXTRACTED_TOKEN with captured token",
            "Option 2: Set ${envPrefix}_HAR_FILE_PATH to HAR file",
            "Option 3: Run interactive capture again"
          ]
        }, null, 2)
      }],
      isError: true
    };
  }
});
\`\`\`

---

## PHASE 6: VALIDATION

### 6.1 Build
\`\`\`bash
cd "${outputDir}" && npm install && npm run build
\`\`\`

### 6.2 Test with Captured Token

If tokens were extracted, test an endpoint:
- Make a test request using the captured auth
- Verify response matches expected shape

### 6.3 Security Check
- Ensure tokens are ONLY read from env vars
- No tokens logged or exposed
- HAR file path is gitignored

---

## PHASE 7: REGISTER & SAVE CREDENTIALS

### 7.1 Save Extracted Tokens

Create credential storage:
\`\`\`bash
mkdir -p ~/.thesun/credentials
\`\`\`

**Write ${target}.env:**
\`\`\`bash
# Auto-extracted from browser session
${envPrefix}_BASE_URL=${siteUrl}
${envPrefix}_EXTRACTED_TOKEN=[captured token]
${envPrefix}_EXTRACTED_COOKIES=[captured cookies JSON]
${envPrefix}_AUTH_TYPE=[Bearer/Cookie/ApiKey]
\`\`\`

### 7.2 Register MCP

Add to ${mcpConfigPath}:
\`\`\`json
{
  "mcpServers": {
    "${target}": {
      "command": "node",
      "args": ["${outputDir}/dist/index.js"],
      "env": {
        "${envPrefix}_BASE_URL": "${siteUrl}",
        "${envPrefix}_EXTRACTED_TOKEN": "[captured token]"
      }
    }
  }
}
\`\`\`

---

## PHASE 8: FINAL REPORT

\`\`\`
## ${target} MCP - Interactive Generation Complete

### Summary
- **Mode**: Interactive (browser capture)
- **Site**: ${siteUrl}
- **Endpoints Captured**: [count]
- **Auth Type**: [Bearer/Cookie/etc]

### Authentication
- Token extracted: ✅
- Refresh token: [✅/❌]
- Token location: [localStorage/sessionStorage/Cookie]

### Files Created
- ${outputDir}/src/index.ts
- ${outputDir}/src/auth.ts
- ${outputDir}/.env.example

### Token Refresh
${
  apiDocsUrl
    ? "Using documented API - check docs for token refresh endpoint"
    : `
**IMPORTANT**: Tokens captured from browser sessions expire!

When tokens expire, re-run interactive capture:
\`\`\`
thesun({ target: "${target}", siteUrl: "${siteUrl}" })
\`\`\`

Or manually update ~/.thesun/credentials/${target}.env
`
}

### Next Steps
1. Restart Claude to load the new MCP
2. Test: "List ${target} tools"
3. If auth fails, re-run interactive capture
\`\`\`

---

**BEGIN INTERACTIVE MODE NOW. Start with Phase 0: Preflight Check.**
`;

    return {
      content: [{ type: "text", text: instructions }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("thesun MCP server running on stdio");
  }
}

const server = new TheSunMcpServer();
server.run().catch(console.error);
