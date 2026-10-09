const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const src = readFileSync(join(__dirname, '..', 'web', 'alerts-client.js'), 'utf8');
const fragment = src.match(/async function signGoogle\(\)\s*\{[\s\S]*?\n\}/);
assert.ok(fragment, 'signGoogle handler should exist');
async function invoke(native) {
  let nativeCalls = 0, webCalls = 0, credentialCalls = 0, ui = [];
  const context = {
    firebase: async () => {}, auth: {}, write: (s) => ui.push(s),
    authSDK: {
      GoogleAuthProvider: function GoogleAuthProvider() {},
      signInWithPopup: async () => { webCalls++; },
      signInWithCredential: async (auth, credential) => { credentialCalls++; assert.equal(credential.token, 'sample-token'); }
    },
    globalThis: {
      StocklabCapacitor: {Capacitor: {isNativePlatform: () => native}, registerPlugin: name => {
        assert.equal(name, 'FirebaseAuthentication');
        return {signInWithGoogle: async options => {
          nativeCalls++;
          assert.equal(options.skipNativeAuth, true);
          return {credential: {idToken: 'sample-token'}};
        }};
      }}
    }
  };
  context.authSDK.GoogleAuthProvider.credential = token => ({token});
  vm.runInNewContext(fragment[0] + '\nthis.run=signGoogle;', context);
  await context.run();
  return {nativeCalls,webCalls,credentialCalls,ui};
}
test('native Android Google login bridges provider token to Firebase JS user session', async () => {
  const result = await invoke(true);
  assert.equal(result.nativeCalls, 1);
  assert.equal(result.credentialCalls, 1);
  assert.equal(result.webCalls, 0);
});
test('web Google login retains popup flow', async () => {
  const result = await invoke(false);
  assert.equal(result.nativeCalls, 0);
  assert.equal(result.credentialCalls, 0);
  assert.equal(result.webCalls, 1);
});
test('native Google login is not blocked by old Android password warning', () => {
  assert.doesNotMatch(fragment[0], /Android 版請使用電子郵件與密碼登入/);
  assert.match(src, /indexedDBLocalPersistence/);
});
