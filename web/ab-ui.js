/* Taiwan Stock Lab A/B interface v0.7.0 - shares existing loaded stock bundle. */
(function() {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?(100*n).toFixed(2)+'%':'—';
  const num=n=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(2):'—';
  const imported=new Map();
  let lastRuns=null,lastStock=null,sessionKey="",autoTimer=null;
  function active() { return $('ab-timeframe').value; }
  function bridge() { return window.StocklabABBridge; }
  function currentStock() { return bridge()?.getSelected?.(); }
  function loadedBars() {
    const stock=currentStock();
    if (!stock)throw Error('尚未載入個股，請先至資料來源讀取真實行情。');
    if (active()==='D1')return stock.bars;
    const key=stock.id;
    if (!imported.has(key))throw Error('尚未取得 '+key+' 的 H1 K 線。請先匯入 Fugle 60 分 K JSON，或使用個人的 Fugle API Key 擷取。');
    return imported.get(key);
  }
  function options(){return {
    fee:Number($('ab-fee').value)/100,
    tax:Number($('ab-tax').value)/100,
    slippage:Number($('ab-slippage').value)/100,
    volumeRatio:Number($('ab-volume-ratio').value),
    requireInstitution:$('ab-institution').checked,
    allowShort:$('ab-short').checked,
    dailyBars:currentStock()?.bars||[]
  };}
  function message(msg,bad=false){const e=$('ab-status');if(!e)return;e.textContent=msg;e.className='notice'+(bad?' ab-error':'');}
  function rowsToHtml(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(t=>'<th>'+esc(t)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(t=>'<td>'+esc(t)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function showCurrent() {
    if(!currentStock())return;
    let x;try{x=window.StocklabAB.compute(loadedBars());}catch(e){$('ab-current').textContent=e.message;return;}
    const i=x.bars.length-1;if(i<40){$('ab-current').textContent='資料不足，至少需要 65 根歷史 K 線';return;}
    const aL=window.StocklabAB.signalAt(x,i,1,'A',options()),aS=window.StocklabAB.signalAt(x,i,-1,'A',options());
    const bL=window.StocklabAB.signalAt(x,i,1,'B',options()),bS=window.StocklabAB.signalAt(x,i,-1,'B',options());
    const label=s=>s.pass?'BUY IN':null;
    const map=(l,s)=>l.pass?'BUY IN':s.pass?'SELL IN':'無新進場訊號';
    $('ab-current').innerHTML='<div class="ab-cards">'+
      ['A','B'].map((v,j)=>'<div class="ab-card"><b>'+v+' '+(j?'優化':'原始')+'策略</b><strong>'+esc(map(j?bL:aL,j?bS:aS))+'</strong><small>多頭評分 '+window.StocklabAB.scoreAt(x,i,1)+' / 100；空頭評分 '+window.StocklabAB.scoreAt(x,i,-1)+' / 100</small>'+(j?'<small>'+esc(bL.reasons.concat(bS.reasons).filter(t=>t!=='原始 EMA／MACD／FVG 進場條件未成立').join('；')||'沒有額外阻擋條件')+'</small>':'')+'</div>').join('')+'</div><p class="caption">最後一根：'+esc(x.bars[i].date)+'；交易訊號以該根已收盤資料計算。若資料尚未收盤，應先排除該根。</p>';
  }
  function downloadCsv(trades){const header=['strategy','side','signal','entry_date','exit_date','entry_price','exit_price','reason','net_return']; const data=[header,...trades].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n'); const blob=new Blob(['\ufeff'+data],{type:'text/csv;charset=utf-8'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download='stocklab_ab_'+(currentStock()?.id||'stock')+'_'+active()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(href),2000);}
  function run() {
    const s=currentStock();
    if(!s)throw Error('請先載入股票行情');
    const bars=loadedBars(),opts=options();
    const selected=$('ab-mode').value;
    const modes=selected==='both'?['A','B']:[selected];
    const outputs=modes.map(mode=>window.StocklabAB.backtest(bars,mode,opts));
    lastRuns=outputs;lastStock=s.id;
    const headers=['策略','已完成交易','勝率','平均單筆淨報酬','已實現累積報酬','含未實現報酬','最大回撤','獲利因子'];
    $('ab-results').innerHTML=rowsToHtml(headers,outputs.map(r=>[r.strategy,r.count,pct(r.winRate),pct(r.avgReturn),pct(r.realizedReturn),pct(r.markedReturn),pct(r.maxDrawdown),num(r.profitFactor)]))+
    '<p class="caption">樣本：'+esc(bars.length)+' 根 '+active()+' K 線；'+esc(bars[0].date)+' ～ '+esc(bars.at(-1).date)+'。交易在訊號收盤後的下一根開盤執行；未平倉列入市值評估但不虛構成交。</p>'+
    (outputs.some(r=>r.openPosition)?'<p class="caption">目前仍有尚未平倉交易；請參考「含未實現報酬」，已實現報酬不包含此部位。</p>':'')+
    (bridge()?.getBundle?.()?.mode==='demo'?'<p class="notice">目前為 DEMO 虛構行情，結果不能當成真實台股績效。</p>':'');
    const allTrades=outputs.flatMap(r=>r.trades.map(t=>[r.strategy,t.side,t.signal,t.entryDate,t.exitDate,t.entryPrice,t.exitPrice,t.reason,t.return]));
    $('ab-export').disabled=!allTrades.length;
    $('ab-export').onclick=()=>downloadCsv(allTrades);
    $('ab-trades').innerHTML=rowsToHtml(['策略','方向','訊號日','進場日','出場日','淨報酬','離場原因'],outputs.flatMap(r=>r.trades.slice(-20).reverse().map(t=>[r.strategy,t.side,t.signal,t.entryDate,t.exitDate,pct(t.return),t.reason]))) || '<p>尚無完成交易。</p>';
    message('已完成 '+modes.join('／')+' 策略回測；結果是歷史模擬，不是未來預測。');
    showCurrent();
  }
  async function fetchFugle() {
    const apiKey=$('ab-fugle-key').value.trim() || sessionKey;
    if(!apiKey)throw Error('請輸入個人 Fugle API Key；金鑰不會永久儲存。');
    sessionKey=apiKey;
    const s=currentStock();if(!s)throw Error('請先選擇股票');
    if(!/^[0-9A-Za-z]{4,8}$/.test(s.id))throw Error('無效股票代碼');
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const fromDate=new Date(Date.now()-160*86400000).toISOString().slice(0,10);
    const base='https://api.fugle.tw/marketdata/v1.0/stock/';
    const urls=[base+'historical/candles/'+encodeURIComponent(s.id)+'?timeframe=60&from='+fromDate+'&to='+today+'&sort=asc',base+'intraday/candles/'+encodeURIComponent(s.id)+'?timeframe=60'];
    const native=!!(window.StocklabCapacitor?.Capacitor?.isNativePlatform?.());
    const get=async url=>{
      if(native&&window.StocklabCapacitor?.CapacitorHttp){
        const r=await window.StocklabCapacitor.CapacitorHttp.get({url,headers:{'X-API-KEY':apiKey}});
        if(r.status!==200)throw Error('Fugle 回應 '+r.status);
        return typeof r.data==='string'?JSON.parse(r.data):r.data;
      }
      const r=await fetch(url,{headers:{'X-API-KEY':apiKey},cache:'no-store'});
      if(!r.ok)throw Error('Fugle 回應 '+r.status+'；請檢查金鑰／額度／行情權限');
      return r.json();
    };
    message('讀取 Fugle 歷史 60 分 K…');
    const history=window.StocklabAB.parseFugleHistorical(await get(urls[0]));
    let todayBars=[];
    try{
      const intraday=await get(urls[1]);
      if(Array.isArray(intraday.data)) {
        const now=Date.now();
        // Exclude the current unfinished candle; bar timestamps refer to candle opening times.
        todayBars=intraday.data.filter(bar=>{
          const ts=Date.parse(bar.date);if(!Number.isFinite(ts))return false;
          const end=new Date(ts+3600000);
          return end.getTime()<=now-90000 || (today===''+bar.date.slice(0,10)&&new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now))>='13:35');
        });
      }
    }catch(e){message('歷史資料已讀取，盤中資料暫時無法補齊：'+e.message);}
    const combined=[...history,...todayBars];const dedup=new Map(combined.map(row=>[row.date,row]));
    const bars=window.StocklabAB.cleanBars([...dedup.values()]);
    if(bars.length<65)throw Error('H1 資料不足 65 根，請擴大查詢期間');
    imported.set(s.id,bars);
    $('ab-timeframe').value='H1';
    $('ab-fugle-key').value='';
    message('已取得 '+bars.length+' 根 H1 K 線（截至 '+bars.at(-1).date+'）；僅存本次頁面，不保留 API Key。');
    showCurrent();
  }
  async function importJson(file){const obj=JSON.parse(await file.text());const s=currentStock();if(!s)throw Error('請先選擇股票');const bars=window.StocklabAB.parseFugleHistorical(obj);if(obj.symbol&&obj.symbol!==s.id)throw Error('匯入股票 '+obj.symbol+' 與目前股票 '+s.id+' 不一致');imported.set(s.id,bars);$('ab-timeframe').value='H1';message('匯入 '+bars.length+' 根 H1 歷史 K 線：'+s.id+'。請確認最後一根已收盤。');showCurrent();}
  function render(){if(!$('ab-current'))return;if(!currentStock()){$('ab-current').textContent='請先讀取真實股票行情。';return;}
    const s=currentStock();$('ab-stock-label').textContent=s.id+' '+(s.name||'')+' | '+(active()==='D1'?'日 K':'H1');
    if(lastStock!==s.id){lastRuns=null;$('ab-results').textContent='請點選「執行回測」。';$('ab-trades').textContent='';}
    showCurrent();
  }
  function initialize(){
    if(!$('ab-run'))return;
    $('ab-run').onclick=()=>{try{run();}catch(e){message(e.message,true);}};
    $('ab-fugle-load').onclick=()=>{fetchFugle().catch(e=>message(e.message+'。網頁如遇跨來源限制，請使用 Android 或匯入 JSON。',true));};
    $('ab-autorefresh').onchange=()=>{
      if(autoTimer){clearInterval(autoTimer);autoTimer=null;}
      if($('ab-autorefresh').checked){
        if(!$('ab-fugle-key').value.trim()&&!sessionKey){$('ab-autorefresh').checked=false;message('先輸入個人 Fugle API Key 才能啟用自動更新。',true);return;}
        autoTimer=setInterval(()=>{if(!document.hidden&&$('ab').classList.contains('active')&&active()==='H1')fetchFugle().catch(e=>message(e.message,true));},60000);
        message('已開啟每 60 秒更新（僅 App／網頁在前景、A/B 策略頁開啟時執行）。');
      } else {sessionKey='';$('ab-fugle-key').value='';message('已停止自動更新，工作階段 API Key 已清除。');}
    };
    $('ab-import').onchange=e=>{if(e.target.files[0])importJson(e.target.files[0]).catch(error=>message(error.message,true));e.target.value='';};
    for(const id of ['ab-timeframe','ab-mode','ab-volume-ratio','ab-institution','ab-short'])$(id).addEventListener('change',render);
    window.StocklabABUI={render};
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
