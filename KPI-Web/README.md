# KBO Plate Index

KBO Plate Index(KPI) 웹페이지의 첫 화면입니다.

현재는 React + Vite 기반의 정적 웹 애플리케이션입니다. `index.html`과 `player.html`을 진입점으로 사용하고, 화면 컴포넌트는 `src/main.jsx`에 구성합니다.

## 현재 화면

- Google Sheet의 외부 공유용 표를 참고한 1군·2군 구단별 Rating 표
- 팀별 타자·투수 이름과 Rating을 가로형으로 배치
- 1군 9명 평균, Rating 구간별 색상, 불확실·오래된 선수의 회색 표시
- DB의 실제 `playerId`가 연결된 선수명에서 선수 상세 페이지로 이동
- 선수 기본정보, 경기별 Rating 그래프, 역할별 타격·투구 기록, 경기·타석 기록
- Apache ECharts 기반 Rating 그래프의 경기별·타석별 전환, 경기별 X축 확대, 점 hover·focus·click 상세 정보

## 데이터 연결

메인 표는 배포 환경에서 private backend의 SQLite API가 제공하는 최신 연결표를 사용합니다. API가 연결되지 않은 공개 환경에서는 오래된 참고 표를 보여주지 않고 빈 상태를 표시합니다. 로컬 개발 서버에서는 API가 아직 시작되지 않았을 때 `data/sheet_reference.json`을 참고용으로 사용할 수 있습니다. 선수 상세 화면은 backend API를 우선 사용하고, API가 실행되지 않았을 때에는 `data/player_detail.json` 임시 fixture로 돌아갑니다.

DB 병합 및 API 연결 구조는 다음과 같습니다.

- `KPI-Backend/database/kpi.db`: 크롤러 원자료와 Rating 결과를 함께 보관하는 공식 SQLite DB
- `KPI-Backend/database/images/`: `kbo-{KBO ID}.jpg` 또는 `.png` 형식의 선수 프로필 이미지
- `KPI-Backend/database/RatingImport/`: 정규화 Rating CSV를 `pa_rating_effects`와 `player_rating_snapshots`에 넣는 importer
- `KPI-Backend/api/`: SQLite를 읽어 선수 상세 JSON을 제공하는 로컬 API
- `KPI-Web/src/data.js`: 정적 JSON과 API 사이의 데이터 접근 경계

## 개발 명령

```text
npm install
npm run dev
npm run build
npm run enrich:links
```

`enrich:links`는 로컬 SQLite API의 `/api/players/link-map`을 기준으로 `data/sheet_reference.json`의 선수 링크를 다시 맞춥니다. DB나 구단별 표가 갱신된 뒤 실행하면 됩니다.

Windows에서 `npm` 명령을 바로 사용할 수 없다면 `start-dev.cmd`를 더블클릭해 개발 서버를 시작할 수 있습니다. 이 실행 파일은 작업 폴더에 준비된 휴대용 Node.js가 있으면 그것을 먼저 사용하고, 없으면 시스템에 설치된 Node.js를 사용합니다. 로컬 workspace에 sibling인 `KPI-Backend`가 있고 `dotnet`이 설치되어 있으면 별도 창에서 private SQLite API도 함께 시작합니다. public 웹 저장소만 따로 clone한 경우에는 API 없이 정적 fixture로 실행됩니다.

Fly.io의 원격 API를 사용해 프론트를 확인하려면 Vite를 시작하기 전에 PowerShell에서 다음 환경 변수를 설정합니다. Vite 환경 변수는 서버 시작 또는 빌드 시점에 읽힙니다.

```powershell
$env:VITE_API_BASE_URL = "https://kbo-plate-api-wwcwwd13.fly.dev"
npm.cmd run dev -- --host 127.0.0.1 --port 4173
```

GitHub Pages 배포 workflow에도 같은 주소를 빌드 환경으로 넣어 두었습니다. API가 응답하면 메인 화면 상단에 `SQLite 자동 구성`이 표시되고, 연결되지 않으면 표 대신 API 연결 필요 상태가 표시됩니다.

## 방향

초기 목표는 외부 사용자에게 타석 전체 로그를 보여주는 것이 아니라, 구단별 KPI를 직관적으로 보여주는 것입니다. 타석 단위 before/after와 내부 변수는 검증용 원자료로 유지하고 기본 화면에는 노출하지 않습니다.

현재 화면과 로컬 실행 방법은 이 README와 `LOCAL_USAGE.md`를 참조합니다. 데이터 수집부터 배포까지의 운영 절차는 백엔드 `ops/DAILY_UPDATE.md`를 참조합니다.

## 기타 통계 데이터 갱신

`/other/`의 팀 전력과 선수 순위는 `/api/team-ratings` 현재 스냅샷을 사용합니다. 타자·투수 전력은 각 상위 9명 평균, 팀 전력은 해당 선수 최대 18명의 산술평균인 기존 API `averages` 값입니다. 2026 아시안게임 명단 표는 별도 프런트 고정 목록이 아니라 API의 DB `rosterStatusReason=asian_games_assignment` 분류에서 구성합니다. 명단과 배정 기준은 백엔드 `ops/asian_games_roster_2026.py`에 있으며, 선수 상세의 등록·말소·부상 기록은 `/api/player`의 `rosterEvents`를 표시합니다. KBO 원본 이벤트와 사용자 확인 배정 이벤트는 출처 유형을 구분해 보존합니다. 순위표의 변동량은 `/api/rating-diffs`가 반환한 가장 최근 경기일의 `ratingDelta`입니다. 그날 출전하지 않은 선수는 `—`로 표시합니다. API의 모델 버전과 기준일이 일치하지 않으면 변동량도 `—`로 표시합니다.

리그 순위는 타석 DB의 경기 결과로 계산하지 않습니다. 현재 DB에는 시즌 전체 1군 경기의 팀별 점수 행이 없으므로 승률 계산이 부정확합니다. 대신 KBO [일자별 팀 순위](https://www.koreabaseball.com/Record/TeamRank/TeamRankDaily.aspx)를 `data/standings.json`에 보관합니다. **일일 폼 갱신 후 프런트엔드 빌드·배포 전에** 아래 명령을 실행하고, JSON의 `asOf`를 폼 기준일과 대조합니다. 날짜가 다르면 그 사이 1군 경기가 없었는지 확인합니다. KBO 응답에서 기준일과 10개 구단을 확인할 수 없거나 순위가 run보다 미래 날짜이면 스크립트가 실패하며 기존 파일은 유지됩니다.

```powershell
python scripts/update-standings.py --run-manifest "../../KPI-Backend/database/daily-runs/<run-id>/manifest.json"
npm.cmd run build
```
