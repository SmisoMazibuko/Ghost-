/**
 * Bait-and-Switch Detector - Episode-Based Pattern Classification
 * ================================================================
 *
 * Tracks "episodes" for each pattern:
 * - Episode starts when pattern activates/enters MAIN
 * - Episode ends when pattern deactivates/leaves MAIN
 * - Only classify as "bait-and-switch" if the episode ends with negative PnL
 *
 * This prevents premature classification during temporary drawdowns.
 */

import {
  BaitSwitchEpisode,
  LedgerEntry,
  PatternName,
} from '../types';

export class BaitSwitchDetector {
  private episodes: Map<PatternName, BaitSwitchEpisode[]> = new Map();
  private currentEpisodes: Map<PatternName, BaitSwitchEpisode> = new Map();

  /**
   * Start a new episode for a pattern (when it enters MAIN/activates)
   */
  startEpisode(pattern: PatternName, blockIndex: number): void {
    // End any existing episode first
    if (this.currentEpisodes.has(pattern)) {
      this.endEpisode(pattern, blockIndex);
    }

    const episode: BaitSwitchEpisode = {
      pattern,
      startBlock: blockIndex,
      endBlock: null,
      trades: [],
      totalPnl: 0,
      isComplete: false,
    };

    this.currentEpisodes.set(pattern, episode);
    console.log(`[BaitSwitch] Episode started for ${pattern} at block ${blockIndex}`);
  }

  /**
   * End an episode for a pattern (when it leaves MAIN/deactivates)
   */
  endEpisode(pattern: PatternName, blockIndex: number): void {
    const episode = this.currentEpisodes.get(pattern);
    if (!episode) {
      return;
    }

    episode.endBlock = blockIndex;
    episode.isComplete = true;

    // Store in history
    if (!this.episodes.has(pattern)) {
      this.episodes.set(pattern, []);
    }
    this.episodes.get(pattern)!.push(episode);

    // Remove from current
    this.currentEpisodes.delete(pattern);

    const isBaitSwitch = episode.totalPnl < 0;
    console.log(`[BaitSwitch] Episode ended for ${pattern} at block ${blockIndex}: PnL=${Math.round(episode.totalPnl)}, BaitSwitch=${isBaitSwitch}`);
  }

  /**
   * Record a trade for a pattern's current episode
   */
  recordTrade(pattern: PatternName, trade: LedgerEntry): void {
    const episode = this.currentEpisodes.get(pattern);
    if (episode) {
      episode.trades.push(trade);
      episode.totalPnl += trade.pnl;
    }
  }

  /**
   * Check if a pattern has exhibited bait-and-switch behavior
   * Only returns true if the LAST completed episode ended negative
   */
  isBaitAndSwitch(pattern: PatternName): boolean {
    const patternEpisodes = this.episodes.get(pattern);
    if (!patternEpisodes || patternEpisodes.length === 0) {
      return false;
    }

    // Check the last completed episode
    const lastEpisode = patternEpisodes[patternEpisodes.length - 1];
    return lastEpisode.isComplete && lastEpisode.totalPnl < 0;
  }

  /**
   * Get bait-and-switch score for a pattern (severity based on episode history)
   * Higher score = more consistently bait-and-switch behavior
   */
  getBaitSwitchScore(pattern: PatternName): number {
    const patternEpisodes = this.episodes.get(pattern);
    if (!patternEpisodes || patternEpisodes.length === 0) {
      return 0;
    }

    const negativeEpisodes = patternEpisodes.filter(e => e.isComplete && e.totalPnl < 0).length;
    return negativeEpisodes / patternEpisodes.length;
  }

  /**
   * Get all episodes for a pattern
   */
  getPatternEpisodes(pattern: PatternName): BaitSwitchEpisode[] {
    const completed = this.episodes.get(pattern) || [];
    const current = this.currentEpisodes.get(pattern);
    return current ? [...completed, current] : [...completed];
  }

