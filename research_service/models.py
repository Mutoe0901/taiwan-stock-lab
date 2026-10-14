from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Bar(StrictModel):
    date: str = Field(max_length=40)
    open: float = Field(gt=0)
    high: float = Field(gt=0)
    low: float = Field(gt=0)
    close: float = Field(gt=0)
    volume: float = Field(ge=0)
    foreign: float | None = None
    trust: float | None = None

    @model_validator(mode='after')
    def valid_bar(self):
        datetime.fromisoformat(self.date.replace('Z', '+00:00'))
        if self.low > min(self.open, self.close) or self.high < max(self.open, self.close) or self.low > self.high:
            raise ValueError('OHLC 價格不一致')
        return self


class Stock(StrictModel):
    id: str = Field(pattern=r'^[0-9A-Za-z]{4,8}$')
    name: str = Field(default='', max_length=100)
    sector: str = Field(default='', max_length=100)
    bars: list[Bar] = Field(min_length=65, max_length=6000)

    @model_validator(mode='after')
    def ordered(self):
        dates = [datetime.fromisoformat(b.date.replace('Z', '+00:00')) for b in self.bars]
        try:
            if any(a >= b for a, b in zip(dates, dates[1:])):
                raise ValueError('K 線必須依時間排序且不得重複')
        except TypeError:
            raise ValueError('K 線時區格式必須一致')
        return self


class Costs(StrictModel):
    fee: float = Field(default=0.001425, ge=0, le=0.1)
    tax: float = Field(default=0.003, ge=0, le=0.1)
    slippage: float = Field(default=0.001, ge=0, le=0.1)
    volumeRatio: float = Field(default=1.2, ge=0.1, le=10)
    requireInstitution: bool = False
    allowShort: bool = False


class BacktestRequest(StrictModel):
    stock: Stock
    timeframe: Literal['D1', 'H1'] = 'D1'
    strategy: Literal['A', 'B', 'both'] = 'both'
    options: Costs = Field(default_factory=Costs)
    daily_bars: list[Bar] = Field(default_factory=list, max_length=6000)
    initial_cash: float = Field(default=1000000, ge=10000, le=1e10)
    lot_size: Literal[1, 1000] = 1000
    start: str | None = None
    end: str | None = None
    demo: bool = False

    @model_validator(mode='after')
    def period(self):
        for value in (self.start, self.end):
            if value: datetime.strptime(value, '%Y-%m-%d')
        if self.start and self.end and self.start > self.end:
            raise ValueError('回測開始日不得晚於結束日')
        return self


class AnalyzeRequest(StrictModel):
    stock: Stock
    # A bounded local summary, never a portfolio/credential dump.
    context: str = Field(default='', max_length=24000)
    source: str = Field(default='FinMind / 使用者載入', max_length=200)
    fetched_at: str = Field(default='', max_length=100)
    provider: Literal['openai', 'google', 'anthropic', 'openrouter'] = 'openai'
    quick_model: str = Field(min_length=1, max_length=100, pattern=r'^[\w./:-]+$')
    deep_model: str = Field(min_length=1, max_length=100, pattern=r'^[\w./:-]+$')
    api_key: str = Field(default='', max_length=4096, repr=False)
    finmind_token: str = Field(default='', max_length=8192, repr=False)
    force: bool = False
