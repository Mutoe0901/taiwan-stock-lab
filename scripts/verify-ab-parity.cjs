/* Execute the pre-integration engine and current engine independently. No live API. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = '90df9ed46d09d36c07898e90bff2f191c2ac65d4';
const baselineHash = '504cd5938ac0260c1b5d5ce25569728697d05df109f639bdcd75d19a6af8e5db';
function verify() {
  const filename = path.join(root, 'tests/fixtures/ab-strategies-before-pr2.cjs');
  assert.equal(createHash('sha256').update(fs.readFileSync(filename)).digest('hex'), baselineHash, 'frozen baseline must retain its provenance');
  const old = require(filename), current = require('../web/ab-strategies.js');
  assert.notEqual(old, current, 'must load two separate engine versions');
  const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const bundle = JSON.parse(html.match(/<script[^>]*id="stocklab-demo"[^>]*>([\s\S]*?)<\/script>/)[1]);
  const parameters = [
    {name:'default', options:{}},
    {name:'both-zero-cost', options:{allowShort:true,fee:0,tax:0,slippage:0,volumeRatio:0.8}},
    {name:'both-standard-cost', options:{allowShort:true,volumeRatio:0.8}},
    {name:'institution-high-cost', options:{allowShort:true,requireInstitution:true,volumeRatio:1,fee:0.003,tax:0.006,slippage:0.005}}
  ];
  const report = {baselineCommit:baseline, baselineEngineSha256:baselineHash,
    fixture:'Six bundled synthetic OHLCV series; H1 maps the same prices to weekday session hours. Not paid or live quote data.',
    scenarios:0,signalComparisons:0,exitComparisons:0,scoreComparisons:0,closedTrades:0,longTrades:0,shortTrades:0,mismatches:0,cases:[]};
  for (const stock of bundle.stocks) for (const timeframe of ['D1','H1']) {
    let day = new Date('2023-09-18T00:00:00Z'), slot = 0;
    const bars = timeframe==='D1' ? stock.bars : stock.bars.map(bar=>{
      while ([0,6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate()+1);
      const date=day.toISOString().slice(0,10)+'T'+String(9+slot).padStart(2,'0')+':00:00+08:00';
      if(++slot===5){slot=0;day.setUTCDate(day.getUTCDate()+1);}
      return {...bar,date};
    });
    const before=old.compute(bars), after=current.compute(bars);
    for (const parameter of parameters) for (const strategy of ['A','B']) {
      const label=[stock.id,timeframe,parameter.name,strategy].join('/');
      const options={...parameter.options,dailyBars:stock.bars};
      for(let i=0;i<bars.length;i++) for(const side of [1,-1]) {
        assert.deepEqual(current.signalAt(after,i,side,strategy,options),old.signalAt(before,i,side,strategy,options),label+' signal '+i+'/'+side);
        assert.equal(current.exitAt(after,i,side),old.exitAt(before,i,side),label+' exit '+i+'/'+side);
        assert.equal(current.scoreAt(after,i,side),old.scoreAt(before,i,side),label+' score '+i+'/'+side);
        report.signalComparisons++;report.exitComparisons++;report.scoreComparisons++;
      }
      const expected=old.backtest(bars,strategy,options), actual=current.backtest(bars,strategy,options);
      // Deep comparison includes every signal/entry/exit time, raw fill, reason,
      // net return, equity path, open position and unrounded aggregate metric.
      assert.deepEqual(actual,expected,label+' full backtest');
      const long=actual.trades.filter(t=>t.side==='LONG').length, short=actual.trades.filter(t=>t.side==='SHORT').length;
      report.scenarios++;report.closedTrades+=actual.count;report.longTrades+=long;report.shortTrades+=short;
      report.cases.push({label,bars:bars.length,closedTrades:actual.count,long,short,winRate:actual.winRate,avgReturn:actual.avgReturn,maxDrawdown:actual.maxDrawdown});
    }
  }
  assert.ok(report.longTrades>0 && report.shortTrades>0,'comparison must exercise both directions');
  for(const timeframe of ['D1','H1']) assert.ok(report.cases.some(c=>c.label.includes('/'+timeframe+'/')&&c.short>0));
  return report;
}
module.exports={verify};
if(require.main===module){const report=verify();if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,cases:undefined},null,2));}
