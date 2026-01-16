#!/usr/bin/env node
/**
 * thesun MCP Server
 *
 * Exposes thesun's autonomous MCP generation capabilities as MCP tools.
 * This allows Claude to generate MCPs from any project directory.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'generate_mcp',
    description: `Generate a production-ready MCP server for any API/tool autonomously.

This tool will:
1. Research the API (web search, docs, OpenAPI specs)
2. Check for existing MCP implementations
3. Generate complete TypeScript MCP server code
4. Generate tests
5. Run security scans

The generated MCP will be placed in the specified output directory (defaults to ./<tool>-mcp/).

Example usage:
- generate_mcp({ tool: "tesla" }) - Creates Tesla Fleet API MCP
- generate_mcp({ tool: "stripe", output: "./payments-mcp" }) - Creates Stripe MCP in custom dir
- generate_mcp({ tool: "slack", spec: "https://api.slack.com/specs/..." }) - Uses provided OpenAPI spec`,
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Name of the tool/API to generate MCP for (e.g., tesla, stripe, slack)',
        },
        output: {
          type: 'string',
          description: 'Output directory for generated MCP server (default: ./<tool>-mcp/)',
        },
        spec: {
          type: 'string',
          description: 'Optional URL or path to OpenAPI/Swagger specification',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'research_api',
    description: `Research and discover all APIs for a tool without generating code.

Returns:
- Existing MCP implementations (if any)
- Official API documentation links
- OpenAPI/Swagger specs (if available)
- Authentication requirements
- Key endpoints and capabilities

Use this for exploration before deciding whether to generate a new MCP or use an existing one.`,
    inputSchema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'Name of the tool/API to research (e.g., tesla, github, jira)',
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'check_build_status',
    description: 'Check the status of active MCP builds and view system health.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Input schemas for validation
const GenerateMcpInput = z.object({
  tool: z.string().min(1),
  output: z.string().optional(),
  spec: z.string().optional(),
});

const ResearchApiInput = z.object({
  tool: z.string().min(1),
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
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS,
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_mcp':
            return await this.handleGenerateMcp(args);
          case 'research_api':
            return await this.handleResearchApi(args);
          case 'check_build_status':
            return await this.handleCheckBuildStatus();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        };
      }
    });
  }

  private async handleGenerateMcp(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const input = GenerateMcpInput.parse(args);
    const outputDir = input.output || `./${input.tool}-mcp`;

    // This returns instructions for Claude to execute the generation
    // The actual work is done by Claude following these instructions
    const instructions = `
## MCP Generation Request: ${input.tool}

**Output Directory:** ${outputDir}
${input.spec ? `**OpenAPI Spec:** ${input.spec}` : ''}

### Execution Steps

You are now acting as thesun's mcp-builder agent. Execute these steps:

1. **Research Phase**
   - Search for existing MCP implementations for "${input.tool}"
   - Find official API documentation
   - Locate OpenAPI/Swagger specifications
   - Identify authentication requirements

2. **Discovery Phase**
   - Map ALL available API endpoints
   - Document rate limits and quotas
   - Note any webhook/event capabilities
   - Identify required scopes/permissions

3. **Generation Phase**
   - Create TypeScript MCP server structure in ${outputDir}
   - Generate tools for each API endpoint
   - Implement authentication handlers
   - Create comprehensive error handling

4. **Testing Phase**
   - Generate unit tests for all tools
   - Create integration test stubs
   - Add mock server for offline testing

5. **Security Phase**
   - Run static analysis
   - Check for hardcoded secrets
   - Validate input sanitization
   - Generate .env.example with required config

6. **Documentation Phase**
   - Create README.md with setup instructions
   - Document all available tools
   - Add usage examples

**IMPORTANT:**
- All config must use environment variables (no hardcoded values)
- Follow the patterns from the Akamai MCP reference implementation
- Ensure cross-platform compatibility (Windows, macOS, Linux)

Begin execution now. Start with Step 1: Research Phase.
`;

    return {
      content: [{ type: 'text', text: instructions }],
    };
  }

  private async handleResearchApi(args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
    const input = ResearchApiInput.parse(args);

    const instructions = `
## API Research Request: ${input.tool}

### Research Tasks

Search for and compile information about "${input.tool}" API:

1. **Existing MCP Implementations**
   - Search GitHub for "${input.tool} MCP server"
   - Check MCP registries (mcp.so, pulsemcp.com, etc.)
   - Evaluate completeness and quality of existing implementations

2. **Official Documentation**
   - Find official API documentation
   - Locate developer portal/dashboard
   - Identify API versioning strategy

3. **OpenAPI Specifications**
   - Search for official OpenAPI/Swagger specs
   - Check if specs are publicly available
   - Note any authentication required to access specs

4. **Authentication Requirements**
   - OAuth 2.0 / OIDC flows
   - API keys / tokens
   - Required scopes and permissions

5. **Key Capabilities**
   - List main API endpoint categories
   - Note webhook/event support
   - Identify rate limits and quotas

**Return a summary** with:
- Recommendation: Use existing MCP vs Generate new
- Links to key resources
- Authentication complexity assessment
- Estimated endpoint coverage available

Begin research now.
`;

    return {
      content: [{ type: 'text', text: instructions }],
    };
  }

  private async handleCheckBuildStatus(): Promise<{ content: Array<{ type: string; text: string }> }> {
    // In a full implementation, this would query the orchestrator
    return {
      content: [{
        type: 'text',
        text: `
## thesun Build Status

**Orchestrator:** Not running (standalone mode)

To start the orchestrator for parallel builds:
\`\`\`bash
cd ~/Scripts/thesun
npm run orchestrator:start
\`\`\`

**Current Mode:** Direct execution via MCP tools

Use \`generate_mcp\` tool to start a new build.
`,
      }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('thesun MCP server running on stdio');
  }
}

// Start server
const server = new TheSunMcpServer();
server.run().catch(console.error);
