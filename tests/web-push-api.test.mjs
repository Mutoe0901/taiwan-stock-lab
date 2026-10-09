import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import worker,{__test} from '../cloudflare/src/index.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test-web-push-key'};
const digest=x=>createHash('sha256').update(x).digest('hex');
function setup(){
 const db=new DatabaseSync(':memory:');for(const f of ['0001_init.sql','0002_users.sql','0003_push_test.sql','0004_personal_keys.sql'])db.exec(readFileSync('cloudflare/migrations/'+f,'utf8'));
 const DB={prepare(sql){let args=[];const stmt={bind(...v){args=v;return stmt;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};return stmt;},async batch(stmts){return Promise.all(stmts.map(s=>s.run()));}};
 for(const [uid,role] of [['owner','admin'],['friend','member']]){db.prepare('INSERT INTO users(uid,email,role) VALUES(?,?,?)').run(uid,uid+'@example.com',role);db.prepare('INSERT INTO user_settings(uid,symbols) VALUES(?,?)').run(uid,JSON.stringify([uid==='owner'?'2330':'2382']));}
 const env={DB,FIREBASE_PROJECT_ID:'test-project',ALLOWED_ORIGINS:'https://site.example',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'test-project',client_email:'fake@example.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})})};
 const api=async(uid,path,data)=>{
  const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const input=enc({alg:'RS256',kid:jwk.kid})+'.'+enc({sub:uid,email:uid+'@example.com',email_verified:true,aud:'test-project',iss:'https://securetoken.google.com/test-project',iat:now,auth_time:now,exp:now+300});
  const token=input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  return worker.fetch(new Request('https://worker.example'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,Origin:'https://site.example','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),env);
 };
 return {db,env,api};
}
test('real authenticated routes isolate users; send same A/B events to web and Android once',async()=>{
 const original=global.fetch,messages=[];
 global.fetch=async(url,init)=>{
  if(String(url).includes('/jwk/'))return Response.json({keys:[jwk]});
  if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'fake-access'});
  if(String(url).includes('fcm.googleapis.com')){messages.push(JSON.parse(init.body).message);return Response.json({name:'fake-message'});}
  throw Error('Unexpected network call');
 };
 const {api,env,db}=setup();const web='owner-web-token-'.repeat(4),android='owner-android-token-'.repeat(4),other='friend-web-token-'.repeat(4);
 try{
  for(const [uid,token,platform] of [['owner',web,'web'],['owner',android,'android'],['friend',other,'web']])assert.equal((await api(uid,'/api/register',{token,platform})).status,200);
  assert.deepEqual((await (await api('friend','/api/settings')).json()).symbols,['2382']);
  assert.equal((await api('friend','/api/test-push',{platform:'web',token:web})).status,404);
  assert.equal((await api('owner','/api/test-push',{platform:'web',token:other})).status,404);
  assert.equal((await api('owner','/api/test-push',{platform:'web',token:android})).status,404);
  assert.equal((await api('owner','/api/test-push',{platform:'web',token:web})).status,200);
  assert.equal(messages[0].token,web);assert.equal(messages[0].data.uid,'owner');assert.equal(messages[0].notification,undefined);
  assert.equal((await api('owner','/api/test-push',{platform:'web',token:web})).status,429);
  assert.equal(db.prepare('SELECT count(*) n FROM user_events').get().n,0);
  messages.length=0;
  for(const strategy of ['A','B'])db.prepare('INSERT INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES(?,?,?,?,?,?)').run(strategy,'owner','2330',strategy,'BUY IN','2026-10-09T09:00:00+08:00');
  await __test.drain(env);await __test.drain(env);
  assert.equal(messages.length,4);assert.equal(messages.filter(m=>m.token===web).length,2);assert.equal(messages.filter(m=>m.token===android).length,2);assert.equal(messages.filter(m=>m.token===other).length,0);
  assert.equal(messages.find(m=>m.token===android).android.notification.channel_id,'stocklab_signals');
  assert.equal((await api('friend','/api/unregister',{token:web})).status,200);
  assert.equal(db.prepare('SELECT active FROM user_subscriptions WHERE token_hash=?').get(digest(web)).active,1);
  assert.equal((await api('owner','/api/unregister',{token:web})).status,200);
  assert.equal(db.prepare('SELECT active FROM user_subscriptions WHERE token_hash=?').get(digest(android)).active,1);
  await api('friend','/api/register',{token:web,platform:'web'});
  messages.length=0;db.prepare('INSERT INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES(?,?,?,?,?,?)').run('late','owner','2330','A','SELL IN','bar2');await __test.drain(env);
  assert.deepEqual(messages.map(m=>m.token),[android]);
 }finally{global.fetch=original;db.close();}
});
test('more than 100 events drain across bounded batches without starving later events or retries',async()=>{
 const original=global.fetch,messages=[];
 global.fetch=async(url,init)=>{
  if(String(url).includes('/jwk/'))return Response.json({keys:[jwk]});
  if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'fake-access'});
  if(String(url).includes('fcm.googleapis.com')){messages.push(JSON.parse(init.body).message);return Response.json({name:'accepted'});}
  throw Error('Unexpected network');
 };
 const {api,env,db}=setup();try{
  await api('owner','/api/register',{token:'owner-web-token-'.repeat(4),platform:'web'});
  for(let i=0;i<130;i++)db.prepare('INSERT INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES(?,?,?,?,?,?)').run('event-'+i,'owner','2330','A','BUY IN','bar-'+i);
  for(let i=0;i<14;i++)await __test.drain(env,10);
  assert.equal(messages.length,130);assert.equal(db.prepare("SELECT count(*) n FROM user_deliveries WHERE status='sent'").get().n,130);
 }finally{global.fetch=original;db.close();}
});
