/** Configure a consistent private signing certificate for APK upgrades. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const names=['ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD'];
const missing=names.filter(n=>!process.env[n]?.trim());
if(missing.length){console.error('APK 安全建置已停止：缺少固定簽章 GitHub Secrets：'+missing.join(', '));console.error('請參考 UPDATE_GUIDE.md；每次隨機 debug 簽章會導致 APK 不能直接覆蓋更新。');process.exit(1);}
const b64=process.env.ANDROID_KEYSTORE_BASE64.trim();
const data=Buffer.from(b64,'base64');
if(data.length<500){console.error('簽章金鑰內容格式不正確');process.exit(1);}
const filename=path.join(process.env.RUNNER_TEMP||os.tmpdir(),'stocklab-signing.jks');
fs.writeFileSync(filename,data,{mode:0o600});
const gradlePath='android/app/build.gradle';
const source=fs.readFileSync(gradlePath,'utf8');
if(source.includes('stocklabStable')){console.log('Stable signer is already configured');process.exit(0);}
const runNumber=Number.parseInt(process.env.GITHUB_RUN_NUMBER||'0',10);
const versionCode=71000+(Number.isInteger(runNumber)&&runNumber>0?runNumber:1);
const stable=`
// Taiwan Stock Lab: stable APK signing; secrets are read from environment, not stored in Git.
android {
    defaultConfig {
        versionCode ${versionCode}
        versionName '0.7.1'
    }
    signingConfigs {
        stocklabStable {
            storeFile file(System.getenv('STOCKLAB_KEYSTORE_FILE'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.stocklabStable
        }
    }
}
`;
fs.appendFileSync(gradlePath,stable);
fs.appendFileSync(process.env.GITHUB_ENV||path.join(os.tmpdir(),'stocklab-env.txt'),`STOCKLAB_KEYSTORE_FILE=${filename}\nSTOCKLAB_VERSION_CODE=${versionCode}\n`);
console.log('Stable signing configuration prepared. App versionName 0.7.0, versionCode '+versionCode);
