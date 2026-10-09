import AB from './strategy.mjs';
import {isScanTime,taipeiParts,normalize,replayEvents,eventId} from './monitor.mjs';
import {verifyFirebase,accessFor} from './auth.mjs';

const BASE='https://api.fugle.tw/marketdata/v1.0/stock';
const FLAGS=['BUY IN','SELL IN','PROFIT OUT','FAIL OUT'];
const MAX_SYMBOLS=10,MAX_USERS=20,MAX_UNIQUE_SYMBOLS=50;
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
async function sendFcm(env,access,token,ev){
  const title=`台股研究室｜${ev.strategy} ${ev.kind}`, message=`${ev.symbol} ${ev.kind}｜H1 ${ev.bar_ts}`;
  const r=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({message:{token,notification:{title,body:message},data:{symbol:ev.symbol,strategy:ev.strategy,kind:ev.kind,bar_ts:ev.bar_ts,event_id:ev.id},android:{priority:'HIGH',notification:{channel_id:'stocklab_signals',tag:ev.id}},webpush:{notification:{tag:ev.id,renotify:false},fcm_options:{link:env.PUBLIC_SITE_URL||'https://taiwan-stock-lab-mutoe.mutoe-chen-2361.chatgpt.site/#ab'}}}})});
  if(!r.ok){const msg=await r.text();if([400,404].includes(r.status)&&/UNREGISTERED|registration-token-not-registered/.test(msg))return {invalid:true};throw Error('FCM HTTP '+r.status);}
  return {invalid:false};
}

