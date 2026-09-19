import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { fetchPlayerDetail, fetchRatingDiff, fetchRatingDiffDates, fetchTeamRatings } from "./data";
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

function sectionDisplayName(league) {
  if (league === "잔류군" || league === "residual") return "잔류군";
  return league === "1군" || league === "major" ? "KBO 리그" : "퓨쳐스리그";
}

const TEAM_ORDER_2025 = ["LG", "한화", "삼성", "SSG", "NC", "KT", "두산", "롯데", "KIA", "키움"];

function canonicalTeamLabel(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["hh", "한화", "한화 이글스"].includes(normalized)) return "한화";
  if (["ss", "삼성", "삼성 라이온즈"].includes(normalized)) return "삼성";
  if (["sk", "ssg", "ssg 랜더스"].includes(normalized)) return "SSG";
  if (["lg 트윈스"].includes(normalized)) return "LG";
  if (normalized === "lg") return "LG";
  if (["nc 다이노스"].includes(normalized)) return "NC";
  if (normalized === "nc") return "NC";
  if (["kt 위즈"].includes(normalized)) return "KT";
  if (normalized === "kt") return "KT";
  if (["ob", "두산", "두산 베어스"].includes(normalized)) return "두산";
  if (["lt", "롯데", "롯데 자이언츠"].includes(normalized)) return "롯데";
  if (["kia", "ht", "기아", "kia 타이거즈"].includes(normalized)) return "KIA";
  if (["wo", "키움", "키움 히어로즈", "고양", "goyang"].includes(normalized)) return "키움";
  return String(value ?? "").trim();
}

const TEAM_FULL_NAMES = {
  LG: "LG 트윈스",
  한화: "한화 이글스",
  삼성: "삼성 라이온즈",
  SSG: "SSG 랜더스",
  NC: "NC 다이노스",
  KT: "KT 위즈",
  두산: "두산 베어스",
  롯데: "롯데 자이언츠",
  KIA: "KIA 타이거즈",
  키움: "키움 히어로즈"
};

function fullTeamName(value) {
  const canonical = canonicalTeamLabel(value);
  return canonical ? (TEAM_FULL_NAMES[canonical] ?? canonical) : "구단 미상";
}

function isPitcherPlayer(player) {
  const role = String(player?.role ?? "").trim().toLowerCase();
  const position = String(player?.profile?.position ?? "").trim().toLowerCase();
  return ["투수", "pitcher", "picher"].includes(role) || ["투수", "pitcher", "picher"].includes(position);
}

function roleLabel(role) {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (["투수", "pitcher", "picher"].includes(normalized)) return "투수";
  if (["타자", "batter", "hitter"].includes(normalized)) return "타자";
  return String(role ?? "").trim() || "—";
}

function positionLabel(profile) {
  if (profile?.isCatcher) return "포수";
  const normalized = String(profile?.position ?? "").trim().toLowerCase();
  if (["포수", "catcher"].includes(normalized)) return "포수";
  if (["내야수", "내야", "infielder", "infield"].includes(normalized)) return "내야수";
  if (["외야수", "외야", "outfielder", "outfilder", "outfield"].includes(normalized)) return "외야수";
  if (["투수", "pitcher", "picher"].includes(normalized)) return "투수";
  return String(profile?.position ?? "").trim() || "—";
}

function rolePositionLabel(player) {
  if (isPitcherPlayer(player)) return "투수";
  const position = positionLabel(player?.profile ?? {});
  return position === "—" || position === "투수" ? "야수" : `야수 · ${position}`;
}

function currentAffiliationLabel(player) {
  const profile = player?.profile ?? {};
  const value = profile.currentAffiliation
    ?? profile.currentRosterGroup
    ?? player?.currentAffiliation
    ?? player?.rosterGroup
    ?? profile.league
    ?? player?.league;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1군", "major", "kbo", "kbo 리그"].includes(normalized)) return "1군";
  if (["2군", "minor", "futures", "퓨처스리그", "퓨쳐스리그"].includes(normalized)) return "2군";
  if (["잔류군", "residual", "reserve"].includes(normalized)) return "잔류군";
  return String(value ?? "").trim() || "—";
}

function teamOrderIndex(value) {
  const index = TEAM_ORDER_2025.indexOf(canonicalTeamLabel(value));
  return index === -1 ? TEAM_ORDER_2025.length : index;
}

function ratingBand(value) {
  const number = toNumber(value);
  if (number === null) return "band-empty";
  if (number >= 80) return "band-high";
  if (number >= 65) return "band-good";
  if (number >= 50) return "band-mid";
  return "band-low";
}

const MEDICAL_STATUS_LABELS = {
  injury_list: "부상자 명단",
  rehab_list: "치료·재활 명단",
  foreign_player_rehab: "외국인 재활 명단"
};

