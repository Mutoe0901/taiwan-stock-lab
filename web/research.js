/* v0.7.3: Lightweight Charts + isolated Python research APIs. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Number.isFinite(v)?(v*100).toFixed(2)+'%':'—';
const fmt=v=>Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:2}):'—';
const bridge=()=>window.StocklabABBridge;
const stock=()=>bridge()?.getSelected?.();
const owner=()=>window.StocklabAlerts?.getUid?.()||null;
let chart=null,candles=null,volume=null,ema5=null,ema10=null,ma20=null,markerApi=null,refs=[],chartKey='',currentChart=null;
let analysisEpoch=0,pollTimer=null,activeJob=null,currentReport=null,backtestResult=null,backtestEpoch=0;
const barFields=['date','open','high','low','close','volume','foreign','trust'];
const clean=bars=>bars.map(b=>Object.fromEntries(barFields.filter(k=>b[k]!==undefined&&b[k]!==null).map(k=>[k,b[k]])));
const copyStock=s=>({id:s.id,name:s.name||'',sector:s.sector||'',bars:clean(s.bars)});
function timeOf(date){return date.length===10?date:Math.floor(Date.parse(date)/1000);}
function notice(id,message,bad=false){const el=$(id);if(el){el.textContent=message;el.classList.toggle('research-error',bad);}}
function endpoint(){const native=window.StocklabCapacitor?.Capacitor?.isNativePlatform?.();return native?String(window.STOCKLAB_ALERTS_CONFIG?.workerUrl||'').replace(/\/$/,'')+'/api/research':'/api/research';}
async function api(path,{method='GET',data,publicCall=false}={}){
 const uid=owner();const token=publicCall?'':await window.StocklabAlerts?.getResearchToken?.();
 if(!publicCall&&(!uid||!token))throw Error('請先到「05 A/B策略」登入並驗證帳號。');
 const response=await fetch(endpoint()+path,{method,cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(path==='/backtest'?65000:35000)});
 let body;try{body=await response.json();}catch{throw Error('研究服務尚未更新或未連線，請先完成後端部署。');}
 if(!publicCall&&owner()!==uid)throw Error('帳號已切換，已停止顯示上一個帳號的結果。');
 if(!response.ok)throw Error(typeof body.detail==='string'?body.detail:'研究服務錯誤（'+response.status+'）');
 return body;
}
function analysisContext(){
 let context=window.StocklabResearchContext?.()||'';
 const bars=window.StocklabABUI?.getH1Bars?.();
 if(!bars?.length)return context+'\n【H1】尚未取得 H1 資料，不可由日 K 推定。';
 const x=window.StocklabAB.compute(bars),i=bars.length-1,options=window.StocklabABUI.getOptions();
 return context+'\n【H1 已收盤資料】'+JSON.stringify({last:bars.at(-1),count:bars.length,signals:['A','B'].map(strategy=>({strategy,long:window.StocklabAB.signalAt(x,i,1,strategy,options),short:window.StocklabAB.signalAt(x,i,-1,strategy,options)}))});
}
function dataForChart(){
 const s=stock();if(!s)throw Error('請先載入股票資料。');
 const tf=$('research-timeframe').value;
 const bars=tf==='H1'?window.StocklabABUI?.getH1Bars?.():s.bars;
 if(!bars?.length)throw Error('尚未取得 H1 資料，請按「讀取 H1」或在 05 匯入。');
 return {s,tf,bars};
}
function priceReferences(){
 if(!candles)return;
 for(const ref of refs)candles.removePriceLine(ref);refs=[];
 for(const [id,title,color] of [['research-entry','自訂進場參考','#218b70'],['research-stop','自訂停損參考','#b74e55'],['research-target','自訂目標參考','#a17b23']]){
  const value=Number($(id).value);if(value>0&&Number.isFinite(value))refs.push(candles.createPriceLine({price:value,color,lineWidth:1,lineStyle:2,axisLabelVisible:true,title}));
 }
}
function draw(){
 if(!$('research-chart'))return;
 try{
  const {s,tf,bars}=dataForChart(),lib=window.LightweightCharts;
  if(!lib)throw Error('圖表模組未載入，請重新整理。');
  if(!chart){
   chart=lib.createChart($('research-chart'),{autoSize:true,layout:{background:{color:'#ffffff'},textColor:'#264b52',attributionLogo:true},grid:{vertLines:{color:'#edf3f0'},horzLines:{color:'#edf3f0'}},timeScale:{timeVisible:tf==='H1',secondsVisible:false,tickMarkFormatter:t=>typeof t==='number'?new Date(t*1000).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}):typeof t==='string'?t:`${t.month}/${t.day}`},localization:{locale:'zh-TW',timeFormatter:t=>typeof t==='number'?new Date(t*1000).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):typeof t==='string'?t:`${t.year}-${t.month}-${t.day}`}});
   candles=chart.addSeries(lib.CandlestickSeries,{upColor:'#cf5362',downColor:'#1a997a',borderVisible:false,wickUpColor:'#cf5362',wickDownColor:'#1a997a'});
   volume=chart.addSeries(lib.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});
   chart.priceScale('right').applyOptions({scaleMargins:{top:.08,bottom:.28}});
   chart.priceScale('volume').applyOptions({scaleMargins:{top:.8,bottom:0},visible:false});
   ema5=chart.addSeries(lib.LineSeries,{color:'#db9d36',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
   ema10=chart.addSeries(lib.LineSeries,{color:'#4089bd',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
   ma20=chart.addSeries(lib.LineSeries,{color:'#9275bb',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
   markerApi=lib.createSeriesMarkers(candles,[]);
   chart.subscribeCrosshairMove(p=>{if(!p.time||!currentChart)return;const i=currentChart.bars.findIndex(b=>timeOf(b.date)===p.time);if(i<0)return;const b=currentChart.bars[i];notice('research-chart-value',b.date+'｜開 '+fmt(b.open)+' 高 '+fmt(b.high)+' 低 '+fmt(b.low)+' 收 '+fmt(b.close)+'｜量 '+fmt(b.volume));});
  }
  const x=window.StocklabAB.compute(bars),key=s.id+':'+tf;
  currentChart={s,tf,bars};chart.applyOptions({timeScale:{timeVisible:tf==='H1'}});
  candles.setData(bars.map(b=>({time:timeOf(b.date),open:b.open,high:b.high,low:b.low,close:b.close})));
  volume.setData(bars.map(b=>({time:timeOf(b.date),value:b.volume,color:b.close>=b.open?'#cf536255':'#1a997a55'})));
  for(const [series,values]of [[ema5,x.e5],[ema10,x.e10],[ma20,x.ma20]])series.setData(bars.flatMap((b,i)=>Number.isFinite(values[i])?[{time:timeOf(b.date),value:values[i]}]:[]));
  const mode=$('research-marker-mode').value;
  let events=[];
  if(mode!=='none'&&bars.length>=65){const result=window.StocklabAB.backtest(bars,mode,{...(window.StocklabABUI?.getOptions?.()||{}),dailyBars:s.bars});events=result.events;}
  markerApi.setMarkers(events.map(e=>({time:timeOf(e.date),position:e.label==='BUY IN'?'belowBar':'aboveBar',color:e.label.includes('OUT')?'#a17b23':e.label==='BUY IN'?'#cf5362':'#1a997a',shape:e.label==='BUY IN'?'arrowUp':e.label==='SELL IN'?'arrowDown':'circle',text:e.label})));
  if(chartKey!==key){chart.timeScale().fitContent();chartKey=key;for(const id of ['research-entry','research-stop','research-target'])$(id).value='';}
  priceReferences();
  notice('research-chart-label',s.id+' '+s.name+'｜'+tf+'｜'+bars.length+' 根｜截至 '+bars.at(-1).date);
  notice('research-chart-status',tf==='H1'?'H1 訊號依已收盤 K 線；標記為原 A/B 引擎的歷史模擬成交。':'日 K 訊號，不代表 H1 訊號；標記為原 A/B 引擎的歷史模擬成交。');
  $('price-chart')?.closest('article')?.classList.add('research-original-hidden');
 }catch(e){notice('research-chart-status',e.message,true);if(candles){candles.setData([]);volume.setData([]);ema5.setData([]);ema10.setData([]);ma20.setData([]);markerApi.setMarkers([]);}currentChart=null;$('price-chart')?.closest('article')?.classList.remove('research-original-hidden');}
}
function showDialog(id){const d=$(id);if(!d.open)d.showModal();}
async function serviceStatus(id){try{const r=await api('/status',{publicCall:true});notice(id,r.configured?'研究服務已連線；回測不呼叫模型，AI 分析使用你本次輸入的 API Key。':'尚未連接 Python 研究服務；互動圖表及原有本機回測仍可使用。',!r.configured);return r.configured;}catch(e){notice(id,e.message,true);return false;}}
function clearAnalysis(){analysisEpoch++;clearTimeout(pollTimer);activeJob=null;currentReport=null;$('research-report').replaceChildren();$('research-history').replaceChildren();$('research-progress').value=0;$('research-export').disabled=true;$('research-key').value='';$('research-start').disabled=false;$('research-force').disabled=false;}
async function history(){
 const s=stock(),epoch=analysisEpoch,uid=owner();if(!s||!uid)return;
 try{const r=await api('/analyses?symbol='+encodeURIComponent(s.id));if(epoch!==analysisEpoch||owner()!==uid||stock()?.id!==s.id)return;
  const select=$('research-history');select.replaceChildren(new Option('選擇已保存的報告／進行中任務',''));
  for(const job of r.items)select.add(new Option(new Date(job.created*1000).toLocaleString('zh-TW')+' · '+({completed:'已完成',running:'分析中',queued:'等待中',failed:'未完成'}[job.status]||job.status),job.id));
  const latest=r.items.find(x=>['completed','running','queued'].includes(x.status));if(latest)await readJob(latest.id,epoch);
 }catch(e){notice('research-analysis-status',e.message,true);}
}
function reportHtml(report){
 const sources=(report.sources||[]).map(s=>{
  let url='';try{const u=new URL(s.url);if(u.protocol==='https:')url=u.href;}catch{}
  return '<li class="research-source">['+esc(s.id)+'] '+(url?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(s.title)+'</a>':esc(s.title))+'<small>'+esc(s.date)+'｜'+esc(s.scope)+'</small></li>';
 }).join('');
 return '<p class="research-badge">'+esc(report.symbol)+' '+esc(report.name)+' · '+esc(report.engine)+'</p><p>分析日期：'+esc(report.analysis_date)+'｜行情截止：'+esc(report.quote_date)+'</p><p class="caption">模型：'+esc(report.quick_model)+'／'+esc(report.deep_model)+'</p><div class="research-text">'+esc(report.summary)+'</div>'+(report.sections||[]).map(s=>'<details><summary>'+esc(s.title)+'</summary><div class="research-text">'+esc(s.text)+'</div></details>').join('')+'<h3>資料來源與日期</h3><ol>'+sources+'</ol><h3>資料缺口</h3><ul>'+(report.missing||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
}
async function readJob(id,epoch=analysisEpoch){
 clearTimeout(pollTimer);activeJob=id;
 try{const r=await api('/analyses/'+encodeURIComponent(id));if(epoch!==analysisEpoch||activeJob!==id)return;
  notice('research-analysis-status',r.error||r.stage,r.status==='failed');$('research-progress').value=r.progress;
  const pending=['queued','running'].includes(r.status);$('research-start').disabled=pending;$('research-force').disabled=pending;
  if(r.status==='completed'&&r.report){currentReport=r.report;$('research-report').innerHTML=reportHtml(r.report);$('research-export').disabled=false;}
  if(pending)pollTimer=setTimeout(()=>readJob(id,epoch),3000);
 }catch(e){if(epoch===analysisEpoch){notice('research-analysis-status',e.message+' 可按「重新讀取」繼續查詢，不會重新付費。',true);$('research-start').disabled=false;$('research-force').disabled=false;}}
}
async function openAnalysis(){
 clearAnalysis();const s=stock();if(!s){notice('research-analysis-status','請先載入真實個股資料。',true);showDialog('research-dialog');return;}
 $('research-title').textContent=s.id+' '+s.name+'｜個股深度分析';
 showDialog('research-dialog');
 if(await serviceStatus('research-service-status'))await history();
}
async function analyze(force){
 const s=stock(),uid=owner();if(!s)throw Error('請先載入個股資料');
 if(bridge().getBundle()?.mode==='demo')throw Error('AI 深度分析不使用虛構行情，請先載入真實個股。');
 if(!uid)throw Error('請先到「05 A/B策略」登入帳號。');
 if(!/\S/.test($('research-quick-model').value)||!/\S/.test($('research-deep-model').value))throw Error('請填入你的供應商可用模型名稱。');
 if(!confirm(force?'重新分析會再次呼叫模型 API 並可能產生費用，確定執行？':'將把此股票資料傳至研究服務及你選擇的模型供應商，使用本次 API Key 分析並可能產生費用，確定執行？'))return;
 const epoch=++analysisEpoch;clearTimeout(pollTimer);$('research-start').disabled=true;$('research-force').disabled=true;
 notice('research-analysis-status','正在送出分析…');
 const key=$('research-key').value.trim();$('research-key').value='';
 try{const bundle=bridge().getBundle(),payload={stock:copyStock(s),context:analysisContext(),source:bundle.source||'使用者載入',fetched_at:bundle.fetched_at||'',provider:$('research-provider').value,quick_model:$('research-quick-model').value.trim(),deep_model:$('research-deep-model').value.trim(),api_key:key,finmind_token:$('research-finmind').checked?($('token')?.value.trim()||''):'',force};
  const job=await api('/analyses',{method:'POST',data:payload});if(epoch!==analysisEpoch||owner()!==uid||stock()?.id!==s.id)return;await readJob(job.id,epoch);
 }catch(e){if(epoch===analysisEpoch){notice('research-analysis-status',e.message,true);$('research-start').disabled=false;$('research-force').disabled=false;}}
}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function renderBacktest(r){
 $('research-backtest-output').innerHTML='<p class="research-badge">'+esc(r.engine)+' · '+esc(r.symbol)+' · '+esc(r.timeframe)+'</p><p>'+esc(r.first)+' ～ '+esc(r.last)+'｜'+r.bars+' 根'+(r.demo?'｜虛構資料，僅供測試':'')+'</p>'+r.results.map(s=>'<h3>策略 '+esc(s.strategy)+'</h3><div class="research-metrics">'+[['已完成交易',s.count],['勝率',pct(s.win_rate)],['含未實現報酬',pct(s.total_return)],['最大回撤',pct(s.max_drawdown)],['期末權益',fmt(s.final_equity)],['買進持有（未扣成本）',pct(s.benchmark_return)]].map(([k,v])=>'<div>'+k+'<strong>'+v+'</strong></div>').join('')+'</div><p>拒單 '+s.rejected_orders+' 次；'+(s.open_position?'有尚未平倉部位':'目前無未平倉部位')+'。獲利因子：'+fmt(s.profit_factor)+'</p>'+table(['訊號時間','進場時間','出場時間','方向','股數','淨損益','報酬','原因'],s.trades.slice(-100).reverse().map(t=>[t.signal_date,t.entry_date,t.exit_date,t.side,t.size,fmt(t.pnl),pct(t.return),t.reason]))).join('')+'<h3>回測假設</h3><ul>'+r.assumptions.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
}
async function backtest(){
 const s=stock();if(!s)throw Error('請先載入個股資料');
 const tf=$('research-bt-timeframe').value,bars=tf==='H1'?window.StocklabABUI?.getH1Bars?.():s.bars;
 if(!bars?.length)throw Error('請先於 05 讀取／匯入 H1 行情。');
 const epoch=++backtestEpoch,uid=owner();$('research-bt-run').disabled=true;notice('research-bt-status','Backtrader 正在回測…');
 try{const r=await api('/backtest',{method:'POST',data:{stock:{...copyStock(s),bars:clean(bars)},timeframe:tf,strategy:$('research-bt-strategy').value,options:window.StocklabABUI.getOptions(),daily_bars:clean(s.bars),initial_cash:Number($('research-cash').value),lot_size:Number($('research-lot').value),start:$('research-start-date').value||null,end:$('research-end-date').value||null,demo:bridge().getBundle()?.mode==='demo'}});
  if(epoch!==backtestEpoch||owner()!==uid||stock()?.id!==s.id)return;
  backtestResult=r;renderBacktest(r);$('research-bt-export').disabled=false;notice('research-bt-status','回測完成；參數沿用 05 的手續費、稅、滑價與策略過濾設定。');
 }finally{if(epoch===backtestEpoch)$('research-bt-run').disabled=false;}
}
function download(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function init(){
 if(!$('overview')||!$('strategy'))return;
 $('overview').insertAdjacentHTML('afterbegin',`<article class="panel research-chart-panel"><div class="panel-head"><div><h2>互動 K 線與策略標記</h2><p id="research-chart-label">載入股票後顯示</p></div><button id="research-analyze-open" class="dark">AI 個股深度分析</button></div><div class="form-grid"><label>圖表週期<select id="research-timeframe"><option value="D1">日 K</option><option value="H1">H1 已收盤 K 線</option></select></label><label>歷史模擬標記<select id="research-marker-mode"><option value="A">A 原始策略</option><option value="B">B 過濾策略</option><option value="none">不顯示</option></select></label><button id="research-h1">讀取 H1</button><button id="research-fit">顯示全部</button></div><p id="research-chart-value" class="research-legend">EMA5（金）／EMA10（藍）／MA20（紫）／成交量</p><div id="research-chart" class="research-chart"></div><p id="research-chart-status" role="status"></p><div class="chart-reference"><label>自訂進場參考價<input id="research-entry" type="number" min="0" step="any" placeholder="選填"></label><label>自訂停損參考價<input id="research-stop" type="number" min="0" step="any" placeholder="選填"></label><label>自訂目標參考價<input id="research-target" type="number" min="0" step="any" placeholder="選填"></label></div><p class="caption">參考線由你輸入，不會更改雲端策略或推播條件。歷史模擬標記不代表已發送通知。</p><p class="research-attribution">TradingView Lightweight Charts™ · <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a> · <a href="vendor/lightweight-charts.LICENSE.txt">Apache-2.0</a> · Copyright (с) 2025 TradingView, Inc.</p></article>`);
 $('strategy').insertAdjacentHTML('afterbegin','<article class="panel"><div class="panel-head"><div><h2>Backtrader 策略體檢</h2><p>沿用 A/B 策略訊號，透過 Python 模擬成交、成本、資金與持股。</p></div><button id="research-bt-open" class="dark">開啟 Backtrader 回測</button></div><p class="caption">原有本機回測仍在下方；Backtrader 使用約 95% 倉位與整股／整張設定，結果可能不同。</p></article>');
 document.body.insertAdjacentHTML('beforeend',`<dialog id="research-dialog" class="research-dialog"><form method="dialog" class="dialog-head"><h2 id="research-title">個股深度分析</h2><button aria-label="關閉">✕</button></form><p id="research-service-status" class="research-status" role="status"></p><details><summary>模型設定（只在開始新分析時需要）</summary><div class="form-grid"><label>供應商<select id="research-provider"><option value="openai">OpenAI</option><option value="google">Google Gemini</option><option value="anthropic">Anthropic</option><option value="openrouter">OpenRouter</option></select></label><label>本次 API Key<input id="research-key" type="password" autocomplete="off" spellcheck="false" placeholder="不保存在瀏覽器或報告"></label><label>分析模型名稱<input id="research-quick-model" placeholder="依你的 API 可用模型填寫" maxlength="100"></label><label>整合模型名稱<input id="research-deep-model" placeholder="可與分析模型相同" maxlength="100"></label></div><label class="research-check"><input id="research-finmind" type="checkbox">本次使用已填寫的 FinMind Token 補充月營收與財報</label><p class="caption">按下分析後，個股資料會交給所選模型供應商。金鑰只用於這次任務；費用依供應商計費。Google 登入不會自動取得模型 API Key。</p></details><div class="actions"><button id="research-start" class="dark">開始分析／讀取同日快取</button><button id="research-force">重新分析（再次計費）</button><button id="research-reload">重新讀取</button><button id="research-export" disabled>下載報告</button></div><label>我的報告<select id="research-history"></select></label><progress id="research-progress" value="0" max="100"></progress><p id="research-analysis-status" role="status" aria-live="polite">請選擇已保存報告，或設定模型開始分析。</p><div id="research-report" class="research-report"></div><p class="caption">使用 TradingAgents 原始研究／風險角色，搭配台股資料轉接。報告保留 90 日，重要內容請下載保存。</p></dialog>
 <dialog id="research-backtest-dialog" class="research-dialog"><form method="dialog" class="dialog-head"><h2>Backtrader 策略回測</h2><button aria-label="關閉">✕</button></form><p id="research-bt-service" role="status"></p><div class="form-grid"><label>週期<select id="research-bt-timeframe"><option value="D1">日 K</option><option value="H1">H1</option></select></label><label>策略<select id="research-bt-strategy"><option value="both">A / B 比較</option><option value="A">A</option><option value="B">B</option></select></label><label>初始資金（元）<input id="research-cash" type="number" value="1000000" min="10000" max="10000000000"></label><label>交易單位<select id="research-lot"><option value="1000">整張（1000 股）</option><option value="1">整股（1 股）</option></select></label><label>開始日期<input id="research-start-date" type="date"></label><label>結束日期<input id="research-end-date" type="date"></label></div><p class="caption">手續費、稅、滑價、B 過濾及是否模擬放空，沿用「05 A/B策略」設定。回測不呼叫模型 API。</p><div class="actions"><button id="research-bt-run" class="dark">執行 Backtrader 回測</button><button id="research-bt-export" disabled>下載完整交易 CSV</button></div><p id="research-bt-status" role="status"></p><div id="research-backtest-output"></div></dialog>`);
 for(const id of ['research-timeframe','research-marker-mode'])$(id).onchange=draw;
 for(const id of ['research-entry','research-stop','research-target'])$(id).oninput=priceReferences;
 $('research-fit').onclick=()=>chart?.timeScale().fitContent();
 $('research-h1').onclick=async()=>{try{$('research-h1').disabled=true;await window.StocklabABUI.fetchH1();$('research-timeframe').value='H1';draw();}catch(e){notice('research-chart-status',e.message,true);}finally{$('research-h1').disabled=false;}};
 $('research-analyze-open').onclick=openAnalysis;
 // Capture the existing 02 shortcut; the separate ChatGPT share/copy buttons remain available.
 $('quick-chatgpt')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openAnalysis();},true);
 if($('quick-chatgpt'))$('quick-chatgpt').textContent='🧠 AI 個股深度分析';
 $('research-start').onclick=()=>analyze(false).catch(e=>notice('research-analysis-status',e.message,true));
 $('research-force').onclick=()=>analyze(true).catch(e=>notice('research-analysis-status',e.message,true));
 $('research-reload').onclick=()=>activeJob?readJob(activeJob):history();
 $('research-history').onchange=()=>{if($('research-history').value){analysisEpoch++;$('research-report').replaceChildren();currentReport=null;$('research-export').disabled=true;readJob($('research-history').value);}};
 $('research-dialog').addEventListener('close',()=>{analysisEpoch++;clearTimeout(pollTimer);$('research-key').value='';});
 $('research-export').onclick=()=>{if(currentReport)download(currentReport.symbol+'_'+currentReport.analysis_date+'_AI研究.json',JSON.stringify(currentReport,null,2),'application/json');};
 $('research-bt-open').onclick=()=>{showDialog('research-backtest-dialog');serviceStatus('research-bt-service');};
 $('research-bt-run').onclick=()=>backtest().catch(e=>notice('research-bt-status',e.message,true));
 $('research-bt-export').onclick=()=>{if(!backtestResult)return;const cols=['strategy','side','signal_date','entry_date','exit_date','entry_price','exit_price','size','commission','pnl','return','reason'];const rows=backtestResult.results.flatMap(r=>r.trades.map(t=>({...t,strategy:r.strategy})));download(backtestResult.symbol+'_Backtrader.csv','\ufeff'+[cols,...rows.map(r=>cols.map(k=>r[k]))].map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 let lastSymbol='';
 window.addEventListener('stocklab-data-changed',()=>{if(stock()?.id!==lastSymbol){lastSymbol=stock()?.id||'';clearAnalysis();backtestEpoch++;backtestResult=null;$('research-backtest-output').replaceChildren();$('research-bt-export').disabled=true;$('research-bt-run').disabled=false;if($('research-dialog').open)$('research-dialog').close();}draw();});
 window.addEventListener('stocklab-account-changed',()=>{clearAnalysis();backtestEpoch++;backtestResult=null;$('research-backtest-output').replaceChildren();$('research-bt-export').disabled=true;$('research-bt-run').disabled=false;notice('research-analysis-status','帳號已切換，請重新開啟分析。');if($('research-dialog').open)$('research-dialog').close();draw();});
 window.addEventListener('stocklab-h1-changed',draw);
 window.StocklabResearch={draw,openAnalysis,reportHtml,clean};
 draw();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
