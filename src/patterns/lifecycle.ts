/**
 * Ghost Evaluator v15.3 - Pattern Lifecycle Manager
 * ==================================================
 * Manages pattern states: observing → active → broken
 */

import {
  PatternName,
  PatternCycle,
  PatternState,
  EvaluatedResult,
  EvaluatorConfig,
  Direction,
  PATTERN_NAMES,
  CONTINUOUS_PATTERNS,
  OPPOSITE_PATTERNS,
  DEFAULT_CONFIG,
} from '../types';
import { CycleAnalyticsCollector } from '../data/cycle-analytics-collector';
import { TransitionTrigger } from '../types/cycle-analytics';

// ============================================================================
// PATTERN LIFECYCLE MANAGER
// ============================================================================

export class PatternLifecycleManager {
  private cycles: Map<PatternName, PatternCycle>;
  private config: EvaluatorConfig;
  private analyticsCollector?: CycleAnalyticsCollector;
  private activationStartBlocks: Map<PatternName, number> = new Map();

  constructor(config?: Partial<EvaluatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cycles = new Map();
    this.initializeCycles();
  }

  /**
   * Set the analytics collector for cycle optimization data
   */
  setAnalyticsCollector(collector: CycleAnalyticsCollector): void {
    this.analyticsCollector = collector;
  }

  /**
   * Get the current analytics collector (if set)
   */
  getAnalyticsCollector(): CycleAnalyticsCollector | undefined {
    return this.analyticsCollector;
  }

  /**
   * Initialize all pattern cycles to observing state
   */
  private initializeCycles(): void {
    for (const pattern of PATTERN_NAMES) {
      this.cycles.set(pattern, this.createInitialCycle(pattern));
    }
  }

  /**
   * Create initial cycle state for a pattern
   */
  private createInitialCycle(pattern: PatternName): PatternCycle {
    return {
      state: 'observing',
      isContinuous: CONTINUOUS_PATTERNS.includes(pattern),
      observationResults: [],
      activeResults: [],
      cumulativeProfit: 0,
      allTimeProfit: 0,
      lastRunProfit: 0,
      breakRunProfit: 0,
      breakLoss: 0,
      wasKilled: false,
      lastFormationIndex: -1,
      savedIndicatorDirection: null,
      waitingForIndicator: false,
    };
  }

  /**
   * Get cycle state for a pattern
   */
  getCycle(pattern: PatternName): PatternCycle {
    const cycle = this.cycles.get(pattern);
    if (!cycle) {
      throw new Error(`Unknown pattern: ${pattern}`);
    }
    return this.cloneCycle(cycle);
  }

  private cloneCycle(cycle: PatternCycle): PatternCycle {
    return {
      ...cycle,
      observationResults: (cycle.observationResults ?? []).map(r => ({ ...r })),
      activeResults: (cycle.activeResults ?? []).map(r => ({ ...r })),
    };
  }

  /**
   * Get all cycles
   */
  getAllCycles(): Record<PatternName, PatternCycle> {
    const result: Partial<Record<PatternName, PatternCycle>> = {};
    for (const [pattern, cycle] of this.cycles) {
      result[pattern] = this.cloneCycle(cycle);
    }
    return result as Record<PatternName, PatternCycle>;
  }

  /**
   * Check if pattern is in active state
   */
  isActive(pattern: PatternName): boolean {
    return this.cycles.get(pattern)?.state === 'active';
  }

  /**
   * Check if pattern is in observing state
   */
  isObserving(pattern: PatternName): boolean {
    return this.cycles.get(pattern)?.state === 'observing';
  }

  /**
   * Get cumulative profit for a pattern
   */
  getCumulativeProfit(pattern: PatternName): number {
    return this.cycles.get(pattern)?.cumulativeProfit ?? 0;
  }

  /**
   * Get all-time profit for a pattern
   */
  getAllTimeProfit(pattern: PatternName): number {
    return this.cycles.get(pattern)?.allTimeProfit ?? 0;
  }

  /**
   * Get last run profit for a pattern
   */
  getLastRunProfit(pattern: PatternName): number {
    return this.cycles.get(pattern)?.lastRunProfit ?? 0;
  }

