# InstaBox 部署：台股研究室 0.7.3

這份部署啟用既有的 Backtrader 與 TradingAgents 後端；個股圖表仍由前端執行。
Kronos 目前是獨立實驗環境，尚未連到網站按鈕，不能將安裝成功當成完整整合完成。
daily_stock_analysis 不在本次部署範圍。

## 機器內部署

使用既有免費機器即可，不變更方案。需要 Docker Engine、Compose >=2.24.4、Python 3、Git。
`agent-browser` 的預設 Python 可能是 3.13，但研究後端容器固定 Python 3.12。
操作以下指令的位置是 **InstaBox 內的終端機**：

```bash
mkdir -p /data/stocklab
git clone --branch feature/research-tools-v073 https://github.com/Mutoe0901/taiwan-stock-lab.git /data/stocklab/taiwan-stock-lab
cd /data/stocklab/taiwan-stock-lab
bash scripts/instabox-research.sh start
```

已有 checkout 時不要重複 clone，先確認分支與未提交修改再更新。
第一次建置會下載 AI 依賴，所需磁碟及時間以機器實測為準。
SQLite 存放在 `/data/stocklab/research-data`；容器重建不會清空。
Docker restart policy 會在容器退出或 daemon 重啟時啟動；**不能讓被平台暫停的 VM 自行喚醒**。
健康檢查會標示異常，Docker 不會只因 unhealthy 就重啟容器。

```bash
bash scripts/instabox-research.sh status
bash scripts/instabox-research.sh logs
bash scripts/instabox-research.sh check
```

check 必須通過版本、Firebase 身份驗證設定及未登入請求 401。
這項檢查不呼叫付費模型，也不代表回測、模型推論已通過端到端驗證。

## 公開 HTTPS 與 Worker

在有 InstaBox CLI 且已登入的電腦執行（機器名稱若不是 main，請替換）：

```bash
instabox port publish main 8000
```

取得網址後，在機器內執行 `bash scripts/instabox-research.sh check https://實際分配網址`。
對外端口不使用 InstaBox 的 token gate，因為現有 Worker 不會傳該平台的 token。
研究 API 的資料操作仍強制驗證 Firebase ID token；不要關閉登入檢查。
測試期可設定 `RESEARCH_ALLOWED_UIDS` 為自己的 Firebase UID（不是 Google 電子郵件），重跑 start 即生效。
不可把模型金鑰、Firebase ID token、InstaBox API key 寫入版本庫。

最後將 Cloudflare Worker 的 `RESEARCH_SERVICE_URL` 設成剛驗證的 HTTPS 根網址，不加 `/v1`。
參考原本 `RESEARCH_v0.7.3.md` 的 Worker 發布流程。完成後驗證網站 `/api/research/status`，再由真正登入的使用者測試回測與 AI 分析。
代理等待時間已調整為 55 秒，並將主機喚醒時的 503 換成中文提示；不自動重送付費分析。
這個修改必須發布 Worker 才會生效。

## Kronos 獨立環境

不要將 Kronos 的 pandas / torch 依賴裝入研究服務容器。
機器須另備 Python 3.12 與 venv；確認磁碟空間足夠後執行：

```bash
bash scripts/instabox-kronos.sh
```

固定既有測試的上游 commit，安裝 CPU torch，儲存依賴清單。
此步驟只確認模組可匯入，尚未下載模型權重。後續仍需固定權重版本、做台股資料推論，
再新增有驗證、限流及併發限制的 API，最後接入前端。

## 交易時段驗收

免費機器的最大時間會依真實使用活動動態延長，不保證每個等待中的背景程式都符合條件。
須在 09:00–13:30 跑真實工作並記錄 `runStartedAt`、`maxRunMinutes`、休眠／冷卻與成功抓行情時間。
不能用空迴圈、人造 CPU 負載或無意義請求測出「可用」。讀取主機狀態本身也不代表工作成功。
還須驗證平台休眠後的公開網址喚醒、Firebase 登入、報告保留，以及中斷時不重複扣模型費用。
本腳本不改變閒置／最長執行政策，不建立外部自動喚醒排程，亦未搬動現有盤中通知程式。

官方參考：
- https://instabox.sh/docs/machines/auto-pause
- https://instabox.sh/docs/ports
- https://instabox.sh/docs/integrations/mcp
