#!/usr/bin/env node

/**
 * thesun CLI
 *
 * Command-line interface for the autonomous MCP server generation platform.
 */

import { Command } from 'commander';
import { createOrchestrator } from '../orchestrator/index.js';
import { ToolSpec, ToolSpecSchema } from '../types/index.js';
import { logger } from '../observability/logger.js';
import { getDefaultDataDir, getDefaultConfigDir } from '../utils/platform.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('thesun')
  .description('Autonomous MCP server generation and orchestration platform')
  .version('0.1.0');

// Generate command
program
  .command('generate')
  .description('Generate an MCP server for one or more tools')
  .option('-t, --tool <name>', 'Tool name to generate (can be repeated)', collect, [])
  .option('-f, --file <path>', 'JSON file with tool specifications')
  .option('-o, --output <path>', 'Output directory for generated MCP servers')
  .option('--parallel <n>', 'Maximum parallel builds', parseInt, 4)
  .option('--skip-security', 'Skip security scans (not recommended)')
  .option('--skip-tests', 'Skip test generation and execution')
  .option('--dry-run', 'Show what would be generated without executing')
  .action(async (options) => {
    console.log('🌞 thesun - Autonomous MCP Server Generator\n');

    // Load tool specs
    let tools: ToolSpec[] = [];

    if (options.file) {
      // Load from file
      if (!existsSync(options.file)) {
        console.error(`Error: File not found: ${options.file}`);
        process.exit(1);
      }

      const content = readFileSync(options.file, 'utf-8');
      const parsed = JSON.parse(content);
      const specs = Array.isArray(parsed) ? parsed : [parsed];

      for (const spec of specs) {
        const result = ToolSpecSchema.safeParse(spec);
        if (result.success) {
          tools.push(result.data);
        } else {
          console.error(`Invalid tool spec: ${JSON.stringify(result.error.errors)}`);
          process.exit(1);
        }
      }
    } else if (options.tool.length > 0) {
      // Create basic specs from tool names
      for (const name of options.tool) {
        tools.push({
          name,
          description: `MCP server for ${name}`,
          category: 'other',
          authType: 'api_key', // Default, can be overridden
        });
      }
    } else {
      console.error('Error: Specify either --tool or --file');
      program.help();
    }

    console.log(`📋 Tools to generate: ${tools.map((t) => t.name).join(', ')}\n`);

    if (options.dryRun) {
      console.log('🔍 Dry run mode - showing plan only\n');
      for (const tool of tools) {
        console.log(`  • ${tool.name}`);
        console.log(`    Category: ${tool.category}`);
        console.log(`    Auth: ${tool.authType}`);
        if (tool.specSources) {
          console.log(`    Specs: ${tool.specSources.map((s) => s.url ?? s.path).join(', ')}`);
        }
        console.log();
      }
      process.exit(0);
    }

    // Create orchestrator
    const orchestrator = createOrchestrator({
      maxParallelBuilds: options.parallel,
      workspace: options.output ?? join(getDefaultDataDir(), 'builds'),
    });

    // Set up event handlers
    orchestrator.on('build:start', (state) => {
      console.log(`🚀 Starting build: ${state.toolName} (${state.id.slice(0, 8)})`);
    });

    orchestrator.on('build:phase', (state, previousPhase) => {
      const phaseEmoji: Record<string, string> = {
        discovering: '🔍',
        generating: '⚙️',
        testing: '🧪',
        security_scan: '🔒',
        optimizing: '⚡',
        validating: '✅',
      };
      console.log(`  ${phaseEmoji[state.phase] ?? '•'} ${state.toolName}: ${state.phase}`);
    });

    orchestrator.on('build:complete', (state) => {
      console.log(`\n✅ Completed: ${state.toolName}`);
      console.log(`   Endpoints: ${state.discovery?.endpoints ?? 0}`);
      console.log(`   Tools generated: ${state.generation?.toolsGenerated ?? 0}`);
      console.log(`   Tests passed: ${state.testing?.passed ?? 0}/${state.testing?.totalTests ?? 0}`);
      console.log(`   Coverage: ${state.testing?.coverage ?? 0}%`);
    });

    orchestrator.on('build:fail', (state, error) => {
      console.error(`\n❌ Failed: ${state.toolName}`);
      console.error(`   Error: ${error.message}`);
    });

    // Queue builds
    const buildIds = await orchestrator.queueBuilds(tools);
    console.log(`\n📥 Queued ${buildIds.length} builds\n`);

    // Wait for completion
    const checkInterval = setInterval(() => {
      const builds = orchestrator.getAllBuilds();
      const completed = builds.filter((b) => b.phase === 'completed' || b.phase === 'failed');

      if (completed.length === builds.length) {
        clearInterval(checkInterval);

        const successful = completed.filter((b) => b.phase === 'completed').length;
        const failed = completed.filter((b) => b.phase === 'failed').length;

        console.log('\n📊 Summary');
        console.log(`   Successful: ${successful}`);
        console.log(`   Failed: ${failed}`);

        orchestrator.shutdown().then(() => {
          process.exit(failed > 0 ? 1 : 0);
        });
      }
    }, 1000);

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n⏹️  Shutting down...');
      await orchestrator.shutdown();
      process.exit(0);
    });
  });

