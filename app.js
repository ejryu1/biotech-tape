(() => {
  const data = window.tapeData;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  if (!data || !Array.isArray(data.dates) || !data.dates.length) {
    $("body").innerHTML = `<tr><td class="empty" colspan="14">아직 가격 데이터가 없습니다. GitHub의 Actions 탭에서 “Update Prices”를 한 번 실행해 주세요.</td></tr>`;
    return;
  }

  // ---- extra styles for the daily view (kept here so index.html needs no change)
  const st = document.createElement("style");
  st.textContent = `
    [hidden]{display:none!important}
    .viewbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .viewbar select{font-family:var(--mono);font-size:13px}
    .navbtn{border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:5px 10px;cursor:pointer;font-family:var(--mono)}
    .navbtn[disabled]{opacity:.4;cursor:default}
    td.hc{font-family:var(--mono);font-size:12px;text-align:right;padding:7px 8px;min-width:58px}
    th.hc{text-align:right;padding:9px 8px}
    th.hc.sel,td.hc.sel{box-shadow:inset 1px 0 var(--accent),inset -1px 0 var(--accent)}
    th.hc.sel{color:var(--accent)}
  `;
  document.head.appendChild(st);

  const U = data.universe;
  const PORT = new Set(U.portfolio || []);
  const BNAME = { long: "Crowded Long", short: "Heavily Shorted", battle: "Battleground" };
  const dates = data.dates, last = dates.length - 1;
  const PERIODS = { "1D": 1, "1W": 5, "1M": 21, "3M": 63, "1Y": 252 };
  const NDAYS = 10;
  const state = { mode: "daily", di: last, period: "1W", basket: "all", area: "", stage: "", port: false, q: "", sort: { k: "ret", dir: -1 } };
  try {
    const m = localStorage.getItem("tape.mode"); if (m === "daily" || m === "period") state.mode = m;
    const p = localStorage.getItem("tape.period"); if (p && (p in PERIODS || p === "YTD")) state.period = p;
  } catch (e) {}

  const fmtPct = v => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  const cls = v => v == null || !isFinite(v) ? "flat" : v > 0.05 ? "up" : v < -0.05 ? "dn" : "flat";
  const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const valAtOrBefore = (s, i) => { for (let j = i; j >= 0; j--) if (s[j] != null) return s[j]; return null; };
  const short = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const dayChg = (s, i) => (i > 0 && s[i] != null) ? (() => { const p = valAtOrBefore(s, i - 1); return p ? (s[i] / p - 1) * 100 : null; })() : null;

  function heatBg(v, scale) {
    if (v == null) return "transparent";
    const cs = getComputedStyle(document.documentElement);
    const a = Math.min(Math.abs(v) / scale, 1) * 0.8 + 0.08;
    const col = (v >= 0 ? cs.getPropertyValue("--up") : cs.getPropertyValue("--down")).trim();
    return `color-mix(in srgb, ${col} ${Math.round(a * 100)}%, var(--surface))`;
  }
  const heatFg = (v, scale) => v != null && Math.abs(v) / scale > 0.55 ? "#fff" : "var(--ink)";

  function computeRows() {
    const ei = state.mode === "daily" ? state.di : last;
    let si = null;
    if (state.mode === "period") {
      if (state.period === "YTD") { const y = dates[last].slice(0, 4); si = Math.max(0, dates.findIndex(d => d.startsWith(y)) - 1); }
      else si = Math.max(0, last - PERIODS[state.period]);
    }
    return U.tickers.map(u => {
      const s = data.closes[u.t] || [];
      const px = s[ei] ?? null;
      const d1 = dayChg(s, ei);
      let ret = d1;
      if (state.mode === "period") { const base = valAtOrBefore(s, si), p = valAtOrBefore(s, last); ret = p != null && base ? (p / base - 1) * 100 : null; }
      const row = { ...u, px: state.mode === "period" ? valAtOrBefore(s, last) : px, d1, ret, spark: s.slice(Math.max(0, ei - 59), ei + 1) };
      if (state.mode === "daily") for (let j = 1; j < NDAYS; j++) row["h" + j] = ei - j >= 0 ? dayChg(s, ei - j) : null;
      return row;
    });
  }

  function spark(s) {
    const pts = s.map((v, i) => [i, v]).filter(p => p[1] != null);
    if (pts.length < 2) return "";
    const w = 96, h = 24, lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), rng = hi - lo || 1, n = s.length - 1 || 1;
    const xy = pts.map(([i, v]) => [(i / n) * (w - 4) + 2, h - 3 - ((v - lo) / rng) * (h - 6)]);
    const up = pts[pts.length - 1][1] >= pts[0][1];
    const d = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
    const e = xy[xy.length - 1];
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(${up ? "--up" : "--down"})" stroke-width="1.4" stroke-linejoin="round"/><circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="2" fill="var(${up ? "--up" : "--down"})"/></svg>`;
  }

  const label = () => state.mode === "daily" ? short(dates[state.di]) : state.period;

  function renderBaskets(rows) {
    const scale = state.mode === "daily" || state.period === "1D" ? 6 : 25;
    $("baskets").innerHTML = ["long", "short", "battle"].map(b => {
      const rs = rows.filter(r => r.b === b && r.ret != null).sort((a, c) => c.ret - a.ret);
      const v = rs.map(r => r.ret), avg = v.reduce((a, c) => a + c, 0) / (v.length || 1), med = median(v);
      const adv = v.filter(x => x > 0).length, dec = v.filter(x => x < 0).length;
      return `<button type="button" class="bk" data-b="${b}" aria-pressed="${state.basket === b}">
        <div class="bk-top"><span class="bk-name">${BNAME[b]}</span><span class="bk-n">${rows.filter(r => r.b === b).length}종목 · ${label()}</span></div>
        <div class="bk-stats"><div class="stat"><b class="${cls(avg)}">${v.length ? fmtPct(avg) : "–"}</b><span>평균</span></div>
        <div class="stat"><b class="${cls(med)}">${v.length ? fmtPct(med) : "–"}</b><span>중앙값</span></div></div>
        <div class="strip">${rs.map(r => `<i title="${esc(r.t)} ${fmtPct(r.ret)}" style="background:${heatBg(r.ret, scale)}"></i>`).join("")}</div>
        <div class="adv">상승 ${adv} · 하락 ${dec}</div></button>`;
    }).join("");
    $("baskets").querySelectorAll(".bk").forEach(el => el.onclick = () => setBasket(state.basket === el.dataset.b ? "all" : el.dataset.b));
  }

  function columns() {
    const cols = [{ k: "t", label: "티커" }, { k: "n", label: "회사" }, { k: "b", label: "바스켓" }];
    if (state.mode === "daily") {
      cols.push({ k: "ret", label: short(dates[state.di]), hc: 1, sel: 1 });
      for (let j = 1; j < NDAYS; j++) if (state.di - j >= 1) cols.push({ k: "h" + j, label: short(dates[state.di - j]), hc: 1 });
      cols.push({ k: "px", label: "종가", r: 1 });
    } else {
      cols.push({ k: "ret", label: state.period, r: 1, bar: 1 });
      if (state.period !== "1D") cols.push({ k: "d1", label: "1D", r: 1 });
      cols.push({ k: "px", label: "종가", r: 1 });
    }
    cols.push({ k: "spark", label: "60일", nosort: 1 },
      { k: "stage", label: "단계" }, { k: "area", label: "질환" }, { k: "mod", label: "모달리티" },
      { k: "mcap", label: "시총 $M*", r: 1 }, { k: "hds", label: "#Hds*", r: 1 }, { k: "siOs", label: "SI %OS*", r: 1 }, { k: "siFlt", label: "SI %Flt*", r: 1 });
    return cols;
  }

  function cell(c, r) {
    const v = r[c.k];
    switch (c.k) {
      case "t": return `<td class="tk">${esc(r.t)}${PORT.has(r.t) ? '<span class="dot" title="내 포트"></span>' : ""}</td>`;
      case "n": return `<td class="nm" title="${esc(r.n)}">${esc(r.n)}</td>`;
      case "b": return `<td><span class="pill ${r.b}">${BNAME[r.b]}</span></td>`;
      case "px": return `<td class="r mono">${v != null ? v.toFixed(2) : "–"}</td>`;
      case "spark": return `<td>${spark(r.spark)}</td>`;
      case "stage": case "mod": return `<td class="muted">${esc(v)}</td>`;
      case "area": return `<td>${esc(v)}</td>`;
      case "mcap": return `<td class="r mono">${v != null ? Number(v).toLocaleString() : "–"}</td>`;
      case "hds": return `<td class="r mono">${v ?? "–"}</td>`;
      case "siOs": case "siFlt": return `<td class="r mono">${v != null ? v.toFixed(1) + "%" : "–"}</td>`;
    }
    if (c.hc) return `<td class="hc${c.sel ? " sel" : ""}" style="background:${heatBg(v, 8)};color:${heatFg(v, 8)}">${fmtPct(v)}</td>`;
    if (c.bar) {
      const scale = state.period === "1D" ? 10 : 40, w = v == null ? 0 : Math.min(Math.abs(v) / scale, 1) * 50;
      const bar = v == null ? "" : `<i style="${v >= 0 ? "left:50%" : "right:50%"};width:${w}%;background:var(${v >= 0 ? "--up" : "--down"})"></i>`;
      return `<td class="r"><div class="chgcell"><div class="bar">${bar}</div><span class="num ${cls(v)}">${fmtPct(v)}</span></div></td>`;
    }
    return `<td class="r num ${cls(v)}">${fmtPct(v)}</td>`;
  }

  function render() {
    const all = computeRows();
    renderBaskets(all);
    const cols = columns();
    if (!cols.some(c => c.k === state.sort.k)) state.sort = { k: "ret", dir: -1 };
    const q = state.q.trim().toLowerCase();
    const rows = all.filter(r => (state.basket === "all" || r.b === state.basket) && (!state.area || r.area === state.area) && (!state.stage || r.stage === state.stage) && (!state.port || PORT.has(r.t)) && (!q || r.t.toLowerCase().includes(q) || String(r.n).toLowerCase().includes(q)));
    const { k, dir } = state.sort;
    rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir; });
    $("count").textContent = `${rows.length} / ${all.length}`;
    $("head").innerHTML = cols.map(c => `<th class="${c.r ? "r" : ""}${c.hc ? " hc" : ""}${c.sel ? " sel" : ""}" data-k="${c.k}" ${c.nosort ? "" : 'tabindex="0"'} ${state.sort.k === c.k ? `aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}>${c.label}</th>`).join("");
    $("head").querySelectorAll("th[tabindex]").forEach(th => {
      const go = () => { const kk = th.dataset.k; state.sort = state.sort.k === kk ? { k: kk, dir: -state.sort.dir } : { k: kk, dir: ["t", "n", "b", "stage", "area", "mod"].includes(kk) ? 1 : -1 }; render(); };
      th.onclick = go; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
    $("body").innerHTML = rows.length ? rows.map(r => `<tr>${cols.map(c => cell(c, r)).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${cols.length}">조건에 맞는 종목이 없습니다.</td></tr>`;
    $("lastSession").textContent = state.mode === "daily" ? dates[state.di] : dates[last];
    $("prevDay").disabled = state.di <= 1; $("nextDay").disabled = state.di >= last;
  }

  // ---- view controls: [일별 | 기간] + date picker, injected next to the period buttons
  const periodSeg = $("periodSeg");
  const bar = document.createElement("div");
  bar.className = "viewbar";
  bar.innerHTML = `
    <div class="seg" id="modeSeg" role="group" aria-label="보기">
      <button type="button" data-m="daily">일별</button>
      <button type="button" data-m="period">기간</button>
    </div>
    <span id="dayBox" class="viewbar">
      <button type="button" class="navbtn" id="prevDay" aria-label="이전 거래일">‹</button>
      <select id="daySel" aria-label="거래일"></select>
      <button type="button" class="navbtn" id="nextDay" aria-label="다음 거래일">›</button>
    </span>`;
  periodSeg.parentNode.insertBefore(bar, periodSeg);
  bar.appendChild(periodSeg);
  periodSeg.querySelector('[data-p="1D"]')?.remove();
  $("daySel").innerHTML = dates.slice(1).map((d, i) => `<option value="${i + 1}">${d}</option>`).reverse().slice(0, 260).join("");

  function setMode(m) {
    state.mode = m; try { localStorage.setItem("tape.mode", m); } catch (e) {}
    document.querySelectorAll("#modeSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.m === m));
    $("dayBox").hidden = m !== "daily"; periodSeg.hidden = m !== "period";
    render();
  }
  function setDay(i) { state.di = Math.max(1, Math.min(last, i)); $("daySel").value = String(state.di); render(); }
  function setBasket(b) { state.basket = b; document.querySelectorAll("#basketSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.b === b)); render(); }
  function setPeriod(p) { state.period = p; try { localStorage.setItem("tape.period", p); } catch (e) {} periodSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.p === p)); render(); }

  document.querySelectorAll("#modeSeg button").forEach(x => x.onclick = () => setMode(x.dataset.m));
  $("daySel").onchange = e => setDay(+e.target.value);
  $("prevDay").onclick = () => setDay(state.di - 1);
  $("nextDay").onclick = () => setDay(state.di + 1);
  document.querySelectorAll("#basketSeg button").forEach(x => x.onclick = () => setBasket(x.dataset.b));
  periodSeg.querySelectorAll("button").forEach(x => x.onclick = () => setPeriod(x.dataset.p));
  $("areaSel").onchange = e => { state.area = e.target.value; render(); };
  $("stageSel").onchange = e => { state.stage = e.target.value; render(); };
  $("portOnly").onchange = e => { state.port = e.target.checked; render(); };
  $("q").oninput = e => { state.q = e.target.value; render(); };

  const fillSelect = (id, vals, lbl) => { $(id).innerHTML = `<option value="">${lbl}</option>` + [...new Set(vals)].sort().map(o => `<option>${esc(o)}</option>`).join(""); };
  fillSelect("areaSel", U.tickers.map(r => r.area), "모든 질환 영역");
  fillSelect("stageSel", U.tickers.map(r => r.stage), "모든 단계");
  $("updated").textContent = (data.updatedAt || "").replace("T", " ").replace("Z", " UTC");
  $("meta").textContent = `* 시총·보유기관 수·공매도 비율은 ${U.asOf} ${U.source} 스냅샷 값입니다. 일별 보기의 색 칸은 각 거래일의 전일 대비 등락입니다.` + (data.missing && data.missing.length ? ` 가격 미수신: ${data.missing.join(", ")}` : "");
  periodSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.p === state.period));
  $("daySel").value = String(state.di);
  setMode(state.mode);
})();
