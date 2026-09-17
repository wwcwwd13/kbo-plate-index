import { Fragment, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { fetchPlayerDetail, fetchTeamRatings } from "./data";
import "../styles.css";

const DEFAULT_PLAYER_ID = "player:demo:noname:batter";

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
    ["역할", player.role],
    ["소속 구단", profile.team],
    ["리그", profile.league],
    ["포지션", profile.position],
    ["생년월일", profile.birthDate],
    ["투구", profile.throws],
    ["타격", profile.bats],
    ["포수 여부", profile.isCatcher ? "예" : "아니오"]
  ];

  return (
    <>
      <section className="player-card" aria-labelledby="player-title">
        <PlayerPhoto player={player} />
        <div className="player-summary">
          <p className="kicker">PLAYER PROFILE</p>
          <h2 id="player-title">{player.displayName}</h2>
          <p className="player-english-name">{profile.englishName}</p>
          <p className="player-summary-note">선수 기본 정보와 현재 Rating을 먼저 보여줍니다.<br />이후 경기별 변화와 세부 기록을 이어서 확인할 수 있습니다.</p>
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

function PlayerTechnicalInfo({ player }) {
  const profile = player.profile ?? {};
  const items = [
    ["player_id", player.playerId],
    ["person_id", player.personId],
    ["KBO ID", profile.kboId]
  ];

  return (
    <details className="technical-details">
      <summary>
        <span>기술 정보 및 식별자</span>
        <span className="technical-summary-note">개발·검증용 정보</span>
      </summary>
      <div className="technical-grid">
        {items.map(([label, value]) => (
          <div className="technical-item" key={label}>
            <div className="profile-label">{label}</div>
            <div className="technical-value" title={value || "—"}>{value || "—"}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function sortRatings(player) {
  return (player.ratingSnapshots ?? [])
    .map((snapshot) => ({ ...snapshot, rating: toNumber(snapshot.rating) }))
    .filter((snapshot) => snapshot.rating !== null && snapshot.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const CHART_MODES = [
  ["game", "경기별"],
  ["plateAppearance", "타석별"]
];

const ZOOM_LEVELS = [1, 1.5, 2, 3];

function sortAppearances(player) {
  return (player?.plateAppearances ?? [])
    .map((appearance, index) => ({ ...appearance, sourceIndex: index }))
    .sort((a, b) => {
      const dateOrder = String(a.date ?? "").localeCompare(String(b.date ?? ""));
      if (dateOrder) return dateOrder;
      const gameOrder = String(a.gameId ?? "").localeCompare(String(b.gameId ?? ""));
      if (gameOrder) return gameOrder;
      const plateOrder = (toNumber(a.plateAppearanceNumber) ?? Number.MAX_SAFE_INTEGER) - (toNumber(b.plateAppearanceNumber) ?? Number.MAX_SAFE_INTEGER);
      return plateOrder || String(a.paId ?? a.sourceIndex).localeCompare(String(b.paId ?? b.sourceIndex));
    });
}

function appearanceRating(appearance) {
  return toNumber(appearance.ratingAfter) ?? toNumber(appearance.ratingBefore);
}

function appearanceDelta(appearance) {
  const explicit = toNumber(appearance.ratingDelta ?? appearance.ratingEffect?.ratingDelta);
  if (explicit !== null) return explicit;
  const before = toNumber(appearance.ratingBefore);
  const after = toNumber(appearance.ratingAfter);
  return before !== null && after !== null ? after - before : null;
}

function summarizeAppearances(appearances) {
  const counts = { atBats: 0, hits: 0, homeRuns: 0, walks: 0, hitByPitch: 0, strikeouts: 0 };

  appearances.forEach((appearance) => {
    const result = String(appearance.result ?? "");
    if (!result) return;
    if (/고의사구|볼넷|walk|bb/i.test(result)) {
      counts.walks += 1;
      return;
    }
    if (/사구|몸에맞는공|hbp/i.test(result)) {
      counts.hitByPitch += 1;
      return;
    }
    if (/희생|번트|방해/i.test(result)) return;

    counts.atBats += 1;
    if (/안타|홈런|루타|single|double|triple|home.?run/i.test(result)) counts.hits += 1;
    if (/홈런|home.?run/i.test(result)) counts.homeRuns += 1;
    if (/삼진|낫아웃|strike.?out/i.test(result)) counts.strikeouts += 1;
  });

  const parts = [`타석 ${appearances.length}회`];
  if (counts.atBats) parts.push(`타수 ${counts.atBats}`);
  if (counts.hits) parts.push(`안타 ${counts.hits}`);
  if (counts.homeRuns) parts.push(`홈런 ${counts.homeRuns}`);
  if (counts.walks) parts.push(`볼넷 ${counts.walks}`);
  if (counts.hitByPitch) parts.push(`사구 ${counts.hitByPitch}`);
  if (counts.strikeouts) parts.push(`삼진 ${counts.strikeouts}`);
  return parts.join(" · ");
}

function buildGameEntries(ratings, appearances) {
  const ratingByDate = new Map(ratings.map((snapshot) => [String(snapshot.date), snapshot.rating]));
  const groups = new Map();

  appearances.forEach((appearance) => {
    const groupKey = `${appearance.date ?? "unknown"}::${appearance.gameId ?? `game-${appearance.sourceIndex}`}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(appearance);
  });

  return [...groups.values()].map((group, index) => {
    const first = group[0];
    const last = group[group.length - 1];
    const firstBefore = toNumber(first.ratingBefore);
    const lastAfter = toNumber(last.ratingAfter);
    const rating = appearanceRating(last) ?? ratingByDate.get(String(first.date));
    const delta = group.reduce((total, appearance) => {
      const value = appearanceDelta(appearance);
      return value === null ? total : total + value;
    }, 0);
    const resultValues = group.map((appearance) => appearance.result).filter(Boolean);

    return {
      key: `game-${first.date}-${first.gameId ?? index}`,
      granularity: "game",
      granularityLabel: "경기별",
      date: first.date,
      rating,
      ratingBefore: firstBefore,
      ratingAfter: lastAfter,
      ratingDelta: delta || (firstBefore !== null && lastAfter !== null ? lastAfter - firstBefore : null),
      gameId: first.gameId,
      venue: first.venue,
      opponent: first.opponent,
      appearances: group,
      paCount: group.length,
      results: resultValues,
      summary: summarizeAppearances(group),
      modelVersion: last.modelVersion ?? last.ratingEffect?.modelVersion
    };
  }).filter((entry) => entry.rating !== null && entry.rating !== undefined);
}

function buildPlateAppearanceEntries(ratings, appearances) {
  const ratingByDate = new Map(ratings.map((snapshot) => [String(snapshot.date), snapshot.rating]));
  return appearances.map((appearance, index) => ({
    key: `pa-${appearance.paId ?? index}`,
    granularity: "plateAppearance",
    granularityLabel: "타석별",
    date: appearance.date,
    rating: appearanceRating(appearance) ?? ratingByDate.get(String(appearance.date)),
    ratingBefore: toNumber(appearance.ratingBefore),
    ratingAfter: toNumber(appearance.ratingAfter),
    ratingDelta: appearanceDelta(appearance),
    gameId: appearance.gameId,
    venue: appearance.venue,
    opponent: appearance.opponent,
    result: appearance.result,
    plateAppearanceNumber: appearance.plateAppearanceNumber,
    paId: appearance.paId,
    appearances: [appearance],
    paCount: 1,
    summary: appearance.result || "결과 기록 없음",
    modelVersion: appearance.modelVersion ?? appearance.ratingEffect?.modelVersion
  })).filter((entry) => entry.rating !== null && entry.rating !== undefined);
}

function buildChartEntries(mode, ratings, player) {
  const appearances = sortAppearances(player);
  if (mode === "plateAppearance") return buildPlateAppearanceEntries(ratings, appearances);
  return buildGameEntries(ratings, appearances);
}

function chartEntrySummary(entry) {
  if (entry.granularity === "game") {
    const venue = entry.venue ? `${entry.venue} · ` : "";
    const opponent = entry.opponent ? `상대 ${entry.opponent} · ` : "";
    return `${venue}${opponent}${entry.summary}`;
  }
  const opponent = entry.opponent ? `상대 ${entry.opponent} · ` : "";
  return `${opponent}${entry.result || "결과 기록 없음"}`;
}

function ChartTooltip({ entry, delta, pointX, pointY, width, height }) {
  if (!entry) return null;
  const left = Math.min(84, Math.max(16, (pointX / width) * 100));
  const top = (pointY / height) * 100;
  const positionClass = pointY < 105 ? "is-below" : "is-above";
  const results = entry.results ?? [];

  return (
    <div className={`chart-tooltip ${positionClass}`} style={{ left: `${left}%`, top: `${top}%` }} role="status">
      <span className="chart-tooltip-kicker">{entry.granularityLabel}</span>
      <strong>{formatDate(entry.date)} · Rating {formatRating(entry.rating)}</strong>
      {entry.granularity === "game" ? (
        <div className="chart-tooltip-lines">
          <span>{entry.gameId || "경기 ID 없음"} · {entry.venue || "구장 미상"}</span>
          <span>상대 {entry.opponent || "—"} · {entry.paCount}타석</span>
          <span>성적 {entry.summary}</span>
          {results.length ? <span>결과 {results.slice(0, 6).join(" · ")}{results.length > 6 ? " · …" : ""}</span> : null}
          <span>Rating 변화 <Delta value={delta} /></span>
        </div>
      ) : (
        <div className="chart-tooltip-lines">
          <span>{entry.gameId || "경기 ID 없음"} · {entry.plateAppearanceNumber ? `${entry.plateAppearanceNumber}번째 타석` : "타석 번호 없음"}</span>
          <span>상대 {entry.opponent || "—"} · {entry.venue || "구장 미상"}</span>
          <span>결과 {entry.result || "—"}</span>
          <span>Rating 변화 <Delta value={delta} /></span>
        </div>
      )}
    </div>
  );
}

function RatingChart({ ratings, player }) {
  const [viewMode, setViewMode] = useState("game");
  const [zoomLevel, setZoomLevel] = useState(1);
  const entries = useMemo(() => buildChartEntries(viewMode, ratings, player), [viewMode, ratings, player]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(entries.length ? entries.length - 1 : null);

  useEffect(() => {
    setSelectedIndex(entries.length ? entries.length - 1 : null);
    setHoveredIndex(null);
  }, [viewMode, entries.length]);

  const width = 800;
  const height = 320;
  const padding = { top: 22, right: 22, bottom: 52, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = entries.map((entry) => entry.rating);
  const minValue = entries.length ? Math.floor(Math.min(...values) - 2) : 0;
  const maxValue = entries.length ? Math.ceil(Math.max(...values) + 2) : 100;
  const range = Math.max(maxValue - minValue, 1);
  const tickCount = 4;
  const x = (index) => entries.length === 1 ? padding.left + plotWidth / 2 : padding.left + (plotWidth * index) / (entries.length - 1);
  const y = (value) => padding.top + ((maxValue - value) / range) * plotHeight;
  const isZoomable = viewMode === "game";
  const chartScale = isZoomable ? zoomLevel : 1;
  const activeIndex = hoveredIndex ?? selectedIndex;
  const active = activeIndex === null ? null : entries[activeIndex];
  const previous = activeIndex !== null && activeIndex > 0 ? entries[activeIndex - 1] : null;
  const activeDelta = active?.ratingDelta ?? (active && previous ? active.rating - previous.rating : null);
  const tooltip = hoveredIndex === null ? null : entries[hoveredIndex];
  const tooltipPrevious = hoveredIndex !== null && hoveredIndex > 0 ? entries[hoveredIndex - 1] : null;
  const tooltipDelta = tooltip?.ratingDelta ?? (tooltip && tooltipPrevious ? tooltip.rating - tooltipPrevious.rating : null);
  const labelStep = Math.max(1, Math.ceil(entries.length / Math.max(6, Math.floor(8 * chartScale))));

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div className="chart-mode-control" role="group" aria-label="Rating 표시 단위">
          {CHART_MODES.map(([mode, label]) => (
            <button className={viewMode === mode ? "is-active" : ""} key={mode} type="button" onClick={() => setViewMode(mode)}>{label}</button>
          ))}
        </div>
        {isZoomable ? (
          <div className="chart-zoom-control" role="group" aria-label="경기별 그래프 가로 확대">
            <span className="chart-toolbar-label">가로 확대</span>
            <button type="button" aria-label="경기별 그래프 축소" onClick={() => setZoomLevel((current) => ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(current) - 1)])} disabled={zoomLevel === ZOOM_LEVELS[0]}>−</button>
            <span className="chart-zoom-value">{zoomLevel}×</span>
            <button type="button" aria-label="경기별 그래프 확대" onClick={() => setZoomLevel((current) => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(current) + 1)])} disabled={zoomLevel === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}>＋</button>
            <button className="chart-reset-button" type="button" onClick={() => setZoomLevel(1)}>전체</button>
          </div>
        ) : <span className="chart-zoom-note">가로 확대는 경기별 보기에서만 사용</span>}
      </div>
      {entries.length ? (
        <div className="chart-scroller">
          <div className="chart-stage" style={{ width: `${chartScale * 100}%` }}>
            <svg className="rating-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${CHART_MODES.find(([mode]) => mode === viewMode)?.[1] ?? "경기별"} Rating 변화 그래프`}>
              <desc>선수의 Rating 변화 그래프</desc>
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
              <polyline className="chart-line" points={entries.map((entry, index) => `${x(index)},${y(entry.rating)}`).join(" ")} />
              {entries.map((entry, index) => (
                <circle
                  className={`chart-point chart-point--${entry.granularity}${selectedIndex === index ? " is-selected" : ""}`}
                  key={entry.key}
                  cx={x(index)}
                  cy={y(entry.rating)}
                  r="5"
                  tabIndex="0"
                  role="button"
                  aria-label={`${entry.granularityLabel} ${formatDate(entry.date)} Rating ${formatRating(entry.rating)}${entry.result ? ` 결과 ${entry.result}` : ""}`}
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
                  <title>{formatDate(entry.date)} · Rating {formatRating(entry.rating)} · {chartEntrySummary(entry)}</title>
                </circle>
              ))}
              {entries.map((entry, index) => (
                index % labelStep === 0 || index === entries.length - 1 ? (
                  <text className="chart-date-label" key={`${entry.key}-label`} x={x(index)} y={height - 20} textAnchor="middle">{formatShortDate(entry.date)}</text>
                ) : null
              ))}
            </svg>
            {tooltip ? <ChartTooltip entry={tooltip} delta={tooltipDelta} pointX={x(hoveredIndex)} pointY={y(tooltip.rating)} width={width} height={height} /> : null}
          </div>
        </div>
      ) : (
        <LoadingState>{CHART_MODES.find(([mode]) => mode === viewMode)?.[1] ?? "선택한"} 기록이 없습니다.</LoadingState>
      )}
      <div className="chart-interaction" aria-live="polite">
        <div>
          <span className="chart-interaction-label">{hoveredIndex !== null ? "가리킨 기록" : "선택된 기록"}</span>
          {active ? (
            <>
              <strong>{active.granularityLabel} · {formatDate(active.date)} · Rating {formatRating(active.rating)} · <Delta value={activeDelta} /></strong>
              <span className="chart-interaction-summary">{chartEntrySummary(active)}</span>
            </>
          ) : <strong>그래프의 점을 가리키거나 클릭해 주세요.</strong>}
        </div>
        <button type="button" onClick={() => setSelectedIndex(null)} disabled={selectedIndex === null}>선택 해제</button>
      </div>
    </div>
  );
}

function RatingHistory({ ratings, player }) {
  const gameEntries = useMemo(() => buildGameEntries(ratings, sortAppearances(player)), [ratings, player]);
  const rows = gameEntries.length
    ? gameEntries.slice().reverse()
    : ratings.map((snapshot, index) => ({
      key: `snapshot-${snapshot.date}-${index}`,
      date: snapshot.date,
      gameId: null,
      rating: snapshot.rating,
      ratingDelta: toNumber(snapshot.ratingDelta) ?? (index > 0 ? snapshot.rating - ratings[index - 1].rating : null),
      summary: "경기별 원자료 없음",
      modelVersion: snapshot.modelVersion
    })).reverse();
  return (
    <section className="detail-card" aria-labelledby="rating-history-title">
      <div className="detail-card-header"><h3 id="rating-history-title">경기별 Rating</h3><span>더블헤더는 gameId 기준으로 별도 집계됩니다</span></div>
      <RatingChart ratings={ratings} player={player} />
      <div className="data-table-scroller">
        <table className="detail-table">
          <thead><tr><th scope="col">날짜</th><th scope="col">경기</th><th scope="col">Rating</th><th scope="col">변화</th><th scope="col">성적 요약</th><th scope="col">모델</th></tr></thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.key}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.gameId || "—"}</td>
                  <td className={ratingBand(row.rating)}>{formatRating(row.rating)}</td>
                  <td><Delta value={row.ratingDelta} /></td>
                  <td>{row.summary || "—"}</td>
                  <td>{row.modelVersion || "—"}</td>
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
            <RatingHistory ratings={ratings} player={player} />
            <BattingStats player={player} />
            <PlateAppearances player={player} />
            <PlayerTechnicalInfo player={player} />
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
