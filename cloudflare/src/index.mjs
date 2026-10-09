import AB from './strategy.mjs';
import {isScanTime,taipeiParts,normalize,replayEvents,eventId} from './monitor.mjs';
import {verifyFirebase,accessFor} from './auth.mjs';

import {seal,unseal,validateKey,fugle,checkKey,credentialRow,credentialStatus,throttle,fault} from './credentials.mjs';
import {marketDay} from './calendar.mjs';
const FLAGS=['BUY IN','SELL IN','PROFIT OUT','FAIL OUT'];
const MAX_SYMBOLS=10;
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{...HEADERS,...headers,'Content-Type':'application/json; charset=utf-8'}});
const originAllowed=(origin,env)=>!!origin&&(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin);
function cors(req,env){const origin=req.headers.get('Origin');return originAllowed(origin,env)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Vary':'Origin'}:{};}
async function body(req){const raw=await req.text();if(raw.length>16000)throw Error('請求資料過大');return JSON.parse(raw);}
function symbolsOf(value){if(!Array.isArray(value)||value.length>MAX_SYMBOLS)throw Error('自選股最多 10 檔');const out=[...new Set(value.map(v=>String(v).trim()))];if(out.length!==value.length||out.some(v=>!/^[0-9A-Za-z]{4,8}$/.test(v)))throw Error('股票代碼錯誤或重複');return out;}
function flagsOf(v){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('通知設定錯誤');return Object.fromEntries(FLAGS.map(k=>[k,v[k]===true]));}
function strategiesOf(x){if(!Array.isArray(x)||x.length<1||x.length>2||x.some(s=>!['A','B'].includes(s))||new Set(x).size!==x.length)throw Error('策略設定錯誤');return x;}
function cleanEmail(email){const e=String(email||'').trim().toLowerCase();if(e.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw Error('電子郵件格式錯誤');return e;}
const hash=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))).map(b=>b.toString(16).padStart(2,'0')).join('');
function cloudCredentials(env){
  if(!env.FIREBASE_SERVICE_ACCOUNT_JSON)throw Error('缺少 FIREBASE_SERVICE_ACCOUNT_JSON Secret');
  let data;try{data=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw Error('Firebase Secret JSON 格式錯誤');}
  if(!data.project_id||!data.client_email||!data.private_key)throw Error('Firebase Secret 缺少必要欄位');
  if(env.FIREBASE_PROJECT_ID!==data.project_id)throw Error('Firebase Secret 專案與設定不一致');
  return data;
}
const encoded=x=>btoa(String.fromCharCode(...new Uint8Array(x))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function oauth(env){
  const sa=cloudCredentials(env),now=Math.floor(Date.now()/1000);
  const h=encoded(new TextEncoder().encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p=encoded(new TextEncoder().encode(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})));
  const clean=sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(clean),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=encoded(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(h+'.'+p)));
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:h+'.'+p+'.'+sig})});
  if(!r.ok)throw Error('FCM OAuth HTTP '+r.status);
  const value=await r.json();return value.access_token;
}
function signalMessage(env,token,ev){
  const title=`台股研究室｜${ev.strategy} ${ev.kind}`, message=`${ev.symbol} ${ev.kind}｜H1 ${ev.bar_ts}`;
  const data={symbol:ev.symbol,strategy:ev.strategy,kind:ev.kind,bar_ts:ev.bar_ts,event_id:ev.id};
  // Web uses data-only messages so the worker can enforce UID ownership and dedupe
  // before displaying. Keep the proven Android OS-notification payload intact.
  if(ev.platform==='web')return {message:{token,data:{...data,uid:ev.uid,title,body:message},webpush:{headers:{Urgency:'high',TTL:'3600'}}}};
  return {message:{token,notification:{title,body:message},data,android:{priority:'HIGH',notification:{channel_id:'stocklab_signals',tag:ev.id}}}};
}
async function sendFcm(env,access,token,ev){
  const r=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(signalMessage(env,token,ev))});
  if(!r.ok){const msg=await r.text();if([400,404].includes(r.status)&&/UNREGISTERED|registration-token-not-registered/.test(msg))return {invalid:true};throw Error('FCM HTTP '+r.status);}
  return {invalid:false};
}

