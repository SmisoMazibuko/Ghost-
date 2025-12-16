/**
 * Ghost Evaluator v15.3 - Dev Assistant
 * ======================================
 * Natural language interface for development commands
 */

import { DevCommand, DevResponse, CommandType } from './types';
import { ChangeTracker } from './change-tracker';
import { RuleManager } from './rule-manager';
import { TestRunner } from './test-runner';
import { PatternName, PATTERN_NAMES } from '../types';

// ============================================================================
// COMMAND PATTERNS
// ============================================================================

interface CommandPattern {
  patterns: RegExp[];
  type: CommandType;
  extractor: (match: RegExpMatchArray, input: string) => Record<string, any>;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  // Explain commands
  {
    patterns: [
      /^explain\s+(rule|pattern|test)\s+(.+)$/i,
      /^what\s+is\s+(the\s+)?(rule|pattern|test)\s+(.+)$/i,
      /^how\s+does\s+(.+)\s+work$/i,
    ],
    type: 'explain',
    extractor: (match, input) => {
      const lower = input.toLowerCase();
      if (lower.includes('rule')) return { target: 'rule', name: match[match.length - 1] };
      if (lower.includes('pattern')) return { target: 'pattern', name: match[match.length - 1] };
      if (lower.includes('test')) return { target: 'test', name: match[match.length - 1] };
      return { target: 'general', query: input };
    },
  },

  // Status commands
  {
    patterns: [
      /^status$/i,
      /^show\s+status$/i,
      /^current\s+state$/i,
      /^what('s|\s+is)\s+(the\s+)?status$/i,
    ],
    type: 'status',
    extractor: () => ({}),
  },

  // History commands
  {
    patterns: [
      /^history$/i,
      /^show\s+history$/i,
      /^recent\s+changes$/i,
      /^what\s+changed$/i,
      /^changelog$/i,
    ],
    type: 'history',
    extractor: () => ({}),
  },

  // Test commands
  {
    patterns: [
      /^run\s+tests?$/i,
      /^test$/i,
      /^run\s+all\s+tests$/i,
      /^test\s+(.+)$/i,
      /^run\s+test\s+(.+)$/i,
    ],
    type: 'test',
    extractor: (match) => ({
      target: match[1] || 'all',
    }),
  },

  // Validate commands
  {
    patterns: [
      /^validate$/i,
      /^validate\s+(.+)$/i,
      /^check\s+(.+)$/i,
    ],
    type: 'validate',
    extractor: (match) => ({
      target: match[1] || 'all',
    }),
  },

  // Suggest commands
  {
    patterns: [
      /^suggest$/i,
      /^suggestions?$/i,
      /^what\s+should\s+i\s+change$/i,
      /^recommendations?$/i,
      /^suggest\s+for\s+(.+)$/i,
    ],
    type: 'suggest',
    extractor: (match) => ({
      target: match[1] || 'general',
    }),
  },

  // Modify commands
  {
    patterns: [
      /^modify\s+(.+)$/i,
      /^change\s+(.+)$/i,
      /^update\s+(.+)$/i,
      /^set\s+(.+)\s+to\s+(.+)$/i,
    ],
    type: 'modify',
    extractor: (match, input) => {
      const setMatch = input.match(/set\s+(.+)\s+to\s+(.+)/i);
      if (setMatch) {
        return { field: setMatch[1], value: setMatch[2] };
      }
      return { target: match[1] };
    },
  },

  // Rollback commands
  {
    patterns: [
      /^rollback$/i,
      /^rollback\s+(.+)$/i,
      /^undo\s+change$/i,
      /^revert$/i,
    ],
    type: 'rollback',
    extractor: (match) => ({
      changeId: match[1],
    }),
  },
];

// ============================================================================
// DEV ASSISTANT CLASS
// ============================================================================

export class DevAssistant {
  private changeTracker: ChangeTracker;
  private ruleManager: RuleManager;
  private testRunner: TestRunner;

  constructor(
    changeTracker: ChangeTracker,
    ruleManager: RuleManager,
    testRunner: TestRunner
  ) {
    this.changeTracker = changeTracker;
    this.ruleManager = ruleManager;
    this.testRunner = testRunner;
  }

  /**
   * Parse natural language input into a command
   */
  parseCommand(input: string): DevCommand | null {
    const trimmed = input.trim();

    for (const { patterns, type, extractor } of COMMAND_PATTERNS) {
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          return {
            type,
            params: extractor(match, trimmed),
            rawInput: input,
          };
        }
      }
    }

