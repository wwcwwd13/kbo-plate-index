# KPI DB 스키마 설계 초안

> 상태: 초안
> 목적: 크롤러가 넣을 SQLite 데이터와, 웹 표시/API가 읽을 데이터의 기본 계약을 정리한다.
> 범위: 현재 논의된 데이터 구조를 기록하는 문서다. 실제 `schema.sql`과 크롤러 구현은 이 문서를 검토한 뒤 만든다.

## 1. 전체 방향

하나의 `kpi.db` 파일 안에 여러 개의 테이블을 둔다.

```text
크롤러
  ↓
kpi.db (SQLite)
  ↓
조회 모듈/API
  ↓
HTML·CSS·JavaScript 화면
```

브라우저가 SQLite 파일을 직접 읽는 것이 아니라, API 또는 로컬 조회 모듈이 SQLite를 읽고 필요한 결과를 JSON으로 전달한다.

## 2. 설계 원칙

1. 실제 사람과 분석용 역할을 분리한다.
   - `person_id`: 실제 사람 한 명
   - `player_id`: KPI 계산에서 사용하는 역할별 선수 객체
   - 한 사람이 타자·투수로 각각 존재할 수 있다.
2. 외부 ID를 내부 Primary Key로 그대로 사용하지 않는다.
   - KBO ID는 타자·투수 역할이 나뉘면서 중복될 수 있다.
   - 내부에서 만든 `person_id`, `player_id`를 기준으로 연결한다.
3. 한 테이블의 한 행이 무엇을 뜻하는지 명확하게 한다.
   - 경기 한 행, 타석 한 행, 선수의 특정 날짜 Rating 한 행처럼 데이터 단위를 고정한다.
4. 기본 정보와 시점별 정보를 분리한다.
   - 이름·생년월일은 `people` 또는 `players`에 둔다.
   - 소속·스탯·Rating은 날짜별 테이블에 쌓는다.
5. 과거 결과를 덮어쓰지 않는다.
   - 기준일과 계산 버전을 함께 기록한다.
6. 원자료와 계산 결과를 구분한다.
   - 타석 원자료와 Rating 계산 결과는 별도 테이블에 둔다.
7. 크롤링 한 번의 실행 단위를 기록한다.
   - 언제, 어떤 출처와 버전으로 데이터를 넣었는지 `sync_runs`에 남긴다.

## 3. 식별자 구조

### 3.1 `people` — 실제 사람 정보

한 사람당 한 행이다. 선수의 역할이 타자·투수로 나뉘어도 실제 사람 정보는 중복하지 않는다.

| 필드 | 자료형 예시 | 설명 |
|---|---|---|
| `person_id` | TEXT | 내부 Primary Key |
| `name_ko` | TEXT | 한글 이름 |
| `name_en` | TEXT NULL | 영어 이름. 없을 수 있음 |
| `birth_date` | TEXT NULL | `YYYY-MM-DD` |
| `bats_hand` | TEXT NULL | 좌타·우타·스위치 등 |
| `throws_hand` | TEXT NULL | 좌투·우투 등 |
| `created_at` | TEXT | 등록 시각 |
| `updated_at` | TEXT | 수정 시각 |

`name_en`이나 생년월일이 없다고 해서 선수 식별에 이름을 Key로 사용하지 않는다.

### 3.2 `players` — 역할별 분석 선수

KPI 계산 단위의 선수다. 한 사람이 타자와 투수로 분리될 경우 `players`에는 두 행이 생긴다.

| 필드 | 자료형 예시 | 설명 |
|---|---|---|
| `player_id` | TEXT | 내부 Primary Key |
| `person_id` | TEXT | `people.person_id`를 가리키는 Foreign Key |
| `role` | TEXT | `batter` 또는 `pitcher` |
| `is_catcher` | INTEGER | 포수 여부. MVP에서는 직접 보관 가능 |
| `created_at` | TEXT | 등록 시각 |
| `updated_at` | TEXT | 수정 시각 |

권장 제약 조건:

