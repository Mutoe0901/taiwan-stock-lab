const test=require('node:test');
const assert=require('node:assert/strict');
const {verify}=require('../scripts/verify-ab-parity.cjs');
test('pre-PR main versus current: 96 D1/H1 parameter cases compare every signal, fill and metric',()=>{
  const r=verify();assert.equal(r.scenarios,96);assert.equal(r.mismatches,0);assert.ok(r.closedTrades>0);
});
