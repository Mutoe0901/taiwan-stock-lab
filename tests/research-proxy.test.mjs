import test from 'node:test';
import assert from 'node:assert/strict';
import {researchProxy} from '../cloudflare/src/research-proxy.mjs';
const request=(path,method='GET',token='test')=>new Request('https://site.example/api/research'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:'{}'}:{})});
test('unconfigured backend is explicit, not a simulated success',async()=>{
 assert.equal((await (await researchProxy(request('/status'),{})).json()).configured,false);
 assert.equal((await researchProxy(request('/backtest','POST'),{})).status,503);
});
test('relay uses fixed HTTPS destination, preserves user auth, never follows redirects',async()=>{
 let call;
 const fetcher=async(url,init)=>{call={url,init};return Response.json({status:'completed'});};
 const env={RESEARCH_SERVICE_URL:'https://research.example'};
 const response=await researchProxy(request('/analyses?url=https://evil.example','POST'),env,fetcher);
 assert.equal(response.status,200);assert.equal(call.url,'https://research.example/v1/analyses');
 assert.equal(call.init.headers.Authorization,'Bearer test');assert.equal(call.init.redirect,'error');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.equal((await researchProxy(request('/analyses','POST',''),env,fetcher)).status,401);
 assert.equal((await researchProxy(request('/../secrets'),env,fetcher)).status,404);
 assert.equal((await researchProxy(request('/backtest','POST'),{RESEARCH_SERVICE_URL:'http://localhost'},fetcher)).status,503);
});
test('relay bounds body and handles non-json failures without exposing upstream content',async()=>{
 const req=new Request('https://site.example/api/research/backtest',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:'x'.repeat(2500001)});
 assert.equal((await researchProxy(req,{RESEARCH_SERVICE_URL:'https://research.example'})).status,413);
 const res=await researchProxy(request('/status'),{RESEARCH_SERVICE_URL:'https://research.example'},async()=>new Response('secret error page'));
 assert.equal(res.status,502);assert.ok(!(await res.text()).includes('secret error page'));
});
test('sandbox waking returns retry guidance without replaying a paid POST or leaking HTML',async()=>{
 let calls=0;
 const response=await researchProxy(request('/analyses','POST'),{RESEARCH_SERVICE_URL:'https://research.example'},async()=>{
  calls++;return new Response('<html>private upstream diagnostics</html>',{status:503,headers:{'Retry-After':'15'}});
 });
 assert.equal(calls,1);
 assert.equal(response.status,503);
 assert.equal(response.headers.get('Retry-After'),'15');
 assert.match((await response.json()).detail,/喚醒/);
});
test('sandbox retry delay is bounded and invalid values use a safe default',async()=>{
 for(const [value,expected] of [['99999','3600'],['0','1'],['invalid','30']]){
  const response=await researchProxy(request('/status'),{RESEARCH_SERVICE_URL:'https://research.example'},async()=>new Response('',{status:503,headers:{'Retry-After':value}}));
  assert.equal(response.headers.get('Retry-After'),expected);
 }
});
test('daily report history keeps engine and rejects unknown engines',async()=>{
 let target;
 const env={RESEARCH_SERVICE_URL:'https://research.example'};
 const response=await researchProxy(request('/analyses?symbol=2330&engine=daily_stock_analysis'),env,async url=>{target=new URL(url);return Response.json({items:[]});});
 assert.equal(response.status,200);assert.equal(target.searchParams.get('engine'),'daily_stock_analysis');
 assert.equal((await researchProxy(request('/analyses?symbol=2330&engine=other'),env)).status,400);
});
