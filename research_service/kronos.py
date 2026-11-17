"""Offline Kronos-small CPU forecasts. No provider API or user credentials."""
import json
import math
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

REVISION = '67b630e67f6a18c9e9be918d9b4337c960db1e9a'


def prepare(req, now=None):
    import pandas as pd
    import exchange_calendars as xcals
    now = now or datetime.now(ZoneInfo('Asia/Taipei'))
    rows = [b.model_dump() for b in req.stock.bars]
    if any(len(b['date']) != 10 for b in rows):
        raise ValueError('Daily bars only')
    # Exclude today's unfinished daily candle, including a 90-second publication margin.
    rows = [b for b in rows if datetime.fromisoformat(b['date']).replace(
        tzinfo=ZoneInfo('Asia/Taipei'), hour=13, minute=31, second=30) <= now]
    if len(rows) < 65:
        raise ValueError('At least 65 closed daily candles required')
    rows = rows[-256:]
    last = pd.Timestamp(rows[-1]['date'])
    calendar = xcals.get_calendar('XTAI', start=rows[0]['date'],
                                 end=(last + pd.Timedelta(days=90)).strftime('%Y-%m-%d'))
    valid = set(calendar.sessions.strftime('%Y-%m-%d'))
    if any(b['date'] not in valid for b in rows):
        raise ValueError('Input contains a non-trading day')
    future = calendar.sessions_in_range(last + pd.Timedelta(days=1), last + pd.Timedelta(days=60))[:req.forecast_days]
    if len(future) != req.forecast_days:
        raise ValueError('Calendar range unavailable')
    frame = pd.DataFrame(rows)[['open', 'high', 'low', 'close', 'volume']]
    # FinMind volume is shares. Actual amount is unavailable: let upstream use its documented proxy.
    return rows, frame, pd.Series(pd.to_datetime([b['date'] for b in rows])), pd.Series(future.tz_localize(None))


def analyze(req, progress):
    import torch
    rows, frame, past, future = prepare(req)
    progress('載入 Kronos-small CPU 模型', 10)
    sys.path.insert(0, os.environ.get('KRONOS_ROOT', '/opt/kronos'))
    from model import Kronos, KronosTokenizer, KronosPredictor
    root = Path(os.environ.get('KRONOS_MODELS', '/opt/kronos-models'))
    pins = json.loads((root / 'revisions.json').read_text())
    torch.set_num_threads(2)
    torch.manual_seed(2026)
    tokenizer = KronosTokenizer.from_pretrained(str(root / 'tokenizer')).eval()
    model = Kronos.from_pretrained(str(root / 'model')).eval()
    predictor = KronosPredictor(model, tokenizer, device='cpu', max_context=512)
    progress('推估未來交易日走勢（3 條取樣路徑平均）', 35)
    with torch.inference_mode():
        predicted = predictor.predict(frame, past, future, pred_len=len(future),
                                      T=1.0, top_p=0.9, sample_count=3, verbose=False)
    closes = [float(v) for v in predicted['close']]
    if any(not math.isfinite(v) or v <= 0 for v in closes):
        raise ValueError('Invalid model output')
    baseline = rows[-1]['close']
    forecast = [dict(date=day.strftime('%Y-%m-%d'), close=round(close, 4),
                     change=close / baseline - 1) for day, close in zip(future, closes)]
    progress('整理預測、資料截止日與模型版本', 95)
    now = datetime.now(ZoneInfo('Asia/Taipei'))
    missing = [
        '這是模型取樣推估，並非實際報價、目標價或已校準的機率；未驗證台股樣本外準確率。',
        '只使用已收盤日 K 的 OHLCV，沒有新聞、財報、籌碼或未來事件。',
        '成交金額未提供，由原模型以成交量乘 OHLC 均價估算；成交量沿用來源股數。',
        '未做除權息、拆併股的額外校正，來源若未還原價格可能造成偏差。',
        '交易日期依 XTAI 行事曆，臨時休市可能尚未反映；以行情截止日為預測起點。',
        '不改動 A/B 訊號、進出場條件或推播。']
    return dict(symbol=req.stock.id, name=req.stock.name, engine='Kronos-small CPU',
        analysis_date=str(now.date()), quote_date=rows[-1]['date'],
        quick_model='NeoQuasar/Kronos-small', deep_model='3 條取樣路徑平均（非信賴區間）',
        summary=f'以 {len(rows)} 根已收盤日 K 推估後續 {len(forecast)} 個交易日。最後已知收盤 {baseline:g} 元；第 {len(forecast)} 日模型收盤推估 {closes[-1]:.2f} 元，相對變化 {(closes[-1]/baseline-1)*100:+.2f}%。',
        forecast=forecast, baseline=baseline, sections=[dict(title='推估方法與重現資訊',
            text=f'Kronos-small 24.7M；CPU；最近最多 256 根日 K；取樣 3 次平均；seed=2026；T=1；top_p=0.9。\n程式版本：{REVISION}\n模型權重版本：{pins["model"]}\nTokenizer 版本：{pins["tokenizer"]}')],
        sources=[dict(id='S1', title=req.source, date=rows[-1]['date'], scope=f'{req.stock.id} 日 K；擷取時間 {req.fetched_at or "未提供"}'),
                 dict(id='S2', title='Kronos 官方原始碼與模型', date=str(now.date()),
                      scope='模型方法與版本', url='https://github.com/shiyu-coder/Kronos')],
        missing=missing, upstream_revision=REVISION, model_revisions=pins)