```text
UNIQUE(person_id, role)
```

포지션이 더 복잡해지면 `player_positions` 테이블을 별도로 만들 수 있다.

### 3.3 `external_player_ids` — 외부 출처 ID 연결

KBO ID처럼 외부에서 가져온 식별자를 내부 선수와 연결한다.

| 필드 | 설명 |
|---|---|
| `external_player_id` | 내부 연결 행의 ID 또는 복합 Key |
| `player_id` | 내부 역할별 선수 ID |
| `source` | `kbo`, 통계 사이트 등 |
| `external_id` | 출처에서 받은 ID |
| `source_role` | 출처가 표시한 타자·투수 구분 |
| `season` | 해당 시즌. 필요할 때 사용 |
| `team_id` | 해당 출처 행의 구단. 필요할 때 사용 |
| `raw_name` | 원자료에 적힌 이름 |

`external_id` 단독에는 Unique 제약을 두지 않는다. 같은 KBO ID가 역할별로 반복될 수 있기 때문이다.

## 4. 기준 정보 테이블

### 4.1 `teams` — 구단

| 필드 | 설명 |
|---|---|
| `team_id` | 내부 Primary Key |
| `team_code` | 짧은 코드. 예: `kia` |
| `name_ko` | 한글 구단명 |
| `name_en` | 영어 구단명 |
| `active_from`, `active_to` | 구단명·존속 기간이 필요할 때 사용 |

### 4.2 `venues` — 경기장

| 필드 | 설명 |
|---|---|
| `venue_id` | 내부 Primary Key |
| `name_ko` | 경기장명 |
| `city` | 지역 |
| `source_name` | 원자료의 경기장명 |

타석마다 경기장 이름을 문자열로 반복 저장하지 않고, `games.venue_id`로 연결한다.

## 5. 소속 및 로스터 이력

### 5.1 `player_team_history` — 선수 소속 기간

선수가 언제 어느 구단·리그에 있었는지를 기록한다. `players`에 현재 구단 하나만 저장하는 것보다 이력 테이블이 기준이 된다.

| 필드 | 설명 |
|---|---|
| `stint_id` | 내부 Primary Key |
| `player_id` | 역할별 선수 ID |
| `team_id` | 구단 ID |
| `league` | `1군` 또는 `2군` |
| `valid_from` | 소속 시작일 |
| `valid_to` | 소속 종료일. 현재 소속이면 NULL 가능 |
| `status` | 등록·활동·말소 등 상태 |
| `source_run_id` | 적재 실행 ID |

### 5.2 `roster_events` — 등록·말소·이동 사건

선수 상태가 바뀐 사건을 별도로 기록한다.

| 필드 | 설명 |
|---|---|
| `event_id` | 내부 Primary Key |
| `event_date` | 상태 변경일 |
| `player_id` | 역할별 선수 ID |
| `team_id` | 관련 구단 |
| `event_type` | 등록·말소·1군 승격·2군 이동 등 |
| `from_league` | 이전 리그 |
| `to_league` | 변경 후 리그 |
| `source_text` | 원자료의 설명 |
| `source_run_id` | 적재 실행 ID |

## 6. 경기와 타석 원자료

### 6.1 `games` — 경기

경기 한 개당 한 행이다. 같은 날짜에 여러 경기가 있을 수 있으므로 날짜만으로 경기를 식별하지 않는다.

| 필드 | 설명 |
|---|---|
| `game_id` | 내부 Primary Key |
| `source_game_id` | 크롤링 출처의 경기 ID |
| `source` | 데이터 출처 |
| `season` | 시즌 |
| `game_date` | 경기 날짜 |
| `league` | 1군·2군 등 |
| `venue_id` | 경기장 ID |
| `home_team_id` | 홈팀 |
| `away_team_id` | 원정팀 |
| `game_type` | 정규시즌·포스트시즌 등 |
| `status` | 경기 상태 |

권장 후보 Key:

```text
UNIQUE(source, source_game_id)
```

### 6.2 `plate_appearances` — 타석 원자료

