// Encryption keys live only in Worker Secrets. Never return or log credential material.
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const fault=(code,message,status=400)=>Object.assign(Error(message),{code,status});
async function master(env,version){
 let ring;try{ring=JSON.parse(env.FUGLE_KEYRING_JSON||'{}');}catch{throw fault('KEY_VAULT_UNAVAILABLE','個人金鑰保管服務尚未設定',503);}
 let raw;try{raw=bytes(ring[version]||'');}catch{}
 if(raw?.length!==32)throw fault('KEY_VAULT_UNAVAILABLE','個人金鑰保管服務尚未設定',503);
 return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(env,uid,apiKey){
 const version=env.FUGLE_KEY_VERSION||'v1',key=await master(env,version),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(uid)},key,enc.encode(apiKey));
 return {ciphertext:b64(ciphertext),iv:b64(iv),key_version:version,revision:crypto.randomUUID()};
}
export async function unseal(env,uid,row){
 if(!row)throw fault('FUGLE_KEY_REQUIRED','請先設定自己的 Fugle API Key',409);
 try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(row.iv),additionalData:enc.encode(uid)},await master(env,row.key_version),bytes(row.ciphertext)));}
 catch(e){if(e.code)throw e;throw fault('KEY_DECRYPT_FAILED','個人金鑰無法解密，請更新金鑰或聯絡維護者',503);}
}
export function validateKey(value){
 if(typeof value!=='string'||value.length<16||value.length>512||/[^\x21-\x7e]/.test(value))throw fault('INVALID_KEY_FORMAT','Fugle Key 格式錯誤');
 return value;
}
export async function fugle(path,key){
 let response;try{response=await fetch('https://api.fugle.tw/marketdata/v1.0/stock'+path,{headers:{'X-API-KEY':key},signal:AbortSignal.timeout(15000)});}catch{throw fault('FUGLE_UNAVAILABLE','Fugle 連線暫時失敗，請稍後重試',503);}
 const errors={401:['FUGLE_UNAUTHORIZED','個人 Fugle Key 無效或已撤銷'],402:['FUGLE_QUOTA','個人 Fugle 方案額度不足'],403:['FUGLE_FORBIDDEN','個人 Fugle Key 無此行情權限或受 IP 限制'],429:['FUGLE_RATE_LIMIT','個人 Fugle 額度或請求頻率已達上限，請稍後再試']};
 if(!response.ok){const [code,msg]=errors[response.status]||['FUGLE_UPSTREAM','Fugle 行情服務暫時無法完成查詢'];throw fault(code,msg,response.status===429?429:502);}
 let data;try{data=await response.json();}catch{throw fault('FUGLE_RESPONSE','Fugle 回應格式錯誤',502);}
 return data;
}
export async function checkKey(key){const to=new Date(Date.now()-86400000).toISOString().slice(0,10),from=new Date(Date.now()-14*86400000).toISOString().slice(0,10);const result=await fugle('/historical/candles/2330?timeframe=60&from='+from+'&to='+to+'&sort=asc',key);if(!Array.isArray(result.data))throw fault('FUGLE_RESPONSE','Fugle 回應缺少行情資料',502);}
export async function credentialRow(env,uid){return env.DB.prepare('SELECT ciphertext,iv,key_version,revision FROM user_credentials WHERE uid=?').bind(uid).first();}
export async function credentialStatus(env,uid){
 const row=await env.DB.prepare('SELECT updated_at,checked_at,status,last_error FROM user_credentials WHERE uid=?').bind(uid).first();
 return row?{configured:true,...row}:{configured:false};
}
export async function throttle(env,uid,operation,ms=60000){
 const now=Date.now();const r=await env.DB.prepare('INSERT INTO user_rate_limits(uid,operation,next_at) VALUES(?,?,?) ON CONFLICT(uid,operation) DO UPDATE SET next_at=excluded.next_at WHERE user_rate_limits.next_at<=?').bind(uid,operation,now+ms,now).run();
 if(!r.meta?.changes)throw fault('RATE_LIMIT','操作過於頻繁，請稍後再試',429);
}