function medicalStatusText(player) {
  const label = MEDICAL_STATUS_LABELS[player?.medicalStatus];
  if (!label) return null;
  const details = [label, player.medicalEventDate, player.medicalNote].filter(Boolean);
  return details.join(" · ");
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
  const isDiffPage = window.location.pathname.endsWith("/diff.html");
  return (
    <header className="page-header">
      <div className="header-main">
        <div className="title-lockup">
          <a className="brand-link" href="./index.html" aria-label="KBO Plate Index 메인 페이지">
            <span className="project-mark" aria-hidden="true">KPI</span>
            <div>
              <h1>KBO Plate Index</h1>
              <p>{subtitle}</p>
            </div>
          </a>
        </div>
        <nav className="top-nav" aria-label="주요 메뉴">
          <a className={!isDiffPage ? "is-active" : ""} href="./index.html">구단별 Rating</a>
          <a className={isDiffPage ? "is-active" : ""} href="./diff.html">KPI 변동표</a>
        </nav>
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

function EmptyDataState({ children }) {
  return (
    <div className="empty-data-state" role="status">
      <strong>표시할 구단 Rating 데이터가 없습니다.</strong>
      <span>{children}</span>
    </div>
  );
}

function PlayerLink({ player }) {
  if (!player) return <td className="name-cell empty-cell" aria-label="선수 없음" />;
  const grayClass = player.gray ? " is-gray" : "";
  const medicalText = medicalStatusText(player);
  const medicalClass = medicalText ? " is-medical" : "";
  const href = playerPageHref(player);
  return (
    <td className={`name-cell${grayClass}${medicalClass}`} title={medicalText ? `${player.name} · ${medicalText}` : player.name}>
      <span className="player-name-content">
        {href ? (
          <a className="player-link" href={href}>{player.name}</a>
        ) : (
          <span className="player-link player-link--unresolved">{player.name}</span>
        )}
        {medicalText ? <span className="medical-status-mark" title={medicalText} aria-label={medicalText}>†</span> : null}
      </span>
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

function EstimatedStrengthRow({ teams }) {
  if (!teams.length || teams[0].league !== "1군") return null;
  const values = teams.map((team) => team.averages?.average18);

  return (
    <tr className="strength-row">
      {teams.map((team) => {
        const strengthClass = averageBand(team.averages?.average18, values);
        const rank = team.estimatedStrengthRank;
        return (
          <Fragment key={`${team.team}-strength`}>
            <td className={`average-label ${strengthClass}`}>18명 평균</td>
            <td className={`average-value ${strengthClass}`}>{formatRating(team.averages?.average18)}</td>
            <td className={`average-label ${strengthClass}`}>추정 전력</td>
            <td className={`average-value ${strengthClass}`}>{rank ? `${rank}등` : "—"}</td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function TeamRatingTable({ section, isSecondary = false }) {
  const teams = [...(section.teams ?? [])].sort((a, b) => {
    const orderDifference = teamOrderIndex(a.team) - teamOrderIndex(b.team);
    return orderDifference || String(a.team ?? "").localeCompare(String(b.team ?? ""), "ko");
  });
  const rowCount = Math.max(1, ...teams.map((team) => Math.max(team.batters?.length || 0, team.pitchers?.length || 0)));
  const sectionLabel = sectionDisplayName(section.league);

  return (
    <section className={`rating-section${isSecondary ? " is-secondary" : ""}`} aria-labelledby={`section-title-${section.league}`}>
      <div className="section-heading">
        <h3 id={`section-title-${section.league}`}>{sectionLabel}</h3>
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
            <EstimatedStrengthRow teams={teams} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function diffDeltaClass(value) {
  const number = toNumber(value);
  if (number === null || number === 0) return "is-neutral";
  return number > 0 ? "is-up" : "is-down";
}

function formatDiffDelta(value) {
  const number = toNumber(value);
  if (number === null || number === 0) return "—";
  return `${number > 0 ? "▲" : "▼"}${Math.abs(number).toFixed(1)}`;
}

function floatingDiffTooltipPosition(rect) {
  const margin = 12;
  const gap = 7;
  const width = Math.min(260, Math.max(190, window.innerWidth - margin * 2));
  const left = Math.min(Math.max(rect.left, margin), Math.max(margin, window.innerWidth - width - margin));
  const estimatedHeight = 180;
  const below = rect.bottom + gap;
  const top = below + estimatedHeight <= window.innerHeight - margin
    ? below
    : Math.max(margin, rect.top - estimatedHeight - gap);
  return { left, top };
}

function DiffHoverCard({ player, role, position }) {
  const plateAppearances = Array.isArray(player.plateAppearances) ? player.plateAppearances : [];
  return createPortal(
    <div
      className="diff-hover-card diff-hover-card--floating"
      role="tooltip"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
    >
      <strong>{player.summary || (role === "pitcher" ? "당일 투구 기록 요약 없음" : "당일 타격 기록 요약 없음")}</strong>
      {plateAppearances.length ? plateAppearances.map((appearance, index) => (
        <span className="diff-hover-game" key={`${appearance.opponentName ?? "opponent"}-${appearance.result ?? "result"}-${index}`}>
          vs. {appearance.opponentName || "—"}, {appearance.result || "결과 없음"}, <span className={diffDeltaClass(appearance.ratingDelta)}>{formatDiffDelta(appearance.ratingDelta)}</span>
        </span>
      )) : <span className="diff-hover-game">세부 타석 기록이 없습니다.</span>}
    </div>,
    document.body
  );
}

function DiffPlayerCells({ player, role }) {
  if (!player) {
    return (
      <>
        <td className="diff-name-cell empty-cell" aria-label="출전 선수 없음" />
        <td className="diff-rating-cell empty-cell" aria-label="Rating 없음" />
      </>
    );
  }

  return <DiffPlayerCellsWithTooltip player={player} role={role} />;
}

function DiffPlayerCellsWithTooltip({ player, role }) {
  const grayClass = player.gray ? " is-gray" : "";
  const href = playerPageHref(player);
  const nameCellRef = useRef(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(null);

  const updateTooltipPosition = useCallback(() => {
    if (!nameCellRef.current) return;
    setTooltipPosition(floatingDiffTooltipPosition(nameCellRef.current.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    if (!tooltipVisible) return undefined;
    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [tooltipVisible, updateTooltipPosition]);

  const showTooltip = () => {
    updateTooltipPosition();
    setTooltipVisible(true);
  };
  const hideTooltip = () => setTooltipVisible(false);

  return (
    <>
      <td
        ref={nameCellRef}
        className={`diff-name-cell${grayClass}`}
        title={player.summary || player.name}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {href ? <a className="player-link" href={href}>{player.name}</a> : <span className="player-link player-link--unresolved">{player.name}</span>}
      </td>
      <td className={`diff-rating-cell ${ratingBand(player.rating)}`}>
        <span className="diff-rating-value">{formatRating(player.rating)}</span>
        <span className={`diff-delta ${diffDeltaClass(player.ratingDelta)}`}>{formatDiffDelta(player.ratingDelta)}</span>
      </td>
      {tooltipVisible && tooltipPosition ? <DiffHoverCard player={player} role={role} position={tooltipPosition} /> : null}
    </>
  );
}

function DiffTeamTable({ section, isSecondary = false }) {
  const teams = [...(section.teams ?? [])].sort((a, b) => {
    const orderDifference = teamOrderIndex(a.team) - teamOrderIndex(b.team);
    return orderDifference || String(a.team ?? "").localeCompare(String(b.team ?? ""), "ko");
  });
  const rowCount = Math.max(1, ...teams.map((team) => Math.max(team.batters?.length || 0, team.pitchers?.length || 0)));
  const sectionLabel = sectionDisplayName(section.league);

  return (
    <section className={`rating-section${isSecondary ? " is-secondary" : ""}`} aria-labelledby={`diff-section-title-${section.league}`}>
      <div className="section-heading">
        <h3 id={`diff-section-title-${section.league}`}>{sectionLabel}</h3>
        <span>{teams.length}개 구단 · 출전 선수만 표시</span>
      </div>
      <div className="matrix-scroller">
        <table className="rating-matrix diff-matrix" aria-describedby={`diff-section-title-${section.league}`}>
          <colgroup>
            {teams.map((team) => (
              <Fragment key={`${team.team}-diff-columns`}>
                <col className="name-column diff-name-column" />
                <col className="rating-column diff-rating-column" />
                <col className="name-column diff-name-column" />
                <col className="rating-column diff-rating-column" />
              </Fragment>
            ))}
          </colgroup>
          <thead>
            <tr className="team-row">
              {teams.map((team) => <th key={`${team.team}-diff-team`} colSpan="4" scope="colgroup">{team.team}</th>)}
            </tr>
            <tr className="role-row">
              {teams.map((team) => (
                <Fragment key={`${team.team}-diff-roles`}>
                  <th colSpan="2">타자</th>
                  <th colSpan="2">투수</th>
                </Fragment>
              ))}
            </tr>
            <tr className="field-row">
              {teams.map((team) => (
                <Fragment key={`${team.team}-diff-fields`}>
                  <th>이름</th><th>Rating<br />변동</th><th>이름</th><th>Rating<br />변동</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <tr key={`${section.league}-diff-row-${rowIndex}`}>
                {teams.map((team) => (
                  <Fragment key={`${team.team}-diff-${rowIndex}`}>
                    <DiffPlayerCells player={team.batters?.[rowIndex] ?? null} role="batter" />
                    <DiffPlayerCells player={team.pitchers?.[rowIndex] ?? null} role="pitcher" />
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiffPage() {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchRatingDiffDates()
      .then((result) => {
        if (cancelled) return;
        const nextDates = Array.isArray(result?.dates) ? result.dates : [];
        setDates(nextDates);
        const latest = result?.latest || nextDates[nextDates.length - 1]?.date || "";
        setSelectedDate(latest);
      })
      .catch((nextError) => { if (!cancelled) setError(nextError); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedDate) return undefined;
    let cancelled = false;
    setData(null);
    fetchRatingDiff(selectedDate)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((nextError) => { if (!cancelled) setError(nextError); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const sections = data?.sections ?? [];
  const meta = data?.meta;
  const selectedOption = dates.find((option) => option.date === selectedDate);

  return (
    <div className="page-shell">
      <PageHeader
        subtitle="KPI 변동표"
        action={<span>{meta?.date ? `${meta.date} 기준` : "기준일 확인 중"}</span>}
      />
      <main className="page-content">
        <section className="sheet-card" aria-labelledby="diff-title">
          <div className="sheet-card-header diff-card-header">
            <div>
              <p className="kicker">KPI DIFF</p>
              <h2 id="diff-title">KPI 변동표</h2>
              <p className="sheet-description">선택한 경기일에 실제로 출전한 선수의 경기 종료 후 Rating과 당일 변동량입니다.</p>
            </div>
            <label className="diff-date-control">
              <span>경기일</span>
              <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} disabled={!dates.length}>
                {!dates.length ? <option value="">날짜를 불러오는 중</option> : dates.map((option) => (
                  <option key={option.date} value={option.date}>
                    {option.date}{option.gameCount ? ` · ${option.gameCount}경기` : " · 경기 없음"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="diff-summary-bar">
            <span>{meta?.hasGames ? `${meta.gameCount}경기 반영` : meta?.date ? "해당 날짜 경기 없음" : "날짜별 경기 정보를 확인하는 중"}</span>
            {selectedOption ? <span>{selectedOption.date} · {selectedOption.gameCount ? "출전 기록 있음" : "표는 빈칸으로 표시"}</span> : null}
          </div>
          <div className="diff-legend" aria-label="변동표 안내">
            <span className="legend-item"><i className="legend-swatch band-high" />80 이상</span>
            <span className="legend-item"><i className="legend-swatch band-good" />65 이상</span>
            <span className="legend-item"><i className="legend-swatch band-mid" />50 이상</span>
            <span className="legend-item"><i className="legend-swatch band-low" />50 미만</span>
            <span className="diff-legend-delta is-up">▲ 상승</span>
            <span className="diff-legend-delta is-down">▼ 하락</span>
          </div>
          <div className="rating-sections" aria-busy={!data && !error}>
            {error ? <LoadError>변동표 API와 데이터베이스 연결을 확인해 주세요.</LoadError> : data ? sections.map((section, index) => <DiffTeamTable key={`${section.league}-${index}`} section={section} isSecondary={index > 0} />) : <LoadingState>경기일별 KPI 변동을 불러오는 중입니다.</LoadingState>}
          </div>
        </section>
      </main>
      <PageFooter><a href="./index.html">구단별 Rating으로 돌아가기</a></PageFooter>
    </div>
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
  const isDatabaseSource = data?.meta?.source === "sqlite_api";
  const isUnavailable = Boolean(error) || Boolean(data && !sections.length);
  return (
    <div className="page-shell">
      <PageHeader
        subtitle={`${data?.meta?.asOf ?? (isUnavailable ? "데이터 대기 중" : "기준일 확인 중")} KBO 구단별 Rating`}
        action={
          isUnavailable ? <span>API 연결 필요</span> : (
            <>
              <span>{data?.meta?.asOf ? `${data.meta.asOf} 기준` : "기준일 확인 중"}</span>
              <span className="source-divider" aria-hidden="true">·</span>
              <span>{isDatabaseSource ? "SQLite 자동 구성" : "정적 참고 표"}</span>
            </>
          )
        }
      />
      <main className="page-content">
        <section className="sheet-card" aria-labelledby="sheet-title">
          <div className="sheet-card-header">
            <div>
              <p className="kicker">TEAM RATING</p>
              <h2 id="sheet-title">구단별 Rating</h2>
              <p className="sheet-description">
                {isDatabaseSource
                  ? "SQLite의 선수 Rating을 기준일에 맞춰 구단·리그별로 자동 구성합니다."
                  : isUnavailable
                    ? "백엔드 API 연결 후 최신 구단·선수 Rating을 표시합니다."
                    : "백엔드 API가 연결되기 전에는 참고 시트의 구단·선수 배열을 표시합니다."}
              </p>
            </div>
            {!isUnavailable ? (
              <div className="legend" aria-label="Rating 색상 기준">
                <span className="legend-item"><i className="legend-swatch band-high" />80 이상</span>
                <span className="legend-item"><i className="legend-swatch band-good" />65–79.9</span>
                <span className="legend-item"><i className="legend-swatch band-mid" />50–64.9</span>
                <span className="legend-item"><i className="legend-swatch band-low" />50 미만</span>
                <span className="legend-item"><i className="legend-status-mark">†</i>부상·재활 명단</span>
              </div>
            ) : null}
          </div>
          <div className="rating-sections">
            {isUnavailable ? <EmptyDataState>백엔드 API가 연결되면 이 영역에 구단별 표가 표시됩니다.</EmptyDataState> : data ? sections.map((section, index) => <TeamRatingTable key={`${section.league}-${index}`} section={section} isSecondary={index > 0} />) : <LoadingState>구단 Rating 데이터를 불러오는 중입니다.</LoadingState>}
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

function relationPlayerId(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return null;
  return relationPlayerId(value.playerId ?? value.id ?? value.player_id);
}

function relatedPlayerIdForRole(player, targetRole) {
  const roleKeys = targetRole === "pitcher"
    ? ["pitcher", "투수", "pitcherPlayerId", "pitcher_player_id"]
    : ["batter", "타자", "batterPlayerId", "batter_player_id"];
  const sources = [
    player?.roleLinks,
    player?.relatedPlayerIds,
    player?.alternatePlayerIds,
    player?.relatedPlayers,
    player?.profile?.roleLinks
  ];

  for (const source of sources) {
    if (Array.isArray(source)) {
      const relation = source.find((candidate) => roleKeys.includes(String(candidate?.role ?? candidate?.type ?? "").trim().toLowerCase()));
      const id = relationPlayerId(relation);
      if (id) return id;
      continue;
    }
    if (!source || typeof source !== "object") continue;
    for (const roleKey of roleKeys) {
      const id = relationPlayerId(source[roleKey]);
      if (id) return id;
    }
  }

  if (player?.alternateRole && roleKeys.includes(String(player.alternateRole).trim().toLowerCase())) {
    return relationPlayerId(player.alternatePlayerId);
  }
  return relationPlayerId(player?.[targetRole === "pitcher" ? "pitcherPlayerId" : "batterPlayerId"])
    ?? relationPlayerId(player?.[targetRole === "pitcher" ? "pitcher_player_id" : "batter_player_id"]);
}

function PlayerRoleLinks({ player }) {
  const currentRole = isPitcherPlayer(player) ? "pitcher" : "batter";
  const targetRole = currentRole === "pitcher" ? "batter" : "pitcher";
  const targetPlayerId = relatedPlayerIdForRole(player, targetRole);
  if (!targetPlayerId) return null;

  return (
    <div className="record-view-links" aria-label="선수 기록 화면 이동">
      <span><span className="profile-label">현재 기록</span><strong>{roleLabel(player.role)} 기록</strong></span>
      <a href={`./player.html?player_id=${encodeURIComponent(targetPlayerId)}`}>{roleLabel(targetRole)} 기록 보기 <span aria-hidden="true">→</span></a>
    </div>
  );
}

function PlayerProfile({ player, ratings }) {
  const profile = player.profile ?? {};
  const latest = ratings[ratings.length - 1] ?? null;
  const items = [
    ["역할·포지션", rolePositionLabel(player)],
    ["소속 구단", fullTeamName(profile.team)],
    ["현 소속", currentAffiliationLabel(player)],
    ["생년월일", profile.birthDate]
  ];

  return (
    <>
      <section className="player-card" aria-labelledby="player-title">
        <PlayerPhoto player={player} />
        <div className="player-summary">
          <p className="kicker">PLAYER PROFILE</p>
          <h2 id="player-title">{player.displayName}</h2>
          <p className="player-english-name">{profile.englishName}</p>
          <div className="profile-grid" aria-label="선수 기본 정보">
            {items.map(([label, value]) => (
              <div className="profile-item" key={label}>
                <div className="profile-label">{label}</div>
                <div className="profile-value" title={value || "—"}>{value || "—"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className={`current-rating ${ratingBand(latest?.rating)}`}>
          <strong className="current-rating-value">{formatRating(latest?.rating)}</strong>
        </div>
      </section>
      <PlayerRoleLinks player={player} />
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

function gameTeamsFromId(gameId) {
  const value = String(gameId ?? "");
  const match = value.match(/^\d{8}([A-Za-z]{2})([A-Za-z]{2})/);
  if (!match) return null;
  return { home: match[1], away: match[2] };
}

function gameHomeAway(gameId, playerTeam) {
  const teams = gameTeamsFromId(gameId);
  if (!teams || !playerTeam) return null;
  const playerLabel = canonicalTeamLabel(playerTeam);
  if (playerLabel && playerLabel === canonicalTeamLabel(teams.home)) return "홈";
  if (playerLabel && playerLabel === canonicalTeamLabel(teams.away)) return "원정";
  return null;
}

function gameOpponentName(appearance, playerTeam) {
  const teams = gameTeamsFromId(appearance?.gameId);
  const playerLabel = canonicalTeamLabel(playerTeam);
  const parsedOpponent = teams
    ? (playerLabel === canonicalTeamLabel(teams.home) ? teams.away : playerLabel === canonicalTeamLabel(teams.away) ? teams.home : null)
    : null;
  return fullTeamName(appearance?.opponent || parsedOpponent);
}

function gameContextText(entry, player) {
  const opponent = entry.opponentDisplay || gameOpponentName(entry, player?.profile?.team);
  const homeAway = entry.homeAway || gameHomeAway(entry.gameId, player?.profile?.team);
  return { opponent, homeAway };
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

function summarizeBattingPerformance(appearances) {
  const counts = { plateAppearances: appearances.length, atBats: 0, hits: 0, homeRuns: 0, walks: 0, strikeouts: 0 };

  appearances.forEach((appearance) => {
    const result = String(appearance.result ?? "");
    if (!result) return;
    if (/고의사구|볼넷|walk|bb/i.test(result)) {
      counts.walks += 1;
      return;
    }
    if (/사구|몸에맞는공|hbp/i.test(result)) return;
    if (/희생|번트|방해/i.test(result)) return;

    counts.atBats += 1;
    if (/안타|홈런|루타|single|double|triple|home.?run/i.test(result)) counts.hits += 1;
    if (/홈런|home.?run/i.test(result)) counts.homeRuns += 1;
    if (/삼진|낫아웃|strike.?out/i.test(result)) counts.strikeouts += 1;
  });

  return counts;
}

function numericField(record, keys) {
  for (const key of keys) {
    const value = toNumber(record?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function sumNumericFields(records, keys) {
  const values = records.map((record) => numericField(record, keys)).filter((value) => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function inningsValueToOuts(value) {
  const number = toNumber(value);
  if (number === null) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d+)\.(\d)$/);
  if (match && Number(match[2]) <= 2) return Number(match[1]) * 3 + Number(match[2]);
  return number * 3;
}

function formatInnings(outs) {
  const number = toNumber(outs);
  if (number === null) return "—";
  const wholeOuts = Math.round(number);
  return `${Math.floor(wholeOuts / 3)}.${wholeOuts % 3}`;
}

function summarizePitchingPerformance(appearances) {
  const outs = sumNumericFields(appearances, ["outs", "pitchingOuts", "inningOuts"])
    ?? (appearances
      .map((appearance) => numericField(appearance, ["inningsPitched", "ip", "ipText", "innings", "inning"]))
      .filter((value) => value !== null)
      .map(inningsValueToOuts)
      .filter((value) => value !== null)
      .reduce((total, value) => total + value, 0) || null);

  return {
    innings: outs === null ? null : formatInnings(outs),
    hitsAllowed: sumNumericFields(appearances, ["hitsAllowed", "hits_allowed", "pitchingHits"]),
    homeRunsAllowed: sumNumericFields(appearances, ["homeRunsAllowed", "hrAllowed", "pitchingHomeRuns"]),
    walks: sumNumericFields(appearances, ["walks", "basesOnBalls", "bb"]),
    strikeouts: sumNumericFields(appearances, ["strikeouts", "so", "strikeOuts"])
  };
}

function summarizeGamePerformance(appearances, player) {
  return isPitcherPlayer(player)
    ? { kind: "pitching", ...summarizePitchingPerformance(appearances) }
    : { kind: "batting", ...summarizeBattingPerformance(appearances) };
}

function performanceSummaryText(performance) {
  if (!performance) return "기록 없음";
  if (performance.kind === "pitching") {
    if ([performance.innings, performance.hitsAllowed, performance.homeRunsAllowed, performance.walks, performance.strikeouts].every((value) => value === null || value === undefined)) return "투구 기록 없음";
    return `${performance.innings ?? "—"}이닝 · ${performance.hitsAllowed ?? "—"}피안타 · ${performance.homeRunsAllowed ?? "—"}피홈런 · ${performance.walks ?? "—"}볼넷 · ${performance.strikeouts ?? "—"}삼진`;
  }

  const parts = [`타석 ${performance.plateAppearances}회`];
  if (performance.atBats) parts.push(`타수 ${performance.atBats}`);
  if (performance.hits) parts.push(`안타 ${performance.hits}`);
  if (performance.homeRuns) parts.push(`홈런 ${performance.homeRuns}`);
  if (performance.walks) parts.push(`볼넷 ${performance.walks}`);
  if (performance.strikeouts) parts.push(`삼진 ${performance.strikeouts}`);
  return parts.join(" · ");
}

function summarizeAppearances(appearances) {
  return performanceSummaryText({ kind: "batting", ...summarizeBattingPerformance(appearances) });
}

function buildGameEntries(ratings, appearances, player) {
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
    const performance = summarizeGamePerformance(group, player);
    const opponentDisplay = gameOpponentName(first, player?.profile?.team);

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
      opponentDisplay,
      homeAway: gameHomeAway(first.gameId, player?.profile?.team),
      appearances: group,
      paCount: group.length,
      results: resultValues,
      performance,
      summary: performanceSummaryText(performance),
      modelVersion: last.modelVersion ?? last.ratingEffect?.modelVersion
    };
  }).filter((entry) => entry.rating !== null && entry.rating !== undefined);
}

function buildPlateAppearanceEntries(ratings, appearances, player) {
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
    opponentDisplay: gameOpponentName(appearance, player?.profile?.team),
    homeAway: gameHomeAway(appearance.gameId, player?.profile?.team),
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
  if (mode === "plateAppearance") return buildPlateAppearanceEntries(ratings, appearances, player);
  return buildGameEntries(ratings, appearances, player);
}

function chartEntrySummary(entry) {
  if (entry.granularity === "game") {
    const venue = entry.venue ? `${entry.venue} · ` : "";
    const opponent = entry.opponentDisplay ? `상대 ${entry.opponentDisplay}${entry.homeAway ? ` · ${entry.homeAway}` : ""} · ` : "";
    return `${venue}${opponent}${entry.summary}`;
  }
  const opponent = entry.opponentDisplay ? `상대 ${entry.opponentDisplay}${entry.homeAway ? ` · ${entry.homeAway}` : ""} · ` : "";
  return `${opponent}${entry.result || "결과 기록 없음"}`;
}

function isSameRating(value, target) {
  const first = toNumber(value);
  const second = toNumber(target);
  return first !== null && second !== null && Math.abs(first - second) < 0.000001;
}

function maximumEntryLabel(entry) {
  if (!entry) return "";
  const detail = entry.granularity === "plateAppearance"
    ? ` · ${entry.plateAppearanceNumber ? `${entry.plateAppearanceNumber}번째 타석` : "타석"}`
    : "";
  return `최대 ${formatDate(entry.date)}${detail} · ${formatRating(entry.rating)}`;
}

function escapeChartHtml(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function chartDeltaHtml(value) {
  const number = toNumber(value);
  if (number === null || number === 0) return "—";
  const color = number > 0 ? "#b14f4f" : "#356b9a";
  const arrow = number > 0 ? "▲" : "▼";
  return `<span style="color:${color};font-weight:700">${arrow}${Math.abs(number).toFixed(1)}</span>`;
}

function chartTooltipHtml(entry, delta) {
  if (!entry) return "";
  const gameContext = `${entry.opponentDisplay || "상대 정보 없음"}${entry.homeAway ? ` · ${entry.homeAway}` : ""}`;
  const lines = entry.granularity === "game"
    ? [
        `vs. ${gameContext} · ${entry.venue || "구장 미상"}`,
        `${entry.paCount ?? 0}타석`,
        `성적 ${entry.summary || "기록 없음"}`,
        ...(entry.results?.length ? [`결과 ${entry.results.slice(0, 6).join(" · ")}${entry.results.length > 6 ? " · …" : ""}`] : []),
        `Rating 변화 ${chartDeltaHtml(delta)}`
      ]
    : [
        `vs. ${gameContext} · ${entry.venue || "구장 미상"}`,
        `${entry.plateAppearanceNumber ? `${entry.plateAppearanceNumber}번째 타석` : "타석 번호 없음"}`,
        `결과 ${entry.result || "—"}`,
        `Rating 변화 ${chartDeltaHtml(delta)}`
      ];

  return `<div class="echarts-tooltip-content">
    <span class="echarts-tooltip-kicker">${escapeChartHtml(entry.granularityLabel)}</span>
    <strong>${escapeChartHtml(formatDate(entry.date))} · Rating ${escapeChartHtml(formatRating(entry.rating))}</strong>
    <div class="echarts-tooltip-lines">${lines.map((line) => `<span>${line.includes("Rating 변화") ? line : escapeChartHtml(line)}</span>`).join("")}</div>
  </div>`;
}

function chartDateFromAxisValue(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return String(value ?? "");
  return formatShortDate(date.toISOString().slice(0, 10));
}

function RatingChart({ ratings, player }) {
  const [viewMode, setViewMode] = useState("game");
  const [showAllGames, setShowAllGames] = useState(false);
  const entries = useMemo(() => buildChartEntries(viewMode, ratings, player), [viewMode, ratings, player]);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(entries.length ? entries.length - 1 : null);
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const chartOptionRef = useRef({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    setSelectedIndex(entries.length ? entries.length - 1 : null);
    setHoveredIndex(null);
  }, [viewMode, entries.length]);

  const isZoomable = viewMode === "game";
  const timelineInfo = useMemo(() => {
    const times = entries.map((entry) => Date.parse(`${entry.date}T00:00:00`));
    const validTimes = times.filter(Number.isFinite);
    const useTimeScale = isZoomable && validTimes.length === entries.length && validTimes.length > 1;
    const earliest = validTimes.length ? Math.min(...validTimes) : 0;
    const latest = validTimes.length ? Math.max(...validTimes) : 0;
    const fullSpanDays = earliest < latest ? (latest - earliest) / (24 * 60 * 60 * 1000) : 0;
    const visibleDays = showAllGames ? fullSpanDays : Math.min(Math.max(fullSpanDays, 1), 30);
    const startTime = useTimeScale ? Math.max(earliest, latest - visibleDays * 24 * 60 * 60 * 1000) : earliest;
    const startIndex = useTimeScale
      ? times.findIndex((time) => Number.isFinite(time) && time >= startTime)
      : showAllGames
        ? 0
        : Math.max(0, entries.length - Math.min(entries.length, 30));

    return {
      times,
      useTimeScale,
      earliest,
      latest,
      startTime,
      startIndex: startIndex < 0 ? 0 : startIndex
    };
  }, [entries, isZoomable, showAllGames]);

  const values = entries.map((entry) => entry.rating);
  const observedMin = entries.length ? Math.min(...values) : 0;
  const observedMax = entries.length ? Math.max(...values) : 100;
  const observedRange = Math.max(observedMax - observedMin, 1);
  const verticalMargin = entries.length ? observedRange * 0.1 : 0;
  const axisMin = entries.length ? Math.floor((observedMin - verticalMargin) / 10) * 10 : 0;
  const axisMax = entries.length ? Math.ceil((observedMax + verticalMargin) / 10) * 10 : 100;
  const maximumRating = entries.length ? Math.max(...values) : null;
  const maximumIndex = entries.reduce((lastIndex, entry, index) => (isSameRating(entry.rating, maximumRating) ? index : lastIndex), -1);
  const maximumEntry = maximumIndex >= 0 ? entries[maximumIndex] : null;
  const activeIndex = hoveredIndex ?? selectedIndex;
  const active = activeIndex === null ? null : entries[activeIndex];
  const previous = activeIndex !== null && activeIndex > 0 ? entries[activeIndex - 1] : null;
  const activeDelta = active?.ratingDelta ?? (active && previous ? active.rating - previous.rating : null);

  const chartOption = useMemo(() => {
    if (!entries.length) return {};

    const xValues = timelineInfo.useTimeScale
      ? timelineInfo.times
      : entries.map((_, index) => index);
    const chartData = entries.map((entry, index) => {
      const maximum = isSameRating(entry.rating, maximumRating);
      const selected = selectedIndex === index;
      return {
        value: [xValues[index], entry.rating],
        entryIndex: index,
        itemStyle: selected
          ? { color: "#fff0ad", borderColor: "#a77a25", borderWidth: 3 }
          : maximum
            ? { color: "#fff8d6", borderColor: "#a77a25", borderWidth: 2.5 }
            : { color: "#ffffff", borderColor: "#6f4c2f", borderWidth: 1.8 }
      };
    });

    const ratingBands = [
      { min: Number.NEGATIVE_INFINITY, max: 50, color: "#f4cccc" },
      { min: 50, max: 65, color: "#fff2cc" },
      { min: 65, max: 80, color: "#e2f0d9" },
      { min: 80, max: Number.POSITIVE_INFINITY, color: "#d9e2f3" }
    ];
    const markAreaData = ratingBands
      .map((band) => ({
        lower: Math.max(axisMin, band.min === Number.NEGATIVE_INFINITY ? axisMin : band.min),
        upper: Math.min(axisMax, band.max === Number.POSITIVE_INFINITY ? axisMax : band.max),
        color: band.color
      }))
      .filter((band) => band.upper > band.lower)
      .map((band) => [
        { yAxis: band.lower, itemStyle: { color: band.color, opacity: 0.42 } },
        { yAxis: band.upper }
      ]);

    const startValue = showAllGames
      ? (timelineInfo.useTimeScale ? timelineInfo.earliest : 0)
      : (timelineInfo.useTimeScale ? timelineInfo.startTime : timelineInfo.startIndex);
    const endValue = timelineInfo.useTimeScale ? timelineInfo.latest : entries.length - 1;
    const deltaForIndex = (index) => {
      const entry = entries[index];
      const prior = index > 0 ? entries[index - 1] : null;
      return entry?.ratingDelta ?? (entry && prior ? entry.rating - prior.rating : null);
    };

    return {
      animation: false,
      grid: {
        left: 52,
        right: 24,
        top: 22,
        bottom: isZoomable ? 70 : 42,
        containLabel: true
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          snap: true,
          lineStyle: { color: "#b28a59", type: "dashed", width: 1.5 }
        },
        confine: true,
        renderMode: "html",
        className: "echarts-chart-tooltip",
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        borderColor: "#b28a59",
        borderWidth: 1,
        padding: [10, 11],
        textStyle: { color: "#2f3133", fontFamily: "Arial, Noto Sans KR, Malgun Gothic, sans-serif", fontSize: 11 },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const item = items.find((candidate) => candidate?.seriesType === "line") ?? items[0];
          const index = Number(item?.data?.entryIndex ?? item?.dataIndex);
          return Number.isInteger(index) && entries[index]
            ? chartTooltipHtml(entries[index], deltaForIndex(index))
            : "";
        }
      },
      xAxis: {
        type: timelineInfo.useTimeScale ? "time" : "category",
        boundaryGap: false,
        data: timelineInfo.useTimeScale ? undefined : entries.map((entry) => entry.date),
        axisLine: { lineStyle: { color: "#c9ced2" } },
        axisTick: { alignWithLabel: true, lineStyle: { color: "#c9ced2" } },
        axisLabel: {
          color: "#727980",
          fontSize: 10,
          hideOverlap: true,
          formatter: timelineInfo.useTimeScale ? chartDateFromAxisValue : (value) => formatShortDate(value)
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        min: axisMin,
        max: axisMax,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#727980", fontSize: 11, formatter: (value) => Number(value).toFixed(0) },
        splitLine: { lineStyle: { color: "#e1e4e7", width: 1 } }
      },
      dataZoom: isZoomable ? [
        {
          type: "inside",
          xAxisIndex: [0],
          filterMode: "none",
          startValue,
          endValue,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true,
          preventDefaultMouseMove: true
        },
        {
          type: "slider",
          xAxisIndex: [0],
          filterMode: "none",
          startValue,
          endValue,
          height: 16,
          bottom: 10,
          showDetail: false,
          showDataShadow: false,
          borderColor: "#d7dade",
          backgroundColor: "#f4f5f6",
          fillerColor: "rgba(169, 126, 75, 0.22)",
          handleStyle: { color: "#8a633c", borderColor: "#6f4c2f" },
          moveHandleStyle: { color: "#b28a59" }
        }
      ] : [],
      series: [{
        type: "line",
        name: "Rating",
        data: chartData,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 8,
        connectNulls: false,
        smooth: false,
        lineStyle: { color: "#8b623d", width: 2.5 },
        itemStyle: { color: "#ffffff", borderColor: "#6f4c2f", borderWidth: 1.8 },
        emphasis: { focus: "series", scale: true, itemStyle: { color: "#fff0ad", borderColor: "#a77a25", borderWidth: 2.5 } },
        markArea: {
          silent: true,
          label: { show: false },
          data: markAreaData
        },
        markLine: maximumEntry ? {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { color: "#a77a25", type: "dashed", width: 1.5 },
          label: {
            show: true,
            position: "insideEndTop",
            color: "#765619",
            fontSize: 10,
            fontWeight: "bold",
            backgroundColor: "rgba(255, 255, 255, 0.84)",
            padding: [2, 4],
            formatter: maximumEntryLabel(maximumEntry)
          },
          data: [{ yAxis: maximumRating }]
        } : undefined
      }]
    };
  }, [axisMax, axisMin, entries, isZoomable, maximumRating, selectedIndex, showAllGames, timelineInfo]);

  useEffect(() => {
    const element = chartRef.current;
    if (!element || !entries.length) return undefined;

    let disposed = false;
    let chart = null;
    let cleanupChart = () => {};

    import("./echarts.js")
      .then(({ default: echarts }) => {
        if (disposed) return;

        // ECharts 6.1.0 has a Canvas dirty-rect repaint regression when an
        // axis tooltip pointer moves over a line chart. Keep the axis pointer
        // and disable only the faulty partial-repaint optimization so hover
        // cannot leave white artifacts over the graph.
        chart = echarts.init(element, null, { renderer: "canvas", useDirtyRect: false });
        chartInstanceRef.current = chart;
        chart.setOption(chartOptionRef.current, true);

        const getIndex = (params) => {
          if (params?.componentType !== "series") return null;
          const index = Number(params.data?.entryIndex ?? params.dataIndex);
          const currentEntries = entriesRef.current;
          return Number.isInteger(index) && index >= 0 && index < currentEntries.length ? index : null;
        };
        const handleMouseOver = (params) => {
          const index = getIndex(params);
          if (index !== null) setHoveredIndex(index);
        };
        const handleMouseOut = (params) => {
          if (params?.componentType === "series") setHoveredIndex(null);
        };
        const handleClick = (params) => {
          const index = getIndex(params);
          if (index !== null) setSelectedIndex(index);
        };
        const handleGlobalOut = () => setHoveredIndex(null);

        chart.on("mouseover", handleMouseOver);
        chart.on("mouseout", handleMouseOut);
        chart.on("click", handleClick);
        chart.on("globalout", handleGlobalOut);

        const resize = () => chart.resize();
        let observer = null;
        if (typeof ResizeObserver === "function") {
          observer = new ResizeObserver(resize);
          observer.observe(element);
        } else {
          window.addEventListener("resize", resize);
        }

        cleanupChart = () => {
          observer?.disconnect();
          if (!observer) window.removeEventListener("resize", resize);
          chart.off("mouseover", handleMouseOver);
          chart.off("mouseout", handleMouseOut);
          chart.off("click", handleClick);
          chart.off("globalout", handleGlobalOut);
          chart.dispose();
          if (chartInstanceRef.current === chart) chartInstanceRef.current = null;
        };
      })
      .catch((error) => {
        if (!disposed) console.error("Failed to load the rating chart.", error);
      });

    return () => {
      disposed = true;
      cleanupChart();
    };
  }, [entries.length, viewMode]);

  useEffect(() => {
    chartOptionRef.current = chartOption;
    const chart = chartInstanceRef.current;
    if (chart) chart.setOption(chartOption, true);
  }, [chartOption]);

  return (
    <div className="chart-shell">
      <div className="chart-toolbar">
        <div className="chart-mode-control" role="group" aria-label="Rating 표시 단위">
          {CHART_MODES.map(([mode, label]) => (
            <button className={viewMode === mode ? "is-active" : ""} key={mode} type="button" onClick={() => setViewMode(mode)}>{label}</button>
          ))}
        </div>
        {isZoomable ? (
          <div className="chart-zoom-control" role="group" aria-label="경기별 그래프 X축 확대">
            <span className="chart-toolbar-label">X축 확대</span>
            <button className={!showAllGames ? "is-active" : ""} type="button" onClick={() => setShowAllGames(false)}>최근 1개월</button>
            <button className={showAllGames ? "is-active" : ""} type="button" onClick={() => setShowAllGames(true)}>전체</button>
          </div>
        ) : <span className="chart-zoom-note">X축 확대와 이동은 경기별 보기에서만 사용</span>}
      </div>
      {entries.length ? (
        <div className="chart-scroller">
          <div className="chart-stage">
            <div
              className="rating-chart"
              ref={chartRef}
              role="img"
              aria-label={`${CHART_MODES.find(([mode]) => mode === viewMode)?.[1] ?? "경기별"} Rating 변화 그래프`}
            />
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

function performanceColumns(player) {
  return isPitcherPlayer(player)
    ? [
        ["이닝", "innings"],
        ["피안타", "hitsAllowed"],
        ["피홈런", "homeRunsAllowed"],
        ["볼넷", "walks"],
        ["삼진", "strikeouts"]
      ]
    : [
        ["타석", "plateAppearances"],
        ["타수", "atBats"],
        ["안타", "hits"],
        ["홈런", "homeRuns"],
        ["볼넷", "walks"],
        ["삼진", "strikeouts"]
      ];
}

function formatPerformanceValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  const number = toNumber(value);
  return number === null ? "—" : Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function GameContextCell({ entry, player, includeVenue = true }) {
  if (!entry?.gameId && !entry?.opponent) return <span>—</span>;
  const context = gameContextText(entry, player);
  return (
    <span className="game-context">
      <strong>vs. {context.opponent}</strong>
      <span>{context.homeAway || "홈·원정 미상"}{includeVenue && entry.venue ? ` · ${entry.venue}` : ""}</span>
    </span>
  );
}

function RatingHistory({ ratings, player }) {
  const gameEntries = useMemo(() => buildGameEntries(ratings, sortAppearances(player), player), [ratings, player]);
  const rows = gameEntries.length
    ? gameEntries.slice().reverse()
    : ratings.map((snapshot, index) => ({
      key: `snapshot-${snapshot.date}-${index}`,
      date: snapshot.date,
      gameId: null,
      rating: snapshot.rating,
      ratingDelta: toNumber(snapshot.ratingDelta) ?? (index > 0 ? snapshot.rating - ratings[index - 1].rating : null),
      summary: "경기별 원자료 없음",
      modelVersion: snapshot.modelVersion,
      performance: null
    })).reverse();
  const rowRatings = rows.map((row) => toNumber(row.rating)).filter((value) => value !== null);
  const maximumRating = rowRatings.length ? Math.max(...rowRatings) : null;
  const columns = performanceColumns(player);
  const isPitcher = isPitcherPlayer(player);
  return (
    <section className="detail-card" aria-labelledby="rating-history-title">
      <div className="detail-card-header"><h3 id="rating-history-title">경기별 Rating</h3><span>더블헤더는 gameId 기준으로 별도 집계됩니다</span></div>
      <RatingChart ratings={ratings} player={player} />
      <div className="data-table-scroller">
        <table className="detail-table">
          <thead>
            <tr>
              <th scope="col" rowSpan="2">날짜</th>
              <th scope="col" rowSpan="2">경기</th>
              <th scope="col" rowSpan="2">Rating</th>
              <th scope="col" rowSpan="2">변화</th>
              <th scope="col" colSpan={columns.length}>{isPitcher ? "투구 성적" : "타격 성적"}</th>
            </tr>
            <tr>{columns.map(([label]) => <th scope="col" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMaximum = isSameRating(row.rating, maximumRating);
              return (
                <tr className={isMaximum ? "rating-history-max-row" : ""} key={row.key}>
                  <td>{formatDate(row.date)}</td>
                  <td><GameContextCell entry={row} player={player} /></td>
                  <td className={`${ratingBand(row.rating)}${isMaximum ? " rating-history-max-rating" : ""}`}>{formatRating(row.rating)}</td>
                  <td><Delta value={row.ratingDelta} /></td>
                  {columns.map(([, key]) => <td key={key}>{formatPerformanceValue(row.performance?.[key])}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function latestSnapshot(snapshots) {
  return [...(snapshots ?? [])].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? ""))).at(-1) ?? null;
}

function snapshotValue(snapshot, key) {
  const keys = Array.isArray(key) ? key : [key];
  for (const candidate of keys) {
    if (snapshot?.[candidate] !== null && snapshot?.[candidate] !== undefined && snapshot?.[candidate] !== "") return snapshot[candidate];
  }
  return null;
}

function EmptyStatsCard({ title, id, note }) {
  return (
    <section className="detail-card" aria-labelledby={id}>
      <div className="detail-card-header"><h3 id={id}>{title}</h3><span>기록 없음</span></div>
      <p className="record-empty">{note}</p>
    </section>
  );
}

function BattingStats({ player }) {
  const snapshots = player.battingStatSnapshots ?? [];
  const latest = latestSnapshot(snapshots);
  if (!snapshots.length) return <EmptyStatsCard title="타격 기록" id="batting-stats-title" note="연결된 타격 통계 스냅샷이 아직 없습니다." />;
  const definitions = [
    ["타석", "plateAppearances"], ["타수", "atBats"], ["안타", "hits"], ["타율", "battingAverage"],
    ["출루율", "onBasePercentage"], ["장타율", "sluggingPercentage"], ["OPS", "ops"], ["타점", "rbi"],
    ["득점", "runs"], ["홈런", "homeRuns"], ["볼넷", "walks"], ["사구", "hitByPitch"], ["도루", "stolenBases"], ["삼진", "strikeouts"]
  ];
  return (
    <section className="detail-card" aria-labelledby="batting-stats-title">
      <div className="detail-card-header"><h3 id="batting-stats-title">타격 기록</h3><span>{latest ? `${formatDate(latest.date)} 기준` : "기록 없음"}</span></div>
      <div className="stat-grid">
        {definitions.map(([label, key]) => <div className="stat-item" key={key}><span className="stat-item-label">{label}</span><strong className="stat-item-value">{formatStatValue(key, snapshotValue(latest, key))}</strong></div>)}
      </div>
    </section>
  );
}

function PitchingStats({ player }) {
  const snapshots = player.pitchingStatSnapshots ?? [];
  const latest = latestSnapshot(snapshots);
  if (!snapshots.length) return <EmptyStatsCard title="투구 기록" id="pitching-stats-title" note="연결된 투구 통계 스냅샷이 아직 없습니다." />;
  const definitions = [
    ["경기", ["games", "g"]], ["타자 상대", ["battersFaced", "bf"]], ["이닝", ["innings", "ipText", "ip"]],
    ["피안타", ["hitsAllowed", "hits", "h"]], ["피홈런", ["homeRunsAllowed", "hr"]], ["볼넷·사구", ["walksHitByPitch", "bbHbp", "bb_hbp", "walks"]],
    ["삼진", ["strikeouts", "so"]], ["실점", ["runs", "r"]], ["자책점", ["earnedRuns", "er"]]
  ];
  return (
    <section className="detail-card" aria-labelledby="pitching-stats-title">
      <div className="detail-card-header"><h3 id="pitching-stats-title">투구 기록</h3><span>{latest ? `${formatDate(latest.date)} 기준` : "기록 없음"}</span></div>
      <div className="stat-grid">
        {definitions.map(([label, key]) => <div className="stat-item" key={label}><span className="stat-item-label">{label}</span><strong className="stat-item-value">{formatStatValue(key, snapshotValue(latest, key))}</strong></div>)}
      </div>
    </section>
  );
}

function PlateAppearances({ player }) {
  const appearances = [...(player.plateAppearances ?? [])].sort((a, b) => {
    const dateOrder = String(b.date ?? "").localeCompare(String(a.date ?? ""));
    return dateOrder || ((toNumber(a.plateAppearanceNumber) ?? 0) - (toNumber(b.plateAppearanceNumber) ?? 0));
  });
  const appearanceRatings = appearances.map((appearance) => toNumber(appearance.ratingAfter) ?? toNumber(appearance.ratingBefore)).filter((value) => value !== null);
  const maximumRating = appearanceRatings.length ? Math.max(...appearanceRatings) : null;
  const title = isPitcherPlayer(player) ? "상대 타석 기록" : "타석 기록";
  return (
    <section className="detail-card" aria-labelledby="plate-appearances-title">
      <div className="detail-card-header"><h3 id="plate-appearances-title">{title}</h3><span>DB에 저장된 타석 단위 원자료</span></div>
      <div className="data-table-scroller">
        <table className="detail-table">
          <thead><tr><th scope="col">날짜</th><th scope="col">경기</th><th scope="col">타순</th><th scope="col">타석 번호</th><th scope="col">결과</th><th scope="col">Rating 전후</th><th scope="col">변화</th></tr></thead>
          <tbody>
            {appearances.length ? appearances.map((appearance) => {
              const before = toNumber(appearance.ratingBefore);
              const after = toNumber(appearance.ratingAfter);
              const ratingValue = after ?? before;
              const isMaximum = isSameRating(ratingValue, maximumRating);
              const effect = appearance.ratingEffect?.ratingDelta ?? appearance.ratingDelta ?? (before !== null && after !== null ? after - before : null);
              return (
                <tr className={isMaximum ? "rating-history-max-row" : ""} key={appearance.paId}>
                  <td>{formatDate(appearance.date)}</td>
                  <td><GameContextCell entry={appearance} player={player} includeVenue /></td>
                  <td>{appearance.battingOrder || "—"}번</td>
                  <td>{appearance.plateAppearanceNumber || "—"}</td>
                  <td>{appearance.result || "—"}</td>
                  <td className={isMaximum ? "rating-history-max-rating" : ""}>{before !== null && after !== null ? `${formatRating(before)} → ${formatRating(after)}` : "—"}</td>
                  <td><Delta value={effect} /></td>
                </tr>
              );
            }) : <tr><td colSpan="7">표시할 타석 기록이 없습니다.</td></tr>}
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
        {error ? <LoadError>data/player_detail.json 파일과 데이터 접근 경로를 확인해 주세요.</LoadError> : player ? (
          <>
            <PlayerProfile player={player} ratings={ratings} />
            <RatingHistory ratings={ratings} player={player} />
            {isPitcherPlayer(player) ? <PitchingStats player={player} /> : <BattingStats player={player} />}
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
  if (window.location.pathname.endsWith("/player.html")) return <PlayerPage />;
  if (window.location.pathname.endsWith("/diff.html")) return <DiffPage />;
  return <HomePage />;
}

createRoot(document.getElementById("root")).render(<App />);
