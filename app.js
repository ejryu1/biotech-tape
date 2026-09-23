(() => {
  const data = window.tapeData;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  if (!data || !Array.isArray(data.dates) || !data.dates.length) {
    $("body").innerHTML = `<tr><td class="empty" colspan="14">아직 가격 데이터가 없습니다. GitHub의 Actions 탭에서 “Update Prices”를 한 번 실행해 주세요.</td></tr>`;
    return;
  }

  const U = data.universe;
  const PORT = new Set(U.portfolio || []);
  const BNAME = { long: "Crowded Long", short: "Heavily Shorted", battle: "Battleground" };
  const dates = data.dates, last = dates.length - 1;
  const PERIODS = { "1D": 1, "1W": 5, "1M": 21, "3M": 63, "1Y": 252 };
  const COLS = [
    { k: "t", label: "티커" }, { k: "n", label: "회사" }, { k: "b", label: "바스켓" },
    { k: "ret", label: "등락", r: 1 }, { k: "d1", label: "1D", r: 1 }, { k: "px", label: "종가", r: 1 },
    { k: "spark", label: "60일", nosort: 1 },
    { k: "stage", label: "단계" }, { k: "area", label: "질환" }, { k: "mod", label: "모달리티" },
    { k: "mcap", label: "시총 $M*", r: 1 }, { k: "hds", label: "#Hds*", r: 1 }, { k: "siOs", label: "SI %OS*", r: 1 }, { k: "siFlt", label: "SI %Flt*", r: 1 }
  ];
  const state = { period: "1D", basket: "all", area: "", stage: "", port: false, q: "", sort: { k: "ret", dir: -1 } };
  try { const p = localStorage.getItem("tape.period"); if (p && (p in PERIODS || p === "YTD")) state.period = p; } catch (e) {}

  const fmtPct = v => v == null || !isFinite(v) ? "–" : (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  const cls = v => v == null || !isFinite(v) ? "flat" : v > 0.05 ? "up" : v < -0.05 ? "dn" : "flat";
  const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  const lastIdx = s => { for (let i = last; i >= 0; i--) if (s[i] != null) return i; return -1; };
  const valAtOrBefore = (s, i) => { for (let j = i; j >= 0; j--) if (s[j] != null) return s[j]; return null; };
  function startIndex(period) {
    if (period === "YTD") { const y = dates[last].slice(0, 4); const i = dates.findIndex(d => d.startsWith(y)); return Math.max(0, i - 1); }
    return Math.max(0, last - PERIODS[period]);
  }

  function computeRows() {
    const si = startIndex(state.period);
    return U.tickers.map(u => {
      const s = data.closes[u.t] || [];
      const li = lastIdx(s), px = li >= 0 ? s[li] : null;
      const stale = li >= 0 && li < last;
      const prev = li > 0 ? valAtOrBefore(s, li - 1) : null;
      const base = valAtOrBefore(s, si);
      const d1 = px != null && prev ? (px / prev - 1) * 100 : null;
      const ret = px != null && base ? (px / base - 1) * 100 : null;
      return { ...u, px, d1, ret, stale, spark: s.slice(-60) };
    });
  }

  function heat(v) {
    const cs = getComputedStyle(document.documentElement);
    const a = Math.min(Math.abs(v) / (state.period === "1D" ? 6 : 25), 1) * 0.85 + 0.15;
    const col = (v >= 0 ? cs.getPropertyValue("--up") : cs.getPropertyValue("--down")).trim();
    return `color-mix(in srgb, ${col} ${Math.round(a * 100)}%, var(--sunk))`;
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

  function renderBaskets(rows) {
    $("baskets").innerHTML = ["long", "short", "battle"].map(b => {
      const rs = rows.filter(r => r.b === b && r.ret != null).sort((a, c) => c.ret - a.ret);
      const v = rs.map(r => r.ret), avg = v.reduce((a, c) => a + c, 0) / (v.length || 1), med = median(v);
      const adv = v.filter(x => x > 0).length, dec = v.filter(x => x < 0).length;
      return `<button type="button" class="bk" data-b="${b}" aria-pressed="${state.basket === b}">
        <div class="bk-top"><span class="bk-name">${BNAME[b]}</span><span class="bk-n">${rows.filter(r => r.b === b).length}종목 · ${state.period}</span></div>
        <div class="bk-stats"><div class="stat"><b class="${cls(avg)}">${v.length ? fmtPct(avg) : "–"}</b><span>평균</span></div>
        <div class="stat"><b class="${cls(med)}">${v.length ? fmtPct(med) : "–"}</b><span>중앙값</span></div></div>
        <div class="strip">${rs.map(r => `<i title="${esc(r.t)} ${fmtPct(r.ret)}" style="background:${heat(r.ret)}"></i>`).join("")}</div>
        <div class="adv">상승 ${adv} · 하락 ${dec}</div></button>`;
    }).join("");
    $("baskets").querySelectorAll(".bk").forEach(el => el.onclick = () => setBasket(state.basket === el.dataset.b ? "all" : el.dataset.b));
  }

  function fillSelect(id, vals, cur, lbl) {
    const opts = [...new Set(vals)].sort();
    $(id).innerHTML = `<option value="">${lbl}</option>` + opts.map(o => `<option ${o === cur ? "selected" : ""}>${esc(o)}</option>`).join("");
  }

  function render() {
    const all = computeRows();
    renderBaskets(all);
    const q = state.q.trim().toLowerCase();
    const rows = all.filter(r => (state.basket === "all" || r.b === state.basket) && (!state.area || r.area === state.area) && (!state.stage || r.stage === state.stage) && (!state.port || PORT.has(r.t)) && (!q || r.t.toLowerCase().includes(q) || String(r.n).toLowerCase().includes(q)));
    const { k, dir } = state.sort;
    rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir; });
    $("count").textContent = `${rows.length} / ${all.length}`;
    $("head").innerHTML = COLS.map(c => `<th class="${c.r ? "r" : ""}" data-k="${c.k}" ${c.nosort ? "" : 'tabindex="0"'} ${state.sort.k === c.k ? `aria-sort="${dir > 0 ? "ascending" : "descending"}"` : ""}>${c.k === "ret" ? state.period : c.label}</th>`).join("");
    $("head").querySelectorAll("th[tabindex]").forEach(th => {
      const go = () => { const kk = th.dataset.k; state.sort = state.sort.k === kk ? { k: kk, dir: -state.sort.dir } : { k: kk, dir: ["t", "n", "b", "stage", "area", "mod"].includes(kk) ? 1 : -1 }; render(); };
      th.onclick = go; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
    const scale = state.period === "1D" ? 10 : 40;
    $("body").innerHTML = rows.length ? rows.map(r => {
      const w = r.ret == null ? 0 : Math.min(Math.abs(r.ret) / scale, 1) * 50;
      const bar = r.ret == null ? "" : `<i style="${r.ret >= 0 ? "left:50%" : "right:50%"};width:${w}%;background:var(${r.ret >= 0 ? "--up" : "--down"})"></i>`;
      return `<tr>
        <td class="tk">${esc(r.t)}${PORT.has(r.t) ? '<span class="dot" title="내 포트"></span>' : ""}</td>
        <td class="nm" title="${esc(r.n)}">${esc(r.n)}</td>
        <td><span class="pill ${r.b}">${BNAME[r.b]}</span></td>
        <td class="r"><div class="chgcell"><div class="bar">${bar}</div><span class="num ${cls(r.ret)}">${fmtPct(r.ret)}</span></div></td>
        <td class="r num ${cls(r.d1)}">${fmtPct(r.d1)}</td>
        <td class="r mono${r.stale ? " muted" : ""}" ${r.stale ? 'title="최신 거래일 데이터 없음"' : ""}>${r.px != null ? r.px.toFixed(2) : "–"}</td>
        <td>${spark(r.spark)}</td>
        <td class="muted">${esc(r.stage)}</td><td>${esc(r.area)}</td><td class="muted">${esc(r.mod)}</td>
        <td class="r mono">${r.mcap != null ? Number(r.mcap).toLocaleString() : "–"}</td>
        <td class="r mono">${r.hds ?? "–"}</td>
        <td class="r mono">${r.siOs != null ? r.siOs.toFixed(1) + "%" : "–"}</td>
        <td class="r mono">${r.siFlt != null ? r.siFlt.toFixed(1) + "%" : "–"}</td></tr>`;
    }).join("") : `<tr><td class="empty" colspan="14">조건에 맞는 종목이 없습니다.</td></tr>`;
  }

  function setBasket(b) { state.basket = b; document.querySelectorAll("#basketSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.b === b)); render(); }
  function setPeriod(p) { state.period = p; try { localStorage.setItem("tape.period", p); } catch (e) {} document.querySelectorAll("#periodSeg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.p === p)); render(); }

  document.querySelectorAll("#basketSeg button").forEach(x => x.onclick = () => setBasket(x.dataset.b));
  document.querySelectorAll("#periodSeg button").forEach(x => x.onclick = () => setPeriod(x.dataset.p));
  $("areaSel").onchange = e => { state.area = e.target.value; render(); };
  $("stageSel").onchange = e => { state.stage = e.target.value; render(); };
  $("portOnly").onchange = e => { state.port = e.target.checked; render(); };
  $("q").oninput = e => { state.q = e.target.value; render(); };

  fillSelect("areaSel", U.tickers.map(r => r.area), "", "모든 질환 영역");
  fillSelect("stageSel", U.tickers.map(r => r.stage), "", "모든 단계");
  $("lastSession").textContent = data.lastSession || "–";
  $("updated").textContent = (data.updatedAt || "").replace("T", " ").replace("Z", " UTC");
  $("meta").textContent = `* 시총·보유기관 수·공매도 비율은 ${U.asOf} ${U.source} 스냅샷 값입니다.` + (data.missing && data.missing.length ? ` 가격 미수신: ${data.missing.join(", ")}` : "");
  setPeriod(state.period);
})();
