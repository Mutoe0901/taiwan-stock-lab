/* Firebase ID token RS256 verification for Cloudflare Workers. Not a JWT decoder-only check. */
const KEY_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const te=new TextEncoder();
let keySet=null,expires=0;
function decode(s){if(!/^[\w-]+$/.test(s))throw Error('Malformed JWT');const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));}
function parse(s){return JSON.parse(new TextDecoder().decode(decode(s)));}
async function fetchKeys(){
  if(keySet&&Date.now()<expires)return keySet;
  const r=await fetch(KEY_URL);if(!r.ok)throw Error('Firebase verification keys unavailable');
  const j=await r.json();if(!Array.isArray(j.keys))throw Error('Firebase keys invalid');
  const max=Number((r.headers.get('Cache-Control')||'').match(/max-age=(\d+)/)?.[1]||1800);
  keySet=j.keys;expires=Date.now()+Math.min(Math.max(max,60),3600)*1000;
  return keySet;
}
export async function verifyFirebase(req,env){
  const token=(req.headers.get('Authorization')||'').match(/^Bearer ([^\s]+)$/)?.[1];
  if(!token)throw Error('登入憑證缺失');
  const parts=token.split('.');if(parts.length!==3)throw Error('登入憑證無效');
  const header=parse(parts[0]),claims=parse(parts[1]);
  if(header.alg!=='RS256'||!header.kid||typeof header.kid!=='string')throw Error('登入憑證演算法無效');
  const project=env.FIREBASE_PROJECT_ID;
  if(!project||claims.aud!==project||claims.iss!==`https://securetoken.google.com/${project}`)throw Error('Firebase 專案不符合');
  const now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(claims.exp)||claims.exp<=now||!Number.isInteger(claims.iat)||claims.iat>now+60||!Number.isInteger(claims.auth_time)||claims.auth_time>now+60)throw Error('登入憑證已失效');
  if(typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128||claims.email_verified!==true||typeof claims.email!=='string')throw Error('請先完成電子郵件驗證');
  const jwk=(await fetchKeys()).find(k=>k.kid===header.kid&&k.kty==='RSA');
  if(!jwk)throw Error('找不到簽章金鑰');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),te.encode(parts[0]+'.'+parts[1]));
  if(!verified)throw Error('Firebase 簽章驗證失敗');
  return {uid:claims.sub,email:claims.email.trim().toLowerCase()};
}
export function accessFor(identity,adminEmail,invited){
  if(identity.email===String(adminEmail||'').trim().toLowerCase()&&adminEmail)return 'admin';
  return 'member';
}
