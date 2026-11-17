const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');
function setup(t){
 const dom=new JSDOM(readFileSync('web/index.html','utf8'),{url:'https://site.example',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,el=id=>w.document.getElementById(id);let uid='alice';
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.AbortSignal=AbortSignal;
 const rows=Array.from({length:100},(_,i)=>({date:new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),open:100,close:100,high:101,low:99,volume:10000}));
 let s={id:'2330',name:'台積電',bars:rows};
 w.StocklabABBridge={getSelected:()=>s,getBundle:()=>({mode:'real'})};
 w.StocklabAlerts={getUid:()=>uid,getResearchToken:async()=>'token'};
 w.StocklabABUI={getOptions:()=>({}),getH1Bars:()=>null};
 w.eval(readFileSync('web/ab-strategies.js','utf8'));
 const calls=[];const series=()=>({setData(data){calls.push(data);},createPriceLine(p){return p;},removePriceLine(){}});
 w.LightweightCharts={CandlestickSeries:'c',HistogramSeries:'v',LineSeries:'l',createSeriesMarkers:()=>({setMarkers(m){calls.push(m);}}),createChart:()=>({addSeries:series,priceScale:()=>({applyOptions(){}}),subscribeCrosshairMove(){},applyOptions(){},timeScale:()=>({fitContent(){}})})};
 w.fetch=async()=>({ok:true,json:async()=>({configured:false})});
 // Set readiness to avoid duplicate DOMContentLoaded initialization in jsdom.
 Object.defineProperty(w.document,'readyState',{value:'complete'});
 w.eval(readFileSync('web/research.js','utf8'));
 return {w,el,calls,account(next){uid=next;w.dispatchEvent(new w.Event('stocklab-account-changed'));},select(next){s=next;w.dispatchEvent(new w.Event('stocklab-data-changed'));}};
}
test('02 opens embedded report; chart handles absent H1 and switching stocks',async t=>{
 const a=setup(t);assert.ok(a.calls.some(x=>x.length===100));
 assert.match(a.el('quick-chatgpt').parentElement.textContent,/本次 API Key/);
 a.el('quick-chatgpt').click();assert.equal(a.el('research-dialog').open,true);
 await new Promise(r=>setTimeout(r,0));assert.match(a.el('research-service-status').textContent,/尚未連接/);
 a.el('research-timeframe').value='H1';a.el('research-timeframe').dispatchEvent(new a.w.Event('change'));
 assert.match(a.el('research-chart-status').textContent,/尚未取得 H1/);
 a.select(undefined);assert.match(a.el('research-chart-status').textContent,/請先載入/);
 assert.equal(a.el('research-dialog').open,false);
});
test('untrusted report output is escaped and keys/results are cleared on account switch',t=>{
 const a=setup(t);
 const html=a.w.StocklabResearch.reportHtml({symbol:'2330',summary:'<img src=x onerror=alert(1)>',sections:[{title:'<script>',text:'<script>alert(1)</script>'}],sources:[{id:'S1',title:'bad',url:'javascript:alert(1)'}]});
 a.el('research-report').innerHTML=html;
 assert.equal(a.el('research-report').querySelector('img,script'),null);
 assert.equal(a.el('research-report').querySelector('a'),null);
 a.el('research-key').value='must-not-persist';a.account('bob');
 assert.equal(a.el('research-key').value,'');assert.equal(a.el('research-report').textContent,'');
 assert.equal(a.el('research-export').disabled,true);
 assert.ok(!JSON.stringify(a.w.localStorage).includes('must-not-persist'));
});
test('02 submits a daily report with one model, then clears secrets on engine switch',async t=>{
 const a=setup(t);let submitted;
 a.w.confirm=()=>true;
 a.w.fetch=async(url,init)=>{
  if(init.method==='POST'){
   submitted=JSON.parse(init.body);
   return {ok:true,json:async()=>({id:'test-job'})};
  }
  return {ok:true,json:async()=>url.includes('test-job')?{status:'completed',progress:100,stage:'完成',report:{symbol:'2330',engine:'daily_stock_analysis',summary:'每日報告'}}:{items:[]}};
 };
 a.el('research-engine').value='daily_stock_analysis';
 a.el('research-engine').dispatchEvent(new a.w.Event('change'));
 await new Promise(r=>setTimeout(r,0));
 assert.equal(a.el('research-deep-model').disabled,true);
 a.el('research-quick-model').value='test-model';
 a.el('research-key').value='SECRET_TEST_KEY';
 a.el('research-start').click();
 await new Promise(r=>setTimeout(r,0));
 assert.equal(submitted.engine,'daily_stock_analysis');
 assert.equal(submitted.deep_model,'test-model');
 assert.equal(a.el('research-key').value,'');
 assert.match(a.el('research-report').textContent,/每日報告/);
 a.el('research-engine').value='tradingagents';
 a.el('research-engine').dispatchEvent(new a.w.Event('change'));
 assert.equal(a.el('research-report').textContent,'');
 assert.equal(a.el('research-deep-model').disabled,false);
 await new Promise(r=>setTimeout(r,0));
});
