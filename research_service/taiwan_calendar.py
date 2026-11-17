"""TWSE published sessions override inaccurate XTAI precomputed years.

Sources (checked 2026-11-17):
https://www.twse.com.tw/zh/trading/holiday.html (115/2026)
https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=html (116/2027)
Settlement-only weekdays are closed; first/last trading days are NOT holidays.
Unexpected emergency closures still require a calendar update.
"""
REVISION = 'twse-2026-2027-20261117'
CLOSED = {
    2026: '01-01 02-12 02-13 02-16 02-17 02-18 02-19 02-20 02-27 04-03 04-06 05-01 06-19 09-25 09-28 10-09 10-26 12-25',
    2027: '01-01 02-02 02-03 02-04 02-05 02-08 02-09 02-10 03-01 04-05 04-06 04-30 06-09 09-15 09-28 10-11 10-25 12-24 12-31',
}


def sessions(start, end):
    import pandas as pd
    import exchange_calendars as xcals
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    parts = []
    for year in range(start.year, end.year + 1):
        first, last = max(start, pd.Timestamp(year, 1, 1)), min(end, pd.Timestamp(year, 12, 31))
        if year in CLOSED:
            closed = {f'{year}-{day}' for day in CLOSED[year].split()}
            part = pd.bdate_range(first, last)
            part = part[~part.strftime('%Y-%m-%d').isin(closed)]
        else:
            # Retain older historical calendars, but do not guess unpublished future years.
            if year > max(CLOSED):
                raise ValueError('Taiwan calendar year unavailable')
            part = xcals.get_calendar('XTAI', start=first, end=last).sessions.tz_localize(None)
        parts.append(part)
    result = pd.DatetimeIndex([])
    for part in parts:
        result = result.union(part)
    return result.sort_values()
