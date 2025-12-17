# Claude Skills Implementation Plan for Ghost Evaluator v15.1

## Overview

This plan outlines the creation of custom Claude Code skills to improve development workflow for the Ghost Evaluator codebase.

---

## Skills to Implement

### 1. Code Review Skill

**Location:** `.claude/skills/code-review/SKILL.md`

**Purpose:** Review TypeScript code for patterns, type safety, and domain logic consistency.

**Key Instructions:**
- Validate pattern lifecycle transitions (Observing → Active → Broken)
- Check activation threshold logic (70% single, 100% cumulative)
- Enforce type safety in Block, Run, and Pattern interfaces
- Verify session state machine transitions
- Check for proper error handling in engine modules

**Supporting Files:**
- `checklist.md` - Code review checklist specific to Ghost Evaluator
- `common-issues.md` - Known pitfalls and anti-patterns

---

### 2. Testing Skill

**Location:** `.claude/skills/ghost-testing/SKILL.md`

**Purpose:** Generate comprehensive Jest tests for pattern detection, session management, and engine logic.

**Key Instructions:**
- Generate tests for all 12 pattern types
- Create edge case sequences (P1 mode triggers, run boundaries)
- Test session state transitions
- Validate hostility detection thresholds
- Test bait & switch detection logic

**Supporting Files:**
- `test-templates.md` - Jest test templates for common scenarios
- `fixtures/` - Sample block sequences for testing
  - `pattern-triggers.json` - Sequences that trigger each pattern
  - `edge-cases.json` - Boundary condition sequences

---

### 3. Pattern Documentation Skill

**Location:** `.claude/skills/pattern-docs/SKILL.md`

**Purpose:** Keep pattern documentation in sync with code and generate behavior tables.

**Key Instructions:**
- Cross-reference `Evaluator_Rulebook_v15_1.md` with actual code
- Generate pattern activation tables
- Document run-length triggers for each pattern
- Explain lifecycle state transitions with examples
- Update docs when pattern logic changes

**Supporting Files:**
- `pattern-template.md` - Template for documenting a pattern
- `sync-checklist.md` - Checklist for doc/code synchronization

---

### 4. Refactoring Skill

**Location:** `.claude/skills/refactor-guide/SKILL.md`

**Purpose:** Guide safe refactoring of engine modules while preserving domain logic.

**Key Instructions:**
- Identify dependencies before refactoring
- Preserve state machine invariants
- Maintain backwards compatibility with session files
- Update tests alongside refactored code
- Document breaking changes

**Supporting Files:**
- `dependency-map.md` - Module dependency overview
- `safe-patterns.md` - Safe refactoring patterns for this codebase

---

### 5. Session Debug Skill

**Location:** `.claude/skills/session-debug/SKILL.md`

**Purpose:** Analyze session logs and trade history to diagnose unexpected behavior.

**Key Instructions:**
- Parse session JSON files from `data/sessions/`
- Trace pattern activation/deactivation events
- Identify win rate anomalies
- Check hostility score accumulation
- Analyze bait & switch indicators
- Compare expected vs actual trade outcomes

**Supporting Files:**
- `analysis-queries.md` - Common diagnostic queries
- `scripts/session-analyzer.ts` - Helper script for session analysis

---

## Implementation Order

| Priority | Skill | Rationale |
|----------|-------|-----------|
| 1 | ghost-testing | Tests enable safe development |
| 2 | code-review | Quality gates before merging |
| 3 | session-debug | Critical for diagnosing live issues |
| 4 | pattern-docs | Keeps team aligned on behavior |
| 5 | refactor-guide | Needed when codebase evolves |

---

## Directory Structure After Implementation

```
.claude/
└── skills/
    ├── code-review/
    │   ├── SKILL.md
    │   ├── checklist.md
    │   └── common-issues.md
    ├── ghost-testing/
    │   ├── SKILL.md
    │   ├── test-templates.md
    │   └── fixtures/
    │       ├── pattern-triggers.json
    │       └── edge-cases.json
    ├── pattern-docs/
    │   ├── SKILL.md
    │   ├── pattern-template.md
    │   └── sync-checklist.md
    ├── refactor-guide/
    │   ├── SKILL.md
    │   ├── dependency-map.md
    │   └── safe-patterns.md
    └── session-debug/
        ├── SKILL.md
        ├── analysis-queries.md
        └── scripts/
            └── session-analyzer.ts
```

---

## Estimated Effort Per Skill

| Skill | Files | Complexity |
|-------|-------|------------|
| code-review | 3 | Low |
| ghost-testing | 4+ | Medium |
| pattern-docs | 3 | Low |
| refactor-guide | 3 | Medium |
| session-debug | 3+ | Medium-High |

---

## Next Steps

When ready to implement:
1. Run `mkdir -p .claude/skills`
2. Start with **ghost-testing** skill (Priority 1)
3. Create SKILL.md with proper YAML frontmatter
4. Add supporting files as needed
5. Test skill activation with relevant prompts
6. Iterate based on usage

---

## Notes

- Skills are automatically discovered by Claude Code
- Good descriptions are critical for automatic activation
- Keep skills focused on single responsibilities
- Update skills as codebase evolves
