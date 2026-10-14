import asyncio
import hashlib
import json
import os
import sqlite3
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.id_token import verify_firebase_token
from .models import AnalyzeRequest, BacktestRequest
from .backtest import run_backtest

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get('RESEARCH_DB', str(ROOT / 'research-data' / 'research.sqlite3')))
PROJECT = os.environ.get('FIREBASE_PROJECT_ID', 'taiwan-stock-lab-b6294')
TASKS = set()
BACKTEST_LOCK = asyncio.Semaphore(2)


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    return c


def initialize():
    with db() as c:
        c.execute('''CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, uid TEXT NOT NULL, digest TEXT NOT NULL, symbol TEXT NOT NULL,
            status TEXT NOT NULL, stage TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
            created REAL NOT NULL, updated REAL NOT NULL, report TEXT, error TEXT)''')
        c.execute('CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(uid, created)')
        c.execute('CREATE TABLE IF NOT EXISTS limits(uid TEXT, operation TEXT, next_at REAL, PRIMARY KEY(uid,operation))')
        c.execute("UPDATE jobs SET status='failed',error='服務重新啟動，請手動重新分析。',stage='分析中斷' WHERE status IN ('queued','running')")


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield
    for task in list(TASKS): task.cancel()
    if TASKS: await asyncio.gather(*list(TASKS), return_exceptions=True)


