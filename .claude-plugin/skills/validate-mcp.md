---
name: validate-mcp
description: Validate an MCP server and return a quality score without modifying it
---

# Validate MCP Skill

Validate an existing MCP server and return a comprehensive quality report. Does NOT modify any files - read-only validation.

## When to Use

- "Validate the {tool} MCP"
- "Check if the {tool} MCP meets quality standards"
- "Audit the {tool} MCP"
- "What's the quality score for {path/to/mcp}?"
- "Does this MCP have all required components?"

## When NOT to Use

- If you want to actually fix issues → use `fix-mcp` skill instead
- If you want to generate a new MCP → use `generate-mcp` skill

## Validation Checks

All checks run in **parallel** for efficiency:

### Required Files
- ✅ package.json exists and is valid
- ✅ Entry point (src/index.ts) exists
- ✅ README.md exists
- ✅ .env.example exists with all required variables
- ✅ Test files exist (src/**/*.test.ts)

### Build Quality
- ✅ `npm run build` passes
- ✅ `npm test` passes
- ✅ No TypeScript errors

### Runtime Behavior
- ✅ **Graceful startup** - MCP starts without credentials configured
- ✅ Tools are listed even without authentication

### Repository
- ✅ Git initialized
- ✅ Remote configured (GitHub)

## Invocation

To validate an MCP, use the Task tool with the Explore agent:

```
<Task subagent_type="Explore">
Validate the MCP at {path/to/mcp}:

1. Check if all required files exist:
   - package.json
   - src/index.ts
   - README.md
   - .env.example
   - Test files

2. Run validation commands:
   - npm run build (check for errors)
   - npm test (check for failures)
   - node -e "require('./dist/index.js')" with timeout (check graceful startup)

3. Check git status:
   - Is git initialized?
   - Is remote configured?

Report the score (0-100) and any issues found.
</Task>
```

## Scoring Rubric

| Points | Check |
|--------|-------|
| 10 | package.json exists |
| 10 | Entry point exists |
| 10 | README.md exists |
| 10 | .env.example exists |
| 15 | Build passes |
| 15 | Tests pass |
| 10 | Git initialized |
| 10 | Git remote configured |
| 10 | Graceful startup (no credentials required) |

**Total: 100 points**

## Output Format

```json
{
  "score": 85,
  "grade": "B",
  "checks": {
    "packageJson": true,
    "entryPoint": true,
    "readme": true,
    "envExample": true,
    "buildPasses": true,
    "testsPasses": false,
    "gitInitialized": true,
    "gitRemote": true,
    "gracefulStartup": true
  },
  "issues": [
    "Tests failing: 2 test suites failed"
  ],
  "recommendations": [
    "Fix failing tests before deployment"
  ]
}
```

## Grade Scale

| Score | Grade | Status |
|-------|-------|--------|
| 90-100 | A | Production ready |
| 80-89 | B | Good, minor issues |
| 70-79 | C | Acceptable, needs improvement |
| 60-69 | D | Significant issues |
| 0-59 | F | Major problems, not ready |

## Use Cases

### Pre-deployment Audit
Validate before registering an MCP globally.

### Quality Comparison
Compare scores across multiple MCPs.

### CI/CD Integration
Use validation as a quality gate.

### Progress Tracking
Track improvements over time.
