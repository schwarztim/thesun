#!/usr/bin/env node
/**
 * thesun MCP Server
 *
 * Single autonomous tool for MCP generation. Just say "use thesun for <target>"
 * and it handles everything: research, generation, testing, registration.
 *
 * KEY FEATURES:
 * - Uses ABSOLUTE paths for all output (never relative to current directory)
 * - All generated MCPs are registered globally in ~/.claude/mcp.json
 * - Supports bob instances for isolated parallel builds
 * - Model selection: Opus for planning/security, Sonnet for implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { homedir } from 'os';
import { join } from 'path';

// Central MCP output directory - NEVER relative to current working directory
const MCP_OUTPUT_BASE = join(homedir(), 'Scripts', 'mcp-servers');

// Single unified tool
const TOOLS: Tool[] = [
  {
    name: 'thesun',
    description: `Autonomous MCP server generator AND fixer. Creates or fixes MCP servers for any API.

**TWO MODES:**

1. **CREATE MODE** (default): "use thesun for Tesla" - Creates new MCP from scratch
2. **FIX MODE**: "use thesun to fix /path/to/mcp" - Fixes existing MCP code

thesun handles EVERYTHING autonomously:
- Researches the API (web search, docs, OpenAPI specs)
- Creates OR fixes MCP server code
- Writes comprehensive tests
- Runs security scans
- Registers globally in ~/.claude/.claude.json

**CREATE Examples:**
- thesun({ target: "tesla" }) - Creates Tesla Fleet API MCP
- thesun({ target: "stripe" }) - Creates Stripe payments MCP

**FIX Examples:**
- thesun({ target: "atlassian", fix: "/Users/tim/Scripts/AtlassianPlugin" }) - Fix existing plugin
- thesun({ target: "jira", fix: "." }) - Fix MCP in current directory`,
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'The API/service name (e.g., tesla, stripe, atlassian, jira). Can also be comma-separated for batch: "tesla, stripe, jira"',
        },
        targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of API/service names for parallel batch generation (e.g., ["tesla", "stripe", "jira"])',
        },
        fix: {
          type: 'string',
          description: 'Path to existing MCP code to fix. If provided, runs in FIX mode instead of CREATE mode.',
        },
        output: {
          type: 'string',
          description: `Output directory for CREATE mode. Defaults to ~/Scripts/mcp-servers/<target>-mcp/. Ignored in FIX mode.`,
        },
        spec: {
          type: 'string',
          description: 'Optional OpenAPI/Swagger spec URL or path',
        },
        parallel: {
          type: 'boolean',
          description: 'Run batch generation in parallel (default: true). Each target gets its own isolated bob instance.',
        },
      },
      required: ['target'],
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
});

class TheSunMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'thesun',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
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
        if (name === 'thesun') {
          return await this.handleTheSun(args);
        }
        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  private async handleTheSun(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const input = TheSunInput.parse(args);

    const homeDir = homedir();
    // CRITICAL: Use .claude.json NOT mcp.json - this is where Claude actually reads mcpServers
    const mcpConfigPath = join(homeDir, '.claude', '.claude.json');

    // Parse targets: support array, comma-separated string, or single target
    let allTargets: string[] = [];
    if (input.targets && input.targets.length > 0) {
      allTargets = input.targets.map(t => t.trim()).filter(t => t.length > 0);
    } else if (input.target.includes(',')) {
      allTargets = input.target.split(',').map(t => t.trim()).filter(t => t.length > 0);
    } else {
      allTargets = [input.target.trim()];
    }

    // FIX MODE: Fix existing MCP code (single target only)
    if (input.fix) {
      const fixPath = input.fix.startsWith('/') ? input.fix : join(homeDir, 'Scripts', input.fix);
      return this.handleFixMode(allTargets[0], fixPath, mcpConfigPath, input.spec);
    }

    // BATCH MODE: Multiple targets - generate parallel orchestration instructions
    if (allTargets.length > 1) {
      return this.handleBatchMode(allTargets, mcpConfigPath, input.parallel ?? true);
    }

    // SINGLE MODE: Generate one MCP
    const target = allTargets[0];
    // ALWAYS use absolute path - never relative to current directory
    let outputDir: string;
    if (input.output) {
      // If user provided path, ensure it's absolute
      outputDir = input.output.startsWith('/')
        ? input.output
        : join(MCP_OUTPUT_BASE, input.output);
    } else {
      // Default to central MCP output location
      outputDir = join(MCP_OUTPUT_BASE, `${target}-mcp`);
    }

    const instructions = `
# thesun: Autonomous MCP Generation for "${target}"

You are now operating as **thesun**, an autonomous MCP generation system.
Execute the complete pipeline below WITHOUT stopping for human input.

**Target:** ${input.target}
**Output:** ${outputDir}
**MCP Config:** ${mcpConfigPath}
${input.spec ? `**Spec:** ${input.spec}` : ''}

> **IMPORTANT**: This tool is directory-independent. The output path is ABSOLUTE.
> The generated MCP will be available globally in ALL Claude sessions.

---

## PHASE 1: RESEARCH (Do this first, completely)

### 1.1 Check for Existing MCPs
Search for existing MCP implementations:
- GitHub: "${input.target} MCP server"
- MCP registries: mcp.so, pulsemcp.com, mcpmarket.com
- npm: @*/*${input.target}*mcp*