app = FastAPI(title='Taiwan Stock Lab Research', lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware('http')
async def body_limit(req, call_next):
    # Bound body bytes even when Content-Length is absent/chunked. No API responses are cached.
    if req.method in ('POST', 'PUT'):
        chunks, total = [], 0
        async for chunk in req.stream():
            total += len(chunk)
            if total > 2500000: return JSONResponse({'detail': '資料超過 2.5 MB 上限'}, status_code=413)
            chunks.append(chunk)
        req._body = b''.join(chunks)
    response = await call_next(req)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.exception_handler(RequestValidationError)
async def invalid_input(request, exc):
    # Pydantic's default error includes offending values, potentially credentials.
    return JSONResponse({'detail': '輸入資料格式錯誤，請確認股票、K 線、模型與回測參數。'}, status_code=422)


def verify_identity(token):
    claims = verify_firebase_token(token, GoogleRequest(), audience=PROJECT)
    if claims.get('iss') != 'https://securetoken.google.com/' + PROJECT or not claims.get('email_verified'):
        raise ValueError('未驗證')
    uid = claims.get('sub')
    if not isinstance(uid, str) or not 1 <= len(uid) <= 128: raise ValueError('使用者錯誤')
    allowed = [s.strip() for s in os.environ.get('RESEARCH_ALLOWED_UIDS', '').split(',') if s.strip()]
    if allowed and uid not in allowed: raise ValueError('尚未授權')
    return uid


async def identity(request: Request):
    value = request.headers.get('Authorization', '')
    if not value.startswith('Bearer ') or len(value) > 9000:
        raise HTTPException(401, '請先登入並驗證 Firebase 帳號')
    try: return await asyncio.to_thread(verify_identity, value[7:])
    except Exception: raise HTTPException(401, '登入已過期或帳號尚未授權，請重新登入')


def claim_limit(uid, operation, seconds):
    now = time.time()
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        row = c.execute('SELECT next_at FROM limits WHERE uid=? AND operation=?', (uid, operation)).fetchone()
        if row and row['next_at'] > now: raise HTTPException(429, '請稍後再試，避免重複送出')
        c.execute('INSERT OR REPLACE INTO limits VALUES (?,?,?)', (uid, operation, now + seconds))


@app.get('/v1/status')
def status():
    return {'configured': True, 'version': '0.7.3', 'backtrader': True, 'tradingagents': True,
            'auth': 'firebase', 'model_key': 'per-request', 'max_minutes': 15}


@app.post('/v1/backtest')
async def backtest(req: BacktestRequest, uid=Depends(identity)):
    claim_limit(uid, 'backtest', 3)
    async with BACKTEST_LOCK:
        try: return await asyncio.to_thread(run_backtest, req)
        except (ValueError, TypeError): raise HTTPException(422, '回測資料不符合要求，請檢查已收盤 K 線、日期與參數')
        except Exception: raise HTTPException(500, 'Backtrader 回測失敗，請檢查服務版本與 Node.js 環境')


def expose(row):
    return {k: row[k] for k in ('id', 'symbol', 'status', 'stage', 'progress', 'created', 'updated', 'error')}


def update_job(job, **values):
    values['updated'] = time.time()
    with db() as c:
        c.execute('UPDATE jobs SET ' + ','.join(k + '=?' for k in values) + ' WHERE id=?', (*values.values(), job))


async def execute(job, req):
    process = None
    try:
        update_job(job, status='running', stage='準備分析', progress=1)
        # Env is intentionally small: no shared LLM key/tracing or other users' credentials.
        env = {k: v for k,v in os.environ.items() if k in ('PATH', 'HOME', 'LANG', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY')}
        env['PYTHONUNBUFFERED'] = '1'
        env['LANGCHAIN_TRACING_V2'] = 'false'
        env['LANGSMITH_TRACING'] = 'false'
        process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'research_service.runner', cwd=str(ROOT),
            env=env, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=2000000)
        async with asyncio.timeout(900):
            process.stdin.write(req.model_dump_json().encode())
            await process.stdin.drain()
            process.stdin.close()
            report = None
            async for line in process.stdout:
                try: event = json.loads(line)
                except (ValueError, UnicodeDecodeError): continue
                if event.get('type') == 'progress':
                    update_job(job, stage=str(event['stage'])[:150], progress=int(event['progress']))
                elif event.get('type') == 'result': report = event['report']
                elif event.get('type') == 'error':
                    update_job(job, status='failed', error=event['message'], stage='分析失敗')
            code = await process.wait()
            if code or not report:
                with db() as c: row = c.execute('SELECT status FROM jobs WHERE id=?', (job,)).fetchone()
                if row['status'] != 'failed': update_job(job, status='failed', stage='分析失敗', error='分析未完成，請檢查模型設定後手動重試。')
            else: update_job(job, status='completed', stage='分析完成', progress=100, report=json.dumps(report, ensure_ascii=False))
    except (TimeoutError, asyncio.CancelledError):
        update_job(job, status='failed', stage='分析中斷', error='分析逾時或服務中斷；未自動重試，避免重複費用。')
    except Exception:
        update_job(job, status='failed', stage='分析失敗', error='分析服務無法啟動，請聯絡服務管理者。')
    finally:
        if process and process.returncode is None:
            process.kill()
            await process.wait()
        req.api_key = ''
        req.finmind_token = ''


@app.post('/v1/analyses')
async def analyses(req: AnalyzeRequest, uid=Depends(identity)):
    if req.stock.id.startswith('DEMO'): raise HTTPException(422, 'AI 分析需使用真實個股資料')
    day = datetime.now(ZoneInfo('Asia/Taipei')).date()
    if req.stock.bars[-1].date[:10] > str(day): raise HTTPException(422, '行情日期在未來')
    payload = req.model_dump(exclude={'api_key', 'finmind_token', 'force'})
    payload['has_finmind'] = bool(req.finmind_token)
    payload['date'] = str(day)
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    now = time.time()
    midnight = datetime.now(ZoneInfo('Asia/Taipei')).replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute('DELETE FROM jobs WHERE created<? AND status NOT IN (\'queued\',\'running\')', (now-90*86400,))
        rows = c.execute('SELECT * FROM jobs WHERE uid=? AND digest=? ORDER BY created DESC', (uid, digest)).fetchall()
        for row in rows:
            if row['status'] in ('queued', 'running') or (not req.force and row['status'] == 'completed'):
                return {**expose(row), 'cached': row['status'] == 'completed'}
        if not req.api_key.strip(): raise HTTPException(422, '請輸入本次模型 API Key；只讀取既有報告不需要金鑰')
        active = c.execute("SELECT uid FROM jobs WHERE status IN ('queued','running')").fetchall()
        if any(row['uid'] == uid for row in active): raise HTTPException(409, '你的另一份分析正在執行，請完成後再試')
        if len(active) >= 2: raise HTTPException(429, '分析服務忙碌，請稍後再試')
        count = c.execute('SELECT count(*) FROM jobs WHERE uid=? AND created>=?', (uid, midnight)).fetchone()[0]
        if count >= 10: raise HTTPException(429, '每日最多 10 次新分析；仍可讀取既有報告')
        job = str(uuid.uuid4())
        c.execute('INSERT INTO jobs(id,uid,digest,symbol,status,stage,created,updated) VALUES (?,?,?,?,?,?,?,?)',
                  (job, uid, digest, req.stock.id, 'queued', '等待分析', now, now))
        row = c.execute('SELECT * FROM jobs WHERE id=?', (job,)).fetchone()
    task = asyncio.create_task(execute(job, req))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return {**expose(row), 'cached': False}


@app.get('/v1/analyses')
def history(symbol: str, uid=Depends(identity)):
    with db() as c:
        rows = c.execute('SELECT * FROM jobs WHERE uid=? AND symbol=? ORDER BY created DESC LIMIT 20', (uid, symbol)).fetchall()
    return {'items': [expose(r) for r in rows]}


@app.get('/v1/analyses/{job_id}')
def result(job_id: str, uid=Depends(identity)):
    with db() as c: row = c.execute('SELECT * FROM jobs WHERE id=? AND uid=?', (job_id, uid)).fetchone()
    if not row: raise HTTPException(404, '找不到這份分析')
    return {**expose(row), 'report': json.loads(row['report']) if row['report'] else None}
