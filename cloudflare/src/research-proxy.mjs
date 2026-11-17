/* Fixed upstream only. Never accept an upstream URL from visitors. */
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function researchProxy(request,env,upstream=fetch){
 const url=new URL(request.url),suffix=url.pathname.slice('/api/research'.length);
 const allowed=(suffix==='/status'&&request.method==='GET')||
  (suffix==='/backtest'&&request.method==='POST')||
  (suffix==='/analyses'&&['GET','POST'].includes(request.method))||
  (/^\/analyses\/[0-9a-f-]{36}$/.test(suffix)&&request.method==='GET');
 if(!allowed)return json(404,{detail:'研究 API 路徑不存在'});
 let base;
 try{base=new URL(env.RESEARCH_SERVICE_URL);if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash)throw Error();}
 catch{return suffix==='/status'?json(200,{configured:false,backtrader:false,tradingagents:false,detail:'尚未連接 Python 研究服務'}):json(503,{detail:'研究服務尚未啟用，請先完成 Python 服務部署。'});}
 const authorization=request.headers.get('Authorization')||'';
 if(suffix!=='/status'&&(!/^Bearer [^\r\n]+$/.test(authorization)||authorization.length>9000))return json(401,{detail:'請先登入 Firebase'});
 if(request.method==='POST'&&!request.headers.get('Content-Type')?.startsWith('application/json'))return json(415,{detail:'請使用 JSON 格式'});
 let body;
 if(request.method==='POST'){
  const chunks=[];let size=0;const reader=request.body?.getReader();
  if(!reader)return json(400,{detail:'缺少資料'});
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>2500000){await reader.cancel();return json(413,{detail:'研究資料超過 2.5 MB'});}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}body=bytes;
 }
 const target=new URL(base.pathname.replace(/\/$/,'')+'/v1'+suffix,base.origin);
 if(suffix==='/analyses'&&request.method==='GET'){
  const symbol=url.searchParams.get('symbol');if(!/^[0-9A-Za-z]{4,8}$/.test(symbol||''))return json(400,{detail:'股票代號不正確'});
  target.searchParams.set('symbol',symbol);
  const engine=url.searchParams.get('engine');
  if(engine&&!['tradingagents','daily_stock_analysis'].includes(engine))return json(400,{detail:'不支援的報告引擎'});
  if(engine)target.searchParams.set('engine',engine);
 }
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),55000);
 try{
  const response=await upstream(target.toString(),{method:request.method,redirect:'manual',
   headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(authorization?{Authorization:authorization}:{})},
   body,signal:controller.signal});
  if(response.status>=300&&response.status<400)throw new Error('Redirect refused');
  // A sleeping sandbox may return an HTML 503 while waking. Never relay its
  // page or automatically replay a POST: that could create duplicate paid jobs.
  if(response.status===503){
   const raw=response.headers.get('Retry-After');
   const seconds=/^\d{1,5}$/.test(raw||'')?Math.min(3600,Math.max(1,Number(raw))):30;
   return Response.json({detail:'研究主機正在喚醒或暫停中，請稍後再試；分析請先查詢歷史任務，避免重複送出。'},
    {status:503,headers:{'Cache-Control':'no-store','Retry-After':String(seconds)}});
  }
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error();
  return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 }catch(error){console.error('research_upstream_failed',{type:error?.name||'Error',category:/cache/i.test(error?.message||'')?'cache_option':/timeout/i.test(error?.message||'')?'timeout':/invocation/i.test(error?.message||'')?'fetch_binding':'network_or_response'});return json(502,{detail:'研究服務暫時無法連線；請稍後查詢已有任務，避免重複送出。'});}finally{clearTimeout(timer);}
}
