# KBO Plate Index

KBO Plate Index(KPI) 웹페이지의 첫 화면입니다.

현재는 React + Vite 기반의 정적 웹 애플리케이션입니다. `index.html`과 `player.html`을 진입점으로 사용하고, 화면 컴포넌트는 `src/main.jsx`에 구성합니다.

## 현재 화면

- Google Sheet의 외부 공유용 표를 참고한 1군·2군 구단별 Rating 표
- 팀별 타자·투수 이름과 Rating을 가로형으로 배치
- 1군 9명 평균, Rating 구간별 색상, 불확실·오래된 선수의 회색 표시
- DB의 실제 `playerId`가 연결된 선수명에서 선수 상세 페이지로 이동
- 선수 기본정보, 경기별 Rating 그래프, 타격 통계, 타석 기록
- Rating 그래프의 경기별·타석별 전환, 경기별 가로 확대, 점 hover·focus·click 상세 정보

## 데이터 연결

메인 표는 현재 `data/sheet_reference.json`을 사용합니다. 표의 선수 항목에는 DB의 실제 `playerId`를 함께 기록해 정적 GitHub Pages에서도 선수별 링크가 유지되며, 로컬 개발 서버에서는 private backend의 SQLite API가 제공하는 최신 연결표로 한 번 더 갱신합니다. DB에서 확인되지 않는 항목은 다른 선수로 잘못 연결하지 않고 링크 없이 표시합니다. 선수 상세 화면은 로컬 개발 서버에서 backend의 `database/kpi.db`를 읽는 API를 우선 사용하고, API가 실행되지 않았을 때와 정적 배포 환경에서는 `data/player_detail.json` 임시 fixture로 돌아갑니다.

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

## 방향

초기 목표는 외부 사용자에게 타석 전체 로그를 보여주는 것이 아니라, 구단별 KPI를 직관적으로 보여주는 것입니다. 타석 단위 before/after와 내부 변수는 검증용 원자료로 유지하고 기본 화면에는 노출하지 않습니다.

향후 계획과 확장 순서는 `KPI_WEB_HANDOFF.md`의 **향후 제품 계획 초안**에 기록합니다. 현재는 선수 상세 화면과 경기별 Rating을 DB에 연결했고, 다음 단계는 구단 Rating 스냅샷·Diff 보기·등록·말소 이력입니다.
