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
