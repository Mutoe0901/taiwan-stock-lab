> v0.7.2 已更新，請先閱讀 [最新操作手冊](docs/OPERATION_MANUAL_v0.7.2.md)。以下保留舊版歷史說明；邀請與共用 Key 步驟不適用新版。

# 台股研究室 v0.7.1｜安全雲端監控／FCM 更新包

## 本次版本的真正狀態

這是一份**可套用的原始碼更新包**，不是已發布的網站、APK 或已啟動的推播服務。GitHub App 沒有寫入分支權限（403），因此沒有擅自修改你的 `main`。原本 ChatGPT Site 網址維持不變；它的部署與 GitHub APK Action **分開**，需要在原網站專案執行更新並實測。

### 已實作

- Fugle API Key 保存在 Cloudflare Worker **Secret**；不需再在每次開啟 App 時輸入 Fugle Key（首次需由**你**在 Cloudflare 設定）。
- Cloudflare Cron 每分鐘觸發，交易期間主要在 10:02／11:02／12:02／13:02／13:36（另有延遲重試點）查詢已完成的 H1 60 分 K；13:00 最後一根以 13:30 收盤計算。Cron 和網路推播可能延遲，不能承諾秒級通知。
- Firebase Cloud Messaging HTTP v1 推播到 Android／支援的網頁瀏覽器。
- 兩套策略 A/B 的 BUY IN／SELL IN／PROFIT OUT／FAIL OUT 全部開啟；同策略的進出場依虛擬持倉狀態計算，不是真實券商持倉也不會下單。
- SQLite D1 歷史 H1 K 線快取，每交易日首次掃描取約 170 日歷史，再以日內 60 分 K 增量更新。
- `events` 與 `deliveries` 的唯一索引做訊號／裝置去重；網路失敗重試最多 3 次。FCM 無法保證真正 exactly-once；在罕見的斷線重送時仍可能重複。
- A/B 同一套 `web/ab-strategies.js` 來源轉換為 Worker 模組，避免前端和後端分岔。
- 保留原 APK `appId=com.mutoe.taiwanstocklab` 與既有 Android 簽章 Secrets；版本改 `v0.7.1`、`versionCode` 增加。

## 必需帳號／密鑰（請不要傳到聊天或 GitHub 公開原始碼）

1. 你自己的 **Fugle MarketData API Key**（確認可查詢分 K 及免費額度）。
2. 一個 **Cloudflare** 帳戶（Workers + D1）；安裝 Node 22 及 Wrangler。
3. 一個 **Firebase 專案**，新增 Android App `com.mutoe.taiwanstocklab`。從 Firebase 主控台下載 `google-services.json`，儲存在你自己電腦並加入 GitHub Secrets 的 Base64。必須與 Google Services 專案一致。
4. Firebase 專案中啟用 **Cloud Messaging API (HTTP v1)**，建立服務帳戶，取得 `project_id`、`client_email` 與 `private_key`，填入 Cloudflare Worker Secrets。妥善保護服務帳戶私鑰並限制其 IAM 權限，絕對不要放到 GitHub 或網站。
5. 自行產生高強度 **CONTROL_TOKEN**（至少 32 個隨機字元），只做控制台配對，不是 Fugle 金鑰。此控制密碼僅留在網頁/手機當次執行記憶體；重啟後需重新配對才可變更監控設定，但裝置既有 FCM 訂閱仍會持續收到推播。

## A. 更新原有 GitHub 專案程式（不另開網站）

1. 將 ZIP 解壓縮至既有 `taiwan-stock-lab` 專案資料夾旁（原有專案必須是 v0.7.0）；執行 `APPLY_V071.bat`。你也可以在專案根目錄使用：`python <更新包>/scripts/apply_071.py .`。
2. 先在原有專案執行 `npm install`、`npm run test:ab`、`npm run build:worker`、`npm run test:alerts`。
3. 檢查原有自選股、FinMind Token、A/B 功能及 `git diff`，避免覆蓋別人的工作。
4. **先設定下一節 GitHub Secrets，再 push**；否則 APK Workflow 會安全地停止。
5. 完成後，從專案根目錄 `git add .`、`git commit -m "feat: v0.7.1 H1 alerts"`、`git push origin main`。不要上傳任何 `.jks`、`.env`、`google-services.json` 或 FCM Service Account JSON。
6. 在 GitHub Actions 看到建置成功後下載 APK。第一次從 v0.7.0 到 v0.7.1 應沿用**相同** `ANDROID_KEYSTORE_*` Secrets；請勿重建簽章金鑰。

### GitHub Actions 新增 Secret

