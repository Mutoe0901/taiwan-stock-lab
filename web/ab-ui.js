/* Taiwan Stock Lab A/B interface v0.7.2 - shares existing loaded stock bundle. */
(function() {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?(100*n).toFixed(2)+'%':'—';
  const num=n=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(2):'—';
  const imported=new Map();
  let lastRuns=null,lastStock=null,autoTimer=null;
  function active() { return $('ab-timeframe').value; }
  function bridge() { return window.StocklabABBridge; }
  function currentStock() { return bridge()?.getSelected?.(); }
  function loadedBars() {
    const stock=currentStock();
    if (!stock)throw Error('尚未載入個股，請先至資料來源讀取真實行情。');
    if (active()==='D1')return stock.bars;
    const key=stock.id;
    if (!imported.has(key))throw Error('尚未取得 '+key+' 的 H1 K 線。請先匯入 Fugle 60 分 K JSON，或使用個人的 Fugle API Key 擷取。');
    return window.StocklabH1.closedBars(imported.get(key));
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
  function observedSignals(stock, signals = []) {
    let panel = $('ab-observed');
    if (!panel) {
      panel = document.createElement('details');
      panel.id = 'ab-observed';
      $('ab-current').after(panel);
    }
    const uid = window.StocklabAlerts?.getUid?.();
    panel.hidden = !stock || !uid || bridge()?.getBundle?.()?.mode !== 'real';
    if (panel.hidden) { panel.replaceChildren(); return; }
    const key = 'stocklab-observed-v1:'+JSON.stringify([uid, stock.id, active()]);
    try {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      const additions = signals.filter(signal => !records.some(old =>
        old.date === signal.date && old.strategy === signal.strategy && old.side === signal.side));
      if (additions.length) {
        records.unshift(...additions);
        records.splice(250);
        localStorage.setItem(key, JSON.stringify(records));
      }
      panel.innerHTML = '<summary>已觀察的進場訊號（'+records.length+' 筆）</summary>'+
        '<p class="caption">此帳號在本裝置查看或更新行情時，保留這檔股票、此週期最近 250 筆訊號，以首次觀察為準。</p>'+
        (records.length ? rowsToHtml(['觀察時間（台灣）','策略','訊號','K 線時間','收盤價','評分','B 放量門檻','B 法人過濾'],
          records.map(r => [new Date(r.seen).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),r.strategy,r.side,r.date,num(r.close),r.score,r.volumeRatio??'—',r.institution==null?'—':r.institution?'開':'關'])) : '尚無已觀察訊號。');
    } catch {
      panel.innerHTML = '<summary>已觀察的進場訊號</summary><p>無法讀寫本機日誌。</p>';
    }
  }
  function showCurrent() {
    observedSignals(currentStock());
    if(!currentStock())return;
    let x;try{x=window.StocklabAB.compute(loadedBars());}catch(e){$('ab-current').textContent=e.message;return;}
    const i=x.bars.length-1;if(i<40){$('ab-current').textContent='資料不足，至少需要 65 根歷史 K 線';return;}
    const aL=window.StocklabAB.signalAt(x,i,1,'A',options()),aS=window.StocklabAB.signalAt(x,i,-1,'A',options());
    const bL=window.StocklabAB.signalAt(x,i,1,'B',options()),bS=window.StocklabAB.signalAt(x,i,-1,'B',options());
    const bar = x.bars[i];
    const now = Date.now();
    const dailyClose = Date.parse(bar.date.slice(0,10)+'T13:30:00+08:00');
    if (active() === 'H1' || now >= dailyClose + 90000) {
      const settings = options();
      const signals = [['A',1,aL],['A',-1,aS],['B',1,bL],['B',-1,bS]]
        .filter(([, , signal]) => signal.pass)
        .map(([strategy,direction]) => ({
          strategy, side: direction === 1 ? 'BUY IN' : 'SELL IN', date: bar.date,
          close: bar.close, score: window.StocklabAB.scoreAt(x,i,direction), seen: now,
          volumeRatio: strategy === 'B' ? settings.volumeRatio : null,
          institution: strategy === 'B' ? settings.requireInstitution : null
        }));
      if (signals.length) observedSignals(currentStock(), signals);
    }
    const map=(l,s)=>l.pass?'BUY IN':s.pass?'SELL IN':'無新進場訊號';
    $('ab-current').innerHTML='<div class="ab-cards">'+
      ['A','B'].map((v,j)=>'<div class="ab-card"><b>'+v+' '+(j?'優化':'原始')+'策略</b><strong>'+esc(map(j?bL:aL,j?bS:aS))+'</strong><small>多頭評分 '+window.StocklabAB.scoreAt(x,i,1)+' / 100；空頭評分 '+window.StocklabAB.scoreAt(x,i,-1)+' / 100</small>'+(j?'<small>'+esc(bL.reasons.concat(bS.reasons).filter(t=>t!=='原始 EMA／MACD／FVG 進場條件未成立').join('；')||'沒有額外阻擋條件')+'</small>':'')+'</div>').join('')+'</div><p class="caption">最後一根：'+esc(x.bars[i].date)+'；交易訊號以該根已收盤資料計算。若資料尚未收盤，應先排除該根。</p>';
  }
  function reviewTrades(outputs, rawBars) {
    const bars = window.StocklabAB.cleanBars(rawBars);
    const dates = new Map(bars.map((bar, index) => [bar.date, index]));
    return outputs.flatMap(result => result.trades.map(trade => {
      const entry = dates.get(trade.entryDate);
      const exit = dates.get(trade.exitDate);
      // The exit fills at the open. Later highs and lows belong to the next holder.
      let high = Math.max(trade.entryPrice, trade.exitPrice);
      let low = Math.min(trade.entryPrice, trade.exitPrice);
      for (let i = entry; i < exit; i++) {
        high = Math.max(high, bars[i].high);
        low = Math.min(low, bars[i].low);
      }
      const long = trade.side === 'LONG';
      const mfe = long ? high / trade.entryPrice - 1 : 1 - low / trade.entryPrice;
      const mae = long ? low / trade.entryPrice - 1 : 1 - high / trade.entryPrice;
      return { ...trade, strategy: result.strategy, signalClose: bars[dates.get(trade.signal)].close, mfe, mae };
    }));
  }

  function downloadCsv(trades, stock, timeframe, opts, source) {
    const header = ['strategy','side','signal','entry_date','exit_date','entry_price','exit_price','reason','net_return',
      'symbol','timeframe','signal_close','mfe','mae','exit_signal','fee','tax','slippage','volume_ratio','require_institution','allow_short','source'];
    const rows = trades.map(t => [t.strategy,t.side,t.signal,t.entryDate,t.exitDate,t.entryPrice,t.exitPrice,t.reason,t.return,
      stock,timeframe,t.signalClose,t.mfe,t.mae,t.exitSignalDate,opts.fee,opts.tax,opts.slippage,opts.volumeRatio,opts.requireInstitution,opts.allowShort,source]);
    const data = [header,...rows].map(row => row.map(v => '"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const blob = new Blob(['\ufeff'+data], {type:'text/csv;charset=utf-8'});
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'stocklab_ab_'+stock+'_'+timeframe+'.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }
  function run() {
    const s=currentStock();
    if(!s)throw Error('請先載入股票行情');
    const bars=loadedBars(),opts=options();
    const selected=$('ab-mode').value;
    const modes=selected==='both'?['A','B']:[selected];
    const outputs=modes.map(mode=>window.StocklabAB.backtest(bars,mode,opts));
    lastRuns=outputs;lastStock=s.id+'|'+active();
    const headers=['策略','已完成交易','勝率','平均單筆淨報酬','已實現累積報酬','含未實現報酬','最大回撤','獲利因子'];
    $('ab-results').innerHTML=rowsToHtml(headers,outputs.map(r=>[r.strategy,r.count,pct(r.winRate),pct(r.avgReturn),pct(r.realizedReturn),pct(r.markedReturn),pct(r.maxDrawdown),num(r.profitFactor)]))+
    '<p class="caption">樣本：'+esc(bars.length)+' 根 '+active()+' K 線；'+esc(bars[0].date)+' ～ '+esc(bars.at(-1).date)+'。交易在訊號收盤後的下一根開盤執行；未平倉列入市值評估但不虛構成交。</p>'+
    (outputs.some(r=>r.openPosition)?'<p class="caption">目前仍有尚未平倉交易；請參考「含未實現報酬」，已實現報酬不包含此部位。</p>':'')+
    (bridge()?.getBundle?.()?.mode==='demo'?'<p class="notice">目前為 DEMO 虛構行情，結果不能當成真實台股績效。</p>':'');
    const trades = reviewTrades(outputs, bars);
    const timeframe = active();
    const source = bridge()?.getBundle?.()?.mode || 'unknown';
    $('ab-export').disabled = !trades.length;
    $('ab-export').onclick = () => downloadCsv(trades, s.id, timeframe, opts, source);
    const headersJournal = ['策略','方向','訊號日','訊號收盤價','進場日','進場價','出場日','出場價','最大浮盈','最大浮虧','淨報酬','離場原因'];
    const recent = modes.flatMap(mode => trades.filter(t => t.strategy === mode).slice(-20).reverse());
    $('ab-trades').innerHTML = trades.length
      ? '<details><summary>回測交易日誌與訊號檢討（'+trades.length+' 筆）</summary>'+
        '<p class="caption">各策略顯示最近 20 筆已平倉交易，CSV 包含全部。最大浮盈與浮虧依持倉期間的最高、最低價計算，包含出場開盤價，未扣交易成本。淨報酬已計入成本。</p>'+
        rowsToHtml(headersJournal, recent.map(t => [t.strategy,t.side,t.signal,num(t.signalClose),t.entryDate,num(t.entryPrice),t.exitDate,num(t.exitPrice),pct(t.mfe),pct(t.mae),pct(t.return),t.reason]))+'</details>'
      : '本次回測沒有已平倉交易。';
    message('已完成 '+modes.join('／')+' 策略回測；結果是歷史模擬，不是未來預測。');
    showCurrent();
  }
  async function fetchFugle() {
    if(!window.StocklabAlerts?.hasCloud?.())throw Error('請先登入帳號並設定個人 Fugle Key');
    if(!window.StocklabAlerts?.hasKey?.())throw Error('請先在個人 API 設定保存自己的 Fugle Key');
    const s=currentStock(),uid=window.StocklabAlerts.getUid();if(!s)throw Error('尚未選擇股票');
    message('正在以個人 Fugle Key 取得 H1 行情…');
    const payload=await window.StocklabAlerts.getCandles(s.id);
    if(window.StocklabAlerts.getUid()!==uid)throw Error('帳號已切換，請重新查詢');
    const bars=window.StocklabAB.cleanBars(payload.data);
    if(bars.length<65)throw Error((payload.market?.open===false?payload.market.reason+'，只讀取既有個人快取；':'')+'H1 資料不足 65 根');
    imported.set(s.id,bars);$('ab-timeframe').value='H1';
    message('已取得個人 H1 行情 '+bars.length+' 根；最後資料：'+bars.at(-1).date+(payload.cached?'（快取）':''));showCurrent();
  }
  async function importJson(file){const obj=JSON.parse(await file.text());const s=currentStock();if(!s)throw Error('請先選擇股票');const bars=window.StocklabH1.closedBars(window.StocklabAB.parseFugleHistorical(obj));if(obj.symbol&&obj.symbol!==s.id)throw Error('匯入股票 '+obj.symbol+' 與目前股票 '+s.id+' 不一致');imported.set(s.id,bars);$('ab-timeframe').value='H1';message('匯入 '+bars.length+' 根 H1 歷史 K 線：'+s.id+'。請確認最後一根已收盤。');showCurrent();}
  function render(){if(!$('ab-current'))return;if(!currentStock()){observedSignals(null);$('ab-current').textContent='請先讀取真實股票行情。';return;}
    const s=currentStock();$('ab-stock-label').textContent=s.id+' '+(s.name||'')+' | '+(active()==='D1'?'日 K':'H1');
    if(lastStock!==s.id+'|'+active()){lastRuns=null;lastStock=null;$('ab-export').disabled=true;$('ab-export').onclick=null;$('ab-results').textContent='請點選「執行回測」。';$('ab-trades').textContent='';}
    showCurrent();
  }
  function initialize(){
    if(!$('ab-run'))return;
    $('ab-run').onclick=()=>{try{run();}catch(e){message(e.message,true);}};
    $('ab-fugle-load').onclick=()=>{fetchFugle().catch(e=>message(e.message,true));};
    $('ab-autorefresh').onchange=()=>{
      if(autoTimer){clearInterval(autoTimer);autoTimer=null;}
      if($('ab-autorefresh').checked){
        if(!window.StocklabAlerts?.hasKey?.()){$('ab-autorefresh').checked=false;message('請先登入並保存個人 Fugle Key。',true);return;}
        autoTimer=setInterval(()=>{if(!document.hidden&&$('ab').classList.contains('active')&&active()==='H1')fetchFugle().catch(e=>message(e.message,true));},60000);
        message('已開啟每 60 秒更新（僅 App／網頁在前景、A/B 策略頁開啟時執行）。');
      } else {message('已停止自動更新。');}
    };
    $('ab-import').onchange=e=>{if(e.target.files[0])importJson(e.target.files[0]).catch(error=>message(error.message,true));e.target.value='';};
    for(const id of ['ab-timeframe','ab-mode','ab-volume-ratio','ab-institution','ab-short'])$(id).addEventListener('change',render);
    window.addEventListener('stocklab-account-changed',()=>{imported.clear();lastRuns=null;lastStock=null;if(autoTimer)clearInterval(autoTimer);autoTimer=null;$('ab-autorefresh').checked=false;$('ab-results').textContent='請重新讀取個人 H1 行情並執行回測';$('ab-trades').textContent='';$('ab-export').disabled=true;render();});
    window.StocklabABUI={render};
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