    return null;
  }

  /**
   * Execute a command
   */
  executeCommand(command: DevCommand): DevResponse {
    switch (command.type) {
      case 'explain':
        return this.handleExplain(command);
      case 'status':
        return this.handleStatus();
      case 'history':
        return this.handleHistory();
      case 'test':
        return this.handleTest(command);
      case 'validate':
        return this.handleValidate(command);
      case 'suggest':
        return this.handleSuggest(command);
      case 'modify':
        return this.handleModify(command);
      case 'rollback':
        return this.handleRollback(command);
      default:
        return {
          success: false,
          message: 'Unknown command type',
          suggestions: ['Try: status, history, test, explain <topic>, suggest'],
        };
    }
  }

  /**
   * Process natural language input and return response
   */
  process(input: string): DevResponse {
    const command = this.parseCommand(input);

    if (!command) {
      return this.handleUnknown(input);
    }

    return this.executeCommand(command);
  }

  /**
   * Handle explain commands
   */
  private handleExplain(command: DevCommand): DevResponse {
    const { target, name } = command.params || {};

    if (target === 'rule' && name) {
      // Find rule by ID or name
      const rule = this.ruleManager.getRule(name) ||
        this.ruleManager.getActiveRules().find(r =>
          r.name.toLowerCase().includes(name.toLowerCase())
        );

      if (rule) {
        return {
          success: true,
          message: this.ruleManager.explainRule(rule.id),
        };
      }
      return {
        success: false,
        message: `Rule not found: ${name}`,
        suggestions: ['Available rules: ' + this.ruleManager.getActiveRules().map(r => r.name).slice(0, 5).join(', ')],
      };
    }

    if (target === 'pattern' && name) {
      const patternName = name.toUpperCase() as PatternName;
      if (PATTERN_NAMES.includes(patternName)) {
        return {
          success: true,
          message: this.explainPattern(patternName),
        };
      }
      return {
        success: false,
        message: `Pattern not found: ${name}`,
        suggestions: ['Available patterns: ' + PATTERN_NAMES.join(', ')],
      };
    }

    if (target === 'test' && name) {
      const test = this.testRunner.getTest(name);
      if (test) {
        return {
          success: true,
          message: `Test: ${test.name}\n${test.description}\nType: ${test.type}\nPatterns: ${test.patterns.join(', ')}`,
        };
      }
      return {
        success: false,
        message: `Test not found: ${name}`,
      };
    }

    return {
      success: true,
      message: this.getGeneralHelp(),
    };
  }

  /**
   * Handle status commands
   */
  private handleStatus(): DevResponse {
    const changeStats = this.changeTracker.getStatistics();
    const rules = this.ruleManager.getActiveRules();
    const suites = this.testRunner.getAllSuites();

    const lines = [
      '═══════════════════════════════════════════════════════════',
      '           GHOST EVALUATOR - SYSTEM STATUS',
      '═══════════════════════════════════════════════════════════',
      '',
      'CHANGES:',
      `  Total: ${changeStats.total}`,
      `  Pending Approval: ${changeStats.pending}`,
      `  High Impact: ${(changeStats.byImpact.high || 0) + (changeStats.byImpact.critical || 0)}`,
      '',
      'RULES:',
      `  Total: ${rules.length}`,
      `  Enabled: ${rules.filter(r => r.enabled).length}`,
      `  Active Rule Set: ${this.ruleManager.getActiveRuleSet()?.name || 'None'}`,
      '',
      'TESTS:',
      `  Suites: ${suites.length}`,
      `  Total Tests: ${suites.reduce((acc, s) => acc + s.tests.length, 0)}`,
      '',
      '═══════════════════════════════════════════════════════════',
    ];

    return {
      success: true,
      message: lines.join('\n'),
    };
  }

  /**
   * Handle history commands
   */
  private handleHistory(): DevResponse {
    const recent = this.changeTracker.getRecentChanges(10);

    if (recent.length === 0) {
      return {
        success: true,
        message: 'No changes recorded yet.',
        suggestions: ['Make changes to see them tracked here'],
      };
    }

    const lines = [
      'RECENT CHANGES:',
      '───────────────────────────────────────────────────────────',
    ];

    for (const change of recent) {
      const icon = change.approved ? '✓' : '○';
      const impact = change.impact.toUpperCase().padEnd(8);
      lines.push(`${icon} [${impact}] ${change.summary}`);
      lines.push(`  ${change.timestamp} | ${change.category}`);
      if (change.affectedPatterns.length > 0) {
        lines.push(`  Patterns: ${change.affectedPatterns.join(', ')}`);
      }
      lines.push('');
    }

    return {
      success: true,
      message: lines.join('\n'),
    };
  }

  /**
   * Handle test commands
   */
  private handleTest(command: DevCommand): DevResponse {
    const { target } = command.params || {};

    try {
      if (target === 'all' || !target) {
        const reports = this.testRunner.runAllSuites();
        const lines = reports.map(r => this.testRunner.formatReport(r));
        return {
          success: true,
          message: lines.join('\n\n'),
        };
      }

      // Try to find specific test or suite
      const suite = this.testRunner.getSuite(target);
      if (suite) {
        const report = this.testRunner.runSuite(target);
        return {
          success: true,
          message: this.testRunner.formatReport(report),
        };
      }

      const test = this.testRunner.getTest(target);
      if (test) {
        const result = this.testRunner.runTest(test);
        return {
          success: result.status === 'passed',
          message: `Test ${test.name}: ${result.status.toUpperCase()}\n${result.logs.join('\n')}`,
        };
      }

      return {
        success: false,
        message: `Test or suite not found: ${target}`,
        suggestions: ['Run "test" to run all tests'],
      };
    } catch (error) {
      return {
        success: false,
        message: `Test error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Handle validate commands
   */
  private handleValidate(command: DevCommand): DevResponse {
    const { target } = command.params || {};

    if (target === 'all' || target === 'rules') {
      const rules = this.ruleManager.getActiveRules();
      const results: string[] = ['VALIDATION RESULTS:', ''];

      let allValid = true;
      for (const rule of rules) {
        const validation = this.ruleManager.validateRule(rule);
        const icon = validation.valid ? '✓' : '✗';
        results.push(`${icon} ${rule.name}`);

        if (!validation.valid) {
          allValid = false;
          for (const error of validation.errors) {
            results.push(`  ✗ ${error.message}`);
          }
        }
        for (const warning of validation.warnings) {
          results.push(`  ⚠ ${warning.message}`);
        }
      }

      return {
        success: allValid,
        message: results.join('\n'),
        suggestions: allValid ? undefined : ['Fix validation errors before proceeding'],
      };
    }

    return {
      success: true,
      message: 'Validation complete. No issues found.',
    };
  }

  /**
   * Handle suggest commands
   */
  private handleSuggest(_command: DevCommand): DevResponse {
    const suggestions: string[] = [];

    // Check for unapproved changes
    const unapproved = this.changeTracker.getUnapprovedChanges();
    if (unapproved.length > 0) {
      suggestions.push(`Review and approve ${unapproved.length} pending change(s)`);
    }

    // Check for high impact changes
    const highImpact = this.changeTracker.getHighImpactChanges();
    if (highImpact.length > 0) {
      suggestions.push(`${highImpact.length} high-impact change(s) need attention`);
    }

    // Check rule test coverage
    const rules = this.ruleManager.getActiveRules();
    const lowCoverage = rules.filter(r => r.metadata.testCoverage < 70);
    if (lowCoverage.length > 0) {
      suggestions.push(`${lowCoverage.length} rule(s) have low test coverage (<70%)`);
    }

    // Check for disabled rules
    const disabled = rules.filter(r => !r.enabled);
    if (disabled.length > 0) {
      suggestions.push(`${disabled.length} rule(s) are currently disabled`);
    }

    // Run tests and check for failures
    const testReports = this.testRunner.runAllSuites();
    const failedTests = testReports.flatMap(r => r.results.filter(t => t.status === 'failed'));
    if (failedTests.length > 0) {
      suggestions.push(`${failedTests.length} test(s) are failing - review immediately`);
    }

    if (suggestions.length === 0) {
      return {
        success: true,
        message: 'System is in good shape! No immediate actions needed.',
        suggestions: ['Consider adding more tests for better coverage'],
      };
    }

    return {
      success: true,
      message: 'SUGGESTIONS:\n\n' + suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      data: { suggestions },
    };
  }

  /**
   * Handle modify commands
   */
  private handleModify(_command: DevCommand): DevResponse {
    const { field, value } = _command.params || {};

    if (field && value) {
      // This would need actual implementation to modify rules/config
      return {
        success: false,
        message: `Modification requires approval: Set ${field} to ${value}`,
        suggestions: [
          'Use the web interface for safe modifications',
          'Or implement specific modification handlers',
        ],
        warnings: ['Direct modifications are disabled for safety'],
      };
    }

    return {
      success: false,
      message: 'Please specify what to modify',
      suggestions: [
        'Example: "set activation threshold to 75"',
        'Example: "modify rule RULE-ACT-001"',
      ],
    };
  }

  /**
   * Handle rollback commands
   */
  private handleRollback(command: DevCommand): DevResponse {
    const { changeId } = command.params || {};

    if (!changeId) {
      const changes = this.changeTracker.getRecentChanges(5);
      const rollbackable = changes.filter(c => c.rollbackAvailable);

      if (rollbackable.length === 0) {
        return {
          success: false,
          message: 'No changes available for rollback',
        };
      }

      return {
        success: false,
        message: 'Specify which change to rollback:\n\n' +
          rollbackable.map(c => `  ${c.id}: ${c.summary}`).join('\n'),
        suggestions: [`rollback ${rollbackable[0].id}`],
      };
    }

    const change = this.changeTracker.getChange(changeId);
    if (!change) {
      return {
        success: false,
        message: `Change not found: ${changeId}`,
      };
    }

    if (!change.rollbackAvailable) {
      return {
        success: false,
        message: 'This change cannot be rolled back (no previous state saved)',
      };
    }

    // Actual rollback would need implementation
    return {
      success: false,
      message: `Rollback for ${changeId} would restore: ${JSON.stringify(change.beforeState)}`,
      warnings: ['Rollback functionality needs manual implementation'],
    };
  }

  /**
   * Handle unknown input
   */
  private handleUnknown(input: string): DevResponse {
    // Try to understand intent
    const lower = input.toLowerCase();

    if (lower.includes('help')) {
      return {
        success: true,
        message: this.getGeneralHelp(),
      };
    }

    if (lower.includes('pattern')) {
      return {
        success: false,
        message: `I didn't understand that. Did you mean to explain a pattern?`,
        suggestions: [
          `explain pattern ZZ`,
          `explain pattern 2A2`,
          'Available patterns: ' + PATTERN_NAMES.join(', '),
        ],
      };
    }

    return {
      success: false,
      message: `I didn't understand: "${input}"`,
      suggestions: [
        'status - Show system status',
        'history - Show recent changes',
        'test - Run all tests',
        'explain <topic> - Get explanation',
        'suggest - Get recommendations',
      ],
    };
  }

  /**
   * Get general help text
   */
  private getGeneralHelp(): string {
    return `
╔══════════════════════════════════════════════════════════╗
║              GHOST EVALUATOR - DEV ASSISTANT             ║
╚══════════════════════════════════════════════════════════╝

AVAILABLE COMMANDS:

  status          - Show system status
  history         - Show recent changes
  test            - Run all tests
  test <name>     - Run specific test
  validate        - Validate all rules
  suggest         - Get AI recommendations

EXPLAIN COMMANDS:

  explain rule <name>     - Explain a rule
  explain pattern <name>  - Explain a pattern
  how does <x> work       - Get explanation

MODIFICATION (with approval):

  modify <target>         - Propose modification
  rollback <change-id>    - Rollback a change

PATTERNS: ${PATTERN_NAMES.join(', ')}

Type any command or ask a question!
`.trim();
  }

  /**
   * Explain a pattern
   */
  private explainPattern(pattern: PatternName): string {
    const explanations: Partial<Record<PatternName, string>> = {
      'ZZ': `
ZZ (Zig-Zag) Pattern
====================
Trigger: Indicator (2+ same) followed by 3+ consecutive singles (alternation)
Play: Opposite of current (alternation continues)
Activation: IMMEDIATE on first detection (no 70% required)
On Loss: If lastRunProfit > 0, stay active. If <= 0, switch to AntiZZ

Example:
G G → R → G → R → G [signal] → predict R
└─┘   └───────────┘
 2+    3+ singles (alternation pattern)
`,
      'AntiZZ': `
AntiZZ Pattern
==============
Trigger: Same as ZZ (indicator + 3+ singles)
Play: SAME as current (predicting alternation breaks)
Activation: ONLY when ZZ becomes unprofitable (never through observation)
On Loss: If lastRunProfit > 0, stay active. If <= 0, switch back to ZZ
`,
      '2A2': `
2A2 Pattern
===========
Trigger: Run length = 2
Play: Opposite direction (reversal expected)
Activation: 70% threshold or 100% cumulative
`,
      'Anti2A2': `
Anti2A2 Pattern
===============
Trigger: Run length = 2
Play: SAME direction (continuation expected)
Activation: 70% threshold or 100% cumulative
`,
    };

    return explanations[pattern] || `Pattern ${pattern}: Run-length based detection. Check README for details.`;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createDevAssistant(
  changeTracker: ChangeTracker,
  ruleManager: RuleManager,
  testRunner: TestRunner
): DevAssistant {
  return new DevAssistant(changeTracker, ruleManager, testRunner);
}
