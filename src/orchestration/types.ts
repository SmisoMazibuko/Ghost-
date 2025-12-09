/**
 * Ghost Evaluator v15.1 - AI Orchestration Types
 * ================================================
 * Type definitions for the AI orchestration system
 */

import { PatternName, EvaluatorConfig } from '../types';

// ============================================================================
// CHANGE TRACKING
// ============================================================================

export type ChangeCategory =
  | 'pattern_logic'
  | 'lifecycle_rules'
  | 'accumulation'
  | 'trading_rules'
  | 'configuration'
  | 'ui_behavior'
  | 'data_structure';

export type ChangeImpact = 'low' | 'medium' | 'high' | 'critical';

export interface ChangeRecord {
  id: string;
  timestamp: string;
  category: ChangeCategory;
  impact: ChangeImpact;
  summary: string;
  details: string;
  affectedPatterns: PatternName[];
  affectedFiles: string[];
  beforeState?: any;
  afterState?: any;
  testResults?: TestResult[];
  approved: boolean;
  approvedBy?: string;
  rollbackAvailable: boolean;
}

export interface ChangeLog {
  version: string;
  changes: ChangeRecord[];
  lastModified: string;
}

// ============================================================================
// RULE MANAGEMENT
// ============================================================================

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
  metadata: RuleMetadata;
}

export type RuleCategory =
  | 'activation'        // Pattern activation rules
  | 'deactivation'      // Pattern break/deactivation rules
  | 'accumulation'      // Profit accumulation rules
  | 'switching'         // Pattern switching (e.g., ZZ↔AntiZZ)
  | 'trading'           // Trade execution rules
  | 'risk'              // Risk management rules
  | 'cooldown';         // Cooldown and pause rules

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: any;
  logic?: 'and' | 'or';
}

export interface RuleAction {
  type: 'set' | 'add' | 'remove' | 'reset' | 'switch' | 'notify';
  target: string;
  value?: any;
}

export interface RuleMetadata {
  version: number;
  createdAt: string;
  updatedAt: string;
  author: string;
  notes: string[];
  testCoverage: number;
}

export interface RuleSet {
  id: string;
  name: string;
  rules: Rule[];
  isDefault: boolean;
  createdAt: string;
}

// ============================================================================
// TESTING
// ============================================================================

export type TestType = 'unit' | 'integration' | 'scenario' | 'regression';
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: TestType;
  category: ChangeCategory;
  patterns: PatternName[];
  setup: TestSetup;
  steps: TestStep[];
  expectedOutcome: ExpectedOutcome;
  metadata: TestMetadata;
}

export interface TestSetup {
  config?: Partial<EvaluatorConfig>;
  initialBlocks?: { dir: 1 | -1; pct: number }[];
  patternStates?: Partial<Record<PatternName, 'observing' | 'active'>>;
}

export interface TestStep {
  action: 'add_block' | 'undo' | 'clear' | 'wait' | 'assert';
  params?: any;
  description?: string;
}

export interface ExpectedOutcome {
  patternStates?: Partial<Record<PatternName, 'observing' | 'active'>>;
  cumulativeProfits?: Partial<Record<PatternName, number>>;
  predictions?: { hasPrediction: boolean; direction?: 1 | -1; pattern?: PatternName };
  trades?: { count?: number; wins?: number; losses?: number };
  assertions?: TestAssertion[];
}

export interface TestAssertion {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
  value: any;
  message?: string;
}

export interface TestMetadata {
  author: string;
  createdAt: string;
  tags: string[];
  relatedRules: string[];
  priority: number;
}

export interface TestResult {
  testId: string;
  testName: string;
  status: TestStatus;
  startTime: string;
  endTime?: string;
  duration?: number;
  steps: TestStepResult[];
  assertions: AssertionResult[];
  error?: string;
  logs: string[];
}

export interface TestStepResult {
  step: number;
  action: string;
  success: boolean;
  result?: any;
  error?: string;
}

export interface AssertionResult {
  assertion: TestAssertion;
  passed: boolean;
  actual: any;
  message?: string;
}

export interface TestSuite {
  id: string;
  name: string;
  tests: TestCase[];
  metadata: {
    totalTests: number;
    categories: ChangeCategory[];
    patterns: PatternName[];
  };
}

export interface TestReport {
  suiteId: string;
  suiteName: string;
  runAt: string;
  duration: number;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  suggestion?: string;
}

// ============================================================================
// DEV ASSISTANT
// ============================================================================

export type CommandType =
  | 'explain'
  | 'modify'
  | 'test'
  | 'validate'
  | 'status'
  | 'history'
  | 'rollback'
  | 'suggest';

export interface DevCommand {
  type: CommandType;
  target?: string;
  params?: Record<string, any>;
  rawInput: string;
}

export interface DevResponse {
  success: boolean;
  message: string;
  data?: any;
  suggestions?: string[];
  warnings?: string[];
}

// ============================================================================
// ORCHESTRATION STATE
// ============================================================================

export interface OrchestrationState {
  version: string;
  changeLog: ChangeLog;
  ruleSets: RuleSet[];
  activeRuleSetId: string;
  testSuites: TestSuite[];
  lastTestReport?: TestReport;
  settings: OrchestrationSettings;
}

export interface OrchestrationSettings {
  autoValidate: boolean;
  autoTest: boolean;
  requireApproval: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  testOnChange: boolean;
  maxChangeHistory: number;
}
