(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.StocklabH1=api;})(typeof window==='undefined'?null:window,()=>{
  'use strict';
  const day=t=>new Date(t+8*3600000).toISOString().slice(0,10);
  function closeTime(date){
    if(typeof date!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(date))return NaN;
    const t=Date.parse(date);if(!Number.isFinite(t))return NaN;
    const d=new Date(t+8*3600000),m=d.getUTCHours()*60+d.getUTCMinutes();
    if(m<540||m>810||d.getUTCSeconds()!==0)return NaN;
    return Math.min(t+3600000,Date.parse(day(t)+'T13:30:00+08:00'));
  }
  function closedBars(bars,now=Date.now()){
    const dedup=new Map();
    for(const b of bars){const end=closeTime(b.date);if(Number.isFinite(end)&&end+90000<=now)dedup.set(new Date(Date.parse(b.date)).toISOString(),{...b,date:new Date(Date.parse(b.date)).toISOString()});}
    return [...dedup.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  return {closeTime,closedBars,day};
});
