# v0.7.2 交付狀態（2026-10-10）

本次完成程式修改與本機驗證，但不是正式部署完成報告。

| 項目 | 狀態 |
|---|---|
| GitHub 起點 | main f48d2b4cabf1f2f3b390ba573abea9d7c48d7d13 |
| GitHub main 新提交 | 未完成：連線 permissions.push=false |
| 個人 Fugle Key／分鐘監控／介面 | 程式已完成；需正式 Worker 升級 |
| 自動化測試 | GitHub 源碼 43 項；原 Site 含額外回歸共 55 項通過（含重疊，不可相加） |
| SQLite migration／隔離 | 通過；只在記憶體測試資料庫執行 |
| Worker 打包 | esbuild 與 Wrangler dry-run 通過；dry-run 不等於部署 |
| 正式 D1 備份及 migration | 尚未執行；現有使用者／訂閱資料未變更 |
| Cloudflare 正式部署 | 未完成：Wrangler 未登入，官方瀏覽器登入頁有驗證錯誤 |
| Android | Capacitor 原生專案建立及 sync 通過；沒有可用的正式簽章／Firebase 設定，未產生 v0.7.2 APK |
| 原網站 | 原 project_id 與網址保留；v0.7.2 源碼待 Worker 就緒後發布，避免前後端版本不相容 |
| Web Push 註冊／送達 | VAPID 格式、SW 帳號隔離、token API、FCM 模擬發送通過；正式註冊與實機送達未驗證 |
| Firebase 正式設定 | 此次未完成官方控制台核對；沿用既有公開 config／VAPID，不重設 Android 設定 |

## 尚需官方授權／操作

- GitHub：為此儲存庫的連線開放 Contents 寫入，並允許執行 Actions；不要在對話貼 PAT。
- Cloudflare：在官方介面登入原帳號；確認既有 D1、Time Travel、SQL 匯出；安全建立 `FUGLE_KEYRING_JSON` Secret。不要提供 Secret 值至聊天。
- 完成後由部署腳本進行同 Worker 升級，核對版本；再發布原 Site 已保存的新版。
- 使用原 Android Actions 簽章與 Firebase secrets 建置 APK；不以臨時 debug 簽章替代。
- 本人／第二帳號各在網站輸入自己的 Fugle Key（不要貼對話）；Chrome／Pixel 各自啟用推播並核對通知中心。

## 重要限制

- 逐分鐘是排程目標；Cloudflare CPU／D1／共享外部請求、Fugle 限流與網路仍需正式壓測。容量不足會輪替。
- 只內建 2026 官方休市日。未知年度安全停抓；臨時休市由維護者更新設定，尚無自動即時公告辨識。
- 測試不會使用私人 Key 或真實 Firebase 私鑰，不等同真實 Fugle、Google 登入或 FCM 送達測試。
- 原資料庫尚未操作，因此不能宣稱已確認正式資料備份或資料遷移成功。