타석 한 개당 한 행이다.

| 필드 | 설명 |
|---|---|
| `pa_id` | 내부 Primary Key |
| `game_id` | 경기 ID |
| `pa_sequence` | 경기 안에서의 타석 순서 |
| `inning` | 이닝 |
| `half_inning` | 초·말 |
| `batting_order` | 타순 |
| `batting_team_id` | 공격팀 |
| `fielding_team_id` | 수비팀 |
| `batter_player_id` | 타자 역할 선수 ID |
| `pitcher_player_id` | 투수 역할 선수 ID |
| `result_code` | 타석 결과 코드 |
| `is_at_bat` | 타수 포함 여부 |
| `runs_scored` | 해당 타석에서 발생한 득점 |
| `rbi` | 타점 |
| `outs_before` | 타석 전 아웃 수 |
| `base_state_before` | 타석 전 주자 상태. KPI에 필요하면 저장 |
| `score_before` | 타석 전 점수. KPI에 필요하면 저장 |
| `raw_payload_ref` | 원자료 원문 또는 파일 위치 |
| `source_run_id` | 적재 실행 ID |

`game_date`와 경기장은 `games`를 JOIN해서 가져온다. KPI 계산이 경기 상황에 의존한다면 이닝·아웃·주자·점수 상태를 가능한 한 보존한다.

## 7. Rating과 스탯 스냅샷

### 7.1 `player_rating_snapshots` — 날짜별 선수 Rating

선수 한 명의 특정 기준일 Rating 한 건당 한 행이다. `current_rating`을 `players`에 하나만 두지 않고, 최신 행을 현재값으로 사용한다.

| 필드 | 설명 |
|---|---|
| `rating_snapshot_id` | 내부 Primary Key |
| `player_id` | 역할별 선수 ID |
| `snapshot_date` | Rating 기준일 |
| `season` | 시즌 |
| `team_id` | 해당 기준일의 구단 |
| `league` | 1군·2군 |
| `role` | 타자·투수 |
| `model_version` | KPI 계산 버전 |
| `rating` | 대표 Rating |
| `rating_delta` | 비교 기준일 대비 변화량. 저장할지 계산할지 결정 필요 |
| `rank` | 전체 또는 리그 순위. 필요할 때 저장 |
| `team_rank` | 구단 내 순위. 필요할 때 저장 |
| `is_gray` | 화면에서 회색 표시할지 여부 |
| `source_run_id` | 적재 실행 ID |

권장 후보 Key:

```text
UNIQUE(player_id, snapshot_date, league, role, model_version)
```

Rating 중간값이 많다면 대표적으로 자주 보여주는 값은 컬럼으로 두고, 실험적 구성요소는 별도 테이블 또는 이름-값 구조로 분리하는 방안을 검토한다.

### 7.2 `batting_stat_snapshots` — 날짜별 타격 스탯

타격 선수의 특정 기준일까지 누적된 타격 통계를 기록한다.

주요 원자료 후보:

```text
PA, AB, H, 1B, 2B, 3B, HR, R, RBI, BB, IBB, HBP, SO,
SB_ATTEMPTS, SB, CS
```

파생값 후보:

```text
AVG, OBP, SLG, OPS, SB_SUCCESS_RATE
```

원자료에서 재계산할 수 있는 파생값은 원자료를 기준으로 계산하되, 화면 성능을 위해 함께 저장하는 것은 가능하다. 저장할 경우 계산 버전과 기준일을 함께 기록한다.

### 7.3 `pitching_stat_snapshots` — 날짜별 투구 스탯

투수의 특정 기준일까지 누적된 투구 통계를 기록한다.

주요 원자료 후보:

```text
IP 또는 IP_OUTS, BF, H, HR, R, ER, BB, HBP, SO, WP, BK
```

투수 기록은 타격 기록과 항목과 계산 방식이 다르므로 별도 테이블로 두는 편이 안전하다.

두 스탯 테이블 모두 최소한 다음을 포함한다.