新增 `ANDROID_GOOGLE_SERVICES_JSON_BASE64`，值是 Firebase `google-services.json` 的**完整 Base64 字串**。Windows PowerShell 可用：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\\path\\to\\google-services.json')) | Set-Clipboard
```

建置仍沿用先前四個 Android 簽章 Secret：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。**不要更動這四個值。**

## B. Cloudflare Worker + D1（第一次部署）

在**原始專案**根目錄執行：

```shell
npm run build:worker
cd cloudflare
npx wrangler login
npx wrangler d1 create stocklab-alerts
```

將上個指令回傳的 **database_id** 寫入 `cloudflare/wrangler.toml` 的 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。請保留既有 D1 資料庫 ID，後續更新不可重新建立資料庫。

```shell
npx wrangler d1 execute stocklab-alerts --remote --file=migrations/0001_init.sql
npx wrangler secret put FUGLE_API_KEY
npx wrangler secret put CONTROL_TOKEN
npx wrangler secret put FCM_PROJECT_ID
npx wrangler secret put FCM_CLIENT_EMAIL
npx wrangler secret put FCM_PRIVATE_KEY
npx wrangler deploy
```

> `FCM_PRIVATE_KEY` 應使用完整 PEM，包含 BEGIN/END PRIVATE KEY；或複製 JSON 的 private_key 帶 `\n` 字串，程式可還原換行。不要印到 Console、GitHub Actions 日誌，或傳給聊天。生產環境請再考慮憑證輪替、限制權限及裝置移除功能。

`wrangler.toml` 的 `ALLOWED_ORIGINS` 列出原網站及 `https://localhost`（Android WebView）；若正式網站不同，請改成**正確且完整的實際 origin**。若要用其他網址進入網站，需明確加入（不能用 `*`）。

部署成功得到 `https://taiwan-stock-lab-alerts.<your-subdomain>.workers.dev` URL 後，將其填到 `web/alerts-config.js` 的 `workerUrl`。Firebase **Web App 公開設定**（apiKey、authDomain、projectId、appId、messagingSenderId）與 VAPID **公開金鑰**可填到同檔；它們不是秘密。**不要把 Fugle Key、CONTROL_TOKEN、服務帳戶私鑰寫進這個檔案**。

設定更新後須重新建置 APK，因為 Android App 使用打包在 `web/` 的靜態檔案。

## C. 接收通知

手機先安裝 v0.7.1，在「A/B 策略」頁打開「H1 雲端監控」，輸入 **CONTROL_TOKEN** → **連線雲端** → 監控股碼（預設先 1～5 檔；最多 10 檔）→ **儲存設定** → **啟用此裝置推播**。允許 Android 通知權限。FCM 註冊成功會看到提示。

網站也可以設定瀏覽器推播，但需要 HTTPS、Firebase Web 設定、VAPID、通知權限及網站允許服務工作者；`alerts-push/firebase-messaging-sw.js` 用獨立 scope，避免取代原 `sw.js`。Site 若禁止 Service Worker 或外部 Firebase 腳本，會顯示錯誤，需要改用受支援的網站部署環境。

App 關閉後，Workers Cron（而非手機前景程式）仍按交易時段執行；收到通知後可開 App 查看策略狀態。此服務只提供研究通知，**無自動下單**。

### 注意

- 雲端 A/B 策略預設開啟**兩種方向**的虛擬訊號；對沒有融券資格的台股現股，`SELL IN` 只是偏空技術訊號，不等於可以放空。
- 「PROFIT OUT」意指動能衰減離場條件，**不保證實際獲利**。
- B 版「法人過濾」暫不在雲端使用（預設 `requireInstitution=false`），因為 H1 不能使用未公布的當日法人資料；後續需要帶公告時間的日資料來源才能加入。雲端 B 版目前使用 MA20 和量能過濾。
- 不同來源 60 分 K 可能在除權息或資料修正後有差異，務必先核對 FCM 通知與 App 顯示的訊號日期。
- 免費 Cloudflare Workers Cron 非保證準點，FCM 也可能有推播延遲。假日需依交易所休市日曆補強（此版週六日跳過，國定假日即使有掃描也不會憑空建立 K 線）。

## D. 原網站更新

正式的 ChatGPT Site **不是** GitHub Pages，也不是 APK Actions 的自動部署目標。你可以透過 ChatGPT Work 的網站專案編輯/發布流程，將原 GitHub `web/` 的 v0.7.1 靜態檔案更新**到原 Site URL**；必須包括新 `alerts-client.js`、`alerts-config.js`、`alerts-push/` 和 `alerts.css` 等檔案。使用同一個既有專案，不建立新 URL。完成後重新開啟網站確認顯示 v0.7.1，再實測 HTTPS 網頁 FCM（不是只看 GitHub commit）。

## E. 驗收條件

- 版本 v0.7.1，A／B 比較與既有 FinMind 保持正常。
- 未配置雲端：明確提示尚未部署，不會誤稱監控中。
- 配對密碼錯誤：HTTP 401；任一秘密不會在前端程式碼、Console 或錯誤訊息出現。
- Worker D1 加載 60 分 K；10:00、11:00 等 H1 收盤前不發正式訊號；13:00 尾盤半小時 K 在 13:35 後確認。
- D1 不重複儲存已收盤 K 線；事件 `(股票,策略,類型,K線時間)` 唯一，裝置投遞獨立去重。
- 推播訊息包含股號、策略 A/B、四種訊號類型、K 線時間。
- Android 關閉 App 後，發一筆**測試 FCM 通知**確認真機可收到；再利用模擬行情在**測試資料庫**測四種訊號。正式市場通知需等真正觸發，不能捏造已測成功。
- 舊 v0.7.0 不需解除安裝即可覆蓋 v0.7.1，並保留自選股／持股（驗證須在真機進行）。
