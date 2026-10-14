"""Actual Backtrader broker execution; A/B signals are shared with the JS app."""
import json
import math
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
import backtrader as bt
from .models import BacktestRequest

ROOT = Path(__file__).resolve().parent
TW = timezone(timedelta(hours=8))


def closed_bars(bars, timeframe, now=None):
    now = now or datetime.now(TW)
    out = []
    for b in bars:
        when = datetime.fromisoformat(b['date'].replace('Z', '+00:00'))
        if timeframe == 'H1':
            if when.tzinfo is None:
                raise ValueError('H1 K 線需要明確時區')
            local = when.astimezone(TW)
            if local.minute != 0 or local.second != 0 or not 9 <= local.hour <= 13:
                raise ValueError('H1 僅接受台股 09:00–13:00 開始的 K 線')
            end = min(local + timedelta(hours=1), local.replace(hour=13, minute=30))
        else:
            end = when.replace(tzinfo=TW, hour=13, minute=30)
        if end + timedelta(seconds=90) <= now:
            out.append(b)
    return out


def signals(bars, strategy, options, daily_bars):
    r = subprocess.run(['node', str(ROOT / 'signals.cjs')],
                       input=json.dumps(dict(bars=bars, strategy=strategy, options=options, dailyBars=daily_bars)),
                       text=True, capture_output=True, timeout=25, check=True)
    return json.loads(r.stdout)


class BarFeed(bt.feed.DataBase):
    params = (('rows', None),)

    def start(self):
        super().start()
        self.rows_iter = iter(self.p.rows)

    def _load(self):
        try: b = next(self.rows_iter)
        except StopIteration: return False
        dt = datetime.fromisoformat(b['date'].replace('Z', '+00:00'))
        if dt.tzinfo: dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        self.lines.datetime[0] = bt.date2num(dt)
        for name in ('open', 'high', 'low', 'close', 'volume'):
            getattr(self.lines, name)[0] = b[name]
        self.lines.openinterest[0] = 0
        return True


class TaiwanCommission(bt.CommInfoBase):
    params = (('stocklike', True), ('commtype', bt.CommInfoBase.COMM_PERC),
              ('percabs', True), ('tax', 0.003))

    def _getcommission(self, size, price, pseudoexec):
        return abs(size) * price * (self.p.commission + (self.p.tax if size < 0 else 0))


class Strategy(bt.Strategy):
    params = (('signals', None), ('rows', None), ('request', None))

    def __init__(self):
        self.pending = None
        self.entries = None
        self.trades = []
        self.curve = []
        self.orders_rejected = 0
        self.exit_bar = -1
        self.reason = ''

    def notify_order(self, order):
        if order.status in (order.Submitted, order.Accepted): return
        if order.status == order.Completed:
            i = len(self.data) - 1
            if order.info.get('kind') == 'entry':
                self.entries = dict(side='LONG' if order.isbuy() else 'SHORT',
                                    entry_date=self.p.rows[i]['date'], signal_date=order.info.signal_date,
                                    entry_price=order.executed.price, size=abs(order.executed.size),
                                    entry_commission=order.executed.comm)
            else:
                self.exit_bar = i
                e = self.entries
                if e:
                    direction = 1 if e['side'] == 'LONG' else -1
                    gross = direction * e['size'] * (order.executed.price - e['entry_price'])
                    net = gross - e['entry_commission'] - order.executed.comm
                    self.trades.append({**e, 'exit_date': self.p.rows[i]['date'],
                                        'exit_price': order.executed.price, 'reason': order.info.reason,
                                        'pnl': net, 'return': net / (e['size'] * e['entry_price']),
                                        'commission': e['entry_commission'] + order.executed.comm})
                self.entries = None
        elif order.status in (order.Margin, order.Rejected): self.orders_rejected += 1
        self.pending = None

    def next(self):
        i = len(self.data) - 1
        r = self.p.request
        day = self.p.rows[i]['date'][:10]
        if r.start and day < r.start: return
        self.curve.append({'date': self.p.rows[i]['date'], 'equity': self.broker.getvalue()})
        if self.pending or i < 40 or i == len(self.p.rows) - 1: return
        s = self.p.signals[i]
        if self.position:
            reason = s['exitLong'] if self.position.size > 0 else s['exitShort']
            if reason:
                self.pending = self.close()
                self.pending.addinfo(kind='exit', reason=reason)
        elif self.exit_bar != i:
            direction = 1 if s['long'] else -1 if r.options.allowShort and s['short'] else 0
            if direction:
                # Fixed 95% allocation leaves room for costs/gaps. Large gaps can still reject.
                capital = self.broker.getvalue() * .95
                unit = self.data.close[0] * (1 + r.options.slippage) * (1 + r.options.fee + r.options.tax)
                size = math.floor(capital / unit / r.lot_size) * r.lot_size
                if size:
                    self.pending = self.buy(size=size) if direction == 1 else self.sell(size=size)
                    self.pending.addinfo(kind='entry', signal_date=self.p.rows[i]['date'])


