/* Prepare Capacitor 7 Android Google Sign-In, without modifying any signing keys. */
import fs from 'node:fs';
import path from 'node:path';

function read(p) { if (!fs.existsSync(p)) throw Error(`Missing generated Android file: ${p}`); return fs.readFileSync(p, 'utf8'); }
function write(p, s) { fs.writeFileSync(p, s); }
function insertOnce(text, pattern, snippet, filename) {
  if (text.includes(snippet.trim())) return text;
  if (!pattern.test(text)) throw Error(`Cannot find expected Gradle section in ${filename}; refusing to modify`);
  return text.replace(pattern, match => match + snippet);
}

const base = path.resolve('android');
const variableFile = path.join(base, 'variables.gradle');
let variables = read(variableFile);
if (!/\brgcfaIncludeGoogle\s*=/.test(variables)) {
  variables = insertOnce(variables, /ext\s*\{/, '\n    rgcfaIncludeGoogle = true', variableFile);
}
if (!/\bandroidxCredentialsVersion\s*=/.test(variables)) {
  variables = insertOnce(variables, /ext\s*\{/, "\n    androidxCredentialsVersion = '1.3.0'", variableFile);
}
write(variableFile, variables);

const rootFile = path.join(base, 'build.gradle');
let root = read(rootFile);
if (!/com\.google\.gms:google-services:/.test(root)) {
  const match = root.match(/buildscript\s*\{[\s\S]*?dependencies\s*\{/);
  if (!match) throw Error('Missing buildscript.dependencies block in android/build.gradle');
  root = root.replace(match[0], match[0] + "\n        classpath 'com.google.gms:google-services:4.5.0'");
}
write(rootFile, root);

const appFile = path.join(base, 'app', 'build.gradle');
let gradle = read(appFile);
if (!/apply\s+plugin:\s*['"]com\.google\.gms\.google-services['"]/.test(gradle)) {
  if (!/apply\s+plugin:\s*['"]com\.android\.application['"]/.test(gradle)) throw Error('Missing Android application plugin in app/build.gradle');
  gradle += "\napply plugin: 'com.google.gms.google-services'\n";
}
write(appFile, gradle);

// Fail loudly when the user has not refreshed google-services.json after adding SHA-1.
const configFile = path.join(base, 'app', 'google-services.json');
if (!fs.existsSync(configFile)) throw Error('Missing android/app/google-services.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (config.project_info?.project_id !== 'taiwan-stock-lab-b6294') throw Error('Wrong Firebase project in google-services.json');
const androidClient = config.client?.find(c => c.client_info?.android_client_info?.package_name === 'com.mutoe.taiwanstocklab');
if (!androidClient) throw Error('google-services.json is missing package com.mutoe.taiwanstocklab');
const androidOauth = (androidClient.oauth_client || []).filter(c => c.client_type === 1);
const webOauth = (androidClient.oauth_client || []).filter(c => c.client_type === 3);
if (!androidOauth.length || !webOauth.length) {
  throw Error('google-services.json has no Android and Web OAuth clients. Add the signed APK SHA-1 to Firebase Android app, download the NEW google-services.json, update ANDROID_GOOGLE_SERVICES_JSON_BASE64, then re-run.');
}
console.log('Native Google Sign-In Gradle configuration: OK');
console.log('Android package, Firebase project and OAuth clients: OK');
console.log('APK signing configuration has not been changed.');
