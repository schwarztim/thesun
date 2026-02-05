---
name: optimize-mcp-creation
description: Fully autonomous MCP creation pipeline. Single invocation — researches API ecosystem, designs task-oriented tools, generates via thesun, scores quality, auto-fixes until passing. THE default for all MCP creation.
---

# Optimize MCP Creation

**THE single entry point for all MCP creation.** One invocation, fully autonomous. No manual phase transitions.

When a user says "create an MCP for X", "use thesun for X", or any variant — this skill runs automatically. It selects the best approach, executes it, and delivers a scored, validated MCP.

## Invocation

When this skill activates, execute the **entire pipeline below autonomously**. Do not stop between phases. Do not ask for confirmation between phases. Run to completion.

```
INPUT: {target} — the API/service name
CONTEXT: {path to file/dir} — optional enriching data (OpenAPI spec, API docs, requirements, tool designs, existing code)
OUTPUT: A registered, scored, quality-gated MCP at ~/Scripts/mcp-servers/{target}-mcp
```

---

## THE PIPELINE

### Phase 0: Read Context (if provided)

If a context file or directory was provided, read it BEFORE any research:

1. **Classify each file** by type:
   - `.yaml`, `.json` with `openapi` or `swagger` key → OpenAPI spec
   - `.md`, `.txt` with `## Tools Required` → User-specified tool design (authoritative)
   - `.md`, `.txt` with `## Auth` → Requirements document (hard constraints)
   - `.md`, `.txt`, `.pdf`, `.html` otherwise → Supplemental API docs
   - Directory with `src/`, `package.json` → Existing code to use as reference
   - URL starting with `http` → Fetch and classify as above

2. **Stage the context** for the optimizer:
   - OpenAPI spec → Copy to `~/.thesun/blueprints/{target}-openapi.yaml`
   - Tool design → Will be included verbatim in blueprint as "## Tool Design (User-Specified)"
   - Requirements → Passed as hard constraints to the optimizer
   - API docs → Passed as supplemental context to research subagents
   - Existing code → Passed as reference template to the optimizer

3. **Determine what research to skip**:
   - OpenAPI spec provided → Skip spec discovery subagent
   - Tool design provided → Skip tool design intelligence step (Step 2.5)
   - Auth details provided → Skip auth research subagent (validate only)
   - Full requirements provided → Research becomes validation, not discovery

### Phase 1: Intelligence Gathering (mcp-optimizer PRE mode)

Spawn the mcp-optimizer agent to research and produce a blueprint. This runs autonomously with 5 parallel research subagents (some may be skipped if context was provided).

```
<Task subagent_type="mcp-optimizer" model="opus">
MODE: PRE-GENERATION
TARGET: {target}
CONTEXT_FILES: {list of staged context files, or "none"}
USER_TOOL_DESIGN: {contents of tool design file if provided, or "none"}
USER_REQUIREMENTS: {contents of requirements file if provided, or "none"}
OPENAPI_SPEC: {path to staged spec if provided, or "none"}

Execute full pre-generation intelligence:
1. Read ~/.thesun/knowledge/ for prior builds, gotchas, failures
2. Read any provided context files
3. Run parallel research subagents (skip those covered by context):
   a. OpenAPI spec discovery (SKIP if spec provided)
   b. Authentication methods (VALIDATE ONLY if auth details provided)
   c. Existing MCP implementations
   d. API complexity assessment
   e. Tool ecosystem & surface area (CLIs, SDKs, GraphQL, Terraform)
4. Design task-oriented tool inventory — OR use user-specified design if provided
5. Match against known patterns
6. Select reference template
7. Auto-select mode: CREATE / FIX / BATCH
8. Write blueprint to ~/.thesun/blueprints/{target}-blueprint.md
   - Include user-specified tool design verbatim under "## Tool Design (User-Specified)" if provided
   - Include user requirements verbatim under "## Requirements (User-Specified)" if provided
9. Determine credential strategy

Return:
- Blueprint path
- Selected mode (CREATE/FIX/BATCH)
- Key findings (1 paragraph)
- Confidence level
- Any blockers
- What context was used vs what was researched
</Task>
```

**Do not wait for user review.** Proceed immediately to Phase 2 with the blueprint.

### Phase 2: Execute Generation

Based on the mode selected in Phase 1:

**If CREATE or BATCH:**

```
thesun({ target: "{target}" })
```

**If FIX** (existing MCP found that needs repair):

```
thesun({ target: "{target}", fix: "~/Scripts/mcp-servers/{target}-mcp" })
```

The mcp-builder agent will automatically detect and consume the blueprint at `~/.thesun/blueprints/{target}-blueprint.md`. It uses it to:

- Skip redundant discovery (auth, pagination, base URL already known)
- Follow reference patterns for client initialization and error handling
- Apply known workarounds proactively from gotchas.json
- Implement the tool inventory from the blueprint (task-oriented, not endpoint-oriented)
- Use the best surface per operation (SDK over REST when superior, CLI for complex workflows)
- Target the endpoint coverage specified in the blueprint

### Phase 3: Quality Gate (mcp-optimizer POST mode)

Immediately after generation completes, score the output.

```
<Task subagent_type="mcp-optimizer" model="opus">
MODE: POST-GENERATION
TARGET: {target}
OUTPUT_DIR: ~/Scripts/mcp-servers/{target}-mcp

Execute full post-generation assessment:
1. Run 6 parallel quality checks (structure, build, architecture, performance, security+docs, tool design)
2. Score against 100-point base rubric + 20-point tool design bonus
3. Compare against blueprint expectations
4. Compare against reference MCP patterns
5. Update ~/.thesun/knowledge/ with results
6. Return verdict and score

Return:
- Total score (0-100) and grade (A-F)
- Tool design score (0-20)
- Verdict: APPROVE / AUTO-FIX / MANUAL-REVIEW
- Specific issues list (if any)
</Task>
```

### Phase 4: Auto-Fix Loop (conditional, up to 2 iterations)

**If verdict is AUTO-FIX (score 60-74):**

```
thesun({ target: "{target}", fix: "~/Scripts/mcp-servers/{target}-mcp" })
```

Then re-run Phase 3. Maximum 2 fix iterations.

**If verdict is APPROVE (score ≥ 75):** Skip to Phase 5.

**If verdict is MANUAL-REVIEW or REBUILD (score < 60):** Stop, report findings, and ask user how to proceed. This is the ONLY case where the pipeline pauses.

### Phase 5: Report

Output a final summary:

```
## MCP Created: {target}-mcp

**Score**: {score}/100 (Grade {grade}) | Tool Design: {tool_score}/20
**Path**: ~/Scripts/mcp-servers/{target}-mcp
**Tools**: {count} tools ({list of tool names})
**Auth**: {auth_type} via {storage_method}
**Fix iterations**: {0-2}

### What it can do
{2-3 sentences describing the MCP's capabilities in terms of what tasks
an AI agent can accomplish with it}

### Key decisions made
- {decision 1 with rationale}
- {decision 2 with rationale}
```

---

## Decision Logic (Automatic — No User Input Required)

The skill auto-selects the best approach without asking:

| Situation                                       | Decision                           | Rationale                                 |
| ----------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| No existing MCP at output path                  | CREATE                             | Fresh build                               |
| Existing MCP at output path, score < 40         | CREATE (overwrite)                 | Too broken to fix                         |
| Existing MCP at output path, score ≥ 40         | FIX                                | Cheaper than rebuilding                   |
| Multiple targets in comma-separated input       | BATCH                              | Parallel via bob instances                |
| Prior build in quality-scores.json scored ≥ 85  | CREATE (refresh)                   | Good foundation, update to latest         |
| Known gotchas for this API with severity "high" | Auto-apply workarounds             | Blueprint includes them                   |
| Official SDK exists on npm                      | Use SDK as primary surface         | More reliable than raw REST               |
| CLI tool exists                                 | Evaluate CLI vs REST per operation | CLI wins for complex multi-step workflows |

---

## Tool Design Principles (Enforced Automatically)

These are applied during blueprint generation (Phase 1) and verified during scoring (Phase 3). They are non-negotiable.

1. **Task-oriented, not endpoint-oriented** — Tools are named for what an AI agent wants to DO.
   - GOOD: `investigate_host`, `deploy_certificate`, `approve_change_request`
   - BAD: `get_api_v1_hosts`, `post_certificates`, `patch_change_12345`