// Deliberately separate from the real trading-event pipeline: no event rows are created.
function buildTestMessage(token){
 return {message:{token,
   notification:{title:'\u53f0\u80a1\u7814\u7a76\u5ba4\uff5cWorker \u6e2c\u8a66\u901a\u77e5',body:'Cloudflare Worker \u2192 Firebase \u2192 Android \u63a8\u64ad\u6e2c\u8a66'},
   data:{type:'test',source:'cloudflare-worker'},
   android:{priority:'HIGH',notification:{channel_id:'stocklab_signals',tag:'stocklab_worker_test'}}
 }};
}
async function sendTestFcm(env,access,token){
 const r=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+'/messages:send',{
   method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(buildTestMessage(token))
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
async function getFugle(path,env){const r=await fetch(BASE+path,{headers:{'X-API-KEY':env.FUGLE_API_KEY}});if(!r.ok)throw Error('Fugle HTTP '+r.status);return r.json();}
async function storeBars(env,symbol,rows){if(!rows.length)return;const bars=AB.cleanBars(rows);for(let i=0;i<bars.length;i+=75){await env.DB.batch(bars.slice(i,i+75).map(b=>env.DB.prepare('INSERT INTO candles(symbol,ts,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?) ON CONFLICT(symbol,ts) DO UPDATE SET open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume').bind(symbol,b.date,b.open,b.high,b.low,b.close,b.volume)));}}
async function hydrate(env,symbol,now){
  const cache=await env.DB.prepare('SELECT last_historical_day FROM cache_state WHERE symbol=?').bind(symbol).first();
  const yesterday=previousDay(now);
  if(!cache||cache.last_historical_day<yesterday){
    const from=dayTW(now-170*86400000);
    const payload=await getFugle(`/historical/candles/${encodeURIComponent(symbol)}?timeframe=60&from=${from}&to=${yesterday}&sort=asc`,env);
    await storeBars(env,symbol,normalize(payload,now));
    await env.DB.prepare('INSERT INTO cache_state(symbol,last_historical_day,updated_at) VALUES(?,?,?) ON CONFLICT(symbol) DO UPDATE SET last_historical_day=excluded.last_historical_day,updated_at=excluded.updated_at').bind(symbol,yesterday,new Date(now).toISOString()).run();
  }
  const recent=await getFugle(`/intraday/candles/${encodeURIComponent(symbol)}?timeframe=60`,env);
  await storeBars(env,symbol,normalize(recent,now));
  const rows=await env.DB.prepare('SELECT ts AS date,open,high,low,close,volume FROM candles WHERE symbol=? ORDER BY ts DESC LIMIT 650').bind(symbol).all();
  return (rows.results||[]).reverse();
}
function closedMs(ev){const hour=taipeiParts(Date.parse(ev.bar_ts)).hour;return Date.parse(ev.bar_ts)+(hour===13?30:60)*60000;}
async function scan(env,now){
  const rows=(await env.DB.prepare('SELECT s.uid,s.symbols,s.flags,s.volume_ratio,s.strategies FROM user_settings s JOIN users u ON u.uid=s.uid WHERE u.active=1 ORDER BY s.uid LIMIT ?').bind(MAX_USERS+1).all()).results||[];
  if(rows.length>MAX_USERS)throw Error('活躍使用者超出安全上限，停止以避免漏掃');
  const people=rows.map(r=>({...r,symbols:JSON.parse(r.symbols),flags:JSON.parse(r.flags),strategies:JSON.parse(r.strategies)}));
  const unique=[...new Set(people.flatMap(p=>p.symbols))];if(unique.length>MAX_UNIQUE_SYMBOLS)throw Error('股票總數超出免費 API 安全上限');
  const market=new Map(),errors=[];
  for(const symbol of unique){try{market.set(symbol,await hydrate(env,symbol,now));}catch(error){errors.push(symbol+': '+String(error.message));}}
  for(const p of people)for(const symbol of p.symbols){const bars=market.get(symbol);if(!bars||bars.length<65)continue;
    const found=replayEvents(AB,bars,{volumeRatio:p.volume_ratio,requireInstitution:false,allowShort:true});
    for(const ev of found){const age=now-closedMs(ev);if(age<0||age>10*60000||!p.flags[ev.kind]||!p.strategies.includes(ev.strategy))continue;
      const id=p.uid+'|'+eventId(symbol,ev);
      await env.DB.prepare('INSERT OR IGNORE INTO user_events(id,uid,symbol,strategy,kind,bar_ts) VALUES(?,?,?,?,?,?)').bind(id,p.uid,symbol,ev.strategy,ev.kind,ev.bar_ts).run();
    }
  }
  await drain(env);
  await env.DB.prepare('UPDATE health SET last_run=?,last_ok=?,error=? WHERE id=1').bind(new Date(now).toISOString(),errors.length?null:new Date(now).toISOString(),errors.length?errors.join('; ').slice(0,180):null).run();
}
async function drain(env){
  await env.DB.prepare("UPDATE user_deliveries SET status='pending' WHERE status='sending' AND claimed_at<? AND attempts<3").bind(Date.now()-5*60000).run();
  const events=(await env.DB.prepare("SELECT id,uid FROM user_events WHERE created_at>=datetime('now','-2 hours') ORDER BY created_at LIMIT 100").all()).results||[];
  if(!events.length)return;
  const jobs=events.map(e=>env.DB.prepare("INSERT OR IGNORE INTO user_deliveries(event_id,token_hash) SELECT ?,token_hash FROM user_subscriptions WHERE uid=? AND active=1 AND created_at<=(SELECT created_at FROM user_events WHERE id=?)").bind(e.id,e.uid,e.id));
  for(let i=0;i<jobs.length;i+=75)await env.DB.batch(jobs.slice(i,i+75));
  const pending=(await env.DB.prepare("SELECT d.event_id,d.token_hash,s.fcm_token,e.symbol,e.strategy,e.kind,e.bar_ts,e.uid FROM user_deliveries d JOIN user_events e ON e.id=d.event_id JOIN user_subscriptions s ON s.token_hash=d.token_hash AND s.uid=e.uid AND s.active=1 WHERE d.status='pending' AND d.attempts<3 ORDER BY e.created_at LIMIT 80").all()).results||[];
  if(!pending.length)return;
  const access=await oauth(env);
  for(const ev of pending){const claimed=await env.DB.prepare("UPDATE user_deliveries SET status='sending',attempts=attempts+1,claimed_at=? WHERE event_id=? AND token_hash=? AND status='pending'").bind(Date.now(),ev.event_id,ev.token_hash).run();
    if(!claimed.meta?.changes)continue;
    try{const result=await sendFcm(env,access,ev.fcm_token,{...ev,id:ev.event_id});
      if(result.invalid)await env.DB.prepare('UPDATE user_subscriptions SET active=0 WHERE token_hash=?').bind(ev.token_hash).run();
      await env.DB.prepare("UPDATE user_deliveries SET status='sent',sent_at=datetime('now') WHERE event_id=? AND token_hash=?").bind(ev.event_id,ev.token_hash).run();
    }catch(error){await env.DB.prepare('UPDATE user_deliveries SET status=?,last_error=? WHERE event_id=? AND token_hash=?').bind(ev.attempts>=3?'failed':'pending',String(error.message).slice(0,160),ev.event_id,ev.token_hash).run();}
  }
}
async function scheduled(env,now=Date.now()){
  if(!isScanTime(now))return;
  try{await scan(env,now);}catch(error){await env.DB.prepare('UPDATE health SET last_run=?,error=? WHERE id=1').bind(new Date(now).toISOString(),String(error.message).slice(0,180)).run();throw error;}
}
async function identify(request,env){
  const ident=await verifyFirebase(request,env);
  let current=await env.DB.prepare('SELECT uid,email,role,active FROM users WHERE uid=?').bind(ident.uid).first();
  if(current){if(current.email!==ident.email||current.active!==1)throw Object.assign(Error('帳號未授權'),{status:403});return current;}
  const invited=await env.DB.prepare('SELECT email FROM invites WHERE email=? AND active=1').bind(ident.email).first();
  const role=accessFor(ident,env.ADMIN_EMAIL,!!invited);
  if(!role)throw Object.assign(Error('僅限受邀親友使用'),{status:403});
  await env.DB.prepare('INSERT OR IGNORE INTO users(uid,email,role) VALUES(?,?,?)').bind(ident.uid,ident.email,role).run();
  await env.DB.prepare('INSERT OR IGNORE INTO user_settings(uid) VALUES(?)').bind(ident.uid).run();
  current=await env.DB.prepare('SELECT uid,email,role,active FROM users WHERE uid=?').bind(ident.uid).first();
  if(!current||current.email!==ident.email||current.active!==1)throw Object.assign(Error('帳號衝突'),{status:403});
  return current;
}
async function userSettings(env,uid){const s=await env.DB.prepare('SELECT symbols,flags,volume_ratio,strategies FROM user_settings WHERE uid=?').bind(uid).first();if(!s)throw Error('缺少使用者設定');return {symbols:JSON.parse(s.symbols),flags:JSON.parse(s.flags),volumeRatio:s.volume_ratio,strategies:JSON.parse(s.strategies)};}
async function route(request,env){
  const corsHeaders=cors(request,env);
  if(request.method==='OPTIONS')return new Response(null,{status:originAllowed(request.headers.get('Origin'),env)?204:403,headers:corsHeaders});
  const url=new URL(request.url),path=url.pathname;
  let user;try{user=await identify(request,env);}catch(e){return respond({error:e.status===403?e.message:'請先使用有效 Firebase 帳號登入'},e.status||401,corsHeaders);}
  try{
    if(path==='/api/settings'&&request.method==='GET')return respond({...await userSettings(env,user.uid),uid:user.uid,email:user.email,role:user.role,enabled:true},200,corsHeaders);
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
      const rows=await env.DB.prepare('SELECT ts AS date,open,high,low,close,volume FROM candles WHERE symbol=? ORDER BY ts DESC LIMIT 650').bind(symbol).all();
      return respond({symbol,timeframe:'60',data:(rows.results||[]).reverse()},200,corsHeaders);
    }
    if(path==='/api/health'&&request.method==='GET'){
      const h=await env.DB.prepare('SELECT last_run,last_ok FROM health WHERE id=1').first();return respond({worker:'v0.7.1',...h},200,corsHeaders);
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
    if(path==='/api/admin/invites'&&user.role==='admin'&&request.method==='POST'){
      const v=await body(request),email=cleanEmail(v.email);
      await env.DB.prepare('INSERT INTO invites(email,invited_by) VALUES(?,?) ON CONFLICT(email) DO UPDATE SET active=1').bind(email,user.uid).run();
      return respond({invited:true,email},200,corsHeaders);
    }
    if(path==='/api/admin/invites'&&user.role==='admin'&&request.method==='GET'){
      const invites=await env.DB.prepare('SELECT email,active,created_at FROM invites ORDER BY created_at DESC LIMIT 50').all();return respond({invites:invites.results||[]},200,corsHeaders);
    }
    if(path.startsWith('/api/admin/'))return respond({error:'僅管理員可使用'},403,corsHeaders);
    return respond({error:'找不到端點'},404,corsHeaders);
  }catch(error){return respond({error:String(error.message).slice(0,180)},400,corsHeaders);}
}
export default {fetch:route,scheduled(controller,env,ctx){ctx.waitUntil(scheduled(env,Date.now()));}};
export const __test={symbolsOf,flagsOf,strategiesOf,cleanEmail,cloudCredentials,scheduled,identify,buildTestMessage};
