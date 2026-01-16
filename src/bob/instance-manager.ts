/**
 * Bob Instance Manager
 *
 * Manages isolated Claude Code sessions for parallel tool builds.
 * Each instance has:
 * - Separate workspace directory
 * - Isolated environment variables
 * - Independent caches and state
 * - No cross-contamination between builds
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { BobInstance } from '../types/index.js';
import { logger, createBuildLogger } from '../observability/logger.js';
import { selectModelForPhase } from '../agents/model-selector.js';
import { BuildPhase } from '../types/index.js';

/**
 * Configuration for creating a new Bob instance
 */
export interface BobInstanceConfig {
  toolName: string;
  workspace?: string;
  env?: Record<string, string>;
  model?: 'opus' | 'sonnet' | 'haiku';
}

/**
 * Bob Instance Manager
 */
export class BobInstanceManager {
  private instances: Map<string, BobInstance> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private baseWorkspace: string;
  private claudePath: string;

  constructor(options: { baseWorkspace?: string; claudePath?: string } = {}) {
    this.baseWorkspace = options.baseWorkspace ?? '/tmp/thesun/builds';
    this.claudePath = options.claudePath ?? 'claude'; // Assumes claude is in PATH

    // Ensure base workspace exists
    if (!existsSync(this.baseWorkspace)) {
      mkdirSync(this.baseWorkspace, { recursive: true });
    }
  }

  /**
   * Create a new isolated Bob instance
   */
  async create(config: BobInstanceConfig): Promise<BobInstance> {
    const id = crypto.randomUUID();
    const workspace = config.workspace ?? join(this.baseWorkspace, `${config.toolName}-${id.slice(0, 8)}`);

    // Create isolated workspace
    if (!existsSync(workspace)) {
      mkdirSync(workspace, { recursive: true });
    }

    // Create instance-specific .claude directory
    const claudeDir = join(workspace, '.claude');
    mkdirSync(claudeDir, { recursive: true });

    // Write instance-specific settings
    const settings = {
      model: config.model ?? 'sonnet',
      workspace,
      toolName: config.toolName,
      instanceId: id,
    };
    writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify(settings, null, 2));

    // Build isolated environment
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      // Override home to isolate .claude config
      CLAUDE_CONFIG_DIR: claudeDir,
      // Workspace isolation
      THESUN_WORKSPACE: workspace,
      THESUN_TOOL_NAME: config.toolName,
      THESUN_INSTANCE_ID: id,
      // Prevent any shared state
      HOME: workspace,
      XDG_CONFIG_HOME: join(workspace, '.config'),
      XDG_CACHE_HOME: join(workspace, '.cache'),
      XDG_DATA_HOME: join(workspace, '.local/share'),
      // Custom env vars from config
      ...config.env,
    };

    const instance: BobInstance = {
      id,
      toolName: config.toolName,
      workspace,
      env,
      status: 'creating',
      createdAt: new Date(),
    };

    this.instances.set(id, instance);

    logger.info(`Created Bob instance`, {
      instanceId: id,
      toolName: config.toolName,
      workspace,
    });

    // Update status to running
    instance.status = 'running';
    this.instances.set(id, instance);

    return instance;
  }

  /**
   * Execute a command in the Bob instance
   */
  async execute(
    instanceId: string,
    prompt: string,
    options: { phase?: BuildPhase; timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Bob instance not found: ${instanceId}`);
    }

    const buildLogger = createBuildLogger(instanceId, instance.toolName);

    // Select model based on phase
    const model = options.phase
      ? selectModelForPhase(options.phase)
      : 'sonnet';

    buildLogger.info(`Executing in Bob instance`, {
      model,
      phase: options.phase,
      promptLength: prompt.length,
    });

    return new Promise((resolve, reject) => {
      const timeout = options.timeout ?? 300000; // 5 minutes default

      // Spawn claude with isolated environment
      const child = spawn(this.claudePath, ['-p', prompt, '--model', model], {
        cwd: instance.workspace,
        env: instance.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.processes.set(instanceId, child);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        this.processes.delete(instanceId);

        // Update last activity
        instance.lastActivityAt = new Date();
        this.instances.set(instanceId, instance);

        buildLogger.info(`Execution completed`, {
          exitCode: code,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
        });

        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.processes.delete(instanceId);
        buildLogger.error(`Execution error`, { error: err.message });
        reject(err);
      });
    });
  }

  /**
   * Execute a multi-turn conversation (for iterative work)
   */
  async executeConversation(
    instanceId: string,
    prompts: string[],
    options: { phase?: BuildPhase; timeout?: number } = {}
  ): Promise<string[]> {
    const results: string[] = [];

    for (const prompt of prompts) {
      const result = await this.execute(instanceId, prompt, options);
      results.push(result.stdout);

      // Check for failure
      if (result.exitCode !== 0) {
        throw new Error(`Conversation step failed: ${result.stderr}`);
      }
    }

    return results;
  }

  /**
   * Stop a running Bob instance
   */
  async stop(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    // Kill any running process
    const process = this.processes.get(instanceId);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(instanceId);
    }

    instance.status = 'stopped';
    this.instances.set(instanceId, instance);

    logger.info(`Stopped Bob instance`, { instanceId, toolName: instance.toolName });
  }

  /**
   * Destroy a Bob instance and clean up resources
   */
  async destroy(instanceId: string, options: { keepWorkspace?: boolean } = {}): Promise<void> {
    await this.stop(instanceId);

    const instance = this.instances.get(instanceId);
    if (!instance) {
      return;
    }

    // Clean up workspace unless requested to keep it
    if (!options.keepWorkspace && existsSync(instance.workspace)) {
      rmSync(instance.workspace, { recursive: true, force: true });
    }

    instance.status = 'destroyed';
    this.instances.delete(instanceId);

    logger.info(`Destroyed Bob instance`, {
      instanceId,
      toolName: instance.toolName,
      workspaceKept: options.keepWorkspace,
    });
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): BobInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Get all active instances
   */
  getActiveInstances(): BobInstance[] {
    return Array.from(this.instances.values()).filter(
      (i) => i.status === 'running' || i.status === 'creating'
    );
  }

  /**
   * Get instances for a specific tool
   */
  getInstancesForTool(toolName: string): BobInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.toolName === toolName);
  }

  /**
   * Clean up all instances (for shutdown)
   */
  async destroyAll(): Promise<void> {
    const instanceIds = Array.from(this.instances.keys());
    await Promise.all(instanceIds.map((id) => this.destroy(id)));
    logger.info(`Destroyed all Bob instances`, { count: instanceIds.length });
  }

  /**
   * Get workspace path for an instance
   */
  getWorkspacePath(instanceId: string, subpath?: string): string | undefined {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return undefined;
    }
    return subpath ? join(instance.workspace, subpath) : instance.workspace;
  }
}

// Singleton instance for convenience
let defaultManager: BobInstanceManager | null = null;

export function getBobManager(options?: { baseWorkspace?: string }): BobInstanceManager {
  if (!defaultManager) {
    defaultManager = new BobInstanceManager(options);
  }
  return defaultManager;
}
