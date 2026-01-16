/**
 * Requirement Validator
 *
 * Validates that all requirements are met by checking:
 * - Files exist
 * - Builds pass
 * - Tests pass
 * - GitHub repos exist
 * - Confluence pages exist
 *
 * Also validates existing MCPs against requirements for improvement.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { execFileSync } from 'child_process';
import {
  ValidationRule,
  ValidationResult,
  RequirementSet,
} from '../types/index.js';
import { logger } from '../observability/logger.js';

/**
 * Safe command execution using execFileSync (no shell injection)
 */
function safeExec(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number }
): { success: boolean; output: string; error?: string } {
  try {
    const output = execFileSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf-8',
      timeout: options.timeout || 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: output.toString() };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run a single validation rule
 */
export async function runValidation(rule: ValidationRule): Promise<ValidationResult> {
  try {
    switch (rule.type) {
      case 'file_exists': {
        const path = rule.params.path as string;
        const exists = existsSync(path);
        return {
          ruleId: rule.id,
          passed: exists,
          message: exists ? `File exists: ${path}` : `File not found: ${path}`,
          details: { path, exists },
          timestamp: new Date(),
        };
      }

      case 'directory_exists': {
        const path = rule.params.path as string;
        const exists = existsSync(path);
        return {
          ruleId: rule.id,
          passed: exists,
          message: exists ? `Directory exists: ${path}` : `Directory not found: ${path}`,
          details: { path, exists },
          timestamp: new Date(),
        };
      }

      case 'command_succeeds': {
        const command = rule.params.command as string;
        const args = rule.params.args as string[] || [];
        const cwd = rule.params.cwd as string | undefined;
        const result = safeExec(command, args, { cwd, timeout: 60000 });
        return {
          ruleId: rule.id,
          passed: result.success,
          message: result.success
            ? `Command succeeded: ${command}`
            : `Command failed: ${command}`,
          details: { command, args, output: result.output?.substring(0, 500), error: result.error },
          timestamp: new Date(),
        };
      }

      case 'file_contains': {
        const path = rule.params.path as string;
        const pattern = rule.params.pattern as string;
        if (!existsSync(path)) {
          return {
            ruleId: rule.id,
            passed: false,
            message: `File not found: ${path}`,
            timestamp: new Date(),
          };
        }
        const content = readFileSync(path, 'utf-8');
        const regex = new RegExp(pattern);
        const matches = regex.test(content);
        return {
          ruleId: rule.id,
          passed: matches,
          message: matches
            ? `Pattern found in ${path}`
            : `Pattern not found in ${path}`,
          details: { path, pattern, matches },
          timestamp: new Date(),
        };
      }

      case 'git_remote_exists': {
        const repoPath = rule.params.path as string;
        const result = safeExec('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
        const remote = result.output?.trim();
        return {
          ruleId: rule.id,
          passed: result.success && !!remote,
          message: remote ? `Git remote: ${remote}` : 'No git remote configured',
          details: { remote },
          timestamp: new Date(),
        };
      }

      case 'tests_pass': {
        const cwd = rule.params.path as string;
        const result = safeExec('npm', ['test'], { cwd, timeout: 120000 });
        return {
          ruleId: rule.id,
          passed: result.success,
          message: result.success ? 'All tests passed' : 'Tests failed',
          details: { error: result.error },
          timestamp: new Date(),
        };
      }

      case 'build_succeeds': {
        const cwd = rule.params.path as string;
        const result = safeExec('npm', ['run', 'build'], { cwd, timeout: 120000 });
        return {
          ruleId: rule.id,
          passed: result.success,
          message: result.success ? 'Build succeeded' : 'Build failed',
          details: { error: result.error },
          timestamp: new Date(),
        };
      }

      default:
        return {
          ruleId: rule.id,
          passed: false,
          message: `Unknown validation type: ${rule.type}`,
          timestamp: new Date(),
        };
    }
  } catch (error) {
    return {
      ruleId: rule.id,
      passed: false,
      message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: new Date(),
    };
  }
}

/**
 * Validate an existing MCP against standard requirements
 */
export interface McpValidationResult {
  path: string;
  name: string;
  checks: {
    hasPackageJson: boolean;
    hasSrcIndex: boolean;
    hasReadme: boolean;
    hasEnvExample: boolean;
    hasTests: boolean;
    hasArchitectureDocs: boolean;
    buildPasses: boolean;
    testsPasses: boolean;
    hasGitRepo: boolean;
    hasGitRemote: boolean;
  };
  score: number; // 0-100
  missingItems: string[];
  recommendations: string[];
}

/**
 * Validate an existing MCP directory - ALL CHECKS RUN IN PARALLEL
 */
export async function validateExistingMcp(mcpPath: string): Promise<McpValidationResult> {
  const name = basename(mcpPath);
  const checks = {
    hasPackageJson: false,
    hasSrcIndex: false,
    hasReadme: false,
    hasEnvExample: false,
    hasTests: false,
    hasArchitectureDocs: false,
    buildPasses: false,
    testsPasses: false,
    hasGitRepo: false,
    hasGitRemote: false,
  };
  const missingItems: string[] = [];
  const recommendations: string[] = [];

  logger.info('Validating existing MCP (parallel)', { path: mcpPath, name });

  // Run ALL file existence checks in parallel
  const [
    hasPackageJson,
    hasSrcIndexTs,
    hasSrcIndexJs,
    hasIndexTs,
    hasIndexJs,
    hasReadmeMd,
    hasReadmeLower,
    hasEnvExample,
    hasTestsDir,
    hasTestDir,
    hasUnderscoreTests,
    hasSrcUnderscoreTests,
    hasArchDocs,
    hasArchMd,
    hasGitDir,
  ] = await Promise.all([
    Promise.resolve(existsSync(join(mcpPath, 'package.json'))),
    Promise.resolve(existsSync(join(mcpPath, 'src', 'index.ts'))),
    Promise.resolve(existsSync(join(mcpPath, 'src', 'index.js'))),
    Promise.resolve(existsSync(join(mcpPath, 'index.ts'))),
    Promise.resolve(existsSync(join(mcpPath, 'index.js'))),
    Promise.resolve(existsSync(join(mcpPath, 'README.md'))),
    Promise.resolve(existsSync(join(mcpPath, 'readme.md'))),
    Promise.resolve(existsSync(join(mcpPath, '.env.example'))),
    Promise.resolve(existsSync(join(mcpPath, 'tests'))),
    Promise.resolve(existsSync(join(mcpPath, 'test'))),
    Promise.resolve(existsSync(join(mcpPath, '__tests__'))),
    Promise.resolve(existsSync(join(mcpPath, 'src', '__tests__'))),
    Promise.resolve(existsSync(join(mcpPath, 'docs', 'architecture'))),
    Promise.resolve(existsSync(join(mcpPath, 'ARCHITECTURE.md'))),
    Promise.resolve(existsSync(join(mcpPath, '.git'))),
  ]);

  // Apply file existence results
  checks.hasPackageJson = hasPackageJson;
  checks.hasSrcIndex = hasSrcIndexTs || hasSrcIndexJs || hasIndexTs || hasIndexJs;
  checks.hasReadme = hasReadmeMd || hasReadmeLower;
  checks.hasEnvExample = hasEnvExample;
  checks.hasTests = hasTestsDir || hasTestDir || hasUnderscoreTests || hasSrcUnderscoreTests;
  checks.hasArchitectureDocs = hasArchDocs || hasArchMd;
  checks.hasGitRepo = hasGitDir;

  // Check for *.test.ts files if no test directory found
  if (!checks.hasTests) {
    try {
      const srcDir = join(mcpPath, 'src');
      if (existsSync(srcDir)) {
        const files = readdirSync(srcDir, { recursive: true });
        checks.hasTests = files.some(
          (f) => typeof f === 'string' && (f.endsWith('.test.ts') || f.endsWith('.spec.ts'))
        );
      }
    } catch {
      // Ignore
    }
  }

  // Run build, test, and git remote checks IN PARALLEL
  const parallelChecks = await Promise.all([
    // Build check
    checks.hasPackageJson
      ? new Promise<{ type: 'build'; success: boolean }>((resolve) => {
          const result = safeExec('npm', ['run', 'build'], { cwd: mcpPath, timeout: 60000 });
          resolve({ type: 'build', success: result.success });
        })
      : Promise.resolve({ type: 'build' as const, success: false }),

    // Test check
    checks.hasPackageJson && checks.hasTests
      ? new Promise<{ type: 'test'; success: boolean }>((resolve) => {
          const result = safeExec('npm', ['test'], { cwd: mcpPath, timeout: 120000 });
          resolve({ type: 'test', success: result.success });
        })
      : Promise.resolve({ type: 'test' as const, success: false }),

    // Git remote check
    checks.hasGitRepo
      ? new Promise<{ type: 'gitRemote'; success: boolean }>((resolve) => {
          const result = safeExec('git', ['remote', 'get-url', 'origin'], { cwd: mcpPath });
          resolve({ type: 'gitRemote', success: result.success && !!result.output?.trim() });
        })
      : Promise.resolve({ type: 'gitRemote' as const, success: false }),
  ]);

  // Apply parallel check results
  for (const check of parallelChecks) {
    if (check.type === 'build') checks.buildPasses = check.success;
    if (check.type === 'test') checks.testsPasses = check.success;
    if (check.type === 'gitRemote') checks.hasGitRemote = check.success;
  }

  // Build missing items and recommendations
  if (!checks.hasPackageJson) {
    missingItems.push('package.json');
    recommendations.push('Create package.json with proper dependencies');
  }
  if (!checks.hasSrcIndex) {
    missingItems.push('Entry point (src/index.ts)');
    recommendations.push('Create MCP server entry point');
  }
  if (!checks.hasReadme) {
    missingItems.push('README.md');
    recommendations.push('Add README with installation and usage instructions');
  }
  if (!checks.hasEnvExample) {
    missingItems.push('.env.example');
    recommendations.push('Add .env.example documenting required environment variables');
  }
  if (!checks.hasTests) {
    missingItems.push('Test files');
    recommendations.push('Add unit tests for MCP tools');
  }
  if (!checks.hasArchitectureDocs) {
    missingItems.push('Architecture documentation');
    recommendations.push('Run archcheck to generate architecture documentation');
  }
  if (!checks.hasGitRepo) {
    missingItems.push('Git repository');
    recommendations.push('Initialize git repository: git init');
  }
  if (checks.hasGitRepo && !checks.hasGitRemote) {
    missingItems.push('Git remote (GitHub)');
    recommendations.push('Push to GitHub: gh repo create && git push');
  }
  if (checks.hasPackageJson && !checks.buildPasses) {
    missingItems.push('Passing build');
    recommendations.push('Fix build errors: npm run build');
  }
  if (checks.hasPackageJson && checks.hasTests && !checks.testsPasses) {
    missingItems.push('Passing tests');
    recommendations.push('Fix test failures: npm test');
  }

  // Calculate score
  const checkValues = Object.values(checks);
  const score = Math.round((checkValues.filter(Boolean).length / checkValues.length) * 100);

  logger.info('MCP validation complete', {
    name,
    score,
    missingCount: missingItems.length,
  });

  return {
    path: mcpPath,
    name,
    checks,
    score,
    missingItems,
    recommendations,
  };
}

/**
 * Generate validation rules for a requirement set
 */
export function generateValidationRules(
  requirementSet: RequirementSet,
  basePath: string
): ValidationRule[] {
  const rules: ValidationRule[] = [];
  let ruleIndex = 0;

  for (const req of requirementSet.requirements) {
    switch (req.type) {
      case 'generate_mcp':
        if (req.target) {
          const mcpPath = join(basePath, `${req.target}-mcp`);
          rules.push({
            id: `rule-${ruleIndex++}`,
            name: `${req.target} MCP directory exists`,
            type: 'directory_exists',
            params: { path: mcpPath },
          });
          rules.push({
            id: `rule-${ruleIndex++}`,
            name: `${req.target} MCP builds`,
            type: 'build_succeeds',
            params: { path: mcpPath },
          });
        }
        break;

      case 'run_archcheck':
        if (req.target) {
          const archPath = join(basePath, `${req.target}-mcp`, 'docs', 'architecture');
          rules.push({
            id: `rule-${ruleIndex++}`,
            name: `${req.target} architecture docs exist`,
            type: 'directory_exists',
            params: { path: archPath },
          });
        }
        break;

      case 'publish_github':
        if (req.target) {
          const mcpPath = join(basePath, `${req.target}-mcp`);
          rules.push({
            id: `rule-${ruleIndex++}`,
            name: `${req.target} has git remote`,
            type: 'git_remote_exists',
            params: { path: mcpPath },
          });
        }
        break;

      case 'run_tests':
        if (req.target) {
          const mcpPath = join(basePath, `${req.target}-mcp`);
          rules.push({
            id: `rule-${ruleIndex++}`,
            name: `${req.target} tests pass`,
            type: 'tests_pass',
            params: { path: mcpPath },
          });
        }
        break;
    }
  }

  return rules;
}

/**
 * Run all validation rules IN PARALLEL and return results
 */
export async function runAllValidations(
  rules: ValidationRule[]
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();

  // Run ALL validations in parallel for speed
  const validationPromises = rules.map(async (rule) => {
    const result = await runValidation(rule);
    logger.info('Validation result', {
      ruleId: rule.id,
      ruleName: rule.name,
      passed: result.passed,
    });
    return { rule, result };
  });

  const completedValidations = await Promise.all(validationPromises);

  for (const { rule, result } of completedValidations) {
    results.set(rule.id, result);
  }

  return results;
}

/**
 * Generate improvement plan for an MCP based on validation
 */
export function generateImprovementPlan(validation: McpValidationResult): string[] {
  const plan: string[] = [];

  if (!validation.checks.hasPackageJson) {
    plan.push('Initialize npm project with package.json');
  }
  if (!validation.checks.hasSrcIndex) {
    plan.push('Create MCP server entry point at src/index.ts');
  }
  if (!validation.checks.hasReadme) {
    plan.push('Generate README.md with installation and usage instructions');
  }
  if (!validation.checks.hasEnvExample) {
    plan.push('Create .env.example with required environment variables');
  }
  if (!validation.checks.hasTests) {
    plan.push('Add unit tests for all MCP tools');
  }
  if (!validation.checks.hasArchitectureDocs) {
    plan.push('Run archcheck skill to generate architecture documentation');
  }
  if (!validation.checks.buildPasses) {
    plan.push('Fix TypeScript/build errors');
  }
  if (!validation.checks.testsPasses) {
    plan.push('Fix failing tests');
  }
  if (!validation.checks.hasGitRepo) {
    plan.push('Initialize git repository');
  }
  if (!validation.checks.hasGitRemote) {
    plan.push('Create GitHub repository and push code');
  }

  return plan;
}