  /**
   * Update last formation index
   */
  updateLastFormation(pattern: PatternName, blockIndex: number): void {
    const cycle = this.cycles.get(pattern);
    if (cycle) {
      cycle.lastFormationIndex = blockIndex;
    }
  }

  /**
   * Apply an evaluated result to a pattern
   * This is the core lifecycle logic
   */
  applyResult(result: EvaluatedResult): {
    activated: boolean;
    broken: boolean;
    previousState: PatternState;
    newState: PatternState;
  } {
    const cycle = this.cycles.get(result.pattern);
    if (!cycle) {
      throw new Error(`Unknown pattern: ${result.pattern}`);
    }

    const previousState = cycle.state;
    let activated = false;
    let broken = false;

    // Update all-time profit (always)
    cycle.allTimeProfit += result.profit;

    if (cycle.state === 'observing') {
      // Record result during observation (no bet was placed)
      cycle.observationResults.push(result);

      // ACCUMULATION RULES:
      // - Never go negative in cumulative profit
      // - Win: add profit to cumulative
      // - Loss: reset cumulative to 0 (opposite pattern gets its own win naturally)
      if (result.profit >= 0) {
        cycle.cumulativeProfit += result.profit;
      } else {
        cycle.cumulativeProfit = 0;
      }

      // Track observation step for analytics
      if (this.analyticsCollector) {
        this.analyticsCollector.recordObservationStep(
          result.pattern,
          result,
          cycle,
          result.evalIndex
        );
        // Also record counterfactual (what would have happened if we bet)
        this.analyticsCollector.recordCounterfactual(
          result.pattern,
          'observing',
          result,
          result.evalIndex
        );
      }

      // Check if should activate
      // NOTE: ZZ/AntiZZ activation is handled by ZZStateManager, not here
      if (this.checkActivation(cycle, result.pattern)) {
        cycle.state = 'active';
        cycle.lastRunProfit = 0; // Run profit starts at 0 - activation trade is NOT part of run
        activated = true;

        // Track activation for analytics
        this.activationStartBlocks.set(result.pattern, result.evalIndex);
        if (this.analyticsCollector) {
          const trigger: TransitionTrigger = this.getActivationTrigger(cycle);
          const triggerValue = trigger === 'single_70'
            ? Math.max(...cycle.observationResults.map(r => r.profit))
            : cycle.cumulativeProfit;
          this.analyticsCollector.recordTransition(
            result.pattern,
            'observing',
            'active',
            trigger,
            result.evalIndex,
            triggerValue,
            cycle
          );
        }
      }
    }

    // Handle active state
    if (cycle.state === 'active' && !cycle.observationResults.includes(result)) {
      // Record result during active phase
      cycle.activeResults.push(result);
      cycle.lastRunProfit += result.profit; // Track last run profit

      // B&S INVERSE TRADE: Always break after evaluation
      // B&S cycle: BAIT → SWITCH → break → wait for next BAIT
      // Pattern stays in BNS bucket, but must re-confirm bait (70%+) before next switch
      if (result.isBnsInverse) {
        cycle.breakLoss = result.profit < 0 ? result.profit : 0;

        // Track break for analytics BEFORE calling breakPattern
        if (this.analyticsCollector) {
          const startBlock = this.activationStartBlocks.get(result.pattern) || 0;
          const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
            cycle, startBlock, result.evalIndex
          );
          this.analyticsCollector.recordTransition(
            result.pattern,
            'active',
            'observing',
            'bns_inverse',
            result.evalIndex,
            result.profit,
            undefined,
            activeRunSummary
          );
        }

        this.breakPattern(result.pattern, result.indicatorDirection);
        broken = true;
        console.log(`[Lifecycle] B&S pattern ${result.pattern} broke after switch trade (profit: ${result.profit.toFixed(0)}%) - waiting for next bait`);
      }
      // Check for normal break condition
      else if (result.profit < 0) {
        // For continuous patterns, any loss breaks
        // For single-shot patterns, loss on evaluation breaks
        if (cycle.isContinuous || !cycle.isContinuous) {
          // Track the break loss (the single loss that broke the pattern)
          cycle.breakLoss = result.profit; // This is negative (e.g., -80)

          // Track break for analytics BEFORE calling breakPattern
          if (this.analyticsCollector) {
            const startBlock = this.activationStartBlocks.get(result.pattern) || 0;
            const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
              cycle, startBlock, result.evalIndex
            );
            this.analyticsCollector.recordTransition(
              result.pattern,
              'active',
              'observing',
              'loss_break',
              result.evalIndex,
              result.profit,
              undefined,
              activeRunSummary
            );
          }

          // For ZZ/AntiZZ, pass the indicator direction for potential persistence
          this.breakPattern(result.pattern, result.indicatorDirection);
          broken = true;
        }
      }
    }

    return {
      activated,
      broken,
      previousState,
      newState: cycle.state,
    };
  }

  /**
   * Determine what triggered activation
   */
  private getActivationTrigger(cycle: PatternCycle): TransitionTrigger {
    const maxSingle = Math.max(...cycle.observationResults.map(r => r.profit), 0);
    if (maxSingle >= this.config.singleProfitThreshold) {
      return 'single_70';
    }
    return 'cumulative_100';
  }

  /**
   * Check if pattern should activate based on observation results
   *
   * ZZ: Activation is handled EXCLUSIVELY by ZZStateManager (pocket system)
   *     See POCKET-SYSTEM-SPEC.md - ZZ activates based on indicator detection
   *     and pocket position, not through lifecycle activation.
   * AntiZZ: NEVER activates through normal checkActivation - only activated by ZZ becoming unprofitable
   * Other patterns: Use 70% threshold (singleProfitThreshold) or 100% cumulative
   */
  private checkActivation(cycle: PatternCycle, pattern?: PatternName): boolean {
    if (cycle.observationResults.length === 0) return false;

    // ZZ activation is handled by ZZStateManager, not lifecycle
    // See POCKET-SYSTEM-SPEC.md for the authoritative rules
    if (pattern === 'ZZ') {
      return false; // Don't activate through lifecycle - ZZStateManager handles this
    }

    // AP5 activates via confirmAP5Pattern(), not through normal checkActivation
    // This allows it to activate on the 3rd block of opposite run, before the flip
    if (pattern === 'AP5') {
      return false; // Don't activate through normal flow - use confirmAP5Pattern()
    }

    // OZ activates via confirmOZPattern(), not through normal checkActivation
    // This allows it to activate on the 3rd block of flip back, checking 1st block for 70%
    if (pattern === 'OZ') {
      return false; // Don't activate through normal flow - use confirmOZPattern()
    }

    // AntiZZ NEVER activates through normal checkActivation
    // It can ONLY be activated when ZZ becomes unprofitable
    if (pattern === 'AntiZZ') {
      return false; // Never activate through normal observation
    }

    // PP activates via confirmPPPattern(), not through normal checkActivation
    // This allows it to activate on the 2nd block of flip back (double), checking 1st block for 70%
    if (pattern === 'PP') {
      return false; // Don't activate through normal flow - use confirmPPPattern()
    }

    // ST activates via confirmSTPattern(), like AP5 but for 2A2 (doubles)
    if (pattern === 'ST') {
      return false; // Don't activate through normal flow - use confirmSTPattern()
    }

    // Check if any single result >= threshold (70%)
    const hasSingleThreshold = cycle.observationResults.some(
      r => r.profit >= this.config.singleProfitThreshold
    );

    // Check if cumulative >= threshold (100%)
    const hasCumulativeThreshold =
      cycle.cumulativeProfit >= this.config.cumulativeProfitThreshold;

    return hasSingleThreshold || hasCumulativeThreshold;
  }

  /**
   * Break a pattern (active → observing)
   *
   * CORRECTED ZZ/AntiZZ handling:
   * - ZZ/AntiZZ state switching is NOW handled by ZZStateManager
   * - This method ONLY handles the basic break logic for lifecycle tracking
   * - Anti-ZZ is NOT activated here (only activated when first prediction is negative)
   * - Pocket assignment is tracked by ZZStateManager for confirmation purposes
   *
   * For ZZ/AntiZZ:
   * - If last run was profitable: stay ACTIVE, save indicator direction
   * - If last run was unprofitable: go to OBSERVING (ZZStateManager decides Anti-ZZ)
   * - NEVER switch to Anti-ZZ based on run profit here
   */
  breakPattern(pattern: PatternName, indicatorDirection?: Direction): void {
    const cycle = this.cycles.get(pattern);
    if (!cycle) return;

    const isZZ = pattern === 'ZZ';
    const isAntiZZ = pattern === 'AntiZZ';
    // Use LAST RUN profit to decide if pattern stays active (not all-time profit)
    const lastRunWasProfitable = cycle.lastRunProfit > 0;

    // Save the break run profit BEFORE resetting (for bucket manager to read)
    cycle.breakRunProfit = cycle.lastRunProfit;

    if ((isZZ || isAntiZZ) && indicatorDirection) {
      if (lastRunWasProfitable) {
        // Last run was profitable - stay ACTIVE and save indicator direction
        // This allows the pattern to resume when alternation returns
        cycle.savedIndicatorDirection = indicatorDirection;
        cycle.lastRunProfit = 0;
        // state stays 'active'
        if (isAntiZZ) {
          console.log(`[Lifecycle] AntiZZ profitable - staying ACTIVE in Pocket 1, continuing`);
        } else {
          console.log(`[Lifecycle] ${pattern} last run profitable - staying ACTIVE, waiting for indicator`);
        }
      } else {
        // Last run was unprofitable - go to OBSERVING
        // NOTE: We do NOT switch to Anti-ZZ here anymore!
        // ZZStateManager handles Anti-ZZ activation based on FIRST PREDICTION
        cycle.state = 'observing';
        cycle.observationResults = [];
        cycle.activeResults = [];
        cycle.cumulativeProfit = 0;
        cycle.lastRunProfit = 0;
        cycle.waitingForIndicator = false;
        cycle.savedIndicatorDirection = null;
        console.log(`[Lifecycle] ${pattern} last run unprofitable (breakProfit: ${cycle.breakRunProfit.toFixed(0)}%) - going to OBSERVING (ZZStateManager handles next activation)`);
      }
    } else {
      // Normal break: go back to observing
      cycle.state = 'observing';
      cycle.observationResults = [];
      cycle.activeResults = [];
      cycle.cumulativeProfit = 0;
      // DEBUG: Log before resetting lastRunProfit to verify breakRunProfit was captured
      console.log(`[Lifecycle] ${pattern} breaking: lastRunProfit=${cycle.lastRunProfit.toFixed(0)}%, breakRunProfit(saved)=${cycle.breakRunProfit.toFixed(0)}%`);
      cycle.lastRunProfit = 0;
      cycle.waitingForIndicator = false;
      cycle.savedIndicatorDirection = null;
      // Note: allTimeProfit and breakRunProfit are preserved
    }
  }

  /**
   * Force activate a pattern (for testing/manual override)
   */
  forceActivate(pattern: PatternName): void {
    const cycle = this.cycles.get(pattern);
    if (cycle) {
      cycle.state = 'active';
    }
  }

  /**
   * Confirm AP5 pattern activation
   *
   * AP5 activates when:
   * - Previous run was 2+ blocks (setup)
   * - Current run just reached 3 blocks (confirmation)
   * - 2nd block of current run is >= 70% (or cumulative >= 100%)
   *
   * @param secondBlockProfit - The profit percentage of the 2nd block in the current run
   * @param blockIndex - Current block index for analytics
   * @returns true if AP5 was activated
   */
  confirmAP5Pattern(secondBlockProfit: number, blockIndex?: number): boolean {
    const cycle = this.cycles.get('AP5');
    if (!cycle || cycle.state === 'active') {
      return false; // Already active or doesn't exist
    }

    // Track cumulative for AP5 activation
    if (secondBlockProfit >= 0) {
      cycle.cumulativeProfit += secondBlockProfit;
    } else {
      cycle.cumulativeProfit = 0;
    }

    // Check if should activate (70% single or 100% cumulative)
    const shouldActivate =
      secondBlockProfit >= this.config.singleProfitThreshold ||
      cycle.cumulativeProfit >= this.config.cumulativeProfitThreshold;

    if (shouldActivate) {
      cycle.state = 'active';
      cycle.lastRunProfit = 0; // Start at 0, not confirmation profit

      // Track activation for analytics
      if (blockIndex !== undefined) {
        this.activationStartBlocks.set('AP5', blockIndex);
      }
      if (this.analyticsCollector && blockIndex !== undefined) {
        const trigger: TransitionTrigger = secondBlockProfit >= this.config.singleProfitThreshold
          ? 'single_70' : 'cumulative_100';
        const triggerValue = trigger === 'single_70' ? secondBlockProfit : cycle.cumulativeProfit;
        this.analyticsCollector.recordTransition(
          'AP5',
          'observing',
          'active',
          trigger,
          blockIndex,
          triggerValue,
          cycle
        );
      }

      console.log(`[Lifecycle] AP5 activated with ${secondBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%)`);
      return true;
    }

    console.log(`[Lifecycle] AP5 confirmation: ${secondBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%) - waiting for threshold`);
    return false;
  }

  /**
   * Break AP5 pattern
   *
   * AP5 breaks when:
   * - Flip happens with 2 or fewer blocks (miss the bet or win by cut at 2 blocks)
   */
  breakAP5Pattern(blockIndex?: number): void {
    const cycle = this.cycles.get('AP5');
    if (!cycle || cycle.state !== 'active') {
      return; // Not active
    }

    // Save breakRunProfit BEFORE resetting (for bucket manager)
    cycle.breakRunProfit = cycle.lastRunProfit;
    cycle.wasKilled = true; // Structural kill, not bet loss

    // Track structural kill for analytics
    if (this.analyticsCollector && blockIndex !== undefined) {
      const startBlock = this.activationStartBlocks.get('AP5') || 0;
      const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
        cycle, startBlock, blockIndex
      );
      this.analyticsCollector.recordTransition(
        'AP5',
        'active',
        'observing',
        'structural_kill',
        blockIndex,
        undefined,
        undefined,
        activeRunSummary
      );
    }

    console.log(`[Lifecycle] AP5 killed (flip with <= 2 blocks) - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);

    // Reset to observing
    cycle.state = 'observing';
    cycle.observationResults = [];
    cycle.activeResults = [];
    cycle.cumulativeProfit = 0;
    cycle.lastRunProfit = 0;
  }

  /**
   * Confirm OZ pattern activation
   *
   * OZ activates when:
   * - 1+ same direction (any length)
   * - Single opposite
   * - 3+ flip back → confirm 70% on 1st block of this run
   *
   * @param firstBlockProfit - The profit percentage of the 1st block in the flip back run
   * @param blockIndex - Current block index for analytics
   * @returns true if OZ was activated
   */
  confirmOZPattern(firstBlockProfit: number, blockIndex?: number): boolean {
    const cycle = this.cycles.get('OZ');
    if (!cycle || cycle.state === 'active') {
      return false; // Already active or doesn't exist
    }

    // Track cumulative for OZ activation
    if (firstBlockProfit >= 0) {
      cycle.cumulativeProfit += firstBlockProfit;
    } else {
      cycle.cumulativeProfit = 0;
    }

    // Check if should activate (70% single or 100% cumulative)
    const shouldActivate =
      firstBlockProfit >= this.config.singleProfitThreshold ||
      cycle.cumulativeProfit >= this.config.cumulativeProfitThreshold;

    if (shouldActivate) {
      cycle.state = 'active';
      cycle.lastRunProfit = 0; // Start at 0, not confirmation profit

      // Track activation for analytics
      if (blockIndex !== undefined) {
        this.activationStartBlocks.set('OZ', blockIndex);
      }
      if (this.analyticsCollector && blockIndex !== undefined) {
        const trigger: TransitionTrigger = firstBlockProfit >= this.config.singleProfitThreshold
          ? 'single_70' : 'cumulative_100';
        const triggerValue = trigger === 'single_70' ? firstBlockProfit : cycle.cumulativeProfit;
        this.analyticsCollector.recordTransition(
          'OZ',
          'observing',
          'active',
          trigger,
          blockIndex,
          triggerValue,
          cycle
        );
      }

      console.log(`[Lifecycle] OZ activated with ${firstBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%)`);
      return true;
    }

    console.log(`[Lifecycle] OZ confirmation: ${firstBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%) - waiting for threshold`);
    return false;
  }

  /**
   * Break OZ pattern
   *
   * OZ breaks when:
   * - Flip back is less than 3 blocks
   */
  breakOZPattern(blockIndex?: number): void {
    const cycle = this.cycles.get('OZ');
    if (!cycle || cycle.state !== 'active') {
      return; // Not active
    }

    // Save breakRunProfit BEFORE resetting (for bucket manager)
    cycle.breakRunProfit = cycle.lastRunProfit;
    cycle.wasKilled = true; // Structural kill, not bet loss

    // Track structural kill for analytics
    if (this.analyticsCollector && blockIndex !== undefined) {
      const startBlock = this.activationStartBlocks.get('OZ') || 0;
      const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
        cycle, startBlock, blockIndex
      );
      this.analyticsCollector.recordTransition(
        'OZ',
        'active',
        'observing',
        'structural_kill',
        blockIndex,
        undefined,
        undefined,
        activeRunSummary
      );
    }

    console.log(`[Lifecycle] OZ killed (flip back < 3 blocks) - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);

    // Reset to observing
    cycle.state = 'observing';
    cycle.observationResults = [];
    cycle.activeResults = [];
    cycle.cumulativeProfit = 0;
    cycle.lastRunProfit = 0;
  }

  /**
   * Confirm PP pattern activation
   *
   * PP is like OZ but activates on 2 (double) instead of 3+:
   * - Called when flip back reaches 2 blocks (double)
   * - Checks if 1st block had 70%+ profit
   * - If yes, activates PP
   *
   * @param firstBlockProfit - The profit percentage of the 1st block in the flip back run
   * @param blockIndex - Current block index for analytics
   */
  confirmPPPattern(firstBlockProfit: number, blockIndex?: number): boolean {
    const cycle = this.cycles.get('PP');
    if (!cycle || cycle.state === 'active') {
      return false; // Already active or doesn't exist
    }

    // Track cumulative for PP activation
    if (firstBlockProfit >= 0) {
      cycle.cumulativeProfit += firstBlockProfit;
    } else {
      cycle.cumulativeProfit = 0;
    }

    // Check if should activate (70% single or 100% cumulative)
    const shouldActivate =
      firstBlockProfit >= this.config.singleProfitThreshold ||
      cycle.cumulativeProfit >= this.config.cumulativeProfitThreshold;

    if (shouldActivate) {
      cycle.state = 'active';
      cycle.lastRunProfit = 0; // Start at 0, not confirmation profit

      // Track activation for analytics
      if (blockIndex !== undefined) {
        this.activationStartBlocks.set('PP', blockIndex);
      }
      if (this.analyticsCollector && blockIndex !== undefined) {
        const trigger: TransitionTrigger = firstBlockProfit >= this.config.singleProfitThreshold
          ? 'single_70' : 'cumulative_100';
        const triggerValue = trigger === 'single_70' ? firstBlockProfit : cycle.cumulativeProfit;
        this.analyticsCollector.recordTransition(
          'PP',
          'observing',
          'active',
          trigger,
          blockIndex,
          triggerValue,
          cycle
        );
      }

      console.log(`[Lifecycle] PP activated with ${firstBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%)`);
      return true;
    }

    console.log(`[Lifecycle] PP confirmation: ${firstBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%) - waiting for threshold`);
    return false;
  }

  /**
   * Break PP pattern
   *
   * PP is continuous during 2A2 rhythm, breaks when:
   * - Run reaches 3+ blocks (exits 2A2, enters OZ territory)
   * - Flip back is 1 (single) - expected double
   * - Loss recorded (handled by recordResult)
   */
  breakPPPattern(blockIndex?: number): void {
    const cycle = this.cycles.get('PP');
    if (!cycle || cycle.state !== 'active') {
      return; // Not active
    }

    // Save breakRunProfit BEFORE resetting (for bucket manager)
    cycle.breakRunProfit = cycle.lastRunProfit;
    cycle.wasKilled = true; // Structural kill, not bet loss

    // Track structural kill for analytics
    if (this.analyticsCollector && blockIndex !== undefined) {
      const startBlock = this.activationStartBlocks.get('PP') || 0;
      const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
        cycle, startBlock, blockIndex
      );
      this.analyticsCollector.recordTransition(
        'PP',
        'active',
        'observing',
        'structural_kill',
        blockIndex,
        undefined,
        undefined,
        activeRunSummary
      );
    }

    console.log(`[Lifecycle] PP broken (structural) - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);

    // Reset to observing
    cycle.state = 'observing';
    cycle.observationResults = [];
    cycle.activeResults = [];
    cycle.cumulativeProfit = 0;
    cycle.lastRunProfit = 0;
  }

  /**
   * Confirm ST pattern activation
   *
   * ST is like AP5 but for 2A2 (doubles):
   * - 2+ → flip → 2 (double with 70% on 1st) → ACTIVATE
   * - Then on flip, predict 2nd block of continuation
   *
   * @param firstBlockProfit - The profit percentage of the 1st block
   * @param blockIndex - Current block index for analytics
   */
  confirmSTPattern(firstBlockProfit: number, blockIndex?: number): boolean {
    const cycle = this.cycles.get('ST');
    if (!cycle || cycle.state === 'active') {
      return false; // Already active or doesn't exist
    }

    // Track cumulative for ST activation
    if (firstBlockProfit >= 0) {
      cycle.cumulativeProfit += firstBlockProfit;
    } else {
      cycle.cumulativeProfit = 0;
    }

    // Check if should activate (70% single or 100% cumulative)
    const shouldActivate =
      firstBlockProfit >= this.config.singleProfitThreshold ||
      cycle.cumulativeProfit >= this.config.cumulativeProfitThreshold;

    if (shouldActivate) {
      cycle.state = 'active';
      cycle.lastRunProfit = 0; // Start at 0, not confirmation profit

      // Track activation for analytics
      if (blockIndex !== undefined) {
        this.activationStartBlocks.set('ST', blockIndex);
      }
      if (this.analyticsCollector && blockIndex !== undefined) {
        const trigger: TransitionTrigger = firstBlockProfit >= this.config.singleProfitThreshold
          ? 'single_70' : 'cumulative_100';
        const triggerValue = trigger === 'single_70' ? firstBlockProfit : cycle.cumulativeProfit;
        this.analyticsCollector.recordTransition(
          'ST',
          'observing',
          'active',
          trigger,
          blockIndex,
          triggerValue,
          cycle
        );
      }

      console.log(`[Lifecycle] ST activated with ${firstBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%)`);
      return true;
    }

    console.log(`[Lifecycle] ST confirmation: ${firstBlockProfit}% (cumulative: ${cycle.cumulativeProfit}%) - waiting for threshold`);
    return false;
  }

  /**
   * Kill ST pattern (structural)
   *
   * ST is killed when:
   * - Run reaches 3+ blocks (exits 2A2, enters OZ territory)
   *
   * ST breaks (loss-based) are handled by recordResult()
   */
  breakSTPattern(blockIndex?: number): void {
    const cycle = this.cycles.get('ST');
    if (!cycle || cycle.state !== 'active') {
      return; // Not active
    }

    // Save breakRunProfit BEFORE resetting (for bucket manager)
    cycle.breakRunProfit = cycle.lastRunProfit;
    cycle.wasKilled = true; // Structural kill (3+ run), not bet loss

    // Track structural kill for analytics
    if (this.analyticsCollector && blockIndex !== undefined) {
      const startBlock = this.activationStartBlocks.get('ST') || 0;
      const activeRunSummary = this.analyticsCollector.buildActiveRunSummary(
        cycle, startBlock, blockIndex
      );
      this.analyticsCollector.recordTransition(
        'ST',
        'active',
        'observing',
        'structural_kill',
        blockIndex,
        undefined,
        undefined,
        activeRunSummary
      );
    }

    console.log(`[Lifecycle] ST killed (3+ run - exited 2A2 rhythm) - breakRunProfit=${cycle.breakRunProfit.toFixed(0)}%`);

    // Reset to observing
    cycle.state = 'observing';
    cycle.observationResults = [];
    cycle.activeResults = [];
    cycle.cumulativeProfit = 0;
    cycle.lastRunProfit = 0;
  }

  /**
   * Check if ZZ/AntiZZ is waiting for indicator
   */
  isWaitingForIndicator(pattern: PatternName): boolean {
    const cycle = this.cycles.get(pattern);
    return cycle?.waitingForIndicator === true;
  }

  /**
   * Get the saved indicator direction for ZZ/AntiZZ
   */
  getSavedIndicatorDirection(pattern: PatternName): Direction | null {
    const cycle = this.cycles.get(pattern);
    return cycle?.savedIndicatorDirection ?? null;
  }

  /**
   * Set the saved indicator direction for ZZ/AntiZZ
   * Used when Anti-ZZ activates to enable signal generation
   */
  setSavedIndicatorDirection(pattern: PatternName, direction: Direction): void {
    const cycle = this.cycles.get(pattern);
    if (cycle) {
      cycle.savedIndicatorDirection = direction;
      console.log(`[Lifecycle] ${pattern} saved indicator direction set to ${direction > 0 ? 'UP' : 'DOWN'}`);
    }
  }

  /**
   * Resume ZZ/AntiZZ when indicator is found
   * Called when a new indicator (≥3 run) matches the saved direction
   */
  resumeFromIndicator(pattern: PatternName): void {
    const cycle = this.cycles.get(pattern);
    if (!cycle) return;

    cycle.waitingForIndicator = false;
    // Keep savedIndicatorDirection for reference, state stays 'active'
  }

  /**
   * Check if should switch to opposite pattern
   */
  shouldSwitchToOpposite(pattern: PatternName): boolean {
    const opposite = OPPOSITE_PATTERNS[pattern];
    if (!opposite) return false;

    const patternActive = this.isActive(pattern);
    const oppositeActive = this.isActive(opposite);

    return !patternActive && oppositeActive;
  }

  /**
   * Get the opposite pattern
   */
  getOpposite(pattern: PatternName): PatternName | null {
    return OPPOSITE_PATTERNS[pattern] ?? null;
  }

  /**
   * Get all active patterns sorted by cumulative profit
   */
  getActivePatternsByProfit(): PatternName[] {
    return PATTERN_NAMES
      .filter(p => this.isActive(p))
      .sort((a, b) => this.getCumulativeProfit(b) - this.getCumulativeProfit(a));
  }

  /**
   * Get all patterns sorted by cumulative profit
   */
  getAllPatternsByProfit(): PatternName[] {
    return [...PATTERN_NAMES].sort(
      (a, b) => this.getCumulativeProfit(b) - this.getCumulativeProfit(a)
    );
  }

  /**
   * Reset all patterns to initial state
   */
  resetAll(): void {
    this.initializeCycles();
  }

  /**
   * Reset a specific pattern
   */
  reset(pattern: PatternName): void {
    this.cycles.set(pattern, this.createInitialCycle(pattern));
  }

  /**
   * Load cycles from saved data
   */
  loadCycles(data: Record<PatternName, PatternCycle>): void {
    for (const [pattern, cycle] of Object.entries(data)) {
      if (PATTERN_NAMES.includes(pattern as PatternName)) {
        this.cycles.set(pattern as PatternName, {
          ...this.cloneCycle(cycle),
          // Provide defaults for fields that may be missing from older sessions
          breakRunProfit: cycle.breakRunProfit ?? 0,
          breakLoss: cycle.breakLoss ?? 0,
          isContinuous: CONTINUOUS_PATTERNS.includes(pattern as PatternName),
        });
      }
    }
  }

  /**
   * Get statistics for all patterns
   */
  getStatistics(): {
    pattern: PatternName;
    state: PatternState;
    cumulativeProfit: number;
    allTimeProfit: number;
    lastRunProfit: number;
    observationCount: number;
    activeCount: number;
  }[] {
    return PATTERN_NAMES.map(pattern => {
      const cycle = this.cycles.get(pattern)!;
      return {
        pattern,
        state: cycle.state,
        cumulativeProfit: cycle.cumulativeProfit,
        allTimeProfit: cycle.allTimeProfit,
        lastRunProfit: cycle.lastRunProfit,
        observationCount: cycle.observationResults.length,
        activeCount: cycle.activeResults.length,
      };
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createLifecycleManager(config?: Partial<EvaluatorConfig>): PatternLifecycleManager {
  return new PatternLifecycleManager(config);
}
