const test=require('node:test');
const assert=require('node:assert/strict');
const {app,bars,core}=require('./helpers/ab-ui.cjs');
const passing={signalAt:()=>({pass:true,reasons:[]})};
function tradesEngine(data,count=25){return {backtest:(_,strategy)=>({strategy,count:count*2,winRate:0.5,avgReturn:0,maxDrawdown:0.2,trades:Array.from({length:count*2},(_,i)=>({side:i%2?'SHORT':'LONG',signal:data[0].date,entryDate:data[1].date,exitSignalDate:data[2].date,exitDate:data[3].date,entryPrice:100,exitPrice:105,reason:i%2?'FAIL OUT':'PROFIT OUT',return:i%2?-0.06:0.04}))})};}
test('long/short journal excludes exit candle extremes; CSV includes all trades and captured costs',async t=>{
 const data=bars();Object.assign(data[1],{open:100,high:112,low:95,close:102});Object.assign(data[2],{open:102,high:110,low:90,close:104});Object.assign(data[3],{open:105,high:1000,low:1,close:106});
 const a=app(t,{data,engine:tradesEngine(data)});a.el('ab-run').click();
 assert.equal(a.el('ab-export').disabled,false);assert.match(a.el('ab-trades').textContent,/歷史回測交易日誌/);
 const tables=a.el('ab-trades').querySelectorAll('table');assert.equal(tables[1].tBodies[0].rows.length,40,'only 20 per strategy displayed');assert.equal(tables[0].tBodies[0].rows.length,4,'direction/reason review uses full journal');
 a.el('ab-fee').value='9';const [header,...rows]=await a.csv();assert.equal(rows.length,100);
 const object=row=>Object.fromEntries(header.map((h,i)=>[h,row[i]]));
 const long=object(rows[0]),short=object(rows[1]);
 assert.ok(Math.abs(Number(long.mfe)-0.12)<1e-12);assert.ok(Math.abs(Number(long.mae)+0.1)<1e-12);
 assert.ok(Math.abs(Number(short.mfe)-0.1)<1e-12);assert.ok(Math.abs(Number(short.mae)+0.12)<1e-12);
 assert.equal(Number(long.fee),0.1425/100);assert.equal(long.net_return,'0.04');assert.equal(short.net_return,'-0.06');assert.equal(long.signal,data[0].date);
 assert.equal(long.symbol,'2330');assert.equal(long.timeframe,'D1');assert.equal(long.source,'real');
});
test('gap exit open counts for both directions, including same-bar open entry/exit',async t=>{
 const data=bars();Object.assign(data[1],{open:100,high:101,low:99,close:100});Object.assign(data[2],{open:150,high:900,low:1,close:155});
 const engine={backtest:(_,strategy)=>({strategy,trades:[['LONG',data[2].date,150],['SHORT',data[2].date,50],['LONG',data[1].date,100]].map(([side,exitDate,exitPrice])=>({side,signal:data[0].date,entryDate:data[1].date,exitDate,entryPrice:100,exitPrice,return:0,reason:'FAIL OUT'}))})};
 const a=app(t,{data,engine});a.el('ab-mode').value='A';a.el('ab-run').click();const [h,...rows]=await a.csv(),at=(r,k)=>Number(r[h.indexOf(k)]);
 assert.equal(at(rows[0],'mfe'),0.5);assert.equal(at(rows[1],'mfe'),0.5);assert.equal(at(rows[2],'mfe'),0);assert.equal(at(rows[2],'mae'),0);
});
test('real engine CSV preserves every fill/net return for long and short, including delayed zero-volume exits',async t=>{
 const data=bars(350);const original=core.backtest(data,'A',{allowShort:true});assert.ok(original.trades.some(t=>t.side==='SHORT'));
 const delayed=original.trades[0];data.find(b=>b.date===delayed.exitDate).volume=0;
 const a=app(t,{data});a.el('ab-mode').value='A';a.el('ab-short').checked=true;a.el('ab-run').click();
 const expected=core.backtest(data,'A',{allowShort:true}),[h,...rows]=await a.csv();assert.equal(rows.length,expected.trades.length);
 for(let i=0;i<rows.length;i++)for(const [field,csv]of Object.entries({signal:'signal',entryDate:'entry_date',exitDate:'exit_date',entryPrice:'entry_price',exitPrice:'exit_price',reason:'reason',return:'net_return'}))assert.equal(rows[i][h.indexOf(csv)],String(expected.trades[i][field]));
 assert.notEqual(expected.trades[0].exitDate,delayed.exitDate);
});
test('no closed trades disables CSV; quote replacement, source, symbol, timeframe and no-stock clear stale output',t=>{
 const data=bars(),a=app(t,{data,engine:tradesEngine(data,1)});
 for(const mutate of [()=>a.state.stock.bars[0].volume++,()=>a.state.mode='demo',()=>a.state.stock.id='2317',()=>a.el('ab-timeframe').value='H1',()=>a.state.stock=null]){
   a.el('ab-run').click();assert.equal(a.el('ab-export').disabled,false);mutate();a.render();assert.equal(a.el('ab-export').disabled,true);assert.equal(a.el('ab-export').onclick,null);
   a.state.stock={id:'2330',bars:data};a.state.mode='real';a.el('ab-timeframe').value='D1';
 }
 const empty=app(t,{engine:{backtest:(_,strategy)=>({strategy,trades:[]})}});empty.el('ab-run').click();assert.equal(empty.el('ab-export').disabled,true);assert.match(empty.el('ab-trades').textContent,/沒有已平倉/);
});
test('observations dedupe after refresh/restart and preserve expanded state; account and stock isolated',t=>{
 const a=app(t,{engine:passing});assert.equal(a.records()[0].rows.length,4);a.el('ab-observed').open=true;a.render();assert.equal(a.el('ab-observed').open,true);assert.equal(a.records()[0].rows.length,4);
 const b=app(t,{engine:passing,saved:a.storage()});assert.equal(b.records()[0].rows.length,4);
 a.w.StocklabAB.signalAt=()=>({pass:false,reasons:[]});a.account('bob');assert.match(a.el('ab-observed').textContent,/0 筆/);assert.doesNotMatch(a.el('ab-observed').textContent,/BUY IN/);
 a.account('alice');assert.match(a.el('ab-observed').textContent,/4 筆/);a.state.stock.id='2317';a.render();assert.match(a.el('ab-observed').textContent,/0 筆/);
 assert.deepEqual(a.records()[0].key,['alice','2330','D1']);a.account(null);assert.equal(a.el('ab-observed').hidden,true);
});
test('demo, mislabeled DEMO stocks, logged-out, hidden page/tab and unfinished daily bars never recorded',t=>{
 for(const params of [{mode:'demo'},{id:'DEMO1'},{uid:null},{active:false},{now:Date.parse('2024-04-29T12:00:00+08:00')}]){
  const a=app(t,{engine:passing,...params});assert.equal(a.records().length,0,JSON.stringify(params));
 }
 const a=app(t,{engine:passing,active:false});Object.defineProperty(a.w.document,'hidden',{configurable:true,value:true});a.el('ab').classList.add('active');a.render();assert.equal(a.records().length,0);
 Object.defineProperty(a.w.document,'hidden',{configurable:true,value:false});a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));assert.equal(a.records()[0].rows.length,4);
});
test('D1/H1 separate; import refresh invalidates CSV and account clears private H1 cache',async t=>{
 const a=app(t,{engine:passing});a.el('ab-run').click();await a.importH1();assert.equal(a.el('ab-timeframe').value,'H1');assert.equal(a.el('ab-export').disabled,true);
 assert.deepEqual(a.records().map(r=>r.key[2]).sort(),['D1','H1']);const h=a.records().find(r=>r.key[2]==='H1');assert.match(h.rows[0].date,/Z$/);
 a.account('bob');assert.match(a.el('ab-current').textContent,/尚未取得/);assert.doesNotMatch(a.el('ab-observed').textContent,/BUY IN/);assert.equal(a.el('ab-export').disabled,true);
});
test('in-flight personal H1 fetch cannot attach to another stock or account',async t=>{
 for(const change of [a=>{a.state.stock={id:'2317',bars:bars()};},a=>a.account('bob')]){
  const a=app(t,{engine:passing});let resolve;a.w.StocklabAlerts.getCandles=()=>new Promise(r=>resolve=r);a.el('ab-fugle-load').click();change(a);resolve({data:bars().map(b=>({...b,date:b.date+'T09:00:00+08:00'}))});await new Promise(r=>setImmediate(r));
  assert.equal(a.el('ab-timeframe').value,'D1');assert.match(a.el('ab-status').textContent,/已切換/);
 }
});
test('storage corruption/denial is local-only and cannot break signal calculations',t=>{
 const a=app(t,{engine:passing,saved:{'stocklab-observed-v1:["alice","2330","D1"]':'{}'}});assert.match(a.el('ab-observed').textContent,/無法讀寫/);assert.match(a.el('ab-current').textContent,/BUY IN/);
 Object.defineProperty(a.w,'localStorage',{get(){throw Error('denied');}});a.render();assert.match(a.el('ab-current').textContent,/BUY IN/);
});
test('real strategy signals, not just fixture signals, are observed on the final closed bar',t=>{
 const data=bars(350),x=core.compute(data);let end=0;for(let i=64;i<data.length;i++)if(core.signalAt(x,i,1,'A').pass||core.signalAt(x,i,-1,'A').pass)end=i;
 assert.ok(end>64);const a=app(t,{data:data.slice(0,end+1)});assert.ok(a.records()[0].rows.length>0);assert.ok(a.records()[0].rows.every(r=>r.date===data[end].date));
});

