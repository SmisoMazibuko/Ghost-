#!/usr/bin/env ts-node
/**
 * SD Analysis Agent CLI Runner
 * =============================
 *
 * Run the Same Direction Analysis Agent on session logs.
 *
 * Usage:
 *   npx ts-node src/tests/run-sd-analysis.ts [session1.json] [session2.json] ...
 *
 * If no sessions specified, uses the two default sessions from 2025-12-24.
 *
 * Output:
 *   - Executive summary
 *   - Metrics comparison table (baseline vs depreciation variants)
 *   - Recommendations
 *   - Missing data fields
 *   - Full JSON report saved to analysis-report-{timestamp}.json
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createSDAnalysisAgent,
  SessionLog,
  SDAnalysisReport,
} from './sd-analysis-agent';

// ============================================================================
// DEFAULT SESSIONS
// ============================================================================

const DEFAULT_SESSIONS = [
  'data/sessions/session_2025-12-24T18-19-24-936Z.json',
  'data/sessions/session_2025-12-24T18-57-18-606Z.json',
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('  SAME DIRECTION ANALYSIS AGENT');
  console.log('='.repeat(80));
  console.log();

  // Get session paths from args or use defaults
  const args = process.argv.slice(2);
  const sessionPaths = args.length > 0 ? args : DEFAULT_SESSIONS;

  // Resolve paths relative to ghost-evaluator directory
  const baseDir = path.resolve(__dirname, '..', '..');
  const resolvedPaths = sessionPaths.map(p =>
    path.isAbsolute(p) ? p : path.join(baseDir, p)
  );

  console.log('Loading sessions:');
  resolvedPaths.forEach(p => console.log(`  - ${p}`));
  console.log();

  // Load sessions
  const sessions: SessionLog[] = [];
  for (const sessionPath of resolvedPaths) {
    try {
      const data = fs.readFileSync(sessionPath, 'utf8');
      const session = JSON.parse(data) as SessionLog;
      sessions.push(session);
      console.log(`  Loaded: ${path.basename(sessionPath)} (${session.blocks.length} blocks, ${session.trades.length} trades)`);
    } catch (err) {
      console.error(`  ERROR loading ${sessionPath}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  if (sessions.length === 0) {
    console.error('No sessions loaded. Exiting.');
    process.exit(1);
  }

  console.log();
  console.log('Running analysis...');
  console.log();

  // Create and run agent
  const agent = createSDAnalysisAgent();
  sessions.forEach(s => agent.addSession(s));

  const report = agent.run();

  // Output formatted report
  console.log(agent.formatFullReport(report));

  // Output sensitivity analysis details
  console.log('='.repeat(80));
  console.log('                        SENSITIVITY ANALYSIS');
  console.log('='.repeat(80));
  console.log();

  console.log('Initial Life (K) Sweep:');
  console.log('| Value | PnL    | Max DD | Win Rate | False Deact | LF Capture |');
  console.log('|-------|--------|--------|----------|-------------|------------|');
  report.sensitivityAnalysis.usefulLifeBlocks.results.forEach(r => {
    console.log(`| ${String(r.value).padStart(5)} | ${String(r.pnl).padStart(6)} | ${String(r.maxDrawdown).padStart(6)} | ${(r.winRate * 100).toFixed(1).padStart(7)}% | ${String(r.falseDeactivationCount).padStart(11)} | ${(r.longFlowCaptureRate * 100).toFixed(0).padStart(9)}% |`);
  });
  console.log(`Best: ${report.sensitivityAnalysis.usefulLifeBlocks.bestValue} (PnL: ${report.sensitivityAnalysis.usefulLifeBlocks.bestPnL})`);
  console.log();

  console.log('Pause Threshold Sweep:');
  console.log('| Value | PnL    | Max DD | Win Rate | False Deact | LF Capture |');
  console.log('|-------|--------|--------|----------|-------------|------------|');
  report.sensitivityAnalysis.pauseThreshold.results.forEach(r => {
    console.log(`| ${String(r.value).padStart(5)} | ${String(r.pnl).padStart(6)} | ${String(r.maxDrawdown).padStart(6)} | ${(r.winRate * 100).toFixed(1).padStart(7)}% | ${String(r.falseDeactivationCount).padStart(11)} | ${(r.longFlowCaptureRate * 100).toFixed(0).padStart(9)}% |`);
  });
  console.log(`Best: ${report.sensitivityAnalysis.pauseThreshold.bestValue}% (PnL: ${report.sensitivityAnalysis.pauseThreshold.bestPnL})`);
  console.log();

  // Output regime analysis
  console.log('='.repeat(80));
  console.log('                         REGIME ANALYSIS');
  console.log('='.repeat(80));
  console.log();
  console.log(`SD Active Time:        ${report.regimeAnalysis.sdActiveTime.toFixed(1)}%`);
  console.log(`Pocket Dominance Time: ${report.regimeAnalysis.pocketDominanceTime.toFixed(1)}%`);
  console.log(`Bucket Dominance Time: ${report.regimeAnalysis.bucketDominanceTime.toFixed(1)}%`);
  console.log(`Inactive Time:         ${report.regimeAnalysis.inactiveTime.toFixed(1)}%`);
  console.log();

  // Output false deactivation details
  console.log('='.repeat(80));
  console.log('                    FALSE DEACTIVATION EVENTS');
  console.log('='.repeat(80));
  console.log();
  if (report.falseDeactivationAnalysis.events.length === 0) {
    console.log('No false deactivation events detected.');
  } else {
    console.log(`Total Events: ${report.falseDeactivationAnalysis.totalCount}`);
    console.log(`Total Cost: ${report.falseDeactivationAnalysis.totalCost}`);
    console.log(`Avg Cost/Event: ${report.falseDeactivationAnalysis.averageCostPerEvent.toFixed(0)}`);
    console.log(`Avg Blocks to Reactivation: ${report.falseDeactivationAnalysis.averageBlocksToReactivation.toFixed(1)}`);
    console.log();
    console.log('Events:');
    report.falseDeactivationAnalysis.events.forEach((e, i) => {
      console.log(`  ${i + 1}. Deactivated at block ${e.deactivationBlock}`);
      console.log(`     Reason: ${e.deactivationReason}`);
      console.log(`     Reactivated at block ${e.reactivationBlock} (${e.blocksBeforeReactivation} blocks later)`);
      console.log(`     Direction persisted for ${e.directionPersistedBlocks} blocks`);
      console.log(`     Missed PnL: ${e.missedPnL}, Late Reentry Cost: ${e.costOfLateReentry}`);
      console.log(`     Total Cost: ${e.totalCost}`);
      console.log();
    });
  }

  // Output long flow analysis
  console.log('='.repeat(80));
  console.log('                       LONG FLOW ANALYSIS');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total Long Flows (7+ blocks): ${report.longFlowAnalysis.totalFlows}`);
  console.log(`Captured: ${report.longFlowAnalysis.capturedFlows} (${(report.longFlowAnalysis.captureRate * 100).toFixed(0)}%)`);
  console.log(`Captured PnL: ${report.longFlowAnalysis.capturedFlowPnL}`);
  console.log(`Missed PnL: ${report.longFlowAnalysis.missedFlowPnL}`);
  console.log();

  if (report.longFlowAnalysis.events.length > 0) {
    console.log('Long Flow Events:');
    report.longFlowAnalysis.events.forEach((f, i) => {
      const dir = f.direction === 1 ? 'UP' : 'DOWN';
      const status = f.wasCaptured ? 'CAPTURED' : 'MISSED';
      console.log(`  ${i + 1}. Blocks ${f.startBlock}-${f.endBlock}: ${f.length} ${dir} blocks [${status}]`);
      if (f.wasCaptured) {
        console.log(`     Captured PnL: ${f.capturedPnL}`);
      } else {
        console.log(`     Estimated Missed PnL: ${f.missedPnL}`);
      }
    });
  }
  console.log();

  // Output reversal hostility analysis
  console.log('='.repeat(80));
  console.log('                   REVERSAL HOSTILITY ANALYSIS');
  console.log('='.repeat(80));
  console.log();
  console.log(`High PCT Reversals (>=70%): ${report.reversalHostilityAnalysis.highPctReversalCount}`);
  console.log(`Average Reversal PCT: ${report.reversalHostilityAnalysis.averageReversalPct.toFixed(1)}%`);
  console.log();
  console.log('Average Net Benefit of Pause by Duration (K blocks):');
  report.reversalHostilityAnalysis.pauseBenefitByK.forEach(({ k, averageNetBenefit }) => {
    console.log(`  K=${k}: ${averageNetBenefit.toFixed(0)} avg net benefit`);
  });
  console.log(`Recommended Pause Duration: K=${report.reversalHostilityAnalysis.recommendedPauseThreshold}`);
  console.log();

  // Output next experiments
  console.log('='.repeat(80));
  console.log('                        NEXT EXPERIMENTS');
  console.log('='.repeat(80));
  console.log();
  report.nextExperiments.forEach((exp, i) => {
    console.log(`${i + 1}. ${exp.title}`);
    console.log(`   Objective: ${exp.objective}`);
    console.log(`   Data Needed: ${exp.dataNeeded.join(', ')}`);
    console.log(`   Success Criteria: ${exp.successCriteria}`);
    console.log();
  });

  // Output assumptions
  console.log('='.repeat(80));
  console.log('                          ASSUMPTIONS');
  console.log('='.repeat(80));
  console.log();
  report.assumptions.forEach((a, i) => {
    const validation = a.needsValidation ? ' [NEEDS VALIDATION]' : '';
    console.log(`${i + 1}. ${a.description}${validation}`);
    console.log(`   Impact: ${a.impact}`);
    console.log();
  });

  // Save full JSON report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(baseDir, `analysis-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('='.repeat(80));
  console.log(`Full JSON report saved to: ${reportPath}`);
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
