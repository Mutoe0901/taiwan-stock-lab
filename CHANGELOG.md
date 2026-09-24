## 0.6.2
- 將「🧠 ChatGPT 深度分析」快速按鈕移到個股總覽最上方的研究標的工具列，一進頁面即可看見。
- 快速按鈕直接沿用原本的 ChatGPT 深度分析流程：優先開啟官方 ChatGPT App，失敗時改用系統分享。
- 手機版按鈕改為整列顯示，避免被工具列其他按鈕擠到畫面外。
- 更新 PWA 快取版本，降低升級後仍顯示舊介面的機率。

# Changelog

## 0.6.1 — Direct ChatGPT handoff + High mode guidance

- 新增「🧠 直接用 ChatGPT 分析」按鈕。
- Android 會優先以指定套件方式直接開啟官方 ChatGPT App，並把完整分析 Prompt 帶入。
- 若 ChatGPT App 未安裝或無法接收內容，自動退回原本的 Android 系統分享選單。
- 分析區塊明確標示完整個股研究建議使用 ChatGPT High 推理強度。
- Prompt 開頭加入 High 推理強度建議，但不假裝 APK 能替使用者強制切換 ChatGPT 的推理設定。
- PWA 快取版本更新。


## 0.6.0 — ChatGPT handoff

- 新增「用 ChatGPT 深度分析」區塊。
- 自動把目前股票的行情、均線、MACD、KD、法人、大數據統計與近八期財務摘要整理成繁體中文 Prompt。
- 新增 Prompt 預覽、複製與 Android 系統分享功能。
- Android 可從分享選單選擇使用者自己已登入的 ChatGPT，不需要 OpenAI API Key。
- 最新新聞與催化因素改由 ChatGPT 在收到 Prompt 後查證；本機資料與外部最新資料要求分開標示。
- PWA 快取版本更新，避免舊版 main.js 持續被使用。

## Big Data update — 2026-09-17

- 新增「大數據多頭機率分析」獨立頁面。
- 新增 7 條件歷史相似度模型。
- 新增 5/10/20/60 日後報酬統計。
- 新增平均盈虧比、MAE/MFE、最差/最佳歷史結果。
- 新增樣本數警示與 CSV 匯出。
- 手機底部導覽列由 4 項調整為 5 項。
- 新增 PWA manifest / service worker / icon。
- PWA / Web 新增 FinMind 直接請求路徑。

## Scanner update — 2026-09-17
- 新增多檔大數據選股掃描頁。
- 可選 5 / 10 / 20 / 60 日觀察期與 4 / 5 / 6 條件相似門檻。
- 可設定最少歷史樣本、最低目前多頭條件數與是否只顯示達樣本門檻標的。
- 排序依歷史上漲比例，其次中位數報酬與樣本數；排序明確標示為研究工具，不是買進建議。
- 顯示平均報酬、中位數、盈虧比、平均最大不利變動與樣本可信度。
- 支援掃描結果 CSV 匯出及一鍵跳轉個股大數據詳細頁。

## 0.5.1
- 修正 Android `App plugin is not implemented on android`。
- 加入官方 Capacitor App / Filesystem / Preferences / Share plugins。
- 移除前端對自訂 `StocklabDevice` plugin 的依賴。
- FinMind Token 改用 Capacitor Preferences 儲存。
- Android 匯出改用 Filesystem + 系統分享介面，支援文字與二進位 Blob。
- Android 畫面版本更新為 0.5.1。
