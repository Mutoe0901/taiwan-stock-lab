"""Real upstream prompt/parser with a fake model response; no paid API calls."""
import json
import os
from datetime import date, timedelta
from pathlib import Path
import pytest
from research_service.models import AnalyzeRequest
from research_service.daily import analyze, build_context


def request():
    return AnalyzeRequest(engine='daily_stock_analysis', stock={'id': '2330', 'name': '台積電',
        'bars': [dict(date=str(date(2025, 1, 1) + timedelta(days=i)),
                      open=100+i, close=100+i, high=101+i, low=99+i, volume=1000) for i in range(65)]},
        quick_model='test', deep_model='test', api_key='SECRET_TEST_ONLY')


def evidence():
    return dict(analysis_date='2026-11-17', quote_date='2025-03-06', sources=[{'id': 'S1'}],
                missing=['未取得公告全文'], local_summary='行情證據 [S1]', news=[])


def test_context_uses_taiwan_market_exact_loaded_bars_not_mainland_code_lookup():
    context = build_context(request(), evidence())
    assert context['code'] == '2330.TW'
    assert context['today']['close'] == 164
    assert context['today']['ma5'] == 162
    assert context['date'] != context['today']['date']


@pytest.mark.skipif(not Path(os.environ.get('DSA_ROOT', '/opt/daily-stock-analysis'), 'src/analyzer.py').is_file(), reason='needs pinned upstream checkout')
def test_real_upstream_prompt_parser_traditional_output_and_secret_cleanup():
    calls = []
    def transport(prompt, config, **kwargs):
        calls.append((prompt, kwargs['system_prompt']))
        return json.dumps({'sentiment_score': 60, 'trend_prediction': '震荡',
                           'operation_advice': '观望', 'confidence_level': '低',
                           'analysis_summary': '已知事实：[S1]，资料缺口需确认。',
                           'risk_warning': '缺少公告全文，不能推测。',
                           'technical_analysis': '均线数据来自已载入行情。'}, ensure_ascii=False), 'openai/test', {'prompt_tokens': 100, 'completion_tokens': 50, 'total_tokens': 150}
    req = request()
    cwd = Path.cwd()
    report = analyze(req, lambda *args: None, evidence=evidence(), transport=transport)
    assert len(calls) == 1
    assert '2330.TW' in calls[0][0] and '164' in calls[0][0]
    assert '繁體中文' in calls[0][1]
    assert report['engine'] == 'daily_stock_analysis' and report['symbol'] == '2330'
    assert '事實' in report['summary'] and '資料' in report['summary']
    assert report['sources'] == [{'id': 'S1'}]
    assert 'SECRET_TEST_ONLY' not in json.dumps(report)
    assert req.api_key == '' and 'OPENAI_API_KEY' not in os.environ
    assert Path.cwd() == cwd
