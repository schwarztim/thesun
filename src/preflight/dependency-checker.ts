/**
 * Preflight dependency checker for browser-enhanced MCP generation.
 * Verifies all required dependencies are available before starting generation.
 */

import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { logger } from "../observability/logger.js";
import type { DependencyStatus, PreflightCheckResult } from "../types/index.js";

/**
 * Platform-specific Chrome browser paths
 */
const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    join(
      homedir(),
      "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ),
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ],
  win32: [
    join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    join(
      process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
      "Google\\Chrome\\Application\\chrome.exe",
    ),
    join(
      process.env.LOCALAPPDATA || "",
      "Google\\Chrome\\Application\\chrome.exe",
    ),
  ],
};

/**
 * Required subdirectories under ~/.thesun/
 */
const THESUN_SUBDIRS = ["credentials", "cache", "patterns", "health"];

/**
 * DependencyChecker verifies all required dependencies for browser-enhanced MCP generation.
 */
export class DependencyChecker {
  private userMcpsPath: string;
  private thesunDir: string;

  constructor() {
    this.userMcpsPath = join(homedir(), ".claude", "user-mcps.json");
    this.thesunDir = join(homedir(), ".thesun");
  }

  /**
   * Runs all preflight checks and returns the combined result.
   */
  async runPreflight(): Promise<PreflightCheckResult> {
    logger.info("Running preflight dependency checks");

    const checks = await Promise.all([
      this.checkChromeDevTools(),
      this.checkChromeBrowser(),
      this.checkThesunDirectory(),
    ]);

    const missingRequired = checks
      .filter((c) => c.required && !c.available)
      .map((c) => c.name);

    const result: PreflightCheckResult = {
      passed: missingRequired.length === 0,
      dependencies: checks,
      missingRequired,
      timestamp: new Date(),
    };

    if (result.passed) {
      logger.info("Preflight checks passed", { dependencies: checks.length });
    } else {
      logger.warn("Preflight checks failed", { missingRequired });
    }

    return result;
  }

  /**
   * Checks if chrome-devtools-mcp is configured in ~/.claude/user-mcps.json
   */
  async checkChromeDevTools(): Promise<DependencyStatus> {
    const name = "chrome-devtools-mcp";

    try {
      if (!existsSync(this.userMcpsPath)) {
        return {
          name,
          required: true,
          available: false,
          error: `Config file not found: ${this.userMcpsPath}`,
          installCommand: this.getChromeDevToolsInstallCommand(),
        };
      }

      const content = readFileSync(this.userMcpsPath, "utf-8");
      let config: { mcpServers?: Record<string, unknown> };

      try {
        config = JSON.parse(content);
      } catch {
        return {
          name,
          required: true,
          available: false,
          error: `Failed to parse ${this.userMcpsPath}: Invalid JSON`,
          installCommand: this.getChromeDevToolsInstallCommand(),
        };
      }

      // Check for chrome-devtools in any form
      const mcpServers = config.mcpServers || {};
      const hasChromeDevTools = Object.keys(mcpServers).some(
        (key) =>
          key.includes("chrome-devtools") ||
          key.includes("chrome_devtools") ||
          key.includes("chromedevtools"),
      );

      if (hasChromeDevTools) {
        logger.debug("chrome-devtools-mcp found in user-mcps.json");
        return {
          name,
          required: true,
          available: true,
        };
      }

      return {
        name,
        required: true,
        available: false,
        installCommand: this.getChromeDevToolsInstallCommand(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        name,
        required: true,
        available: false,
        error: errorMessage,
        installCommand: this.getChromeDevToolsInstallCommand(),
      };
    }
  }

  /**
   * Checks if Chrome browser is installed on the system
   */
  async checkChromeBrowser(): Promise<DependencyStatus> {
    const name = "chrome-browser";
    const currentPlatform = platform();
    const paths = CHROME_PATHS[currentPlatform] || [];

    for (const chromePath of paths) {
      if (existsSync(chromePath)) {
        logger.debug("Chrome browser found", { path: chromePath });
        return {
          name,
          required: true,
          available: true,
          version: chromePath,
        };
      }
    }

    return {
      name,
      required: true,
      available: false,
      installCommand: this.getChromeInstallCommand(currentPlatform),
    };
  }

  /**
   * Checks and creates ~/.thesun/ directory structure if needed
   */
  async checkThesunDirectory(): Promise<DependencyStatus> {
    const name = "thesun-directory";

    try {
      // Check if main directory exists
      const mainDirExists = existsSync(this.thesunDir);

      if (!mainDirExists) {
        // Create main directory and all subdirectories
        mkdirSync(this.thesunDir, { recursive: true });
        logger.info("Created thesun directory", { path: this.thesunDir });
      }

      // Create all subdirectories
      for (const subdir of THESUN_SUBDIRS) {
        const subdirPath = join(this.thesunDir, subdir);
        if (!existsSync(subdirPath)) {
          mkdirSync(subdirPath, { recursive: true });
          logger.debug("Created subdirectory", { path: subdirPath });
        }
      }

      return {
        name,
        required: true,
        available: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to create thesun directory", {
        error: errorMessage,
      });
      return {
        name,
        required: true,
        available: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Formats missing dependencies into a user-friendly error message
   */
  formatMissingDependencies(result: PreflightCheckResult): string {
    if (result.passed || result.missingRequired.length === 0) {
      return "";
    }

    const lines = [
      "Missing required dependencies for browser-enhanced mode:",
      "",
    ];

    for (const dep of result.dependencies) {
      if (!dep.available && dep.required) {
        lines.push(`  - ${dep.name}`);
        if (dep.error) {
          lines.push(`    Error: ${dep.error}`);
        }
        if (dep.installCommand) {
          lines.push(`    Install: ${dep.installCommand}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  /**
   * Returns the install command for chrome-devtools-mcp
   */
  private getChromeDevToolsInstallCommand(): string {
    return "See https://github.com/anthropics/mcp-servers/tree/main/chrome-devtools-mcp for installation instructions";
  }

  /**
   * Returns the platform-specific Chrome install command
   */
  private getChromeInstallCommand(currentPlatform: string): string {
    switch (currentPlatform) {
      case "darwin":
        return "brew install --cask google-chrome";
      case "linux":
        return "sudo apt install google-chrome-stable (or your distro's package manager)";
      case "win32":
        return "Download from https://www.google.com/chrome/";
      default:
        return "Download from https://www.google.com/chrome/";
    }
  }
}

// Singleton instance
let instance: DependencyChecker | null = null;

/**
 * Returns the singleton DependencyChecker instance
 */
export function getDependencyChecker(): DependencyChecker {
  if (!instance) {
    instance = new DependencyChecker();
  }
  return instance;
}
