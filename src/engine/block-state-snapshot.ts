/**
 * Block State Snapshot Manager - Undo System Support
 * ====================================================
 *
 * Captures complete state at each block for snapshot-based undo.
 *
 * Benefits over replay-based undo:
 * - Faster restoration (no re-processing)
 * - Captures exact state including pause state, ledger state
 * - Allows precise rollback without side effects
 */

import {
  BlockStateSnapshot,
  PatternName,
  PauseState,
  DualLedger,
} from '../types';
import { BucketType } from './bucket-manager';

export interface SnapshotComponents {
  blockIndex: number;
  bucketStates: Record<PatternName, BucketType>;
  pauseState: PauseState | null;
  healthState: {
    totalPnl: number;
    consecutiveLosses: number;
    drawdownLevel: number;
    lastMajorPauseMilestone: number;
  };
  sameDirectionState: {
    isActive: boolean;
    runProfit: number;
    accumulatedLoss: number;
  };
  hostilityState: {
    score: number;
    isLocked: boolean;
  };
  ledgerState: DualLedger;
}

export class BlockStateSnapshotManager {
  private snapshots: Map<number, BlockStateSnapshot> = new Map();
  private maxSnapshots: number;

  constructor(maxSnapshots: number = 100) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Capture a snapshot of the current state
   */
  captureSnapshot(components: SnapshotComponents): BlockStateSnapshot {
    const snapshot: BlockStateSnapshot = {
      blockIndex: components.blockIndex,
      timestamp: Date.now(),
      bucketStates: { ...components.bucketStates },
      pauseState: components.pauseState ? { ...components.pauseState } : null,
      healthState: { ...components.healthState },
      sameDirectionState: { ...components.sameDirectionState },
      hostilityState: { ...components.hostilityState },
      ledgerState: {
        actual: [...components.ledgerState.actual],
        simulated: [...components.ledgerState.simulated],
      },
    };

    this.snapshots.set(components.blockIndex, snapshot);
    this.pruneOldSnapshots();

    return snapshot;
  }

  /**
   * Get a snapshot for a specific block
   */
  getSnapshot(blockIndex: number): BlockStateSnapshot | null {
    return this.snapshots.get(blockIndex) || null;
  }

  /**
   * Get the most recent snapshot
   */
  getLatestSnapshot(): BlockStateSnapshot | null {
    if (this.snapshots.size === 0) {
      return null;
    }

    let latest: BlockStateSnapshot | null = null;
    let latestBlock = -1;

    this.snapshots.forEach((snapshot, block) => {
      if (block > latestBlock) {
        latestBlock = block;
        latest = snapshot;
      }
    });

    return latest;
  }

  /**
   * Get the snapshot closest to (but not after) a given block
   */
  getClosestSnapshot(blockIndex: number): BlockStateSnapshot | null {
    let closest: BlockStateSnapshot | null = null;
    let closestBlock = -1;

    this.snapshots.forEach((snapshot, block) => {
      if (block <= blockIndex && block > closestBlock) {
        closestBlock = block;
        closest = snapshot;
      }
    });

    return closest;
  }

  /**
   * Check if a snapshot exists for a block
   */
  hasSnapshot(blockIndex: number): boolean {
    return this.snapshots.has(blockIndex);
  }

  /**
   * Get all block indices with snapshots
   */
  getSnapshotBlocks(): number[] {
    return Array.from(this.snapshots.keys()).sort((a, b) => a - b);
  }

  /**
   * Get snapshot count
   */
  getSnapshotCount(): number {
    return this.snapshots.size;
  }

  /**
   * Delete snapshots after a certain block (for when undoing)
   */
  deleteSnapshotsAfter(blockIndex: number): number {
    let deleted = 0;
    const toDelete: number[] = [];

    this.snapshots.forEach((_, block) => {
      if (block > blockIndex) {
        toDelete.push(block);
      }
    });

    toDelete.forEach(block => {
      this.snapshots.delete(block);
      deleted++;
    });

    return deleted;
  }

  /**
   * Prune old snapshots to stay within limit
   */
  pruneOldSnapshots(): void {
    if (this.snapshots.size <= this.maxSnapshots) {
      return;
    }

    // Get sorted block indices
    const blocks = this.getSnapshotBlocks();
    const toRemove = blocks.length - this.maxSnapshots;

    // Remove oldest snapshots
    for (let i = 0; i < toRemove; i++) {
      this.snapshots.delete(blocks[i]);
    }
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots.clear();
  }

  /**
   * Get memory usage estimate (for debugging)
   */
  getMemoryEstimate(): number {
    let estimate = 0;

    this.snapshots.forEach(snapshot => {
      // Rough estimate: 100 bytes base + ledger entries
      estimate += 100;
      estimate += snapshot.ledgerState.actual.length * 50;
      estimate += snapshot.ledgerState.simulated.length * 50;
    });

    return estimate;
  }

  /**
   * Export all snapshots (for debugging/persistence)
   */
  exportSnapshots(): BlockStateSnapshot[] {
    return Array.from(this.snapshots.values()).sort(
      (a, b) => a.blockIndex - b.blockIndex
    );
  }

  /**
   * Import snapshots (for persistence restore)
   */
  importSnapshots(snapshots: BlockStateSnapshot[]): void {
    this.clear();
    snapshots.forEach(snapshot => {
      this.snapshots.set(snapshot.blockIndex, {
        ...snapshot,
        ledgerState: {
          actual: [...snapshot.ledgerState.actual],
          simulated: [...snapshot.ledgerState.simulated],
        },
      });
    });
    this.pruneOldSnapshots();
  }

  /**
   * Get summary for logging
   */
  getSummary(): string {
    const blocks = this.getSnapshotBlocks();
    if (blocks.length === 0) {
      return 'No snapshots';
    }
    return `${blocks.length} snapshots (blocks ${blocks[0]}-${blocks[blocks.length - 1]})`;
  }
}
