/* Pure helpers for signal replay, H1 market closure and no-future-data. */
export function taipeiParts(now) {
  const fmt = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const p=Object.fromEntries(fmt.formatToParts(new Date(now)).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, weekday:p.weekday,minute:Number(p.minute),hour:Number(p.hour)};
}
export function isTradingWindow(now) {
  const p=taipeiParts(now);
  return !['Sat','Sun'].includes(p.weekday) && (p.hour>8&&p.hour<14);
}
export function isScanTime(now) {
  const p=taipeiParts(now);
  if(['Sat','Sun'].includes(p.weekday))return false;
  // 10:02-13:12: repeated short retries; final shortened H1 bar at 13:30.
  if(p.hour>=10&&p.hour<=13 && [2,7,12].includes(p.minute) && (p.hour<13||p.minute<=12))return true;
  return p.hour===13&&[36,41,46].includes(p.minute);
}
export function closedH1(bar,now) {
  const ts=Date.parse(bar.date);
  if(!Number.isFinite(ts))return false;
  const p=taipeiParts(ts), n=taipeiParts(now);
  if(p.hour<9||p.hour>13||p.minute!==0)return false;
  const end=ts+(p.hour===13?30:60)*60_000;
  if(p.hour===13 && p.date===n.date && (n.hour<13 || n.hour===13 && n.minute<35))return false;
  return end+90_000<=now;
}
export function normalize(payload, now) {
  if(!payload||!Array.isArray(payload.data))throw Error('Fugle response has no data array');
  return payload.data.filter(b=>closedH1(b,now)).map(b=>({date:b.date,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume)}));
}
export function replayEvents(AB,bars,opts={}) {
  if(bars.length<65)return [];
  const x=AB.compute(bars), events=[];
  for(const strategy of ['A','B']){
    let held=0;
    for(let i=40;i<x.bars.length;i++){
      let kind=null;
      if(held){ kind=AB.exitAt(x,i,held);if(kind)held=0;}
      else {
        if(AB.signalAt(x,i,1,strategy,opts).pass){kind='BUY IN';held=1;}
        else if(AB.signalAt(x,i,-1,strategy,opts).pass){kind='SELL IN';held=-1;}
      }
      if(kind)events.push({strategy,kind,bar_ts:x.bars[i].date,price:x.bars[i].close});
    }
  }
  return events;
}
export function eventId(symbol,event){return `${symbol}|${event.strategy}|${event.kind}|${event.bar_ts}`;}
