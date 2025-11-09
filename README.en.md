# FAQC-light-TS

**Fast-Acting Quality Context — TypeScript lightweight framework**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Docs: EN](https://img.shields.io/badge/Docs-EN-brightgreen)](#)
[![Docs: JP](https://img.shields.io/badge/Docs-JP-lightgrey)](README.md)

English | 日本語版: [README.md](README.md)

---

## Table of contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [How to use this README](#how-to-use-this-readme)
- [Quick start](#quick-start)
- [npm scripts](#npm-scripts)
- [Project structure](#project-structure)
- [Basic development flow](#basic-development-flow)
- [Prompts for quality management](#prompts-for-quality-management)
- [Common scenarios](#common-scenarios)
- [Quality policies](#quality-policies)
- [Troubleshooting](#troubleshooting)
- [Advanced usage](#advanced-usage)
- [Prompt best practices](#prompt-best-practices)
- [Thread splitting and handoff in practice](#thread-splitting-and-handoff-in-practice)
- [Code of Conduct](#code-of-conduct)
- [Security](#security)
- [License](#license)

---

## Overview

FAQC-light-TS is a TypeScript project framework that enables quality-driven development together with an AI co‑developer (LLM). It keeps a consistent quality bar from design to implementation and reduces rework by understanding the quality context before code generation.

### Key features

- **Automated quality gate**: ESLint, TypeScript type checking, policy verification, and tests executed by the AI agent
- **Quality context visibility**: The AI reads quality rules and auto-generates detailed reports
- **Strict policy checks**: Anti-MVP, type safety, documentation rules, and more, verified in advance
- **SPEC-and-DESIGN driven**: Clear flow to implement only after the spec is written down
- **Prompt-based development**: Move forward in natural language while preserving quality

---

## Prerequisites

### Required environment

- **Node.js**: 18 LTS or later (recommended: current LTS)
- **npm**: bundled with Node.js
- **Cursor IDE**: This framework assumes Cursor’s AI agent features

### Designed for Cursor

The `.cursorrules` file configures Cursor’s AI agent to:

- Read and reference the quality gate context
- Follow the SPEC-and-DESIGN (SnD) driven development flow
- Auto-run the playbooks (PRE-COMMON, PRE-SnD, PRE-IMPL)
- Diagnose and propose fixes on quality gate failures
- Enforce comment/documentation conventions

### Using outside Cursor

When using another AI agent (GitHub Copilot or other LLM tools):

1. **Convert `.cursorrules` to your environment**
   - `.cursorrules` defines project-wide policies and workflows
   - Convert it to the config format your AI tool understands
   - Focus especially on:
     - `paths` (directory structure)
     - `quality_gate` (auto-running the gate)
     - `agent_phase` (phase switching rules)
     - `guardrails` (pre-implementation safety rails)

2. **Reference the playbooks manually**
   - Ask the agent to explicitly read `vibecoding/docs/PLAYBOOK/`
   - Cursor references them automatically; other tools may require explicit prompts

3. **Load the quality context explicitly**
   - After generating `vibecoding/var/contexts/qualities/**/context.md`, instruct the agent to reference it
   - Cursor does this automatically during PRE-COMMON; others may not

4. **Manage phases explicitly**
   - Switch from “Design” to “Implementation” explicitly
   - Use the trigger phrases like `PHASE=IMPL 承認: SnD=<path>` (Japanese) or `PHASE=IMPL APPROVE: SnD=<path>` (English)

### Recommended environment

We strongly recommend using **Cursor IDE** for this repository. The automation configured in `.cursorrules` makes the quality-driven flow seamless.

---

## How to use this README

This document explains how you should instruct the AI agent (LLM). Each section contains “prompt examples” you can copy and paste as-is.

Note: This repository may exclude `README.md` from the AI context via `.cursorignore` to avoid confusion and save context window. If you temporarily need to include it for experiments, edit `.cursorignore` accordingly.

### ⚠️ Important: On the stochastic nature of LLMs

The behaviors described here are expected patterns driven by `.cursorrules` and playbooks. However, LLMs are probabilistic systems. You may see deviations. Keep in mind:

- The AI may act differently than expected
- Prompt interpretation can diverge from your intention
- The same prompt can produce different results depending on context and model state

If behavior deviates, rephrase prompts more concretely, break tasks into steps, or explicitly reference the relevant `.cursorrules` sections.

---

## Quick start

### First-time setup

Prompt example:
```
Please run the initial setup for this project.
Install dependencies and initialize the quality context.
```

The AI will:
- Install dependencies via `npm install`
- Generate the quality context via `npm run check:pre-common`
- Run the initial quality gate to validate the environment

Run manually (outside Cursor or when needed):

```bash
npm install
npm run check:pre-common
npm run check
```

---

## npm scripts

| Script | Description |
|---|---|
| `npm run check` | Unified quality gate (policy verification, typecheck, lint, tests) |
| `npm run check:fast` | Faster version of the quality gate (reduced scope) |
| `npm run check:pre-common` | Run PRE-COMMON. Generate/update detailed quality context |
| `npm run typecheck` | TypeScript typecheck (uses `qualities/tsconfig`) |
| `npm run lint` | ESLint (uses `qualities/eslint` as SoT) |
| `npm run test` | Run tests (vitest) |
| `npm run verify:policy` | Verify key policies (Anti-MVP, no_relaxation) |

---

## Project structure

```
FAQC-light-TS/
├── qualities/                  # Single source of truth for quality gate
│   ├── check-steps.ts          # Gate execution order
│   ├── eslint/                 # ESLint (5 units)
│   │   ├── 01-module-boundaries/      # Module boundaries
│   │   ├── 02-type-safety/            # Type safety
│   │   ├── 03-documentation/          # Documentation rules
│   │   ├── 04-complexity-and-magic/   # Complexity and magic numbers
│   │   ├── 05-environment-exceptions/ # Environment variable exceptions
│   │   └── plugins/                   # Custom ESLint plugins
│   ├── tsconfig/               # Strict TypeScript settings
│   └── policy/                 # Custom policy checks
│       ├── anti_mvp/           # No legacy debris / silent fallback
│       ├── jsdoc_no_duplicate/ # No duplicate JSDoc
│       ├── no_relaxation/      # No type relaxation
│       └── no_unknown_double_cast/ # No unknown double-cast
│
├── vibecoding/                 # Dev framework
│   ├── docs/PLAYBOOK/          # Playbooks (consumed by AI)
│   │   ├── PRE-COMMON.md       # Updating quality context
│   │   ├── PRE-SnD.md          # Before writing SPEC-and-DESIGN
│   │   └── PRE-IMPL.md         # Before implementation
│   ├── scripts/qualities/      # Quality scripts
│   └── var/
│       ├── contexts/qualities/ # Detailed quality context (AI-generated)
│       └── SPEC-and-DESIGN/    # Specification and design docs
│
├── scripts/qualities/          # Execution scripts
│   └── check.ts                # Unified entry point for quality gate
│
└── tests/                      # Tests
    └── quality/                # Quality verification tests
```

---

## Basic development flow

### 1) Start a new feature

Prompt example:
```
I want to develop a new feature “[feature name]”.
It will [brief description].
Please create a SPEC-and-DESIGN (SnD).
```

What the AI does:
1. Run `PRE-COMMON` to refresh the quality context
2. Create SnD from `vibecoding/docs/PLAYBOOK/_SnD-template.md`
3. Document background, goals, non-goals, design concept, quality gates, acceptance criteria
4. Mark unclear items as “Open Questions” and ask you for input

### 2) Finalize the spec

Prompt example:
```
Here are answers/clarifications for the open questions in the SnD: [your input].
Please update the SnD and mark it Ready.
```

What the AI does:
1. Resolve open questions and update the SnD
2. Record `quality_refresh_hash_at_created`
3. Set SnD `status` to `Ready`
4. Prepare for implementation phase

### 3) Start implementation

Prompt example:
```
PHASE=IMPL APPROVE: SnD=vibecoding/var/SPEC-and-DESIGN/SnD-[date]-[name].md
```

Or a more natural phrasing:
```
Please start implementing “[feature name]”.
Generate code based on the SnD.
```

What the AI does:
1. Run `PRE-IMPL` to confirm pre-implementation quality state
2. Record `quality_refresh_hash_before_impl`
3. Generate code and tests based on the SnD
4. Auto-run the quality gate after generation
5. Report errors with proposed fixes if any

Note on approval phrases:
- Japanese: `PHASE=IMPL 承認: SnD=<path>`, `MAINT=承認: scope=<短文>`, `OUTPUT=CODE 承認`
- English: `PHASE=IMPL APPROVE: SnD=<path>`, `MAINT=APPROVE: scope=<short>`, `OUTPUT=CODE APPROVE`

### 4) Modify existing code

Prompt example:
```
Please modify [file]’s [function/feature].
[Describe the change]
```

What the AI does:
1. If a related SnD exists, it will be referenced; otherwise treated as a small fix
2. If the change is small (within `MAINT=APPROVE` scope), it proceeds directly
3. If large, the AI will propose creating a new SnD

---

## Prompts for quality management

### Run the quality gate

Prompt example:
```
Please run the quality gate.
```

or
```
Please run the code quality checks.
```

The AI will:
- Run policy checks, typecheck, lint, and tests in order
- Report errors and propose fixes

### Update the quality context

Prompt example:
```
Please update the quality context.
```

or
```
Please run PRE-COMMON.
```

The AI will:
1. Run `npm run check:pre-common`
2. Auto-generate missing quality context if needed
3. Update `vibecoding/var/contexts/qualities/**/context.md` (60–100 lines of detail)
4. Clarify Why/Where/What/How per unit

### Run a specific gate only

Prompt examples:
```
Please run typecheck only.
```
```
Please run ESLint only.
```
```
Please verify only the Anti-MVP policy.
```

---

## Common scenarios

### Scenario 1: Add a new utility function

Prompt example:
```
I want to add a new utility function named [fn] under src/utils/.
It will [description].
Please create an SnD and implement it.
```

### Scenario 2: Fix a bug

Prompt example:
```
There’s a bug in [file], function [name].
[Describe the bug]
Please fix it.
```

For small fixes, the AI may modify directly without creating an SnD.

### Scenario 3: Request a code review

Prompt example:
```
Please review the code in [file].
Suggest improvements from a quality gate perspective.
```

What the AI does:
- Analyze code against the quality context
- Flag issues from Anti-MVP, type safety, documentation rules, etc.
- Propose concrete improvements

### Scenario 4: Add tests

Prompt example:
```
Please add tests for [file].
I want to verify [what to test].
```

### Scenario 5: A quality gate failed

Prompt examples:
```
Please show me the details of the last quality gate run.
```
```
I’m seeing this error: “[error message]”.
How can I fix it?
```

---

## Quality policies

### Anti-MVP policy (Important)

Strictly prohibited:

❌
- Silent fallback (swallowing errors)
- Keeping unused legacy code for backward compatibility
- TODO/FIXME without ticket reference
- Prolonged dual-run migration (old/new coexistence)
- Exception-driven control flow (using try/catch as branching for normal cases)

Recommended patterns:

✅
- Explicit error handling (`throw new Error()` or `Result/Either` types)
- Exhaustive enums (use `assertNever()` for exhaustiveness)
- Explicit feature flags (with due date, removal date, ticket number)

The AI always adheres to these policies when generating code.

### Comment convention

Every `src/**/*.ts` file must start with the following header:

```typescript
/**
 * @file One-line purpose of this file
 * Note: Special notes if any (or “none”)
 * - 8–10 bullet lines stating design/quality requirements
 * - ...
 * @see Related doc 1 (at least two)
 * @see Related doc 2
 * @snd Path to related SPEC-and-DESIGN (or “none”)
 */
```

Note: By default, comments are generated in Japanese to match the repository’s locale policy. If you change the locale, comment language follows it.

---

## Troubleshooting

### When the quality gate fails

Prompt example:
```
Please explain why the quality gate failed.
How should I fix it?
```

The AI will:
1. Analyze the error message(s)
2. Reference the relevant quality context (`context.md`)
3. Compare with “failure patterns” and “typical LLM pitfalls”
4. Propose concrete fixes and, if appropriate, apply them

### When an SnD won’t reach Ready

Prompt example:
```
What’s missing to make the SnD Ready?
```

The AI will:
1. Check the “Open Questions” section
2. Ask for missing information
3. Update to Ready once information is complete

### When the AI starts implementing prematurely

Implementation never starts unless ALL conditions are met:

1. SnD exists and `status: Ready`
2. `quality_refresh_hash_at_created` recorded
3. `quality_refresh_hash_before_impl` recorded
4. You explicitly approve implementation (`PHASE=IMPL 承認` or `PHASE=IMPL APPROVE`)

Small-scope exceptions exist only within `MAINT=承認` / `MAINT=APPROVE`.

---

## Advanced usage

### Add a new quality gate

Prompt example:
```
I want to add a new policy “[policy name]”.
It should check [explanation].
Please create the config and script.
```

What the AI does:
1. Create an SnD to clarify the design
2. Add configuration under `qualities/policy/[policy-name]/`
3. Append execution to `qualities/check-steps.ts`
4. Auto-generate the quality context

### Large-scale refactoring

Prompt example:
```
I want to perform [refactoring scope].
Please analyze the impact and create an SnD.
```

What the AI does:
1. Static impact analysis
2. Create a comprehensive SnD (dependencies, migration plan, rollback plan)
3. Implement step-by-step after your approval

### Customize quality criteria

Prompt example:
```
I want to relax/strengthen [specific rule].
The reason is [explanation].
```

What the AI does:
1. Analyze the impact
2. Create an SnD to validate the change
3. Update settings under `qualities/`
4. Regenerate the quality context

---

## Prompt best practices

### ✅ Good prompts

- **Specific**: “Add feature X”, “Modify function Y in file Z”
- **Include reasons**: “We need this because …”
- **Stepwise**: Split large tasks into “Design first → Implement”

Example:
```
I want to add user authentication.
Use JWT tokens and support login, logout, and token verification.
Please create an SnD first.
```

### ❌ Avoid

- **Vague**: “Just improve things”, “Make it better”
- **Multiple asks at once**: “Do A, B, and C altogether” (ask in steps)
- **Ignoring quality**: “It just needs to run” (the quality gate is mandatory)

### Prompt example (Breakout-style game)

```
I want a classic Breakout-style game in TypeScript. Please first create a SPEC-and-DESIGN (SnD), ask me to resolve open questions, and mark it Ready before implementing. Follow Anti-MVP, strong typing, and documentation rules, and make sure the quality gate (check/typecheck/lint/test) is green. Requirements:
- Split blocks: when destroyed, spawn an extra ball at the same position; the new ball’s angle must differ from the original (no identical angles)
- Margins: zero margin between blocks and side walls; top margin between the top wall and the top row equals two block heights
- SFX: bounces, block break, split, stage clear, game over
- Stage: single stage; clearing all blocks shows a flashy ending screen; clicking restarts from initial state with increased ball speed
- Lives: start with 2; after game over, lives reset to 2; when lives reach 0, show a flashy game-over screen with SFX; ball speed resets on game over
- Layout: blocks placed randomly with ~80% density; split blocks are ~30% of all blocks and biased toward the upper area
- Ball: initial launch straight upward; paddle reflection is mirror of incidence but adjusted by hit position and paddle motion
- Angle constraint: forbid near-horizontal shots; clamp so absolute angle from horizontal is always > 20°
- Controls: game is fully playable with mouse only or keyboard only (movement, launch, screen transitions)
- Acceptance: all above is visibly/audibly verifiable; restart increases speed; game over resets speed; lives reinitialize

Once the SnD is Ready, proceed to implementation via the PHASE=IMPL approval flow.
```

Notes:
- We (framework maintainers) use this prompt internally to validate behavior.
- Validated LLM models: gpt-5 / gpt-5-high / Sonnet4.5.
- The “implementation complete” artifact may still contain defects; we fix them through additional conversations.
- From creating the SnD to finishing implementation and fixes, it typically consumes around 15 million tokens (model-dependent).

---

## Tips for collaborating with AI

- Commit/save frequently so you can always roll back on your side.

1. **Don’t rush design**: The AI prioritizes writing an SnD. Ask questions if unclear.
2. **Trust the quality gate**: The AI runs checks automatically. Errors are learning signals.
3. **Proceed stepwise**: Split large features into smaller SnDs.
4. **Provide feedback**: If code isn’t satisfactory, point out specifics.

- It’s fine to ask the AI about the quality gate or to add/remove checks.
  - Prompt examples:
    ```
    I want to review our quality gate composition. Please explain the current check order and purposes, and propose improvements.
    ```
    ```
    I’d like to add a new policy “[policy name]” in addition to Anti-MVP. Please analyze the impact, create an SnD, and then implement.
    ```
    ```
    I have reasons to temporarily relax/remove the rule “[rule name]”. Please validate the rationale, outline risks, and suggest alternatives.
    ```

- It’s also fine to ask about or change `.cursorrules` and the playbooks.
  - Prompt examples:
    ```
    Please explain the relationship between agent_phase and guardrails in .cursorrules. Propose how to add English triggers without reducing safety.
    ```
    ```
    I want to customize the PRE-IMPL steps. Summarize the current steps and create an SnD with acceptance criteria for the proposed changes.
    ```
    ```
    Compare the roles of the playbooks (PRE-COMMON / PRE-SnD / PRE-IMPL), and propose an optimized workflow for my use case.
    ```

---

## Thread splitting and handoff in practice

- **Why**: ensure audit trail and reproducibility, separate scopes, save context, and run PRE-IMPL → IMPL → gate per SnD.
- **How**:
  - Extract remaining tasks/fixes into a new SnD and continue in a separate chat thread.
  - Ask for a self-contained handoff document at `vibecoding/var/SPEC-and-DESIGN/handoff-<slug>.md` for follow-up models.
  - Split threads at “SnD Ready → IMPL”, on large spec changes, or before the thread grows too long.
  - Commit/save on each SnD update, phase switch, and quality gate pass.

**Prompt examples**

- Extract remaining tasks
  ```
  Please extract the remaining tasks into a new SnD and summarize them self‑contained in vibecoding/var/SPEC-and-DESIGN/SnD-<YYYYMMDD>-<slug>.md. Include open questions, acceptance criteria, and next actions.
  ```

- Handoff for a follow-up model
  ```
  To let a follow‑up model continue from here, output a self‑contained handoff at vibecoding/var/SPEC-and-DESIGN/handoff-<slug>.md covering assumptions, decisions, diffs, implementation plan, and acceptance criteria.
  ```

- Phase switch (approval)
  ```
  If the SnD is Ready, move to implementation: PHASE=IMPL APPROVE: SnD=<path>. (Japanese: PHASE=IMPL 承認: SnD=<path>)
  ```

---

## License

MIT License  
Copyright (c) 2025 cozyupk

See [LICENSE](./LICENSE) for details.

---

## Learn more

- `vibecoding/docs/PLAYBOOK/` — Playbooks referenced by the AI
- `qualities/` — Source of truth for quality gate configuration
- `qualities/policy/anti_mvp/anti_mvp_policy.md` — Full Anti-MVP policy

---

## Code of Conduct

This project adheres to a code of conduct (to be added).

## Security

Please report vulnerabilities via private contact rather than public issues: cozyupk2025@gmail.com

---

## Prompt quick reference

| Task | Prompt example |
|---|---|
| New feature | `I want to develop [feature]. Please create an SnD.` |
| Start implementation | `PHASE=IMPL APPROVE: SnD=[path]` or `Please start implementing [feature].` |
| Bug fix | `Please fix [file]: [what to fix].` |
| Add tests | `Please add tests for [file].` |
| Code review | `Please review [file].` |
| Run quality gate | `Please run the quality gate.` |
| Update quality context | `Please update the quality context.` |
| Error resolution | `I see “[error]”. Please help me fix it.` |
| Refactoring | `I want to refactor [scope]. Please create an SnD.` |

---

**Happy Coding with AI! 🚀**


