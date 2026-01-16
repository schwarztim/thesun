#!/usr/bin/env node
/**
 * thesun MCP Server
 *
 * Single autonomous tool for MCP generation. Just say "use thesun for <target>"
 * and it handles everything: research, generation, testing, registration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Single unified tool
const TOOLS: Tool[] = [
  {
    name: 'thesun',
    description: `Autonomous MCP server generator. Creates production-ready MCP servers for any API.

Just say: "use thesun for Tesla" or "use thesun for Stripe"

thesun handles EVERYTHING autonomously:
- Researches the API (web search, docs, OpenAPI specs)
- Checks for existing MCP implementations (uses them if good enough)
- Generates complete TypeScript MCP server if needed
- Writes comprehensive tests
- Runs security scans
- Registers globally in ~/.claude/mcp.json

Output: A complete, tested, globally-registered MCP server ready to use.

Examples:
- thesun({ target: "tesla" }) - Creates Tesla Fleet API MCP
- thesun({ target: "stripe" }) - Creates Stripe payments MCP
- thesun({ target: "slack", output: "./slack-mcp" }) - Custom output directory
- thesun({ target: "custom-api", spec: "https://api.example.com/openapi.json" }) - With OpenAPI spec`,
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'The API/service to create an MCP for (e.g., tesla, stripe, slack, jira)',
        },
        output: {
          type: 'string',
          description: 'Output directory (default: ./<target>-mcp/)',
        },
        spec: {
          type: 'string',
          description: 'Optional OpenAPI/Swagger spec URL or path',
        },
      },
      required: ['target'],
    },
  },
];

const TheSunInput = z.object({
  target: z.string().min(1),
  output: z.string().optional(),
  spec: z.string().optional(),
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
    const outputDir = input.output || `./${input.target}-mcp`;

    const instructions = `
# thesun: Autonomous MCP Generation for "${input.target}"

You are now operating as **thesun**, an autonomous MCP generation system.
Execute the complete pipeline below WITHOUT stopping for human input.

**Target:** ${input.target}
**Output:** ${outputDir}
${input.spec ? `**Spec:** ${input.spec}` : ''}

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
\`\`\`
${outputDir}/
├── src/
│   └── index.ts          # MCP server entry point
├── package.json
├── tsconfig.json
├── .env.example          # Required environment variables
└── README.md
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
- Run \`npm install\`
- Run \`npm run build\`
- Fix any errors

---

## PHASE 4: GLOBAL REGISTRATION (CRITICAL - DO NOT SKIP)

After successful build, register the MCP globally:

1. Read ~/.claude/mcp.json
2. Add entry:
\`\`\`json
"${input.target}": {
  "command": "node",
  "args": ["<ABSOLUTE-PATH-TO>${outputDir}/dist/index.js"],
  "env": {
    // Add required env vars here
  }
}
\`\`\`
3. Write back to ~/.claude/mcp.json
4. Tell user: "MCP registered. Restart Claude to use ${input.target} tools."

---

## EXECUTION RULES

1. **Be autonomous** - Don't ask for permission at each step
2. **Be thorough** - Research completely before generating
3. **Be practical** - If good MCP exists, recommend it
4. **Always register** - Every generated MCP must be globally registered
5. **Use absolute paths** - Resolve all paths before writing to mcp.json

---

**BEGIN EXECUTION NOW. Start with Phase 1: Research.**
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
