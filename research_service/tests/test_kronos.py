from datetime import datetime
from zoneinfo import ZoneInfo
import json
import pytest
import pandas as pd
import exchange_calendars as xcals
from fastapi.testclient import TestClient
from research_service import app as server
from research_service.models import AnalyzeRequest
from research_service.kronos import prepare


def payload():
    days = xcals.get_calendar('XTAI').sessions_in_range('2026-01-01', '2026-11-13')[-100:]
    rows = [dict(date=d.strftime('%Y-%m-%d'), open=100+i/10, high=102+i/10,
                 low=99+i/10, close=101+i/10, volume=10000) for i, d in enumerate(days)]
    return dict(engine='kronos', stock=dict(id='2330', bars=rows), quick_model='Kronos-small', deep_model='Kronos-small')


def test_closed_daily_calendar_and_horizon():
    p = payload()
    p['stock']['bars'].append({**p['stock']['bars'][-1], 'date':'2026-11-16'})
    req = AnalyzeRequest(**p, forecast_days=10)
    rows, frame, past, future = prepare(req, datetime(2026,11,16,10,tzinfo=ZoneInfo('Asia/Taipei')))
    assert rows[-1]['date']=='2026-11-13'
    assert len(future)==10 and future.iloc[0]==pd.Timestamp('2026-11-16')
    assert all(day.weekday()<5 for day in future)
    req.stock.bars[-1].date='2026-11-14'
    with pytest.raises(ValueError, match='non-trading'): prepare(req, datetime(2026,11,17,tzinfo=ZoneInfo('Asia/Taipei')))


def test_kronos_no_key_private_history_cache_and_concurrency(tmp_path, monkeypatch):
    monkeypatch.setattr(server, 'DB_PATH', tmp_path/'jobs.sqlite')
    monkeypatch.setattr(server, 'verify_identity', lambda token:token)
    monkeypatch.setattr(server, 'status', lambda:dict(kronos=True))
    async def noop(*args): pass
    monkeypatch.setattr(server, 'execute', noop)
    p=payload(); a={'Authorization':'Bearer alice'}; b={'Authorization':'Bearer bob'}
    with TestClient(server.app) as client:
        assert client.post('/v1/analyses',json=p).status_code==401
        first=client.post('/v1/analyses',json=p,headers=a)
        assert first.status_code==200,first.text
        job=first.json()['id']
        assert client.post('/v1/analyses',json=p,headers=b).status_code==429
        assert client.get('/v1/analyses/'+job,headers=b).status_code==404
        server.update_job(job,status='completed',report=json.dumps({'forecast':[]}))
        assert client.post('/v1/analyses',json=p,headers=a).json()['cached']
        assert client.get('/v1/analyses?symbol=2330&engine=kronos',headers=a).json()['items'][0]['id']==job
        assert client.get('/v1/analyses?symbol=2330&engine=kronos',headers=b).json()['items']==[]
        assert client.get('/v1/analyses?symbol=2330',headers=a).json()['items']==[]
        changed={**p,'forecast_days':10}
        assert client.post('/v1/analyses',json=changed,headers=a).json()['id']!=job
        monkeypatch.setattr(server,'status',lambda:dict(kronos=False))
        assert client.post('/v1/analyses',json=p,headers=a).status_code==503
