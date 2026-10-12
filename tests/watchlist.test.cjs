const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {JSDOM} = require('jsdom');
const {IDBFactory, IDBKeyRange} = require('fake-indexeddb');

const market = (id, price = 100) => ({schema_version:1, mode:'real', source:'test', stocks:[{id, name:id, bars:Array.from({length:40},(_,i)=>({date:new Date(Date.UTC(2026,7,i+1)).toISOString().slice(0,10),open:price,high:price+1,low:price-1,close:price,volume:1000}))}]});
async function app(t, saved = {}, database = new IDBFactory()) {
  const dom = new JSDOM(readFileSync('web/index.html','utf8'), {url:'https://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window, el=id=>w.document.getElementById(id);
  Object.assign(w,{indexedDB:database,IDBKeyRange,TextEncoder,TextDecoder,structuredClone});
  Object.entries(saved).forEach(([k,v])=>w.localStorage.setItem(k,v));
  w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=async()=>{throw Error('Unexpected network request');};
  let ready=false;
  w.stocklabStartup={ready(){ready=true;},fail(message){throw Error(message);}};
  if(require('node:fs').existsSync('web/browser-storage.js'))w.eval(readFileSync('web/browser-storage.js','utf8'));
  w.eval(readFileSync('web/main.js','utf8'));
  const until=async pred=>{for(let i=0;i<150&&!pred();i++)await new Promise(r=>setTimeout(r,10));assert.ok(pred(),el('error').textContent||'App not ready');};
  await until(()=>ready);
  async function query(id, price=100, error=null){
    w.StocklabMobile.fetchMarket=async()=>{if(error)throw error;return market(id,price);};
    el('fetch-ids').value=id;
    await el('fetch-form').onsubmit({preventDefault(){}});
    if(!error)await until(()=>el('mobile-status').textContent.includes('已保存'));
  }
  return {w,el,query,until,database,ids:()=>Array.from(el('stock').options,o=>o.value),watchIds:()=>Array.from(el('watchlist').querySelectorAll('[data-stock]'),b=>b.dataset.stock),storage:()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]))};
}

test('successive stock queries retain multiple favorites, refresh one stock, survive restart and remove only the target', async t=>{
  const a=await app(t);
  await a.query('2330');a.el('watch-toggle').click();
  await a.query('2317');a.el('watch-toggle').click();
  assert.deepEqual(a.ids().sort(),['2317','2330']);
  assert.deepEqual(a.watchIds().sort(),['2317','2330']);
  assert.equal(a.el('stock').value,'2317');
  await a.query('2330',200);
  assert.equal(a.w.StocklabABBridge.getSelected().bars.at(-1).close,200);
  assert.equal(a.ids().length,2);
  await a.query('6274',100,Error('test outage'));
  assert.deepEqual(a.ids().sort(),['2317','2330']);
  const b=await app(t,a.storage(),a.database);
  assert.deepEqual(b.ids().sort(),['2317','2330']);
  assert.deepEqual(b.watchIds().sort(),['2317','2330']);
  b.el('stock').value='2317';b.el('stock').onchange();
  b.el('remove-stock').click();await b.el('confirm-remove-stock').onclick();
  assert.deepEqual(b.ids(),['2330']);assert.deepEqual(b.watchIds(),['2330']);
});

test('saved favorites without cached quotes remain visible and open a recovery query',async t=>{
  const a=await app(t,{'twlab.watch':'["2330","2317"]','CapacitorStorage.twlab.watch':'["2330","2317"]'});
  assert.deepEqual(a.watchIds(),['2330','2317']);
  a.el('watchlist').querySelector('[data-stock="2317"]').click();
  assert.equal(a.el('fetch-ids').value,'2317');assert.equal(a.el('data-dialog').open,true);
  await a.query('2317');
  assert.deepEqual(a.watchIds(),['2330','2317']);
  assert.match(a.el('watchlist').textContent,/尚未載入/);
});
