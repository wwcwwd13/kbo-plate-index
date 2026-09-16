import { Fragment, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchPlayerDetail, fetchTeamRatings } from "./data";
import "../styles.css";

const DEFAULT_PLAYER_ID = "player:kbo:54529:batter";

function playerPageHref(player) {
  if (!player?.playerId) return null;
  return `./player.html?player_id=${encodeURIComponent(player.playerId)}`;
}

function toNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatRating(value) {
  const number = toNumber(value);
  return number === null ? "—" : number.toFixed(1);
}

function formatDate(value) {
  return value ? String(value) : "—";
}

function formatShortDate(value) {
  const date = String(value ?? "");
  return date.length >= 10 ? date.slice(5).replace("-", "/") : date;
}

function ratingBand(value) {
  const number = toNumber(value);
  if (number === null) return "band-empty";
  if (number >= 80) return "band-high";
  if (number >= 65) return "band-good";
  if (number >= 50) return "band-mid";
  return "band-low";
}

function averageBand(value, values) {
  const number = toNumber(value);
  if (number === null) return "average-empty";

  const rankedValues = values
    .map(toNumber)
    .filter((candidate) => candidate !== null)
    .sort((a, b) => b - a);
  const rank = rankedValues.findIndex((candidate) => candidate === number) + 1;
  const total = rankedValues.length;

  if (!rank || !total) return "average-empty";
  if (rank <= 2) return "average-top";
  if (rank >= Math.max(total - 1, 3)) return "average-bottom";
  return rank <= Math.ceil(total / 2) ? "average-upper" : "average-lower";
}