// Deliberately separate from the real trading-event pipeline: no event rows are created.
function buildTestMessage(token,platform='android',uid=''){
 if(platform==='web')return {message:{token,data:{type:'test',source:'cloudflare-worker',uid,
   event_id:'web-test:'+crypto.randomUUID(),title:'台股研究室｜網頁推播測試',
   body:'Cloudflare Worker → Firebase → Chrome 測試通知；這不是交易訊號。'},
   webpush:{headers:{Urgency:'high',TTL:'300'}}}};
 return {message:{token,
   notification:{title:'\u53f0\u80a1\u7814\u7a76\u5ba4\uff5cWorker \u6e2c\u8a66\u901a\u77e5',body:'Cloudflare Worker \u2192 Firebase \u2192 Android \u63a8\u64ad\u6e2c\u8a66'},
   data:{type:'test',source:'cloudflare-worker'},
   android:{priority:'HIGH',notification:{channel_id:'stocklab_signals',tag:'stocklab_worker_test'}}
 }};
}
async function sendTestFcm(env,access,token,platform,uid){
 const r=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/messages:send',{
   method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(buildTestMessage(token,platform,uid))
 });
 if(!r.ok){
   const message=await r.text();
   if([400,404].includes(r.status)&&/UNREGISTERED|registration-token-not-registered/.test(message))return {invalid:true};
   throw Error('FCM HTTP '+r.status);
 }
 return {invalid:false};
}

