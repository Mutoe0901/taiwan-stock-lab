// Run only in the owner's authenticated Cloudflare environment. No secrets in argv/output.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,statSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
const cfg=['--config','cloudflare/wrangler.toml'];
function wrangler(args,capture=false){
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,...cfg],{encoding:'utf8',stdio:capture?['ignore','pipe','pipe']:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(r.status!==0){
  // Report only known diagnostic phrases, never raw upstream output or secret values.
  const output=(r.stderr||'')+'\n'+(r.stdout||'');
  const detail=output.match(/too many terms in compound SELECT|no such table: [a-z_]+|no such column: [a-z_]+|SQLITE_[A-Z_]+|D1_[A-Z_]+|Authentication error|permission denied|database is locked/gi);
  throw Error('Cloudflare step failed; deployment stopped: '+args.slice(0,2).join(' ')+(detail?.length?' — '+[...new Set(detail)].join('; '):''));
 }return r.stdout||'';
}
const db='taiwan-stock-lab-db',stamp=new Date().toISOString().replace(/[:.]/g,'-');
const folder=path.resolve('.backups',stamp);mkdirSync(folder,{recursive:true,mode:0o700});chmodSync(folder,0o700);
// Inspect the existing binding. Do not create a database or change its UUID.
const info=JSON.parse(wrangler(['d1','info',db,'--json'],true));
if(info.uuid!=='1b4f6832-68eb-44d4-8a29-37ab397b90de')throw Error('D1 UUID does not match the original database; stop before migration');
const secrets=JSON.parse(wrangler(['secret','list','--format','json'],true));
if(!Array.isArray(secrets)||!secrets.some(x=>x.name==='FIREBASE_SERVICE_ACCOUNT_JSON'))throw Error('Existing Firebase Worker Secret is missing; stop before migration');
const bookmark=wrangler(['d1','time-travel','info',db],true);
if(!bookmark.trim())throw Error('Empty Time Travel response; stop before migration');
writeFileSync(path.join(folder,'time-travel.txt'),bookmark,{mode:0o600});
const backup=path.join(folder,'before-v072.sql');
wrangler(['d1','export',db,'--remote','--output',backup]);chmodSync(backup,0o600);
if(statSync(backup).size<100)throw Error('Backup is empty; stop before migration');
const sql=readFileSync(backup,'utf8');
for(const table of ['users','user_settings','user_subscriptions','user_events','user_deliveries','push_test_requests']){
 if(!new RegExp('CREATE TABLE[^;]*["`\\s]'+table+'["`\\s(]','i').test(sql))throw Error('Missing existing schema '+table+'; stop before migration');
}
// Each table is a separate statement. Compound SELECT terms are limited on D1.
const query=['users','user_settings','user_subscriptions','user_events','user_deliveries','push_test_requests']
 .map(table=>`SELECT '${table}' AS name,count(*) AS n FROM ${table}`).join('; ')+';';
const before=wrangler(['d1','execute',db,'--remote','--command',query,'--json'],true);
writeFileSync(path.join(folder,'counts-before.json'),before,{mode:0o600});
const counts=raw=>{const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||parsed.some(x=>x.success===false||!Array.isArray(x.results)))throw Error('Unexpected D1 response; stopped');return parsed.flatMap(x=>x.results);};
const beforeCounts=counts(before);
const expected=['users','user_settings','user_subscriptions','user_events','user_deliveries','push_test_requests'];
const left=new Map(beforeCounts.map(x=>[x.name,x.n]));
for(const name of expected)if(!Number.isSafeInteger(left.get(name))||left.get(name)<0)throw Error('Missing or invalid pre-migration count: '+name);
// Zero-row queries verify required columns without returning user data or tokens.
const compatibility=[
 'SELECT uid,email,role,active FROM users LIMIT 0',
 'SELECT uid,symbols,flags,volume_ratio,strategies,updated_at FROM user_settings LIMIT 0',
 'SELECT uid,token_hash,fcm_token,platform,active FROM user_subscriptions LIMIT 0',
 'SELECT id,uid,symbol,strategy,kind,bar_ts,created_at FROM user_events LIMIT 0',
 'SELECT event_id,token_hash,status,attempts,claimed_at,sent_at,last_error FROM user_deliveries LIMIT 0',
 'SELECT uid,last_attempt_ms FROM push_test_requests LIMIT 0',
 'SELECT id,last_run,last_ok,error FROM health LIMIT 0'
];
counts(wrangler(['d1','execute',db,'--remote','--command',compatibility.join(';'),'--json'],true));
// First installation only: never overwrite a keyring or orphan existing ciphertext.
let secretsFile;
if(!secrets.some(x=>x.name==='FUGLE_KEYRING_JSON')){
 const exists=counts(wrangler(['d1','execute',db,'--remote','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='user_credentials'",'--json'],true));
 if(exists.length){const rows=counts(wrangler(['d1','execute',db,'--remote','--command','SELECT count(*) AS n FROM user_credentials','--json'],true));if(rows.length!==1||rows[0].n!==0)throw Error('Existing encrypted credentials require the original master key; do not create a replacement');}
 secretsFile=path.join(folder,'worker-secrets.json');
 writeFileSync(secretsFile,JSON.stringify({FUGLE_KEYRING_JSON:JSON.stringify({v1:randomBytes(32).toString('base64')})}),{mode:0o600});
 console.log('Encryption key generated locally after backup checks. Keep the backup folder private; no secret value is printed.');
}
// Existing data is untouched. The migration adds tables and one monitor cursor only.
wrangler(['d1','execute',db,'--remote','--file','cloudflare/migrations/0004_personal_keys.sql']);
const after=wrangler(['d1','execute',db,'--remote','--command',query,'--json'],true);
writeFileSync(path.join(folder,'counts-after.json'),after,{mode:0o600});
const right=new Map(counts(after).map(x=>[x.name,x.n]));
for(const name of expected)if(!Number.isSafeInteger(right.get(name))||right.get(name)<left.get(name))throw Error('Existing row counts decreased or missing; preserve backup and inspect before deployment');
// Wrangler applies omitted secrets additively: existing Firebase/sign-in secrets stay intact.
wrangler(['deploy',...(secretsFile?['--secrets-file',secretsFile]:[])]);
console.log('Worker deploy command completed. Verify returned deployment version and perform authenticated Web/Android tests.');