```text
player_id, snapshot_date, season, team_id, league, model_version, source_run_id
```

### 7.4 `pa_rating_effects` — 타석별 Rating 영향

타석 하나가 한 선수의 특정 Rating 값에 준 변화를 기록한다.

한 타석이 타자와 투수 모두에게 영향을 줄 수 있고, Rating 구성요소도 여러 개일 수 있으므로 타석 한 개당 한 행으로 고정하지 않는다.

| 필드 | 설명 |
|---|---|
| `effect_id` | 내부 Primary Key |
| `pa_id` | 타석 ID |
| `player_id` | 영향받은 역할별 선수 ID |
| `role` | 타자·투수 |
| `metric_name` | 영향받은 지표명 |
| `before_value` | 타석 전 값 |
| `after_value` | 타석 후 값 |
| `delta` | 변화량 |
| `model_version` | 계산 버전 |
| `source_run_id` | 적재 실행 ID |

### 7.5 `team_rating_snapshots` — 날짜별 구단 Rating

메인 화면의 구단별 표에 바로 사용할 수 있는 날짜별 요약이다.

| 필드 | 설명 |
|---|---|
| `team_rating_snapshot_id` | 내부 Primary Key |
| `team_id` | 구단 ID |
| `snapshot_date` | 기준일 |
| `season` | 시즌 |
| `league` | 1군·2군 |
| `model_version` | 계산 버전 |
| `batter_average_9` | 1군 타자 9명 평균 |
| `pitcher_average_9` | 1군 투수 9명 평균 |
| `rank` | 구단 순위. 필요할 때 저장 |
| `source_run_id` | 적재 실행 ID |

2군처럼 평균이 없는 경우에는 해당 컬럼을 NULL로 둘 수 있다.

## 8. 적재 실행 기록

### `sync_runs` — 크롤링·계산 실행

크롤러가 언제 무엇을 수집하고 넣었는지 기록한다.

| 필드 | 설명 |
|---|---|
| `run_id` | 내부 Primary Key |
| `started_at` | 시작 시각 |
| `completed_at` | 종료 시각 |
| `source` | 데이터 출처 |
| `source_as_of` | 원자료 기준일 |
| `model_version` | KPI 계산 버전 |
| `schema_version` | DB 스키마 버전 |
| `status` | running·completed·failed |
| `row_counts_json` | 테이블별 적재 행 수 |
| `error_message` | 실패 시 오류 |

한 번의 적재는 transaction으로 처리해 중간 상태가 웹에 노출되지 않게 한다.

## 9. 테이블 관계

```text
people 1 ── N players
                 │
                 ├── N player_team_history
                 ├── N player_rating_snapshots
                 ├── N batting_stat_snapshots
                 ├── N pitching_stat_snapshots
                 └── N roster_events

teams 1 ── N games
venues 1 ── N games
games 1 ── N plate_appearances
players 1 ── N plate_appearances (batter)
players 1 ── N plate_appearances (pitcher)
plate_appearances 1 ── N pa_rating_effects
teams 1 ── N team_rating_snapshots
```

모든 테이블은 하나의 `kpi.db` 안에 들어간다. 테이블이 나뉜다고 데이터베이스 파일이 나뉘는 것은 아니다.

## 10. 화면 요청과 조회 위치

### 선수 기간별 Rating 그래프

`player_rating_snapshots`에서 `player_id`와 `snapshot_date` 범위를 조건으로 조회한다.

### 특정 경기장의 기록

`games.venue_id`로 경기를 찾고, `plate_appearances.game_id`와 연결한다.

### 특정 날짜의 구단별 Rating 표

`team_rating_snapshots`와 해당 날짜의 `player_rating_snapshots`를 조회한다.

### Diff 보기

두 기준일의 `player_rating_snapshots`를 비교하고, 해당 날짜의 `plate_appearances`와 `pa_rating_effects`를 함께 보여준다.

### 등록·말소 이력

`roster_events`와 `player_team_history`를 시간순으로 조회한다.

## 11. 권장 인덱스

