// Run only in the owner's authenticated Cloudflare environment. No secrets in argv/output.
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,statSync,chmodSync} from 'node:fs';
import path from 'node:path';
const cfg=['--config','cloudflare/wrangler.toml'];
function wrangler(args,capture=false){
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,...cfg],{encoding:'utf8',stdio:capture?['ignore','pipe','pipe']:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(r.status!==0)throw Error('Cloudflare step failed; deployment stopped: '+args.slice(0,2).join(' '));return r.stdout||'';
}
const db='taiwan-stock-lab-db',stamp=new Date().toISOString().replace(/[:.]/g,'-');
const folder=path.resolve('.backups',stamp);mkdirSync(folder,{recursive:true,mode:0o700});chmodSync(folder,0o700);
// Inspect the existing binding. Do not create a database or change its UUID.
wrangler(['d1','info',db]);
const bookmark=wrangler(['d1','time-travel','info',db],true);
writeFileSync(path.join(folder,'time-travel.txt'),bookmark,{mode:0o600});
const backup=path.join(folder,'before-v072.sql');
wrangler(['d1','export',db,'--remote','--output',backup]);chmodSync(backup,0o600);
if(statSync(backup).size<100)throw Error('Backup is empty; stop before migration');
const sql=readFileSync(backup,'utf8');
for(const table of ['users','user_settings','user_subscriptions','user_events','user_deliveries','push_test_requests']){
 if(!new RegExp('CREATE TABLE[^;]*["`\\s]'+table+'["`\\s(]','i').test(sql))throw Error('Missing existing schema '+table+'; stop before migration');
}
const query="SELECT 'users' AS name,count(*) AS n FROM users UNION ALL SELECT 'user_settings',count(*) FROM user_settings UNION ALL SELECT 'user_subscriptions',count(*) FROM user_subscriptions UNION ALL SELECT 'user_events',count(*) FROM user_events UNION ALL SELECT 'user_deliveries',count(*) FROM user_deliveries";
const before=wrangler(['d1','execute',db,'--remote','--command',query,'--json'],true);
writeFileSync(path.join(folder,'counts-before.json'),before,{mode:0o600});
// Existing data is untouched. The migration adds tables and one monitor cursor only.
wrangler(['d1','execute',db,'--remote','--file','cloudflare/migrations/0004_personal_keys.sql']);
const after=wrangler(['d1','execute',db,'--remote','--command',query,'--json'],true);
writeFileSync(path.join(folder,'counts-after.json'),after,{mode:0o600});
const counts=raw=>JSON.parse(raw).flatMap(x=>x.results||[]);
const left=new Map(counts(before).map(x=>[x.name,x.n]));
for(const row of counts(after))if(row.n<left.get(row.name))throw Error('Existing row counts decreased; preserve backup and inspect before deployment');
const secrets=JSON.parse(wrangler(['secret','list','--format','json'],true));
for(const name of ['FUGLE_KEYRING_JSON','FIREBASE_SERVICE_ACCOUNT_JSON'])if(!secrets.some(x=>x.name===name))throw Error('Missing Worker Secret '+name+'; configure it in official Cloudflare settings');
wrangler(['deploy']);
console.log('Worker deploy command completed. Verify returned deployment version and perform authenticated Web/Android tests.');
