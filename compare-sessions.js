const fs = require('fs');
const path = require('path');

const basePath = 'C:\\Users\\Okhantu\\Desktop\\The other income\\ghost-evaluator\\data\\sessions\\';

const files = fs.readdirSync(basePath).filter(f => f.endsWith('.json')).sort();

console.log('=== SESSION COMPARISON ===\n');
console.log('Session                  | PnL    | Trades | SameDir | SameDir PnL | Win%');
console.log('-------------------------|--------|--------|---------|-------------|-----');

files.forEach(f => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(basePath, f), 'utf8'));
    const trades = data.trades || [];
    const sameDirTrades = trades.filter(t => t.pattern === 'SameDir');
    const sameDirPnl = sameDirTrades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = trades.filter(t => t.isWin).length;
    const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0;

    const sessionName = f.substring(8, 27);
    console.log(
      sessionName.padEnd(24) + ' | ' +
      String(data.pnlTotal || 0).padStart(6) + ' | ' +
      String(trades.length).padStart(6) + ' | ' +
      String(sameDirTrades.length).padStart(7) + ' | ' +
      String(Math.round(sameDirPnl)).padStart(11) + ' | ' +
      String(winRate + '%').padStart(4)
    );
  } catch(e) {
    console.log(f + ': Error - ' + e.message);
  }
});
