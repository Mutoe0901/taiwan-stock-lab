# 台股研究室 v0.7.2 操作手冊

適用原網站：https://taiwan-stock-lab-mutoe.mutoe-chen-2361.chatgpt.site
本文件描述 v0.7.2 程式功能。是否已正式上線請看 RELEASE_STATUS_v0.7.2.md，不能以本文件或本機測試當作部署成功證明。

## 登入與個人 Fugle Key

1. 到「05 A/B 策略」，按「使用 Google 帳號登入」。所有完成驗證的帳號可加入，不需要管理員邀請。既有停用帳號仍維持停用。
2. 首次登入，在「我的 Fugle API Key」輸入自己申請的 Key，按「驗證並加密保存」。Google 登入只辨識身分，不會替你申請或取得 Fugle Key。
3. 系統確認金鑰及 H1 歷史行情權限後，才取代舊 Key。驗證失敗不會覆蓋原本可用的 Key。
4. Key 只在你輸入及 HTTPS 提交時短暫存在前端；提交後清空。後端用 AES-256-GCM 與隨機 IV 加密，密文綁定 Firebase UID，解密主金鑰只存在 Worker Secret。
5. 後續登入自動使用已存 Key。API 只回傳「是否已設定／檢查時間／狀態」，不回傳明文或遮罩片段。前端不會保存 Fugle Key 到 localStorage、IndexedDB 或 Preferences。
6. 「檢查已存金鑰」會實際呼叫 Fugle；「驗證並加密保存」可更新 Key；「刪除我的金鑰」只刪本人的 Key，保留股票設定、訂閱、推播紀錄。刪除後不再開始新的 Fugle 查詢或新訊號監控；已送達 FCM 的通知無法撤回。
7. 金鑰檢查／更新限每人每 60 秒一次；Fugle 401／402／403／429 分別顯示無效、額度、權限及頻率問題。429 暫停兩分鐘，其他授權／額度錯誤暫停一小時；成功更新或檢查 Key 會清除暫停。

## 個人監控與查詢頻率

- 每人最多 10 檔；輸入股票代號並儲存 A／B、四種信號開關與 B 放量倍率。資料庫以 UID 區隔股票清單、策略、FCM Token 和推播紀錄。
- 交易日台灣時間 09:00–13:35 每分鐘執行一次排程。13:30 後保留收盤資料確認緩衝。這是排程目標，實際時間受 API、網路、Worker 配額及排程延遲影響。
- 同 UID／Key 版本／股票／分鐘共用查詢快取，手機、網頁和背景不重複抓取。歷史行情每日補齊一次；日內行情逐分鐘更新。金鑰更新後改用新快取版本，不讀另一人的資料。
- 每個人的程式內安全上限為每分鐘 50 次 Fugle 查詢，留出金鑰檢查等餘裕。其他應用共用相同 Fugle Key 的用量仍由 Fugle 合併計算。
- 單次背景監控最多使用 35 次 Fugle 外部請求，另外保留 10 次 FCM 及 OAuth 請求預算。使用者／股票超過共享 Worker 可承載量時，保存游標並在下分鐘公平續查；「查看監控狀態」會顯示容量輪替。
- 因此不能保證無限人數都每分鐘查完。正式上線須量測 Cloudflare CPU、D1 及外部請求用量。沒有擅自開啟付費方案或新 Worker。
- H1 A／B 訊號只採已收盤 K 線；每分鐘抓取不代表每分鐘可產生 H1 訊號。相同收盤 K 線與設定不重複計算，事件與裝置發送有去重機制。
- 2026 年證交所休市日（含農曆年前僅結算交割日）與週末停止自動 Fugle 查詢。非交易時段的手動 H1 查詢只讀個人快取；首次設定後若當天休市，需要等交易日初始化。
- 金鑰有效性檢查是使用者主動要求的例外，休市也可檢查歷史行情權限。
- 內建日曆目前涵蓋 2026；其他年度未設定時安全停抓，維護者須依官方年曆更新 `TWSE_CALENDARS_JSON`。臨時颱風等休市可設定 `TWSE_EXTRA_CLOSED_DATES`，目前不是自動即時抓取臨時公告。

## Web 與 Android 推播

