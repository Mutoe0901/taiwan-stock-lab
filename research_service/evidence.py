"""Bounded Taiwan evidence retrieval. Headlines are explicitly not full articles."""
import json
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
import xml.etree.ElementTree as ET
import httpx

TW = ZoneInfo('Asia/Taipei')
FINMIND = 'https://api.finmindtrade.com/api/v4/data'


def collect(req):
    today = datetime.now(TW).date()
    retrieved = datetime.now(TW).isoformat()
    evidence = {'analysis_date': str(today), 'retrieved_at': retrieved,
                'symbol': req.stock.id, 'name': req.stock.name,
                'quote_date': req.stock.bars[-1].date,
                'local_summary': req.context,
                'recent_bars': [b.model_dump(exclude_none=True) for b in req.stock.bars[-90:]],
                'fundamentals': {}, 'news': [], 'sources': [], 'missing': []}
    evidence['sources'].append({'id': 'S1', 'title': req.source,
                               'url': 'https://finmindtrade.com/' if 'FinMind' in req.source else '',
                               'date': req.stock.bars[-1].date, 'retrieved_at': req.fetched_at,
                               'scope': '使用者已載入行情及摘要，未聲稱伺服器已重新核實'})
    with httpx.Client(timeout=25, follow_redirects=False) as client:
        if req.finmind_token:
            for dataset, title in [('TaiwanStockMonthRevenue', '月營收'), ('TaiwanStockFinancialStatements', '財報')]:
                try:
                    params = dict(dataset=dataset, data_id=req.stock.id,
                                  start_date=str(today - timedelta(days=750)), end_date=str(today))
                    response = client.get(FINMIND, params=params, headers={'Authorization': 'Bearer ' + req.finmind_token})
                    response.raise_for_status()
                    body = response.json()
                    if body.get('status') != 200 or not isinstance(body.get('data'), list):
                        raise ValueError('資料不可用')
                    data = [r for r in body['data'] if str(r.get('stock_id')) == req.stock.id and str(r.get('date', '')) <= str(today)]
                    data.sort(key=lambda row: str(row.get('date', '')))
                    evidence['fundamentals'][dataset] = data[-150:]
                    if data:
                        evidence['sources'].append({'id': 'S' + str(len(evidence['sources'])+1), 'title': 'FinMind ' + title,
                            'url': FINMIND + '?' + urlencode(params), 'date': str(data[-1].get('date', '')),
                            'retrieved_at': retrieved, 'scope': '目前研究用；財報期末不等於公告日，不用於歷史回測'})
                    else: evidence['missing'].append(title + '查無資料')
                except Exception:
                    evidence['missing'].append(title + '未取得（請檢查 FinMind 權限／額度／連線）')
        else:
            evidence['missing'].append('未提供本次 FinMind Token，沒有重新取得月營收及財報；僅能使用本機摘要')
        try:
            query = f'"{req.stock.id}" "{req.stock.name}" 股票 when:14d'
            url = 'https://news.google.com/rss/search?' + urlencode({'q': query, 'hl': 'zh-TW', 'gl': 'TW', 'ceid': 'TW:zh-Hant'})
            response = client.get(url)
            response.raise_for_status()
            if len(response.content) > 2000000: raise ValueError('新聞資料過大')
            root = ET.fromstring(response.content)
            for item in root.findall('./channel/item'):
                try: published = parsedate_to_datetime(item.findtext('pubDate', '')).astimezone(TW)
                except (ValueError, TypeError): continue
                if published.date() > today or published.date() < today - timedelta(days=14): continue
                link = item.findtext('link', '')
                if not link.startswith('https://news.google.com/'): continue
                ident = 'S' + str(len(evidence['sources'])+1)
                title = item.findtext('title', '')[:500]
                evidence['news'].append({'source_id': ident, 'title': title, 'published_at': published.isoformat(),
                                         'publisher': item.findtext('source', ''), 'url': link})
                evidence['sources'].append({'id': ident, 'title': title, 'url': link, 'date': published.isoformat(),
                                            'retrieved_at': retrieved, 'scope': 'Google News RSS 標題，未閱讀全文'})
                if len(evidence['news']) >= 10: break
            if not evidence['news']: evidence['missing'].append('近 14 日新聞查無可用標題')
        except Exception:
            evidence['missing'].append('新聞來源連線失敗，本次沒有可驗證的新新聞')
    evidence['missing'].extend(['未串接公開資訊觀測站公告全文', '未取得 PTT／Dcard／Threads 原始貼文，不推測社群情緒'])
    return evidence
