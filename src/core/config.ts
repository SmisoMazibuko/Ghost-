/**
 * Ghost Evaluator v15.3 - Configuration Manager
 * ==============================================
 * Loads and manages system configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import { EvaluatorConfig, DEFAULT_CONFIG, PatternName, SessionHealthConfig, DEFAULT_SESSION_HEALTH_CONFIG } from '../types';

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  console: boolean;
  file: boolean;
  filePath: string;
}

export interface SessionConfig {
  autoSave: boolean;
  autoSaveInterval: number;
  sessionDir: string;
}

export interface PatternsConfig {
  enabled: PatternName[];
  continuous: PatternName[];
  opposites: Record<string, string>;
}

export interface FullConfig {
  version: string;
  description: string;
  evaluator: EvaluatorConfig;
  patterns: PatternsConfig;
  logging: LoggingConfig;
  session: SessionConfig;
  sessionHealth: SessionHealthConfig;
}

// ============================================================================
// DEFAULT FULL CONFIG
// ============================================================================

const DEFAULT_FULL_CONFIG: FullConfig = {
  version: '15.3',
  description: 'Ghost Evaluator v15.3 - Default Configuration',
  evaluator: DEFAULT_CONFIG,
  patterns: {
    enabled: ['2A2', 'Anti2A2', '3A3', 'Anti3A3', '4A4', '5A5', 'AP5', 'OZ', 'ZZ', 'AntiZZ'],
    continuous: ['ZZ', 'AntiZZ'],
    opposites: {
      '2A2': 'Anti2A2',
      'Anti2A2': '2A2',
      '3A3': 'Anti3A3',
      'Anti3A3': '3A3',
      'AP5': 'OZ',
      'OZ': 'AP5',
      'ZZ': 'AntiZZ',
      'AntiZZ': 'ZZ',
    },
  },
  logging: {
    level: 'info',
    console: true,
    file: true,
    filePath: './data/logs/evaluator.log',
  },
  session: {
    autoSave: true,
    autoSaveInterval: 5000,
    sessionDir: './data/sessions',
  },
  sessionHealth: DEFAULT_SESSION_HEALTH_CONFIG,
};

// ============================================================================
// CONFIG MANAGER CLASS
// ============================================================================

export class ConfigManager {
  private config: FullConfig;
  private configPath: string | null = null;

  constructor(configPath?: string) {
    this.config = { ...DEFAULT_FULL_CONFIG };

    if (configPath) {
      this.loadFromFile(configPath);
    }
  }

  /**
   * Load configuration from a JSON file
   */
  loadFromFile(filePath: string): void {
    try {
      const absolutePath = path.resolve(filePath);
      const content = fs.readFileSync(absolutePath, 'utf-8');
      const loaded = JSON.parse(content);

      this.config = this.mergeConfig(DEFAULT_FULL_CONFIG, loaded);
      this.configPath = absolutePath;
    } catch (error) {
      console.error(`Failed to load config from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Deep merge two config objects
   */
  private mergeConfig(base: FullConfig, override: Partial<FullConfig>): FullConfig {
    return {
      version: override.version ?? base.version,
      description: override.description ?? base.description,
      evaluator: { ...base.evaluator, ...override.evaluator },
      patterns: { ...base.patterns, ...override.patterns },
      logging: { ...base.logging, ...override.logging },
      session: { ...base.session, ...override.session },
      sessionHealth: override.sessionHealth
        ? this.mergeSessionHealthConfig(base.sessionHealth, override.sessionHealth)
        : base.sessionHealth,
    };
  }

  /**
   * Deep merge session health config
   */
  private mergeSessionHealthConfig(
    base: SessionHealthConfig,
    override: Partial<SessionHealthConfig>
  ): SessionHealthConfig {
    return {
      sessionHealth: { ...base.sessionHealth, ...override.sessionHealth },
      drawdown: { ...base.drawdown, ...override.drawdown },
      baitSwitch: { ...base.baitSwitch, ...override.baitSwitch },
      verdicts: { ...base.verdicts, ...override.verdicts },
      recovery: { ...base.recovery, ...override.recovery },
      reentry: { ...base.reentry, ...override.reentry },
      lossSeverity: { ...base.lossSeverity, ...override.lossSeverity },
    };
  }

  /**
   * Get the full configuration
   */
  getFullConfig(): FullConfig {
    return { ...this.config };
  }

  /**
   * Get evaluator-specific config
   */
  getEvaluatorConfig(): EvaluatorConfig {
    return { ...this.config.evaluator };
  }

  /**
   * Get patterns config
   */
  getPatternsConfig(): PatternsConfig {
    return { ...this.config.patterns };
  }

  /**
   * Get logging config
   */
  getLoggingConfig(): LoggingConfig {
    return { ...this.config.logging };
  }

  /**
   * Get session config
   */
  getSessionConfig(): SessionConfig {
    return { ...this.config.session };
  }

  /**
   * Get session health config
   */
  getSessionHealthConfig(): SessionHealthConfig {
    return JSON.parse(JSON.stringify(this.config.sessionHealth));
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<FullConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }

  /**
   * Save current configuration to file
   */
  saveToFile(filePath?: string): void {
    const targetPath = filePath ?? this.configPath;
    if (!targetPath) {
      throw new Error('No config file path specified');
    }

    const content = JSON.stringify(this.config, null, 2);
    fs.writeFileSync(targetPath, content, 'utf-8');
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const cfg = this.config.evaluator;

    if (cfg.neutralBand < 0 || cfg.neutralBand > 0.5) {
      errors.push('neutralBand must be between 0 and 0.5');
    }
    if (cfg.dailyTarget <= 0) {
      errors.push('dailyTarget must be positive');
    }
    if (cfg.betAmount <= 0) {
      errors.push('betAmount must be positive');
    }
    if (cfg.singleProfitThreshold < 0 || cfg.singleProfitThreshold > 100) {
      errors.push('singleProfitThreshold must be between 0 and 100');
    }
    if (cfg.cumulativeProfitThreshold < 0) {
      errors.push('cumulativeProfitThreshold must be non-negative');
    }
    if (cfg.p1ConsecutiveThreshold < 2) {
      errors.push('p1ConsecutiveThreshold must be at least 2');
    }

    return { valid: errors.length === 0, errors };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalConfig: ConfigManager | null = null;

export function initConfig(configPath?: string): ConfigManager {
  globalConfig = new ConfigManager(configPath);
  return globalConfig;
}

export function getConfig(): ConfigManager {
  if (!globalConfig) {
    globalConfig = new ConfigManager();
  }
  return globalConfig;
}
