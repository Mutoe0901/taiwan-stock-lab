# v0.7.2 交付狀態（2026-10-10 10:08，台灣時間）

功能已提交 GitHub main；使用者已完成 Cloudflare Worker 部署，原網站已發布 v0.7.2，Android APK 已建置。正式帳號登入、個人 Key 與實機推播驗收仍待完成。

| 項目 | 狀態 |
|---|---|
| GitHub 功能提交 | fa7e19fd0168bcd44b53e44f8529a9589c901ca7 |
| 已部署程式／APK 來源 | df339758d934611259bffaeddd4413e654086a7c |
| 個人 Fugle Key／分鐘監控／介面 | 程式已上線；個人帳號實測待完成 |
| 自動化測試 | Actions #21 完整 53 項通過、0 失敗；原 Site 55 項通過（含重疊，不可相加） |
| SQLite migration／隔離 | 記憶體測試通過；正式遷移由使用者電腦執行 |
| 正式 D1 備份及 migration | 截圖確認 SQL 匯出成功、0004 執行 9 項查詢成功；腳本通過前後既有記錄數檢查後進入部署。代理未讀取私人 SQL 備份 |
| Cloudflare 正式部署 | 使用者在官方 Wrangler 重試成功；2026-10-10 10:05 截圖出現 Current Version ID，10:06 使用者確認成功。完整 UUID 未收集；尚未以登入後 API 獨立驗收 |
| Android | Actions #21 成功；versionName 0.7.2、versionCode 72021；保留既有 Firebase／固定簽章，APK v1／v2 簽章驗證通過 |
| 原網站 | Sites version 12 部署 succeeded；deployment appgdep_6ac99e0123748191a1f5a32d5191c7f6，2026-10-10 02:08:20 UTC |
| 原網址 | https://taiwan-stock-lab-mutoe.mutoe-chen-2361.chatgpt.site |
| Web Push 註冊／送達 | 自動化檢查通過；正式瀏覽器註冊、前景／背景與 Android 實機送達仍未驗證 |
| Firebase 正式設定 | 沿用既有設定，未重設使用者或 Android 設定；官方控制台未獨立核對 |

## 尚需本人實機驗收

1. 開啟原網站，確認 v0.7.2，進入「05 A/B 策略」以 Google 登入。
2. 在網站輸入本人的 Fugle Key，按「驗證並加密保存」，重新登入後確認仍顯示已設定。不要把 Key 貼到聊天。
3. 按「啟用本機推播」並允許通知，再按「測試本機網頁推播」；核對「本瀏覽器已收到」及系統通知中心，另驗證背景接收。
4. 安裝下方 APK，以相同 Google 帳號登入並啟用推播，按「測試本機 Android 推播」，核對手機通知中心。
5. 第二個 Google 帳號使用自己的 Key 與股票清單，驗證帳號隔離。交易日再核對 H1 行情及雲端監控狀態。

APK：[Actions #21](https://github.com/Mutoe0901/taiwan-stock-lab/actions/runs/37974026970) → Artifacts → taiwan-stock-lab-debug-apk。Artifact ID 11637313634，保存至 2026-11-08；下載 ZIP 後解壓安裝 APK。

## 部署與限制紀錄

- 先前 D1 複合 SELECT 限制已修正為各表獨立 SELECT。之後正式 migration 成功。
- 初次 Worker 最終部署在 Cloudflare services API 遭遇 504，使用者沿用原備份中的主金鑰檔，只重試 deploy 後成功；不要重新產生或覆寫主金鑰。
- 私人 .backups 資料夾包含 SQL 備份及加密主金鑰，請妥善保管，不上傳 GitHub 或聊天。
- 每分鐘是排程目標；Cloudflare／Fugle 配額不足時輪替，不能保證無限使用者同時每分鐘查完。H1 訊號只使用已收盤 K 線。
- 內建 2026 官方休市日；未知年度安全停抓，臨時休市需維護者設定。
- 自動化測試與成功建置不能取代 Google 登入、真實 Fugle Key 和 FCM 實機送達驗收。
