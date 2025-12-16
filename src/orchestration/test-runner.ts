/**
 * Ghost Evaluator v15.3 - Test Runner
 * ====================================
 * Automated testing for pattern behavior and rule validation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TestCase,
  TestSuite,
  TestResult,
  TestReport,
  TestStepResult,
  AssertionResult,
  ChangeCategory,
} from './types';
import { createGameStateEngine, GameStateEngine } from '../engine/state';
import { createReactionEngine, ReactionEngine } from '../engine/reaction';
import { PatternName, PATTERN_NAMES, Direction } from '../types';

// ============================================================================
// TEST RUNNER CLASS
// ============================================================================

export class TestRunner {
  private testSuites: Map<string, TestSuite> = new Map();
  private storageDir: string;

  constructor(storageDir = './data/orchestration') {
    this.storageDir = storageDir;
    this.loadTestSuites();
    this.ensureDefaultSuite();
  }

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Ensure default test suite exists
   */
  private ensureDefaultSuite(): void {
    if (!this.testSuites.has('default')) {
      const defaultTests = this.createDefaultTests();
      this.testSuites.set('default', {
        id: 'default',
        name: 'Ghost Evaluator Core Tests',
        tests: defaultTests,
        metadata: {
          totalTests: defaultTests.length,
          categories: ['accumulation', 'lifecycle_rules', 'trading_rules'] as ChangeCategory[],
          patterns: [...PATTERN_NAMES],
        },
      });
      this.saveTestSuites();
    }
  }

  /**
   * Create default test cases
   */
  private createDefaultTests(): TestCase[] {
    const now = new Date().toISOString();
    const tests: TestCase[] = [];

    // Test: ZZ Immediate Activation
    tests.push({
      id: 'TEST-001',
      name: 'ZZ Immediate Activation',
      description: 'ZZ pattern should activate immediately on first detection',
      type: 'unit',
      category: 'lifecycle_rules',
      patterns: ['ZZ'],
      setup: {
        config: { dailyTarget: 2000, betAmount: 200 },
      },
      steps: [
        { action: 'add_block', params: { dir: 1, pct: 60 }, description: 'Start indicator' },
        { action: 'add_block', params: { dir: 1, pct: 55 }, description: 'Continue indicator' },
        { action: 'add_block', params: { dir: -1, pct: 50 }, description: 'First single' },
        { action: 'add_block', params: { dir: 1, pct: 45 }, description: 'Second single' },
        { action: 'add_block', params: { dir: -1, pct: 55 }, description: 'Third single - ZZ triggers' },
      ],
      expectedOutcome: {
        patternStates: { 'ZZ': 'active' },
        assertions: [
          { field: 'lifecycle.ZZ.state', operator: 'eq', value: 'active', message: 'ZZ should be active' },
        ],
      },
      metadata: {
        author: 'system',
        createdAt: now,
        tags: ['zz', 'activation', 'core'],
        relatedRules: ['RULE-ACT-003'],
        priority: 1,
      },
    });

    // Test: Accumulation - No Negative
    tests.push({
      id: 'TEST-002',
      name: 'No Negative Accumulation',
      description: 'Pattern cumulative profit should never go below 0',
      type: 'unit',
      category: 'accumulation',
      patterns: ['2A2', 'Anti2A2'],
      setup: {
        config: { dailyTarget: 2000, betAmount: 200 },
      },
      steps: [
        { action: 'add_block', params: { dir: 1, pct: 70 }, description: 'Build run' },
        { action: 'add_block', params: { dir: 1, pct: 70 }, description: '2A2 triggers' },
        { action: 'add_block', params: { dir: 1, pct: 80 }, description: '2A2 loses (continuation)' },
        { action: 'assert', params: { field: 'lifecycle.2A2.cumulativeProfit', operator: 'gte', value: 0 } },
      ],
      expectedOutcome: {
        assertions: [
          { field: 'lifecycle.2A2.cumulativeProfit', operator: 'eq', value: 0, message: 'Cumulative should be 0 after loss' },
          { field: 'lifecycle.Anti2A2.cumulativeProfit', operator: 'gt', value: 0, message: 'Opposite should gain' },
        ],
      },
      metadata: {
        author: 'system',
        createdAt: now,
        tags: ['accumulation', 'core'],
        relatedRules: ['RULE-ACC-001', 'RULE-ACC-002'],
        priority: 1,
      },
    });

    // Test: Loss Transfer to Opposite
    tests.push({
      id: 'TEST-003',
      name: 'Loss Transfer to Opposite Pattern',
      description: 'When pattern loses, loss amount should transfer to opposite as positive',
      type: 'unit',
      category: 'accumulation',
      patterns: ['3A3', 'Anti3A3'],
      setup: {
        config: { dailyTarget: 2000, betAmount: 200 },
      },
      steps: [
        { action: 'add_block', params: { dir: 1, pct: 60 }, description: 'Block 1' },
        { action: 'add_block', params: { dir: 1, pct: 70 }, description: 'Block 2' },
        { action: 'add_block', params: { dir: 1, pct: 75 }, description: 'Block 3 - 3A3 triggers' },
        { action: 'add_block', params: { dir: 1, pct: 65 }, description: '3A3 loses - transfer to Anti3A3' },
      ],
      expectedOutcome: {
        assertions: [
          { field: 'lifecycle.3A3.cumulativeProfit', operator: 'eq', value: 0, message: '3A3 reset to 0' },
          { field: 'lifecycle.Anti3A3.cumulativeProfit', operator: 'eq', value: 65, message: 'Anti3A3 gains loss amount' },
        ],
      },
      metadata: {
        author: 'system',
        createdAt: now,
        tags: ['accumulation', 'transfer', 'core'],
        relatedRules: ['RULE-ACC-002'],
        priority: 1,
      },
    });

    // Test: ZZ to AntiZZ Switching
    tests.push({
      id: 'TEST-004',
      name: 'ZZ to AntiZZ Switch on Unprofitable Run',
      description: 'ZZ should switch to AntiZZ when last run profit is <= 0',
      type: 'scenario',
      category: 'lifecycle_rules',
      patterns: ['ZZ', 'AntiZZ'],
      setup: {
        config: { dailyTarget: 2000, betAmount: 200 },
      },
      steps: [
        // Build up ZZ pattern
        { action: 'add_block', params: { dir: 1, pct: 60 }, description: 'Indicator 1' },
        { action: 'add_block', params: { dir: 1, pct: 55 }, description: 'Indicator 2' },
        { action: 'add_block', params: { dir: -1, pct: 50 }, description: 'Single 1' },
        { action: 'add_block', params: { dir: 1, pct: 45 }, description: 'Single 2' },
        { action: 'add_block', params: { dir: -1, pct: 55 }, description: 'Single 3 - ZZ active' },
        // ZZ loses
        { action: 'add_block', params: { dir: -1, pct: 70 }, description: 'ZZ loses (predicted up, got down)' },
      ],
      expectedOutcome: {
        assertions: [
          { field: 'lifecycle.AntiZZ.state', operator: 'eq', value: 'active', message: 'AntiZZ should be active after ZZ unprofitable' },
        ],
      },
      metadata: {
        author: 'system',
        createdAt: now,
        tags: ['zz', 'antizz', 'switching'],
        relatedRules: ['RULE-SWT-001'],
        priority: 1,
      },
    });

    // Test: Cooldown After Consecutive Losses
    tests.push({
      id: 'TEST-005',
      name: 'Cooldown After 2 Consecutive Losses',
      description: 'System should enter 3-block cooldown after 2 consecutive losses',
      type: 'integration',
      category: 'trading_rules',
      patterns: [],
      setup: {
        config: { dailyTarget: 2000, betAmount: 200 },
      },
      steps: [
        // This test would need to simulate two consecutive losing trades
        // For now it's a placeholder
      ],
      expectedOutcome: {
        assertions: [
          { field: 'reaction.cooldownRemaining', operator: 'eq', value: 3, message: 'Cooldown should be 3 blocks' },
        ],
      },
      metadata: {
        author: 'system',
        createdAt: now,
        tags: ['cooldown', 'risk'],
        relatedRules: ['RULE-RSK-001'],
        priority: 2,
      },
    });

    // Test: Standard 70% Activation
    tests.push({
      id: 'TEST-006',
      name: 'Standard Pattern Activation at 70%',
      description: 'Non-ZZ patterns should activate when single result >= 70%',
      type: 'unit',
      category: 'lifecycle_rules',
      patterns: ['2A2'],
      setup: {
        config: { dailyTarget: 2000, betAmount: 200, singleProfitThreshold: 70 },
      },
      steps: [
        { action: 'add_block', params: { dir: 1, pct: 65 }, description: 'Block 1' },
        { action: 'add_block', params: { dir: 1, pct: 60 }, description: 'Block 2 - 2A2 triggers' },
        { action: 'add_block', params: { dir: -1, pct: 75 }, description: '2A2 wins with 75% (>= 70%)' },
      ],
      expectedOutcome: {
        patternStates: { '2A2': 'active' },
        assertions: [
          { field: 'lifecycle.2A2.state', operator: 'eq', value: 'active', message: '2A2 should activate at 75%' },
        ],
      },
      metadata: {
        author: 'system',
        createdAt: now,
        tags: ['activation', '70%', 'core'],
        relatedRules: ['RULE-ACT-001'],
        priority: 1,
      },
    });

    return tests;
  }

  /**
   * Run a single test case
   */
  runTest(test: TestCase): TestResult {
    const startTime = new Date().toISOString();
    const logs: string[] = [];
    const stepResults: TestStepResult[] = [];
    const assertionResults: AssertionResult[] = [];

    logs.push(`Starting test: ${test.name}`);

    // Create fresh game state and reaction engine
    const gameState = createGameStateEngine(test.setup.config);
    const reaction = createReactionEngine(gameState, test.setup.config);

    // Apply initial pattern states if specified
    if (test.setup.patternStates) {
      for (const [pattern, state] of Object.entries(test.setup.patternStates)) {
        if (state === 'active') {
          gameState.getLifecycle().forceActivate(pattern as PatternName);
        }
      }
    }

    // Add initial blocks if specified
    if (test.setup.initialBlocks) {
      for (const block of test.setup.initialBlocks) {
        reaction.processBlock(block.dir as Direction, block.pct);
      }
    }

    let testFailed = false;
    let errorMessage: string | undefined;

    // Execute test steps
    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepResult: TestStepResult = {
        step: i + 1,
        action: step.action,
        success: true,
      };

      try {
        switch (step.action) {
          case 'add_block': {
            const { dir, pct } = step.params;
            const result = reaction.processBlock(dir as Direction, pct);
            stepResult.result = {
              block: result.blockResult.block,
              prediction: result.prediction,
            };
            logs.push(`Step ${i + 1}: Added block (${dir > 0 ? 'UP' : 'DOWN'}, ${pct}%)`);
            break;
          }

          case 'undo': {
            const removed = gameState.undoLastBlock();
            reaction.clearPendingTrade();
            stepResult.result = removed;
            logs.push(`Step ${i + 1}: Undid last block`);
            break;
          }

          case 'clear': {
            gameState.reset();
            reaction.reset();
            logs.push(`Step ${i + 1}: Cleared session`);
            break;
          }

          case 'assert': {
            const { field, operator, value } = step.params;
            const actual = this.getFieldValue(field, gameState, reaction);
            const passed = this.evaluateCondition(actual, operator, value);
            assertionResults.push({
              assertion: { field, operator, value },
              passed,
              actual,
            });
            stepResult.success = passed;
            if (!passed) {
              testFailed = true;
              logs.push(`Step ${i + 1}: Assertion FAILED - ${field} ${operator} ${value} (actual: ${actual})`);
            } else {
              logs.push(`Step ${i + 1}: Assertion PASSED - ${field} ${operator} ${value}`);
            }
            break;
          }

          case 'wait': {
            // No-op for now
            logs.push(`Step ${i + 1}: Wait`);
            break;
          }
        }
      } catch (error) {
        stepResult.success = false;
        stepResult.error = error instanceof Error ? error.message : String(error);
        testFailed = true;
        errorMessage = stepResult.error;
        logs.push(`Step ${i + 1}: ERROR - ${stepResult.error}`);
      }

      stepResults.push(stepResult);
    }

    // Evaluate expected outcomes
    if (test.expectedOutcome.assertions) {
      for (const assertion of test.expectedOutcome.assertions) {
        const actual = this.getFieldValue(assertion.field, gameState, reaction);
        const passed = this.evaluateCondition(actual, assertion.operator, assertion.value);
        assertionResults.push({
          assertion,
          passed,
          actual,
          message: assertion.message,
        });
        if (!passed) {
          testFailed = true;
          logs.push(`Final assertion FAILED: ${assertion.message || assertion.field} (expected: ${assertion.value}, actual: ${actual})`);
        } else {
          logs.push(`Final assertion PASSED: ${assertion.message || assertion.field}`);
        }
      }
    }

    // Check pattern states
    if (test.expectedOutcome.patternStates) {
      for (const [pattern, expectedState] of Object.entries(test.expectedOutcome.patternStates)) {
        const cycle = gameState.getLifecycle().getCycle(pattern as PatternName);
        const actualState = cycle.state;
        const passed = actualState === expectedState;
        assertionResults.push({
          assertion: { field: `lifecycle.${pattern}.state`, operator: 'eq', value: expectedState },
          passed,
          actual: actualState,
        });
        if (!passed) {
          testFailed = true;
          logs.push(`Pattern state FAILED: ${pattern} expected ${expectedState}, got ${actualState}`);
        }
      }
    }

    const endTime = new Date().toISOString();

    return {
      testId: test.id,
      testName: test.name,
      status: testFailed ? 'failed' : 'passed',
      startTime,
      endTime,
      duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
      steps: stepResults,
      assertions: assertionResults,
      error: errorMessage,
      logs,
    };
  }

  /**
   * Get field value from game state or reaction engine
   */
  private getFieldValue(
    field: string,
    gameState: GameStateEngine,
    reaction: ReactionEngine
  ): any {
    const parts = field.split('.');

    if (parts[0] === 'lifecycle') {
      const pattern = parts[1] as PatternName;
      const cycle = gameState.getLifecycle().getCycle(pattern);
      if (parts[2] === 'state') return cycle.state;
      if (parts[2] === 'cumulativeProfit') return cycle.cumulativeProfit;
      if (parts[2] === 'allTimeProfit') return cycle.allTimeProfit;
      if (parts[2] === 'lastRunProfit') return cycle.lastRunProfit;
    }

    if (parts[0] === 'reaction') {
      if (parts[1] === 'cooldownRemaining') return reaction.getCooldownRemaining();
      if (parts[1] === 'consecutiveLosses') return reaction.getConsecutiveLosses();
      if (parts[1] === 'pnlTotal') return reaction.getPnlTotal();
    }

    if (parts[0] === 'gameState') {
      if (parts[1] === 'blockCount') return gameState.getBlockCount();
      if (parts[1] === 'p1Mode') return gameState.isP1Mode();
    }

    return undefined;
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'neq': return actual !== expected;
      case 'gt': return actual > expected;
      case 'gte': return actual >= expected;
      case 'lt': return actual < expected;
      case 'lte': return actual <= expected;
      default: return false;
    }
  }

  /**
   * Run all tests in a suite
   */
  runSuite(suiteId: string): TestReport {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    const runAt = new Date().toISOString();
    const results: TestResult[] = [];
    let totalDuration = 0;

    for (const test of suite.tests) {
      if (test.steps.length === 0) {
        // Skip tests with no steps
        results.push({
          testId: test.id,
          testName: test.name,
          status: 'skipped',
          startTime: runAt,
          steps: [],
          assertions: [],
          logs: ['Test skipped - no steps defined'],
        });
        continue;
      }

      const result = this.runTest(test);
      results.push(result);
      totalDuration += result.duration || 0;
    }

    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return {
      suiteId: suite.id,
      suiteName: suite.name,
      runAt,
      duration: totalDuration,
      results,
      summary: {
        total: results.length,
        passed,
        failed,
        skipped,
        passRate: results.length > 0 ? (passed / (results.length - skipped)) * 100 : 0,
      },
    };
  }

  /**
   * Run all test suites
   */
  runAllSuites(): TestReport[] {
    const reports: TestReport[] = [];
    for (const suiteId of this.testSuites.keys()) {
      reports.push(this.runSuite(suiteId));
    }
    return reports;
  }

  /**
   * Add a test case
   */
  addTest(suiteId: string, test: Omit<TestCase, 'id'>): TestCase {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Test suite not found: ${suiteId}`);
    }

    const newTest: TestCase = {
      ...test,
      id: this.generateId('TEST'),
    };

    suite.tests.push(newTest);
    suite.metadata.totalTests = suite.tests.length;
    this.saveTestSuites();

    return newTest;
  }

  /**
   * Get test by ID
   */
  getTest(testId: string): TestCase | undefined {
    for (const suite of this.testSuites.values()) {
      const test = suite.tests.find(t => t.id === testId);
      if (test) return test;
    }
    return undefined;
  }

  /**
   * Get all test suites
   */
  getAllSuites(): TestSuite[] {
    return Array.from(this.testSuites.values());
  }

  /**
   * Get a specific suite
   */
  getSuite(suiteId: string): TestSuite | undefined {
    return this.testSuites.get(suiteId);
  }

  /**
   * Create a new test suite
   */
  createSuite(name: string): TestSuite {
    const suite: TestSuite = {
      id: this.generateId('SUITE'),
      name,
      tests: [],
      metadata: {
        totalTests: 0,
        categories: [],
        patterns: [],
      },
    };

    this.testSuites.set(suite.id, suite);
    this.saveTestSuites();
    return suite;
  }

  /**
   * Generate test report string
   */
  formatReport(report: TestReport): string {
    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════╗',
      '║              GHOST EVALUATOR - TEST REPORT               ║',
      '╚══════════════════════════════════════════════════════════╝',
      '',
      `Suite: ${report.suiteName}`,
      `Run At: ${report.runAt}`,
      `Duration: ${report.duration}ms`,
      '',
      '═══════════════════════════════════════════════════════════',
      `SUMMARY: ${report.summary.passed}/${report.summary.total} passed (${report.summary.passRate.toFixed(1)}%)`,
      `  ✓ Passed:  ${report.summary.passed}`,
      `  ✗ Failed:  ${report.summary.failed}`,
      `  ○ Skipped: ${report.summary.skipped}`,
      '═══════════════════════════════════════════════════════════',
      '',
    ];

    for (const result of report.results) {
      const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
      lines.push(`${icon} ${result.testName} [${result.status.toUpperCase()}]`);

      if (result.status === 'failed') {
        for (const assertion of result.assertions.filter(a => !a.passed)) {
          lines.push(`    └─ ${assertion.message || assertion.assertion.field}: expected ${assertion.assertion.value}, got ${assertion.actual}`);
        }
        if (result.error) {
          lines.push(`    └─ Error: ${result.error}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Load test suites from disk
   */
  private loadTestSuites(): void {
    const filePath = path.join(this.storageDir, 'testsuites.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.testSuites = new Map(Object.entries(data.suites || {}));
      }
    } catch (error) {
      console.error('[TestRunner] Failed to load test suites:', error);
    }
  }

  /**
   * Save test suites to disk
   */
  private saveTestSuites(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const filePath = path.join(this.storageDir, 'testsuites.json');
      const data = {
        suites: Object.fromEntries(this.testSuites),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[TestRunner] Failed to save test suites:', error);
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createTestRunner(storageDir?: string): TestRunner {
  return new TestRunner(storageDir);
}
