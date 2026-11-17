from datetime import datetime
from zoneinfo import ZoneInfo
import json
import pytest
import pandas as pd
from research_service.taiwan_calendar import sessions
from fastapi.testclient import TestClient
from research_service import app as server
from research_service.models import AnalyzeRequest
from research_service.kronos import prepare


def payload():
    days = sessions('2026-01-01', '2026-11-13')[-100:]
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
    with pytest.raises(ValueError, match='非交易日期'): prepare(req, datetime(2026,11,17,tzinfo=ZoneInfo('Asia/Taipei')))


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


def test_twse_new_year_open_day_and_settlement_closures():
    days=set(sessions('2026-01-01','2026-12-31').strftime('%Y-%m-%d'))
    assert '2026-01-02' in days
    assert '2026-02-11' in days and '2026-02-23' in days
    assert not {'2026-01-01','2026-02-12','2026-02-13','2026-09-28','2026-12-25'} & days
    p=payload()
    from datetime import timedelta
    dates=sessions('2025-12-01','2026-11-17')[-256:]
    p['stock']['bars']=[dict(date=d.strftime('%Y-%m-%d'),open=100,high=102,low=99,close=101,volume=10000) for d in dates]
    rows,frame,past,future=prepare(AnalyzeRequest(**p),datetime(2026,11,17,23,tzinfo=ZoneInfo('Asia/Taipei')))
    assert any(b['date']=='2026-01-02' for b in rows)
    assert future.iloc[0]==pd.Timestamp('2026-11-18')


def test_forecast_crosses_year_without_inventing_new_year_session():
    days=sessions('2026-12-24','2027-01-06').strftime('%Y-%m-%d').tolist()
    assert days==['2026-12-24','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-04','2027-01-05','2027-01-06']


def test_runner_kronos_error_is_specific_and_never_leaks_exception(monkeypatch, capsys):
    import io
    import sys
    from research_service import runner, kronos
    for failure, expected in [(kronos.KronosInputError('行情含非交易日期：2026-11-14。'), '非交易日期'),
                              (ValueError('SECRET_TEST_KEY provider body'), '不需要 API Key')]:
        def broken(*args): raise failure
        monkeypatch.setattr(kronos, 'analyze', broken)
        monkeypatch.setattr(sys, 'stdin', io.StringIO(json.dumps(payload())))
        with pytest.raises(SystemExit): runner.main()
        output=capsys.readouterr().out
        assert expected in output and 'SECRET_TEST_KEY' not in output
        assert '金鑰權限' not in output
