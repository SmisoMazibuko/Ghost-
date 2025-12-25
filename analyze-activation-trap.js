const fs = require('fs');

const s1 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-19-24-936Z.json', 'utf8'));
const s2 = JSON.parse(fs.readFileSync('ghost-evaluator/data/sessions/session_2025-12-24T18-57-18-606Z.json', 'utf8'));

console.log('=== SAMEDIR ACTIVATION TRAP ANALYSIS ===\n');

function analyzeActivationTrap(data, name) {
  console.log('--- ' + name + ' ---\n');

  // Get all trades in order
  const trades = data.trades.sort((a, b) => a.openIndex - b.openIndex);

  // Track pattern sequences
  console.log('TRADE SEQUENCE (showing pattern transitions):\n');

  let lastPattern = null;
  let patternRuns = [];
  let currentRun = null;

  trades.forEach((t, idx) => {
    const pattern = t.pattern;
    const result = t.isWin ? 'W' : 'L';
    const pnl = t.pnl;

    if (pattern !== lastPattern) {
      if (currentRun) {
        patternRuns.push(currentRun);
      }
      currentRun = { pattern, trades: [], totalPnl: 0, wins: 0, losses: 0 };
    }

    currentRun.trades.push(t);
    currentRun.totalPnl += pnl;
    if (t.isWin) currentRun.wins++;
    else currentRun.losses++;

    lastPattern = pattern;
  });
  if (currentRun) patternRuns.push(currentRun);

  // Show pattern runs
  console.log('Pattern Run Sequence:\n');
  patternRuns.forEach((run, idx) => {
    const wr = run.trades.length > 0 ? Math.round((run.wins / run.trades.length) * 100) : 0;
    const status = run.totalPnl > 0 ? 'PROFIT' : 'LOSS  ';
    console.log(
      String(idx + 1).padStart(2) + '. ' +
      run.pattern.padEnd(10) + ' | ' +
      run.trades.length + ' trades | ' +
      run.wins + 'W/' + run.losses + 'L | ' +
      status + ': ' + String(Math.round(run.totalPnl)).padStart(5)
    );
  });

  // Find the trap pattern: SameDir profit -> ZZ/XAX profit -> SameDir loss
  console.log('\n\n--- TRAP PATTERN DETECTION ---\n');
  console.log('Looking for: SameDir(profit) -> ZZ/XAX(profit) -> SameDir(loss)\n');

  let trapCount = 0;
  for (let i = 0; i < patternRuns.length - 2; i++) {
    const run1 = patternRuns[i];
    const run2 = patternRuns[i + 1];
    const run3 = patternRuns[i + 2];

    const isZZorXAX = (p) => ['ZZ', 'AntiZZ', '2A2', '3A3', '4A4', '5A5', 'Anti2A2', 'Anti3A3', 'Anti4A4', 'Anti5A5'].includes(p);

    // Check for trap pattern
    if (run1.pattern === 'SameDir' && isZZorXAX(run2.pattern) && run3.pattern === 'SameDir') {
      trapCount++;
      console.log('TRAP #' + trapCount + ':');
      console.log('  1. SameDir: ' + run1.wins + 'W/' + run1.losses + 'L, PnL: ' + Math.round(run1.totalPnl));
      console.log('  2. ' + run2.pattern + ': ' + run2.wins + 'W/' + run2.losses + 'L, PnL: ' + Math.round(run2.totalPnl));
      console.log('  3. SameDir: ' + run3.wins + 'W/' + run3.losses + 'L, PnL: ' + Math.round(run3.totalPnl));

      const netEffect = run1.totalPnl + run3.totalPnl;
      console.log('  -> Net SameDir effect: ' + Math.round(netEffect));
      console.log('');
    }
  }

  if (trapCount === 0) {
    console.log('No trap patterns found.\n');
  }

  // Analyze SameDir activation/deactivation based on reason field
  console.log('\n--- SAMEDIR ACTIVATION STATUS FROM TRADES ---\n');
  const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');

  sameDirTrades.forEach((t, idx) => {
    const result = t.isWin ? 'WIN ' : 'LOSS';
    // Parse the reason to see activation status
    const reason = t.reason || '';
    const lossMatch = reason.match(/loss: (\d+)\/(\d+)/);
    const lossInfo = lossMatch ? lossMatch[1] + '/' + lossMatch[2] : 'N/A';

    console.log(
      '#' + String(idx + 1).padStart(2) + ' Block:' + String(t.openIndex).padStart(3) +
      ' | ' + result +
      ' | PnL:' + String(t.pnl).padStart(5) +
      ' | Loss counter: ' + lossInfo
    );
  });

  // Show what patterns traded between SameDir trades
  console.log('\n--- PATTERNS BETWEEN SAMEDIR TRADES ---\n');

  for (let i = 0; i < sameDirTrades.length - 1; i++) {
    const current = sameDirTrades[i];
    const next = sameDirTrades[i + 1];

    // Find trades between them
    const between = trades.filter(t =>
      t.openIndex > current.openIndex &&
      t.openIndex < next.openIndex &&
      t.pattern !== 'SameDir'
    );

    if (between.length > 0) {
      const patterns = {};
      between.forEach(t => {
        if (!patterns[t.pattern]) patterns[t.pattern] = { wins: 0, losses: 0, pnl: 0 };
        if (t.isWin) patterns[t.pattern].wins++;
        else patterns[t.pattern].losses++;
        patterns[t.pattern].pnl += t.pnl;
      });

      const patternList = Object.entries(patterns)
        .map(([p, s]) => p + '(' + (s.pnl > 0 ? '+' : '') + Math.round(s.pnl) + ')')
        .join(', ');

      const curResult = current.isWin ? 'W' : 'L';
      const nextResult = next.isWin ? 'W' : 'L';

      console.log(
        'SD#' + (i+1) + '(' + curResult + ') -> [' + patternList + '] -> SD#' + (i+2) + '(' + nextResult + ')'
      );
    }
  }
}

analyzeActivationTrap(s1, 'SESSION 1 (Small profit, fake activations)');
console.log('\n\n' + '='.repeat(70) + '\n\n');
analyzeActivationTrap(s2, 'SESSION 2 (Good profit)');
