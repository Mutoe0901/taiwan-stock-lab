(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };

  // dist/core.mjs
  function validate(b, { allowEmpty = false } = {}) {
    if (!b || b.schema_version !== 1 || !Array.isArray(b.stocks) || !b.stocks.length && !allowEmpty) throw Error("\u9700\u8981 schema_version=1 \u4E14 stocks \u4E0D\u53EF\u70BA\u7A7A\u3002");
    if (b.stocks.length > 500) throw Error("\u7DB2\u9801\u7248\u4E00\u6B21\u6700\u591A 500 \u6A94\u3002");
    let ids = /* @__PURE__ */ new Set();
    for (const s of b.stocks) {
      if (typeof s.id !== "string" || ids.has(s.id) || !s.bars?.length) throw Error("\u80A1\u7968\u4EE3\u865F\u4E0D\u53EF\u91CD\u8907\uFF0C\u4E14\u9700\u6709\u80A1\u50F9\u8CC7\u6599\u3002");
      ids.add(s.id);
      let last = "";
      for (const r of s.bars) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || r.date <= last) throw Error("\u65E5\u671F\u9700\u6392\u5E8F\u4E14\u4E0D\u91CD\u8907\u3002");
        last = r.date;
        const issue = barIssue(r);
        if (issue) throw Error(`${s.id} ${r.date}\uFF1A${issue}\u3002`);
        for (const k of ["trust", "foreign", "dealer", "foreign_dealer", "adj_factor"]) if (r[k] != null && (!isNum(r[k]) || k === "adj_factor" && r[k] <= 0)) throw Error("\u6CD5\u4EBA\u6578\u503C\u6216\u9084\u539F\u56E0\u5B50\u4E0D\u6B63\u78BA\u3002");
      }
      const dates = /* @__PURE__ */ new Set();
      for (const f of s.financials || []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || dates.has(f.date)) throw Error("\u8CA1\u5831\u65E5\u671F\u932F\u8AA4\u6216\u91CD\u8907\u3002");
        dates.add(f.date);
        for (const k of ["revenue", "gross_profit", "operating_income", "net_income", "eps"]) if (f[k] != null && !isNum(f[k])) throw Error("\u8CA1\u5831\u6578\u503C\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002");
      }
    }
    return b;
  }
  function numeric(value) {
    if (isNum(value)) return value;
    if (typeof value !== "string" || !value.trim()) return null;
    const text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(text)) return null;
    const result = Number(text.replaceAll(",", ""));
    return Number.isFinite(result) ? result : null;
  }
  function barIssue(r) {
    const names = { open: "\u958B\u76E4\u50F9", high: "\u6700\u9AD8\u50F9", low: "\u6700\u4F4E\u50F9", close: "\u6536\u76E4\u50F9", volume: "\u6210\u4EA4\u91CF" };
    for (const k of Object.keys(names)) if (!isNum(r[k])) return `${names[k]}\u7F3A\u503C\u6216\u4E0D\u662F\u6709\u6548\u6578\u5B57`;
    if (Math.min(r.open, r.high, r.low, r.close) <= 0) return "\u958B\u9AD8\u4F4E\u6536\u5FC5\u9808\u5927\u65BC\u96F6";
    if (r.volume < 0) return "\u6210\u4EA4\u91CF\u4E0D\u53EF\u70BA\u8CA0\u6578";
    if (r.low > Math.min(r.open, r.close) || r.high < Math.max(r.open, r.close)) return "\u6700\u9AD8\uFF0F\u6700\u4F4E\u50F9\u8207\u958B\u76E4\uFF0F\u6536\u76E4\u50F9\u4E0D\u4E00\u81F4";
    return "";
  }
  function prepareBundle(raw) {
    if (!raw || raw.schema_version !== 1 || !Array.isArray(raw.stocks)) return validate(raw);
    const warnings = [...Array.isArray(raw.warnings) ? raw.warnings : []], issues = [];
    const stocks = raw.stocks.map((stock) => {
      if (!Array.isArray(stock.bars) || !stock.bars.length) throw Error(`${stock.id || "\u6B64\u80A1\u7968"} \u6C92\u6709\u53EF\u7528\u884C\u60C5\u8CC7\u6599\u3002`);
      const bars = [];
      const rejected = [];
      for (const row of stock.bars) {
        if (!row || typeof row !== "object") throw Error(`${stock.id} \u884C\u60C5\u5217\u683C\u5F0F\u4E0D\u6B63\u78BA\u3002`);
        const bar = { ...row };
        for (const k of ["open", "high", "low", "close", "volume", "trust", "foreign", "dealer", "foreign_dealer", "adj_factor", "pe", "pb", "dividend_yield"]) if (k in bar) bar[k] = numeric(bar[k]);
        const issue = barIssue(bar);
        if (issue) {
          rejected.push(`${stock.id} ${row.date || "\u65E5\u671F\u672A\u63D0\u4F9B"}\uFF1A${issue}`);
          continue;
        }
        bars.push(bar);
      }
      if (!bars.length) throw Error(`${stock.id} \u5C1A\u672A\u8F09\u5165\u771F\u5BE6\u8CC7\u6599\uFF1A\u5168\u90E8 ${rejected.length} \u7B46\u884C\u60C5\u7121\u6548\u3002${rejected[0] || ""}`);
      issues.push(...rejected);
      return { ...stock, bars };
    });
    if (issues.length) warnings.push(`\u5DF2\u6392\u9664 ${issues.length} \u7B46\u7570\u5E38\u884C\u60C5\uFF0C\u6C92\u6709\u88DC\u9020\u50F9\u683C\u6216\u6210\u4EA4\u91CF\uFF1B\u7D71\u8A08\u8207\u56DE\u6E2C\u53EF\u80FD\u53D7\u8CC7\u6599\u7F3A\u53E3\u5F71\u97FF\u3002`, ...issues.slice(0, 30));
    return validate({ ...raw, stocks, warnings: [...new Set(warnings)] }, { allowEmpty: true });
  }
  function indicators(bs) {
    let e12 = null, e26 = null, dea = null, k = 50, d = 50;
    return bs.map((b, i) => {
      let c = b.close;
      e12 = e12 === null ? c : e12 + (c - e12) * 2 / 13;
      e26 = e26 === null ? c : e26 + (c - e26) * 2 / 27;
      let dif = e12 - e26;
      dea = dea === null ? dif : dea + (dif - dea) * 2 / 10;
      let row = { date: b.date, dif, dea, macd: 2 * (dif - dea), k: null, d: null, ma20: i >= 19 ? bs.slice(i - 19, i + 1).reduce((a, x) => a + x.close, 0) / 20 : null };
      if (i >= 8) {
        let w = bs.slice(i - 8, i + 1), hi = Math.max(...w.map((x) => x.high)), lo = Math.min(...w.map((x) => x.low)), rsv = hi > lo ? (c - lo) / (hi - lo) * 100 : 50;
        k = k * 2 / 3 + rsv / 3;
        d = d * 2 / 3 + k / 3;
        Object.assign(row, { k, d });
      }
      return row;
    });
  }
  function backtest(stock, p = {}) {
    p = { streak: 3, hold: 5, foreign: false, fee: 1425e-6, tax: 3e-3, slippage: 1e-3, start: null, end: null, adjusted: true, ...p };
    if (!Number.isInteger(p.streak) || p.streak < 1 || p.streak > 60 || !Number.isInteger(p.hold) || p.hold < 1 || p.hold > 252 || [p.fee, p.tax, p.slippage].some((x) => !isNum(x) || x < 0 || x >= 0.1)) throw Error("\u56DE\u6E2C\u53C3\u6578\u4E0D\u5408\u6CD5\u3002");
    if (p.start && p.end && p.start > p.end) throw Error("\u958B\u59CB\u65E5\u671F\u4E0D\u5F97\u665A\u65BC\u7D50\u675F\u65E5\u671F\u3002");
    const bs = stock.bars, useAdj = p.adjusted && bs.every((b) => isNum(b.adj_factor) && b.adj_factor > 0), prices = bs.map((b) => ({ open: b.open * (useAdj ? b.adj_factor : 1), close: b.close * (useAdj ? b.adj_factor : 1) }));
    let run2 = 0;
    const signals = bs.map((b) => {
      run2 = isNum(b.trust) && b.trust > 0 ? run2 + 1 : 0;
      return run2 >= p.streak && (!p.foreign || isNum(b.foreign) && b.foreign > 0);
    });
    const eligible = bs.map((b, i) => i).filter((i) => (!p.start || bs[i].date >= p.start) && (!p.end || bs[i].date <= p.end));
    let cash = 1, pos = null, lastExit = -1, skipped = 0, trades = [], curve = [];
    for (const i of eligible) {
      const b = bs[i];
      if (pos === null && i > 0 && i - 1 >= lastExit && signals[i - 1] && (!p.start || bs[i - 1].date >= p.start)) {
        if (b.volume <= 0 || b.buy_allowed === false) skipped++;
        else {
          let entry = prices[i].open * (1 + p.slippage);
          pos = { i, j: i + p.hold - 1, units: cash / (entry * (1 + p.fee)), before: cash, entry };
          cash = 0;
        }
      }
      let equity = cash;
      if (pos) {
        equity = pos.units * prices[i].close * (1 - p.slippage) * (1 - p.fee - p.tax);
        if (i >= pos.j && b.volume > 0 && b.sell_allowed !== false) {
          trades.push({ signal_date: bs[pos.i - 1].date, entry_date: bs[pos.i].date, exit_date: b.date, entry_price: pos.entry, exit_price: prices[i].close * (1 - p.slippage), return: equity / pos.before - 1, gross_return: prices[i].close / prices[pos.i].open - 1 });
          cash = equity;
          pos = null;
          lastExit = i;
        }
      }
      curve.push({ date: b.date, equity });
    }
    let peak = 1, dd = 0;
    for (const x of curve) {
      peak = Math.max(peak, x.equity);
      dd = Math.min(dd, x.equity / peak - 1);
    }
    let rets = trades.map((t) => t.return), benchmark = null;
    if (eligible.length > 1) {
      let a = eligible[0], z = eligible.at(-1);
      benchmark = prices[z].close * (1 - p.slippage) * (1 - p.fee - p.tax) / (prices[a].open * (1 + p.slippage) * (1 + p.fee)) - 1;
    }
    return { stock_id: stock.id, trades, curve, count: trades.length, win_rate: rets.length ? rets.filter((x) => x > 0).length / rets.length : null, mean_return: rets.length ? rets.reduce((a, x) => a + x, 0) / rets.length : null, total_return: curve.length ? curve.at(-1).equity - 1 : 0, max_drawdown: dd, benchmark_return: benchmark, adjusted: useAdj, skipped_untradable: skipped, open_positions: pos ? 1 : 0, parameters: p };
  }
  function flows(stocks, window2 = 5, investor = "all") {
    const calendar = [...new Set(stocks.flatMap((s) => s.bars.map((b) => b.date)))].sort().slice(-2 * window2);
    if (calendar.length < 2 * window2) return { rows: [], included: 0, excluded: stocks.length, dates: calendar };
    let curr = new Set(calendar.slice(window2)), all = new Set(calendar), groups = /* @__PURE__ */ new Map(), excluded = 0;
    for (const s of stocks) {
      let bs = s.bars.filter((b) => all.has(b.date)), keys = investor === "all" ? ["trust", "foreign", "dealer", "foreign_dealer"] : [investor];
      if (bs.length !== 2 * window2 || bs.some((b) => keys.some((k) => !isNum(b[k])))) {
        excluded++;
        continue;
      }
      let name = s.sector || "\u672A\u5206\u985E";
      if (!groups.has(name)) groups.set(name, { sector: name, current: 0, previous: 0, count: 0 });
      let g = groups.get(name);
      g.count++;
      for (const b of bs) g[curr.has(b.date) ? "current" : "previous"] += keys.reduce((a, k) => a + b[k], 0) * b.close;
    }
    let rows = [...groups.values()].map((g) => {
      let delta = g.current - g.previous, f = g.current;
      return { ...g, delta, quadrant: f === 0 || delta === 0 ? "\u6301\u5E73" : f > 0 ? delta > 0 ? "\u52A0\u901F\u6D41\u5165" : "\u6D41\u5165\u653E\u7DE9" : delta < 0 ? "\u52A0\u901F\u6D41\u51FA" : "\u6D41\u51FA\u653E\u7DE9" };
    }).sort((a, b) => b.current - a.current);
    return { rows, included: rows.reduce((a, x) => a + x.count, 0), excluded, dates: calendar };
  }
  function dcf(a) {
    const { fcf, growth, wacc, terminal, net_debt, shares } = a, years = 5;
    if (!Object.values(a).every(isNum) || fcf <= 0 || shares <= 0 || wacc <= terminal || wacc <= 0 || growth <= -1 || terminal <= -1) throw Error("FCFF\u3001\u80A1\u6578\u9700\u5927\u65BC 0\uFF0C\u6298\u73FE\u7387\u9700\u5927\u65BC\u6C38\u7E8C\u6210\u9577\u7387\u4E14\u70BA\u6B63\u3002");
    let forecast = Array.from({ length: years }, (_, i) => fcf * (1 + growth) ** (i + 1)), pv = forecast.reduce((s, v, i) => s + v / (1 + wacc) ** (i + 1), 0), tv = forecast.at(-1) * (1 + terminal) / (wacc - terminal) / (1 + wacc) ** years;
    return { price: (pv + tv - net_debt) / shares, enterprise_value: pv + tv, forecast, terminal_pv: tv, assumptions: { ...a, years } };
  }
  var isNum;
  var init_core = __esm({
    "dist/core.mjs"() {
      isNum = (v) => typeof v === "number" && Number.isFinite(v);
    }
  });

  // dist/app.js
  var app_exports = {};
  function showError(e) {
    $("error").hidden = false;
    $("error").textContent = e instanceof Error ? e.message : e;
  }
  function clearError() {
    $("error").hidden = true;
  }
  function table(headers, rows) {
    return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : '<div class="empty">\u9019\u500B\u7BC4\u570D\u6C92\u6709\u8DB3\u5920\u8CC7\u6599\u3002</div>';
  }
  function lineChart(series, labels, { height = 230, min, max, yformat = (v) => fmt(v, 1) } = {}) {
    let values = series.flatMap((s) => s.values.filter(isNum));
    if (!values.length) return '<div class="empty">\u5C1A\u7121\u53EF\u7E6A\u88FD\u7684\u8CC7\u6599\u3002</div>';
    let lo = min ?? Math.min(...values), hi = max ?? Math.max(...values);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    if (min == null) lo -= (hi - lo) * 0.08;
    if (max == null) hi += (hi - lo) * 0.08;
    const W = 720, L = 60, R = 18, T = 18, B = 32, H = height, x = (i) => L + (W - L - R) * i / Math.max(1, labels.length - 1), y = (v) => T + (H - T - B) * (hi - v) / (hi - lo);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="\u6642\u9593\u5E8F\u5217\u6298\u7DDA\u5716">`;
    for (let i = 0; i < 4; i++) {
      let v = lo + (hi - lo) * i / 3, yy = y(v);
      svg += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="#e8eef1"/><text x="${L - 9}" y="${yy + 4}" text-anchor="end" fill="#73878f" font-size="12">${esc(yformat(v))}</text>`;
    }
    for (const s of series) {
      let path = "", pen = false;
      s.values.forEach((v, i) => {
        if (!isNum(v)) {
          pen = false;
          return;
        }
        path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        pen = true;
      });
      svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    }
    for (const i of [0, Math.floor((labels.length - 1) / 2), labels.length - 1]) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="#73878f" font-size="12">${esc(labels[i] ?? "")}</text>`;
    return svg + `</svg><div class="legend">${series.map((s) => `<span style="color:${s.color};margin-right:16px">\u2501 ${esc(s.name)}</span>`).join("")}</div>`;
  }
  function candleChart(bs, inds) {
    let w = bs.slice(-60), a = inds.slice(-60), W = 780, H = 265, L = 54, R = 15, T = 12, B = 30, lo = Math.min(...w.map((b) => b.low)), hi = Math.max(...w.map((b) => b.high)), span = hi - lo || 1;
    lo -= span * 0.06;
    hi += span * 0.06;
    let y = (v2) => T + (H - T - B) * (hi - v2) / (hi - lo), step = (W - L - R) / w.length, x = (i) => L + step * (i + 0.5);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="\u6700\u8FD1\u516D\u5341\u7B46\u80A1\u50F9 K \u7DDA\u8207\u4E8C\u5341\u65E5\u5747\u7DDA">`;
    for (let i = 0; i < 5; i++) {
      let v2 = lo + (hi - lo) * i / 4, yy = y(v2);
      s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#e8eef1"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end" fill="#73878f" font-size="12">${fmt(v2, 0)}</text>`;
    }
    w.forEach((b, i) => {
      let c = b.close >= b.open ? "#bf404a" : "#16816a";
      s += `<g><title>${esc(b.date)} \u958B ${b.open} \u9AD8 ${b.high} \u4F4E ${b.low} \u6536 ${b.close}</title><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${c}"/><rect x="${x(i) - step * 0.3}" y="${Math.min(y(b.open), y(b.close))}" width="${step * 0.6}" height="${Math.max(1, Math.abs(y(b.open) - y(b.close)))}" fill="${c}"/></g>`;
    });
    let path = "";
    a.forEach((b, i) => {
      if (isNum(b.ma20)) path += `${path ? "L" : "M"}${x(i)},${y(b.ma20)} `;
    });
    s += `<path d="${path}" fill="none" stroke="#dba953" stroke-width="1.8"/>`;
    for (const i of [0, Math.floor(w.length / 2), w.length - 1]) s += `<text x="${x(i)}" y="${H - 5}" text-anchor="middle" fill="#73878f" font-size="12">${w[i].date.slice(5)}</text>`;
    s += "</svg>";
    let maxVol = Math.max(...w.map((b) => b.volume), 1), v = `<svg viewBox="0 0 ${W} 70" role="img" aria-label="\u6210\u4EA4\u91CF">`;
    w.forEach((b, i) => {
      let h = b.volume / maxVol * 45;
      v += `<rect x="${x(i) - step * 0.3}" y="${55 - h}" width="${step * 0.6}" height="${h}" fill="${b.close >= b.open ? "#d7969b" : "#90c6b9"}"><title>${esc(b.date)} \u6210\u4EA4\u91CF ${fmt(b.volume / 1e3, 0)} \u5F35</title></rect>`;
    });
    $("volume-chart").innerHTML = v + '<text x="5" y="15" fill="#73878f" font-size="12">\u6210\u4EA4\u91CF</text></svg>';
    return s;
  }
  function go(p) {
    if (!["scanner", "bigdata", "overview", "strategy", "ab", "flows", "report"].includes(p) || !document.getElementById(p)) p = "overview";
    page = p;
    document.querySelectorAll(".page").forEach((e) => e.classList.toggle("active", e.id === p));
    document.querySelectorAll("nav button").forEach((e) => e.classList.toggle("active", e.dataset.page === p));
    $("page-title").textContent = { scanner: "\u6383\u63CF\u9078\u80A1", bigdata: "\u6B77\u53F2\u76F8\u4F3C\u689D\u4EF6\u5206\u6790", overview: "\u500B\u80A1\u7E3D\u89BD", strategy: "\u7B56\u7565\u56DE\u6E2C", flows: "\u8CC7\u91D1\u6D41\u5411", ab: "A/B \u96D9\u7B56\u7565", report: "\u8CA1\u5831\u8207\u4F30\u503C" }[p];
    history.replaceState(null, "", "#" + p);
  }
  function showLoadState(id, failed = false, detail = "") {
    $("load-state").hidden = false;
    document.body.classList.add("real-load-state");
    $("load-state-title").textContent = failed ? `${id} \u5C1A\u672A\u8F09\u5165\u771F\u5BE6\u8CC7\u6599` : `\u6B63\u5728\u8F09\u5165 ${id} \u7684\u771F\u5BE6\u8CC7\u6599\u2026`;
    $("load-state-detail").textContent = detail || "\u67E5\u8A62\u5B8C\u6210\u5F8C\uFF0C\u80A1\u7968\u9078\u55AE\u3001\u65E5\u671F\u3001\u5716\u8868\u8207\u5927\u6578\u64DA\u5206\u6790\u6703\u4E00\u8D77\u5207\u63DB\u3002";
    $("load-state-actions").hidden = !failed;
    $("return-existing").hidden = !(failed && bundle?.mode === "real" && bundle.stocks.length);
  }
  function clearLoadState() {
    $("load-state").hidden = true;
    document.body.classList.remove("real-load-state");
  }
  function emptyState() {
    showLoadState("", true, "\u8ACB\u6309\u300C\u91CD\u65B0\u67E5\u8A62\u300D\u6216\u532F\u5165 JSON \u8F09\u5165\u771F\u5BE6\u8CC7\u6599\uFF1B\u4E0D\u6703\u81EA\u52D5\u6539\u7528\u6A21\u64EC\u8CC7\u6599\u3002");
    $("load-state-title").textContent = "\u5C1A\u672A\u8F09\u5165\u80A1\u7968\u8CC7\u6599";
    $("return-existing").hidden = true;
    $("stock").innerHTML = "";
    $("data-date").textContent = "";
    $("price-chart").innerHTML = "";
    $("watchlist").innerHTML = "";
  }
  function setBundle(raw, { persist = true } = {}) {
    const next = prepareBundle(raw);
    bundle = next;
    clearLoadState();
    stockId = bundle.stocks[0]?.id || null;
    results = null;
    dcfResult = null;
    $("dcf-result").innerHTML = "";
    $("fcf").value = "";
    $("shares").value = "";
    $("strategy-output").innerHTML = '<div class="panel empty">\u8ABF\u6574\u4E0A\u65B9\u689D\u4EF6\u5F8C\u57F7\u884C\u56DE\u6E2C\uFF0C\u67E5\u770B\u6BCF\u6A94\u80A1\u7968\u7684\u7D50\u679C\u8207\u9010\u7B46\u4EA4\u6613\u3002</div>';
    $("quality-warning").hidden = !bundle.warnings?.length;
    $("quality-warning").textContent = bundle.warnings?.length ? `\u8CC7\u6599\u63D0\u9192\uFF1A${bundle.warnings.find((x) => x.startsWith("\u5DF2\u6392\u9664")) || bundle.warnings[0]}\uFF08\u5B8C\u6574\u8AAA\u660E\u8ACB\u958B\u555F\u300C\u8CC7\u6599\u4F86\u6E90\u300D\uFF09` : "";
    if (!bundle.stocks.length) {
      emptyState();
      clearError();
      if (mobile && persist && bundle.mode === "real") mobile.bundleChanged(bundle).catch(showError);
      return;
    }
    $("stock").innerHTML = bundle.stocks.map((s) => `<option value="${esc(s.id)}">${esc(s.id + " " + (s.name || s.id))}</option>`).join("");
    const dates = bundle.stocks.flatMap((s) => [s.bars[0].date, s.bars.at(-1).date]).sort();
    $("start").value = dates[0];
    $("end").value = dates.at(-1);
    $("notice").className = "notice" + (bundle.mode === "demo" ? "" : " real");
    $("notice").textContent = bundle.mode === "demo" ? "\u6A21\u64EC\u8CC7\u6599\u6A21\u5F0F\uFF1A\u80A1\u7968\u3001\u80A1\u50F9\u8207\u8CA1\u5831\u5747\u70BA\u865B\u69CB\uFF0C\u53EA\u4F9B\u64CD\u4F5C\u8207\u7A0B\u5F0F\u9A57\u8B49\uFF0C\u4E0D\u80FD\u8996\u70BA\u771F\u5BE6\u6295\u8CC7\u7E3E\u6548\u3002" : `\u5DF2\u8F09\u5165 ${bundle.stocks.length} \u6A94 \xB7 \u4F86\u6E90\uFF1A${bundle.source || "\u4F7F\u7528\u8005\u532F\u5165"} \xB7 \u5404\u80A1\u8CC7\u6599\u65E5\u671F\u53EF\u80FD\u4E0D\u540C\u3002`;
    $("source-detail").textContent = [`\u64F7\u53D6\u6642\u9593\uFF1A${bundle.fetched_at || "\u672A\u63D0\u4F9B"}`, ...bundle.notes || [], ...bundle.warnings || []].join("\n");
    clearError();
    render();
    renderFlows();
    if (mobile && persist) mobile.bundleChanged(bundle).catch(showError);
  }
  function renderWatch() {
    $("watch-toggle").textContent = watch.includes(stockId) ? "\u79FB\u9664\u81EA\u9078" : "\u52A0\u5165\u81EA\u9078";
    $("watch-toggle").setAttribute("aria-pressed", String(watch.includes(stockId)));
    const ws = bundle.stocks.filter((x) => watch.includes(x.id));
    $("watchlist").innerHTML = ws.length ? ws.map((x) => {
      let b = x.bars.at(-1), p = x.bars.at(-2), v = p ? b.close / p.close - 1 : null;
      return `<button class="watch-item" data-stock="${esc(x.id)}"><span>${esc(x.name || x.id)}<small>${esc(x.id)}</small></span><span class="watch-price">${fmt(b.close)}<small class="${sign(v)}">${pct(v)}</small></span></button>`;
    }).join("") : '<p class="empty">\u76EE\u524D\u6C92\u6709\u5DF2\u8F09\u5165\u7684\u81EA\u9078\u80A1\u7968\u3002</p>';
  }
  function render() {
    if (!selected()) {
      emptyState();
      return;
    }
    const s = selected(), b = s.bars.at(-1), prev = s.bars.at(-2), change = prev ? b.close / prev.close - 1 : null, inds = indicators(s.bars);
    $("stock").value = stockId;
    window.StocklabABUI?.render?.();
    $("data-date").textContent = `${s.bars[0].date} \u2014 ${b.date} \xB7 ${s.bars.length} \u7B46`;
    renderWatch();
    $("stock-metrics").innerHTML = metric("\u6536\u76E4\u50F9", fmt(b.close), "\u65B0\u81FA\u5E63 / \u5143") + metric("\u55AE\u65E5\u6F32\u8DCC", pct(change), "\u76F8\u5C0D\u524D\u4E00\u7B46\u6536\u76E4", sign(change)) + metric("\u6210\u4EA4\u91CF", fmt(b.volume / 1e3, 0), "\u5F35 / \u6BCF\u5F35 1,000 \u80A1") + metric("\u672C\u76CA\u6BD4", isNum(b.pe) && b.pe > 0 ? fmt(b.pe) + "x" : "\u2014", s.sector || "\u672A\u5206\u985E");
    $("chart-title").textContent = s.name || s.id;
    $("price-chart").innerHTML = candleChart(s.bars, inds);
    renderIndicator(inds);
    const ws = bundle.stocks.filter((x) => watch.includes(x.id));
    $("watchlist").innerHTML = ws.length ? ws.map((x) => {
      let b2 = x.bars.at(-1), p = x.bars.at(-2), v = p ? b2.close / p.close - 1 : null;
      return `<button class="watch-item" data-stock="${esc(x.id)}"><span>${esc(x.name || x.id)}<small>${esc(x.id)}</small></span><span class="watch-price">${fmt(b2.close)}<small class="${sign(v)}">${pct(v)}</small></span></button>`;
    }).join("") : '<p class="empty">\u9078\u64C7\u6A19\u7684\u5F8C\u6309\u300C\u52A0\u5165\u81EA\u9078\u300D\uFF0C\u5EFA\u7ACB\u4F60\u7684\u89C0\u5BDF\u6E05\u55AE\u3002</p>';
    $("chip-list").innerHTML = [["\u5916\u8CC7", "foreign"], ["\u6295\u4FE1", "trust"], ["\u81EA\u71DF\u5546", "dealer"]].map(([n, k]) => `<div class="chip-row"><span>${n}</span><b class="${sign(b[k])}">${fmt(isNum(b[k]) ? b[k] / 1e3 : null, 0)}</b></div>`).join("");
    renderPortfolio();
    renderReport();
    if (results) renderResults();
    extension?.render();
  }
  function renderIndicator(inds = indicators(selected().bars)) {
    let w = inds.slice(-60), labels = w.map((x) => x.date.slice(5));
    $("indicator-chart").innerHTML = ind === "kd" ? lineChart([{ name: "K", values: w.map((x) => x.k), color: "#218777" }, { name: "D", values: w.map((x) => x.d), color: "#d39b42" }], labels, { height: 135, min: 0, max: 100 }) : lineChart([{ name: "DIF", values: w.map((x) => x.dif), color: "#218777" }, { name: "DEA", values: w.map((x) => x.dea), color: "#d39b42" }, { name: "MACD", values: w.map((x) => x.macd), color: "#7a8bb0" }], labels, { height: 135 });
  }
  function renderPortfolio() {
    let rows = [];
    for (const s of bundle.stocks) {
      let p = positions[s.id];
      if (!p || !isNum(p.shares) || !isNum(p.cost) || p.shares <= 0) continue;
      let b = s.bars.at(-1), value = p.shares * b.close, pnl = value - p.shares * p.cost;
      rows.push([esc(s.id + " " + s.name), fmt(p.shares, 0), fmt(p.cost), fmt(value, 0), `<span class="${sign(pnl)}">${fmt(pnl, 0)}</span>`, esc(b.date)]);
    }
    $("portfolio").innerHTML = rows.length ? table(["\u6A19\u7684", "\u80A1\u6578", "\u6BCF\u80A1\u6210\u672C", "\u5E02\u503C", "\u672A\u5BE6\u73FE\u640D\u76CA\uFF08\u672A\u6263\u8CE3\u51FA\u8CBB\u7A05\uFF09", "\u4F30\u503C\u65E5\u671F"], rows) : '<div class="empty">\u5C1A\u7121\u5DF2\u8F09\u5165\u6A19\u7684\u7684\u6301\u80A1\u8A18\u9304\u3002\u9078\u53D6\u80A1\u7968\u5F8C\u53EF\u8A2D\u5B9A\u80A1\u6578\u8207\u6210\u672C\u3002</div>';
  }
  function params() {
    return { streak: Number($("streak").value), hold: Number($("hold").value), foreign: $("foreign").checked, fee: Number($("fee").value) / 100, tax: Number($("tax").value) / 100, slippage: Number($("slippage").value) / 100, start: $("start").value, end: $("end").value, adjusted: $("adjusted").checked };
  }
  function run() {
    clearError();
    let p = params();
    results = bundle.stocks.map((s) => backtest(s, p));
    renderResults();
    return results.map(({ stock_id, count, win_rate, mean_return, total_return, max_drawdown }) => ({ stock_id, count, win_rate, mean_return, total_return, max_drawdown }));
  }
  function renderResults() {
    let r = results.find((x) => x.stock_id === stockId), p = r.parameters;
    $("strategy-output").innerHTML = `<div class="metrics">${metric("\u5DF2\u5B8C\u6210\u4EA4\u6613", String(r.count), `\u672A\u5E73\u5009 ${r.open_positions} \u7B46`)}${metric("\u52DD\u7387", pct(r.win_rate), "\u6263\u9664\u6210\u672C\u5F8C\u7372\u5229\u4EA4\u6613\u6BD4\u4F8B")}${metric("\u5E73\u5747\u6BCF\u7B46\u5831\u916C", pct(r.mean_return), "\u53EA\u8A08\u5DF2\u5B8C\u6210\u4EA4\u6613", sign(r.mean_return))}${metric("\u6BCF\u65E5\u6DE8\u503C\u6700\u5927\u56DE\u64A4", pct(r.max_drawdown), "\u542B\u6301\u5009\u671F\u9593\u6DE8\u503C\u8B8A\u5316", sign(r.max_drawdown))}</div><article class="panel"><div class="panel-head"><h2>${esc(selected().name)} \u7B56\u7565\u6DE8\u503C</h2><span class="badge">${r.adjusted ? "\u4F7F\u7528\u9084\u539F\u50F9\u683C" : "\u539F\u59CB\u50F9\u683C\uFF0C\u672A\u542B\u914D\u606F"}</span></div><div id="equity-chart"></div><p class="caption">\u7D2F\u7A4D\u5831\u916C ${pct(r.total_return)}\uFF1B\u540C\u671F\u9593\u8CB7\u5165\u6301\u6709 ${pct(r.benchmark_return)}\u3002\u8D77\u59CB\u8CC7\u7522 1\uFF0C\u6BCF\u6A94\u5168\u984D\u7368\u7ACB\u6295\u5165\uFF0C\u53EF\u8CB7\u96F6\u788E\u80A1\u6578\uFF0C\u4E0D\u8DE8\u80A1\u7968\u5408\u4F75\u8CC7\u91D1\uFF1B\u672A\u5E73\u5009\u90E8\u4F4D\u6309\u671F\u672B\u50F9\u4F30\u503C\u4E26\u4F30\u8A08\u5E73\u5009\u6210\u672C\u3002</p></article><article class="panel"><h2>\u540C\u689D\u4EF6\u6A19\u7684\u6BD4\u8F03</h2>${table(["\u80A1\u7968", "\u4EA4\u6613\u6578", "\u52DD\u7387", "\u5E73\u5747\u5831\u916C", "\u7D2F\u7A4D\u5831\u916C", "\u6700\u5927\u56DE\u64A4", "\u50F9\u683C\u53E3\u5F91"], results.map((x) => [esc(x.stock_id), x.count, pct(x.win_rate), pct(x.mean_return), pct(x.total_return), pct(x.max_drawdown), x.adjusted ? "\u9084\u539F" : "\u539F\u59CB"]))}<p class="caption">\u689D\u4EF6\uFF1A\u9023\u8CB7 ${p.streak} \u65E5\uFF0C\u6301\u6709 ${p.hold} \u65E5\uFF0C\u5916\u8CC7\u540C\u6B65\u8CB7\u8D85 ${p.foreign ? "\u662F" : "\u5426"}\uFF1B${p.start} \u81F3 ${p.end}\u3002\u55AE\u908A\u624B\u7E8C\u8CBB ${pct(p.fee)}\u3001\u4EA4\u6613\u7A05 ${pct(p.tax)}\u3001\u55AE\u908A\u6ED1\u50F9 ${pct(p.slippage)}\u3002\u4E0D\u540C\u80A1\u7968\u7684\u8CC7\u6599\u8D77\u8A16\u53EF\u80FD\u4E0D\u540C\u3002</p></article><article class="panel"><div class="panel-head"><h2>\u9010\u7B46\u4EA4\u6613</h2><button id="trade-csv">\u5B8C\u6574\u4EA4\u6613 CSV \u2193</button></div>${table(["\u8A0A\u865F\u65E5", "\u9032\u5834\u65E5", "\u51FA\u5834\u65E5", "\u6210\u4EA4\u50F9\u53E3\u5F91\u9032\u5834", "\u6210\u4EA4\u50F9\u53E3\u5F91\u51FA\u5834", "\u6DE8\u5831\u916C"], r.trades.slice(-100).reverse().map((t) => [t.signal_date, t.entry_date, t.exit_date, fmt(t.entry_price), fmt(t.exit_price), `<span class="${sign(t.return)}">${pct(t.return)}</span>`]))}<p class="caption">\u986F\u793A\u6700\u8FD1 100 \u7B46\uFF0CCSV \u5305\u542B\u5168\u90E8\u3002\u9084\u539F\u6A21\u5F0F\u4E0B\u6210\u4EA4\u50F9\u662F\u9084\u539F\u8A08\u50F9\u55AE\u4F4D\uFF1B\u539F\u59CB\u6A21\u5F0F\u4E0D\u8655\u7406\u9664\u6B0A\u606F\u8207\u5206\u5272\u3002\u7F3A\u6CD5\u4EBA\u8CC7\u6599\u6703\u4E2D\u65B7\u9023\u8CB7\u5E8F\u5217\u3002\u6BCF\u5929\u6AA2\u67E5\u8A0A\u865F\uFF0C\u540C\u4E00\u80A1\u7968\u4E0D\u91CD\u758A\u6301\u5009\uFF0C\u51FA\u5834\u7576\u65E5\u665A\u9593\u8A0A\u865F\u53EF\u65BC\u9694\u65E5\u518D\u9032\u5834\u3002</p><p class="caption">\u6210\u4EA4\u6A21\u578B\u4EE5\u958B\u76E4\uFF0F\u6536\u76E4\u50F9\u53CA\u56FA\u5B9A\u6ED1\u50F9\u8FD1\u4F3C\uFF0C\u6C92\u6709\u91CD\u5EFA\u59D4\u8A17\u7C3F\uFF0C\u7121\u6CD5\u4FDD\u8B49\u6F32\u8DCC\u505C\u6642\u6210\u4EA4\uFF1B\u6700\u4F4E\u624B\u7E8C\u8CBB\u3001\u6574\u5F35\u9650\u5236\u3001\u505C\u724C\u8207\u4E0B\u5E02\u640D\u5931\u672A\u5B8C\u6574\u6A21\u64EC\u3002\u9078\u5B9A\u6E05\u55AE\u53EF\u80FD\u6709\u5B58\u6D3B\u8005\u504F\u8AA4\u3002\u6E2C\u8A66\u8CC7\u6599\u5916\u7684\u7E3E\u6548\u9700\u53E6\u884C\u9A57\u8B49\u3002</p></article>`;
    $("equity-chart").innerHTML = lineChart([{ name: "\u7B56\u7565\u6DE8\u503C\uFF08\u6263\u6210\u672C\uFF09", values: r.curve.map((x) => x.equity), color: "#228777" }], r.curve.map((x) => x.date), { height: 250 });
    $("trade-csv").onclick = () => csv(`${stockId}_trades_${bundle.mode === "demo" ? "DEMO" : "data"}.csv`, ["signal_date", "entry_date", "exit_date", "entry_price", "exit_price", "net_return"], r.trades.map((t) => [t.signal_date, t.entry_date, t.exit_date, t.entry_price, t.exit_price, t.return]));
  }
  function renderFlows() {
    let w = Number($("flow-window").value), f = flows(bundle.stocks, w, $("flow-investor").value), W = 900, H = 470, L = 70, R = 35, T = 30, B = 55, xc = (L + W - R) / 2, yc = (T + H - B) / 2, xmax = Math.max(...f.rows.map((r) => Math.abs(r.current / 1e8)), 1) * 1.3, ymax = Math.max(...f.rows.map((r) => Math.abs(r.delta / 1e8)), 1) * 1.3;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="\u7522\u696D\u8CC7\u91D1\u6D41\u5411\u56DB\u8C61\u9650\u6CE1\u6CE1\u5716"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="#f8fafb"/><path d="M${xc},${T}V${H - B}M${L},${yc}H${W - R}" stroke="#9fb3bb" stroke-dasharray="4 4"/>`;
    for (const [text, x, y, c] of [["\u6D41\u51FA\u653E\u7DE9", L + 15, T + 25, "#79938b"], ["\u52A0\u901F\u6D41\u5165", W - R - 15, T + 25, "#ad6670"], ["\u52A0\u901F\u6D41\u51FA", L + 15, H - B - 18, "#487f6e"], ["\u6D41\u5165\u653E\u7DE9", W - R - 15, H - B - 18, "#b49a78"]]) s += `<text x="${x}" y="${y}" text-anchor="${x > xc ? "end" : "start"}" fill="${c}" font-size="17">${text}</text>`;
    for (const r of f.rows) {
      let x = xc + r.current / 1e8 / xmax * (W - L - R) / 2, y = yc - r.delta / 1e8 / ymax * (H - T - B) / 2, rad = 9 + Math.sqrt(Math.abs(r.current) / 1e8 / xmax) * 33, c = r.current > 0 ? "#bb6873" : "#439e88";
      s += `<g><title>${esc(r.sector)}\uFF1A\u672C\u671F ${fmt(r.current / 1e8)} \u5104\uFF0C\u8B8A\u5316 ${fmt(r.delta / 1e8)} \u5104\uFF1B${r.count} \u6A94</title><circle cx="${x}" cy="${y}" r="${rad}" fill="${c}" fill-opacity=".7" stroke="${c}"/><text x="${x}" y="${y - rad - 8}" text-anchor="middle" font-size="13" fill="#314e59">${esc(r.sector)}</text></g>`;
    }
    for (let i = -2; i <= 2; i++) {
      s += `<text x="${xc + i / 2 * (W - L - R) / 2}" y="${H - B + 19}" text-anchor="middle" font-size="12" fill="#73878f">${fmt(xmax * i / 2, 1)}</text><text x="${L - 8}" y="${yc - i / 2 * (H - T - B) / 2 + 4}" text-anchor="end" font-size="12" fill="#73878f">${fmt(ymax * i / 2, 1)}</text>`;
    }
    s += `<text x="${xc}" y="${H - 4}" text-anchor="middle" fill="#657b84" font-size="13">\u672C\u671F\u4F30\u8A08\u6DE8\u6D41\u91CF\uFF08\u5104\u5143\uFF09</text><text x="18" y="${yc}" transform="rotate(-90 18 ${yc})" text-anchor="middle" fill="#657b84" font-size="13">\u76F8\u8F03\u524D\u671F\u8B8A\u5316\uFF08\u5104\u5143\uFF09</text></svg>`;
    $("flow-chart").innerHTML = f.rows.length ? s : '<div class="empty">\u5B8C\u6574\u6CD5\u4EBA\u8CC7\u6599\u4E0D\u8DB3\u4EE5\u6BD4\u8F03\u5169\u500B\u5340\u9593\u3002\u8ACB\u589E\u52A0\u6B77\u53F2\u8CC7\u6599\u6216\u66F4\u63DB\u6CD5\u4EBA\u985E\u5225\u3002</div>';
    $("flow-coverage").textContent = `\u7D0D\u5165 ${f.included} / ${bundle.stocks.length} \u6A94\uFF1B\u7F3A\u5C11\u5171\u540C\u65E5\u671F\u6216\u6CD5\u4EBA\u6B04\u4F4D\u800C\u6392\u9664 ${f.excluded} \u6A94\u3002${f.dates.length >= 2 * w ? `\u524D\u671F ${f.dates[0]}\u2013${f.dates[w - 1]}\uFF1B\u672C\u671F ${f.dates[w]}\u2013${f.dates.at(-1)}\u3002` : ""}`;
    $("flow-table").innerHTML = table(["\u7522\u696D", "\u7D0D\u5165\u80A1\u7968", "\u524D\u671F\uFF08\u5104\uFF09", "\u672C\u671F\uFF08\u5104\uFF09", "\u8B8A\u5316\uFF08\u5104\uFF09", "\u8C61\u9650"], f.rows.map((r) => [esc(r.sector), r.count, fmt(r.previous / 1e8), fmt(r.current / 1e8), fmt(r.delta / 1e8), r.quadrant]));
  }
  function renderReport() {
    const s = selected(), fs = [...s.financials || []].sort((a, b2) => a.date.localeCompare(b2.date)).slice(-8), last = fs.at(-1), bars = s.bars.slice(-250), b = bars.at(-1);
    $("report-label").textContent = `${s.id} ${s.name || ""} \xB7 ${mode()} \xB7 \u80A1\u50F9\u622A\u81F3 ${b.date}`;
    let gross = last?.revenue > 0 && isNum(last.gross_profit) ? last.gross_profit / last.revenue : null, operating = last?.revenue > 0 && isNum(last.operating_income) ? last.operating_income / last.revenue : null;
    $("summary").innerHTML = `<div class="summary-grid"><div><small>\u6A19\u7684\u8207\u8CC7\u6599</small>${esc(s.id + " " + (s.name || ""))}<br>${esc(mode())}\uFF0C${s.bars.length} \u7B46\u65E5\u8CC7\u6599</div><div><small>\u6700\u65B0\u8CA1\u5831\u671F\u672B ${esc(last?.date || "\u672A\u63D0\u4F9B")}</small>\u71DF\u6536 ${fmt(isNum(last?.revenue) ? last.revenue / 1e8 : null)} \u5104<br>\u6BDB\u5229\u7387 ${pct(gross)}</div><div><small>\u7372\u5229\u8207\u8A55\u50F9</small>\u71DF\u696D\u5229\u76CA\u7387 ${pct(operating)}<br>\u672C\u76CA\u6BD4 ${isNum(b.pe) && b.pe > 0 ? fmt(b.pe) + " \u500D" : "\u7F3A\u503C\u6216\u975E\u6B63"}</div></div>`;
    $("summary").innerHTML += `<p class="caption">\u4F86\u6E90\uFF1A${esc(bundle.source || "\u4F7F\u7528\u8005\u532F\u5165")}\uFF1B\u64F7\u53D6\u6642\u9593\uFF1A${esc(bundle.fetched_at || "\u672A\u63D0\u4F9B")}\uFF1B\u80A1\u50F9\u622A\u81F3 ${esc(b.date)}\u3002</p>`;
    $("financial-chart").innerHTML = lineChart([{ name: "\u71DF\u6536\uFF08\u5104\uFF09", values: fs.map((f) => isNum(f.revenue) ? f.revenue / 1e8 : null), color: "#218777" }, { name: "\u6BDB\u5229\uFF08\u5104\uFF09", values: fs.map((f) => isNum(f.gross_profit) ? f.gross_profit / 1e8 : null), color: "#d39b42" }, { name: "\u71DF\u696D\u5229\u76CA\uFF08\u5104\uFF09", values: fs.map((f) => isNum(f.operating_income) ? f.operating_income / 1e8 : null), color: "#7886b0" }], fs.map((f) => f.date.slice(2)), { height: 235 });
    $("financial-chart").innerHTML += lineChart([{ name: "\u6BDB\u5229\u7387 (%)", values: fs.map((f) => f.revenue > 0 && isNum(f.gross_profit) ? f.gross_profit / f.revenue * 100 : null), color: "#d39b42" }, { name: "\u71DF\u696D\u5229\u76CA\u7387 (%)", values: fs.map((f) => f.revenue > 0 && isNum(f.operating_income) ? f.operating_income / f.revenue * 100 : null), color: "#7886b0" }], fs.map((f) => f.date.slice(2)), { height: 170, yformat: (v) => fmt(v, 1) + "%" });
    $("financial-table").innerHTML = table(["\u671F\u672B\u65E5\u671F", "\u71DF\u6536\uFF08\u5104\uFF09", "\u6BDB\u5229\u7387", "\u71DF\u696D\u5229\u76CA\u7387", "\u6DE8\u5229\uFF08\u5104\uFF09", "EPS\uFF08\u5143\uFF09"], fs.map((f) => [esc(f.date), fmt(isNum(f.revenue) ? f.revenue / 1e8 : null), pct(f.revenue > 0 && isNum(f.gross_profit) ? f.gross_profit / f.revenue : null), pct(f.revenue > 0 && isNum(f.operating_income) ? f.operating_income / f.revenue : null), fmt(isNum(f.net_income) ? f.net_income / 1e8 : null), fmt(f.eps)]));
    $("pe-chart").innerHTML = bars.some((x) => isNum(x.pe) && x.pe > 0) ? lineChart([...[[12, "#b8caca"], [16, "#83b7ac"], [20, "#c7af70"], [24, "#b38a9e"]].map(([n, c]) => ({ name: n + "\u500D", color: c, values: bars.map((x) => isNum(x.pe) && x.pe > 0 ? x.close / x.pe * n : null) })), { name: "\u6536\u76E4", color: "#203c49", values: bars.map((x) => x.close) }], bars.map((x) => x.date.slice(5)), { height: 235 }) : '<div class="empty">\u7F3A\u5C11\u6709\u6548\u6B63\u672C\u76CA\u6BD4\uFF0C\u7121\u6CD5\u8A08\u7B97\u8A55\u50F9\u5340\u9593\u3002</div>';
  }
  function reportPayload() {
    return { bundle, stock_id: stockId, parameters: params(), dcf: dcfResult?.assumptions || null };
  }
  async function exportOffice(format) {
    clearError();
    const el2 = $(format);
    el2.disabled = true;
    try {
      let r = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...reportPayload(), format }) });
      if (!r.ok) {
        let d = await r.json();
        throw Error(d.error || "\u532F\u51FA\u5931\u6557\u3002");
      }
      download(`${stockId}_${bundle.mode === "demo" ? "DEMO" : "report"}.${format}`, await r.blob());
    } catch (e) {
      showError(e);
    } finally {
      el2.disabled = false;
    }
  }
  function loadDemo() {
    setBundle(JSON.parse($("stocklab-demo").textContent));
    window.stocklabStartup.ready();
  }
  async function detectRuntime() {
    if (mobile) return;
    if (location.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(location.hostname)) {
      $("runtime-label").textContent = "\u7DB2\u9801\u7248 \xB7 v1.0.2";
      return;
    }
    $("runtime-label").textContent = "\u6B63\u5728\u9023\u63A5\u672C\u6A5F\u2026";
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 7e3);
    try {
      const r = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
      if (!r.ok) throw Error(`\u672C\u6A5F\u670D\u52D9\u56DE\u61C9 HTTP ${r.status}`);
      if (!r.headers.get("content-type")?.includes("application/json")) throw Error("\u9019\u500B\u7DB2\u5740\u672A\u63D0\u4F9B Python API\uFF0C\u8ACB\u7528 stocklab.py serve \u555F\u52D5\u3002");
      const v = await r.json();
      if (v.app !== "taiwan-stock-lab") throw Error("\u9023\u5230\u5176\u4ED6\u7A0B\u5F0F\uFF0C\u8ACB\u6AA2\u67E5\u555F\u52D5\u7DB2\u5740\u3002");
      if (v.version !== "1.0.2") throw Error(`\u76EE\u524D\u4F3A\u670D\u5668\u70BA ${v.version || "\u820A\u7248"}\u3002\u8ACB\u505C\u6B62\u820A\u7A0B\u5F0F\uFF0C\u518D\u5F9E v1.0.2 \u8CC7\u6599\u593E\u555F\u52D5\u3002`);
      local = true;
      $("runtime-label").textContent = "\u672C\u6A5F Python \xB7 v1.0.2";
      $("fetch-form").hidden = false;
      $("fetch-instruction").textContent = "\u5DF2\u9023\u63A5\u672C\u6A5F\u7A0B\u5F0F\u3002\u8F38\u5165\u80A1\u7968\u4EE3\u865F\u8207\u65E5\u671F\uFF0C\u6309\u300C\u6293\u53D6\u4E26\u8F09\u5165\u300D\u9023\u7DDA FinMind\uFF1B\u76EE\u524D\u70BA\u65E5\u8CC7\u6599\uFF0C\u975E\u5373\u6642\u884C\u60C5\u3002";
      document.querySelectorAll(".local-only").forEach((e) => e.hidden = false);
    } catch (e) {
      const message = e.name === "AbortError" ? "\u672C\u6A5F\u9023\u7DDA\u8D85\u904E 7 \u79D2\u3002\u8ACB\u78BA\u8A8D\u7D42\u7AEF\u6A5F\u4ECD\u5728\u57F7\u884C\u65B0\u7248 stocklab.py\u3002" : e.message;
      $("runtime-label").textContent = "\u672C\u6A5F\u9023\u7DDA\u5931\u6557";
      $("fetch-instruction").textContent = message;
      showError("\u672C\u6A5F\u9023\u7DDA\u5931\u6557\uFF1A" + message);
    } finally {
      clearTimeout(timer);
    }
  }
  async function init() {
    const runtime = detectRuntime();
    try {
      setBundle(mobile?.restoredBundle || { schema_version: 1, mode: "real", stocks: [] }, { persist: false });
      window.stocklabStartup.ready();
      go(location.hash.slice(1) || (document.getElementById("scanner") ? "scanner" : "overview"));
    } catch (e) {
      bundle = { schema_version: 1, mode: "real", stocks: [] };
      emptyState();
      window.stocklabStartup.ready();
      showError(e);
    }
    if (mobile) mobile.ready();
    await runtime;
    const mc = document.modelContext;
    if (mc?.registerTool) {
      const ac = new AbortController();
      window.addEventListener("pagehide", () => ac.abort(), { once: true });
      try {
        await mc.registerTool({ name: "run_stock_backtest", description: "\u4F9D\u76EE\u524D\u5DF2\u8F09\u5165\u8CC7\u6599\u8207\u6307\u5B9A\u53C3\u6578\u57F7\u884C\u56DE\u6E2C\uFF0C\u66F4\u65B0\u7B56\u7565\u756B\u9762\u3002", inputSchema: { type: "object", properties: { streak: { type: "integer", minimum: 1, maximum: 60 }, hold: { type: "integer", minimum: 1, maximum: 252 }, foreign: { type: "boolean" } }, required: ["streak", "hold", "foreign"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input) => {
          if (!Number.isInteger(input.streak) || input.streak < 1 || input.streak > 60 || !Number.isInteger(input.hold) || input.hold < 1 || input.hold > 252 || typeof input.foreign !== "boolean") throw Error("\u53C3\u6578\u4E0D\u5408\u6CD5");
          $("streak").value = input.streak;
          $("hold").value = input.hold;
          $("foreign").checked = input.foreign;
          let out = run();
          go("strategy");
          return { data_mode: bundle.mode, results: out };
        } }, { signal: ac.signal });
      } catch {
      }
    }
  }
  var $, esc, fmt, pct, sign, mobile, bundle, stockId, ind, page, local, results, dcfResult, readLocal, writeLocal, watch, positions, selected, mode, metric, download, csv, removalTarget, extension;
  var init_app = __esm({
    "dist/app.js"() {
      init_core();
      if (!document.getElementById("load-state")) document.getElementById("error").insertAdjacentHTML("afterend", '<section id="load-state" class="panel load-state" role="status" hidden><h2 id="load-state-title"></h2><p id="load-state-detail"></p><div id="load-state-actions" class="actions" hidden><button id="retry-query" type="button">\u91CD\u65B0\u67E5\u8A62</button><button id="change-stock" type="button">\u91CD\u65B0\u8F38\u5165\u80A1\u7968\u4EE3\u865F</button><button id="return-demo" type="button">\u6A21\u64EC\u8CC7\u6599\u6A21\u5F0F</button></div></section>');
      document.getElementById("load-state-actions").insertAdjacentHTML("beforeend", '<button id="return-existing" type="button" hidden>\u8FD4\u56DE\u4E0A\u6B21\u5DF2\u8F09\u5165\u8CC7\u6599</button>');
      document.getElementById("notice").insertAdjacentHTML("afterend", '<p id="quality-warning" class="notice" role="status" hidden></p><p id="action-status" class="caption" role="status" aria-live="polite"></p>');
      document.getElementById("watch-toggle").insertAdjacentHTML("afterend", '<button id="remove-stock" type="button">\u79FB\u9664\u9019\u6A94\u8CC7\u6599</button>');
      document.body.insertAdjacentHTML("beforeend", '<dialog id="remove-dialog"><form method="dialog" class="dialog-head"><h2>\u79FB\u9664\u80A1\u7968\u8CC7\u6599</h2><button aria-label="\u95DC\u9589">\u2715</button></form><p id="remove-detail"></p><p>\u53EA\u79FB\u9664\u6B64\u88DD\u7F6E\u7684\u884C\u60C5\u8207\u81EA\u9078\uFF1BToken \u548C\u6301\u80A1\u8A2D\u5B9A\u4FDD\u7559\u3002\u9700\u8981\u5099\u4EFD\u6642\u8ACB\u5148\u532F\u51FA JSON\u3002</p><div class="actions"><button id="confirm-remove-stock" type="button">\u78BA\u8A8D\u79FB\u9664</button><button id="cancel-remove-stock" type="button">\u53D6\u6D88</button></div></dialog>');
      $ = (id) => {
        const el2 = document.getElementById(id);
        if (!el2) throw Error(`\u9801\u9762\u7F3A\u5C11 ${id}\uFF0C\u8ACB\u4F7F\u7528\u5B8C\u6574\u7684 v1.0.2 \u8CC7\u6599\u593E\u3002`);
        return el2;
      };
      esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      fmt = (v, d = 2) => isNum(v) ? v.toLocaleString("zh-TW", { minimumFractionDigits: d, maximumFractionDigits: d }) : "\u2014";
      pct = (v) => isNum(v) ? `${(v * 100).toFixed(2)}%` : "\u2014";
      sign = (v) => isNum(v) ? v > 0 ? "positive" : v < 0 ? "negative" : "" : "";
      mobile = window.StocklabMobile;
      ind = "macd";
      page = "overview";
      local = false;
      results = null;
      dcfResult = null;
      readLocal = (k, f) => {
        if (mobile) return mobile.readLocal(k, f);
        try {
          return JSON.parse(localStorage.getItem(k)) ?? f;
        } catch {
          return f;
        }
      };
      writeLocal = (k, v) => {
        if (mobile) return mobile.writeLocal(k, v);
        try {
          localStorage.setItem(k, JSON.stringify(v));
        } catch {
          showError("\u700F\u89BD\u5668\u7981\u6B62\u672C\u6A5F\u5132\u5B58\uFF1B\u672C\u6B21\u8A2D\u5B9A\u4ECD\u53EF\u4F7F\u7528\u3002");
        }
      };
      watch = readLocal("twlab.watch", []);
      positions = readLocal("twlab.positions", {});
      if (!Array.isArray(watch)) watch = [];
      if (!positions || typeof positions !== "object" || Array.isArray(positions)) positions = {};
      selected = () => bundle.stocks.find((s) => s.id === stockId);
       window.StocklabABBridge = { getBundle: () => bundle, getSelected: () => selected() };
      mode = () => bundle.mode === "demo" ? "\u6A21\u64EC\u8CC7\u6599" : "\u532F\u5165\u8CC7\u6599";
      metric = (label, value, small = "", cls = "") => `<div class="metric"><div class="metric-label">${esc(label)}</div><div class="metric-value ${cls}">${value}</div><small>${esc(small)}</small></div>`;
      download = (name, content, type = "application/json") => {
        if (mobile) {
          mobile.download(name, content, type).catch(showError);
          return;
        }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
      };
      csv = (name, heads, rows) => download(name, "\uFEFF" + [heads, ...rows].map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n"), "text/csv;charset=utf-8");
      document.querySelectorAll("nav button").forEach((b) => b.onclick = () => go(b.dataset.page));
      $("stock").onchange = () => {
        stockId = $("stock").value;
        dcfResult = null;
        $("dcf-result").innerHTML = "";
        $("fcf").value = "";
        $("shares").value = "";
        render();
      };
      $("watch-toggle").onclick = async () => {
        if (!selected()) return;
        const id = stockId, wasSelected = watch.includes(id);
        watch = wasSelected ? watch.filter((x) => x !== id) : [...watch, id];
        renderWatch();
        $("action-status").textContent = `${id} \u5DF2${wasSelected ? "\u79FB\u51FA" : "\u52A0\u5165"}\u81EA\u9078\u6E05\u55AE\u3002`;
        try {
          await writeLocal("twlab.watch", watch);
        } catch {
          showError("\u81EA\u9078\u72C0\u614B\u5DF2\u5728\u672C\u6B21\u756B\u9762\u66F4\u65B0\uFF0C\u4F46\u4FDD\u5B58\u5931\u6557\uFF1B\u8ACB\u6AA2\u67E5\u88DD\u7F6E\u7A7A\u9593\u3002");
        }
      };
      $("watchlist").onclick = (e) => {
        const b = e.target.closest("[data-stock]");
        if (b) {
          stockId = b.dataset.stock;
          dcfResult = null;
          $("dcf-result").innerHTML = "";
          $("fcf").value = "";
          $("shares").value = "";
          render();
        }
      };
      removalTarget = null;
      $("remove-stock").onclick = () => {
        if (!selected()) return;
        removalTarget = stockId;
        $("remove-detail").textContent = `\u8981\u79FB\u9664 ${stockId} ${selected().name || ""} \u7684\u5DF2\u8F09\u5165\u884C\u60C5\u55CE\uFF1F\u79FB\u9664\u6700\u5F8C\u4E00\u6A94\u5F8C\u6703\u986F\u793A\u7A7A\u767D\u8CC7\u6599\u72C0\u614B\u3002`;
        $("remove-dialog").showModal();
      };
      $("cancel-remove-stock").onclick = () => $("remove-dialog").close();
      $("confirm-remove-stock").onclick = async () => {
        const button = $("confirm-remove-stock");
        button.disabled = true;
        try {
          if (!removalTarget || !bundle.stocks.some((s) => s.id === removalTarget)) return;
          const id = removalTarget, next = { ...bundle, stocks: bundle.stocks.filter((s) => s.id !== id) };
          if (!next.stocks.length) next.mode = "real";
          validate(next, { allowEmpty: true });
          if (mobile && bundle.mode === "real") await mobile.bundleChanged(next);
          watch = watch.filter((x) => x !== id);
          setBundle(next, { persist: false });
          $("remove-dialog").close();
          $("action-status").textContent = `\u5DF2\u79FB\u9664 ${id} \u7684\u884C\u60C5\u8CC7\u6599\uFF1BToken \u548C\u6301\u80A1\u8A2D\u5B9A\u4FDD\u7559\u3002`;
          try {
            await writeLocal("twlab.watch", watch);
          } catch {
            showError("\u884C\u60C5\u5DF2\u79FB\u9664\uFF0C\u4F46\u81EA\u9078\u8A2D\u5B9A\u672A\u80FD\u4FDD\u5B58\u3002");
          }
        } catch (e) {
          $("remove-dialog").close();
          showError(`\u79FB\u9664\u5931\u6557\uFF0C\u539F\u8CC7\u6599\u4ECD\u4FDD\u7559\u3002${e.message}`);
        } finally {
          button.disabled = false;
          removalTarget = null;
        }
      };
      document.querySelectorAll("[data-ind]").forEach((b) => b.onclick = () => {
        ind = b.dataset.ind;
        document.querySelectorAll("[data-ind]").forEach((x) => x.classList.toggle("selected", x === b));
        renderIndicator();
      });
      $("strategy-form").onsubmit = (e) => {
        e.preventDefault();
        try {
          run();
        } catch (err) {
          showError(err);
        }
      };
      for (const id of ["flow-window", "flow-investor"]) $(id).onchange = renderFlows;
      for (const el2 of $("strategy-form").querySelectorAll("input")) el2.addEventListener("input", () => {
        if (results) {
          results = null;
          $("strategy-output").innerHTML = '<div class="panel empty">\u53C3\u6578\u5DF2\u8B8A\u66F4\uFF0C\u8ACB\u91CD\u65B0\u57F7\u884C\u56DE\u6E2C\u3002</div>';
        }
      });
      for (const el2 of $("dcf-form").querySelectorAll("input")) el2.addEventListener("input", () => {
        dcfResult = null;
        $("dcf-result").innerHTML = "";
      });
      $("dcf-form").onsubmit = (e) => {
        e.preventDefault();
        clearError();
        try {
          const a = { fcf: Number($("fcf").value), growth: Number($("growth").value) / 100, wacc: Number($("wacc").value) / 100, terminal: Number($("terminal").value) / 100, net_debt: Number($("net-debt").value), shares: Number($("shares").value) };
          dcfResult = dcf(a);
          const scenarios = [-0.02, -0.01, 0, 0.01, 0.02].map((delta) => {
            let rate = a.wacc + delta;
            return [`${pct(rate)}`, rate > a.terminal ? fmt(dcf({ ...a, wacc: rate }).price) : "\u4E0D\u9069\u7528"];
          });
          $("dcf-result").innerHTML = `<div class="metrics dcf-metrics">${metric("\u60C5\u5883\u6BCF\u80A1\u4F30\u503C", fmt(dcfResult.price), "\u5143 / \u8ACB\u6838\u5C0D\u80A1\u6578\u8207 FCFF")}${metric("\u4F01\u696D\u50F9\u503C", fmt(dcfResult.enterprise_value, 0), "\u65B0\u81FA\u5E63\u767E\u842C\u5143")}${metric("\u7D42\u503C\u6298\u73FE\u5360\u6BD4", pct(dcfResult.terminal_pv / dcfResult.enterprise_value), "\u5C0D\u9577\u671F\u5047\u8A2D\u7684\u654F\u611F\u7A0B\u5EA6")}${metric("\u76EE\u524D\u8F09\u5165\u80A1\u50F9", fmt(selected().bars.at(-1).close), mode())}</div><h3>\u6298\u73FE\u7387\u654F\u611F\u5EA6\uFF08\u5176\u4ED6\u5047\u8A2D\u56FA\u5B9A\uFF09</h3>${table(["WACC", "\u60C5\u5883\u6BCF\u80A1\u4F30\u503C\uFF08\u5143\uFF09"], scenarios)}<p class="caption">FCFF \u4F30\u503C\u9069\u7528\u65BC\u53EF\u5408\u7406\u4F30\u8A08\u4F01\u696D\u81EA\u7531\u73FE\u91D1\u6D41\u7684\u516C\u53F8\u3002\u91D1\u878D\u696D\u901A\u5E38\u9700\u63A1\u7528\u5176\u4ED6\u4F30\u503C\u65B9\u6CD5\u3002\u9019\u4E9B\u6578\u5B57\u4F86\u81EA\u4F60\u586B\u5BEB\u7684\u5047\u8A2D\u3002</p>`;
        } catch (err) {
          showError(err);
        }
      };
      $("open-data").onclick = () => $("data-dialog").showModal();
      $("load-demo").onclick = () => {
        try {
          loadDemo();
          $("data-dialog").close();
        } catch (e) {
          showError(e);
        }
      };
      $("import-file").onchange = async (e) => {
        try {
          let file = e.target.files[0];
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) throw Error("\u8CC7\u6599\u6A94\u4E0A\u9650 20 MB\u3002");
          setBundle(JSON.parse(await file.text()));
        } catch (err) {
          showError(err);
        } finally {
          e.target.value = "";
        }
      };
      $("export-data").onclick = () => download(`stocklab_${bundle.mode === "demo" ? "DEMO" : "market"}.json`, JSON.stringify(bundle, null, 2));
      $("download-report-data").onclick = () => download(`${stockId}_report_input.json`, JSON.stringify(reportPayload(), null, 2));
      $("print-report").onclick = () => {
        go("report");
        window.print();
      };
      $("xlsx").onclick = () => exportOffice("xlsx");
      $("pptx").onclick = () => exportOffice("pptx");
      $("edit-position").onclick = () => {
        let p = positions[stockId] || { shares: 0, cost: 0 };
        $("position-name").textContent = stockId + " " + selected().name;
        $("position-shares").value = p.shares;
        $("position-cost").value = p.cost;
        $("position-dialog").showModal();
      };
      $("position-form").onsubmit = (e) => {
        e.preventDefault();
        let shares = Number($("position-shares").value), cost = Number($("position-cost").value);
        if (!Number.isInteger(shares) || shares < 0 || !isNum(cost) || cost < 0) return;
        shares ? positions[stockId] = { shares, cost } : delete positions[stockId];
        writeLocal("twlab.positions", positions);
        $("position-dialog").close();
        renderPortfolio();
      };
      $("fetch-end").value = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      $("fetch-form").onsubmit = async (e) => {
        e.preventDefault();
        let btn = $("fetch-button"), query = { ids: $("fetch-ids").value.split(/[,，\s]+/).filter(Boolean), start: $("fetch-start").value, end: $("fetch-end").value, token: $("token").value.trim() }, requested = query.ids[0] || "\u6B64\u80A1\u7968";
        btn.disabled = true;
        btn.textContent = "\u6293\u53D6\u4E2D\uFF0C\u6BCF\u6A94\u53EF\u80FD\u9700\u8981\u6578\u5341\u79D2\u2026";
        showLoadState(requested);
        $("data-dialog").close();
        try {
          let d;
          if (mobile) {
            d = await mobile.fetchMarket(query);
          } else {
            const r = await fetch("/api/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
            d = await r.json();
            if (!r.ok) throw Error(d.error || "\u8CC7\u6599\u6293\u53D6\u5931\u6557");
          }
          setBundle(d);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          showLoadState(requested, true, message);
          showError(message);
        } finally {
          btn.disabled = false;
          btn.textContent = "\u6293\u53D6\u4E26\u8F09\u5165";
        }
      };
      $("retry-query").onclick = () => {
        $("data-dialog").showModal();
        $("fetch-ids").focus();
      };
      $("change-stock").onclick = () => {
        $("data-dialog").showModal();
        $("fetch-ids").focus();
        $("fetch-ids").select();
      };
      $("return-demo").onclick = () => {
        loadDemo();
        clearError();
      };
      $("return-existing").onclick = () => {
        if (bundle?.stocks.length) {
          clearLoadState();
          clearError();
          render();
          $("action-status").textContent = "\u76EE\u524D\u986F\u793A\u4E0A\u6B21\u5DF2\u8F09\u5165\u8CC7\u6599\uFF0C\u4E0D\u662F\u525B\u624D\u5931\u6557\u67E5\u8A62\u7684\u7D50\u679C\u3002";
        }
      };
      extension = mobile?.setupExtra?.({ getBundle: () => bundle, selected, selectStock: (id) => {
        if (!bundle.stocks.some((s) => s.id === id)) return;
        stockId = id;
        dcfResult = null;
        $("dcf-result").innerHTML = "";
        $("fcf").value = "";
        $("shares").value = "";
        render();
      }, go, esc, fmt, pct, isNum, metric, table, csv });
      init();
    }
  });

  // mobile/legacy/capacitor-runtime.js
  (() => {
    var __defProp = Object.defineProperty;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __esm2 = (fn, res, err) => function __init() {
      if (err) throw err[0];
      try {
        return fn && (res = (0, fn[__getOwnPropNames2(fn)[0]])(fn = 0)), res;
      } catch (e) {
        throw err = [e], e;
      }
    };
    var __export = (target, all) => {
      for (var name in all)
        __defProp(target, name, { get: all[name], enumerable: true });
    };
    var ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor2, registerPlugin2, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp2, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
    var init_dist = __esm2({
      "node_modules/@capacitor/core/dist/index.js"() {
        (function(ExceptionCode2) {
          ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
          ExceptionCode2["Unavailable"] = "UNAVAILABLE";
        })(ExceptionCode || (ExceptionCode = {}));
        CapacitorException = class extends Error {
          constructor(message, code, data) {
            super(message);
            this.message = message;
            this.code = code;
            this.data = data;
          }
        };
        getPlatformId = (win) => {
          var _a, _b;
          if (win === null || win === void 0 ? void 0 : win.androidBridge) {
            return "android";
          } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
            return "ios";
          } else {
            return "web";
          }
        };
        createCapacitor = (win) => {
          const capCustomPlatform = win.CapacitorCustomPlatform || null;
          const cap = win.Capacitor || {};
          const Plugins = cap.Plugins = cap.Plugins || {};
          const getPlatform = () => {
            return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
          };
          const isNativePlatform = () => getPlatform() !== "web";
          const isPluginAvailable = (pluginName) => {
            const plugin = registeredPlugins.get(pluginName);
            if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
              return true;
            }
            if (getPluginHeader(pluginName)) {
              return true;
            }
            return false;
          };
          const getPluginHeader = (pluginName) => {
            var _a;
            return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
          };
          const handleError = (err) => win.console.error(err);
          const registeredPlugins = /* @__PURE__ */ new Map();
          const registerPlugin22 = (pluginName, jsImplementations = {}) => {
            const registeredPlugin = registeredPlugins.get(pluginName);
            if (registeredPlugin) {
              console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
              return registeredPlugin.proxy;
            }
            const platform = getPlatform();
            const pluginHeader = getPluginHeader(pluginName);
            let jsImplementation;
            const loadPluginImplementation = async () => {
              if (!jsImplementation && platform in jsImplementations) {
                jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
              } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
                jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
              }
              return jsImplementation;
            };
            const createPluginMethod = (impl, prop) => {
              var _a, _b;
              if (pluginHeader) {
                const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
                if (methodHeader) {
                  if (methodHeader.rtype === "promise") {
                    return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                  } else {
                    return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                  }
                } else if (impl) {
                  return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
                }
              } else if (impl) {
                return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
              } else {
                throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
              }
            };
            const createPluginMethodWrapper = (prop) => {
              let remove;
              const wrapper = (...args) => {
                const p = loadPluginImplementation().then((impl) => {
                  const fn = createPluginMethod(impl, prop);
                  if (fn) {
                    const p2 = fn(...args);
                    remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                    return p2;
                  } else {
                    throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                  }
                });
                if (prop === "addListener") {
                  p.remove = async () => remove();
                }
                return p;
              };
              wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
              Object.defineProperty(wrapper, "name", {
                value: prop,
                writable: false,
                configurable: false
              });
              return wrapper;
            };
            const addListener = createPluginMethodWrapper("addListener");
            const removeListener = createPluginMethodWrapper("removeListener");
            const addListenerNative = (eventName, callback) => {
              const call = addListener({ eventName }, callback);
              const remove = async () => {
                const callbackId = await call;
                removeListener({
                  eventName,
                  callbackId
                }, callback);
              };
              const p = new Promise((resolve2) => call.then(() => resolve2({ remove })));
              p.remove = async () => {
                console.warn(`Using addListener() without 'await' is deprecated.`);
                await remove();
              };
              return p;
            };
            const proxy = new Proxy({}, {
              get(_, prop) {
                switch (prop) {
                  // https://github.com/facebook/react/issues/20030
                  case "$$typeof":
                    return void 0;
                  case "toJSON":
                    return () => ({});
                  case "addListener":
                    return pluginHeader ? addListenerNative : addListener;
                  case "removeListener":
                    return removeListener;
                  default:
                    return createPluginMethodWrapper(prop);
                }
              }
            });
            Plugins[pluginName] = proxy;
            registeredPlugins.set(pluginName, {
              name: pluginName,
              proxy,
              platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
            });
            return proxy;
          };
          if (!cap.convertFileSrc) {
            cap.convertFileSrc = (filePath) => filePath;
          }
          cap.getPlatform = getPlatform;
          cap.handleError = handleError;
          cap.isNativePlatform = isNativePlatform;
          cap.isPluginAvailable = isPluginAvailable;
          cap.registerPlugin = registerPlugin22;
          cap.Exception = CapacitorException;
          cap.DEBUG = !!cap.DEBUG;
          cap.isLoggingEnabled = !!cap.isLoggingEnabled;
          return cap;
        };
        initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
        Capacitor2 = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
        registerPlugin2 = Capacitor2.registerPlugin;
        WebPlugin = class {
          constructor() {
            this.listeners = {};
            this.retainedEventArguments = {};
            this.windowListeners = {};
          }
          addListener(eventName, listenerFunc) {
            let firstListener = false;
            const listeners = this.listeners[eventName];
            if (!listeners) {
              this.listeners[eventName] = [];
              firstListener = true;
            }
            this.listeners[eventName].push(listenerFunc);
            const windowListener = this.windowListeners[eventName];
            if (windowListener && !windowListener.registered) {
              this.addWindowListener(windowListener);
            }
            if (firstListener) {
              this.sendRetainedArgumentsForEvent(eventName);
            }
            const remove = async () => this.removeListener(eventName, listenerFunc);
            const p = Promise.resolve({ remove });
            return p;
          }
          async removeAllListeners() {
            this.listeners = {};
            for (const listener in this.windowListeners) {
              this.removeWindowListener(this.windowListeners[listener]);
            }
            this.windowListeners = {};
          }
          notifyListeners(eventName, data, retainUntilConsumed) {
            const listeners = this.listeners[eventName];
            if (!listeners) {
              if (retainUntilConsumed) {
                let args = this.retainedEventArguments[eventName];
                if (!args) {
                  args = [];
                }
                args.push(data);
                this.retainedEventArguments[eventName] = args;
              }
              return;
            }
            listeners.forEach((listener) => listener(data));
          }
          hasListeners(eventName) {
            var _a;
            return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
          }
          registerWindowListener(windowEventName, pluginEventName) {
            this.windowListeners[pluginEventName] = {
              registered: false,
              windowEventName,
              pluginEventName,
              handler: (event) => {
                this.notifyListeners(pluginEventName, event);
              }
            };
          }
          unimplemented(msg = "not implemented") {
            return new Capacitor2.Exception(msg, ExceptionCode.Unimplemented);
          }
          unavailable(msg = "not available") {
            return new Capacitor2.Exception(msg, ExceptionCode.Unavailable);
          }
          async removeListener(eventName, listenerFunc) {
            const listeners = this.listeners[eventName];
            if (!listeners) {
              return;
            }
            const index = listeners.indexOf(listenerFunc);
            if (index !== -1) {
              this.listeners[eventName].splice(index, 1);
            }
            if (!this.listeners[eventName].length) {
              this.removeWindowListener(this.windowListeners[eventName]);
            }
          }
          addWindowListener(handle) {
            window.addEventListener(handle.windowEventName, handle.handler);
            handle.registered = true;
          }
          removeWindowListener(handle) {
            if (!handle) {
              return;
            }
            window.removeEventListener(handle.windowEventName, handle.handler);
            handle.registered = false;
          }
          sendRetainedArgumentsForEvent(eventName) {
            const args = this.retainedEventArguments[eventName];
            if (!args) {
              return;
            }
            delete this.retainedEventArguments[eventName];
            args.forEach((arg) => {
              this.notifyListeners(eventName, arg);
            });
          }
        };
        encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
        decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
        CapacitorCookiesPluginWeb = class extends WebPlugin {
          async getCookies() {
            const cookies = document.cookie;
            const cookieMap = {};
            cookies.split(";").forEach((cookie) => {
              if (cookie.length <= 0)
                return;
              let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
              key = decode(key).trim();
              value = decode(value).trim();
              cookieMap[key] = value;
            });
            return cookieMap;
          }
          async setCookie(options) {
            try {
              const encodedKey = encode(options.key);
              const encodedValue = encode(options.value);
              const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
              const path = (options.path || "/").replace("path=", "");
              const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
              document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
            } catch (error2) {
              return Promise.reject(error2);
            }
          }
          async deleteCookie(options) {
            try {
              document.cookie = `${options.key}=; Max-Age=0`;
            } catch (error2) {
              return Promise.reject(error2);
            }
          }
          async clearCookies() {
            try {
              const cookies = document.cookie.split(";") || [];
              for (const cookie of cookies) {
                document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
              }
            } catch (error2) {
              return Promise.reject(error2);
            }
          }
          async clearAllCookies() {
            try {
              await this.clearCookies();
            } catch (error2) {
              return Promise.reject(error2);
            }
          }
        };
        CapacitorCookies = registerPlugin2("CapacitorCookies", {
          web: () => new CapacitorCookiesPluginWeb()
        });
        readBlobAsBase64 = async (blob) => new Promise((resolve2, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64String = reader.result;
            resolve2(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
          };
          reader.onerror = (error2) => reject(error2);
          reader.readAsDataURL(blob);
        });
        normalizeHttpHeaders = (headers = {}) => {
          const originalKeys = Object.keys(headers);
          const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
          const normalized = loweredKeys.reduce((acc, key, index) => {
            acc[key] = headers[originalKeys[index]];
            return acc;
          }, {});
          return normalized;
        };
        buildUrlParams = (params2, shouldEncode = true) => {
          if (!params2)
            return null;
          const output = Object.entries(params2).reduce((accumulator, entry) => {
            const [key, value] = entry;
            let encodedValue;
            let item;
            if (Array.isArray(value)) {
              item = "";
              value.forEach((str) => {
                encodedValue = shouldEncode ? encodeURIComponent(str) : str;
                item += `${key}=${encodedValue}&`;
              });
              item.slice(0, -1);
            } else {
              encodedValue = shouldEncode ? encodeURIComponent(value) : value;
              item = `${key}=${encodedValue}`;
            }
            return `${accumulator}&${item}`;
          }, "");
          return output.substr(1);
        };
        buildRequestInit = (options, extra = {}) => {
          const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
          const headers = normalizeHttpHeaders(options.headers);
          const type = headers["content-type"] || "";
          if (typeof options.data === "string") {
            output.body = options.data;
          } else if (type.includes("application/x-www-form-urlencoded")) {
            const params2 = new URLSearchParams();
            for (const [key, value] of Object.entries(options.data || {})) {
              params2.set(key, value);
            }
            output.body = params2.toString();
          } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
            const form = new FormData();
            if (options.data instanceof FormData) {
              options.data.forEach((value, key) => {
                form.append(key, value);
              });
            } else {
              for (const key of Object.keys(options.data)) {
                form.append(key, options.data[key]);
              }
            }
            output.body = form;
            const headers2 = new Headers(output.headers);
            headers2.delete("content-type");
            output.headers = headers2;
          } else if (type.includes("application/json") || typeof options.data === "object") {
            output.body = JSON.stringify(options.data);
          }
          return output;
        };
        CapacitorHttpPluginWeb = class extends WebPlugin {
          /**
           * Perform an Http request given a set of options
           * @param options Options to build the HTTP request
           */
          async request(options) {
            const requestInit = buildRequestInit(options, options.webFetchExtra);
            const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
            const url = urlParams ? `${options.url}?${urlParams}` : options.url;
            const response = await fetch(url, requestInit);
            const contentType = response.headers.get("content-type") || "";
            let { responseType = "text" } = response.ok ? options : {};
            if (contentType.includes("application/json")) {
              responseType = "json";
            }
            let data;
            let blob;
            switch (responseType) {
              case "arraybuffer":
              case "blob":
                blob = await response.blob();
                data = await readBlobAsBase64(blob);
                break;
              case "json":
                data = await response.json();
                break;
              case "document":
              case "text":
              default:
                data = await response.text();
            }
            const headers = {};
            response.headers.forEach((value, key) => {
              headers[key] = value;
            });
            return {
              data,
              headers,
              status: response.status,
              url: response.url
            };
          }
          /**
           * Perform an Http GET request given a set of options
           * @param options Options to build the HTTP request
           */
          async get(options) {
            return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
          }
          /**
           * Perform an Http POST request given a set of options
           * @param options Options to build the HTTP request
           */
          async post(options) {
            return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
          }
          /**
           * Perform an Http PUT request given a set of options
           * @param options Options to build the HTTP request
           */
          async put(options) {
            return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
          }
          /**
           * Perform an Http PATCH request given a set of options
           * @param options Options to build the HTTP request
           */
          async patch(options) {
            return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
          }
          /**
           * Perform an Http DELETE request given a set of options
           * @param options Options to build the HTTP request
           */
          async delete(options) {
            return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
          }
        };
        CapacitorHttp2 = registerPlugin2("CapacitorHttp", {
          web: () => new CapacitorHttpPluginWeb()
        });
        (function(SystemBarsStyle2) {
          SystemBarsStyle2["Dark"] = "DARK";
          SystemBarsStyle2["Light"] = "LIGHT";
          SystemBarsStyle2["Default"] = "DEFAULT";
        })(SystemBarsStyle || (SystemBarsStyle = {}));
        (function(SystemBarType2) {
          SystemBarType2["StatusBar"] = "StatusBar";
          SystemBarType2["NavigationBar"] = "NavigationBar";
        })(SystemBarType || (SystemBarType = {}));
        SystemBarsPluginWeb = class extends WebPlugin {
          async setStyle() {
            this.unavailable("not available for web");
          }
          async setAnimation() {
            this.unavailable("not available for web");
          }
          async show() {
            this.unavailable("not available for web");
          }
          async hide() {
            this.unavailable("not available for web");
          }
        };
        SystemBars = registerPlugin2("SystemBars", {
          web: () => new SystemBarsPluginWeb()
        });
      }
    });
    var Directory2, Encoding2;
    var init_definitions = __esm2({
      "node_modules/@capacitor/filesystem/dist/esm/definitions.js"() {
        (function(Directory22) {
          Directory22["Documents"] = "DOCUMENTS";
          Directory22["Data"] = "DATA";
          Directory22["Library"] = "LIBRARY";
          Directory22["Cache"] = "CACHE";
          Directory22["External"] = "EXTERNAL";
          Directory22["ExternalStorage"] = "EXTERNAL_STORAGE";
          Directory22["ExternalCache"] = "EXTERNAL_CACHE";
          Directory22["LibraryNoCloud"] = "LIBRARY_NO_CLOUD";
          Directory22["Temporary"] = "TEMPORARY";
        })(Directory2 || (Directory2 = {}));
        (function(Encoding22) {
          Encoding22["UTF8"] = "utf8";
          Encoding22["ASCII"] = "ascii";
          Encoding22["UTF16"] = "utf16";
        })(Encoding2 || (Encoding2 = {}));
      }
    });
    var web_exports = {};
    __export(web_exports, {
      FilesystemWeb: () => FilesystemWeb
    });
    function resolve(path) {
      const posix = path.split("/").filter((item) => item !== ".");
      const newPosix = [];
      posix.forEach((item) => {
        if (item === ".." && newPosix.length > 0 && newPosix[newPosix.length - 1] !== "..") {
          newPosix.pop();
        } else {
          newPosix.push(item);
        }
      });
      return newPosix.join("/");
    }
    function isPathParent(parent, children) {
      parent = resolve(parent);
      children = resolve(children);
      const pathsA = parent.split("/");
      const pathsB = children.split("/");
      return parent !== children && pathsA.every((value, index) => value === pathsB[index]);
    }
    var FilesystemWeb;
    var init_web = __esm2({
      "node_modules/@capacitor/filesystem/dist/esm/web.js"() {
        init_dist();
        init_definitions();
        FilesystemWeb = class _FilesystemWeb extends WebPlugin {
          constructor() {
            super(...arguments);
            this.DB_VERSION = 1;
            this.DB_NAME = "Disc";
            this._writeCmds = ["add", "put", "delete"];
            this.downloadFile = async (options) => {
              var _a, _b;
              const requestInit = buildRequestInit(options, options.webFetchExtra);
              const response = await fetch(options.url, requestInit);
              let blob;
              if (!options.progress)
                blob = await response.blob();
              else if (!(response === null || response === void 0 ? void 0 : response.body))
                blob = new Blob();
              else {
                const reader = response.body.getReader();
                let bytes = 0;
                const chunks = [];
                const contentType = response.headers.get("content-type");
                const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
                while (true) {
                  const { done, value } = await reader.read();
                  if (done)
                    break;
                  chunks.push(value);
                  bytes += (value === null || value === void 0 ? void 0 : value.length) || 0;
                  const status2 = {
                    url: options.url,
                    bytes,
                    contentLength
                  };
                  this.notifyListeners("progress", status2);
                }
                const allChunks = new Uint8Array(bytes);
                let position = 0;
                for (const chunk of chunks) {
                  if (typeof chunk === "undefined")
                    continue;
                  allChunks.set(chunk, position);
                  position += chunk.length;
                }
                blob = new Blob([allChunks.buffer], { type: contentType || void 0 });
              }
              const result = await this.writeFile({
                path: options.path,
                directory: (_a = options.directory) !== null && _a !== void 0 ? _a : void 0,
                recursive: (_b = options.recursive) !== null && _b !== void 0 ? _b : false,
                data: blob
              });
              return { path: result.uri, blob };
            };
          }
          readFileInChunks(_options, _callback) {
            throw this.unavailable("Method not implemented.");
          }
          async initDb() {
            if (this._db !== void 0) {
              return this._db;
            }
            if (!("indexedDB" in window)) {
              throw this.unavailable("This browser doesn't support IndexedDB");
            }
            return new Promise((resolve2, reject) => {
              const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
              request.onupgradeneeded = _FilesystemWeb.doUpgrade;
              request.onsuccess = () => {
                this._db = request.result;
                resolve2(request.result);
              };
              request.onerror = () => reject(request.error);
              request.onblocked = () => {
                console.warn("db blocked");
              };
            });
          }
          static doUpgrade(event) {
            const eventTarget = event.target;
            const db = eventTarget.result;
            switch (event.oldVersion) {
              case 0:
              case 1:
              default: {
                if (db.objectStoreNames.contains("FileStorage")) {
                  db.deleteObjectStore("FileStorage");
                }
                const store = db.createObjectStore("FileStorage", { keyPath: "path" });
                store.createIndex("by_folder", "folder");
              }
            }
          }
          async dbRequest(cmd, args) {
            const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
            return this.initDb().then((conn) => {
              return new Promise((resolve2, reject) => {
                const tx = conn.transaction(["FileStorage"], readFlag);
                const store = tx.objectStore("FileStorage");
                const req = store[cmd](...args);
                req.onsuccess = () => resolve2(req.result);
                req.onerror = () => reject(req.error);
              });
            });
          }
          async dbIndexRequest(indexName, cmd, args) {
            const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
            return this.initDb().then((conn) => {
              return new Promise((resolve2, reject) => {
                const tx = conn.transaction(["FileStorage"], readFlag);
                const store = tx.objectStore("FileStorage");
                const index = store.index(indexName);
                const req = index[cmd](...args);
                req.onsuccess = () => resolve2(req.result);
                req.onerror = () => reject(req.error);
              });
            });
          }
          getPath(directory, uriPath) {
            const cleanedUriPath = uriPath !== void 0 ? uriPath.replace(/^[/]+|[/]+$/g, "") : "";
            let fsPath = "";
            if (directory !== void 0)
              fsPath += "/" + directory;
            if (uriPath !== "")
              fsPath += "/" + cleanedUriPath;
            return fsPath;
          }
          async clear() {
            const conn = await this.initDb();
            const tx = conn.transaction(["FileStorage"], "readwrite");
            const store = tx.objectStore("FileStorage");
            store.clear();
          }
          /**
           * Read a file from disk
           * @param options options for the file read
           * @return a promise that resolves with the read file data result
           */
          async readFile(options) {
            const path = this.getPath(options.directory, options.path);
            const entry = await this.dbRequest("get", [path]);
            if (entry === void 0)
              throw Error("File does not exist.");
            return { data: entry.content ? entry.content : "" };
          }
          /**
           * Write a file to disk in the specified location on device
           * @param options options for the file write
           * @return a promise that resolves with the file write result
           */
          async writeFile(options) {
            const path = this.getPath(options.directory, options.path);
            let data = options.data;
            const encoding = options.encoding;
            const doRecursive = options.recursive;
            const occupiedEntry = await this.dbRequest("get", [path]);
            if (occupiedEntry && occupiedEntry.type === "directory")
              throw Error("The supplied path is a directory.");
            const parentPath = path.substr(0, path.lastIndexOf("/"));
            const parentEntry = await this.dbRequest("get", [parentPath]);
            if (parentEntry === void 0) {
              const subDirIndex = parentPath.indexOf("/", 1);
              if (subDirIndex !== -1) {
                const parentArgPath = parentPath.substr(subDirIndex);
                await this.mkdir({
                  path: parentArgPath,
                  directory: options.directory,
                  recursive: doRecursive
                });
              }
            }
            if (!encoding && !(data instanceof Blob)) {
              data = data.indexOf(",") >= 0 ? data.split(",")[1] : data;
              if (!this.isBase64String(data))
                throw Error("The supplied data is not valid base64 content.");
            }
            const now = Date.now();
            const pathObj = {
              path,
              folder: parentPath,
              type: "file",
              size: data instanceof Blob ? data.size : data.length,
              ctime: now,
              mtime: now,
              content: data
            };
            await this.dbRequest("put", [pathObj]);
            return {
              uri: pathObj.path
            };
          }
          /**
           * Append to a file on disk in the specified location on device
           * @param options options for the file append
           * @return a promise that resolves with the file write result
           */
          async appendFile(options) {
            const path = this.getPath(options.directory, options.path);
            let data = options.data;
            const encoding = options.encoding;
            const parentPath = path.substr(0, path.lastIndexOf("/"));
            const now = Date.now();
            let ctime = now;
            const occupiedEntry = await this.dbRequest("get", [path]);
            if (occupiedEntry && occupiedEntry.type === "directory")
              throw Error("The supplied path is a directory.");
            const parentEntry = await this.dbRequest("get", [parentPath]);
            if (parentEntry === void 0) {
              const subDirIndex = parentPath.indexOf("/", 1);
              if (subDirIndex !== -1) {
                const parentArgPath = parentPath.substr(subDirIndex);
                await this.mkdir({
                  path: parentArgPath,
                  directory: options.directory,
                  recursive: true
                });
              }
            }
            if (!encoding && !this.isBase64String(data))
              throw Error("The supplied data is not valid base64 content.");
            if (occupiedEntry !== void 0) {
              if (occupiedEntry.content instanceof Blob) {
                throw Error("The occupied entry contains a Blob object which cannot be appended to.");
              }
              if (occupiedEntry.content !== void 0 && !encoding) {
                data = btoa(atob(occupiedEntry.content) + atob(data));
              } else {
                data = occupiedEntry.content + data;
              }
              ctime = occupiedEntry.ctime;
            }
            const pathObj = {
              path,
              folder: parentPath,
              type: "file",
              size: data.length,
              ctime,
              mtime: now,
              content: data
            };
            await this.dbRequest("put", [pathObj]);
          }
          /**
           * Delete a file from disk
           * @param options options for the file delete
           * @return a promise that resolves with the deleted file data result
           */
          async deleteFile(options) {
            const path = this.getPath(options.directory, options.path);
            const entry = await this.dbRequest("get", [path]);
            if (entry === void 0)
              throw Error("File does not exist.");
            const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
            if (entries.length !== 0)
              throw Error("Folder is not empty.");
            await this.dbRequest("delete", [path]);
          }
          /**
           * Create a directory.
           * @param options options for the mkdir
           * @return a promise that resolves with the mkdir result
           */
          async mkdir(options) {
            const path = this.getPath(options.directory, options.path);
            const doRecursive = options.recursive;
            const parentPath = path.substr(0, path.lastIndexOf("/"));
            const depth = (path.match(/\//g) || []).length;
            const parentEntry = await this.dbRequest("get", [parentPath]);
            const occupiedEntry = await this.dbRequest("get", [path]);
            if (depth === 1)
              throw Error("Cannot create Root directory");
            if (occupiedEntry !== void 0)
              throw Error("Current directory does already exist.");
            if (!doRecursive && depth !== 2 && parentEntry === void 0)
              throw Error("Parent directory must exist");
            if (doRecursive && depth !== 2 && parentEntry === void 0) {
              const parentArgPath = parentPath.substr(parentPath.indexOf("/", 1));
              await this.mkdir({
                path: parentArgPath,
                directory: options.directory,
                recursive: doRecursive
              });
            }
            const now = Date.now();
            const pathObj = {
              path,
              folder: parentPath,
              type: "directory",
              size: 0,
              ctime: now,
              mtime: now
            };
            await this.dbRequest("put", [pathObj]);
          }
          /**
           * Remove a directory
           * @param options the options for the directory remove
           */
          async rmdir(options) {
            const { path, directory, recursive } = options;
            const fullPath = this.getPath(directory, path);
            const entry = await this.dbRequest("get", [fullPath]);
            if (entry === void 0)
              throw Error("Folder does not exist.");
            if (entry.type !== "directory")
              throw Error("Requested path is not a directory");
            const readDirResult = await this.readdir({ path, directory });
            if (readDirResult.files.length !== 0 && !recursive)
              throw Error("Folder is not empty");
            for (const entry2 of readDirResult.files) {
              const entryPath = `${path}/${entry2.name}`;
              const entryObj = await this.stat({ path: entryPath, directory });
              if (entryObj.type === "file") {
                await this.deleteFile({ path: entryPath, directory });
              } else {
                await this.rmdir({ path: entryPath, directory, recursive });
              }
            }
            await this.dbRequest("delete", [fullPath]);
          }
          /**
           * Return a list of files from the directory (not recursive)
           * @param options the options for the readdir operation
           * @return a promise that resolves with the readdir directory listing result
           */
          async readdir(options) {
            const path = this.getPath(options.directory, options.path);
            const entry = await this.dbRequest("get", [path]);
            if (options.path !== "" && entry === void 0)
              throw Error("Folder does not exist.");
            const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
            const files = await Promise.all(entries.map(async (e) => {
              let subEntry = await this.dbRequest("get", [e]);
              if (subEntry === void 0) {
                subEntry = await this.dbRequest("get", [e + "/"]);
              }
              return {
                name: e.substring(path.length + 1),
                type: subEntry.type,
                size: subEntry.size,
                ctime: subEntry.ctime,
                mtime: subEntry.mtime,
                uri: subEntry.path
              };
            }));
            return { files };
          }
          /**
           * Return full File URI for a path and directory
           * @param options the options for the stat operation
           * @return a promise that resolves with the file stat result
           */
          async getUri(options) {
            const path = this.getPath(options.directory, options.path);
            let entry = await this.dbRequest("get", [path]);
            if (entry === void 0) {
              entry = await this.dbRequest("get", [path + "/"]);
            }
            return {
              uri: (entry === null || entry === void 0 ? void 0 : entry.path) || path
            };
          }
          /**
           * Return data about a file
           * @param options the options for the stat operation
           * @return a promise that resolves with the file stat result
           */
          async stat(options) {
            const path = this.getPath(options.directory, options.path);
            let entry = await this.dbRequest("get", [path]);
            if (entry === void 0) {
              entry = await this.dbRequest("get", [path + "/"]);
            }
            if (entry === void 0)
              throw Error("Entry does not exist.");
            return {
              name: entry.path.substring(path.length + 1),
              type: entry.type,
              size: entry.size,
              ctime: entry.ctime,
              mtime: entry.mtime,
              uri: entry.path
            };
          }
          /**
           * Rename a file or directory
           * @param options the options for the rename operation
           * @return a promise that resolves with the rename result
           */
          async rename(options) {
            await this._copy(options, true);
            return;
          }
          /**
           * Copy a file or directory
           * @param options the options for the copy operation
           * @return a promise that resolves with the copy result
           */
          async copy(options) {
            return this._copy(options, false);
          }
          async requestPermissions() {
            return { publicStorage: "granted" };
          }
          async checkPermissions() {
            return { publicStorage: "granted" };
          }
          /**
           * Function that can perform a copy or a rename
           * @param options the options for the rename operation
           * @param doRename whether to perform a rename or copy operation
           * @return a promise that resolves with the result
           */
          async _copy(options, doRename = false) {
            let { toDirectory } = options;
            const { to, from, directory: fromDirectory } = options;
            if (!to || !from) {
              throw Error("Both to and from must be provided");
            }
            if (!toDirectory) {
              toDirectory = fromDirectory;
            }
            const fromPath = this.getPath(fromDirectory, from);
            const toPath = this.getPath(toDirectory, to);
            if (fromPath === toPath) {
              return {
                uri: toPath
              };
            }
            if (isPathParent(fromPath, toPath)) {
              throw Error("To path cannot contain the from path");
            }
            let toObj;
            try {
              toObj = await this.stat({
                path: to,
                directory: toDirectory
              });
            } catch (e) {
              const toPathComponents = to.split("/");
              toPathComponents.pop();
              const toPath2 = toPathComponents.join("/");
              if (toPathComponents.length > 0) {
                const toParentDirectory = await this.stat({
                  path: toPath2,
                  directory: toDirectory
                });
                if (toParentDirectory.type !== "directory") {
                  throw new Error("Parent directory of the to path is a file");
                }
              }
            }
            if (toObj && toObj.type === "directory") {
              throw new Error("Cannot overwrite a directory with a file");
            }
            const fromObj = await this.stat({
              path: from,
              directory: fromDirectory
            });
            const updateTime = async (path, ctime2, mtime) => {
              const fullPath = this.getPath(toDirectory, path);
              const entry = await this.dbRequest("get", [fullPath]);
              entry.ctime = ctime2;
              entry.mtime = mtime;
              await this.dbRequest("put", [entry]);
            };
            const ctime = fromObj.ctime ? fromObj.ctime : Date.now();
            switch (fromObj.type) {
              // The "from" object is a file
              case "file": {
                const file = await this.readFile({
                  path: from,
                  directory: fromDirectory
                });
                if (doRename) {
                  await this.deleteFile({
                    path: from,
                    directory: fromDirectory
                  });
                }
                let encoding;
                if (!(file.data instanceof Blob) && !this.isBase64String(file.data)) {
                  encoding = Encoding2.UTF8;
                }
                const writeResult = await this.writeFile({
                  path: to,
                  directory: toDirectory,
                  data: file.data,
                  encoding
                });
                if (doRename) {
                  await updateTime(to, ctime, fromObj.mtime);
                }
                return writeResult;
              }
              case "directory": {
                if (toObj) {
                  throw Error("Cannot move a directory over an existing object");
                }
                try {
                  await this.mkdir({
                    path: to,
                    directory: toDirectory,
                    recursive: false
                  });
                  if (doRename) {
                    await updateTime(to, ctime, fromObj.mtime);
                  }
                } catch (e) {
                }
                const contents = (await this.readdir({
                  path: from,
                  directory: fromDirectory
                })).files;
                for (const filename of contents) {
                  await this._copy({
                    from: `${from}/${filename.name}`,
                    to: `${to}/${filename.name}`,
                    directory: fromDirectory,
                    toDirectory
                  }, doRename);
                }
                if (doRename) {
                  await this.rmdir({
                    path: from,
                    directory: fromDirectory
                  });
                }
              }
            }
            return {
              uri: toPath
            };
          }
          isBase64String(str) {
            try {
              return btoa(atob(str)) == str;
            } catch (err) {
              return false;
            }
          }
        };
        FilesystemWeb._debug = true;
      }
    });
    var web_exports2 = {};
    __export(web_exports2, {
      PreferencesWeb: () => PreferencesWeb
    });
    var PreferencesWeb;
    var init_web2 = __esm2({
      "node_modules/@capacitor/preferences/dist/esm/web.js"() {
        init_dist();
        PreferencesWeb = class extends WebPlugin {
          constructor() {
            super(...arguments);
            this.group = "CapacitorStorage";
          }
          async configure({ group }) {
            if (typeof group === "string") {
              this.group = group;
            }
          }
          async get(options) {
            const value = this.impl.getItem(this.applyPrefix(options.key));
            return { value };
          }
          async set(options) {
            this.impl.setItem(this.applyPrefix(options.key), options.value);
          }
          async remove(options) {
            this.impl.removeItem(this.applyPrefix(options.key));
          }
          async keys() {
            const keys = this.rawKeys().map((k) => k.substring(this.prefix.length));
            return { keys };
          }
          async clear() {
            for (const key of this.rawKeys()) {
              this.impl.removeItem(key);
            }
          }
          async migrate() {
            var _a;
            const migrated = [];
            const existing = [];
            const oldprefix = "_cap_";
            const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
            for (const oldkey of keys) {
              const key = oldkey.substring(oldprefix.length);
              const value = (_a = this.impl.getItem(oldkey)) !== null && _a !== void 0 ? _a : "";
              const { value: currentValue } = await this.get({ key });
              if (typeof currentValue === "string") {
                existing.push(key);
              } else {
                await this.set({ key, value });
                migrated.push(key);
              }
            }
            return { migrated, existing };
          }
          async removeOld() {
            const oldprefix = "_cap_";
            const keys = Object.keys(this.impl).filter((k) => k.indexOf(oldprefix) === 0);
            for (const oldkey of keys) {
              this.impl.removeItem(oldkey);
            }
          }
          get impl() {
            return window.localStorage;
          }
          get prefix() {
            return this.group === "NativeStorage" ? "" : `${this.group}.`;
          }
          rawKeys() {
            return Object.keys(this.impl).filter((k) => k.indexOf(this.prefix) === 0);
          }
          applyPrefix(key) {
            return this.prefix + key;
          }
        };
      }
    });
    var web_exports3 = {};
    __export(web_exports3, {
      AppWeb: () => AppWeb
    });
    var AppWeb;
    var init_web3 = __esm2({
      "node_modules/@capacitor/app/dist/esm/web.js"() {
        init_dist();
        AppWeb = class extends WebPlugin {
          constructor() {
            super();
            this.handleVisibilityChange = () => {
              const data = {
                isActive: document.hidden !== true
              };
              this.notifyListeners("appStateChange", data);
              if (document.hidden) {
                this.notifyListeners("pause", null);
              } else {
                this.notifyListeners("resume", null);
              }
            };
            document.addEventListener("visibilitychange", this.handleVisibilityChange, false);
          }
          exitApp() {
            throw this.unimplemented("Not implemented on web.");
          }
          async getInfo() {
            throw this.unimplemented("Not implemented on web.");
          }
          async getLaunchUrl() {
            return { url: "" };
          }
          async getState() {
            return { isActive: document.hidden !== true };
          }
          async minimizeApp() {
            throw this.unimplemented("Not implemented on web.");
          }
          async toggleBackButtonHandler() {
            throw this.unimplemented("Not implemented on web.");
          }
          async getAppLanguage() {
            return {
              value: navigator.language.split("-")[0].toLowerCase()
            };
          }
        };
      }
    });
    init_dist();
    init_dist();
    function s(t) {
      t.CapacitorUtils.Synapse = new Proxy(
        {},
        {
          get(e, n) {
            return new Proxy({}, {
              get(w, o) {
                return (c, p, r) => {
                  const i = t.Capacitor.Plugins[n];
                  if (i === void 0) {
                    r(new Error(`Capacitor plugin ${n} not found`));
                    return;
                  }
                  if (typeof i[o] != "function") {
                    r(new Error(`Method ${o} not found in Capacitor plugin ${n}`));
                    return;
                  }
                  (async () => {
                    try {
                      const a = await i[o](c);
                      p(a);
                    } catch (a) {
                      r(a);
                    }
                  })();
                };
              }
            });
          }
        }
      );
    }
    function u(t) {
      t.CapacitorUtils.Synapse = new Proxy(
        {},
        {
          get(e, n) {
            return t.cordova.plugins[n];
          }
        }
      );
    }
    function f(t = false) {
      typeof window > "u" || (window.CapacitorUtils = window.CapacitorUtils || {}, window.Capacitor !== void 0 && !t ? s(window) : window.cordova !== void 0 && u(window));
    }
    init_definitions();
    var Filesystem2 = registerPlugin2("Filesystem", {
      web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.FilesystemWeb())
    });
    f();
    init_dist();
    var Preferences2 = registerPlugin2("Preferences", {
      web: () => Promise.resolve().then(() => (init_web2(), web_exports2)).then((m) => new m.PreferencesWeb())
    });
    init_dist();
    var App2 = registerPlugin2("App", {
      web: () => Promise.resolve().then(() => (init_web3(), web_exports3)).then((m) => new m.AppWeb())
    });
    var Share2 = registerPlugin2("Share");
    window.StocklabCapacitor = { Capacitor: Capacitor2, CapacitorHttp: CapacitorHttp2, registerPlugin: registerPlugin2, Preferences: Preferences2, Filesystem: Filesystem2, Directory: Directory2, Encoding: Encoding2, App: App2, Share: Share2 };
  })();

  // mobile/src/finmind.mjs
  init_core();
  var API = "https://api.finmindtrade.com/api/v4/data";
  var DataRequestError = class extends Error {
    constructor(message, status2 = null) {
      super(message);
      this.name = "DataRequestError";
      this.status = status2;
    }
  };
  var number = numeric;
  var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var RETRYABLE = /* @__PURE__ */ new Set([500, 502, 503, 504]);
  var DAY = 864e5;
  var apiMessage = (status2) => ({
    401: "Token \u7121\u6548\u6216\u672A\u6388\u6B0A",
    402: "API \u984D\u5EA6\u5DF2\u9054\u4E0A\u9650",
    403: "\u6B0A\u9650\u4E0D\u8DB3\u6216 IP \u88AB\u9650\u5236",
    429: "\u8ACB\u6C42\u904E\u65BC\u983B\u7E41",
    500: "FinMind \u670D\u52D9\u66AB\u6642\u7570\u5E38\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66",
    502: "FinMind \u670D\u52D9\u66AB\u6642\u7570\u5E38\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66",
    503: "FinMind \u670D\u52D9\u66AB\u6642\u7570\u5E38\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66",
    504: "FinMind \u670D\u52D9\u66AB\u6642\u7570\u5E38\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66"
  })[status2] || `FinMind \u56DE\u61C9 ${status2 || "\u683C\u5F0F\u932F\u8AA4"}\uFF0C\u8ACB\u78BA\u8A8D\u67E5\u8A62\u689D\u4EF6`;
  var iso = (date) => date.toISOString().slice(0, 10);
  function ranges(start, end) {
    const result = [];
    for (let cursor = /* @__PURE__ */ new Date(start + "T00:00:00Z"), last = /* @__PURE__ */ new Date(end + "T00:00:00Z"); cursor <= last; ) {
      const finish = new Date(Math.min(last.getTime(), cursor.getTime() + 364 * DAY));
      result.push([iso(cursor), iso(finish)]);
      cursor = new Date(finish.getTime() + DAY);
    }
    return result;
  }
  function checkQuery(ids, start, end) {
    const unique = [...new Set(ids.map((id) => String(id).trim()))];
    if (!unique.length || unique.length > 10 || unique.some((id) => !/^[0-9A-Za-z]{4,8}$/.test(id)))
      throw Error("\u624B\u6A5F\u7248\u4E00\u6B21\u8ACB\u8F38\u5165 1\u201310 \u6A94\u6709\u6548\u80A1\u7968\u4EE3\u865F\u3002");
    for (const date of [start, end]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
        throw Error("\u8ACB\u586B\u5BEB\u6709\u6548\u7684\u958B\u59CB\u8207\u7D50\u675F\u65E5\u671F\u3002");
    }
    if (start > end) throw Error("\u958B\u59CB\u65E5\u671F\u4E0D\u5F97\u665A\u65BC\u7D50\u675F\u65E5\u671F\u3002");
    if (Date.parse(end) - Date.parse(start) > 366 * 10 * 864e5) throw Error("\u624B\u6A5F\u7248\u55AE\u6B21\u67E5\u8A62\u7BC4\u570D\u4E0A\u9650\u70BA\u5341\u5E74\u3002");
    return unique;
  }
  function createFinMindClient(request, { sleep = pause } = {}) {
    return async function loadMarket({ ids, start, end, token = "", onProgress = () => {
    } }) {
      ids = checkQuery(ids, start, end);
      const warnings = [];
      async function requestRange(dataset, sid, rangeStart = start, rangeEnd = end) {
        const params2 = { dataset };
        if (sid) Object.assign(params2, { data_id: sid, start_date: rangeStart, end_date: rangeEnd });
        const headers = token ? { Authorization: "Bearer " + token } : {};
        for (let attempt = 0; attempt < 3; attempt++) {
          let response;
          try {
            response = await request({ url: API, params: params2, headers, connectTimeout: 2e4, readTimeout: 45e3, responseType: "json" });
          } catch {
            throw new DataRequestError(`${dataset} \u9023\u7DDA\u5931\u6557\u3002\u8ACB\u78BA\u8A8D\u7DB2\u8DEF\u5F8C\u518D\u8A66\uFF1B\u4E0A\u6B21\u4FDD\u5B58\u7684\u8CC7\u6599\u4ECD\u4FDD\u7559\u3002`);
          }
          const body = typeof response.data === "string" ? (() => {
            try {
              return JSON.parse(response.data);
            } catch {
              return null;
            }
          })() : response.data;
          const status2 = response.status === 200 ? body?.status : response.status;
          if (RETRYABLE.has(status2) && attempt < 2) {
            await sleep(1e3 * 2 ** attempt);
            continue;
          }
          if (response.status !== 200 || body?.status !== 200 || !Array.isArray(body.data))
            throw new DataRequestError(`${dataset}\uFF1A${apiMessage(status2)}`, status2);
          await sleep(250);
          return body.data;
        }
      }
      async function get(dataset, sid) {
        try {
          return await requestRange(dataset, sid);
        } catch (e) {
          const span = Math.floor((Date.parse(end) - Date.parse(start)) / DAY) + 1;
          if (dataset !== "TaiwanStockPrice" || !sid || !(e instanceof DataRequestError) || !RETRYABLE.has(e.status) || span <= 365) throw e;
          const merged = [];
          for (const [partStart, partEnd] of ranges(start, end)) {
            onProgress(`${sid} \xB7 \u65E5\u80A1\u50F9\u5206\u6BB5\u67E5\u8A62 ${partStart}\u2013${partEnd}`);
            merged.push(...await requestRange(dataset, sid, partStart, partEnd));
          }
          return merged;
        }
      }
      onProgress("\u6B63\u5728\u67E5\u8A62\u80A1\u7968\u57FA\u672C\u8CC7\u6599\u2026");
      let info = /* @__PURE__ */ new Map();
      try {
        info = new Map((await get("TaiwanStockInfo")).map((row) => [row.stock_id, row]));
      } catch (e) {
        if (!(e instanceof DataRequestError)) throw e;
        warnings.push(e.message);
      }
      const stocks = [];
      for (const [index, sid] of ids.entries()) {
        const progress = (label) => onProgress(`${index + 1}/${ids.length} \xB7 ${sid} \xB7 ${label}`);
        progress("\u8B80\u53D6\u65E5\u80A1\u50F9");
        const prices = await get("TaiwanStockPrice", sid);
        if (!prices.length) throw Error(`${sid} \u5728\u67E5\u8A62\u671F\u9593\u6C92\u6709\u80A1\u50F9\u8CC7\u6599\uFF0C\u8ACB\u6AA2\u67E5\u4EE3\u865F\u8207\u65E5\u671F\u3002`);
        progress("\u8B80\u53D6\u6CD5\u4EBA\u8CB7\u8CE3\u8D85");
        const chipRows = await get("TaiwanStockInstitutionalInvestorsBuySell", sid), chip = /* @__PURE__ */ new Map();
        if (!chipRows.length) warnings.push(`${sid} \u7121\u6CD5\u4EBA\u8CC7\u6599\uFF1B\u9023\u8CB7\u56DE\u6E2C\u53CA\u8CC7\u91D1\u6D41\u5411\u5C07\u4FDD\u7559\u7F3A\u503C\u3002`);
        for (const row of chipRows) {
          if (!chip.has(row.date)) chip.set(row.date, /* @__PURE__ */ new Map());
          const day = chip.get(row.date);
          if (day.has(row.name)) throw Error(`${sid} ${row.date} \u6CD5\u4EBA\u8CC7\u6599\u91CD\u8907\uFF0C\u505C\u6B62\u5408\u4F75\u3002`);
          const buy = number(row.buy), sell = number(row.sell);
          day.set(row.name, Number.isFinite(buy) && Number.isFinite(sell) ? buy - sell : null);
        }
        let financials = [], per = /* @__PURE__ */ new Map(), adj = /* @__PURE__ */ new Map();
        const datasets = [["TaiwanStockFinancialStatements", "\u8B80\u53D6\u8CA1\u5831"], ["TaiwanStockPER", "\u8B80\u53D6\u672C\u76CA\u6BD4"], ["TaiwanStockPriceAdj", "\u8B80\u53D6\u9084\u539F\u50F9\u683C"]];
        for (const [dataset, label] of datasets) {
          progress(label);
          let rows;
          try {
            rows = await get(dataset, sid);
          } catch (e) {
            if (!(e instanceof DataRequestError)) throw e;
            warnings.push(`${sid}\uFF1A${e.message}`);
            continue;
          }
          if (dataset === "TaiwanStockFinancialStatements") {
            const mapping = { Revenue: "revenue", GrossProfit: "gross_profit", OperatingIncome: "operating_income", IncomeAfterTaxes: "net_income", EPS: "eps" }, periods = /* @__PURE__ */ new Map();
            for (const row of rows) {
              if (!Object.hasOwn(mapping, row.type)) continue;
              if (!periods.has(row.date)) periods.set(row.date, { date: row.date });
              const record = periods.get(row.date), key = mapping[row.type];
              if (Object.hasOwn(record, key)) throw Error(`${sid} \u8CA1\u5831\u6B04\u4F4D\u91CD\u8907\uFF0C\u9700\u6838\u5C0D\u4F86\u6E90\u3002`);
              record[key] = number(row.value);
            }
            financials = [...periods.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
          } else {
            const target = dataset === "TaiwanStockPER" ? per : adj;
            for (const row of rows) {
              if (target.has(row.date)) throw Error(`${sid} ${dataset} \u65E5\u671F\u91CD\u8907\uFF0C\u505C\u6B62\u5408\u4F75\u3002`);
              target.set(row.date, row);
            }
          }
        }
        const bars = [];
        for (const row of [...prices].sort((a, b) => a.date.localeCompare(b.date))) {
          const close = number(row.close), open = number(row.open), high = number(row.max), low = number(row.min);
          const day = chip.get(row.date) || /* @__PURE__ */ new Map(), pe = per.get(row.date) || {}, adjusted = number(adj.get(row.date)?.close);
          const dealerKeys = ["Dealer", "Dealer_self", "Dealer_Hedging"].filter((key) => day.has(key));
          const dealer = dealerKeys.length && dealerKeys.every((key) => Number.isFinite(day.get(key))) ? dealerKeys.reduce((total, key) => total + day.get(key), 0) : null;
          bars.push({
            date: row.date,
            open,
            high,
            low,
            close,
            volume: number(row.Trading_Volume),
            trust: day.get("Investment_Trust") ?? null,
            foreign: day.get("Foreign_Investor") ?? null,
            foreign_dealer: day.get("Foreign_Dealer_Self") ?? null,
            dealer,
            adj_factor: adjusted > 0 ? adjusted / close : null,
            pe: number(pe.PER),
            pb: number(pe.PBR),
            dividend_yield: number(pe.dividend_yield)
          });
        }
        const meta = info.get(sid) || {};
        stocks.push({ id: sid, name: meta.stock_name || sid, sector: meta.industry_category || "\u672A\u5206\u985E", market: meta.type || "", bars, financials });
      }
      return prepareBundle({
        schema_version: 1,
        mode: "real",
        source: "FinMind v4\uFF08Android\uFF09",
        source_url: "https://finmind.github.io/tutor/TaiwanMarket/",
        fetched_at: (/* @__PURE__ */ new Date()).toISOString(),
        requested_start: start,
        requested_end: end,
        stocks,
        warnings,
        notes: [
          "\u65E5\u8CC7\u6599\uFF0C\u975E\u5373\u6642\u884C\u60C5\uFF1B\u8ACB\u6838\u5C0D\u6BCF\u6A94\u80A1\u7968\u6700\u5F8C\u8CC7\u6599\u65E5\u671F\u3002",
          "\u6CD5\u4EBA\u6578\u91CF\u70BA\u80A1\uFF1B\u91D1\u984D\u4EE5\u6DE8\u8CB7\u8D85\u80A1\u6578\u4E58\u6536\u76E4\u50F9\u4F30\u8A08\u3002",
          "\u7522\u696D\u5206\u985E\u70BA\u64F7\u53D6\u6642\u7684\u5206\u985E\uFF0C\u5DF2\u8F09\u5165\u6E05\u55AE\u4E0D\u4EE3\u8868\u5168\u5E02\u5834\u3002",
          "\u8CA1\u5831\u65E5\u671F\u70BA\u671F\u672B\u800C\u975E\u516C\u544A\u65E5\u671F\uFF0C\u4E0D\u7528\u65BC\u6B77\u53F2\u56DE\u6E2C\u8A0A\u865F\u3002",
          "\u9084\u539F\u50F9\u683C\u4F9D FinMind \u6B0A\u9650\u63D0\u4F9B\uFF1B\u4E0D\u8DB3\u6642\u56DE\u6E2C\u4F7F\u7528\u539F\u59CB\u50F9\u683C\uFF0C\u672A\u542B\u914D\u606F\u53CA\u5206\u5272\u3002"
        ]
      });
    };
  }

  // mobile/src/storage.mjs
  init_core();
  function createSnapshotStore({ read, write, getSlot, setSlot }) {
    let serial = Promise.resolve();
    return {
      async load() {
        const slot = await getSlot() || "a";
        let damaged = false;
        for (const candidate of [slot, slot === "a" ? "b" : "a"]) {
          const raw = await read(`market.${candidate}.json`);
          if (raw === null) continue;
          try {
            return { bundle: prepareBundle(JSON.parse(raw)), recovered: damaged };
          } catch {
            damaged = true;
          }
        }
        return { bundle: null, recovered: false, damaged };
      },
      save(bundle2) {
        validate(bundle2, { allowEmpty: true });
        const text = JSON.stringify(bundle2);
        if (new TextEncoder().encode(text).byteLength > 20 * 1024 * 1024) return Promise.reject(Error("\u8CC7\u6599\u8D85\u904E\u624B\u6A5F\u7248 20 MB \u5132\u5B58\u4E0A\u9650\u3002"));
        const task = serial.catch(() => {
        }).then(async () => {
          const slot = await getSlot() === "a" ? "b" : "a";
          await write(`market.${slot}.json`, text);
          await setSlot(slot);
        });
        serial = task;
        return task;
      }
    };
  }

  // pwa/src/scanner-analysis.mjs
  init_core();
  function bigDataAnalysis(stock, threshold = 5) {
    const bs = stock.bars, n = bs.length;
    const sma = (i, w, key = "close") => i >= w - 1 ? bs.slice(i - w + 1, i + 1).reduce((a, x) => a + x[key], 0) / w : null;
    const rsi = Array(n).fill(null);
    let gain = 0, loss = 0;
    for (let i = 1; i < n; i++) {
      const ch = bs[i].close - bs[i - 1].close, g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= 14) {
        gain += g;
        loss += l;
        if (i === 14) {
          gain /= 14;
          loss /= 14;
          rsi[i] = loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
        }
      } else {
        gain = (gain * 13 + g) / 14;
        loss = (loss * 13 + l) / 14;
        rsi[i] = loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
      }
    }
    const inds = indicators(bs);
    const stateAt = (i) => {
      const ma20 = sma(i, 20), ma60 = sma(i, 60), vol20 = sma(i, 20, "volume");
      const prev20 = i >= 20 ? Math.max(...bs.slice(i - 20, i).map((x) => x.high)) : null;
      const ins = (isNum(bs[i].trust) ? bs[i].trust : 0) + (isNum(bs[i].foreign) ? bs[i].foreign : 0);
      return [
        { key: "above_ma20", label: "\u80A1\u50F9\u7AD9\u4E0A 20 \u65E5\u5747\u7DDA", on: isNum(ma20) && bs[i].close > ma20 },
        { key: "ma20_above_ma60", label: "20 \u65E5\u5747\u7DDA\u9AD8\u65BC 60 \u65E5\u5747\u7DDA", on: isNum(ma20) && isNum(ma60) && ma20 > ma60 },
        { key: "macd_positive", label: "MACD \u52D5\u80FD\u504F\u591A\uFF08DIF > DEA\uFF09", on: isNum(inds[i]?.dif) && isNum(inds[i]?.dea) && inds[i].dif > inds[i].dea },
        { key: "volume_expand", label: "\u6210\u4EA4\u91CF\u9AD8\u65BC 20 \u65E5\u5747\u91CF 10%", on: isNum(vol20) && bs[i].volume > vol20 * 1.1 },
        { key: "breakout20", label: "\u6536\u76E4\u7A81\u7834\u524D 20 \u65E5\u6700\u9AD8\u50F9", on: isNum(prev20) && bs[i].close > prev20 },
        { key: "institutional_buy", label: "\u5916\u8CC7\uFF0B\u6295\u4FE1\u7576\u65E5\u5408\u8A08\u8CB7\u8D85", on: isNum(bs[i].trust) && isNum(bs[i].foreign) && ins > 0 },
        { key: "rsi_zone", label: "RSI(14) \u4F4D\u65BC 50\u201375 \u591A\u982D\u5340", on: isNum(rsi[i]) && rsi[i] >= 50 && rsi[i] <= 75 }
      ];
    };
    if (n < 81) return { conditions: [], score: 0, matches: [], horizons: [], insufficient: true, reason: "\u81F3\u5C11\u9700\u8981\u7D04 81 \u7B46\u65E5\u8CC7\u6599\u624D\u80FD\u5EFA\u7ACB 60 \u65E5\u5747\u7DDA\u8207\u6B77\u53F2\u6A23\u672C\u3002" };
    const current = stateAt(n - 1), currentOn = current.filter((x) => x.on).map((x) => x.key), score = currentOn.length;
    const horizons = [5, 10, 20, 60], matches = [];
    for (let i = 60; i < n - 5; i++) {
      const s = stateAt(i);
      const same = s.reduce((a, x) => a + (x.on === current.find((c) => c.key === x.key).on ? 1 : 0), 0);
      const bullishSame = s.reduce((a, x) => a + (x.on && current.find((c) => c.key === x.key).on ? 1 : 0), 0);
      if (same >= threshold && bullishSame >= Math.max(2, currentOn.length - 3)) matches.push({ i, date: bs[i].date, close: bs[i].close, same, bullishSame });
    }
    const stats = horizons.map((h) => {
      const rows = matches.filter((m) => m.i + h < n).map((m) => {
        const ret = bs[m.i + h].close / bs[m.i].close - 1;
        const path = bs.slice(m.i + 1, m.i + h + 1).map((x) => x.close / bs[m.i].close - 1);
        return { date: m.date, ret, mae: path.length ? Math.min(0, ...path) : null, mfe: path.length ? Math.max(0, ...path) : null };
      });
      const rets = rows.map((x) => x.ret).sort((a, b) => a - b), avg = rets.length ? rets.reduce((a, x) => a + x, 0) / rets.length : null;
      const median = rets.length ? rets.length % 2 ? rets[(rets.length - 1) / 2] : (rets[rets.length / 2 - 1] + rets[rets.length / 2]) / 2 : null;
      const positives = rets.filter((x) => x > 0), negatives = rets.filter((x) => x <= 0);
      const avgWin = positives.length ? positives.reduce((a, x) => a + x, 0) / positives.length : null;
      const avgLoss = negatives.length ? negatives.reduce((a, x) => a + x, 0) / negatives.length : null;
      return { days: h, count: rows.length, up_rate: rets.length ? positives.length / rets.length : null, mean: avg, median, best: rets.at(-1) ?? null, worst: rets[0] ?? null, avg_win: avgWin, avg_loss: avgLoss, payoff: isNum(avgWin) && isNum(avgLoss) && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null, avg_mae: rows.length ? rows.reduce((a, x) => a + (x.mae ?? 0), 0) / rows.length : null, avg_mfe: rows.length ? rows.reduce((a, x) => a + (x.mfe ?? 0), 0) / rows.length : null, rows };
    });
    return { conditions: current, score, matches, horizons: stats, insufficient: false };
  }

  // pwa/src/scanner-ui.js
  init_core();
  function createScannerUI({ getBundle, selected: selected2, selectStock, go: go2, esc: esc2, fmt: fmt2, pct: pct2, isNum: isNum2, metric: metric2, table: table2, csv: csv2 }) {
    const $2 = (id) => document.getElementById(id);
    if (!$2("scanner")) return null;
    let bundle2, stockId2;
    const cache = /* @__PURE__ */ new WeakMap();
    const analyze = (stock, threshold) => {
      let values = cache.get(stock);
      if (!values) {
        values = /* @__PURE__ */ new Map();
        cache.set(stock, values);
      }
      if (!values.has(threshold)) values.set(threshold, bigDataAnalysis(stock, threshold));
      return values.get(threshold);
    };
    function renderBigData() {
      const threshold = Number($2("similarity-threshold")?.value || 5), minSamples = Number($2("minimum-samples")?.value || 30), a = analyze(selected2(), threshold);
      $2("export-bigdata").disabled = a.insufficient;
      if (a.insufficient) {
        $2("bigdata-summary").textContent = a.reason;
        $2("bigdata-current").innerHTML = '<div class="panel empty">' + esc2(a.reason) + "</div>";
        $2("bigdata-horizons").innerHTML = "";
        $2("bigdata-conditions").innerHTML = "";
        return;
      }
      const label = a.score >= 6 ? "\u689D\u4EF6\u504F\u5F37" : a.score >= 4 ? "\u689D\u4EF6\u504F\u591A" : a.score >= 2 ? "\u591A\u7A7A\u6DF7\u5408" : "\u591A\u982D\u689D\u4EF6\u504F\u5C11";
      $2("bigdata-current").innerHTML = '<div class="metrics">' + metric2("\u76EE\u524D\u7B26\u5408\u591A\u982D\u689D\u4EF6", a.score + " / 7", label) + metric2("\u6B77\u53F2\u76F8\u4F3C\u65E5", String(a.matches.length), "\u4F9D\u76EE\u524D\u689D\u4EF6\u7D44\u5408\u641C\u5C0B") + metric2("\u8CC7\u6599\u9577\u5EA6", String(selected2().bars.length), "\u65E5\u7DDA\u7B46\u6578") + metric2("\u6700\u65B0\u8CC7\u6599\u65E5", selected2().bars.at(-1).date, selected2().id + " " + (selected2().name || "")) + "</div>";
      $2("bigdata-summary").textContent = a.matches.length < minSamples ? "\u76F8\u4F3C\u6A23\u672C " + a.matches.length + " \u6B21\uFF0C\u4F4E\u65BC\u4F60\u8A2D\u5B9A\u7684 " + minSamples + " \u6B21\uFF1B\u7D50\u679C\u5BB9\u6613\u53D7\u5C11\u6578\u4E8B\u4EF6\u5F71\u97FF\u3002" : "\u76F8\u4F3C\u6A23\u672C " + a.matches.length + " \u6B21\uFF1B\u8ACB\u540C\u6642\u770B\u4E0A\u6F32\u6BD4\u4F8B\u3001\u5E73\u5747/\u4E2D\u4F4D\u6578\u5831\u916C\u8207\u6700\u5DEE\u6848\u4F8B\u3002";
      $2("bigdata-horizons").innerHTML = table2(["\u89C0\u5BDF\u671F", "\u6709\u6548\u6A23\u672C", "\u4E0A\u6F32\u6BD4\u4F8B", "\u5E73\u5747\u5831\u916C", "\u4E2D\u4F4D\u6578", "\u5E73\u5747\u76C8\u8667\u6BD4", "\u5E73\u5747\u671F\u9593\u6700\u5927\u4E0D\u5229\u8B8A\u52D5", "\u6700\u5DEE\u7D50\u679C"], a.horizons.map((x) => [x.days + " \u65E5", x.count, pct2(x.up_rate), pct2(x.mean), pct2(x.median), isNum2(x.payoff) ? fmt2(x.payoff, 2) + "x" : "\u2014", pct2(x.avg_mae), pct2(x.worst)]));
      $2("bigdata-conditions").innerHTML = '<div class="condition-grid">' + a.conditions.map((x) => '<div class="condition-item ' + (x.on ? "on" : "off") + '"><b>' + (x.on ? "\u2713" : "\u2014") + "</b><span>" + esc2(x.label) + "</span></div>").join("") + "</div>";
      $2("export-bigdata").onclick = () => csv2(stockId2 + "_bigdata_" + selected2().bars.at(-1).date + ".csv", ["horizon_days", "samples", "up_rate", "mean_return", "median_return", "avg_win", "avg_loss", "payoff_ratio", "avg_mae", "avg_mfe", "worst", "best"], a.horizons.map((x) => [x.days, x.count, x.up_rate, x.mean, x.median, x.avg_win, x.avg_loss, x.payoff, x.avg_mae, x.avg_mfe, x.worst, x.best]));
    }
    function scannerRows() {
      const horizon = Number($2("scan-horizon")?.value || 20);
      const threshold = Number($2("scan-threshold")?.value || 5);
      const minSamples = Number($2("scan-min-samples")?.value || 30);
      const minScore = Number($2("scan-min-score")?.value || 3);
      const onlyQualified = !!$2("scan-only-qualified")?.checked;
      const rows = [];
      for (const stock of bundle2.stocks) {
        const a = analyze(stock, threshold);
        if (a.insufficient) continue;
        const h = a.horizons.find((x) => x.days === horizon);
        if (!h || !h.count || a.score < minScore) continue;
        const qualified = h.count >= minSamples;
        if (onlyQualified && !qualified) continue;
        const confidence = !qualified ? "\u4F4E" : h.count >= 100 ? "\u9AD8" : "\u4E2D";
        rows.push({ stock, a, h, qualified, confidence });
      }
      rows.sort((x, y) => {
        const ux = isNum2(x.h.up_rate) ? x.h.up_rate : -1, uy = isNum2(y.h.up_rate) ? y.h.up_rate : -1;
        if (uy !== ux) return uy - ux;
        const mx = isNum2(x.h.median) ? x.h.median : -99, my = isNum2(y.h.median) ? y.h.median : -99;
        if (my !== mx) return my - mx;
        return y.h.count - x.h.count;
      });
      return { rows, horizon, threshold, minSamples, minScore, onlyQualified };
    }
    function renderScanner() {
      if (!$2("scanner-table")) return;
      const r = scannerRows();
      const total = bundle2.stocks.length, shown = r.rows.length;
      const qualified = r.rows.filter((x) => x.qualified).length;
      $2("scanner-summary").innerHTML = '<div class="metrics">' + metric2("\u5DF2\u8F09\u5165\u80A1\u7968", String(total), "\u76EE\u524D\u6279\u6B21\u8CC7\u6599") + metric2("\u986F\u793A\u6A19\u7684", String(shown), "\u7B26\u5408\u76EE\u524D\u7BE9\u9078") + metric2("\u9054\u6A23\u672C\u9580\u6ABB", String(qualified), "\u6709\u6548\u6A23\u672C \u2265 " + r.minSamples) + metric2("\u89C0\u5BDF\u671F", r.horizon + " \u65E5", "\u6B77\u53F2\u76F8\u4F3C\u689D\u4EF6\u5F8C") + "</div>";
      $2("scanner-note").textContent = shown ? "\u4F9D\u300C\u4E0A\u6F32\u6BD4\u4F8B\u300D\u7531\u9AD8\u5230\u4F4E\u6392\u5217\uFF1B\u540C\u503C\u6642\u518D\u6BD4\u8F03\u4E2D\u4F4D\u6578\u5831\u916C\u8207\u6A23\u672C\u6578\u3002\u9019\u662F\u7814\u7A76\u6392\u5E8F\uFF0C\u4E0D\u662F\u8CB7\u9032\u6392\u540D\u3002" : "\u76EE\u524D\u6C92\u6709\u80A1\u7968\u7B26\u5408\u7BE9\u9078\u689D\u4EF6\uFF1B\u8ACB\u78BA\u8A8D\u6BCF\u6A94\u81F3\u5C11\u6709 81 \u7B46\u65E5\u8CC7\u6599\uFF0C\u6216\u964D\u4F4E\u591A\u982D\u689D\u4EF6\u8207\u6A23\u672C\u9580\u6ABB\u3002";
      $2("export-scanner").disabled = !shown;
      if (!shown) {
        $2("scanner-table").innerHTML = '<div class="empty">\u6C92\u6709\u7B26\u5408\u76EE\u524D\u689D\u4EF6\u7684\u6A19\u7684\u3002</div>';
        return;
      }
      const rows = r.rows.map((x, i) => [
        '<span class="scanner-rank">' + (i + 1) + "</span>",
        esc2(x.stock.id + " " + (x.stock.name || "")),
        x.a.score + " / 7",
        x.h.count,
        pct2(x.h.up_rate),
        pct2(x.h.mean),
        pct2(x.h.median),
        isNum2(x.h.payoff) ? fmt2(x.h.payoff, 2) + "x" : "\u2014",
        pct2(x.h.avg_mae),
        '<span class="confidence ' + (x.confidence === "\u9AD8" ? "high" : x.confidence === "\u4F4E" ? "low" : "") + '">' + x.confidence + "</span>",
        '<button class="scan-open" data-scan-stock="' + esc2(x.stock.id) + '">\u67E5\u770B</button>'
      ]);
      $2("scanner-table").innerHTML = table2(["#", "\u80A1\u7968", "\u76EE\u524D\u591A\u982D\u689D\u4EF6", "\u6709\u6548\u6A23\u672C", "\u4E0A\u6F32\u6BD4\u4F8B", "\u5E73\u5747\u5831\u916C", "\u4E2D\u4F4D\u6578", "\u76C8\u8667\u6BD4", "\u5E73\u5747\u6700\u5927\u4E0D\u5229\u8B8A\u52D5", "\u6A23\u672C\u91CF", "\u8A73\u7D30"], rows);
      $2("scanner-table").onclick = (e) => {
        const b = e.target.closest("[data-scan-stock]");
        if (!b) return;
        selectStock(b.dataset.scanStock);
        go2("bigdata");
      };
      $2("export-scanner").onclick = () => csv2("stocklab_scanner_" + r.horizon + "d.csv", ["rank", "stock_id", "name", "current_bullish_conditions", "samples", "up_rate", "mean_return", "median_return", "payoff_ratio", "avg_mae", "sample_size_level"], r.rows.map((x, i) => [i + 1, x.stock.id, x.stock.name || "", x.a.score, x.h.count, x.h.up_rate, x.h.mean, x.h.median, x.h.payoff, x.h.avg_mae, x.confidence]));
    }
    function buildChatGPTPrompt() {
      const stock = selected2(), bars = stock.bars, latest = bars.at(-1), previous = bars.at(-2), now = indicators(bars).at(-1) || {};
      const average = (window2, key = "close") => bars.length >= window2 ? bars.slice(-window2).reduce((sum, row) => sum + (isNum2(row[key]) ? row[key] : 0), 0) / window2 : null;
      const analysis = analyze(stock, Number($2("similarity-threshold")?.value || 5));
      const financials = [...stock.financials || []].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
      const financialLines = financials.length ? financials.map((row) => {
        const gross = row.revenue > 0 && isNum2(row.gross_profit) ? row.gross_profit / row.revenue : null;
        const operating = row.revenue > 0 && isNum2(row.operating_income) ? row.operating_income / row.revenue : null;
        return `- ${row.date}\uFF1A\u71DF\u6536 ${fmt2(isNum2(row.revenue) ? row.revenue / 1e8 : null)} \u5104\u3001\u6BDB\u5229\u7387 ${pct2(gross)}\u3001\u71DF\u76CA\u7387 ${pct2(operating)}\u3001EPS ${fmt2(row.eps)}`;
      }).join("\n") : "- \u76EE\u524D\u8CC7\u6599\u6C92\u6709\u8CA1\u5831\u6B04\u4F4D";
      const conditionLines = analysis.insufficient ? `- ${analysis.reason}` : analysis.conditions.map((item) => `- ${item.on ? "\u7B26\u5408" : "\u672A\u7B26\u5408"}\uFF1A${item.label}`).join("\n");
      const horizonLines = analysis.insufficient ? "- \u6A23\u672C\u4E0D\u8DB3" : analysis.horizons.map((item) => `- ${item.days} \u65E5\uFF1A\u6709\u6548\u6A23\u672C ${item.count}\u3001\u6B77\u53F2\u4E0A\u6F32\u6BD4\u4F8B ${pct2(item.up_rate)}\u3001\u5E73\u5747\u5831\u916C ${pct2(item.mean)}\u3001\u4E2D\u4F4D\u6578 ${pct2(item.median)}\u3001\u76C8\u8667\u6BD4 ${isNum2(item.payoff) ? fmt2(item.payoff, 2) + "x" : "\u2014"}\u3001\u5E73\u5747\u6700\u5927\u4E0D\u5229\u8B8A\u52D5 ${pct2(item.avg_mae)}`).join("\n");
      const institutional = (key) => isNum2(latest[key]) ? fmt2(latest[key] / 1e3, 0) + " \u5F35" : "\u7F3A\u503C";
      const change = previous ? latest.close / previous.close - 1 : null, volume20 = average(20, "volume");
      return `\u3010\u5206\u6790\u6A21\u5F0F\u3011\u9019\u662F\u4E00\u4EFD\u5B8C\u6574\u500B\u80A1\u7814\u7A76\uFF0C\u5EFA\u8B70\u4F7F\u7528 ChatGPT \u7684 High \u63A8\u7406\u5F37\u5EA6\u3002\u82E5\u76EE\u524D\u4E0D\u662F High\uFF0C\u8ACB\u4ECD\u5B8C\u6210\u5206\u6790\uFF0C\u4F46\u512A\u5148\u91CD\u8996\u8CC7\u6599\u67E5\u8B49\u3001\u4EA4\u53C9\u9A57\u8B49\u8207\u4E0D\u78BA\u5B9A\u6027\u3002

\u8ACB\u4EE5\u53F0\u80A1\u7814\u7A76\u5206\u6790\u5E2B\u7684\u89D2\u5EA6\uFF0C\u5206\u6790\u4EE5\u4E0B\u80A1\u7968\u3002\u8ACB\u4F7F\u7528\u7E41\u9AD4\u4E2D\u6587\uFF0C\u4E26\u5C07\u300C\u5DF2\u77E5\u4E8B\u5BE6\u300D\u3001\u300C\u8CC7\u6599\u63A8\u8AD6\u300D\u3001\u300C\u5E02\u5834\u9810\u671F\u300D\u6E05\u695A\u5206\u958B\u3002\u4E0D\u8981\u628A\u4EFB\u4F55\u55AE\u4E00\u6307\u6A19\u8996\u70BA\u4FDD\u8B49\uFF0C\u4E5F\u4E0D\u8981\u53EA\u7D66\u8CB7\u9032\uFF0F\u8CE3\u51FA\u7D50\u8AD6\u3002\u82E5\u9700\u8981\u6700\u65B0\u65B0\u805E\u3001\u6CD5\u8AAA\u6703\u3001\u7522\u696D\u6D88\u606F\u6216\u7E3D\u9AD4\u8CC7\u6599\uFF0C\u8ACB\u5148\u4E0A\u7DB2\u67E5\u8B49\u4E26\u9644\u4F86\u6E90\u8207\u65E5\u671F\u3002

\u3010\u6A19\u7684\u3011
${stock.id} ${stock.name || ""}
\u7522\u696D\uFF1A${stock.sector || "\u672A\u5206\u985E"}
\u672C\u6A5F\u8CC7\u6599\u4F86\u6E90\uFF1A${bundle2.source || "\u4F7F\u7528\u8005\u532F\u5165"}
\u8CC7\u6599\u6293\u53D6\u6642\u9593\uFF1A${bundle2.fetched_at || "\u672A\u63D0\u4F9B"}
\u884C\u60C5\u622A\u6B62\u65E5\uFF1A${latest.date}

\u3010\u76EE\u524D\u884C\u60C5\u3011
- \u6536\u76E4\u50F9\uFF1A${fmt2(latest.close)} \u5143
- \u55AE\u65E5\u6F32\u8DCC\uFF1A${pct2(change)}
- \u6210\u4EA4\u91CF\uFF1A${fmt2(latest.volume / 1e3, 0)} \u5F35
- 20 \u65E5\u5747\u91CF\uFF1A${isNum2(volume20) ? fmt2(volume20 / 1e3, 0) + " \u5F35" : "\u2014"}
- \u672C\u76CA\u6BD4\uFF1A${isNum2(latest.pe) && latest.pe > 0 ? fmt2(latest.pe) + " \u500D" : "\u7F3A\u503C\u6216\u975E\u6B63"}

\u3010\u6280\u8853\u9762\u3011
- MA20\uFF1A${fmt2(average(20))}
- MA60\uFF1A${fmt2(average(60))}
- MA120\uFF1A${fmt2(average(120))}
- MACD DIF\uFF1A${fmt2(now.dif, 3)}
- MACD DEA\uFF1A${fmt2(now.dea, 3)}
- MACD \u67F1\u72C0\u503C\uFF1A${fmt2(now.macd, 3)}
- KD K\uFF1A${fmt2(now.k, 2)}
- KD D\uFF1A${fmt2(now.d, 2)}

\u3010\u6CD5\u4EBA\u7576\u65E5\u8CB7\u8CE3\u8D85\u3011
- \u5916\u8CC7\uFF1A${institutional("foreign")}
- \u6295\u4FE1\uFF1A${institutional("trust")}
- \u81EA\u71DF\u5546\uFF1A${institutional("dealer")}

\u3010\u76EE\u524D 7 \u9805\u591A\u982D\u689D\u4EF6\u3011
${conditionLines}

\u3010\u6B77\u53F2\u76F8\u4F3C\u689D\u4EF6\u7D71\u8A08\u3011
${horizonLines}

\u3010\u8FD1\u516B\u671F\u8CA1\u52D9\u6458\u8981\u3011
${financialLines}

\u8ACB\u4F9D\u5E8F\u5B8C\u6210\u4EE5\u4E0B\u5206\u6790\uFF1A
1. \u57FA\u672C\u9762\uFF1A\u71DF\u6536\u3001\u7372\u5229\u7387\u3001EPS\u3001\u4F30\u503C\u8207\u7522\u696D\u4F4D\u7F6E\uFF1B\u6307\u51FA\u8CC7\u6599\u4E0D\u8DB3\u8655\u3002
2. \u6280\u8853\u9762\uFF1A\u65E5\u7DDA\uFF0F\u4E2D\u671F\u8DA8\u52E2\u3001\u5747\u7DDA\u3001MACD\u3001KD\u3001\u91CF\u50F9\uFF0C\u63D0\u51FA\u4E3B\u8981\u652F\u6490\u8207\u58D3\u529B\u5340\u3002
3. \u7C4C\u78BC\u9762\uFF1A\u89E3\u8B80\u5916\u8CC7\u3001\u6295\u4FE1\u3001\u81EA\u71DF\u5546\u76EE\u524D\u8A0A\u865F\uFF0C\u4F46\u4E0D\u8981\u628A\u55AE\u65E5\u6CD5\u4EBA\u6578\u64DA\u904E\u5EA6\u89E3\u8B80\u3002
4. \u5927\u6578\u64DA\uFF1A\u89E3\u8B80\u6B77\u53F2\u76F8\u4F3C\u689D\u4EF6\u7684\u6A23\u672C\u6578\u3001\u4E0A\u6F32\u6BD4\u4F8B\u3001\u5E73\u5747\uFF0F\u4E2D\u4F4D\u6578\u3001\u76C8\u8667\u6BD4\u8207\u6700\u5927\u4E0D\u5229\u8B8A\u52D5\uFF0C\u63D0\u9192\u6A23\u672C\u504F\u8AA4\u8207\u975E\u9810\u6E2C\u6027\u3002
5. \u5E02\u5834\u6B63\u5728\u5B9A\u50F9\u4EC0\u9EBC\uFF1A\u54EA\u4E9B\u5229\u591A\uFF0F\u5229\u7A7A\u53EF\u80FD\u5DF2\u53CD\u6620\uFF0C\u54EA\u4E9B\u53EF\u80FD\u5F62\u6210\u9810\u671F\u5DEE\u3002
6. \u6700\u65B0\u65B0\u805E\u8207\u50AC\u5316\u56E0\u7D20\uFF1A\u641C\u5C0B\u8FD1\u671F\u91CD\u8981\u65B0\u805E\u3001\u6CD5\u8AAA\u3001\u6708\u71DF\u6536\u3001\u7522\u696D\u5831\u50F9\u3001\u653F\u7B56\u3001\u532F\u7387\u7B49\uFF0C\u6A19\u793A\u4F86\u6E90\u8207\u65E5\u671F\u3002
7. \u5EFA\u7ACB\u591A\u982D\u3001\u4E2D\u6027\u9707\u76EA\u3001\u7A7A\u982D\u4E09\u7A2E\u60C5\u5883\uFF0C\u5404\u81EA\u5217\u51FA\u6210\u7ACB\u689D\u4EF6\u3001\u5931\u6548\u689D\u4EF6\u8207\u9700\u8981\u89C0\u5BDF\u7684\u50F9\u4F4D\uFF0F\u4E8B\u4EF6\u3002
8. \u5217\u51FA 5 \u500B\u4E3B\u8981\u98A8\u96AA\u8207\u672A\u4F86 3\uFF5E6 \u500B\u6708\u503C\u5F97\u8FFD\u8E64\u7684\u50AC\u5316\u4E8B\u4EF6\u3002
9. \u6700\u5F8C\u505A\u4E00\u500B\u7C21\u6F54\u5100\u8868\u677F\uFF0C\u5206\u6210\u57FA\u672C\u9762\u3001\u6280\u8853\u9762\u3001\u7C4C\u78BC\u9762\u3001\u7522\u696D\u9762\u3001\u65B0\u805E\u9762\u3001\u98A8\u96AA\uFF0C\u8AAA\u660E\u76EE\u524D\u652F\u6301\u591A\u65B9\u8207\u652F\u6301\u7A7A\u65B9\u7684\u8B49\u64DA\u3002

\u91CD\u8981\uFF1A\u672C\u6A5F\u63D0\u4F9B\u7684\u662F\u6B77\u53F2\u8CC7\u6599\u6458\u8981\uFF0C\u4E0D\u4EE3\u8868\u5373\u6642\u884C\u60C5\u3002\u8ACB\u628A\u6700\u65B0\u5916\u90E8\u8CC7\u6599\u8207\u672C\u6A5F\u622A\u6B62\u65E5\u5206\u958B\u8AAA\u660E\u3002`;
    }
    async function copyChatGPTPrompt() {
      const text = buildChatGPTPrompt();
      if (window.StocklabMobile?.copyText) {
        await window.StocklabMobile.copyText(text);
        $2("mobile-status").textContent = "\u5DF2\u8907\u88FD ChatGPT \u5206\u6790\u5167\u5BB9\u3002";
        return;
      }
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      $2("mobile-status").textContent = "\u5DF2\u8907\u88FD ChatGPT \u5206\u6790\u5167\u5BB9\uFF0C\u8ACB\u8CBC\u5230\u65B0\u5C0D\u8A71\u3002";
    }
    async function shareChatGPTPrompt() {
      const stock = selected2(), text = buildChatGPTPrompt();
      if (window.StocklabMobile?.shareText) {
        await window.StocklabMobile.shareText(`${stock.id} ${stock.name || ""}\uFF5C\u53F0\u80A1\u7814\u7A76\u5BA4\u5206\u6790`, text);
        return;
      }
      if (navigator.share) try {
        await navigator.share({ title: `${stock.id} ${stock.name || ""}\uFF5C\u53F0\u80A1\u7814\u7A76\u5BA4\u5206\u6790`, text });
        $2("mobile-status").textContent = "\u5DF2\u958B\u555F\u5206\u4EAB\u9078\u55AE\u3002";
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
      await copyChatGPTPrompt();
    }
    async function openChatGPTPrompt() {
      if (window.StocklabMobile?.openChatGPT) {
        const stock = selected2(), result = await window.StocklabMobile.openChatGPT(`${stock.id} ${stock.name || ""}\uFF5C\u53F0\u80A1\u7814\u7A76\u5BA4\u5206\u6790`, buildChatGPTPrompt());
        if (result?.opened) return;
      }
      const opened = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
      try {
        await copyChatGPTPrompt();
        $2("mobile-status").textContent = "\u5DF2\u8907\u88FD\u5206\u6790\u5167\u5BB9\u4E26\u958B\u555F ChatGPT\uFF0C\u8ACB\u8CBC\u5230\u65B0\u5C0D\u8A71\u4E26\u9078\u64C7 High\u3002";
      } catch {
        if (!opened) await shareChatGPTPrompt();
        else $2("mobile-status").textContent = "\u5DF2\u958B\u555F ChatGPT\uFF1B\u8ACB\u5148\u6309\u300C\u8907\u88FD\u5206\u6790\u5167\u5BB9\u300D\u518D\u8CBC\u4E0A\u3002";
      }
    }
    function previewChatGPTPrompt() {
      $2("chatgpt-prompt").value = buildChatGPTPrompt();
      $2("chatgpt-dialog").showModal();
    }
    for (const id of ["similarity-threshold", "minimum-samples"]) $2(id).onchange = renderBigData;
    for (const id of ["scan-horizon", "scan-threshold", "scan-min-samples", "scan-min-score", "scan-only-qualified"]) $2(id).onchange = renderScanner;
    for (const id of ["quick-chatgpt", "open-chatgpt", "dialog-open-chatgpt"]) $2(id).onclick = openChatGPTPrompt;
    for (const id of ["copy-chatgpt", "dialog-copy-chatgpt"]) $2(id).onclick = copyChatGPTPrompt;
    for (const id of ["share-chatgpt", "dialog-share-chatgpt"]) $2(id).onclick = shareChatGPTPrompt;
    $2("preview-chatgpt").onclick = previewChatGPTPrompt;
    return { render() {
      bundle2 = getBundle();
      stockId2 = selected2().id;
      renderBigData();
      renderScanner();
    } };
  }

  // mobile/src/android064.js
  var { Capacitor, CapacitorHttp, registerPlugin, Preferences, Filesystem, Directory, Encoding, App, Share } = window.StocklabCapacitor;
  var el = (id) => document.getElementById(id);
  var status = (text) => {
    el("mobile-status").textContent = text;
  };
  var native = Capacitor.isNativePlatform();
  var ChatGPTLauncher = registerPlugin("ChatGPTLauncher");
  var TOKEN_KEY = "twlab.finmind.token";
  async function bootstrap() {
    const settings = {};
    for (const key of ["twlab.watch", "twlab.positions"]) try {
      settings[key] = (await Preferences.get({ key })).value;
    } catch {
      settings[key] = null;
    }
    const snapshots = createSnapshotStore({
      async read(path) {
        try {
          return (await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 })).data;
        } catch (e) {
          if (/not exist|not found|ENOENT/i.test(e.message || "") || String(e.code) === "OS-PLUG-FILE-0008") return null;
          throw e;
        }
      },
      write: (path, data) => Filesystem.writeFile({ path, data, directory: Directory.Data, encoding: Encoding.UTF8 }),
      getSlot: async () => (await Preferences.get({ key: "twlab.market.slot" })).value,
      setSlot: (value) => Preferences.set({ key: "twlab.market.slot", value })
    });
    let saved = null, warning = "", storedToken = "";
    try {
      const restored = await snapshots.load();
      saved = restored.bundle;
      if (restored.recovered) warning = "\u5DF2\u6062\u5FA9\u524D\u4E00\u4EFD\u4FDD\u5B58\u8CC7\u6599\u3002";
      if (restored.damaged) warning = "\u4FDD\u5B58\u8CC7\u6599\u7121\u6CD5\u8B80\u53D6\uFF0C\u8ACB\u91CD\u65B0\u6293\u53D6\u6216\u532F\u5165 JSON\u3002";
    } catch {
      warning = "\u7121\u6CD5\u8B80\u53D6\u88DD\u7F6E\u884C\u60C5\uFF0C\u8ACB\u6AA2\u67E5\u5132\u5B58\u7A7A\u9593\u3002";
    }
    try {
      storedToken = (await Preferences.get({ key: TOKEN_KEY })).value || "";
    } catch {
      warning = "\u5DF2\u4FDD\u5B58\u7684 Token \u7121\u6CD5\u8B80\u53D6\uFF0C\u8ACB\u91CD\u65B0\u8F38\u5165\u3002";
    }
    const loadMarket = createFinMindClient(async (options) => {
      if (native) return CapacitorHttp.get(options);
      const url = new URL(options.url);
      for (const [k, v] of Object.entries(options.params)) url.searchParams.set(k, v);
      const response = await fetch(url, { headers: options.headers, cache: "no-store" });
      return { status: response.status, data: await response.text() };
    });
    let settingWrites = Promise.resolve();
    window.StocklabMobile = {
      restoredBundle: saved,
      setupExtra: (context) => createScannerUI(context),
      readLocal(key, fallback) {
        try {
          return JSON.parse(settings[key]) ?? fallback;
        } catch {
          return fallback;
        }
      },
      writeLocal(key, value) {
        settings[key] = JSON.stringify(value);
        const encoded = settings[key];
        settingWrites = settingWrites.catch(() => {
        }).then(() => Preferences.set({ key, value: encoded }));
        return settingWrites;
      },
      async bundleChanged(bundle2) {
        if (bundle2.mode === "demo") {
          status("\u6A21\u64EC\u8CC7\u6599\u6A21\u5F0F\uFF1B\u4E0A\u6B21\u771F\u5BE6\u8CC7\u6599\u4ECD\u4FDD\u7559\u3002");
          return;
        }
        status("\u6B63\u5728\u4FDD\u5B58\u5230\u624B\u6A5F\u2026");
        await snapshots.save(bundle2);
        status(bundle2.stocks.length ? `\u5DF2\u4FDD\u5B58\u81F3\u624B\u6A5F \xB7 ${bundle2.stocks.length} \u6A94 \xB7 \u53EF\u96E2\u7DDA\u4F7F\u7528` : "\u5DF2\u79FB\u9664\u6240\u6709\u884C\u60C5\u8CC7\u6599\uFF1BToken \u8207\u6301\u80A1\u8A2D\u5B9A\u4FDD\u7559\u3002");
      },
      async fetchMarket(query) {
        el("fetch-progress").hidden = false;
        try {
          storedToken = el("remember-token").checked ? query.token : "";
          if (storedToken) await Preferences.set({ key: TOKEN_KEY, value: storedToken });
          else await Preferences.remove({ key: TOKEN_KEY });
          return await loadMarket({ ...query, onProgress: (text) => {
            el("fetch-progress").textContent = text;
          } });
        } finally {
          el("fetch-progress").hidden = true;
        }
      },
      async copyText(text) {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else {
          const area = document.createElement("textarea");
          area.value = text;
          document.body.append(area);
          area.select();
          if (!document.execCommand("copy")) throw Error("\u8ACB\u624B\u52D5\u8907\u88FD\u5206\u6790\u5167\u5BB9");
          area.remove();
        }
      },
      async openChatGPT(title, text) {
        if (!native) return { opened: false };
        try {
          return await ChatGPTLauncher.open({ title, text });
        } catch {
          return { opened: false };
        }
      },
      async shareText(title, text) {
        await Share.share({ title, text, dialogTitle: "\u9078\u64C7 ChatGPT \u6216\u5176\u4ED6 App" });
      },
      async download(name, content, type) {
        if (!native) {
          const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement("a");
          link.href = url;
          link.download = name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 6e4);
          return;
        }
        const path = `${Date.now()}-${name.replace(/[\\/:*?"<>|]/g, "_")}`;
        if (content instanceof Blob) {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(content);
          });
          await Filesystem.writeFile({ path, data, directory: Directory.Cache });
        } else await Filesystem.writeFile({ path, data: String(content), directory: Directory.Cache, encoding: Encoding.UTF8 });
        const file = await Filesystem.getUri({ path, directory: Directory.Cache });
        await Share.share({ title: name, url: file.uri, dialogTitle: `\u532F\u51FA ${name}` });
        status(`\u5DF2\u6E96\u5099\u532F\u51FA ${name}`);
      },
      ready() {
        el("runtime-label").textContent = native ? "v0.7.1 \xB7 Android \xB7 Big Data" : "v0.7.1 \xB7 Android \u9810\u89BD";
        el("fetch-form").hidden = false;
        el("token").value = storedToken;
        el("remember-token").checked = true;
        const end = /* @__PURE__ */ new Date(), start = /* @__PURE__ */ new Date();
        start.setUTCFullYear(start.getUTCFullYear() - 3);
        el("fetch-start").value = start.toISOString().slice(0, 10);
        el("fetch-end").value = end.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
        el("forget-token").onclick = async () => {
          try {
            await Preferences.remove({ key: TOKEN_KEY });
            storedToken = "";
            el("token").value = "";
            status("\u5DF2\u79FB\u9664\u4FDD\u5B58\u7684 Token");
          } catch {
            el("error").hidden = false;
            el("error").textContent = "Token \u79FB\u9664\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66\u3002";
          }
        };
        el("open-data").addEventListener("click", () => {
          if (storedToken) el("token").value = storedToken;
        });
        document.querySelectorAll("nav button").forEach((button) => button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "instant" })));
        if (warning) {
          el("error").hidden = false;
          el("error").textContent = warning;
        }
      }
    };
    await Promise.resolve().then(() => (init_app(), app_exports));
    if (native) await App.addListener("backButton", () => {
      const dialog = document.querySelector("dialog[open]");
      if (dialog) {
        dialog.close();
        return;
      }
      if (!el("scanner").classList.contains("active")) document.querySelector('[data-page="scanner"]').click();
      else App.minimizeApp();
    });
  }
  bootstrap().catch((e) => window.stocklabStartup.fail(e.message));
})();