def run_backtest(req: BacktestRequest):
    rows = closed_bars([b.model_dump(exclude_none=True) for b in req.stock.bars], req.timeframe)
    if req.end: rows = [b for b in rows if b['date'][:10] <= req.end]
    if len(rows) < 65: raise ValueError('至少需要 65 根已收盤 K 線，含策略暖機資料')
    if req.start and not any(b['date'][:10] >= req.start for b in rows):
        raise ValueError('指定期間沒有已收盤 K 線')
    modes = ['A', 'B'] if req.strategy == 'both' else [req.strategy]
    results = []
    for mode in modes:
        sig = signals(rows, mode, req.options.model_dump(), [b.model_dump(exclude_none=True) for b in req.daily_bars])
        engine = bt.Cerebro(stdstats=False)
        engine.adddata(BarFeed(rows=rows))
        engine.addstrategy(Strategy, signals=sig, rows=rows, request=req)
        engine.broker.setcash(req.initial_cash)
        engine.broker.addcommissioninfo(TaiwanCommission(commission=req.options.fee, tax=req.options.tax))
        engine.broker.set_slippage_perc(req.options.slippage, slip_open=True, slip_match=True)
        engine.broker.set_filler(lambda order, price, ago: abs(order.executed.remsize) if order.data.volume[ago] > 0 else 0)
        s = engine.run()[0]
        trades = s.trades
        high, dd = req.initial_cash, 0
        for p in s.curve:
            high = max(high, p['equity']); dd = max(dd, 1 - p['equity'] / high)
        gain = sum(max(t['pnl'], 0) for t in trades)
        loss = -sum(min(t['pnl'], 0) for t in trades)
        start_i = next((i for i,b in enumerate(rows) if not req.start or b['date'][:10] >= req.start), 0)
        results.append(dict(strategy=mode, count=len(trades),
            win_rate=sum(t['pnl'] > 0 for t in trades) / len(trades) if trades else None,
            total_return=engine.broker.getvalue() / req.initial_cash - 1, max_drawdown=dd,
            profit_factor=gain / loss if loss else None,
            benchmark_return=rows[-1]['close'] / rows[start_i]['open'] - 1,
            final_equity=engine.broker.getvalue(), realized_pnl=sum(t['pnl'] for t in trades),
            open_position=s.entries, rejected_orders=s.orders_rejected,
            trades=trades, curve=s.curve))
    return dict(engine='Backtrader 1.9.78.123', symbol=req.stock.id, timeframe=req.timeframe,
                demo=req.demo, initial_cash=req.initial_cash, bars=len(rows), first=rows[0]['date'], last=rows[-1]['date'],
                assumptions=['沿用原 A/B 訊號；訊號收盤後下一根可交易 K 線開盤成交。',
                    '每次配置約 95% 權益；整股或整張依設定；大幅跳空可能造成資金不足拒單。',
                    '手續費雙邊、證交稅賣出時計算；未套用當沖優惠、最低手續費或融券費。',
                    '零成交量不成交；未重建委託簿，漲跌停、停牌與流動性不能完整模擬。',
                    '使用原始價格，未處理除權息；未平倉按收盤市值估算，未扣未來平倉成本。',
                    '買進持有基準為期間首根開盤至末根收盤的價格報酬，未扣成本。'], results=results)