test('H1 observation excludes unfinished final candle and retains first-seen values after refresh',async t=>{
 const data=bars(),a=app(t,{engine:passing,data});const first=a.records()[0].rows[0];
 a.state.stock.bars.at(-1).close+=0.1;a.state.stock.bars.at(-1).high+=0.1;a.render();assert.deepEqual(a.records()[0].rows[0],first);
 const candles=data.map(b=>({...b,date:b.date+'T09:00:00+08:00'}));candles.push({...data.at(-1),date:new Date().toISOString().slice(0,10)+'T09:00:00+08:00'});
 // At 09:30 the new 09:00 hourly candle is still open.
 a.w.StocklabH1={...a.w.StocklabH1,closedBars:rows=>require('../web/h1.js').closedBars(rows,Date.parse(candles.at(-1).date)+30*60000)};
 await a.importH1(candles);const h=a.records().find(r=>r.key[2]==='H1');assert.ok(h.rows.every(r=>r.date!==new Date(candles.at(-1).date).toISOString()));
});
test('an in-flight file import cannot cross an account switch',async t=>{
 const a=app(t);let finish;const text=new Promise(r=>finish=r);
 a.el('ab-import').onchange({target:{files:[{text:()=>text}],value:''}});a.account('bob');finish(JSON.stringify({timeframe:'60',data:bars().map(b=>({...b,date:b.date+'T09:00:00+08:00'}))}));
 await new Promise(r=>setImmediate(r));assert.equal(a.el('ab-timeframe').value,'D1');assert.match(a.el('ab-status').textContent,/已切換/);
});
