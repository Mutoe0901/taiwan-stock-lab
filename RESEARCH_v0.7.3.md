# 台股研究工具 v0.7.3

## 功能與目前狀態

- **01 Lightweight Charts 5.2.1**：02 個股深度分析內嵌可縮放 K 線、成交量、EMA5/10、MA20、日線/H1 切換、A/B 訊號標記與手動參考線。H1 使用既有個人 Fugle 或匯入資料；沒有資料時會提示，不製造行情。
- **02 Backtrader 1.9.78.123**：04 回測區新增真正 Python Backtrader 引擎，讀取 05 A/B 策略參數，沿用原始 JavaScript 訊號。收盤訊號於下一根開盤成交，計入手續費、賣出稅和滑價，顯示逐筆交易、權益、回撤並可匯出 CSV。
- **04 TradingAgents 0.6.0**：02 深度分析按鈕開啟站內分析。技術、基本面、新聞分析接續多空辯論、研究主管、交易員、風險辯論和投組主管，提供繁中報告、來源、進度、同日快取與個人歷史。

圖表可直接使用。Backtrader 與 TradingAgents 的程式與介面已完成，但需要下列 Python 主機和代理設定才能在線運作；未設定時介面會明確提示。這不是已提供常駐 Python 主機的版本。模型服務實際呼叫及 Android 真機尚未驗證。

## 啟動 Python 服務

在有 Docker Compose 的 Linux/Windows 主機，於專案根目錄執行：

```sh
docker compose -f research_service/compose.yaml up -d --build
```

容器需要連線套件來源、Google Firebase 公鑰、選用模型 API、Google News RSS 和選用 FinMind API。第一次建置會安裝大型模型框架套件。資料放在 Compose 的 research-data volume，請備份該 volume。使用單一服務實例與單一 Uvicorn worker；不要複製多個實例共用 SQLite。

預設只監聽主機 `127.0.0.1:8000`。為此服務建立正式 HTTPS 反向代理或受控通道。不要使用會休眠/重啟而中斷長任務的臨時程序。`GET /v1/status` 可測健康度；工作請求需要 Firebase ID token。

`FIREBASE_PROJECT_ID` 已使用既有專案。可透過 `RESEARCH_ALLOWED_UIDS` 限制允許的 Firebase UID（逗號分隔）；未設定時允許同 Firebase 專案中已驗證電子郵件的帳號。報告仍依 UID 隔離。

## 連接網站與 Android

- 網站的 Sites 執行環境設定 `RESEARCH_SERVICE_URL=https://你的研究服務網域`，重新部署網站。
- Android 使用原有 Cloudflare Worker：在該 Worker 設定相同的 `RESEARCH_SERVICE_URL`，從此版本部署 Worker 原始碼。保留原有 Firebase、Fugle、D1 設定。
- 代理僅允許固定的 `/api/research` 路徑、轉送 Firebase 授權並限制請求大小；瀏覽器不直接指定後端網址。
- Android 原有工作流程仍使用既有簽章及 Firebase secrets。GitHub PR 合併 main 後才會觸發 main 的 APK 自動打包；本次未產生或安裝 APK。

登入後，載入個股資料即可使用圖表。在 04 選擇 Backtrader，輸入期間、資金和交易單位後執行。在 02 點分析，選擇模型供應商、填寫該供應商有效的快/深模型名稱與 API Key，再明確確認開始。模型費用由所填 API Key 的帳號負擔；不使用 ChatGPT 訂閱額度。

API Key 僅用於該次執行，不存入瀏覽器持久儲存或報告資料庫。選用 FinMind 時，會將目前頁面的 FinMind token 傳給研究服務以取得財報和營收。報告包含目前載入的個股摘要、近期行情、公開新聞標題與可取得的財報；沒有公開資訊觀測站公告全文或社群資料時會標示缺失。新聞標題不等於已核實全文。

## 驗證與限制

```sh
npm ci
node scripts/verify-stocklab-073.mjs
npm test
python -m pip install -r research_service/requirements.txt pytest
python -m pytest research_service/tests -q
```

涵蓋隔根成交、無成交量延後、費稅、未收盤 H1 排除、原策略不看未來、帳號隔離、秘密不寫入資料庫、代理限制與介面切換。測試採模型替身驗證實際 TradingAgents 工廠流程，未花費真實 API 額度。Docker 映像建置、實際瀏覽器/Android 真機與正式模型端到端測試需於主機設定後執行。

回測不等於實盤；不模擬台股完整漲跌停撮合、借券可得性與全部借券費。參考線及圖上歷史訊號不會修改策略或發送推播。

## 來源與授權

- [Lightweight Charts](https://github.com/tradingview/lightweight-charts)：5.2.1，Apache-2.0；保留 `web/vendor` LICENSE、NOTICE 及圖表 TradingView 歸屬連結。
- [Backtrader](https://github.com/mementum/backtrader)：1.9.78.123，GPL-3.0；新增 Python 研究服務採 GPL-3.0，完整授權見 `research_service/LICENSE`。
- [TradingAgents](https://github.com/TauricResearch/TradingAgents)：固定 commit `1394a3f72aa4393e1a98f51b382434c4b4c2d972`（0.6.0），Apache-2.0，授權附於 `research_service/TradingAgents-LICENSE.txt`。

Python 研究服務獨立執行；現有前端及其他原始碼的既有授權不由此文件變更。
