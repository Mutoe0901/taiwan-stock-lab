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
 }
 try{
  const response=await upstream(target.toString(),{method:request.method,redirect:'error',
   headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},
   body,signal:AbortSignal.timeout(suffix==='/backtest'?55000:25000),cache:'no-store'});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error();
  return new Response(await response.text(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 }catch{return json(502,{detail:'研究服務暫時無法連線；請稍後查詢已有任務，避免重複送出。'});}
}
