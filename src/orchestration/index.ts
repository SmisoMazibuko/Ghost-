/**
 * Ghost Evaluator v15.3 - Orchestration Module
 * =============================================
 * AI-powered development management system
 */

// Export types
export * from './types';

// Export modules
export { ChangeTracker, createChangeTracker } from './change-tracker';
export { RuleManager, createRuleManager } from './rule-manager';
export { TestRunner, createTestRunner } from './test-runner';
export { DevAssistant, createDevAssistant } from './dev-assistant';

// Import for orchestrator
import { ChangeTracker, createChangeTracker } from './change-tracker';
import { RuleManager, createRuleManager } from './rule-manager';
import { TestRunner, createTestRunner } from './test-runner';
import { DevAssistant, createDevAssistant } from './dev-assistant';
import { OrchestrationState, OrchestrationSettings, DevResponse } from './types';

// ============================================================================
// ORCHESTRATION MANAGER
// ============================================================================

export class OrchestrationManager {
  private changeTracker: ChangeTracker;
  private ruleManager: RuleManager;
  private testRunner: TestRunner;
  private devAssistant: DevAssistant;
  private settings: OrchestrationSettings;

  constructor(storageDir = './data/orchestration', settings?: Partial<OrchestrationSettings>) {
    this.settings = {
      autoValidate: true,
      autoTest: false,
      requireApproval: false,
      logLevel: 'info',
      testOnChange: false,
      maxChangeHistory: 100,
      ...settings,
    };

    // Initialize modules
    this.changeTracker = createChangeTracker(storageDir, this.settings.maxChangeHistory);
    this.ruleManager = createRuleManager(storageDir);
    this.testRunner = createTestRunner(storageDir);
    this.devAssistant = createDevAssistant(
      this.changeTracker,
      this.ruleManager,
      this.testRunner
    );
  }

  /**
   * Get the change tracker
   */
  getChangeTracker(): ChangeTracker {
    return this.changeTracker;
  }

  /**
   * Get the rule manager
   */
  getRuleManager(): RuleManager {
    return this.ruleManager;
  }

  /**
   * Get the test runner
   */
  getTestRunner(): TestRunner {
    return this.testRunner;
  }

  /**
   * Get the dev assistant
   */
  getDevAssistant(): DevAssistant {
    return this.devAssistant;
  }

  /**
   * Process a natural language command
   */
  processCommand(input: string): DevResponse {
    return this.devAssistant.process(input);
  }

  /**
   * Run all tests and return report
   */
  runTests(): string {
    const reports = this.testRunner.runAllSuites();
    return reports.map(r => this.testRunner.formatReport(r)).join('\n\n');
  }

  /**
   * Get system status
   */
  getStatus(): DevResponse {
    return this.devAssistant.process('status');
  }

  /**
   * Get recent changes
   */
  getHistory(): DevResponse {
    return this.devAssistant.process('history');
  }

  /**
   * Get suggestions
   */
  getSuggestions(): DevResponse {
    return this.devAssistant.process('suggest');
  }

  /**
   * Validate all rules
   */
  validate(): DevResponse {
    return this.devAssistant.process('validate');
  }

  /**
   * Export full orchestration state
   */
  exportState(): OrchestrationState {
    return {
      version: '15.3',
      changeLog: this.changeTracker.exportChangeLog(),
      ruleSets: this.ruleManager.getAllRuleSets(),
      activeRuleSetId: this.ruleManager.getActiveRuleSet()?.id || 'default',
      testSuites: this.testRunner.getAllSuites(),
      settings: this.settings,
    };
  }

  /**
   * Get help text
   */
  getHelp(): string {
    return this.devAssistant.process('help').message;
  }

  /**
   * Get settings
   */
  getSettings(): OrchestrationSettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  updateSettings(updates: Partial<OrchestrationSettings>): void {
    this.settings = { ...this.settings, ...updates };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createOrchestrationManager(
  storageDir?: string,
  settings?: Partial<OrchestrationSettings>
): OrchestrationManager {
  return new OrchestrationManager(storageDir, settings);
}