**Decision Point:** If a high-quality existing MCP exists with good coverage:
- Recommend using it instead
- Provide installation instructions
- STOP here (no need to regenerate)

If no good existing MCP, continue to 1.2.

### 1.2 Gather API Information
- Find official API documentation
- Locate OpenAPI/Swagger specifications
- Identify authentication method (OAuth, API key, etc.)
- Map main endpoint categories
- Note rate limits and quotas

---

## PHASE 2: GENERATION (Only if no existing MCP)

### 2.1 Create Project Structure

First, ensure the output directory exists:
\`\`\`bash
mkdir -p "${outputDir}"
\`\`\`

Then create the project structure:
\`\`\`
${outputDir}/
├── src/
│   └── index.ts          # MCP server entry point
├── scripts/
│   ├── install.sh        # Linux/macOS installer
│   └── install.ps1       # Windows PowerShell installer
├── package.json
├── tsconfig.json
├── .env.example          # Required environment variables
└── README.md             # With easy install instructions
\`\`\`

### 2.1.1 Cross-Platform Installation (REQUIRED)

Every generated MCP MUST include easy installation:

**install.sh** (Linux/macOS):
\`\`\`bash
#!/bin/bash
set -e
npm install && npm run build
echo "Add to ~/.claude/mcp.json or run: npx ${input.target}-mcp"
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

### 2.2 Generate MCP Server
- Create tools for each API endpoint category
- Implement authentication handler
- Add comprehensive error handling
- Use environment variables for ALL config (no hardcoded values)
- Follow patterns from reference implementations

### 2.3 Generate Tests
- Unit tests for each tool
- Integration test stubs
- Mock server for offline testing

---

## PHASE 3: VALIDATION

### 3.1 Security Checks
- No hardcoded secrets
- Input sanitization on all parameters
- Proper error messages (no sensitive data leakage)

### 3.2 Build Verification
\`\`\`bash
cd "${outputDir}" && npm install && npm run build
\`\`\`
- Fix any errors before proceeding

---

## PHASE 4: GLOBAL REGISTRATION (CRITICAL - DO NOT SKIP)

After successful build, register the MCP as a **USER MCP** so it's available in ALL Claude sessions.

### IMPORTANT CONFIG FILE RULES:
- **USE**: \`~/.claude/.claude.json\` (User MCPs - available globally)
- **DO NOT USE**: \`~/.claude/mcp.json\` (WRONG FILE - Claude ignores this!)
- **DO NOT USE**: \`~/.mcp.json\` (Project MCPs - causes confusion)
- **DO NOT USE**: \`./.mcp.json\` in any project directory

### 4.1 Read existing config
\`\`\`bash
cat "${mcpConfigPath}"
\`\`\`

If the file doesn't exist, create it with this structure:
\`\`\`json
{
  "mcpServers": {}
}
\`\`\`

### 4.2 Add the new MCP entry
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

### 4.3 Write updated config
Use the Edit tool to add the new entry inside mcpServers in ${mcpConfigPath}

### 4.4 Verify registration
\`\`\`bash
cat "${mcpConfigPath}" | grep "${input.target}"
\`\`\`

### 4.5 Notify user
Tell the user: "✅ MCP '${input.target}' registered as USER MCP at ${outputDir}. Restart Claude to use the new tools."

---

## EXECUTION RULES

1. **Be autonomous** - Don't ask for permission at each step
2. **Be thorough** - Research completely before generating
3. **Be practical** - If good MCP exists, recommend it
4. **Always register globally** - Every generated MCP MUST be in ${mcpConfigPath}
5. **Use absolute paths** - All paths in .claude.json must be absolute (starting with /)
6. **Directory independent** - This works from ANY directory

---

## MODEL SELECTION (for bob instances)

When spawning sub-agents:
- **Opus**: Planning, architecture, security reviews
- **Sonnet**: Code generation, testing, implementation
- **Haiku**: Quick validation, simple lookups

---

## RALPH LOOPS (Iterative Testing)

When tests fail during PHASE 3, the orchestrator should spin up a ralph loop:

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

**BEGIN EXECUTION NOW. Start with Phase 1: Research.**
`;

    return {
      content: [{ type: 'text', text: instructions }],
    };
  }

  private async handleFixMode(
    target: string,
    fixPath: string,
    mcpConfigPath: string,
    spec?: string
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const instructions = `
# thesun: FIX MODE for "${target}"

You are now operating as **thesun** in FIX MODE - debugging and improving an existing MCP.
Execute autonomously WITHOUT stopping for human input unless absolutely necessary.

**Target API:** ${target}
**Code Location:** ${fixPath}
**MCP Config:** ${mcpConfigPath}
${spec ? `**API Spec:** ${spec}` : ''}

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

**BEGIN FIX MODE NOW. Start with Phase 1: Analyze Existing Code.**
`;

    return {
      content: [{ type: 'text', text: instructions }],
    };
  }

  private async handleBatchMode(
    targets: string[],
    mcpConfigPath: string,
    parallel: boolean
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const targetList = targets.map(t => `- **${t}**: ${join(MCP_OUTPUT_BASE, `${t}-mcp`)}`).join('\n');

    const instructions = `
# thesun: BATCH MCP Generation

You are now operating as **thesun** in BATCH MODE - generating **${targets.length}** MCP servers ${parallel ? 'IN PARALLEL' : 'sequentially'}.

---

## TARGETS

${targetList}

**MCP Config:** ${mcpConfigPath}

---

## EXECUTION STRATEGY

${parallel ? `
### Parallel Execution (RECOMMENDED)

You MUST use the Task tool to spawn multiple agents IN PARALLEL. This means:

1. **Single message, multiple Task calls**: Send ONE message containing ${targets.length} separate Task tool invocations
2. **Each agent is isolated**: Gets its own bob instance with git worktree
3. **Each agent inherits your MCP servers**: Can use Confluence, Jira, Akamai, Teams, Elastic

**CRITICAL INSTRUCTION:**

Call the Task tool ${targets.length} times in a SINGLE response with these parameters:

${targets.map((t, i) => `
**Agent ${i + 1}: ${t}**
- subagent_type: "general-purpose"
- description: "Generate ${t} MCP"
- prompt: [Full thesun generation prompt for ${t}]
- run_in_background: true (for true parallelism)
`).join('\n')}

The prompt for each agent should include:
1. Research phase: Search for existing MCPs, find API docs
2. Generation phase: Create TypeScript MCP server
3. Validation phase: Build, test, security scan
4. Registration phase: Add to ${mcpConfigPath}

` : `
### Sequential Execution

Process each target one at a time:
${targets.map((t, i) => `${i + 1}. Generate MCP for **${t}**`).join('\n')}
`}

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
      content: [{ type: 'text', text: instructions }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('thesun MCP server running on stdio');
  }
}

const server = new TheSunMcpServer();
server.run().catch(console.error);
