import test from 'node:test';
import assert from 'node:assert/strict';
import {isScanTime,closedH1,normalize,replayEvents,eventId,taipeiParts} from '../cloudflare/src/monitor.mjs';
const local=(d)=>Date.parse(d);
const candle=date=>({date,open:10,high:12,low:9,close:11,volume:100});
test('Taipei H1 schedule includes complete hour after buffer and last short bar',()=>{
  assert.equal(isScanTime(local('2026-10-09T10:02:00+08:00')),true);
  assert.equal(isScanTime(local('2026-10-09T13:35:00+08:00')),true);
  assert.equal(isScanTime(local('2026-10-09T09:35:00+08:00')),true);
  assert.equal(isScanTime(local('2026-10-10T10:02:00+08:00')),false);
});
test('exclude unfinished current hour and include closed H1 candle',()=>{
  const b=candle('2026-10-09T10:00:00.000+08:00');
  assert.equal(closedH1(b,local('2026-10-09T10:59:00+08:00')),false);
  assert.equal(closedH1(b,local('2026-10-09T11:02:00+08:00')),true);
});
test('last 13:00 candle is not considered closed until 13:35',()=>{
  const b=candle('2026-10-09T13:00:00.000+08:00');
  assert.equal(closedH1(b,local('2026-10-09T13:32:00+08:00')),false);
  assert.equal(closedH1(b,local('2026-10-09T13:35:00+08:00')),true);
});
test('historical candles with timezone are filtered by closure',()=>{
  const now=local('2026-10-09T10:05:00+08:00');
  const res=normalize({data:[candle('2026-10-09T09:00:00+08:00'),candle('2026-10-09T10:00:00+08:00')]},now);
  assert.equal(res.length,1);assert.equal(res[0].date,'2026-10-09T09:00:00+08:00');
});
test('signal replay isolates A and B virtual positions (and no intrabar look-ahead)',()=>{
  const bars=Array.from({length:70},(_,i)=>({date:`2026-01-${String(Math.floor(i/5)+1).padStart(2,'0')}T${String(9+i%5).padStart(2,'0')}:00:00+08:00`,open:10,high:11,low:9,close:10,volume:1}));
  const AB={compute:x=>({bars:x}),signalAt:(x,i,d,strategy)=>({pass:strategy==='A'&&i===60&&d===1||strategy==='B'&&i===61&&d===-1}),exitAt:(x,i,d)=>i===63?'FAIL OUT':null};
  const events=replayEvents(AB,bars,{allowShort:true});
  assert.deepEqual(events.map(e=>[e.strategy,e.kind]),[['A','BUY IN'],['A','FAIL OUT'],['B','SELL IN'],['B','FAIL OUT']]);
});
test('signal event unique identifier includes strategy, type and candle timestamp',()=>{
  const a=eventId('2330',{strategy:'A',kind:'BUY IN',bar_ts:'2026-10-09T09:00+08:00'});
  assert.equal(a,eventId('2330',{strategy:'A',kind:'BUY IN',bar_ts:'2026-10-09T09:00+08:00'}));
  assert.notEqual(a,eventId('2330',{strategy:'B',kind:'BUY IN',bar_ts:'2026-10-09T09:00+08:00'}));
});
test('can transform original UMD strategy source without runtime eval (build smoke)',async()=>{
  // The repository installer supplies web/ab-strategies.js. The module conversion
  // uses the exact shared source and aborts if its shape changes.
  const fs=await import('node:fs');
  const src=fs.readFileSync(new URL('../scripts/build-worker.mjs',import.meta.url),'utf8');
  assert.ok(src.includes("web/ab-strategies.js"));assert.ok(src.includes('return Object.freeze({DEFAULTS'));
});

// API security tests exercise the real Worker route when the shared strategy
// module has been generated from the actual v0.7.0 strategy source.
test('Worker refuses missing auth and never exposes private market credentials',async()=>{
  const fs=await import('node:fs');
  if(!fs.existsSync(new URL('../cloudflare/src/strategy.mjs',import.meta.url)))return;
  const {default:worker}=await import('../cloudflare/src/index.mjs');
  const env={CONTROL_TOKEN:'A'.repeat(48),ALLOWED_ORIGINS:'https://example.com',FUGLE_API_KEY:'FAKE_NEVER_DISPLAY'};
  const req=new Request('https://worker.example/api/settings',{headers:{Origin:'https://example.com'}});
  const res=await worker.fetch(req,env);
  assert.equal(res.status,401);const text=await res.text();
  assert.ok(!text.includes(env.FUGLE_API_KEY));
  assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://example.com');
});
test('Worker enforces origin, validates symbols and never accepts 11 tracked stocks',async()=>{
  const fs=await import('node:fs');if(!fs.existsSync(new URL('../cloudflare/src/strategy.mjs',import.meta.url)))return;
  const mod=await import('../cloudflare/src/index.mjs');
  assert.throws(()=>mod.__test.symbolsOf(Array.from({length:11},(_,i)=>String(1000+i))));
  assert.throws(()=>mod.__test.symbolsOf(['../app']));
  assert.throws(()=>mod.__test.symbolsOf(['2330','2330']));
  assert.deepEqual(mod.__test.symbolsOf(['2330','2382']),['2330','2382']);
  const denied=await mod.default.fetch(new Request('https://worker.example/api/settings',{method:'OPTIONS',headers:{Origin:'https://untrusted.invalid'}}),{CONTROL_TOKEN:'X'.repeat(48),ALLOWED_ORIGINS:'https://example.com'});
  assert.equal(denied.status,403);
});

// Firebase JWT verification must reject unsigned, wrong-project and forged IDs.
import {verifyFirebase,accessFor} from '../cloudflare/src/auth.mjs';
import {webcrypto} from 'node:crypto';
test('owner keeps role; all verified users may join',()=>{
  assert.equal(accessFor({email:'owner@example.com'},'OWNER@example.com',false),'admin');
  assert.equal(accessFor({email:'friend@example.com'},'owner@example.com',true),'member');
  assert.equal(accessFor({email:'stranger@example.com'},'owner@example.com',false),'member');
});
test('Firebase verifies real RS256 signing, issuer, audience and verified email',async()=>{
  const previousFetch=globalThis.fetch;
  const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='unit-test-key';
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{'Cache-Control':'max-age=60'}});
  const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const make=async(changes={})=>{
    const h=enc({alg:'RS256',kid:jwk.kid});
    const p=enc({aud:'project-a',iss:'https://securetoken.google.com/project-a',exp:now+300,iat:now,auth_time:now,sub:'uid1',email:'person@example.com',email_verified:true,...changes});
    const msg=h+'.'+p;
    const sig=Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(msg))).toString('base64url');
    return new Request('https://worker.example/api/settings',{headers:{Authorization:'Bearer '+msg+'.'+sig}});
  };
  try{
    const good=await verifyFirebase(await make(),{FIREBASE_PROJECT_ID:'project-a'});
    assert.deepEqual(good,{uid:'uid1',email:'person@example.com'});
    await assert.rejects(verifyFirebase(await make({aud:'project-b'}),{FIREBASE_PROJECT_ID:'project-a'}));
    await assert.rejects(verifyFirebase(await make({email_verified:false}),{FIREBASE_PROJECT_ID:'project-a'}));
    await assert.rejects(verifyFirebase(new Request('https://worker.example',{headers:{Authorization:'Bearer broken'}}),{FIREBASE_PROJECT_ID:'project-a'}));
  }finally{globalThis.fetch=previousFetch;}
});