1. 登入後按「啟用本機推播」，同意瀏覽器／Android 系統通知權限。
2. 網頁註冊專用 Service Worker，等待啟動後取得 FCM Token 並綁定本帳號。PWA 離線快取 Worker 與推播 Worker 分開。
3. 按「測試本機網頁推播」或「測試本機 Android 推播」。每人每 60 秒一次，只能發送至本帳號、本機已登記的 Token。
4. FCM 接受訊息不等於裝置已收到。網頁收到事件會顯示「本瀏覽器已收到」，仍請核對作業系統通知中心；背景與關閉分頁也要實測。
5. Web 使用 data-only 訊息，由 Service Worker 檢查 UID、去重後顯示。Android 保留 OS notification 與 stocklab_signals channel。
6. 登出僅停用本機訂閱，不影響同帳號其他手機或瀏覽器。換帳號會清空個人設定畫面與 H1 回測資料，必須重新啟用本機推播。
7. 作業系統勿擾、離線、完全關閉瀏覽器、背景省電可能延遲或阻擋通知；不能以程式測試替代實機驗收。

## A/B、FinMind 與介面

- 01 掃描選股、02 個股總覽、03 大數據、04 回測、05 A/B 策略、06 資金、07 估值。
- D1 日 K 與原有選股繼續使用 FinMind；H1 雲端查詢及 A/B 回測資料使用登入者自己的 Fugle Key。
- H1 查詢前將股票加入本人的監控清單。也可匯入自備 H1 JSON；匯入不會呼叫 Fugle，會排除未收盤資料。
- A 與 B 使用原本共同策略引擎、成本與下一根開盤成交模型，沒有新增下單功能。
- 頁首、APK 底部、PWA 快取及 Android versionName 為 v0.7.2／0.7.2。APK 必須使用既有簽章才可正常覆蓋更新；保留原 Actions secrets，不重設簽章。

## 維護者部署順序與資料備份

1. 確認 GitHub Contents 寫入與 Actions 權限，以及官方 Cloudflare/Firebase 登入。不要將 Key、私鑰、登入密碼或驗證碼貼到對話。
2. 在 Cloudflare 官方介面設定 `FUGLE_KEYRING_JSON` Secret，內容為版本名稱到 Base64 32-byte 隨機 AES 金鑰的 JSON map，例如結構 `{ "v1": "<由維護者安全產生的32位元組金鑰之Base64>" }`。設定 `FUGLE_KEY_VERSION=v1`。此範例是格式說明，不可直接使用。
3. 主金鑰輪替時保留舊版本，直到所有個人密文已重新加密。遺失主金鑰將無法解密個人 Fugle Key，需使用者重設。不要把主金鑰存進 GitHub 公開程式碼或 SQL 備份。
4. 先確認 D1 UUID 與既有綁定，取得 Time Travel bookmark 並匯出完整 SQL；確認匯出包含既有六個使用者／推播資料表，再套用 `0004_personal_keys.sql`。檢查前後既有資料筆數不可下降。
5. 只新增資料表；不 DROP、TRUNCATE、不搬移或刪除舊表，不自動把管理員 Fugle Key 套給其他人。0001–0003 保持原檔。
6. 可在已登入的官方 Wrangler 環境執行 `npm ci`、`npm test`、`npm run deploy:worker`。部署腳本會先備份及核對，再新增資料表、檢查 Secret 名稱後部署同一 Worker。備份存於忽略追蹤且限制權限的 `.backups/`；請另外安全保存。
7. Worker v0.7.2 可用並完成金鑰保管設定後，才發布原網站已保存的版本；不可讓新前端接到舊 Worker。
8. 將修改提交 GitHub main 後，Build Android APK 會執行回歸、固定簽章、建置並上傳 APK artifact。APK 下載位置是該次 Actions 成功執行的 Artifacts，沒有成功 run 就沒有新版 APK。
9. 實測兩個 Google 帳號各自 Key、各自股票、Chrome 前景／背景、Android 同帳號不同裝置；確認 FCM 送達而不是只有 HTTP 接受。
10. 回復時可回復 Worker／原網站程式版本；不要自動執行資料庫還原。舊表保持不動，新增個人資料仍保留。舊版可能重新使用共用 Key，需先評估後再回復。

來源（查核 2026-10-10）：
- https://developer.fugle.tw/docs/pricing/ （官方頁更新日期 2026-09-30）
- https://developer.fugle.tw/docs/data/http-api/historical/candles/
- https://accessibility.twse.com.tw/zh/trading/holiday.html
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/workers/wrangler/commands/d1/
- https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/