초기부터 모든 인덱스를 만들 필요는 없지만, 다음은 우선순위가 높다.

```text
player_rating_snapshots(player_id, snapshot_date)
player_rating_snapshots(snapshot_date, team_id, league)
batting_stat_snapshots(player_id, snapshot_date)
pitching_stat_snapshots(player_id, snapshot_date)
games(game_date, venue_id)
games(venue_id, game_date)
plate_appearances(game_id, pa_sequence)
plate_appearances(batter_player_id, game_id)
plate_appearances(pitcher_player_id, game_id)
roster_events(player_id, event_date)
```

인덱스는 실제 조회 쿼리를 만든 뒤 `EXPLAIN QUERY PLAN`으로 확인하면서 조정한다.

## 12. 데이터 형식 규칙

- 날짜: `YYYY-MM-DD` 문자열
- 시각: ISO 8601 문자열. 저장 기준 시간대는 추후 결정
- Rating·비율: REAL
- 개수·순서·ID: INTEGER 또는 TEXT
- 알 수 없는 값: 임의의 0 대신 NULL
- 1군·2군: 자유로운 표현을 섞지 않고 정해진 코드 사용
- 역할: `batter`, `pitcher` 중 하나
- 구단·경기장·선수 이름은 표시용이며 연결 Key로 사용하지 않음
- 모든 계산 결과는 `snapshot_date`와 `model_version`을 가짐

## 13. 1차 구현 범위

### 먼저 만들 테이블

1. `people`
2. `players`
3. `external_player_ids`
4. `teams`
5. `venues`
6. `games`
7. `plate_appearances`
8. `player_rating_snapshots`
9. `batting_stat_snapshots`
10. `pitching_stat_snapshots`
11. `team_rating_snapshots`
12. `sync_runs`

### 다음 단계에서 추가할 테이블

- `player_team_history`의 세부 상태 보강
- `roster_events`
- `pa_rating_effects`
- Rating 구성요소 전용 테이블
- 원자료 보관 위치와 재현용 메타데이터

처음부터 모든 화면을 완성하기보다, 크롤러가 넣은 데이터로 다음 세 가지 조회가 되는지 먼저 확인한다.

1. 특정 선수의 기간별 Rating 조회
2. 특정 날짜의 구단별 Rating 표 조회
3. 특정 경기장과 기간의 타석 조회

## 14. 아직 결정하지 않은 항목

- 실제 `player_id`와 `person_id` 생성 규칙
- KBO ID가 역할·시즌·구단과 어떤 조합으로 원자료에서 나타나는지
- 타자·투수 외에 포지션을 어느 수준까지 세분화할지
- Rating 구성요소를 고정 컬럼으로 둘지, 별도 이름-값 테이블로 둘지
- `rating_delta`를 저장할지, 두 스냅샷을 비교해 계산할지
- 날짜별 스탯이 경기 전 기준인지 경기 후 기준인지
- 1군·2군 소속이 경기 데이터와 어떤 기준으로 연결되는지
- 등록·말소 데이터의 출처와 정확한 이벤트 종류
- 원자료 전체를 DB에 넣을지, 별도 CSV/JSON 파일로 보관하고 참조만 남길지
- `kpi.db`를 로컬에서만 만들지, 나중에 API 서버로 동기화할지

## 15. 구현 순서 제안

1. 이 문서를 검토하고 필드명을 확정한다.
2. `schema.sql`을 작성한다.
3. 작은 샘플 데이터로 SQLite 파일을 만든다.
4. 선수·경기·타석·Rating 조회 쿼리를 검증한다.
5. 크롤러가 `sync_runs`를 만들고 transaction 단위로 적재하게 한다.
6. 로컬 API가 SQLite를 읽도록 한다.
7. 현재 웹 화면의 JSON 입력을 API 응답으로 교체한다.
8. 데이터가 커진 뒤 인덱스와 캐시를 조정한다.

이 문서는 설계 초안이므로, 실제 크롤링 데이터의 구조를 확인하면서 수정한다.
