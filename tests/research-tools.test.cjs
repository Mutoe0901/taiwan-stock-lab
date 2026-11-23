const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {IDBFactory,IDBKeyRange}=require('fake-indexeddb');
async function app(t,hash='research'){
 const dom=new JSDOM(fs.readFileSync('web/index.html','utf8'),{url:'https://localhost/#'+hash,runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,el=id=>w.document.getElementById(id);Object.assign(w,{indexedDB:new IDBFactory(),IDBKeyRange,TextEncoder,TextDecoder,structuredClone});
 w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.fetch=async()=>{throw Error('Unexpected network');};
 let ready=false;w.stocklabStartup={ready(){ready=true;},fail(msg){throw Error(msg);}};
 if(fs.existsSync('web/browser-storage.js'))w.eval(fs.readFileSync('web/browser-storage.js','utf8'));w.eval(fs.readFileSync('web/main.js','utf8'));
 for(let i=0;i<150&&!ready;i++)await new Promise(r=>setTimeout(r,10));assert.ok(ready,'app ready');
 const panels=()=>Array.from(w.document.querySelectorAll('#research > details'));
 const navigate=id=>{w.location.hash=id;w.dispatchEvent(new w.HashChangeEvent('hashchange'));};
 return {w,el,panels,navigate};
}
test('research starts collapsed, supports multiple open panels, A/B retains its independent route',async t=>{
 const a=await app(t);assert.deepEqual(a.panels().map(p=>[p.id,p.open]),[['strategy',false],['flows',false],['report',false]]);
 a.el('load-demo').click();a.el('strategy').open=true;a.el('flows').open=true;a.el('report').open=true;assert.ok(a.panels().every(p=>p.open));
 let abRenders=0;a.w.StocklabABUI={render:()=>abRenders++};a.navigate('ab');assert.equal(abRenders,1);assert.ok(a.el('ab').classList.contains('active'));assert.ok(!a.el('research').classList.contains('active'));
 a.navigate('research');assert.ok(a.panels().every(p=>p.open),'navigation retains user expansion state');assert.equal(a.w.document.querySelectorAll('nav button').length,5);
});
test('legacy initial deep links and subsequent hash changes open the matching panel',async t=>{
 for(const id of ['strategy','flows','report']){
  const a=await app(t,id);assert.equal(a.w.location.hash,'#'+id);assert.ok(a.el('research').classList.contains('active'));assert.ok(a.el(id).open);assert.equal(a.panels().filter(p=>p.open).length,1);
  const next=id==='report'?'strategy':'report';a.navigate(next);assert.ok(a.el(next).open);assert.ok(a.el(id).open);assert.match(a.el('page-title').textContent,/研究工具/);
  a.navigate('nonexistent');assert.ok(a.el('overview').classList.contains('active'));
 }
});
test('charts and valuation content render while collapsed, and original controls remain wired',async t=>{
 const a=await app(t);a.el('load-demo').click();assert.ok(a.panels().every(p=>!p.open));
 const report=a.el('report');assert.ok(report.querySelector('svg'),'valuation SVG generated despite closed disclosure');assert.match(report.textContent,/DEMO|示範|估值/);
 assert.ok(a.el('price-chart').querySelector('svg'));assert.ok(a.el('volume-chart').querySelector('svg'));
 a.navigate('strategy');a.el('strategy-form').onsubmit({preventDefault(){}});assert.ok(a.el('strategy').querySelector('svg'),'backtest chart rendered');
 a.navigate('flows');a.el('flow-window').onchange();assert.ok(a.el('flows').querySelector('svg'),'institution chart rendered');
 assert.equal(typeof a.el('print-report').onclick,'function');
});
test('browser printing and report button open valuation and restore prior disclosure states',async t=>{
 const a=await app(t);a.el('load-demo').click();a.el('flows').open=true;
 a.w.dispatchEvent(new a.w.Event('beforeprint'));assert.ok(a.el('report').open);a.w.dispatchEvent(new a.w.Event('beforeprint'));a.w.dispatchEvent(new a.w.Event('afterprint'));
 assert.deepEqual(a.panels().map(p=>p.open),[false,true,false]);
 let calls=0;a.w.print=()=>{calls++;a.w.dispatchEvent(new a.w.Event('beforeprint'));assert.ok(a.el('report').open);assert.ok(a.el('research').classList.contains('active'));assert.equal(a.w.location.hash,'#report');a.w.dispatchEvent(new a.w.Event('afterprint'));};
 a.el('print-report').click();assert.equal(calls,1);assert.deepEqual(a.panels().map(p=>p.open),[false,true,false]);
});
