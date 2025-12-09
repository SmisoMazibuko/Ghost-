/**
 * Ghost Evaluator v15.1 - Rule Manager
 * =====================================
 * Manages trading rules with versioning and AI recommendations
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Rule,
  RuleSet,
  RuleCategory,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

// ============================================================================
// RULE MANAGER CLASS
// ============================================================================

export class RuleManager {
  private ruleSets: Map<string, RuleSet> = new Map();
  private activeRuleSetId: string = 'default';
  private storageDir: string;

  constructor(storageDir = './data/orchestration') {
    this.storageDir = storageDir;
    this.loadRuleSets();
    this.ensureDefaultRuleSet();
  }

  /**
   * Generate unique rule ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Ensure default rule set exists with Ghost Evaluator's current rules
   */
  private ensureDefaultRuleSet(): void {
    if (!this.ruleSets.has('default')) {
      const defaultRules = this.createDefaultRules();
      this.ruleSets.set('default', {
        id: 'default',
        name: 'Ghost Evaluator v15.1 Rules',
        rules: defaultRules,
        isDefault: true,
        createdAt: new Date().toISOString(),
      });
      this.saveRuleSets();
    }
  }

  /**
   * Create default rules based on current Ghost Evaluator logic
   */
  private createDefaultRules(): Rule[] {
    const now = new Date().toISOString();
    const rules: Rule[] = [];

    // Pattern Activation Rules
    rules.push({
      id: 'RULE-ACT-001',
      name: 'Standard Pattern Activation (70% threshold)',
      description: 'Activate pattern when single observation result >= 70% profit',
      category: 'activation',
      enabled: true,
      priority: 1,
      conditions: [
        { field: 'pattern.state', operator: 'eq', value: 'observing' },
        { field: 'result.profit', operator: 'gte', value: 70, logic: 'and' },
      ],
      actions: [
        { type: 'set', target: 'pattern.state', value: 'active' },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Standard activation threshold for most patterns'],
        testCoverage: 85,
      },
    });

    rules.push({
      id: 'RULE-ACT-002',
      name: 'Cumulative Activation (100% threshold)',
      description: 'Activate pattern when cumulative observation profit >= 100%',
      category: 'activation',
      enabled: true,
      priority: 2,
      conditions: [
        { field: 'pattern.state', operator: 'eq', value: 'observing' },
        { field: 'pattern.cumulativeProfit', operator: 'gte', value: 100, logic: 'and' },
      ],
      actions: [
        { type: 'set', target: 'pattern.state', value: 'active' },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Alternative activation through accumulated profit'],
        testCoverage: 80,
      },
    });

    rules.push({
      id: 'RULE-ACT-003',
      name: 'ZZ Immediate Activation',
      description: 'ZZ pattern activates immediately on first detection',
      category: 'activation',
      enabled: true,
      priority: 0,
      conditions: [
        { field: 'pattern.name', operator: 'eq', value: 'ZZ' },
        { field: 'pattern.state', operator: 'eq', value: 'observing', logic: 'and' },
      ],
      actions: [
        { type: 'set', target: 'pattern.state', value: 'active' },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['ZZ does not require 70% threshold'],
        testCoverage: 90,
      },
    });

    // Accumulation Rules
    rules.push({
      id: 'RULE-ACC-001',
      name: 'No Negative Accumulation',
      description: 'Pattern cumulative profit cannot go below 0',
      category: 'accumulation',
      enabled: true,
      priority: 1,
      conditions: [
        { field: 'result.profit', operator: 'lt', value: 0 },
      ],
      actions: [
        { type: 'reset', target: 'pattern.cumulativeProfit', value: 0 },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Prevents negative accumulation'],
        testCoverage: 95,
      },
    });

    rules.push({
      id: 'RULE-ACC-002',
      name: 'Loss Transfer to Opposite',
      description: 'When pattern loses, transfer loss amount to opposite pattern',
      category: 'accumulation',
      enabled: true,
      priority: 2,
      conditions: [
        { field: 'result.profit', operator: 'lt', value: 0 },
        { field: 'pattern.hasOpposite', operator: 'eq', value: true, logic: 'and' },
      ],
      actions: [
        { type: 'add', target: 'oppositePattern.cumulativeProfit', value: 'abs(result.profit)' },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Loss becomes gain for opposite pattern'],
        testCoverage: 90,
      },
    });

    // Switching Rules (ZZ/AntiZZ)
    rules.push({
      id: 'RULE-SWT-001',
      name: 'ZZ to AntiZZ Switch',
      description: 'Switch from ZZ to AntiZZ when last run profit <= 0',
      category: 'switching',
      enabled: true,
      priority: 1,
      conditions: [
        { field: 'pattern.name', operator: 'eq', value: 'ZZ' },
        { field: 'pattern.state', operator: 'eq', value: 'active', logic: 'and' },
        { field: 'pattern.lastRunProfit', operator: 'lte', value: 0, logic: 'and' },
        { field: 'event', operator: 'eq', value: 'break', logic: 'and' },
      ],
      actions: [
        { type: 'set', target: 'ZZ.state', value: 'observing' },
        { type: 'set', target: 'AntiZZ.state', value: 'active' },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Based on last run profitability, not all-time'],
        testCoverage: 85,
      },
    });

    rules.push({
      id: 'RULE-SWT-002',
      name: 'AntiZZ to ZZ Switch',
      description: 'Switch from AntiZZ to ZZ when last run profit <= 0',
      category: 'switching',
      enabled: true,
      priority: 1,
      conditions: [
        { field: 'pattern.name', operator: 'eq', value: 'AntiZZ' },
        { field: 'pattern.state', operator: 'eq', value: 'active', logic: 'and' },
        { field: 'pattern.lastRunProfit', operator: 'lte', value: 0, logic: 'and' },
        { field: 'event', operator: 'eq', value: 'break', logic: 'and' },
      ],
      actions: [
        { type: 'set', target: 'AntiZZ.state', value: 'observing' },
        { type: 'set', target: 'ZZ.state', value: 'active' },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Returns to ZZ when AntiZZ unprofitable'],
        testCoverage: 85,
      },
    });

    rules.push({
      id: 'RULE-SWT-003',
      name: 'ZZ/AntiZZ Stay Active',
      description: 'ZZ/AntiZZ stays active when last run profit > 0',
      category: 'switching',
      enabled: true,
      priority: 0,
      conditions: [
        { field: 'pattern.name', operator: 'in', value: ['ZZ', 'AntiZZ'] },
        { field: 'pattern.state', operator: 'eq', value: 'active', logic: 'and' },
        { field: 'pattern.lastRunProfit', operator: 'gt', value: 0, logic: 'and' },
        { field: 'event', operator: 'eq', value: 'break', logic: 'and' },
      ],
      actions: [
        { type: 'reset', target: 'pattern.lastRunProfit', value: 0 },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Profitable patterns stay active'],
        testCoverage: 80,
      },
    });

    // Risk Management Rules
    rules.push({
      id: 'RULE-RSK-001',
      name: 'Cooldown After 2 Losses',
      description: 'Enter 3-block cooldown after 2 consecutive losses',
      category: 'cooldown',
      enabled: true,
      priority: 1,
      conditions: [
        { field: 'trade.consecutiveLosses', operator: 'gte', value: 2 },
      ],
      actions: [
        { type: 'set', target: 'trading.cooldownBlocks', value: 3 },
        { type: 'reset', target: 'trade.consecutiveLosses', value: 0 },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Protects against streaks of losses'],
        testCoverage: 90,
      },
    });

    rules.push({
      id: 'RULE-RSK-002',
      name: 'Daily Target Stop',
      description: 'Stop trading when daily P/L target reached',
      category: 'risk',
      enabled: true,
      priority: 0,
      conditions: [
        { field: 'trading.pnlTotal', operator: 'gte', value: 'config.dailyTarget' },
      ],
      actions: [
        { type: 'set', target: 'trading.dailyTargetReached', value: true },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Prevents overtrading after reaching goal'],
        testCoverage: 95,
      },
    });

    // Deactivation Rules
    rules.push({
      id: 'RULE-DEACT-001',
      name: 'Pattern Break on Loss',
      description: 'Active pattern breaks (returns to observing) on loss',
      category: 'deactivation',
      enabled: true,
      priority: 1,
      conditions: [
        { field: 'pattern.state', operator: 'eq', value: 'active' },
        { field: 'result.profit', operator: 'lt', value: 0, logic: 'and' },
      ],
      actions: [
        { type: 'set', target: 'pattern.state', value: 'observing' },
        { type: 'reset', target: 'pattern.cumulativeProfit', value: 0 },
        { type: 'reset', target: 'pattern.observationResults', value: [] },
      ],
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: 'system',
        notes: ['Standard break behavior'],
        testCoverage: 90,
      },
    });

    return rules;
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): Rule | undefined {
    for (const ruleSet of this.ruleSets.values()) {
      const rule = ruleSet.rules.find(r => r.id === ruleId);
      if (rule) return rule;
    }
    return undefined;
  }

  /**
   * Get all rules in active rule set
   */
  getActiveRules(): Rule[] {
    const ruleSet = this.ruleSets.get(this.activeRuleSetId);
    return ruleSet ? [...ruleSet.rules] : [];
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): Rule[] {
    return this.getActiveRules().filter(r => r.category === category);
  }

  /**
   * Get enabled rules sorted by priority
   */
  getEnabledRules(): Rule[] {
    return this.getActiveRules()
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Add a new rule
   */
  addRule(rule: Omit<Rule, 'id' | 'metadata'> & { metadata?: Partial<Rule['metadata']> }): Rule {
    const now = new Date().toISOString();
    const newRule: Rule = {
      ...rule,
      id: this.generateId('RULE'),
      metadata: {
        version: 1,
        createdAt: now,
        updatedAt: now,
        author: rule.metadata?.author || 'user',
        notes: rule.metadata?.notes || [],
        testCoverage: rule.metadata?.testCoverage || 0,
      },
    };

    const ruleSet = this.ruleSets.get(this.activeRuleSetId);
    if (ruleSet) {
      ruleSet.rules.push(newRule);
      this.saveRuleSets();
    }

    return newRule;
  }

  /**
   * Update an existing rule
   */
  updateRule(ruleId: string, updates: Partial<Rule>): boolean {
    for (const ruleSet of this.ruleSets.values()) {
      const ruleIndex = ruleSet.rules.findIndex(r => r.id === ruleId);
      if (ruleIndex >= 0) {
        const existing = ruleSet.rules[ruleIndex];
        ruleSet.rules[ruleIndex] = {
          ...existing,
          ...updates,
          id: existing.id, // Preserve ID
          metadata: {
            ...existing.metadata,
            ...updates.metadata,
            version: existing.metadata.version + 1,
            updatedAt: new Date().toISOString(),
          },
        };
        this.saveRuleSets();
        return true;
      }
    }
    return false;
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): boolean {
    for (const ruleSet of this.ruleSets.values()) {
      const ruleIndex = ruleSet.rules.findIndex(r => r.id === ruleId);
      if (ruleIndex >= 0) {
        ruleSet.rules.splice(ruleIndex, 1);
        this.saveRuleSets();
        return true;
      }
    }
    return false;
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    return this.updateRule(ruleId, { enabled });
  }

  /**
   * Create a new rule set
   */
  createRuleSet(name: string, copyFrom?: string): RuleSet {
    const id = this.generateId('RULESET');
    const sourceRules = copyFrom && this.ruleSets.has(copyFrom)
      ? this.ruleSets.get(copyFrom)!.rules.map(r => ({ ...r, id: this.generateId('RULE') }))
      : [];

    const ruleSet: RuleSet = {
      id,
      name,
      rules: sourceRules,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };

    this.ruleSets.set(id, ruleSet);
    this.saveRuleSets();
    return ruleSet;
  }

  /**
   * Switch active rule set
   */
  setActiveRuleSet(ruleSetId: string): boolean {
    if (this.ruleSets.has(ruleSetId)) {
      this.activeRuleSetId = ruleSetId;
      this.saveRuleSets();
      return true;
    }
    return false;
  }

  /**
   * Get all rule sets
   */
  getAllRuleSets(): RuleSet[] {
    return Array.from(this.ruleSets.values());
  }

  /**
   * Get active rule set
   */
  getActiveRuleSet(): RuleSet | undefined {
    return this.ruleSets.get(this.activeRuleSetId);
  }

  /**
   * Validate a rule
   */
  validateRule(rule: Rule): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Check required fields
    if (!rule.name || rule.name.trim() === '') {
      errors.push({ code: 'MISSING_NAME', message: 'Rule must have a name', severity: 'error' });
    }

    if (!rule.conditions || rule.conditions.length === 0) {
      errors.push({ code: 'NO_CONDITIONS', message: 'Rule must have at least one condition', severity: 'error' });
    }

    if (!rule.actions || rule.actions.length === 0) {
      errors.push({ code: 'NO_ACTIONS', message: 'Rule must have at least one action', severity: 'error' });
    }

    // Validate conditions
    for (const condition of rule.conditions) {
      if (!condition.field) {
        errors.push({ code: 'INVALID_CONDITION', message: 'Condition missing field', severity: 'error' });
      }
      if (!condition.operator) {
        errors.push({ code: 'INVALID_CONDITION', message: 'Condition missing operator', severity: 'error' });
      }
    }

    // Check for duplicate priority
    const activeRules = this.getActiveRules().filter(r => r.id !== rule.id);
    const samePriorityRules = activeRules.filter(
      r => r.category === rule.category && r.priority === rule.priority
    );
    if (samePriorityRules.length > 0) {
      warnings.push({
        code: 'DUPLICATE_PRIORITY',
        message: `Other rules in ${rule.category} have same priority ${rule.priority}`,
        suggestion: 'Consider adjusting priority to avoid conflicts',
      });
    }

    // Check test coverage
    if (rule.metadata.testCoverage < 50) {
      warnings.push({
        code: 'LOW_TEST_COVERAGE',
        message: `Test coverage is only ${rule.metadata.testCoverage}%`,
        suggestion: 'Add more tests for this rule',
      });
    }

    // Generate suggestions
    if (rule.category === 'switching' && !rule.conditions.some(c => c.field.includes('lastRunProfit'))) {
      suggestions.push('Consider using lastRunProfit for switching decisions');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Generate AI recommendation for a rule change
   */
  generateRecommendation(context: {
    currentRule?: Rule;
    proposedChanges?: Partial<Rule>;
    recentPerformance?: { wins: number; losses: number; pnl: number };
  }): string[] {
    const recommendations: string[] = [];

    if (context.recentPerformance) {
      const { wins, losses, pnl } = context.recentPerformance;
      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

      if (winRate < 40 && totalTrades >= 10) {
        recommendations.push('Win rate is below 40%. Consider adjusting activation thresholds.');
      }

      if (pnl < 0 && totalTrades >= 20) {
        recommendations.push('Negative P/L detected. Review pattern selection and break conditions.');
      }
    }

    if (context.currentRule && context.proposedChanges) {
      // Check for risky changes
      if (context.proposedChanges.category === 'risk' && !context.proposedChanges.enabled) {
        recommendations.push('Warning: Disabling risk management rules is not recommended.');
      }

      if (context.proposedChanges.conditions) {
        const thresholdCondition = context.proposedChanges.conditions.find(
          c => c.field.includes('Threshold')
        );
        if (thresholdCondition && typeof thresholdCondition.value === 'number') {
          if (thresholdCondition.value < 50) {
            recommendations.push('Threshold value below 50% may lead to premature activations.');
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * Get rule explanation
   */
  explainRule(ruleId: string): string {
    const rule = this.getRule(ruleId);
    if (!rule) return 'Rule not found';

    const lines: string[] = [
      `Rule: ${rule.name}`,
      `ID: ${rule.id}`,
      `Category: ${rule.category}`,
      `Status: ${rule.enabled ? 'Enabled' : 'Disabled'}`,
      `Priority: ${rule.priority}`,
      '',
      `Description: ${rule.description}`,
      '',
      'Conditions:',
    ];

    for (const condition of rule.conditions) {
      lines.push(`  - ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}${condition.logic ? ` (${condition.logic})` : ''}`);
    }

    lines.push('');
    lines.push('Actions:');
    for (const action of rule.actions) {
      lines.push(`  - ${action.type} ${action.target}${action.value !== undefined ? ` = ${JSON.stringify(action.value)}` : ''}`);
    }

    lines.push('');
    lines.push(`Version: ${rule.metadata.version}`);
    lines.push(`Test Coverage: ${rule.metadata.testCoverage}%`);

    if (rule.metadata.notes.length > 0) {
      lines.push('');
      lines.push('Notes:');
      for (const note of rule.metadata.notes) {
        lines.push(`  - ${note}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Load rule sets from disk
   */
  private loadRuleSets(): void {
    const filePath = path.join(this.storageDir, 'rulesets.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.ruleSets = new Map(Object.entries(data.ruleSets || {}));
        this.activeRuleSetId = data.activeRuleSetId || 'default';
      }
    } catch (error) {
      console.error('[RuleManager] Failed to load rule sets:', error);
    }
  }

  /**
   * Save rule sets to disk
   */
  private saveRuleSets(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const filePath = path.join(this.storageDir, 'rulesets.json');
      const data = {
        activeRuleSetId: this.activeRuleSetId,
        ruleSets: Object.fromEntries(this.ruleSets),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[RuleManager] Failed to save rule sets:', error);
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createRuleManager(storageDir?: string): RuleManager {
  return new RuleManager(storageDir);
}
