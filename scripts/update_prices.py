"""Fetch daily closes for every ticker in tickers.json and write data/prices.js.

Runs in GitHub Actions (see .github/workflows/update-prices.yml).
Output: window.tapeData = {updatedAt, dates:[...], closes:{TICKER:[...]}, universe:{...}}
"""
from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
UNIVERSE = ROOT / "tickers.json"
OUT = ROOT / "data" / "prices.js"
PERIOD = "2y"          # history kept for 1W~1Y / YTD returns
ATTEMPTS = 3


def download(tickers: list[str]) -> pd.DataFrame:
    """Return a DataFrame of adjusted closes (index=date, columns=ticker)."""
    last_err = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            raw = yf.download(
                tickers, period=PERIOD, interval="1d", auto_adjust=True,
                group_by="column", progress=False, threads=True,
            )
            closes = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw[["Close"]].rename(columns={"Close": tickers[0]})
            closes = closes.dropna(how="all")
            if closes.empty:
                raise RuntimeError("empty download")
            return closes
        except Exception as err:  # noqa: BLE001 - Yahoo fails in many ways
            last_err = err
            print(f"::warning::download attempt {attempt} failed: {err}")
            time.sleep(attempt * 15)
    raise RuntimeError(f"download failed after {ATTEMPTS} attempts: {last_err}")


def retry_missing(closes: pd.DataFrame, tickers: list[str]) -> pd.DataFrame:
    """Yahoo sometimes drops single names from a batch; fetch those one by one."""
    missing = [t for t in tickers if t not in closes.columns or closes[t].dropna().empty]
    for t in missing:
        try:
            one = yf.Ticker(t).history(period=PERIOD, interval="1d", auto_adjust=True)["Close"]
            one.index = one.index.tz_localize(None) if one.index.tz is not None else one.index
            closes[t] = one.reindex(closes.index)
            print(f"refetched {t}: {one.dropna().size} rows")
        except Exception as err:  # noqa: BLE001
            print(f"::warning::{t} unavailable: {err}")
    return closes


def fill_latest(closes: pd.DataFrame, tickers: list[str]) -> pd.DataFrame:
    """Yahoo's daily bars can lag the close by hours. Fill the most recent
    sessions from intraday bars (last 30-minute close of each New York day)."""
    try:
        raw = yf.download(tickers, period="5d", interval="30m", prepost=False,
                          group_by="column", progress=False, threads=True)
        intr = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw[["Close"]].rename(columns={"Close": tickers[0]})
    except Exception as err:  # noqa: BLE001
        print(f"::warning::intraday fill skipped: {err}")
        return closes
    intr = intr.dropna(how="all")
    if intr.empty:
        return closes
    idx = intr.index.tz_convert("America/New_York") if intr.index.tz is not None else intr.index
    daily = intr.groupby(idx.date).last()
    daily.index = pd.to_datetime(daily.index)
    if closes.index.tz is not None:
        closes.index = closes.index.tz_localize(None)
    last_daily = closes.index.max()
    for day, row in daily.iterrows():
        if day > last_daily:
            closes.loc[day] = row.reindex(closes.columns)
            print(f"added {day.date()} from intraday bars ({int(row.notna().sum())} tickers)")
        elif day in closes.index:
            gaps = closes.loc[day].isna() & row.reindex(closes.columns).notna()
            if gaps.any():
                closes.loc[day, gaps[gaps].index] = row.reindex(closes.columns)[gaps]
    return closes.sort_index()


def build(closes: pd.DataFrame, universe: dict) -> dict:
    tickers = [u["t"] for u in universe["tickers"]]
    closes = closes.sort_index()
    if closes.index.tz is not None:
        closes.index = closes.index.tz_localize(None)
    dates = [d.strftime("%Y-%m-%d") for d in closes.index]

    def clean(v):
        return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), 4)

    series = {t: [clean(v) for v in closes[t].tolist()] if t in closes.columns else [None] * len(dates) for t in tickers}
    missing = [t for t, s in series.items() if all(v is None for v in s)]
    return {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lastSession": dates[-1] if dates else None,
        "dates": dates,
        "closes": series,
        "missing": missing,
        "universe": universe,
    }


def main() -> int:
    universe = json.loads(UNIVERSE.read_text(encoding="utf-8"))
    tickers = [u["t"] for u in universe["tickers"]]
    closes = fill_latest(retry_missing(download(tickers), tickers), tickers)
    payload = build(closes, universe)
    if len(payload["missing"]) > len(tickers) // 2:
        print(f"::error::too many tickers missing ({len(payload['missing'])}); keeping previous data")
        return 1
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.tapeData = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {len(payload['dates'])} sessions, last {payload['lastSession']}, missing {payload['missing']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