const dayTW=now=>taipeiParts(now).date;
function previousDay(now){const p=dayTW(now);return dayTW(Date.parse(p+'T00:00:00+08:00')-86400000);}
async function readBars(env,uid,revision,symbol){
 const rows=await env.DB.prepare('SELECT ts AS date,open,high,low,close,volume FROM user_candles WHERE uid=? AND revision=? AND symbol=? ORDER BY ts DESC LIMIT 650').bind(uid,revision,symbol).all();return (rows.results||[]).reverse();
}
async function storeBars(env,uid,revision,symbol,rows){
 const bars=AB.cleanBars(rows);for(let i=0;i<bars.length;i+=75)await env.DB.batch(bars.slice(i,i+75).map(b=>env.DB.prepare('INSERT INTO user_candles(uid,revision,symbol,ts,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(uid,revision,symbol,ts) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume').bind(uid,revision,symbol,b.date,b.open,b.high,b.low,b.close,b.volume)));
}
async function personalFugle(path,key,env,uid,now,budget){
 if(budget&&budget.left<=0)throw fault('MONITOR_BUDGET','監控容量已滿，將於下一輪續查',429);
 const minute=Math.floor(now/60000);
 const claim=await env.DB.prepare('INSERT INTO user_api_budget(uid,minute,calls) VALUES(?,?,1) ON CONFLICT(uid) DO UPDATE SET minute=excluded.minute,calls=CASE WHEN user_api_budget.minute=excluded.minute THEN user_api_budget.calls+1 ELSE 1 END WHERE user_api_budget.minute!=excluded.minute OR user_api_budget.calls<50').bind(uid,minute).run();
 if(!claim.meta?.changes)throw fault('PERSONAL_BUDGET','個人本分鐘查詢已達安全上限，稍後自動恢復',429);
 if(budget)budget.left--;
 return fugle(path,key);
}
const cacheOnlyTime=minute=>minute<540||minute>815;
async function hydrate(env,uid,symbol,now,budget){
 const row=await credentialRow(env,uid),key=await unseal(env,uid,row),revision=row.revision;
 const cooldown=await env.DB.prepare("SELECT next_at FROM user_rate_limits WHERE uid=? AND operation='fugle-cooldown'").bind(uid).first();
 if(cooldown?.next_at>now)throw fault('FUGLE_COOLDOWN','個人行情暫停重試，請檢查金鑰或稍後再試',429);
 const day=marketDay(dayTW(now),env);
 const t=taipeiParts(now),minute=t.hour*60+t.minute;
 if(!day.open||(cacheOnlyTime(minute)))return {data:await readBars(env,uid,revision,symbol),market:day,cached:true};
 const cache=await env.DB.prepare('SELECT last_historical_day,updated_at FROM user_cache_state WHERE uid=? AND revision=? AND symbol=?').bind(uid,revision,symbol).first();
 if(cache?.updated_at&&Math.floor(now/60000)===Math.floor(Date.parse(cache.updated_at)/60000))return {data:await readBars(env,uid,revision,symbol),market:day,cached:true};
 const lock=await env.DB.prepare('INSERT INTO user_cache_state(uid,revision,symbol,lease_until) VALUES(?,?,?,?) ON CONFLICT(uid,revision,symbol) DO UPDATE SET lease_until=excluded.lease_until WHERE user_cache_state.lease_until<=?').bind(uid,revision,symbol,now+90000,now).run();
 if(!lock.meta?.changes)throw fault('QUERY_IN_PROGRESS','個人行情正在更新，請稍後重試',429);
 try{
  const yesterday=previousDay(now);
  if(!cache||cache.last_historical_day<yesterday){
   const payload=await personalFugle(`/historical/candles/${encodeURIComponent(symbol)}?timeframe=60&from=${dayTW(now-170*86400000)}&to=${yesterday}&sort=asc`,key,env,uid,now,budget);
   await storeBars(env,uid,revision,symbol,normalize(payload,now));
  }
  if(taipeiParts(now).hour>=9){const recent=await personalFugle(`/intraday/candles/${encodeURIComponent(symbol)}?timeframe=60`,key,env,uid,now,budget);await storeBars(env,uid,revision,symbol,normalize(recent,now));}
  const current=await credentialRow(env,uid);if(current?.revision!==revision)throw fault('KEY_CHANGED','個人金鑰已更新，請重新查詢',409);
  await env.DB.prepare('UPDATE user_cache_state SET last_historical_day=?,updated_at=? WHERE uid=? AND revision=? AND symbol=?').bind(yesterday,new Date(now).toISOString(),uid,revision,symbol).run();
  return {data:await readBars(env,uid,revision,symbol),market:day,cached:false};
 }catch(e){
  if(['FUGLE_UNAUTHORIZED','FUGLE_FORBIDDEN','FUGLE_QUOTA','FUGLE_RATE_LIMIT'].includes(e.code)){
   await env.DB.prepare("INSERT INTO user_rate_limits(uid,operation,next_at) VALUES(?,'fugle-cooldown',?) ON CONFLICT(uid,operation) DO UPDATE SET next_at=excluded.next_at").bind(uid,now+(e.code==='FUGLE_RATE_LIMIT'?120000:3600000)).run();
  }throw e;
 }finally{await env.DB.prepare('UPDATE user_cache_state SET lease_until=0 WHERE uid=? AND revision=? AND symbol=?').bind(uid,revision,symbol).run();}
}
function closedMs(ev){const hour=taipeiParts(Date.parse(ev.bar_ts)).hour;return Date.parse(ev.bar_ts)+(hour===13?30:60)*60000;}
async function scan(env,now){
  // 35 Fugle requests + at most 10 FCM + OAuth stay below the free 50 external subrequests.
  // Cursor resumes fairly next minute if there are more users/symbols than this invocation can serve.
  const budget={left:35};let cursor=await env.DB.prepare('SELECT uid,symbol FROM monitor_cursor WHERE id=1').first()||{uid:'',symbol:''};
  const sql="SELECT s.uid,j.value AS symbol,s.flags,s.volume_ratio,s.strategies FROM user_settings s JOIN users u ON u.uid=s.uid JOIN user_credentials c ON c.uid=s.uid JOIN json_each(s.symbols) j WHERE u.active=1 AND (s.uid>? OR (s.uid=? AND j.value>?)) ORDER BY s.uid,j.value LIMIT 50";
  let tasks=(await env.DB.prepare(sql).bind(cursor.uid,cursor.uid,cursor.symbol).all()).results||[];
  if(!tasks.length&&cursor.uid)tasks=(await env.DB.prepare(sql).bind('','','').all()).results||[];
  let processed=0;
  for(const p of tasks){
   if(budget.left<2)break;
   let error=null;
   try{
    const {data:bars}=await hydrate(env,p.uid,p.symbol,now,budget);
    if(bars.length>=65){
     const settingsHash=await hash(JSON.stringify([p.flags,p.volume_ratio,p.strategies]));
     const last=await env.DB.prepare('SELECT bar_ts,settings_hash FROM user_scan_state WHERE uid=? AND symbol=?').bind(p.uid,p.symbol).first();
     if(last?.bar_ts!==bars.at(-1).date||last?.settings_hash!==settingsHash){
      const flags=JSON.parse(p.flags),strategies=JSON.parse(p.strategies);
      for(const ev of replayEvents(AB,bars,{volumeRatio:p.volume_ratio,requireInstitution:false,allowShort:true})){
       const age=now-closedMs(ev);if(age<0||age>10*60000||!flags[ev.kind]||!strategies.includes(ev.strategy))continue;
       const activeKey=await credentialRow(env,p.uid);if(!activeKey)break;
       await env.DB.prepare('INSERT OR IGNORE INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES(?,?,?,?,?,?)').bind(p.uid+'|'+eventId(p.symbol,ev),p.uid,p.symbol,ev.strategy,ev.kind,ev.bar_ts).run();
      }
      await env.DB.prepare('INSERT INTO user_scan_state(uid,symbol,bar_ts,settings_hash) VALUES(?,?,?,?) ON CONFLICT(uid,symbol) DO UPDATE SET bar_ts=excluded.bar_ts,settings_hash=excluded.settings_hash').bind(p.uid,p.symbol,bars.at(-1).date,settingsHash).run();
     }
    }else error='H1_WARMUP: '+p.symbol;
   }catch(e){error=p.symbol+': '+(e.code||'QUERY_FAILED');}
   await env.DB.prepare('INSERT INTO user_health(uid,last_run,last_ok,error) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET last_run=excluded.last_run,last_ok=COALESCE(excluded.last_ok,user_health.last_ok),error=CASE WHEN excluded.error IS NOT NULL THEN excluded.error WHEN user_health.last_run=excluded.last_run THEN user_health.error ELSE NULL END').bind(p.uid,new Date(now).toISOString(),error?null:new Date(now).toISOString(),error).run();
   cursor={uid:p.uid,symbol:p.symbol};processed++;
  }
  const capacity=processed<tasks.length||tasks.length===50;
  await env.DB.prepare('UPDATE monitor_cursor SET uid=?,symbol=? WHERE id=1').bind(capacity?cursor.uid:'',capacity?cursor.symbol:'').run();
  await drain(env,10);
  await env.DB.prepare('UPDATE health SET last_run=?,last_ok=?,error=? WHERE id=1').bind(new Date(now).toISOString(),new Date(now).toISOString(),capacity?'CAPACITY_ROTATION':null).run();
}
async function drain(env,limit=80){
  await env.DB.prepare("UPDATE user_deliveries SET status='pending' WHERE status='sending' AND claimed_at<? AND attempts<3").bind(Date.now()-5*60000).run();
  const events=(await env.DB.prepare("SELECT e.id,e.uid FROM user_events e WHERE e.created_at>=datetime('now','-2 hours') AND EXISTS(SELECT 1 FROM user_subscriptions s WHERE s.uid=e.uid AND s.active=1 AND s.created_at<=e.created_at AND NOT EXISTS(SELECT 1 FROM user_deliveries d WHERE d.event_id=e.id AND d.token_hash=s.token_hash)) ORDER BY e.created_at LIMIT 100").all()).results||[];
  const jobs=events.map(e=>env.DB.prepare("INSERT OR IGNORE INTO user_deliveries(event_id,token_hash) SELECT ?,token_hash FROM user_subscriptions WHERE uid=? AND active=1 AND created_at<=(SELECT created_at FROM user_events WHERE id=?)").bind(e.id,e.uid,e.id));
  for(let i=0;i<jobs.length;i+=75)await env.DB.batch(jobs.slice(i,i+75));
  const pending=(await env.DB.prepare("SELECT d.event_id,d.token_hash,d.attempts,s.fcm_token,s.platform,e.symbol,e.strategy,e.kind,e.bar_ts,e.uid FROM user_deliveries d JOIN user_events e ON e.id=d.event_id JOIN user_subscriptions s ON s.token_hash=d.token_hash AND s.uid=e.uid AND s.active=1 WHERE d.status='pending' AND d.attempts<3 ORDER BY e.created_at LIMIT ?").bind(limit).all()).results||[];
  if(!pending.length)return;
  const access=await oauth(env);
  for(const ev of pending){const claimed=await env.DB.prepare("UPDATE user_deliveries SET status='sending',attempts=attempts+1,claimed_at=? WHERE event_id=? AND token_hash=? AND status='pending'").bind(Date.now(),ev.event_id,ev.token_hash).run();
    if(!claimed.meta?.changes)continue;
    try{const result=await sendFcm(env,access,ev.fcm_token,{...ev,id:ev.event_id});
      if(result.invalid)await env.DB.prepare('UPDATE user_subscriptions SET active=0 WHERE token_hash=?').bind(ev.token_hash).run();
      await env.DB.prepare("UPDATE user_deliveries SET status='sent',sent_at=datetime('now') WHERE event_id=? AND token_hash=?").bind(ev.event_id,ev.token_hash).run();
    }catch(error){await env.DB.prepare('UPDATE user_deliveries SET status=?,last_error=? WHERE event_id=? AND token_hash=?').bind(ev.attempts+1>=3?'failed':'pending',String(error.message).slice(0,160),ev.event_id,ev.token_hash).run();}
  }
}
async function scheduled(env,now=Date.now()){
  if(!isScanTime(now)||!marketDay(dayTW(now),env).open)return;
  try{await scan(env,now);}catch(error){await env.DB.prepare('UPDATE health SET last_run=?,error=? WHERE id=1').bind(new Date(now).toISOString(),error.code||'MONITOR_FAILED').run();throw Error(error.code||'MONITOR_FAILED');}
}
async function identify(request,env){
  let ident;try{ident=await verifyFirebase(request,env);}catch{throw Object.assign(Error('請先使用有效 Firebase 帳號登入'),{status:401});}
  let current=await env.DB.prepare('SELECT uid,email,role,active FROM users WHERE uid=?').bind(ident.uid).first();
  if(current){if(current.email!==ident.email||current.active!==1)throw Object.assign(Error('帳號未授權'),{status:403});return current;}
  const role=accessFor(ident,env.ADMIN_EMAIL);
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO users(uid,email,role) VALUES(?,?,?)').bind(ident.uid,ident.email,role),env.DB.prepare('INSERT OR IGNORE INTO user_settings(uid) VALUES(?)').bind(ident.uid)]);
  current=await env.DB.prepare('SELECT uid,email,role,active FROM users WHERE uid=?').bind(ident.uid).first();
  if(!current||current.email!==ident.email||current.active!==1)throw Object.assign(Error('帳號衝突'),{status:403});
  return current;
}
async function userSettings(env,uid){const s=await env.DB.prepare('SELECT symbols,flags,volume_ratio,strategies FROM user_settings WHERE uid=?').bind(uid).first();if(!s)throw Error('缺少使用者設定');return {symbols:JSON.parse(s.symbols),flags:JSON.parse(s.flags),volumeRatio:s.volume_ratio,strategies:JSON.parse(s.strategies)};}
async function route(request,env){
  const corsHeaders=cors(request,env);
  if(request.method==='OPTIONS')return new Response(null,{status:originAllowed(request.headers.get('Origin'),env)?204:403,headers:corsHeaders});
  const url=new URL(request.url),path=url.pathname;
  let user;try{user=await identify(request,env);}catch(e){return respond({error:e.status===403?e.message:e.status===401?'請先使用有效 Firebase 帳號登入':'雲端服務尚未完成升級或暫時無法使用'},e.status||503,corsHeaders);}
  try{
    if(path==='/api/settings'&&request.method==='GET')return respond({...await userSettings(env,user.uid),uid:user.uid,email:user.email,role:user.role,enabled:true,credentials:await credentialStatus(env,user.uid)},200,corsHeaders);
    if(path==='/api/settings'&&request.method==='POST'){
      const v=await body(request),symbols=symbolsOf(v.symbols),flags=flagsOf(v.flags),strategies=strategiesOf(v.strategies);
      const ratio=Number(v.volumeRatio);if(!Number.isFinite(ratio)||ratio<0.1||ratio>10)throw Error('B 策略倍率範圍錯誤');
      await env.DB.prepare("UPDATE user_settings SET symbols=?,flags=?,volume_ratio=?,strategies=?,updated_at=datetime('now') WHERE uid=?").bind(JSON.stringify(symbols),JSON.stringify(flags),ratio,JSON.stringify(strategies),user.uid).run();
      return respond({saved:true,symbols,flags,volumeRatio:ratio,strategies},200,corsHeaders);
    }
    if(path==='/api/register'&&request.method==='POST'){
      const v=await body(request);if(typeof v.token!=='string'||v.token.length<30||v.token.length>4096||!['android','web'].includes(v.platform))throw Error('推播 Token 格式錯誤');
      const id=await hash(v.token);
      await env.DB.prepare("INSERT INTO user_subscriptions(token_hash,uid,fcm_token,platform) VALUES(?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET uid=excluded.uid,fcm_token=excluded.fcm_token,platform=excluded.platform,active=1,updated_at=datetime('now')").bind(id,user.uid,v.token,v.platform).run();
      return respond({registered:true},200,corsHeaders);
    }
    if(path==='/api/unregister'&&request.method==='POST'){
      const v=await body(request),id=await hash(String(v.token||''));
      await env.DB.prepare('UPDATE user_subscriptions SET active=0 WHERE token_hash=? AND uid=?').bind(id,user.uid).run();
      return respond({unregistered:true},200,corsHeaders);
    }
    if(path==='/api/unregister-all'&&request.method==='POST'){
      await env.DB.prepare('UPDATE user_subscriptions SET active=0 WHERE uid=?').bind(user.uid).run();
      return respond({unregistered:true,scope:'all_devices'},200,corsHeaders);
    }
    if(path==='/api/candles'&&request.method==='GET'){
      const symbol=url.searchParams.get('symbol')||'',s=await userSettings(env,user.uid);
      if(!s.symbols.includes(symbol))return respond({error:'該股票不在你的監控清單內'},403,corsHeaders);
      const result=await hydrate(env,user.uid,symbol,Date.now());
      return respond({symbol,timeframe:'60',...result},200,corsHeaders);
    }
    if(path==='/api/health'&&request.method==='GET'){
      const h=await env.DB.prepare('SELECT last_run,last_ok,error FROM user_health WHERE uid=?').bind(user.uid).first();const globalHealth=await env.DB.prepare('SELECT error FROM health WHERE id=1').first();return respond({worker:'v0.7.2',...h,capacityRotation:globalHealth?.error==='CAPACITY_ROTATION',market:marketDay(dayTW(Date.now()),env)},200,corsHeaders);
    }
    if(path==='/api/key'&&request.method==='GET')return respond(await credentialStatus(env,user.uid),200,corsHeaders);
    if(path==='/api/key'&&request.method==='POST'){
      const v=await body(request),key=validateKey(v.key);await throttle(env,user.uid,'key-check');
      const encrypted=await seal(env,user.uid,key);await checkKey(key);const now=new Date().toISOString();
      await env.DB.prepare("INSERT INTO user_credentials(uid,ciphertext,iv,key_version,revision,updated_at,checked_at,status) VALUES(?,?,?,?,?,?,?,'valid') ON CONFLICT(uid) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,key_version=excluded.key_version,revision=excluded.revision,updated_at=excluded.updated_at,checked_at=excluded.checked_at,status='valid',last_error=NULL").bind(user.uid,encrypted.ciphertext,encrypted.iv,encrypted.key_version,encrypted.revision,now,now).run();
      await env.DB.prepare("DELETE FROM user_rate_limits WHERE uid=? AND operation='fugle-cooldown'").bind(user.uid).run();
      return respond({configured:true,checked:true},200,corsHeaders);
    }
    if(path==='/api/key/check'&&request.method==='POST'){
      await throttle(env,user.uid,'key-check');const row=await credentialRow(env,user.uid),key=await unseal(env,user.uid,row);
      try{await checkKey(key);await env.DB.prepare("UPDATE user_credentials SET checked_at=?,status='valid',last_error=NULL WHERE uid=? AND revision=?").bind(new Date().toISOString(),user.uid,row.revision).run();}
      catch(e){await env.DB.prepare("UPDATE user_credentials SET checked_at=?,status='error',last_error=? WHERE uid=? AND revision=?").bind(new Date().toISOString(),e.code||'CHECK_FAILED',user.uid,row.revision).run();throw e;}
      await env.DB.prepare("DELETE FROM user_rate_limits WHERE uid=? AND operation='fugle-cooldown'").bind(user.uid).run();
      return respond({configured:true,checked:true},200,corsHeaders);
    }
    if(path==='/api/key'&&request.method==='DELETE'){
      await env.DB.prepare('DELETE FROM user_credentials WHERE uid=?').bind(user.uid).run();
      return respond({configured:false,deleted:true},200,corsHeaders);
    }
    if(path==='/api/test-push'&&request.method==='POST'){
      const v=await body(request);if(!['web','android'].includes(v.platform)||typeof v.token!=='string')throw fault('DEVICE_REQUIRED','請先在本機啟用推播');
      const id=await hash(v.token),device=await env.DB.prepare('SELECT token_hash,fcm_token FROM user_subscriptions WHERE uid=? AND token_hash=? AND platform=? AND active=1').bind(user.uid,id,v.platform).first();
      if(!device)return respond({error:'本機尚未登記推播訂閱'},404,corsHeaders);
      await throttle(env,user.uid,'test-push');const result=await sendTestFcm(env,await oauth(env),device.fcm_token,v.platform,user.uid);
      if(result.invalid){await env.DB.prepare('UPDATE user_subscriptions SET active=0 WHERE uid=? AND token_hash=?').bind(user.uid,id).run();return respond({error:'推播 Token 已失效，請重新啟用'},410,corsHeaders);}
      return respond({sent:true,platform:v.platform,test:true},200,corsHeaders);
    }

    if(path==='/api/admin/test-push'&&request.method==='POST'){
      if(user.role!=='admin')return respond({error:'\u50c5\u7ba1\u7406\u54e1\u53ef\u6e2c\u8a66\u63a8\u64ad'},403,corsHeaders);
      const device=await env.DB.prepare("SELECT token_hash,fcm_token FROM user_subscriptions WHERE uid=? AND platform='android' AND active=1 ORDER BY updated_at DESC LIMIT 1").bind(user.uid).first();
      if(!device)return respond({error:'\u627e\u4e0d\u5230\u672c\u5e33\u865f\u5df2\u555f\u7528\u7684 Android \u8a02\u95b1'},404,corsHeaders);
      const now=Date.now();
      const claimed=await env.DB.prepare('INSERT INTO push_test_requests(uid,last_attempt_ms) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET last_attempt_ms=excluded.last_attempt_ms WHERE push_test_requests.last_attempt_ms<?').bind(user.uid,now,now-60000).run();
      if(!claimed.meta?.changes)return respond({error:'\u8acb\u7b49\u5f85 60 \u79d2\u518d\u6e2c\u8a66'},429,corsHeaders);
      const result=await sendTestFcm(env,await oauth(env),device.fcm_token);
      if(result.invalid){
        await env.DB.prepare('UPDATE user_subscriptions SET active=0 WHERE token_hash=? AND uid=?').bind(device.token_hash,user.uid).run();
        return respond({error:'FCM Token \u5df2\u5931\u6548\uff0c\u8acb\u91cd\u65b0\u8a02\u95b1'},410,corsHeaders);
      }
      return respond({sent:true,platform:'android',test:true},200,corsHeaders);
    }
    if(path.startsWith('/api/admin/'))return respond({error:'僅管理員可使用'},403,corsHeaders);
    return respond({error:'找不到端點'},404,corsHeaders);
  }catch(error){return respond({error:error.code?error.message:'操作未完成，請確認設定或稍後再試',code:error.code||'REQUEST_FAILED'},error.status||400,corsHeaders);}
}
export default {fetch:route,scheduled(controller,env,ctx){ctx.waitUntil(scheduled(env,Date.now()));}};
export const __test={symbolsOf,flagsOf,strategiesOf,cleanEmail,cloudCredentials,scheduled,identify,buildTestMessage,hydrate,scan,route,drain,signalMessage,personalFugle};