function formatStatValue(key, value) {
  const number = toNumber(value);
  if (number === null) return "—";
  if (["battingAverage", "onBasePercentage", "sluggingPercentage", "ops"].includes(key)) {
    return number.toFixed(3).replace(/^0\./, ".");
  }
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function deltaClass(value) {
  const number = toNumber(value);
  if (number === null || number === 0) return "delta-neutral";
  return number > 0 ? "delta-positive" : "delta-negative";
}

function Delta({ value }) {
  const number = toNumber(value);
  if (number === null) return <span className="delta-neutral">—</span>;
  const sign = number > 0 ? "+" : "";
  return <span className={deltaClass(number)}>{sign}{number.toFixed(1)}</span>;
}

function PageHeader({ subtitle, action }) {
  return (
    <header className="page-header">
      <div className="title-lockup">
        <span className="project-mark" aria-hidden="true">KPI</span>
        <div>
          <h1>KBO Plate Index</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="source-meta">{action}</div>
    </header>
  );
}

function PageFooter({ children }) {
  return (
    <footer className="page-footer">
      <span>KBO Plate Index</span>
      {children}
    </footer>
  );
}

function LoadingState({ children }) {
  return <div className="loading-state">{children}</div>;
}

function LoadError({ children }) {
  return (
    <div className="error-state">
      <strong>데이터를 불러오지 못했습니다.</strong>
      <span>{children}</span>
    </div>
  );
}

function PlayerLink({ player }) {
  if (!player) return <td className="name-cell empty-cell" aria-label="선수 없음" />;
  const grayClass = player.gray ? " is-gray" : "";
  const href = playerPageHref(player);
  return (
    <td className={`name-cell${grayClass}`} title={player.name}>
      {href ? (
        <a className="player-link" href={href}>{player.name}</a>
      ) : (
        <span className="player-link player-link--unresolved">{player.name}</span>
      )}
    </td>
  );
}

function PlayerRating({ player }) {
  if (!player) return <td className="rating-cell empty-cell" aria-label="Rating 없음" />;
  return <td className={`rating-cell ${ratingBand(player.rating)}`}>{formatRating(player.rating)}</td>;
}

function AverageRow({ teams }) {
  if (!teams.length || teams[0].league !== "1군") return null;
  const batterValues = teams.map((team) => team.averages?.batter);
  const pitcherValues = teams.map((team) => team.averages?.pitcher);

  return (
    <tr className="average-row">
      {teams.map((team) => {
        const batterClass = averageBand(team.averages?.batter, batterValues);
        const pitcherClass = averageBand(team.averages?.pitcher, pitcherValues);
        return (
          <Fragment key={`${team.team}-average`}>
            <td className={`average-label ${batterClass}`}>9명 평균</td>
            <td className={`average-value ${batterClass}`}>{formatRating(team.averages?.batter)}</td>
            <td className={`average-label ${pitcherClass}`}>9명 평균</td>
            <td className={`average-value ${pitcherClass}`}>{formatRating(team.averages?.pitcher)}</td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function TeamRatingTable({ section, isSecondary = false }) {
  const teams = section.teams ?? [];
  const rowCount = Math.max(1, ...teams.map((team) => Math.max(team.batters?.length || 0, team.pitchers?.length || 0)));

  return (
    <section className={`rating-section${isSecondary ? " is-secondary" : ""}`} aria-labelledby={`section-title-${section.league}`}>
      <div className="section-heading">
        <h3 id={`section-title-${section.league}`}>{section.league}</h3>
        <span>{teams.length}개 구단</span>
      </div>
      <div className="matrix-scroller">
        <table className="rating-matrix" aria-describedby={`section-title-${section.league}`}>
          <colgroup>
            {teams.map((team) => (
              <Fragment key={`${team.team}-columns`}>
                <col className="name-column" />
                <col className="rating-column" />
                <col className="name-column" />
                <col className="rating-column" />
              </Fragment>
            ))}
          </colgroup>
          <thead>
            <tr className="team-row">
              {teams.map((team) => <th key={`${team.team}-team`} colSpan="4" scope="colgroup">{team.team}</th>)}
            </tr>
            <tr className="league-row">
              {teams.map((team) => <th key={`${team.team}-league`} colSpan="4">{section.league}</th>)}
            </tr>
            <tr className="role-row">
              {teams.map((team) => (
                <Fragment key={`${team.team}-roles`}>
                  <th colSpan="2">타자</th>
                  <th colSpan="2">투수</th>
                </Fragment>
              ))}
            </tr>
            <tr className="field-row">
              {teams.map((team) => (
                <Fragment key={`${team.team}-fields`}>
                  <th>이름</th><th>Rating</th><th>이름</th><th>Rating</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <tr key={`${section.league}-row-${rowIndex}`}>
                {teams.map((team) => {
                  const batter = team.batters?.[rowIndex] ?? null;
                  const pitcher = team.pitchers?.[rowIndex] ?? null;
                  return (
                    <Fragment key={`${team.team}-${rowIndex}`}>
                      <PlayerLink player={batter} />
                      <PlayerRating player={batter} />
                      <PlayerLink player={pitcher} />
                      <PlayerRating player={pitcher} />
                    </Fragment>
                  );
                })}
              </tr>
            ))}
            <AverageRow teams={teams} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HomePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeamRatings()
      .then((nextData) => { if (!cancelled) setData(nextData); })
      .catch((nextError) => { if (!cancelled) setError(nextError); });
    return () => { cancelled = true; };
  }, []);

  const sections = data?.sections ?? [];
  return (
    <div className="page-shell">
      <PageHeader
        subtitle="2026 KBO 구단별 Rating"
        action={
          <>
            <span>{data?.meta?.asOf ? `${data.meta.asOf} 기준` : "기준일 확인 중"}</span>
            <span className="source-divider" aria-hidden="true">·</span>
            <span>외부 공유용 표</span>
          </>
        }
      />
      <main className="page-content">
        <section className="sheet-card" aria-labelledby="sheet-title">
          <div className="sheet-card-header">
            <div>
              <p className="kicker">TEAM RATING</p>
              <h2 id="sheet-title">구단별 Rating</h2>
              <p className="sheet-description">참고 시트의 구단·선수 배열과 Rating 색상 기준을 웹 화면에 맞춰 재현했습니다.</p>
            </div>
            <div className="legend" aria-label="Rating 색상 기준">
              <span className="legend-item"><i className="legend-swatch band-high" />80 이상</span>
              <span className="legend-item"><i className="legend-swatch band-good" />65–79.9</span>
              <span className="legend-item"><i className="legend-swatch band-mid" />50–64.9</span>
              <span className="legend-item"><i className="legend-swatch band-low" />50 미만</span>
            </div>
          </div>
          <div className="rating-sections">
            {error ? <LoadError>data/sheet_reference.json 파일을 확인해 주세요.</LoadError> : data ? sections.map((section, index) => <TeamRatingTable key={`${section.league}-${index}`} section={section} isSecondary={index > 0} />) : <LoadingState>구단 Rating 데이터를 불러오는 중입니다.</LoadingState>}
          </div>
        </section>
      </main>
      <PageFooter>
        <a href="https://docs.google.com/spreadsheets/d/1RFlizhPk7cyzsh2J2WIKFtAaoumYJ61yz95cXxUMacg/edit?gid=387297493#gid=387297493" target="_blank" rel="noreferrer">참고 Google Sheet 열기</a>
      </PageFooter>
    </div>
  );
}

function PlayerPhoto({ player }) {
  return player.imageUrl ? (
    <div className="player-photo"><img src={player.imageUrl} alt={`${player.displayName} 선수 이미지`} /></div>
  ) : (
    <div className="player-photo" aria-label="선수 이미지 준비 중"><span>선수 이미지<br />준비 중</span></div>
  );
}

function PlayerProfile({ player, ratings }) {
  const profile = player.profile ?? {};
  const latest = ratings[ratings.length - 1] ?? null;
  const items = [
    ["선수 ID", player.playerId],
    ["Person ID", player.personId],
    ["역할", player.role],
    ["소속 구단", profile.team],
    ["리그", profile.league],
    ["포지션", profile.position],
    ["생년월일", profile.birthDate],
    ["영문 이름", profile.englishName],
    ["투구", profile.throws],
    ["타격", profile.bats],
    ["포수 여부", profile.isCatcher ? "예" : "아니오"],
    ["KBO ID", profile.kboId]
  ];

  return (
    <>
      <section className="player-card" aria-labelledby="player-title">
        <PlayerPhoto player={player} />
        <div className="player-summary">
          <p className="kicker">PLAYER PROFILE</p>
          <h2 id="player-title">{player.displayName}</h2>
          <p className="player-english-name">{profile.englishName}</p>
          <p className="player-summary-note">SQLite DB에서 불러온 선수 기본 정보와 날짜별 Rating입니다.<br />선수 이미지는 아직 준비 중이며, 타격 통계는 원자료가 있을 때 표시됩니다.</p>
        </div>
        <div className={`current-rating ${ratingBand(latest?.rating)}`}>
          <span className="current-rating-label">현재 Rating</span>
          <strong className="current-rating-value">{formatRating(latest?.rating)}</strong>
          <span className="current-rating-date">{latest ? `${formatDate(latest.date)} 기준` : "기준일 없음"}</span>
        </div>
      </section>
      <div className="profile-grid" aria-label="선수 기본 정보">
        {items.map(([label, value]) => (
          <div className="profile-item" key={label}>
            <div className="profile-label">{label}</div>
            <div className="profile-value" title={value || "—"}>{value || "—"}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function sortRatings(player) {
  return (player.ratingSnapshots ?? [])
    .map((snapshot) => ({ ...snapshot, rating: toNumber(snapshot.rating) }))
    .filter((snapshot) => snapshot.rating !== null && snapshot.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function RatingChart({ ratings }) {
  const entries = useMemo(() => ratings, [ratings]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(entries.length ? entries.length - 1 : null);

  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= entries.length) setSelectedIndex(entries.length ? entries.length - 1 : null);
  }, [entries.length, selectedIndex]);

  if (!entries.length) return <LoadingState>표시할 Rating 기록이 없습니다.</LoadingState>;

  const width = 800;
  const height = 320;
  const padding = { top: 22, right: 22, bottom: 52, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = entries.map((snapshot) => snapshot.rating);
  const minValue = Math.floor(Math.min(...values) - 2);
  const maxValue = Math.ceil(Math.max(...values) + 2);
  const range = Math.max(maxValue - minValue, 1);
  const tickCount = 4;
  const x = (index) => entries.length === 1 ? padding.left + plotWidth / 2 : padding.left + (plotWidth * index) / (entries.length - 1);
  const y = (value) => padding.top + ((maxValue - value) / range) * plotHeight;
  const activeIndex = hoveredIndex ?? selectedIndex;
  const active = activeIndex === null ? null : entries[activeIndex];
  const previous = activeIndex !== null && activeIndex > 0 ? entries[activeIndex - 1] : null;
  const activeDelta = active && previous ? active.rating - previous.rating : null;

  return (
    <div className="chart-shell">
      <div className="chart-scroller">
        <svg className="rating-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="날짜별 Rating 변화 그래프">
          <desc>레이예스 선수의 날짜별 Rating 변화</desc>
          {Array.from({ length: tickCount + 1 }, (_, index) => {
            const value = maxValue - (range * index) / tickCount;
            const yPosition = y(value);
            return (
              <g key={`tick-${index}`}>
                <line className="chart-grid-line" x1={padding.left} y1={yPosition} x2={width - padding.right} y2={yPosition} />
                <text className="chart-axis-label" x={padding.left - 8} y={yPosition + 4} textAnchor="end">{value.toFixed(1)}</text>
              </g>
            );
          })}
          <polyline className="chart-line" points={entries.map((snapshot, index) => `${x(index)},${y(snapshot.rating)}`).join(" ")} />
          {entries.map((snapshot, index) => (
            <circle
              className={`chart-point${selectedIndex === index ? " is-selected" : ""}`}
              key={snapshot.date}
              cx={x(index)}
              cy={y(snapshot.rating)}
              r="5"
              tabIndex="0"
              role="button"
              aria-label={`${formatDate(snapshot.date)} Rating ${formatRating(snapshot.rating)}`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedIndex(index);
                }
              }}
            >
              <title>{formatDate(snapshot.date)} · Rating {formatRating(snapshot.rating)}</title>
            </circle>
          ))}
          {entries.map((snapshot, index) => (
            <text className="chart-date-label" key={`${snapshot.date}-label`} x={x(index)} y={height - 20} textAnchor="middle">{formatShortDate(snapshot.date)}</text>
          ))}
        </svg>
      </div>
      <div className="chart-interaction" aria-live="polite">
        <div>
          <span className="chart-interaction-label">{hoveredIndex !== null ? "가리킨 기록" : "선택된 기록"}</span>
          {active ? <strong>{formatDate(active.date)} · Rating {formatRating(active.rating)} · <Delta value={activeDelta} /></strong> : <strong>그래프의 점을 가리키거나 클릭해 주세요.</strong>}
        </div>
        <button type="button" onClick={() => setSelectedIndex(null)} disabled={selectedIndex === null}>선택 해제</button>
      </div>
    </div>
  );
}

function RatingHistory({ ratings }) {
  const rows = ratings.map((snapshot, index) => ({ snapshot, index })).reverse();
  return (
    <section className="detail-card" aria-labelledby="rating-history-title">
      <div className="detail-card-header"><h3 id="rating-history-title">날짜별 Rating</h3><span>점에 마우스를 올리거나 클릭해 보세요</span></div>
      <RatingChart ratings={ratings} />
      <div className="data-table-scroller">
        <table className="detail-table">
          <thead><tr><th scope="col">날짜</th><th scope="col">Rating</th><th scope="col">전 기록 대비</th><th scope="col">모델</th></tr></thead>
          <tbody>
            {rows.map(({ snapshot, index }) => {
              const previous = ratings[index - 1];
              return (
                <tr key={snapshot.date}>
                  <td>{formatDate(snapshot.date)}</td>
                  <td className={ratingBand(snapshot.rating)}>{formatRating(snapshot.rating)}</td>
                  <td><Delta value={previous ? snapshot.rating - previous.rating : null} /></td>
                  <td>{snapshot.modelVersion || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BattingStats({ player }) {
  const snapshots = player.battingStatSnapshots ?? [];
  const latest = snapshots[snapshots.length - 1] ?? null;
  const definitions = [
    ["타석", "plateAppearances"], ["타수", "atBats"], ["안타", "hits"], ["타율", "battingAverage"],
    ["출루율", "onBasePercentage"], ["장타율", "sluggingPercentage"], ["OPS", "ops"], ["타점", "rbi"],
    ["득점", "runs"], ["홈런", "homeRuns"], ["도루", "stolenBases"], ["삼진", "strikeouts"]
  ];
  return (
    <section className="detail-card" aria-labelledby="batting-stats-title">
      <div className="detail-card-header"><h3 id="batting-stats-title">타격 통계</h3><span>{latest ? `${formatDate(latest.date)} 기준` : "기록 없음"}</span></div>
      <div className="stat-grid">
        {definitions.map(([label, key]) => <div className="stat-item" key={key}><span className="stat-item-label">{label}</span><strong className="stat-item-value">{formatStatValue(key, latest?.[key])}</strong></div>)}
      </div>
    </section>
  );
}

function PlateAppearances({ player }) {
  const appearances = [...(player.plateAppearances ?? [])].sort((a, b) => {
    const dateOrder = String(b.date ?? "").localeCompare(String(a.date ?? ""));
    return dateOrder || ((toNumber(a.plateAppearanceNumber) ?? 0) - (toNumber(b.plateAppearanceNumber) ?? 0));
  });
  return (
    <section className="detail-card" aria-labelledby="plate-appearances-title">
      <div className="detail-card-header"><h3 id="plate-appearances-title">타석 기록</h3><span>DB에 저장된 타석 단위 원자료</span></div>
      <div className="data-table-scroller">
        <table className="detail-table">
          <thead><tr><th scope="col">날짜</th><th scope="col">경기 ID</th><th scope="col">구장</th><th scope="col">상대</th><th scope="col">타순</th><th scope="col">타석 번호</th><th scope="col">결과</th><th scope="col">Rating 전후</th><th scope="col">변화</th></tr></thead>
          <tbody>
            {appearances.length ? appearances.map((appearance) => {
              const before = toNumber(appearance.ratingBefore);
              const after = toNumber(appearance.ratingAfter);
              const effect = appearance.ratingEffect?.ratingDelta ?? appearance.ratingDelta ?? (before !== null && after !== null ? after - before : null);
              return (
                <tr key={appearance.paId}>
                  <td>{formatDate(appearance.date)}</td>
                  <td>{appearance.gameId || "—"}</td>
                  <td>{appearance.venue || "—"}</td>
                  <td>{appearance.opponent || "—"}</td>
                  <td>{appearance.battingOrder || "—"}번</td>
                  <td>{appearance.plateAppearanceNumber || "—"}</td>
                  <td>{appearance.result || "—"}</td>
                  <td>{before !== null && after !== null ? `${formatRating(before)} → ${formatRating(after)}` : "—"}</td>
                  <td><Delta value={effect} /></td>
                </tr>
              );
            }) : <tr><td colSpan="9">표시할 타석 기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PlayerPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const playerId = new URLSearchParams(window.location.search).get("player_id") || DEFAULT_PLAYER_ID;

  useEffect(() => {
    let cancelled = false;
    fetchPlayerDetail(playerId)
      .then((nextData) => { if (!cancelled) setData(nextData); })
      .catch((nextError) => { if (!cancelled) setError(nextError); });
    return () => { cancelled = true; };
  }, [playerId]);

  const player = data?.player;
  const ratings = player ? sortRatings(player) : [];
  useEffect(() => {
    if (player?.displayName) document.title = `KBO Plate Index · ${player.displayName}`;
  }, [player?.displayName]);

  return (
    <div className="page-shell">
      <PageHeader subtitle="선수 상세" action={<a href="./index.html">메인 표로 돌아가기</a>} />
      <main className="page-content player-page-content">
        <div className="breadcrumb"><a href="./index.html">구단별 Rating</a><span aria-hidden="true"> / </span><span>{player?.displayName || "선수 상세"}</span></div>
        {error ? <LoadError>data/player_detail.json 파일과 데이터 접근 경로를 확인해 주세요.</LoadError> : player ? (
          <>
            <PlayerProfile player={player} ratings={ratings} />
            <RatingHistory ratings={ratings} />
            <BattingStats player={player} />
            <PlateAppearances player={player} />
          </>
        ) : <LoadingState>선수 데이터를 불러오는 중입니다.</LoadingState>}
      </main>
      <PageFooter><a href="./index.html">메인 페이지</a></PageFooter>
    </div>
  );
}

function App() {
  return window.location.pathname.endsWith("/player.html") ? <PlayerPage /> : <HomePage />;
}

createRoot(document.getElementById("root")).render(<App />);
