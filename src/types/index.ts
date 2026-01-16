/**
 * Core type definitions for thesun platform
 */

import { z } from 'zod';

// ============================================================================
// Tool Definition
// ============================================================================

export const ToolSpecSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().optional(),
  description: z.string(),
  vendor: z.string().optional(),
  category: z.enum(['observability', 'security', 'devops', 'data', 'communication', 'other']),
  authType: z.enum(['oauth2', 'api_key', 'basic', 'bearer', 'custom', 'none']),
  specSources: z.array(z.object({
    type: z.enum(['openapi', 'swagger', 'graphql', 'grpc', 'custom']),
    url: z.string().url().optional(),
    path: z.string().optional(),
  })).optional(),
  docUrls: z.array(z.string().url()).optional(),
  existingMcps: z.array(z.string().url()).optional(),
});

export type ToolSpec = z.infer<typeof ToolSpecSchema>;

// ============================================================================
// Build State Machine
// ============================================================================

export const BuildPhase = {
  PENDING: 'pending',
  DISCOVERING: 'discovering',
  GENERATING: 'generating',
  TESTING: 'testing',
  SECURITY_SCAN: 'security_scan',
  OPTIMIZING: 'optimizing',
  VALIDATING: 'validating',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type BuildPhase = typeof BuildPhase[keyof typeof BuildPhase];

export const BuildStateSchema = z.object({
  id: z.string().uuid(),
  toolName: z.string(),
  phase: z.enum([
    'pending', 'discovering', 'generating', 'testing',
    'security_scan', 'optimizing', 'validating', 'completed', 'failed'
  ]),
  bobInstanceId: z.string().uuid().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),

  // Discovery results
  discovery: z.object({
    endpoints: z.number().default(0),
    specFiles: z.array(z.string()).default([]),
    authMethods: z.array(z.string()).default([]),
    gaps: z.array(z.string()).default([]),
  }).optional(),

  // Generation results
  generation: z.object({
    toolsGenerated: z.number().default(0),
    filesCreated: z.array(z.string()).default([]),
    templateUsed: z.string().optional(),
  }).optional(),

  // Test results
  testing: z.object({
    totalTests: z.number().default(0),
    passed: z.number().default(0),
    failed: z.number().default(0),
    coverage: z.number().default(0),
    iterations: z.number().default(0),
  }).optional(),

  // Security results
  security: z.object({
    sastIssues: z.number().default(0),
    criticalCves: z.number().default(0),
    secretsDetected: z.number().default(0),
    passed: z.boolean().default(false),
  }).optional(),

  // Performance metrics
  performance: z.object({
    startupTimeMs: z.number().optional(),
    avgRequestTimeMs: z.number().optional(),
    memoryUsageMb: z.number().optional(),
  }).optional(),
});

export type BuildState = z.infer<typeof BuildStateSchema>;

// ============================================================================
// Bob Instance
// ============================================================================

export const BobInstanceSchema = z.object({
  id: z.string().uuid(),
  toolName: z.string(),
  workspace: z.string(),
  env: z.record(z.string()),
  status: z.enum(['creating', 'running', 'stopped', 'destroyed']),
  createdAt: z.date(),
  lastActivityAt: z.date().optional(),
  pid: z.number().optional(),
});

export type BobInstance = z.infer<typeof BobInstanceSchema>;

// ============================================================================
// Discovery Types
// ============================================================================

export const DiscoveredEndpointSchema = z.object({
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
  operationId: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  parameters: z.array(z.object({
    name: z.string(),
    in: z.enum(['path', 'query', 'header', 'cookie']),
    required: z.boolean().default(false),
    schema: z.unknown().optional(),
  })).default([]),
  requestBody: z.unknown().optional(),
  responses: z.record(z.unknown()).optional(),
  security: z.array(z.unknown()).optional(),
  pagination: z.object({
    supported: z.boolean(),
    style: z.enum(['offset', 'cursor', 'page', 'link']).optional(),
    params: z.array(z.string()).optional(),
  }).optional(),
});

export type DiscoveredEndpoint = z.infer<typeof DiscoveredEndpointSchema>;

export const DiscoveryResultSchema = z.object({
  toolName: z.string(),
  timestamp: z.date(),
  specVersion: z.string().optional(),
  baseUrl: z.string().url().optional(),
  endpoints: z.array(DiscoveredEndpointSchema),
  authSchemes: z.array(z.object({
    type: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })).default([]),
  globalParameters: z.array(z.unknown()).default([]),
  rateLimits: z.object({
    requestsPerSecond: z.number().optional(),
    requestsPerMinute: z.number().optional(),
    requestsPerDay: z.number().optional(),
  }).optional(),
  existingMcpAnalysis: z.object({
    found: z.boolean(),
    url: z.string().optional(),
    coverage: z.number().optional(),
    gaps: z.array(z.string()).optional(),
  }).optional(),
});

export type DiscoveryResult = z.infer<typeof DiscoveryResultSchema>;

// ============================================================================
// Security Types
// ============================================================================

export const SecurityFindingSchema = z.object({
  id: z.string(),
  type: z.enum(['sast', 'dependency', 'secret', 'config']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  description: z.string(),
  file: z.string().optional(),
  line: z.number().optional(),
  cwe: z.string().optional(),
  cve: z.string().optional(),
  remediation: z.string().optional(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const SecurityReportSchema = z.object({
  toolName: z.string(),
  timestamp: z.date(),
  passed: z.boolean(),
  findings: z.array(SecurityFindingSchema),
  summary: z.object({
    critical: z.number().default(0),
    high: z.number().default(0),
    medium: z.number().default(0),
    low: z.number().default(0),
    info: z.number().default(0),
  }),
});

export type SecurityReport = z.infer<typeof SecurityReportSchema>;

// ============================================================================
// Workflow Types
// ============================================================================

export const WorkflowTriggerSchema = z.object({
  type: z.enum(['jira_issue', 'schedule', 'webhook', 'manual', 'dependency_update']),
  config: z.record(z.unknown()),
});

export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

export const WorkflowStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['mcp_call', 'script', 'approval', 'notification', 'condition']),
  config: z.record(z.unknown()),
  onSuccess: z.string().optional(),
  onFailure: z.string().optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  triggers: z.array(WorkflowTriggerSchema),
  steps: z.array(WorkflowStepSchema),
  timeout: z.number().optional(),
  retries: z.number().default(0),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ============================================================================
// Orchestrator Config
// ============================================================================

export const OrchestratorConfigSchema = z.object({
  dataDir: z.string(),
  workspace: z.string(),
  maxParallelBuilds: z.number().default(4),
  bobIsolationMode: z.enum(['process', 'container', 'vm']).default('process'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  securityGates: z.object({
    blockOnCriticalSast: z.boolean().default(true),
    blockOnCriticalCve: z.boolean().default(true),
    blockOnSecrets: z.boolean().default(true),
    minCoverage: z.number().default(70),
  }).default({}),
  feedbackLoops: z.object({
    maxTestIterations: z.number().default(5),
    maxOptimizationIterations: z.number().default(3),
    performanceThresholdMs: z.number().default(100),
  }).default({}),
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;
