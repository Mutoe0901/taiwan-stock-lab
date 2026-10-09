import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
if(!existsSync(new URL('../cloudflare/src/strategy.mjs',import.meta.url))){
 execFileSync(process.execPath,['scripts/build-worker.mjs'],{cwd:root,stdio:'pipe'});
}
const {__test,default:worker}=await import('../cloudflare/src/index.mjs');
test('Worker test notification uses a dedicated test payload, not a trading event',()=>{
 const payload=__test.buildTestMessage('FAKE_DEVICE_TOKEN');
 assert.equal(payload.message.token,'FAKE_DEVICE_TOKEN');
 assert.equal(payload.message.data.type,'test');
 assert.equal(payload.message.data.source,'cloudflare-worker');
 assert.equal(payload.message.android.notification.channel_id,'stocklab_signals');
 assert.ok(!('event_id' in payload.message.data));
 assert.ok(!('symbol' in payload.message.data));
 assert.ok(!('strategy' in payload.message.data));
 assert.ok(!('kind' in payload.message.data));
});
test('Worker test endpoint requires Firebase authorization',async()=>{
 const r=await worker.fetch(new Request('https://worker.example/api/admin/test-push',{method:'POST'}),{FIREBASE_PROJECT_ID:'test-project'});
 assert.equal(r.status,401);
});
test('Worker UI exposes personal device tests',()=>{
 const src=readFileSync(new URL('../web/alerts-client.js',import.meta.url),'utf8');
 assert.match(src,/alerts-test-push/);
 assert.match(src,/api\/test-push/);assert.doesNotMatch(src,/currentRole!=='admin'/);
});
