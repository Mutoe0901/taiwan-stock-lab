import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import worker,{__test} from '../cloudflare/src/index.mjs';
import {seal,unseal} from '../cloudflare/src/credentials.mjs';
import {marketDay} from '../cloudflare/src/calendar.mjs';
import {isScanTime} from '../cloudflare/src/monitor.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'personal-key-tests'};
const vault={FUGLE_KEYRING_JSON:JSON.stringify({v1:Buffer.alloc(32,7).toString('base64')}),FUGLE_KEY_VERSION:'v1'};
function setup(){
 const db=new DatabaseSync(':memory:');for(const f of readdirSync('cloudflare/migrations').sort())db.exec(readFileSync('cloudflare/migrations/'+f,'utf8'));
 const DB={prepare(sql){let args=[];const s={bind(...v){args=v;return s;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return s;},async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const env={DB,...vault,FIREBASE_PROJECT_ID:'project',ADMIN_EMAIL:'owner@example.test',FUGLE_API_KEY:'LEGACY_MUST_NEVER_BE_USED'};
 const api=async(uid,path,{method='GET',data,claims={}}={})=>{
  const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const text=enc({alg:'RS256',kid:jwk.kid})+'.'+enc({aud:'project',iss:'https://securetoken.google.com/project',sub:uid,email:uid+'@example.test',email_verified:true,exp:now+300,iat:now,auth_time:now,...claims});
  return worker.fetch(new Request('https://worker.test'+path,{method,headers:{Authorization:'Bearer '+text+'.'+sign('RSA-SHA256',Buffer.from(text),privateKey).toString('base64url'),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env);
 };
 return {db,env,api,reset:()=>db.exec('DELETE FROM user_rate_limits')};
}
function mockFugle(){
 const calls=[];let status=200;
 const original=global.fetch;global.fetch=async(url,init={})=>{
  if(String(url).includes('/jwk/'))return Response.json({keys:[jwk]});
  assert.ok(String(url).startsWith('https://api.fugle.tw/marketdata/v1.0/stock/'));
  calls.push({url:String(url),key:init.headers['X-API-KEY']});
  if(status!==200)return new Response('sensitive-error-body-'+init.headers['X-API-KEY'],{status});
  return Response.json({data:[{date:'2026-10-08T09:00:00+08:00',open:10,high:12,low:9,close:11,volume:100}]});
 };
 return {calls,status:s=>status=s,restore:()=>global.fetch=original};
}
test('AES-GCM uses fresh IVs, binds UID, detects tampering, and supports old key versions',async()=>{
 const a=await seal(vault,'alice','ALICE_SECRET_123456'),b=await seal(vault,'alice','ALICE_SECRET_123456');
 assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);assert.equal(await unseal(vault,'alice',a),'ALICE_SECRET_123456');
 await assert.rejects(unseal(vault,'bob',a));await assert.rejects(unseal(vault,'alice',{...a,ciphertext:b.ciphertext}));
 await assert.rejects(seal({},'alice','secret'),e=>e.code==='KEY_VAULT_UNAVAILABLE');
 const rotated={...vault,FUGLE_KEY_VERSION:'v2',FUGLE_KEYRING_JSON:JSON.stringify({...JSON.parse(vault.FUGLE_KEYRING_JSON),v2:Buffer.alloc(32,8).toString('base64')})};
 assert.equal(await unseal(rotated,'alice',a),'ALICE_SECRET_123456');assert.equal((await seal(rotated,'alice','new-key')).key_version,'v2');
});
test('verified strangers can join; unverified/wrong-audience/disabled accounts cannot',async()=>{
 const f=mockFugle(),{api,db}=setup();try{
  assert.equal((await api('alice','/api/settings')).status,200);assert.equal(db.prepare('SELECT role FROM users').get().role,'member');
  assert.equal((await api('unverified','/api/settings',{claims:{email_verified:false}})).status,401);
  assert.equal((await api('wrong','/api/settings',{claims:{aud:'wrong'}})).status,401);
  db.exec("UPDATE users SET active=0 WHERE uid='alice'");assert.equal((await api('alice','/api/settings')).status,403);
 }finally{f.restore();db.close();}
});
test('save/check/update/delete never return plaintext; invalid replacement preserves old credential and subscriptions',async()=>{
 const f=mockFugle(),{api,db,env,reset}=setup(),key='ALICE_SECRET_123456';try{
  let response=await api('alice','/api/key',{method:'POST',data:{key}});assert.equal(response.status,200);assert.ok(!(await response.text()).includes(key));
  const row=db.prepare('SELECT * FROM user_credentials').get();assert.ok(!JSON.stringify(row).includes(key));assert.equal(await unseal(env,'alice',row),key);
  assert.ok(!(await (await api('alice','/api/key')).text()).includes(key));assert.deepEqual(await (await api('bob','/api/key')).json(),{configured:false});
  reset();f.status(401);response=await api('alice','/api/key',{method:'POST',data:{key:'INVALID_NEW_KEY_123'}});assert.equal(response.status,502);assert.ok(!(await response.text()).includes('INVALID_NEW_KEY'));
  assert.equal(db.prepare('SELECT revision FROM user_credentials').get().revision,row.revision);
  reset();f.status(429);response=await api('alice','/api/key/check',{method:'POST'});assert.equal(response.status,429);assert.equal((await response.json()).code,'FUGLE_RATE_LIMIT');
  reset();f.status(200);assert.equal((await api('alice','/api/key',{method:'POST',data:{key:'ALICE_NEW_SECRET_123'}})).status,200);
  assert.notEqual(db.prepare('SELECT revision FROM user_credentials').get().revision,row.revision);
  await api('alice','/api/register',{method:'POST',data:{token:'a'.repeat(70),platform:'android'}});
  assert.equal((await api('alice','/api/key',{method:'DELETE'})).status,200);
  assert.equal(db.prepare('SELECT count(*) n FROM user_credentials').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM user_subscriptions WHERE active=1').get().n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM user_settings').get().n,2);
  await assert.rejects(__test.hydrate(env,'alice','2330',Date.parse('2026-10-08T10:02:00+08:00')),e=>e.code==='FUGLE_KEY_REQUIRED');
  assert.ok(f.calls.every(c=>c.key!==env.FUGLE_API_KEY));
 }finally{f.restore();db.close();}
});
test('same symbol uses each users own key/cache; minute dedupe and holiday/weekend zero Fugle calls',async()=>{
 const f=mockFugle(),{api,db,env}=setup(),now=Date.parse('2026-10-08T10:02:00+08:00');try{
  for(const uid of ['alice','bob'])assert.equal((await api(uid,'/api/key',{method:'POST',data:{key:uid.toUpperCase()+'_SECRET_123456'}})).status,200);
  f.calls.length=0;await __test.hydrate(env,'alice','2330',now);assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>c.key==='ALICE_SECRET_123456'));
  await __test.hydrate(env,'alice','2330',now+10000);assert.equal(f.calls.length,2);
  await __test.hydrate(env,'bob','2330',now);assert.equal(f.calls.length,4);assert.equal(f.calls[3].key,'BOB_SECRET_123456');
  await __test.hydrate(env,'alice','2330',now+60000);assert.equal(f.calls.length,5);assert.match(f.calls[4].url,/intraday/);
  for(const date of ['2026-10-09T10:02:00+08:00','2026-10-10T10:02:00+08:00','2026-10-08T14:00:00+08:00'])await __test.hydrate(env,'alice','2330',Date.parse(date));assert.equal(f.calls.length,5);
  const data=db.prepare('SELECT DISTINCT uid FROM user_candles ORDER BY uid').all();assert.deepEqual(data.map(x=>x.uid),['alice','bob']);
  assert.equal((await api('alice','/api/candles?symbol=2382')).status,403);
 }finally{f.restore();db.close();}
});
test('429 cools down just the affected user and does not expose upstream messages',async()=>{
 const f=mockFugle(),{api,db,env}=setup(),now=Date.parse('2026-10-08T10:02:00+08:00');try{
  for(const uid of ['alice','bob'])await api(uid,'/api/key',{method:'POST',data:{key:uid.toUpperCase()+'_SECRET_123456'}});
  f.status(429);await assert.rejects(__test.hydrate(env,'alice','2330',now),e=>e.code==='FUGLE_RATE_LIMIT'&&!e.message.includes('ALICE_SECRET'));
  const count=f.calls.length;await assert.rejects(__test.hydrate(env,'alice','2382',now+60000),e=>e.code==='FUGLE_COOLDOWN');assert.equal(f.calls.length,count);
  f.status(200);await __test.hydrate(env,'bob','2330',now);assert.equal(f.calls.length,count+2);
 }finally{f.restore();db.close();}
});
test('official 2026 calendar handles settlement days, holidays, overrides and unknown years',()=>{
 for(const d of ['2026-02-12','2026-02-13','2026-10-09','2026-10-26','2026-12-25','2026-10-10'])assert.equal(marketDay(d).open,false,d);
 assert.equal(marketDay('2026-10-08').open,true);assert.equal(marketDay('2027-01-04').open,false);
 assert.equal(marketDay('2026-10-08',{TWSE_EXTRA_CLOSED_DATES:'2026-10-08'}).open,false);
 assert.equal(isScanTime(Date.parse('2026-10-08T09:01:00+08:00')),true);assert.equal(isScanTime(Date.parse('2026-10-08T13:35:00+08:00')),true);assert.equal(isScanTime(Date.parse('2026-10-08T13:36:00+08:00')),false);
});
test('scheduled holiday and weekend skip all database and Fugle work',async()=>{
 const DB={prepare(){throw Error('Must not query database');}};
 for(const d of ['2026-10-09','2026-10-10'])await __test.scheduled({DB},Date.parse(d+'T10:02:00+08:00'));
});
test('migration is repeatable and leaves existing rows and legacy tables intact',()=>{
 const {db}=setup();try{
  db.exec("INSERT INTO users(uid,email) VALUES('old','old@example.test');INSERT INTO user_settings(uid) VALUES('old');INSERT INTO user_subscriptions(token_hash,uid,fcm_token,platform) VALUES('hash','old','token','web');INSERT INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES('event','old','2330','A','BUY IN','bar');INSERT INTO user_deliveries(event_id,token_hash) VALUES('event','hash');");
  const tables=['users','user_settings','user_subscriptions','user_events','user_deliveries','settings','subscriptions','candles','invites'];
  const before=tables.map(t=>db.prepare('SELECT * FROM '+t).all());db.exec(readFileSync('cloudflare/migrations/0004_personal_keys.sql','utf8'));assert.deepEqual(tables.map(t=>db.prepare('SELECT * FROM '+t).all()),before);
 }finally{db.close();}
});
test('personal safety budget allows 50 calls per minute; other users and next minute stay available',async()=>{
 const f=mockFugle(),{db,env}=setup(),now=Date.parse('2026-10-08T10:02:00+08:00');try{
  for(let i=0;i<50;i++)await __test.personalFugle('/intraday/candles/2330','alice-key',env,'alice',now);
  await assert.rejects(__test.personalFugle('/intraday/candles/2330','alice-key',env,'alice',now),e=>e.code==='PERSONAL_BUDGET');
  await __test.personalFugle('/intraday/candles/2330','bob-key',env,'bob',now);
  await __test.personalFugle('/intraday/candles/2330','alice-key',env,'alice',now+60000);
  assert.equal(f.calls.length,52);
 }finally{f.restore();db.close();}
});
test('monitor rotates within Cloudflare request budget and does not starve later users',async()=>{
 const f=mockFugle(),{api,db,env}=setup(),now=Date.parse('2026-10-08T10:02:00+08:00');try{
  for(const uid of ['alice','bob','carol','david']){
   await api(uid,'/api/key',{method:'POST',data:{key:uid.toUpperCase()+'_SECRET_123456'}});
   db.prepare('UPDATE user_settings SET symbols=? WHERE uid=?').run(JSON.stringify(['2330','2382','2317','2303','2308','2454','2412','2881','2882','2886']),uid);
  }
  f.calls.length=0;await __test.scan(env,now);assert.ok(f.calls.length<=35);assert.equal(db.prepare('SELECT error FROM health').get().error,'CAPACITY_ROTATION');
  await __test.scan(env,now+60000);await __test.scan(env,now+120000);
  assert.ok(f.calls.some(c=>c.key==='DAVID_SECRET_123456'));
 }finally{f.restore();db.close();}
});
