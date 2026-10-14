import asyncio
import json
import math
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from research_service import app as server
from research_service.models import BacktestRequest, AnalyzeRequest
from research_service import backtest as bt
from research_service.agents import analyze


def bars(n=100):
    return [dict(date=(datetime(2025,1,1)+timedelta(days=i)).date().isoformat(),open=100,high=101,low=99,close=100,volume=100000) for i in range(n)]


def test_backtrader_next_bar_costs_and_open_position(monkeypatch):
    data=bars()
    # Entry day 40 -> no fill on zero-volume day 41 -> fill 42; exit signal 44 -> fill 45.
    data[41]['volume']=0
    def controlled(rows,*args):
        return [dict(long=i in (40,98),short=False,exitLong='FAIL OUT' if i==44 else None,exitShort=None) for i in range(len(rows))]
    monkeypatch.setattr(bt,'signals',controlled)
    req=BacktestRequest(stock={'id':'2330','bars':data},strategy='A',options={'slippage':0},lot_size=1000)
    result=bt.run_backtest(req)['results'][0]
    assert result['count']==1
    trade=result['trades'][0]
    assert trade['signal_date']==data[40]['date']
    assert trade['entry_date']==data[42]['date']
    assert trade['exit_date']==data[45]['date']
    expected=trade['size']*100*(.001425*2+.003)
    assert trade['pnl']==pytest.approx(-expected)
    assert result['open_position']['entry_date']==data[99]['date']
    assert result['total_return']<0 and result['max_drawdown']>0


def test_prefix_signals_have_no_future_dependency():
    data=bars(180)
    for i,b in enumerate(data):
        price=100+8*math.sin(i/4)
        b.update(open=price,close=price,high=price+1,low=price-1)
    full=bt.signals(data,'A',{},[])
    assert bt.signals(data[:100],'A',{},[])==full[:100]
    result=bt.run_backtest(BacktestRequest(stock={'id':'2330','bars':data},strategy='both'))
    assert result['engine'].startswith('Backtrader')
    assert len(result['results'])==2
    assert result['results'][0]['count']>0


def test_closed_h1_drops_unfinished_and_rejects_missing_timezone():
    b=bars(1)[0]
    data=[{**b,'date':'2026-10-14T13:00:00+08:00'}]
    assert bt.closed_bars(data,'H1',datetime.fromisoformat('2026-10-14T13:31:00+08:00'))==[]
    assert len(bt.closed_bars(data,'H1',datetime.fromisoformat('2026-10-14T13:32:00+08:00')))==1
    with pytest.raises(ValueError): bt.closed_bars([{**b,'date':'2026-10-14T13:00:00'}],'H1')


def test_auth_cache_secrets_ownership_and_active_dedupe(tmp_path,monkeypatch):
    monkeypatch.setattr(server,'DB_PATH',tmp_path/'research.sqlite3')
    monkeypatch.setattr(server,'verify_identity',lambda token:token if token in ('alice','bob') else (_ for _ in ()).throw(ValueError()))
    async def noop(*args): pass
    monkeypatch.setattr(server,'execute',noop)
    payload={'stock':{'id':'2330','bars':bars()},'provider':'openai','quick_model':'test','deep_model':'test','api_key':'SECRET_TEST_KEY'}
    with TestClient(server.app) as client:
        assert client.post('/v1/analyses',json=payload).status_code==401
        a={'Authorization':'Bearer alice'};b={'Authorization':'Bearer bob'}
        first=client.post('/v1/analyses',json=payload,headers=a)
        assert first.status_code==200,first.text
        job=first.json()['id']
        assert client.post('/v1/analyses',json={**payload,'force':True},headers=a).json()['id']==job
        assert client.get('/v1/analyses/'+job,headers=b).status_code==404
        assert client.get('/v1/analyses?symbol=2330',headers=b).json()['items']==[]
        with server.db() as c:
            assert 'SECRET_TEST_KEY' not in str([dict(row) for row in c.execute('SELECT * FROM jobs')])
        server.update_job(job,status='completed',report=json.dumps({'summary':'report'}))
        cached=client.post('/v1/analyses',json={**payload,'api_key':''},headers=a)
        assert cached.status_code==200 and cached.json()['cached']
        changed={**payload,'stock':{**payload['stock'],'bars':bars()+[{**bars()[-1],'date':'2025-04-11'}]}}
        assert client.post('/v1/analyses',json=changed,headers=a).json()['id']!=job
        malformed=client.post('/v1/analyses',json={**payload,'api_key':{'key':'SECRET_TEST_KEY'}},headers=a)
        assert malformed.status_code==422 and 'SECRET_TEST_KEY' not in malformed.text


def test_real_tradingagents_roles_with_fake_llm_no_network():
    class Fake:
        def with_structured_output(self,*args,**kwargs): raise NotImplementedError()
        def invoke(self,*args,**kwargs): return AIMessage(content='已知事實：[S1] 行情截至 2025-04-10。資料推論：尚待確認。市場預期：未驗證。')
    req=AnalyzeRequest(stock={'id':'2330','name':'台積電','bars':bars()},quick_model='test',deep_model='test',api_key='fake')
    evidence=dict(analysis_date='2026-10-14',quote_date='2025-04-10',retrieved_at='2026-10-14T12:00:00+08:00',sources=[{'id':'S1'}],missing=['沒有新聞'])
    stages=[]
    report=analyze(req,lambda title,percent:stages.append(title),models=(Fake(),Fake()),evidence=evidence)
    assert len(stages)==13
    assert report['upstream_version']=='0.6.0'
    assert '多頭論點' in [s['title'] for s in report['sections']]
    assert '空頭論點' in [s['title'] for s in report['sections']]
    assert report['missing']==['沒有新聞']
    assert '[S1]' in report['summary']
