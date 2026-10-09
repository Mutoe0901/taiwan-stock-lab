/* Generated; do not edit. Source: web/ab-strategies.js */
const engine = (function(){
  'use strict';
  const valid = n => typeof n === 'number' && Number.isFinite(n);
  const DEFAULTS = Object.freeze({ fee: 0.001425, tax: 0.003, slippage: 0.001, volumeRatio: 1.2, requireInstitution: false, allowShort: false });
  function cleanBars(raw) {
    if (!Array.isArray(raw)) throw Error('K 線資料必須是陣列');
    const bs = raw.map((b) => ({ ...b, date: String(b.date || b.time || ''), open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: Number(b.volume) })).sort((a, b) => a.date.localeCompare(b.date));
    const seen = new Set();
    for (const b of bs) {
      if (!b.date || seen.has(b.date) || ![b.open,b.high,b.low,b.close,b.volume].every(valid) || b.low <= 0 || b.high < Math.max(b.open,b.close) || b.low > Math.min(b.open,b.close) || b.volume < 0) throw Error('K 線時間或 OHLCV 錯誤：' + b.date);
      seen.add(b.date);
    }
    return bs;
  }
  function compute(bars) {
    const b = cleanBars(bars), n = b.length;
    const e5=[], e10=[], e12=[], e26=[], dea=[], hist=[], ma20=[], avgVolume=[];
    function e(previous, price, period) { return previous === undefined ? price : previous + (price - previous) * 2 / (period + 1); }
    for (let i=0;i<n;i++) {
      const c=b[i].close;
      e5[i]=e(e5[i-1],c,5); e10[i]=e(e10[i-1],c,10);
      e12[i]=e(e12[i-1],c,12); e26[i]=e(e26[i-1],c,26);
      const dif=e12[i]-e26[i]; dea[i]=e(dea[i-1],dif,9); hist[i]=dif-dea[i];
      if (i>=19) {
        let v=0,c20=0;
        for(let j=i-19;j<=i;j++){v+=b[j].volume;c20+=b[j].close;}
        avgVolume[i]=v/20; ma20[i]=c20/20;
      } else { avgVolume[i]=null;ma20[i]=null; }
    }
    // A segment is confirmed only after a histogram sign switch. No future K lines.
    let segment=null, peaksHigh=[],peaksLow=[];
    const pivotHigh=[],pivotLow=[], market=[];
    for(let i=0;i<n;i++) {
      const sign=hist[i]>0?1:hist[i]<0?-1:0;
      if(segment && sign !== segment.sign) {
        if(segment.sign===1) peaksHigh.push(segment.price);
        if(segment.sign===-1) peaksLow.push(segment.price);
        segment=null;
      }
      if(sign!==0) {
        if(!segment) segment={sign,price:sign===1?b[i].high:b[i].low};
        else if(sign===1)segment.price=Math.max(segment.price,b[i].high);
        else segment.price=Math.min(segment.price,b[i].low);
      }
      pivotHigh[i]=peaksHigh.length?peaksHigh[peaksHigh.length-1]:null;
      pivotLow[i]=peaksLow.length?peaksLow[peaksLow.length-1]:null;
      const h=peaksHigh.length,l=peaksLow.length;
      const up=h>=2&&l>=2&&peaksHigh[h-1]>peaksHigh[h-2]&&peaksLow[l-1]>peaksLow[l-2];
      const down=h>=2&&l>=2&&peaksHigh[h-1]<peaksHigh[h-2]&&peaksLow[l-1]<peaksLow[l-2];
      market[i]=up?1:down?-1:0;
    }
    return { bars:b, e5,e10,hist,ma20,avgVolume,pivotHigh,pivotLow,market };
  }
  function signalAt(x,i,direction, strategy='A', opts={}) {
    if(i<40 || i>=x.bars.length || (direction!==1&&direction!==-1)) return {pass:false,reasons:['暖機資料不足']};
    const {bars,e5,e10,hist,ma20,avgVolume}=x;
    const buyCross=e5[i-1]<=e10[i-1]&&e5[i]>e10[i];
    const sellCross=e5[i-1]>=e10[i-1]&&e5[i]<e10[i];
    const macdBuy=hist[i]>hist[i-1]||hist[i]>0;
    const macdSell=Math.abs(hist[i])<Math.abs(hist[i-1])||hist[i]<0;
    const fvgBuy=bars[i].low>bars[i-2].high;
    const fvgSell=bars[i].high<bars[i-2].low;
    const base=direction===1 ? buyCross&&macdBuy&&(fvgBuy||hist[i]>hist[i-1]) : sellCross&&macdSell&&(fvgSell||Math.abs(hist[i])>Math.abs(hist[i-1]));
    const reasons=[];
    if(!base) reasons.push('原始 EMA／MACD／FVG 進場條件未成立');
    if(strategy==='A'||!base) return {pass:base,reasons,base};
    if(strategy!=='B') throw Error('不支援的策略模式');
    const ratio=Number(opts.volumeRatio ?? DEFAULTS.volumeRatio);
    if(!valid(ratio)||ratio<0.1||ratio>10)throw Error('放量倍率必須介於 0.1 至 10');
    if(ma20[i]===null||(direction===1 ? bars[i].close<=ma20[i] : bars[i].close>=ma20[i])) reasons.push('未通過 MA20 方向過濾');
    // The comparison uses completed prior bars only, not the current bar.
    const volBase=i>=20 ? bars.slice(i-20,i).reduce((s,b)=>s+b.volume,0)/20 : null;
    if(!volBase||bars[i].volume<volBase*ratio)reasons.push('成交量未達過濾門檻');
    if(opts.requireInstitution) {
      // Day-level holdings/flows may only become public after the session. Use *previous* daily bar.
      const source=(opts.dailyBars && opts.dailyBars.length ? opts.dailyBars : bars);
      const date=bars[i].date.slice(0,10);
      const prev=source.filter(row=>row.date.slice(0,10)<date).at(-1);
      if(!prev||!valid(Number(prev.foreign))||!valid(Number(prev.trust))) reasons.push('缺少前交易日法人資料');
      else if(direction===1 ? !(Number(prev.foreign)>0||Number(prev.trust)>0) : !(Number(prev.foreign)<0||Number(prev.trust)<0)) reasons.push('前交易日法人方向不符合');
    }
    return {pass:reasons.length===0,reasons,base};
  }
  function scoreAt(x,i,direction) {
    if(i<20||i>=x.bars.length)return 0;
    const b=x.bars, h=x.hist; let score=0;
    if(x.market[i]===direction)score+=25;
    if(direction===1?x.e5[i]>x.e10[i]:x.e5[i]<x.e10[i])score+=15;
    if(direction===1?(h[i]>h[i-1]||h[i]>0):(Math.abs(h[i])<Math.abs(h[i-1])||h[i]<0))score+=30;
    if(direction===1?b[i].low>b[i-2].high:b[i].high<b[i-2].low)score+=10;
    if(direction===1?b[i].close>b[i-1].close:b[i].close<b[i-1].close)score+=10;
    const v=b.slice(i-20,i).reduce((s,z)=>s+z.volume,0)/20;
    if(v>0) score+=b[i].volume>=v*1.5?10:b[i].volume>=v*0.5?8:0;
    return Math.min(100,score);
  }
  function exitAt(x,i,direction) {
    if(i<1)return null;
    if(direction===1) {
      if(x.e5[i]<x.e10[i]||(x.pivotLow[i]!==null&&x.bars[i].close<x.pivotLow[i]))return 'FAIL OUT';
      if(x.hist[i]<x.hist[i-1]&&x.hist[i]>0)return 'PROFIT OUT';
    } else {
      if(x.e5[i]>x.e10[i]||(x.pivotHigh[i]!==null&&x.bars[i].close>x.pivotHigh[i]))return 'FAIL OUT';
      if(Math.abs(x.hist[i])<Math.abs(x.hist[i-1])&&x.hist[i]<0)return 'PROFIT OUT';
    }
    return null;
  }
  function backtest(rawBars,strategy='A',userOptions={}) {
    const opts={...DEFAULTS,...userOptions};
    for(const k of ['fee','tax','slippage']) if(!valid(Number(opts[k]))||Number(opts[k])<0||Number(opts[k])>0.1)throw Error('交易成本設定超出範圍');
    const x=compute(rawBars), b=x.bars;
    if(b.length<65)throw Error('需要至少 65 根已收盤 K 線（含暖機資料）');
    let wealth=1,position=null,pending=null, trades=[],curve=[],events=[];
    const buyCost=p=>p*(1+Number(opts.slippage))*(1+Number(opts.fee));
    const sellNet=p=>p*(1-Number(opts.slippage))*(1-Number(opts.fee)-Number(opts.tax));
    for(let i=40;i<b.length;i++) {
      let exited=false;
      if(pending&&i>pending.index) {
        if(pending.kind==='EXIT'&&position&&b[i].volume>0) {
          const exitPrice=b[i].open;
          const multiplier=position.direction===1 ? sellNet(exitPrice)/position.entryNet : position.entryNet/buyCost(exitPrice);
          const ret=position.direction===1 ? multiplier-1 : 1-buyCost(exitPrice)/position.entryNet;
          wealth=position.wealth*(1+ret);
          trades.push({side:position.direction===1?'LONG':'SHORT',signal:position.signal,entryDate:position.entryDate,exitSignalDate:b[pending.index].date,exitDate:b[i].date,entryPrice:position.entryPrice,exitPrice,reason:pending.reason,return:ret,equity:wealth});
          events.push({date:b[i].date,label:pending.reason,side:position.direction});
          position=null;exited=true;pending=null;
        } else if(pending.kind==='ENTRY'&&!position&&b[i].volume>0) {
          const d=pending.direction, price=b[i].open;
          position={direction:d,entryNet:d===1?buyCost(price):sellNet(price),entryPrice:price,entryDate:b[i].date,signal:b[pending.index].date,wealth};
          events.push({date:b[i].date,label:d===1?'BUY IN':'SELL IN',side:d});
          pending=null;
        }
      }
      // A zero-volume bar must not silently fill pending orders.
      if(i<b.length-1) {
        if(position) {
          if(!pending) {
            const reason=exitAt(x,i,position.direction);
            if(reason)pending={kind:'EXIT',reason,index:i};
          }
        } else if(!pending && !exited) {
          const long=signalAt(x,i,1,strategy,opts);
          const short=signalAt(x,i,-1,strategy,opts);
          if(long.pass)pending={kind:'ENTRY',direction:1,index:i};
          else if(opts.allowShort&&short.pass)pending={kind:'ENTRY',direction:-1,index:i};
        }
      }
      const mark=position?(position.direction===1?sellNet(b[i].close)/position.entryNet:2-buyCost(b[i].close)/position.entryNet):1;
      curve.push({date:b[i].date,equity:position?position.wealth*mark:wealth});
    }
    // Unrealized position is reported separately: no invented final-bar fill.
    const openPosition=position ? {side:position.direction===1?'LONG':'SHORT',entryDate:position.entryDate,entryPrice:position.entryPrice,unrealizedReturn:curve.at(-1).equity/position.wealth-1}:null;
    const wins=trades.filter(t=>t.return>0), losses=trades.filter(t=>t.return<0);
    const gain=wins.reduce((s,t)=>s+t.return,0),loss=-losses.reduce((s,t)=>s+t.return,0);
    let high=1,maxDrawdown=0;
    for(const p of curve){high=Math.max(high,p.equity);maxDrawdown=Math.max(maxDrawdown,1-p.equity/high);}
    return {strategy,count:trades.length,winRate:trades.length?wins.length/trades.length:null,avgReturn:trades.length?trades.reduce((s,t)=>s+t.return,0)/trades.length:null,maxDrawdown,profitFactor:loss>0?gain/loss:gain>0?Infinity:null,realizedReturn:wealth-1,markedReturn:curve.at(-1).equity-1,trades,curve,events,openPosition,bars:b.length,first:b[0].date,last:b.at(-1).date};
  }
  function parseFugleHistorical(input) {
    const payload=typeof input==='string'?JSON.parse(input):input;
    if(!payload||!Array.isArray(payload.data)||payload.timeframe!== '60' && payload.timeframe!==60)throw Error('請提供 Fugle historical/candles 的 60 分 K JSON');
    return cleanBars(payload.data);
  }
  return Object.freeze({DEFAULTS,cleanBars,compute,signalAt,scoreAt,exitAt,backtest,parseFugleHistorical});
})();
export default engine;
