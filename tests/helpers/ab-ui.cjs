const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const core=require('../../web/ab-strategies.js');
const h1=require('../../web/h1.js');
function bars(n=120){return Array.from({length:n},(_,i)=>{const c=100+0.03*i+5*Math.sin(i/4);return {date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),open:c-0.3,high:c+1,low:c-1,close:c,volume:5000+(i%9)*250,foreign:i%2?15:-10,trust:20};});}
function app(t,{engine={},data=bars(),saved={},uid='alice',mode='real',id='2330',active=true,now}={}){
 const dom=new JSDOM(readFileSync('web/index.html','utf8'),{url:'https://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());
 const w=dom.window,el=id=>w.document.getElementById(id);
 Object.defineProperty(w.document,'readyState',{value:'complete'});
 const state={uid,stock:{id,name:'Test',bars:data},mode};
 if(now!=null)w.Date.now=()=>now;
 for(const [k,v]of Object.entries(saved))w.localStorage.setItem(k,v);
 w.StocklabAB={...core,...engine};w.StocklabH1=h1;
 w.StocklabABBridge={getSelected:()=>state.stock,getBundle:()=>({mode:state.mode})};
 w.StocklabAlerts={getUid:()=>state.uid,hasCloud:()=>!!state.uid,hasKey:()=>true,getCandles:async()=>({data:state.stock.bars.map(b=>({...b,date:b.date+'T09:00:00+08:00'}))})};
 el('ab').classList.toggle('active',active);
 const blobs=[];w.Blob=Blob;w.URL.createObjectURL=b=>{blobs.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
 w.eval(readFileSync('web/ab-ui.js','utf8'));
 const render=()=>w.StocklabABUI.render();
 const records=()=>Object.keys(w.localStorage).filter(k=>k.startsWith('stocklab-observed-v1:')).map(k=>({key:JSON.parse(k.slice('stocklab-observed-v1:'.length)),rows:JSON.parse(w.localStorage.getItem(k))}));
 const storage=()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
 const account=uid=>{state.uid=uid;w.dispatchEvent(new w.Event('stocklab-account-changed'));};
 const importH1=async(data=state.stock.bars.map(b=>({...b,date:b.date+'T09:00:00+08:00'})))=>{
   const input=el('ab-import');await input.onchange({target:{files:[{text:async()=>JSON.stringify({symbol:state.stock.id,timeframe:'60',data})}],value:''}});
   await new Promise(r=>setImmediate(r));
 };
 const csv=async()=>{el('ab-export').click();const text=await blobs.at(-1).text();return text.replace(/^\uFEFF/,'').split('\r\n').map(line=>line.slice(1,-1).split('","').map(s=>s.replace(/""/g,'"')));};
 return {w,el,state,render,records,storage,account,importH1,csv,blobs};
}
module.exports={app,bars,core};