// Status command
program
  .command('status')
  .description('Show status of active builds')
  .action(async () => {
    console.log('🌞 thesun - Build Status\n');

    // In a real implementation, would read from persistent state
    console.log('No active builds found.');
    console.log('Use "thesun generate" to start a build.');
  });

// List command
program
  .command('list')
  .description('List available tool templates and examples')
  .action(async () => {
    console.log('🌞 thesun - Available Tool Templates\n');

    const templates = [
      { name: 'observability', examples: ['dynatrace', 'datadog', 'prometheus'] },
      { name: 'security', examples: ['snyk', 'fortify', 'sonarqube'] },
      { name: 'devops', examples: ['github', 'gitlab', 'jenkins'] },
      { name: 'communication', examples: ['slack', 'teams', 'email'] },
      { name: 'data', examples: ['snowflake', 'databricks', 'postgres'] },
    ];

    for (const template of templates) {
      console.log(`📦 ${template.name}`);
      console.log(`   Examples: ${template.examples.join(', ')}\n`);
    }

    console.log('Use "thesun generate --tool=<name>" to generate an MCP server.');
  });

// Config command
program
  .command('config')
  .description('Show or update configuration')
  .option('--show', 'Show current configuration')
  .option('--init', 'Initialize configuration with defaults')
  .action(async (options) => {
    console.log('🌞 thesun - Configuration\n');

    const configDir = getDefaultConfigDir();
    const dataDir = getDefaultDataDir();

    console.log(`Config directory: ${configDir}`);
    console.log(`Data directory: ${dataDir}`);
    console.log();

    console.log('Environment Variables:');
    console.log(`  THESUN_DATA_DIR: ${process.env.THESUN_DATA_DIR ?? '(not set)'}`);
    console.log(`  THESUN_WORKSPACE: ${process.env.THESUN_WORKSPACE ?? '(not set)'}`);
    console.log(`  LOG_LEVEL: ${process.env.LOG_LEVEL ?? 'info'}`);
    console.log(`  MAX_PARALLEL_BUILDS: ${process.env.MAX_PARALLEL_BUILDS ?? '4'}`);
    console.log();

    console.log('Knowledge Sources:');
    console.log(`  Jira: ${process.env.JIRA_BASE_URL ? '✅ configured' : '❌ not configured'}`);
    console.log(`  Confluence: ${process.env.CONFLUENCE_BASE_URL ? '✅ configured' : '❌ not configured'}`);
    console.log(`  ServiceNow: ${process.env.SERVICENOW_INSTANCE ? '✅ configured' : '❌ not configured'}`);
    console.log(`  GitHub: ${process.env.GITHUB_TOKEN ? '✅ configured' : '❌ not configured'}`);
  });

// Helper to collect multiple option values
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// Parse and run
program.parse();
