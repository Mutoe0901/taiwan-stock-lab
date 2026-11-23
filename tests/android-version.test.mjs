import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
test('APK updates use 0.7.4 and retain environment-based stable signing',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'stocklab-signing-test-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 fs.mkdirSync(path.join(folder,'android/app'),{recursive:true});
 fs.writeFileSync(path.join(folder,'android/app/build.gradle'),'android {}\n');
 const result=spawnSync(process.execPath,[path.resolve('scripts/configure-android-signing.mjs')],{cwd:folder,encoding:'utf8',env:{...process.env,RUNNER_TEMP:folder,GITHUB_ENV:path.join(folder,'env'),GITHUB_RUN_NUMBER:'23',ANDROID_KEYSTORE_BASE64:Buffer.alloc(600).toString('base64'),ANDROID_KEYSTORE_PASSWORD:'fake-store-password',ANDROID_KEY_ALIAS:'fake-alias',ANDROID_KEY_PASSWORD:'fake-key-password'}});
 assert.equal(result.status,0,result.stderr);
 const gradle=fs.readFileSync(path.join(folder,'android/app/build.gradle'),'utf8');
 assert.match(gradle,/versionName '0.7.4'/);assert.match(gradle,/versionCode 74023/);
 assert.match(gradle,/signingConfigs.stocklabStable/);
 assert.ok(!gradle.includes('fake-store-password'));
});
