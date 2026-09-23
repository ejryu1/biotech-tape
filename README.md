# Biotech Positioning Tape

Crowded Longs · Heavily Shorted · Battleground 바이오 54종목의 일간·기간 등락을 보는 대시보드입니다.
GitHub Actions가 매일 아침 Yahoo Finance(yfinance)에서 종가를 받아 `data/prices.js`로 커밋하고, GitHub Pages가 화면을 띄웁니다. 전부 무료입니다.

```
GitHub Actions (06:30 KST, 화~토)
  └─ scripts/update_prices.py  →  yfinance로 2년치 수정종가 다운로드
        └─ data/prices.js 커밋
GitHub Pages
  └─ index.html + app.js  →  data/prices.js를 읽어 표시
```

## 처음 설정 (10분)

1. **레포 만들기**: GitHub에서 New repository → 이름 예: `biotech-tape`, **Public** 선택(무료 계정의 Pages는 Public 레포만 지원).
2. **파일 올리기**: 압축을 푼 폴더 안의 파일을 전부 업로드합니다 (`Add file → Upload files`에 드래그).
   - `.github` 폴더는 숨김 폴더라 맥 Finder에서 안 보일 수 있습니다. `Cmd + Shift + .`로 숨김 파일을 켜고 드래그하세요.
   - 그래도 안 올라가면 `Add file → Create new file`에서 파일 이름을 `.github/workflows/update-prices.yml`로 입력하고 내용을 붙여넣으면 됩니다.
3. **쓰기 권한 주기**: `Settings → Actions → General → Workflow permissions`에서 **Read and write permissions** 선택 후 Save.
4. **첫 데이터 받기**: `Actions` 탭 → 왼쪽 **Update Prices** → **Run workflow**. 1~2분 뒤 `data/prices.js`가 생깁니다.
5. **페이지 켜기**: `Settings → Pages → Build and deployment`에서 Source = *Deploy from a branch*, Branch = `main` / `(root)` → Save.
   몇 분 뒤 `https://<아이디>.github.io/biotech-tape/`에서 열립니다.

이후로는 매일 06:30 KST(백업 07:30)에 자동 갱신됩니다. GitHub의 예약 실행은 몇십 분 늦어질 수 있습니다.

## 종목 바꾸기

`tickers.json`을 수정하면 다음 실행부터 반영됩니다.

- `t` 티커(Yahoo 기준), `n` 회사명, `b` 바스켓(`long` / `short` / `battle`)
- `stage`, `area`, `mod`, `mcap`, `hds`, `siOs`, `siFlt`는 스냅샷 값(화면에 * 표시). 새 표를 받으면 여기 숫자를 갱신하세요.
- `portfolio` 배열에 넣은 티커는 화면에서 주황 점으로 표시되고 "내 포트 종목만" 필터에 잡힙니다.

## 문제가 생기면

- **Actions가 빨간색으로 실패**: Yahoo가 일시적으로 막은 경우가 대부분입니다. 스크립트가 3번 재시도하고, 절반 넘게 비면 기존 데이터를 지키고 실패로 끝납니다. 다음 실행을 기다리거나 Run workflow로 다시 돌리세요.
- **일부 티커만 "가격 미수신"**: 상장폐지·티커 변경일 수 있습니다. `tickers.json`에서 티커를 고치세요.
- **예약 실행이 멈춤**: 레포에 60일간 활동이 없으면 GitHub가 예약 워크플로를 끌 수 있습니다. Actions 탭에서 다시 Enable 하면 됩니다.
