/**
 * Ghost Evaluator v15.3 - Change Tracker
 * ======================================
 * Tracks and manages all changes to the system with AI summaries
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ChangeRecord,
  ChangeLog,
  ChangeCategory,
  ChangeImpact,
  TestResult,
} from './types';
import { PatternName } from '../types';

// ============================================================================
// CHANGE TRACKER CLASS
// ============================================================================

export class ChangeTracker {
  private changeLog: ChangeLog;
  private storageDir: string;
  private maxHistory: number;

  constructor(storageDir = './data/orchestration', maxHistory = 100) {
    this.storageDir = storageDir;
    this.maxHistory = maxHistory;
    this.changeLog = this.loadChangeLog();
  }

  /**
   * Generate unique change ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `CHG-${timestamp}-${random}`;
  }

  /**
   * Record a new change
   */
  recordChange(params: {
    category: ChangeCategory;
    impact: ChangeImpact;
    summary: string;
    details: string;
    affectedPatterns?: PatternName[];
    affectedFiles?: string[];
    beforeState?: any;
    afterState?: any;
  }): ChangeRecord {
    const change: ChangeRecord = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      category: params.category,
      impact: params.impact,
      summary: params.summary,
      details: params.details,
      affectedPatterns: params.affectedPatterns || [],
      affectedFiles: params.affectedFiles || [],
      beforeState: params.beforeState,
      afterState: params.afterState,
      approved: false,
      rollbackAvailable: !!params.beforeState,
    };

    this.changeLog.changes.unshift(change);
    this.changeLog.lastModified = change.timestamp;

    // Trim history if needed
    if (this.changeLog.changes.length > this.maxHistory) {
      this.changeLog.changes = this.changeLog.changes.slice(0, this.maxHistory);
    }

    this.saveChangeLog();
    return change;
  }

  /**
   * Add test results to a change
   */
  addTestResults(changeId: string, results: TestResult[]): boolean {
    const change = this.changeLog.changes.find(c => c.id === changeId);
    if (!change) return false;

    change.testResults = results;
    this.saveChangeLog();
    return true;
  }

  /**
   * Approve a change
   */
  approveChange(changeId: string, approver: string): boolean {
    const change = this.changeLog.changes.find(c => c.id === changeId);
    if (!change) return false;

    change.approved = true;
    change.approvedBy = approver;
    this.saveChangeLog();
    return true;
  }

  /**
   * Get change by ID
   */
  getChange(changeId: string): ChangeRecord | undefined {
    return this.changeLog.changes.find(c => c.id === changeId);
  }

  /**
   * Get all changes
   */
  getAllChanges(): ChangeRecord[] {
    return [...this.changeLog.changes];
  }

  /**
   * Get changes by category
   */
  getChangesByCategory(category: ChangeCategory): ChangeRecord[] {
    return this.changeLog.changes.filter(c => c.category === category);
  }

  /**
   * Get changes affecting a pattern
   */
  getChangesByPattern(pattern: PatternName): ChangeRecord[] {
    return this.changeLog.changes.filter(c =>
      c.affectedPatterns.includes(pattern)
    );
  }

  /**
   * Get recent changes
   */
  getRecentChanges(count = 10): ChangeRecord[] {
    return this.changeLog.changes.slice(0, count);
  }

  /**
   * Get unapproved changes
   */
  getUnapprovedChanges(): ChangeRecord[] {
    return this.changeLog.changes.filter(c => !c.approved);
  }

  /**
   * Get high impact changes
   */
  getHighImpactChanges(): ChangeRecord[] {
    return this.changeLog.changes.filter(
      c => c.impact === 'high' || c.impact === 'critical'
    );
  }

  /**
   * Generate AI summary for a change
   */
  generateSummary(change: ChangeRecord): string {
    const parts: string[] = [];

    // Category description
    const categoryDescriptions: Record<ChangeCategory, string> = {
      pattern_logic: 'Pattern detection logic',
      lifecycle_rules: 'Pattern lifecycle management',
      accumulation: 'Profit accumulation rules',
      trading_rules: 'Trading execution rules',
      configuration: 'System configuration',
      ui_behavior: 'User interface behavior',
      data_structure: 'Data structures',
    };

    parts.push(`[${change.impact.toUpperCase()}] ${categoryDescriptions[change.category]}`);
    parts.push(change.summary);

    if (change.affectedPatterns.length > 0) {
      parts.push(`Affects: ${change.affectedPatterns.join(', ')}`);
    }

    if (change.testResults) {
      const passed = change.testResults.filter(t => t.status === 'passed').length;
      const total = change.testResults.length;
      parts.push(`Tests: ${passed}/${total} passed`);
    }

    return parts.join(' | ');
  }

  /**
   * Generate change report
   */
  generateReport(options?: {
    category?: ChangeCategory;
    pattern?: PatternName;
    since?: string;
    until?: string;
  }): string {
    let changes = [...this.changeLog.changes];

    // Apply filters
    if (options?.category) {
      changes = changes.filter(c => c.category === options.category);
    }
    if (options?.pattern) {
      changes = changes.filter(c => c.affectedPatterns.includes(options.pattern!));
    }
    if (options?.since) {
      changes = changes.filter(c => c.timestamp >= options.since!);
    }
    if (options?.until) {
      changes = changes.filter(c => c.timestamp <= options.until!);
    }

    // Build report
    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════╗',
      '║           GHOST EVALUATOR - CHANGE REPORT                ║',
      '╚══════════════════════════════════════════════════════════╝',
      '',
      `Total Changes: ${changes.length}`,
      `Report Generated: ${new Date().toISOString()}`,
      '',
      '────────────────────────────────────────────────────────────',
    ];

    for (const change of changes.slice(0, 20)) {
      lines.push('');
      lines.push(`ID: ${change.id}`);
      lines.push(`Time: ${change.timestamp}`);
      lines.push(`Category: ${change.category} | Impact: ${change.impact}`);
      lines.push(`Summary: ${change.summary}`);
      if (change.affectedPatterns.length > 0) {
        lines.push(`Patterns: ${change.affectedPatterns.join(', ')}`);
      }
      lines.push(`Status: ${change.approved ? '✓ Approved' : '○ Pending'}`);
      lines.push('────────────────────────────────────────────────────────────');
    }

    return lines.join('\n');
  }

  /**
   * Get change statistics
   */
  getStatistics(): {
    total: number;
    byCategory: Record<ChangeCategory, number>;
    byImpact: Record<ChangeImpact, number>;
    approved: number;
    pending: number;
    withTests: number;
  } {
    const stats = {
      total: this.changeLog.changes.length,
      byCategory: {} as Record<ChangeCategory, number>,
      byImpact: {} as Record<ChangeImpact, number>,
      approved: 0,
      pending: 0,
      withTests: 0,
    };

    for (const change of this.changeLog.changes) {
      stats.byCategory[change.category] = (stats.byCategory[change.category] || 0) + 1;
      stats.byImpact[change.impact] = (stats.byImpact[change.impact] || 0) + 1;
      if (change.approved) stats.approved++;
      else stats.pending++;
      if (change.testResults) stats.withTests++;
    }

    return stats;
  }

  /**
   * Load change log from disk
   */
  private loadChangeLog(): ChangeLog {
    const filePath = path.join(this.storageDir, 'changelog.json');
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[ChangeTracker] Failed to load changelog:', error);
    }

    return {
      version: '16.0',
      changes: [],
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Save change log to disk
   */
  private saveChangeLog(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const filePath = path.join(this.storageDir, 'changelog.json');
      fs.writeFileSync(filePath, JSON.stringify(this.changeLog, null, 2));
    } catch (error) {
      console.error('[ChangeTracker] Failed to save changelog:', error);
    }
  }

  /**
   * Export change log
   */
  exportChangeLog(): ChangeLog {
    return { ...this.changeLog, changes: [...this.changeLog.changes] };
  }

  /**
   * Clear all changes (for testing)
   */
  clearAll(): void {
    this.changeLog = {
      version: '16.0',
      changes: [],
      lastModified: new Date().toISOString(),
    };
    this.saveChangeLog();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createChangeTracker(
  storageDir?: string,
  maxHistory?: number
): ChangeTracker {
  return new ChangeTracker(storageDir, maxHistory);
}
