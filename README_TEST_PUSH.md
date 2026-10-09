# Taiwan Stock Lab - Admin-only Worker FCM test

This patch adds an authenticated admin-only POST /api/admin/test-push endpoint and a button inside the Android/web app. It sends a notification to the latest active Android device owned by the logged-in admin. It never writes a fake BUY/SELL signal to user_events or user_deliveries. Requests are limited to one per admin per minute via D1.

## Apply

1. Extract this archive directly into the existing project folder, e.g. F:\bot\taiwan-stock-lab, merging directories.
2. Run APPLY_WORKER_TEST_PUSH.bat. It checks that the two source files are unmodified, verifies anchors and syntax, then runs tests.
3. Check: git diff --check and git status --short.
4. Stage only these files:

   git add cloudflare/src/index.mjs web/alerts-client.js cloudflare/migrations/0003_push_test.sql tests/worker-test-push.test.mjs

5. Commit and push:

   git commit -m "test: add admin-only Worker FCM push check"
   git push origin main

## Deploy database and Worker

From the project root:

   cd /d F:\bot\taiwan-stock-lab\cloudflare
   npx wrangler d1 execute taiwan-stock-lab-db --remote --file=migrations/0003_push_test.sql
   npx wrangler deploy

Deploy the migration BEFORE deploying the Worker. The SQL creates only push_test_requests. It does not modify trading event tables or subscriptions.

## Android verification

After GitHub Actions succeeds, download the new signed app-debug.apk and install it over the existing app without uninstalling. Log in as the Firebase admin account, confirm that the new button appears on the A/B page, and tap it. The Worker responds with sent:true after FCM accepts the message. When the app is in the foreground, Android may not show a system notification; for a background notification test, trigger from the updated web UI on a second device while the phone is locked.

## Safety

Never commit google-services.json, .wrangler, .env, Firebase service account keys, FCM registration tokens, or signing keystores. Do not use git add -A. The patch does not alter any secrets, Cron schedules, trading signals, or signing configuration.
