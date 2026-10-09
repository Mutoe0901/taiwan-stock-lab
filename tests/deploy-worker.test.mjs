import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/deploy-worker.mjs',import.meta.url));
function scenario(settings={}){
 const dir=mkdtempSync(path.join(tmpdir(),'stocklab-deploy-'));
 mkdirSync(path.join(dir,'node_modules/wrangler/bin'),{recursive:true});
 const stub=`
 const fs=require('fs'),a=process.argv.slice(2),s=JSON.parse(process.env.STOCKLAB_TEST_SCENARIO);
 fs.appendFileSync('calls.jsonl',JSON.stringify(a)+'\\n');
 const out=v=>console.log(JSON.stringify(v));
 const rows=v=>out([{success:true,results:v}]);
 const tables=['users','user_settings','user_subscriptions','user_events','user_deliveries','push_test_requests'];
 if(a[0]==='secret')out(s.noFirebase?[]:[{name:'FIREBASE_SERVICE_ACCOUNT_JSON'},...(s.hasKeyring?[{name:'FUGLE_KEYRING_JSON'}]:[])]);
 else if(a[1]==='info')out({uuid:s.wrongDb?'different-db':'1b4f6832-68eb-44d4-8a29-37ab397b90de'});
 else if(a[1]==='time-travel')console.log('Time Travel bookmark: test-only');
 else if(a[1]==='export')fs.writeFileSync(a[a.indexOf('--output')+1],s.badBackup?'incomplete':tables.map(t=>'CREATE TABLE "'+t+'" (uid TEXT);').join('\\n'));
 else if(a[1]==='execute'&&a.includes('--file'))fs.writeFileSync('migrated','yes');
 else if(a[1]==='execute'){
  const q=a[a.indexOf('--command')+1];
  if(s.badColumns&&q.includes('LIMIT 0'))process.exit(1);
  if(q.includes('sqlite_master'))rows(s.encrypted?[{name:'user_credentials'}]:[]);
  else if(q==='SELECT count(*) AS n FROM user_credentials')rows([{n:3}]);
  else rows(tables.filter(t=>!(s.missingAfter&&fs.existsSync('migrated')&&t==='user_subscriptions')).map(name=>({name,n:s.dropRows&&fs.existsSync('migrated')?1:2})));
 }else if(a[0]==='deploy'){
  if(a.includes('--secrets-file')){const p=JSON.parse(fs.readFileSync(a[a.indexOf('--secrets-file')+1]));const k=JSON.parse(p.FUGLE_KEYRING_JSON);if(Buffer.from(k.v1,'base64').length!==32)process.exit(3);}
  console.log('Deployed test Worker (no network)');
 }else process.exit(2);
 `;
 writeFileSync(path.join(dir,'node_modules/wrangler/bin/wrangler.js'),stub);
 const result=spawnSync(process.execPath,[script],{cwd:dir,encoding:'utf8',env:{...process.env,STOCKLAB_TEST_SCENARIO:JSON.stringify(settings)}});
 const calls=readFileSync(path.join(dir,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 const folders=readdirSync(path.join(dir,'.backups'));
 const backup=path.join(dir,'.backups',folders[0]);
 return {result,calls,backup,clean:()=>rmSync(dir,{recursive:true,force:true})};
}
for(const [name,options] of [['wrong database',{wrongDb:true}],['missing Firebase secret',{noFirebase:true}],['incomplete backup',{badBackup:true}],['incompatible existing columns',{badColumns:true}],['missing master key for existing ciphertext',{encrypted:true}]]){
 test('deployment stops before migration for '+name,()=>{const s=scenario(options);try{assert.notEqual(s.result.status,0);assert.equal(s.calls.some(a=>a.includes('--file')),false);assert.equal(s.calls.some(a=>a[0]==='deploy'),false);}finally{s.clean();}});
}
test('first deployment backs up before migration and supplies a private 256-bit key only in a secrets file',()=>{
 const s=scenario();try{assert.equal(s.result.status,0,s.result.stderr);assert.ok(s.calls.findIndex(a=>a[1]==='export')<s.calls.findIndex(a=>a.includes('--file')));assert.ok(s.calls.at(-1).includes('--secrets-file'));const raw=readFileSync(path.join(s.backup,'worker-secrets.json'),'utf8');const key=JSON.parse(JSON.parse(raw).FUGLE_KEYRING_JSON).v1;assert.equal(Buffer.from(key,'base64').length,32);assert.ok(!s.result.stdout.includes(key));assert.ok(!s.result.stderr.includes(key));assert.ok(!JSON.stringify(s.calls).includes(key));}finally{s.clean();}
});
test('an existing keyring is preserved and never replaced',()=>{const s=scenario({hasKeyring:true});try{assert.equal(s.result.status,0,s.result.stderr);assert.ok(!s.calls.at(-1).includes('--secrets-file'));assert.ok(!readdirSync(s.backup).includes('worker-secrets.json'));}finally{s.clean();}});
for(const options of [{dropRows:true},{missingAfter:true}])test('record loss or missing post-migration counts block Worker publication '+JSON.stringify(options),()=>{const s=scenario({...options,hasKeyring:true});try{assert.notEqual(s.result.status,0);assert.ok(s.calls.some(a=>a.includes('--file')));assert.equal(s.calls.some(a=>a[0]==='deploy'),false);}finally{s.clean();}});