2. **Marry all surfaces** — REST, SDK, CLI, GraphQL are all inputs. The tool uses whichever surface is best per operation. An MCP for AWS should use the AWS SDK, not raw REST. An MCP for Akamai should use the `akamai-edgegrid` package, not manual HMAC signing.

3. **No thin wrappers** — Every tool does meaningful work:
   - Handles pagination internally (returns all results)
   - Filters/formats responses for AI consumption
   - Composes multiple API calls when the task requires it
   - Provides actionable error messages

4. **Auth-aware grouping** — Tools that need different permission scopes are clearly documented. A read-only tool never silently fails because it tried a write endpoint.

5. **AI-relevant descriptions** — Tool descriptions say what you can ACCOMPLISH, not how the API works. "Find all hosts that match a threat indicator and return their risk summary" not "Query the /hosts endpoint with filter parameters".

---

## Quality Rubric (100 Base + 20 Bonus)

### Base Score (100 pts)

| Category        | Points | Key Checks                                                               |
| --------------- | ------ | ------------------------------------------------------------------------ |
| Structure       | 20     | package.json, entry point, README, .env.example                          |
| Build Quality   | 20     | Build passes, tests pass, coverage ≥ 70%                                 |
| Architecture    | 25     | Connection pooling, singleton client, token cache, graceful startup, Zod |
| Performance     | 15     | No shell spawning, batch ops, response caching                           |
| Security + Docs | 20     | No secrets, npm audit clean, CLAUDE.md, coverage report                  |

### Tool Design Bonus (20 pts)

| Check                              | Points |
| ---------------------------------- | ------ |
| Task-oriented naming               | 5      |
| Internal pagination                | 3      |
| Composite workflows (2+ API calls) | 4      |
| No thin wrappers                   | 3      |
| SDK/CLI usage where superior       | 3      |
| AI-relevant descriptions           | 2      |

### Score Thresholds

| Score  | Grade | Pipeline Action                      |
| ------ | ----- | ------------------------------------ |
| 90-100 | A     | APPROVE — done                       |
| 75-89  | B     | APPROVE with notes                   |
| 60-74  | C     | AUTO-FIX — fix and re-score (max 2x) |
| 40-59  | D     | MANUAL-REVIEW — stop and report      |
| 0-39   | F     | REBUILD — report failure, ask user   |

**Tool design override:** If base score ≥ 75 but tool design bonus < 10, force MANUAL-REVIEW. Good architecture with bad tools is useless for AI agents.

---

## Credential Strategy (Applied Automatically)

The optimizer auto-selects credential storage based on auth type. No user input needed unless auth requires browser-based capture.

| Auth Type                 | Auto-Selected Strategy          | Storage                                            |
| ------------------------- | ------------------------------- | -------------------------------------------------- |
| API Key                   | Env var                         | user-mcps.json `"env"` block                       |
| Bearer Token              | Env var                         | user-mcps.json `"env"` block                       |
| OAuth2 Client Credentials | Credential file                 | `~/.thesun/credentials/{target}.env`               |
| OAuth2 Auth Code          | Browser capture → refresh token | `~/.thesun/credentials/{target}.env` + `/sun-auth` |
| SSO / Browser             | Playwright cookies              | `~/.{target}-mcp/cookies.json`                     |
| EdgeGrid                  | Standard edgerc                 | `~/.edgerc`                                        |
| AWS SigV4                 | AWS credential chain            | `~/.aws/credentials` or env vars                   |
| Corporate SSO             | Centralized env vars            | `~/.secrets.zsh` → `$CORP_*`                       |
| macOS Keychain            | security command                | Keychain Access                                    |

---

## Knowledge Base

All accumulated intelligence at `~/.thesun/knowledge/`. Self-initializing, grows with every build.

```
~/.thesun/knowledge/
├── patterns.json         # 18+ API patterns (auth, pagination, errors)
├── failures.json         # Past failures and resolutions
├── gotchas.json          # API-specific quirks (seeded for ServiceNow, Akamai, AWS, MS365, CrowdStrike, Venafi, Tufin)
├── quality-scores.json   # Historical scores — enables "is this API getting better?"
├── reference-map.json    # Which existing MCP to use as template
└── blueprints/           # Persistent blueprint docs (survive interruptions)
```

Every build — success or failure — writes back to the knowledge base. The more MCPs you build, the smarter the optimizer gets.