  /**
   * Get all completed episodes across all patterns
   */
  getCompletedEpisodes(): BaitSwitchEpisode[] {
    const allEpisodes: BaitSwitchEpisode[] = [];
    this.episodes.forEach(episodes => {
      allEpisodes.push(...episodes.filter(e => e.isComplete));
    });
    return allEpisodes;
  }

  /**
   * Get current (active) episodes
   */
  getCurrentEpisodes(): Map<PatternName, BaitSwitchEpisode> {
    return new Map(this.currentEpisodes);
  }

  /**
   * Check if a pattern has an active episode
   */
  hasActiveEpisode(pattern: PatternName): boolean {
    return this.currentEpisodes.has(pattern);
  }

  /**
   * Get current episode for a pattern (if any)
   */
  getCurrentEpisode(pattern: PatternName): BaitSwitchEpisode | null {
    return this.currentEpisodes.get(pattern) || null;
  }

  /**
   * Get patterns that are currently showing bait-and-switch behavior
   */
  getBaitSwitchPatterns(): PatternName[] {
    const patterns: PatternName[] = [];
    this.episodes.forEach((_episodes, pattern) => {
      if (this.isBaitAndSwitch(pattern)) {
        patterns.push(pattern);
      }
    });
    return patterns;
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalEpisodes: number;
    completedEpisodes: number;
    activeEpisodes: number;
    baitSwitchPatterns: PatternName[];
    patternStats: Map<PatternName, { total: number; negative: number; score: number }>;
  } {
    const patternStats = new Map<PatternName, { total: number; negative: number; score: number }>();

    this.episodes.forEach((episodes, pattern) => {
      const completed = episodes.filter(e => e.isComplete);
      const negative = completed.filter(e => e.totalPnl < 0);
      patternStats.set(pattern, {
        total: completed.length,
        negative: negative.length,
        score: completed.length > 0 ? negative.length / completed.length : 0,
      });
    });

    let totalEpisodes = 0;
    let completedEpisodes = 0;
    this.episodes.forEach(episodes => {
      totalEpisodes += episodes.length;
      completedEpisodes += episodes.filter(e => e.isComplete).length;
    });

    return {
      totalEpisodes,
      completedEpisodes,
      activeEpisodes: this.currentEpisodes.size,
      baitSwitchPatterns: this.getBaitSwitchPatterns(),
      patternStats,
    };
  }

  /**
   * Get snapshot for undo system
   */
  getSnapshot(): {
    episodes: Map<PatternName, BaitSwitchEpisode[]>;
    currentEpisodes: Map<PatternName, BaitSwitchEpisode>;
  } {
    // Deep clone episodes
    const episodesClone = new Map<PatternName, BaitSwitchEpisode[]>();
    this.episodes.forEach((episodes, pattern) => {
      episodesClone.set(pattern, episodes.map(e => ({
        ...e,
        trades: [...e.trades],
      })));
    });

    const currentEpisodesClone = new Map<PatternName, BaitSwitchEpisode>();
    this.currentEpisodes.forEach((episode, pattern) => {
      currentEpisodesClone.set(pattern, {
        ...episode,
        trades: [...episode.trades],
      });
    });

    return {
      episodes: episodesClone,
      currentEpisodes: currentEpisodesClone,
    };
  }

  /**
   * Restore from snapshot
   */
  restoreFromSnapshot(snapshot: {
    episodes: Map<PatternName, BaitSwitchEpisode[]>;
    currentEpisodes: Map<PatternName, BaitSwitchEpisode>;
  }): void {
    this.episodes = new Map();
    snapshot.episodes.forEach((episodes, pattern) => {
      this.episodes.set(pattern, episodes.map(e => ({
        ...e,
        trades: [...e.trades],
      })));
    });

    this.currentEpisodes = new Map();
    snapshot.currentEpisodes.forEach((episode, pattern) => {
      this.currentEpisodes.set(pattern, {
        ...episode,
        trades: [...episode.trades],
      });
    });
  }

  /**
   * Clear all data (for reset/new session)
   */
  clear(): void {
    this.episodes.clear();
    this.currentEpisodes.clear();
  }
}
