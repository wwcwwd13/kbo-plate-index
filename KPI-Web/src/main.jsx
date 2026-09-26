import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { fetchOtherStats, fetchPlayerDetail, fetchRatingDiff, fetchRatingDiffDates, fetchTeamRatings } from "./data";
import { buildLineupPools, buildOtherStats, lineupWeightedRating, moveLineupBatter, rankTeamsByMetric } from "./otherStats";
import aboutContent from "./content/about.json";
import releaseNotes from "./content/release_notes.json";
import "../styles.css";

const DEFAULT_PLAYER_ID = "player:demo:noname:batter";

function isPagePath(pageName) {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  return pathname.endsWith(`/${pageName}`)
    || pathname.endsWith(`/${pageName}.html`)
    || pathname.endsWith(`/${pageName}/index.html`);
}

function siteRelativePrefix() {
  return /\/(?:player|diff|other|about|release-note)\/(?:index\.html)?$/.test(window.location.pathname) ? "../" : "./";
}

function homeHref() {
  return siteRelativePrefix();
}

function pageHref(pageName, query = "") {
  const suffix = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  return `${siteRelativePrefix()}${pageName}/${suffix}`;
}

function playerPageHref(player) {
  if (!player?.playerId) return null;
  return pageHref("player", `player_id=${encodeURIComponent(player.playerId)}`);
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

function normalizePlateAppearanceResult(value) {
  const result = String(value ?? "").trim();
  if (result === "\ubcfc\ub128" || result === "\ubcfc\ub12c") return "\ubcfc\ub137";
  return result;
}

function sectionDisplayName(league) {
  if (["말소", "소속 말소", "released"].includes(league)) return "소속 말소";
  if (league === "잔류군" || league === "residual") return "잔류군";
  return league === "1군" || league === "major" ? "KBO 리그" : "퓨쳐스리그";
}

function useHorizontalDragScroll() {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback((event) => {
    dragRef.current = null;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea, [role='button']")) return;
    const container = event.currentTarget;
    if (container.scrollWidth <= container.clientWidth) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: container.scrollLeft,
      axis: null
    };
  }, []);

  const handlePointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.hypot(deltaX, deltaY) < 6) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        dragRef.current = null;
        return;
      }
      drag.axis = "x";
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setIsDragging(true);
    }

    if (drag.axis !== "x") return;
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX;
  }, []);

  const finishPointerDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  return {
    containerRef,
    isDragging,
    handlePointerDown,
    handlePointerMove,
    finishPointerDrag
  };
}

function MatrixScroller({ children, className = "" }) {
  const dragScroll = useHorizontalDragScroll();
  const classes = ["matrix-scroller", className, dragScroll.isDragging ? "is-dragging" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={dragScroll.containerRef}
      className={classes}
      onPointerDown={dragScroll.handlePointerDown}
      onPointerMove={dragScroll.handlePointerMove}
      onPointerUp={dragScroll.finishPointerDrag}
      onPointerCancel={dragScroll.finishPointerDrag}
    >
      {children}
    </div>
  );
}

function gameLeagueLabel(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1군", "major", "kbo", "kbo 리그"].includes(normalized)) return "1군";
  if (["2군", "minor", "futures", "퓨처스리그", "퓨쳐스리그"].includes(normalized)) return "2군";
  return String(value ?? "").trim() || "—";
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
  if (["sm", "상무", "상무 피닉스"].includes(normalized)) return "상무";
  if (["ul", "울산"].includes(normalized)) return "울산";
  if (["so", "소프트"].includes(normalized)) return "소프트";
  if (["fn", "북부"].includes(normalized)) return "북부";
  if (["fs", "남부"].includes(normalized)) return "남부";
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
  if (["말소", "released", "release"].includes(normalized)) return "말소";
  return String(value ?? "").trim() || "—";
}

function profileHandednessLabel(profile) {
  const raw = String(profile?.batsThrowsRaw ?? "").trim();
  if (raw) return raw;

  const formatHand = (value, suffix) => {
    const text = String(value ?? "").trim();
    if (!text) return null;
    return /[투타]$/.test(text) ? text : `${text}${suffix}`;
  };
  return [formatHand(profile?.throws, "투"), formatHand(profile?.bats, "타")]
    .filter(Boolean)
    .join("") || null;
}

function profileMeasurement(value, unit) {
  const number = toNumber(value);
  if (number === null) return null;
  const formatted = Number.isInteger(number) ? String(number) : number.toFixed(1);
  return `${formatted}${unit}`;
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

function isAsianGamesAssignment(player) {
  const reason = String(player?.rosterStatusReason ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return ["아시안게임출전", "asian_games_assignment"].includes(reason);
}

function medicalTooltipPosition(element) {
  const rect = element.getBoundingClientRect();
  const margin = 12;
  const gap = 8;
  const width = Math.min(260, Math.max(190, window.innerWidth - margin * 2));
  const left = Math.min(
    Math.max(rect.left, margin),
    Math.max(margin, window.innerWidth - width - margin)
  );
  const estimatedHeight = 78;
  const below = rect.bottom + gap;
  const top = below + estimatedHeight <= window.innerHeight - margin
    ? below
    : Math.max(margin, rect.top - estimatedHeight - gap);
  return { left, top };
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

function PageHeader() {
  const isDiffPage = isPagePath("diff");
  const isOtherPage = isPagePath("other");
  const isAboutPage = isPagePath("about") || isPagePath("release-note");
  return (
    <header className="page-header">
      <div className="header-main">
        <a className="brand-link" href={homeHref()} aria-label="오늘의 폼 메인 페이지">
          <svg className="brand-mark" viewBox="0 0 32 36" aria-hidden="true" focusable="false">
            <path d="M16 1 31 16 16 35 1 16Z" fill="#65452b" />
            <path d="M8 21v-5m8 10V12m8 9V8" stroke="#fffdf8" strokeWidth="2.4" />
            <path d="m7 16 9-5 8-3" fill="none" stroke="#d0b388" strokeWidth="1.5" />
          </svg>
          <h1>오늘의 폼</h1>
        </a>
        <nav className="top-nav" aria-label="주요 메뉴">
          <a className={isDiffPage ? "is-active" : ""} href={pageHref("diff")}>폼 변동</a>
          <a className={isOtherPage ? "is-active" : ""} href={pageHref("other")}>기타</a>
          <a className={isAboutPage ? "is-active" : ""} href={pageHref("about")}>About</a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({ status }) {
  return (
    <footer className="site-footer">
      <p>
        {status ? <><span className="site-footer-status">{status}</span> · </> : null}
        오늘의 폼은 개인이 취미로 만들고 있는 비공식·비영리 프로젝트입니다. · 선수·구단·리그 및 관련 자료에 대한 권리는 각 원권리자에게 있습니다. · 표시 정보는 공개 자료를 바탕으로 정리한 참고용 데이터입니다.
      </p>
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

function EmptyDataState({ title = "구단 데이터가 없습니다.", children }) {
  return (
    <div className="empty-data-state" role="status">
      <strong>{title}</strong>
      {children ? <span>{children}</span> : null}
    </div>
  );
}

function PlayerLink({ player }) {
  const medicalTooltipRef = useRef(null);
  const [medicalTooltipVisible, setMedicalTooltipVisible] = useState(false);
  const [medicalTooltipCoordinates, setMedicalTooltipCoordinates] = useState(null);
  const medicalText = medicalStatusText(player);
  const asianGamesText = isAsianGamesAssignment(player) ? "아시안 게임 출전" : null;
  const statusTooltipText = [medicalText, asianGamesText].filter(Boolean).join(" · ");

  const updateMedicalTooltipPosition = useCallback(() => {
    if (!medicalTooltipRef.current) return;
    setMedicalTooltipCoordinates(medicalTooltipPosition(medicalTooltipRef.current));
  }, []);

  useEffect(() => {
    if (!medicalTooltipVisible) return undefined;
    updateMedicalTooltipPosition();
    window.addEventListener("resize", updateMedicalTooltipPosition);
    window.addEventListener("scroll", updateMedicalTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateMedicalTooltipPosition);
      window.removeEventListener("scroll", updateMedicalTooltipPosition, true);
    };
  }, [medicalTooltipVisible, updateMedicalTooltipPosition]);

  useEffect(() => {
    if (statusTooltipText) return;
    setMedicalTooltipVisible(false);
    setMedicalTooltipCoordinates(null);
  }, [statusTooltipText]);

  const showMedicalTooltip = () => {
    if (!statusTooltipText) return;
    updateMedicalTooltipPosition();
    setMedicalTooltipVisible(true);
  };

  const hideMedicalTooltip = (event) => {
    if (event?.type === "blur" && event.currentTarget.contains(event.relatedTarget)) return;
    setMedicalTooltipVisible(false);
  };

  if (!player) return <td className="name-cell empty-cell" aria-label="선수 없음" />;
  const grayClass = player.gray ? " is-gray" : "";
  const medicalClass = medicalText ? " is-medical" : "";
  const href = playerPageHref(player);
  return (
    <td className={`name-cell${grayClass}${medicalClass}`}>
      <span
        ref={statusTooltipText ? medicalTooltipRef : null}
        className="player-name-content"
        onMouseEnter={statusTooltipText ? showMedicalTooltip : undefined}
        onMouseLeave={statusTooltipText ? hideMedicalTooltip : undefined}
        onFocus={statusTooltipText ? showMedicalTooltip : undefined}
        onBlur={statusTooltipText ? hideMedicalTooltip : undefined}
      >
        {href ? (
          <a className="player-link" href={href}>{player.name}</a>
        ) : (
          <span className="player-link player-link--unresolved">{player.name}</span>
        )}
        {medicalText ? <span className="medical-status-mark" aria-label={medicalText}>+</span> : null}
        {asianGamesText ? <span className="asian-games-status-mark" aria-label={asianGamesText}>✵</span> : null}
      </span>
      {medicalTooltipVisible && medicalTooltipCoordinates && statusTooltipText ? createPortal(
        <div
          className="medical-hover-card"
          role="tooltip"
          style={{ left: `${medicalTooltipCoordinates.left}px`, top: `${medicalTooltipCoordinates.top}px` }}
        >
          {asianGamesText ? <strong>{asianGamesText}</strong> : null}
          {medicalText ? <strong>{MEDICAL_STATUS_LABELS[player.medicalStatus] ?? "부상·재활 명단"}</strong> : null}
          {player.medicalEventDate ? <span>기준일 {formatDate(player.medicalEventDate)}</span> : null}
          {player.medicalNote ? <span>{player.medicalNote}</span> : null}
        </div>,
        document.body
      ) : null}
    </td>
  );
}

function PlayerRating({ player }) {
  if (!player) return <td className="rating-cell empty-cell" aria-label="폼 없음" />;
  const href = playerPageHref(player);
  return (
    <td className={`rating-cell ${ratingBand(player.rating)}`}>
      {href ? <a className="player-link rating-link" href={href}>{formatRating(player.rating)}</a> : formatRating(player.rating)}
    </td>
  );
}

function AverageRow({ teams, activeTeamKeys = null, paletteClass }) {
  if (!teams.length || teams[0].league !== "1군") return null;
  const batterValues = teams.map((team) => team.averages?.batter);
  const pitcherValues = teams.map((team) => team.averages?.pitcher);
  const lastActiveIndex = activeTeamKeys
    ? teams.reduce((lastIndex, team, index) => activeTeamKeys.has(ratingTeamKey(team.team)) ? index : lastIndex, -1)
    : teams.length - 1;
  const visibleTeams = teams.slice(0, lastActiveIndex + 1);
  const trailingEmptySpan = (teams.length - lastActiveIndex - 1) * 4;

  return (
    <tr className={`average-row ${paletteClass}`}>
      {visibleTeams.map((team, index) => {
        if (activeTeamKeys && !activeTeamKeys.has(ratingTeamKey(team.team))) {
          return <td className="empty-group-cell" colSpan="4" aria-hidden="true" key={`${team.team}-average-empty`} />;
        }
        const batterClass = averageBand(team.averages?.batter, batterValues);
        const pitcherClass = averageBand(team.averages?.pitcher, pitcherValues);
        return (
          <Fragment key={`${team.team}-average`}>
            <td className="average-label">9명 평균</td>
            <td className={`average-value ${batterClass}`}>{formatRating(team.averages?.batter)}</td>
            <td className="average-label">9명 평균</td>
            <td className={`average-value ${pitcherClass}`}>{formatRating(team.averages?.pitcher)}</td>
          </Fragment>
        );
      })}
      {trailingEmptySpan > 0 ? <td className="empty-group-cell trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
    </tr>
  );
}

function EstimatedStrengthRow({ teams, activeTeamKeys = null, paletteClass }) {
  if (!teams.length || teams[0].league !== "1군") return null;
  const lastActiveIndex = activeTeamKeys
    ? teams.reduce((lastIndex, team, index) => activeTeamKeys.has(ratingTeamKey(team.team)) ? index : lastIndex, -1)
    : teams.length - 1;
  const visibleTeams = teams.slice(0, lastActiveIndex + 1);
  const trailingEmptySpan = (teams.length - lastActiveIndex - 1) * 4;

  return (
    <tr className={`strength-row ${paletteClass}`}>
      {visibleTeams.map((team) => {
        if (activeTeamKeys && !activeTeamKeys.has(ratingTeamKey(team.team))) {
          return <td className="empty-group-cell" colSpan="4" aria-hidden="true" key={`${team.team}-strength-empty`} />;
        }
        const rank = team.estimatedStrengthRank;
        return (
          <td className="team-strength-cell" colSpan="4" key={`${team.team}-strength`}>
            팀 전력: {rank ? `${rank}등` : "—"} ({formatRating(team.averages?.average18)})
          </td>
        );
      })}
      {trailingEmptySpan > 0 ? <td className="empty-group-cell trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
    </tr>
  );
}

function ratingTeamKey(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["고양", "고양 히어로즈", "goyang", "goyang heroes"].includes(normalized)) return "키움";
  return canonicalTeamLabel(value);
}

function sortedRatingTeams(teams) {
  return [...(teams ?? [])].sort((a, b) => {
    const orderDifference = teamOrderIndex(ratingTeamKey(a.team)) - teamOrderIndex(ratingTeamKey(b.team));
    return orderDifference || String(a.team ?? "").localeCompare(String(b.team ?? ""), "ko");
  });
}

function ratingSectionThemeClass(league) {
  const label = sectionDisplayName(league);
  if (label === "\u004b\u0042\u004f \ub9ac\uadf8") return "palette-brand-blue";
  if (label.includes("\ub9d0\uc18c") || label === "\uc794\ub958\uad70") return "palette-brand-gray";
  return "palette-brand-brown";
}

function recordLeagueCellClassName(league) {
  const label = gameLeagueLabel(league);
  return `record-league-cell${label === "1군" ? " is-major" : label === "2군" ? " is-minor" : ""}`;
}

function ratingSectionOrder(section) {
  const order = ["KBO 리그", "퓨쳐스리그", "잔류군", "소속 말소"];
  const index = order.indexOf(sectionDisplayName(section?.league));
  return index === -1 ? order.length : index;
}

function CombinedTeamRatingTable({ sections }) {
  const orderedSections = [...(sections ?? [])].sort((a, b) => ratingSectionOrder(a) - ratingSectionOrder(b));
  const teamMap = new Map();

  orderedSections.forEach((section) => {
    sortedRatingTeams(section.teams).forEach((team) => {
      const key = ratingTeamKey(team.team);
      if (key && !teamMap.has(key)) teamMap.set(key, { key, label: team.team });
    });
  });

  const teams = [...teamMap.values()].sort((a, b) => {
    const orderDifference = teamOrderIndex(a.key) - teamOrderIndex(b.key);
    return orderDifference || String(a.label ?? "").localeCompare(String(b.label ?? ""), "ko");
  });
  const columnCount = teams.length * 4;

  if (!teams.length) return null;

  return (
    <MatrixScroller className="team-rating-matrix-scroller">
      <table className="rating-matrix" aria-label="구단별 폼">
        <colgroup>
          {teams.map((team) => (
            <Fragment key={`${team.key}-columns`}>
              <col className="name-column" />
              <col className="rating-column" />
              <col className="name-column" />
              <col className="rating-column" />
            </Fragment>
          ))}
        </colgroup>
        <tbody>
          {orderedSections.map((section) => {
            const sectionTeams = sortedRatingTeams(section.teams);
            const sectionTeamMap = new Map(sectionTeams.map((team) => [ratingTeamKey(team.team), team]));
            const rowTeams = teams.map((team) => sectionTeamMap.get(team.key) ?? {
              team: team.label,
              league: section.league,
              batters: [],
              pitchers: []
            });
            const rowCount = Math.max(1, ...rowTeams.map((team) => Math.max(team.batters?.length || 0, team.pitchers?.length || 0)));
            const sectionLabel = sectionDisplayName(section.league);
            const paletteClass = ratingSectionThemeClass(section.league);
            const lastActiveTeamIndex = teams.reduce((lastIndex, team, index) => sectionTeamMap.has(team.key) ? index : lastIndex, -1);
            const visibleTeams = teams.slice(0, lastActiveTeamIndex + 1);
            const trailingEmptySpan = (teams.length - lastActiveTeamIndex - 1) * 4;

            return (
              <Fragment key={`rating-section-${section.league}`}>
                <tr className={`rating-section-row ${paletteClass}`}>
                  <th colSpan={columnCount} scope="rowgroup">
                    <span className="rating-section-label">{sectionLabel}</span>
                  </th>
                </tr>
                <tr className={`team-row ${paletteClass}`}>
                  {visibleTeams.map((team, teamIndex) => sectionTeamMap.has(team.key)
                    ? <th key={`${section.league}-${team.key}-team`} className={teamIndex === lastActiveTeamIndex ? "active-group-boundary" : ""} colSpan="4" scope="colgroup">{team.label}</th>
                    : <th key={`${section.league}-${team.key}-team-empty`} className="empty-group-header" colSpan="4" scope="colgroup" aria-hidden="true" />)}
                  {trailingEmptySpan > 0 ? <th className="empty-group-header trailing-empty-group" colSpan={trailingEmptySpan} scope="colgroup" aria-hidden="true" /> : null}
                </tr>
                <tr className={`role-row ${paletteClass}`}>
                  {visibleTeams.map((team) => sectionTeamMap.has(team.key)
                    ? (
                      <Fragment key={`${section.league}-${team.key}-roles`}>
                        <th colSpan="2">타자</th>
                        <th colSpan="2">투수</th>
                      </Fragment>
                    )
                    : <th key={`${section.league}-${team.key}-roles-empty`} className="empty-group-header" colSpan="4" aria-hidden="true" />)}
                  {trailingEmptySpan > 0 ? <th className="empty-group-header trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
                </tr>
                <tr className={`field-row ${paletteClass}`}>
                  {visibleTeams.map((team) => sectionTeamMap.has(team.key)
                    ? (
                      <Fragment key={`${section.league}-${team.key}-fields`}>
                        <th>이름</th><th>폼</th><th>이름</th><th>폼</th>
                      </Fragment>
                    )
                    : <th key={`${section.league}-${team.key}-fields-empty`} className="empty-group-header" colSpan="4" aria-hidden="true" />)}
                  {trailingEmptySpan > 0 ? <th className="empty-group-header trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
                </tr>
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                  <tr key={`${section.league}-row-${rowIndex}`} className={paletteClass}>
                    {rowTeams.slice(0, lastActiveTeamIndex + 1).map((team, teamIndex) => {
                      const isActiveTeam = sectionTeamMap.has(teams[teamIndex].key);
                      if (!isActiveTeam) {
                        return <td className="empty-group-cell" colSpan="4" aria-hidden="true" key={`${section.league}-${teams[teamIndex].key}-${rowIndex}-empty`} />;
                      }
                      const batter = team.batters?.[rowIndex] ?? null;
                      const pitcher = team.pitchers?.[rowIndex] ?? null;
                      return (
                        <Fragment key={`${section.league}-${team.team}-${rowIndex}`}>
                          <PlayerLink player={batter} />
                          <PlayerRating player={batter} />
                          <PlayerLink player={pitcher} />
                          <PlayerRating player={pitcher} />
                        </Fragment>
                      );
                    })}
                    {trailingEmptySpan > 0 ? <td className="empty-group-cell trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
                  </tr>
                ))}
                <AverageRow teams={rowTeams} activeTeamKeys={sectionTeamMap} paletteClass={paletteClass} />
                <EstimatedStrengthRow teams={rowTeams} activeTeamKeys={sectionTeamMap} paletteClass={paletteClass} />
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </MatrixScroller>
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
  return `${number > 0 ? "+" : "-"}${Math.abs(number).toFixed(1)}`;
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
  const plateAppearances = (Array.isArray(player.plateAppearances) ? player.plateAppearances : []).map((appearance) => ({
    ...appearance,
    result: normalizePlateAppearanceResult(appearance.result)
  }));
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
        <td className="diff-rating-cell empty-cell" aria-label="폼 없음" />
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
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {href ? <a className="player-link" href={href}>{player.name}</a> : <span className="player-link player-link--unresolved">{player.name}</span>}
      </td>
      <td className={`diff-rating-cell ${ratingBand(player.rating)}`}>
        {href ? <a className="player-link diff-rating-value" href={href}>{formatRating(player.rating)}</a> : <span className="diff-rating-value">{formatRating(player.rating)}</span>}
        <span className={`diff-delta ${diffDeltaClass(player.ratingDelta)}`}>{formatDiffDelta(player.ratingDelta)}</span>
      </td>
      {tooltipVisible && tooltipPosition ? <DiffHoverCard player={player} role={role} position={tooltipPosition} /> : null}
    </>
  );
}

function CombinedDiffRatingTable({ sections }) {
  const orderedSections = [...(sections ?? [])].sort((a, b) => ratingSectionOrder(a) - ratingSectionOrder(b));
  const teamMap = new Map();

  orderedSections.forEach((section) => {
    sortedRatingTeams(section.teams).forEach((team) => {
      const key = ratingTeamKey(team.team);
      if (key && !teamMap.has(key)) teamMap.set(key, { key, label: team.team });
    });
  });

  const teams = [...teamMap.values()].sort((a, b) => {
    const orderDifference = teamOrderIndex(a.key) - teamOrderIndex(b.key);
    return orderDifference || String(a.label ?? "").localeCompare(String(b.label ?? ""), "ko");
  });
  const columnCount = teams.length * 4;

  if (!teams.length) return null;

  return (
    <MatrixScroller className="team-rating-matrix-scroller">
        <table className="rating-matrix diff-matrix" aria-label="경기일별 KPI 변동">
          <colgroup>
            {teams.map((team) => (
              <Fragment key={`${team.key}-diff-columns`}>
                <col className="name-column diff-name-column" />
                <col className="rating-column" />
                <col className="name-column diff-name-column" />
                <col className="rating-column" />
              </Fragment>
            ))}
          </colgroup>
          <tbody>
            {orderedSections.map((section) => {
              const sectionTeams = sortedRatingTeams(section.teams);
              const sectionTeamMap = new Map(sectionTeams.map((team) => [ratingTeamKey(team.team), team]));
              const rowTeams = teams.map((team) => sectionTeamMap.get(team.key) ?? { batters: [], pitchers: [] });
              const rowCount = Math.max(1, ...rowTeams.map((team) => Math.max(team.batters?.length || 0, team.pitchers?.length || 0)));
              const paletteClass = ratingSectionThemeClass(section.league);
              const lastActiveTeamIndex = teams.reduce((lastIndex, team, index) => sectionTeamMap.has(team.key) ? index : lastIndex, -1);
              const visibleTeams = teams.slice(0, lastActiveTeamIndex + 1);
              const trailingEmptySpan = (teams.length - lastActiveTeamIndex - 1) * 4;

              return (
                <Fragment key={`diff-section-${section.league}`}>
                  <tr className={`rating-section-row ${paletteClass}`}>
                    <th colSpan={columnCount} scope="rowgroup">
                      <span className="rating-section-label">{sectionDisplayName(section.league)}</span>
                    </th>
                  </tr>
                  <tr className={`team-row ${paletteClass}`}>
                    {visibleTeams.map((team, teamIndex) => sectionTeamMap.has(team.key)
                      ? <th key={`${section.league}-${team.key}-team`} className={teamIndex === lastActiveTeamIndex ? "active-group-boundary" : ""} colSpan="4" scope="colgroup">{team.label}</th>
                      : <th key={`${section.league}-${team.key}-team-empty`} className="empty-group-header" colSpan="4" scope="colgroup" aria-hidden="true" />)}
                    {trailingEmptySpan > 0 ? <th className="empty-group-header trailing-empty-group" colSpan={trailingEmptySpan} scope="colgroup" aria-hidden="true" /> : null}
                  </tr>
                  <tr className={`role-row ${paletteClass}`}>
                    {visibleTeams.map((team) => sectionTeamMap.has(team.key)
                      ? <Fragment key={`${section.league}-${team.key}-roles`}><th colSpan="2">타자</th><th colSpan="2">투수</th></Fragment>
                      : <th key={`${section.league}-${team.key}-roles-empty`} className="empty-group-header" colSpan="4" aria-hidden="true" />)}
                    {trailingEmptySpan > 0 ? <th className="empty-group-header trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
                  </tr>
                  <tr className={`field-row ${paletteClass}`}>
                    {visibleTeams.map((team) => sectionTeamMap.has(team.key)
                      ? <Fragment key={`${section.league}-${team.key}-fields`}><th>이름</th><th>폼</th><th>이름</th><th>폼</th></Fragment>
                      : <th key={`${section.league}-${team.key}-fields-empty`} className="empty-group-header" colSpan="4" aria-hidden="true" />)}
                    {trailingEmptySpan > 0 ? <th className="empty-group-header trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
                  </tr>
                  {Array.from({ length: rowCount }, (_, rowIndex) => (
                    <tr key={`${section.league}-diff-row-${rowIndex}`} className={paletteClass}>
                      {rowTeams.slice(0, lastActiveTeamIndex + 1).map((team, teamIndex) => sectionTeamMap.has(teams[teamIndex].key)
                        ? <Fragment key={`${section.league}-${teams[teamIndex].key}-${rowIndex}`}><DiffPlayerCells player={team.batters?.[rowIndex] ?? null} role="batter" /><DiffPlayerCells player={team.pitchers?.[rowIndex] ?? null} role="pitcher" /></Fragment>
                        : <td key={`${section.league}-${teams[teamIndex].key}-${rowIndex}-empty`} className="empty-group-cell" colSpan="4" aria-hidden="true" />)}
                      {trailingEmptySpan > 0 ? <td className="empty-group-cell trailing-empty-group" colSpan={trailingEmptySpan} aria-hidden="true" /> : null}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
    </MatrixScroller>
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
  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-content">
        <section className="sheet-card" aria-labelledby="diff-title">
          <div className="diff-toolbar">
            <h2 id="diff-title">오늘의 폼 변동</h2>
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
          <div className="rating-sections" aria-busy={!data && !error}>
            {error ? <LoadError>변동표 API와 데이터베이스 연결을 확인해 주세요.</LoadError> : data ? sections.length ? <CombinedDiffRatingTable sections={sections} /> : <EmptyDataState title="해당 날짜 출전 기록이 없습니다." /> : <LoadingState>경기일별 KPI 변동을 불러오는 중입니다.</LoadingState>}
          </div>
          {!error && sections.length > 0 ? (
            <div className="legend team-rating-legend diff-legend" aria-label="변동표 안내">
              <span className="legend-item"><i className="legend-swatch band-high" />80 이상</span>
              <span className="legend-item"><i className="legend-swatch band-good" />65–79.9</span>
              <span className="legend-item"><i className="legend-swatch band-mid" />50–64.9</span>
              <span className="legend-item"><i className="legend-swatch band-low" />50 미만</span>
              <span className="legend-item"><span className="legend-name-sample">회색</span><span>출전수 적음</span></span>
              <span className="diff-legend-delta is-up">+ 상승</span>
              <span className="diff-legend-delta is-down">- 하락</span>
            </div>
          ) : null}
        </section>
      </main>
      <SiteFooter status={meta?.date ? `${meta.date} 기준` : "기준일 확인 중"} />
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
  const isUnavailable = Boolean(error) || Boolean(data && !sections.length);
  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-content">
        <section className="sheet-card" aria-label="구단별 폼">
          <div className="rating-sections">
            {isUnavailable ? <EmptyDataState>백엔드 API가 연결되면 이 영역에 구단별 표가 표시됩니다.</EmptyDataState> : data ? <CombinedTeamRatingTable sections={sections} /> : <LoadingState>전체 선수 데이터를 불러오는 중입니다.</LoadingState>}
          </div>
          {!isUnavailable ? (
            <div className="legend team-rating-legend" aria-label="폼 색상 기준">
              <span className="legend-item"><i className="legend-swatch band-high" />80 이상</span>
              <span className="legend-item"><i className="legend-swatch band-good" />65–79.9</span>
              <span className="legend-item"><i className="legend-swatch band-mid" />50–64.9</span>
              <span className="legend-item"><i className="legend-swatch band-low" />50 미만</span>
              <span className="legend-item"><i className="legend-status-mark">+</i>부상·재활 명단</span>
              <span className="legend-item"><span className="asian-games-legend-mark" aria-hidden="true">✵</span><span>아시안 게임 출전</span></span>
              <span className="legend-item"><span className="legend-name-sample">회색</span><span>출전수 적음</span></span>
            </div>
          ) : null}
        </section>
      </main>
      <SiteFooter status={data?.meta?.asOf ? `${data.meta.asOf} 기준` : isUnavailable ? "API 연결 필요" : "기준일 확인 중"} />
    </div>
  );
}

function AboutPage() {
  const about = aboutContent && typeof aboutContent === "object" ? aboutContent : {};
  const notes = Array.isArray(releaseNotes) ? releaseNotes : [];
  const [activeTab, setActiveTab] = useState("about");
  const sortedNotes = [...notes].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-content release-note-page-content">
        <div className="about-tabs" role="tablist" aria-label="About 하위 메뉴">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "about"}
            aria-controls="about-panel"
            className={`about-tab${activeTab === "about" ? " is-active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            About
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "release-notes"}
            aria-controls="release-notes-panel"
            className={`about-tab${activeTab === "release-notes" ? " is-active" : ""}`}
            onClick={() => setActiveTab("release-notes")}
          >
            Release Notes
          </button>
        </div>
        {activeTab === "about" ? (
        <section id="about-panel" className="sheet-card about-card" aria-labelledby="about-title">
          <div className="sheet-card-header">
            <div>
              <p className="kicker">ABOUT</p>
              <h2 id="about-title">{about.title || "오늘의 폼"}</h2>
              <p className="sheet-description">{about.summary || "사이트 소개"}</p>
            </div>
          </div>
          <div className="about-copy">
            {(Array.isArray(about.paragraphs) ? about.paragraphs : []).map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{paragraph}</p>
            ))}
          </div>
          <div className="about-rules" aria-labelledby="roster-classification-title">
            <p className="kicker">ROSTER CLASSIFICATION</p>
            <h3 id="roster-classification-title">선수군 이동 분류 규칙</h3>
            <ol>
              <li><strong>1군</strong> 공식 1군 등록 명단에 포함된 선수</li>
              <li><strong>2군</strong> 1군 명단에는 없고, 부상·재활 상태가 아니며 최근 30일 이내 경기에 출전한 선수</li>
              <li><strong>잔류군</strong> 부상·재활 중이거나 최근 경기 기록이 30일을 초과한 선수</li>
              <li><strong>소속 말소</strong> 현재 팀 소속으로 계속 뛰기 어려운 것으로 판단되는 선수</li>
              <li><strong>판정의 한계</strong> 위 규칙을 기준으로 분류하려고 노력하지만 예외가 많고 데이터가 부족해 실제 선수 소속과 다르게 보일 수 있습니다. 현재 계속 수정 중입니다.</li>
            </ol>
          </div>
        </section>
        ) : (
        <section id="release-notes-panel" className="sheet-card release-note-card" aria-labelledby="release-note-title">
          <div className="sheet-card-header">
            <div>
              <p className="kicker">RELEASE NOTE</p>
              <h2 id="release-note-title">변경 기록</h2>
              <p className="sheet-description">오늘의 폼의 주요 업데이트와 개발 기록입니다.</p>
            </div>
          </div>
          <div className="release-note-list">
            {sortedNotes.length ? sortedNotes.map((note, index) => {
              const items = Array.isArray(note.items) ? note.items : [];
              return (
                <article className="release-note-entry" key={`${note.date ?? "note"}-${note.version ?? index}`}>
                  <div className="release-note-entry-header">
                    <div>
                      <p className="release-note-version">{note.version || "Release Note"}</p>
                      <h3>{note.title || "변경 사항"}</h3>
                    </div>
                    <time dateTime={note.date || undefined}>{note.date || "날짜 미상"}</time>
                  </div>
                  {note.summary ? <p className="release-note-summary">{note.summary}</p> : null}
                  {items.length ? (
                    <ul>
                      {items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
                    </ul>
                  ) : <p className="release-note-empty">세부 변경 내용이 없습니다.</p>}
                </article>
              );
            }) : <p className="release-note-empty">기록된 Release Note가 없습니다.</p>}
          </div>
        </section>
        )}
      </main>
      <SiteFooter />
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

const OTHER_TEAM_COLUMNS = [
  ["team", "팀명"], ["leagueRank", "현재 리그 순위"], ["teamStrength", "팀 전력"],
  ["batterStrength", "타자 전력"], ["pitcherStrength", "투수 전력"]
];

function rankTone(rank) {
  if (rank === 1) return "rank-first";
  if (rank >= 2 && rank <= 5) return "rank-upper";
  if (rank >= 6 && rank <= 9) return "rank-lower";
  if (rank === 10) return "rank-last";
  return "";
}

function formatStrengthWithRank(value, rank) {
  return rank == null ? formatRating(value) : `${formatRating(value)} (${rank}위)`;
}

function OtherPlayerLink({ player }) {
  if (!player) return <span className="other-empty">—</span>;
  const href = playerPageHref(player);
  return href ? <a href={href}>{player.name}</a> : <span>{player.name}</span>;
}

function LineupTeam({ side, pools }) {
  const [selection, setSelection] = useState({ team: "", batters: [], pitcher: "" });
  const [search, setSearch] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const draggedIndex = useRef(null);
  const dropIndex = useRef(null);
  const pool = pools.find((entry) => entry.team === selection.team);
  const batters = pool?.batters ?? [];
  const pitchers = pool?.pitchers ?? [];
  const batterById = new Map(batters.map((player) => [player.playerId, player]));
  const pitcherById = new Map(pitchers.map((player) => [player.playerId, player]));
  const selectedBatters = selection.batters.map((id) => batterById.get(id));
  const selectedPitcher = pitcherById.get(selection.pitcher);
  const weightedRating = selection.batters.length === 9 && selection.pitcher
    ? lineupWeightedRating(selectedBatters.map((player) => player?.rating), selectedPitcher?.rating)
    : null;
  const filteredBatters = batters.filter((player) => player.name.includes(search.trim()));

  const toggleBatter = (playerId) => setSelection((current) => ({
    ...current,
    batters: current.batters.includes(playerId)
      ? current.batters.filter((id) => id !== playerId)
      : current.batters.length < 9 ? [...current.batters, playerId] : current.batters
  }));
  const moveBatter = (fromIndex, toIndex) => setSelection((current) => ({
    ...current,
    batters: moveLineupBatter(current.batters, fromIndex, toIndex)
  }));
  const finishDrag = (event, shouldMove) => {
    if (draggedIndex.current == null) return;
    if (shouldMove && dropIndex.current != null) moveBatter(draggedIndex.current, dropIndex.current);
    draggedIndex.current = null;
    dropIndex.current = null;
    setDragOverIndex(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const dragBatter = (event) => {
    if (draggedIndex.current == null) return;
    const rows = event.currentTarget.closest(".lineup-list")?.querySelectorAll(".lineup-order-row") ?? [];
    const targetIndex = [...rows].findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return event.clientY >= bounds.top && event.clientY < bounds.bottom;
    });
    if (targetIndex < 0 || targetIndex >= selection.batters.length) return;
    dropIndex.current = targetIndex;
    setDragOverIndex(targetIndex);
  };
  const optionLabel = (player) => `${player.name}${player.league === "1군" ? "" : ` · ${player.league}`}`;

  return <div className="lineup-team">
    <div className="lineup-team-heading">
      <label htmlFor={`lineup-team-${side}`}>{side === 1 ? "왼쪽 팀" : "오른쪽 팀"}</label>
      <select id={`lineup-team-${side}`} value={selection.team} onChange={(event) => { setSelection({ team: event.target.value, batters: [], pitcher: "" }); setSearch(""); }}>
        <option value="">구단 선택</option>
        {pools.map((entry) => <option key={entry.team} value={entry.team}>{entry.team}</option>)}
      </select>
    </div>
    <div className="lineup-score" aria-live="polite">
      <span>라인업 가중평균</span>
      <strong className={weightedRating == null ? "" : ratingBand(weightedRating)}>{weightedRating == null ? "—" : formatRating(weightedRating)}</strong>
    </div>
    <div className="lineup-picker">
      <label htmlFor={`lineup-search-${side}`}>타자 선택 <span>{selection.batters.length}/9</span></label>
      <input id={`lineup-search-${side}`} type="search" placeholder="선수 이름 검색" value={search} disabled={!pool} onChange={(event) => setSearch(event.target.value)} />
      <div className="lineup-picker-options" aria-label={`${side === 1 ? "왼쪽" : "오른쪽"} 팀 타자 목록`}>
        {filteredBatters.map((player) => {
          const checked = selection.batters.includes(player.playerId);
          return <label className={checked ? "lineup-picker-option is-selected" : "lineup-picker-option"} key={player.playerId}>
            <input type="checkbox" checked={checked} disabled={!checked && selection.batters.length >= 9} onChange={() => toggleBatter(player.playerId)} />
            <span>{player.name}</span>{player.league !== "1군" && <small>{player.league}</small>}
          </label>;
        })}
        {pool && !filteredBatters.length && <p className="lineup-picker-empty">검색 결과가 없습니다.</p>}
      </div>
    </div>
    <div className="lineup-list" aria-label={`${side === 1 ? "왼쪽" : "오른쪽"} 팀 타순`}>
      <p className="lineup-order-hint">선택한 타자를 드래그하거나 화살표로 타순을 바꿀 수 있습니다.</p>
      {Array.from({ length: 9 }, (_, index) => {
        const player = selectedBatters[index];
        return <div className={`lineup-order-row${player ? " is-filled" : ""}${dragOverIndex === index ? " is-drag-over" : ""}`} key={player?.playerId ?? `empty-${index}`}>
          <span className="lineup-order-number">{index + 1}</span>
          <span className="lineup-order-name">{player ? <><span className="lineup-drag-handle" aria-hidden="true"
            onPointerDown={(event) => { if (event.button !== 0) return; draggedIndex.current = index; dropIndex.current = index; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
            onPointerMove={dragBatter}
            onPointerUp={(event) => finishDrag(event, true)}
            onPointerCancel={(event) => finishDrag(event, false)}>⠿</span> {player.name}</> : "선수 미선택"}</span>
          <span className={player ? ratingBand(player.rating) : ""}>{player ? formatRating(player.rating) : "—"}</span>
          {player && <span className="lineup-order-actions">
            <button type="button" disabled={index === 0} aria-label={`${player.name} 타순 올리기`} onClick={() => moveBatter(index, index - 1)}>▲</button>
            <button type="button" disabled={index === selection.batters.length - 1} aria-label={`${player.name} 타순 내리기`} onClick={() => moveBatter(index, index + 1)}>▼</button>
          </span>}
        </div>;
      })}
      <div className="lineup-row lineup-pitcher-row">
        <label htmlFor={`lineup-${side}-pitcher`}>선발투수</label>
        <select id={`lineup-${side}-pitcher`} value={selection.pitcher} disabled={!pool} onChange={(event) => setSelection((current) => ({ ...current, pitcher: event.target.value }))}>
          <option value="">선수 선택</option>
          {pitchers.map((player) => <option key={player.playerId} value={player.playerId}>{optionLabel(player)}</option>)}
        </select>
        <span className={selectedPitcher ? ratingBand(selectedPitcher.rating) : ""}>{selectedPitcher ? formatRating(selectedPitcher.rating) : "—"}</span>
      </div>
    </div>
    <p className="lineup-progress">타자 {selection.batters.length}/9명 · 선발투수 {selection.pitcher ? "선택됨" : "미선택"}</p>
  </div>;
}

function LineupComparison({ pools, asOf }) {
  return <section className="sheet-card other-card" aria-labelledby="lineup-title">
    <div className="sheet-card-header"><div><p className="kicker">LINEUP COMPARISON</p><h2 id="lineup-title">라인업 폼 비교</h2></div></div>
    <p className="lineup-description">각 팀의 타자 9명을 목록에서 선택하고 드래그로 타순을 정한 뒤 선발투수를 고르세요. 모두 선택하면 (타자 폼 합계 + 선발투수 폼 × 6) ÷ 15로 계산합니다.{asOf ? ` · ${asOf} 폼 기준` : ""}</p>
    <div className="lineup-grid"><LineupTeam side={1} pools={pools} /><LineupTeam side={2} pools={pools} /></div>
  </section>;
}

function OtherPage() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: "leagueRank", direction: 1 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOtherStats()
      .then((result) => { if (!cancelled) setPayload(result); })
      .catch((reason) => { if (!cancelled) setError(reason); });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => payload ? buildOtherStats(payload.ratings, payload.standings, payload.latestDiff) : null, [payload]);
  const lineupPools = useMemo(() => payload ? buildLineupPools(payload.ratings) : [], [payload]);
  const strengthRanks = useMemo(() => stats ? Object.fromEntries(
    ["teamStrength", "batterStrength", "pitcherStrength"].map((key) => [key, rankTeamsByMetric(stats.teams, key)])
  ) : {}, [stats]);
  const teams = useMemo(() => [...(stats?.teams ?? [])].sort((a, b) => {
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return (typeof av === "string" ? av.localeCompare(bv, "ko") : av - bv) * sort.direction
      || a.team.localeCompare(b.team, "ko");
  }), [stats, sort]);
  const changeSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key ? -current.direction : key === "team" || key === "leagueRank" ? 1 : -1
  }));
  const count = expanded ? 50 : 10;

  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-content other-page-content">
        <div className="other-page-heading">
          <h2>기타 통계</h2>
          <p>여러 통계를 테스트 중입니다.</p>
        </div>
        {error ? <section className="sheet-card"><LoadError>통계 데이터를 불러오지 못했습니다. API와 순위 데이터를 확인해 주세요.</LoadError></section> : !stats ? <section className="sheet-card"><LoadingState>기타 통계를 불러오는 중입니다.</LoadingState></section> : <>
          <LineupComparison pools={lineupPools} asOf={payload?.ratings?.meta?.asOf} />
          <section className="sheet-card other-card" aria-labelledby="other-team-title">
            <div className="sheet-card-header"><div><p className="kicker">CLUB STRENGTH</p><h2 id="other-team-title">팀 통계</h2></div></div>
            <div className="other-table-scroll"><table className="other-table other-team-table"><thead><tr>{OTHER_TEAM_COLUMNS.map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.direction === 1 ? "ascending" : "descending" : "none"}><button type="button" onClick={() => changeSort(key)}>{label}<span className="sort-indicator" aria-hidden="true">{sort.key === key ? sort.direction === 1 ? "▲" : "▼" : "↕"}</span></button></th>)}</tr></thead><tbody>{teams.map((team) => <tr key={team.team}><th scope="row">{team.team}</th><td className={rankTone(team.leagueRank)}>{team.leagueRank == null ? "—" : `${team.leagueRank}위`}</td><td className={rankTone(strengthRanks.teamStrength?.get(team.team))}>{formatStrengthWithRank(team.teamStrength, strengthRanks.teamStrength?.get(team.team))}</td><td className={rankTone(strengthRanks.batterStrength?.get(team.team))}>{formatStrengthWithRank(team.batterStrength, strengthRanks.batterStrength?.get(team.team))}</td><td className={rankTone(strengthRanks.pitcherStrength?.get(team.team))}>{formatStrengthWithRank(team.pitcherStrength, strengthRanks.pitcherStrength?.get(team.team))}</td></tr>)}</tbody></table></div>
          </section>
          <section className="sheet-card other-card" aria-labelledby="asian-title">
            <div className="sheet-card-header"><div><p className="kicker">ASIAN GAMES</p><h2 id="asian-title">아시안 게임 대표팀 명단</h2></div></div>
            <div className="other-table-scroll"><table className="other-table other-asian-table">
              <colgroup><col className="other-name-col" /><col className="other-team-col" /><col className="other-form-col" /><col className="other-name-col" /><col className="other-team-col" /><col className="other-form-col" /></colgroup>
              <thead><tr><th scope="col">타자 이름</th><th scope="col">소속팀</th><th scope="col">폼</th><th scope="col">투수 이름</th><th scope="col">소속팀</th><th scope="col">폼</th></tr></thead>
              <tbody>{Array.from({ length: Math.max(stats.asianBatters.length, stats.asianPitchers.length) }, (_, index) => <tr key={index}>
                <td><OtherPlayerLink player={stats.asianBatters[index]} /></td><td>{stats.asianBatters[index]?.team ?? "—"}</td><td className={ratingBand(stats.asianBatters[index]?.rating)}>{formatRating(stats.asianBatters[index]?.rating)}</td>
                <td><OtherPlayerLink player={stats.asianPitchers[index]} /></td><td>{stats.asianPitchers[index]?.team ?? "—"}</td><td className={ratingBand(stats.asianPitchers[index]?.rating)}>{formatRating(stats.asianPitchers[index]?.rating)}</td>
              </tr>)}</tbody>
            </table>{!stats.asianBatters.length && !stats.asianPitchers.length ? <p className="other-empty-state">현재 아시안게임 출전으로 분류된 선수가 없습니다.</p> : null}</div>
          </section>
          <section className="sheet-card other-card" aria-labelledby="ranking-title">
            <div className="sheet-card-header"><div><p className="kicker">PLAYER RANKINGS</p><h2 id="ranking-title">전체 선수 폼 순위</h2></div></div>
            <div className="other-table-scroll"><table className="other-table other-ranking-table">
              <thead><tr><th scope="col">순위</th><th scope="col">타자명</th><th scope="col">소속팀</th><th scope="col">폼</th><th scope="col">변동량</th><th scope="col">투수명</th><th scope="col">소속팀</th><th scope="col">폼</th><th scope="col">변동량</th></tr></thead>
              <tbody>{Array.from({ length: Math.max(Math.min(stats.batters.length, count), Math.min(stats.pitchers.length, count)) }, (_, index) => <tr key={index}>
                <th scope="row">{index + 1}</th>
                <td><OtherPlayerLink player={stats.batters[index]} /></td><td>{stats.batters[index]?.team ?? "—"}</td><td className={ratingBand(stats.batters[index]?.rating)}>{formatRating(stats.batters[index]?.rating)}</td><td><Delta value={stats.batters[index]?.latestDateDelta} /></td>
                <td><OtherPlayerLink player={stats.pitchers[index]} /></td><td>{stats.pitchers[index]?.team ?? "—"}</td><td className={ratingBand(stats.pitchers[index]?.rating)}>{formatRating(stats.pitchers[index]?.rating)}</td><td><Delta value={stats.pitchers[index]?.latestDateDelta} /></td>
              </tr>)}</tbody>
            </table></div>
            <div className="other-more-row"><button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "접기 · 상위 10명" : "더보기 · 상위 50명"}</button></div>
          </section>
        </>}
      </main>
      <SiteFooter status={payload?.ratings?.meta?.asOf ? `${payload.ratings.meta.asOf} 폼 기준` : undefined} />
    </div>
  );
}

function kboOfficialPlayerId(player) {
  const candidate = String(
    player?.kboPlayerId
      ?? player?.officialPlayerId
      ?? player?.profile?.kboPlayerId
      ?? player?.playerId
      ?? ""
  ).trim();
  const match = candidate.match(/^(?:player:kbo:)?(\d+)(?::(?:batter|pitcher))?$/i);
  return match?.[1] ?? null;
}

function officialKboRecordUrls(player) {
  const playerId = kboOfficialPlayerId(player);
  if (!playerId) return null;

  const query = new URLSearchParams({ playerId }).toString();
  const paths = isPitcherPlayer(player)
    ? [
        "/Record/Player/PitcherDetail/Basic.aspx",
        "/Futures/Player/PitcherDetail.aspx"
      ]
    : [
        "/Record/Player/HitterDetail/Daily.aspx",
        "/Futures/Player/HitterDetail.aspx"
      ];

  return paths.map((path) => `https://www.koreabaseball.com${path}?${query}`);
}

function opponentPlayerIdForAppearance(appearance) {
  const opponent = appearance?.opponentPlayer;
  const nestedOpponent = opponent && typeof opponent === "object" ? opponent : null;
  return relationPlayerId(
    appearance?.opponentPlayerId
      ?? appearance?.opponent_player_id
      ?? nestedOpponent
  );
}

function opponentPlayerNameForAppearance(appearance) {
  const opponent = appearance?.opponentPlayer;
  if (opponent && typeof opponent === "object") {
    return opponent.displayName ?? opponent.name ?? opponent.nameKo ?? opponent.name_ko ?? appearance?.opponentPlayerName ?? null;
  }
  return appearance?.opponentPlayerName ?? opponent ?? null;
}

function PlayerRoleLinks({ player }) {
  const currentRole = isPitcherPlayer(player) ? "pitcher" : "batter";
  const targetRole = currentRole === "pitcher" ? "batter" : "pitcher";
  const targetPlayerId = relatedPlayerIdForRole(player, targetRole);
  if (!targetPlayerId) return null;

  return (
    <a
      className="related-role-record-link"
      href={playerPageHref({ playerId: targetPlayerId })}
      aria-label={`${roleLabel(targetRole)} 기록 보기`}
    >
      {roleLabel(targetRole)} 기록 보기 <span aria-hidden="true">→</span>
    </a>
  );
}

function OfficialKboRecordLinks({ player }) {
  const urls = officialKboRecordUrls(player);
  if (!urls) return null;
  const role = isPitcherPlayer(player) ? "투수" : "타자";

  return (
    <nav className="official-record-links" aria-label="KBO 공식 선수 기록">
      {urls.map((url, index) => {
        const league = index === 0 ? "1군" : "2군";
        return (
          <a
            key={league}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`KBO 공식 ${league} ${role} 기록, 새 탭에서 열기`}
          >
            {league} <span aria-hidden="true">↗</span>
          </a>
        );
      })}
    </nav>
  );
}

function PlayerProfile({ player, ratings }) {
  const profile = player.profile ?? {};
  const latest = ratings[ratings.length - 1] ?? null;
  const physicalInfo = [
    profileHandednessLabel(profile),
    profileMeasurement(profile.heightCm, "cm"),
    profileMeasurement(profile.weightKg, "kg")
  ].filter(Boolean).join(" · ");
  const items = [
    ["역할·포지션", rolePositionLabel(player)],
    ["소속 구단", `${fullTeamName(profile.team)} · ${currentAffiliationLabel(player)}`],
    ["생년월일", profile.birthDate],
    ["투타·신체", physicalInfo]
  ];

  return (
    <>
      <section className="player-card" aria-labelledby="player-title">
        <PlayerPhoto player={player} />
        <div className="player-summary">
          <div className="player-summary-main">
            <div className="player-summary-head">
              <div className="player-heading">
                <p className="kicker">PLAYER PROFILE</p>
                <h2 id="player-title">
                  {player.displayName}
                  {profile.uniformNumber ? <span className="uniform-number">#{profile.uniformNumber}</span> : null}
                </h2>
              </div>
              <div className="player-profile-links" role="group" aria-label="다른 역할 및 KBO 공식 기록">
                <PlayerRoleLinks player={player} />
                <OfficialKboRecordLinks player={player} />
              </div>
            </div>
            <div className="profile-grid" aria-label="선수 기본 정보">
              {items.map(([label, value]) => (
                <div className="profile-item" key={label}>
                  <div className="profile-label">{label}</div>
                  <div className="profile-value">{value || "—"}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={`current-rating ${ratingBand(latest?.rating)}`}>
            <span className="current-rating-label">오늘의 폼</span>
            <strong className="current-rating-value">{formatRating(latest?.rating)}</strong>
          </div>
        </div>
      </section>
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
            <div className="technical-value">{value || "—"}</div>
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
  return { away: match[1], home: match[2] };
}

function gameHomeAway(gameId, playerTeam, opponentTeam) {
  const teams = gameTeamsFromId(gameId);
  if (!teams) return null;
  const home = canonicalTeamLabel(teams.home);
  const away = canonicalTeamLabel(teams.away);
  const opponentLabel = canonicalTeamLabel(opponentTeam);
  if (opponentLabel && opponentLabel === away && opponentLabel !== home) return "홈";
  if (opponentLabel && opponentLabel === home && opponentLabel !== away) return "원정";
  const playerLabel = canonicalTeamLabel(playerTeam);
  if (playerLabel && playerLabel === home) return "홈";
  if (playerLabel && playerLabel === away) return "원정";
  return null;
}

function gameOpponentDisplayName(value, league) {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase();
  const isKiwoomAffiliate = canonicalTeamLabel(raw) === "키움" || normalized === "고양 히어로즈";
  if (gameLeagueLabel(league) === "2군" && isKiwoomAffiliate) return "고양 히어로즈";
  return fullTeamName(raw);
}

function gameOpponentName(appearance, playerTeam) {
  const teams = gameTeamsFromId(appearance?.gameId);
  const playerLabel = canonicalTeamLabel(playerTeam);
  const parsedOpponent = teams
    ? (playerLabel === canonicalTeamLabel(teams.home) ? teams.away : playerLabel === canonicalTeamLabel(teams.away) ? teams.home : null)
    : null;
  return gameOpponentDisplayName(appearance?.opponent || parsedOpponent, appearance?.league);
}

function gameContextText(entry, player) {
  const opponentValue = entry.opponentDisplay || gameOpponentName(entry, player?.profile?.team);
  const opponent = opponentValue ? gameOpponentDisplayName(opponentValue, entry.league) : "구단 미상";
  const homeAway = entry.homeAway || gameHomeAway(entry.gameId, null, entry.opponent);
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
    const result = normalizePlateAppearanceResult(appearance.result);
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

function summarizePitchingPerformance(appearances, gameStat = null) {
  if (gameStat) {
    const statOuts = numericField(gameStat, ["outs", "pitchingOuts", "inningOuts"]);
    return {
      kind: "pitching",
      innings: gameStat.innings ?? (statOuts === null ? null : formatInnings(statOuts)),
      hitsAllowed: numericField(gameStat, ["hitsAllowed", "hits_allowed", "pitchingHits"]),
      homeRunsAllowed: numericField(gameStat, ["homeRunsAllowed", "hrAllowed", "pitchingHomeRuns"]),
      walks: numericField(gameStat, ["walks", "walksHitByPitch", "bbHbp", "bb_hbp"]),
      strikeouts: numericField(gameStat, ["strikeouts", "so", "strikeOuts"]),
      runs: numericField(gameStat, ["runs", "r"]),
      earnedRuns: numericField(gameStat, ["earnedRuns", "er"]),
      battersFaced: numericField(gameStat, ["battersFaced", "bf"])
    };
  }

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
  const pitchingStats = isPitcherPlayer(player) ? (player?.pitchingGameStats ?? []) : [];
  const pitchingStatsByGame = new Map();

  pitchingStats.forEach((stat) => {
    const key = `${stat.date ?? "unknown"}::${stat.gameId ?? "unknown"}`;
    pitchingStatsByGame.set(key, stat);
  });

  appearances.forEach((appearance) => {
    const groupKey = `${appearance.date ?? "unknown"}::${appearance.gameId ?? `game-${appearance.sourceIndex}`}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(appearance);
  });

  pitchingStats.forEach((stat) => {
    const groupKey = `${stat.date ?? "unknown"}::${stat.gameId ?? "unknown"}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
  });

  return [...groups.entries()].map(([groupKey, group], index) => {
    const stat = pitchingStatsByGame.get(groupKey) ?? null;
    const first = group[0] ?? stat;
    const last = group[group.length - 1] ?? stat;
    const firstBefore = toNumber(first?.ratingBefore);
    const lastAfter = toNumber(last?.ratingAfter);
    const rating = appearanceRating(last) ?? ratingByDate.get(String(first?.date));
    const delta = group.reduce((total, appearance) => {
      const value = appearanceDelta(appearance);
      return value === null ? total : total + value;
    }, 0);
    const resultValues = group.map((appearance) => normalizePlateAppearanceResult(appearance.result)).filter(Boolean);
    const performance = isPitcherPlayer(player) && stat
      ? summarizePitchingPerformance(group, stat)
      : summarizeGamePerformance(group, player);
    const league = stat?.league || first?.league || null;
    const opponentValue = stat?.opponent || first?.opponent || gameOpponentName(first, player?.profile?.team);
    const opponentDisplay = gameOpponentDisplayName(opponentValue, league);

    return {
      key: `game-${first?.date}-${first?.gameId ?? index}`,
      granularity: "game",
      granularityLabel: "경기별",
      date: first?.date,
      league,
      rating,
      ratingBefore: firstBefore,
      ratingAfter: lastAfter,
      ratingDelta: delta || (firstBefore !== null && lastAfter !== null ? lastAfter - firstBefore : null),
      gameId: first?.gameId,
      opponent: stat?.opponent || first?.opponent,
      opponentDisplay,
      homeAway: gameHomeAway(first?.gameId, stat?.team, stat?.opponent || first?.opponent),
      appearances: group,
      paCount: stat?.battersFaced ?? group.length,
      results: resultValues,
      performance,
      summary: performanceSummaryText(performance),
      modelVersion: last?.modelVersion ?? last?.ratingEffect?.modelVersion,
      statSource: stat?.statSource,
      completeness: stat?.completeness
    };
  });
}

function buildPlateAppearanceEntries(ratings, appearances, player) {
  const ratingByDate = new Map(ratings.map((snapshot) => [String(snapshot.date), snapshot.rating]));
  return appearances.map((appearance, index) => ({
    key: `pa-${appearance.paId ?? index}`,
    granularity: "plateAppearance",
    granularityLabel: "타석별",
    date: appearance.date,
    league: appearance.league || null,
    rating: appearanceRating(appearance) ?? ratingByDate.get(String(appearance.date)),
    ratingBefore: toNumber(appearance.ratingBefore),
    ratingAfter: toNumber(appearance.ratingAfter),
    ratingDelta: appearanceDelta(appearance),
    gameId: appearance.gameId,
    opponent: appearance.opponent,
    opponentDisplay: gameOpponentName(appearance, player?.profile?.team),
    homeAway: gameHomeAway(appearance.gameId, null, appearance.opponent),
    result: normalizePlateAppearanceResult(appearance.result),
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
  return buildGameEntries(ratings, appearances, player)
    .filter((entry) => entry.rating !== null && entry.rating !== undefined)
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")) || String(a.gameId ?? "").localeCompare(String(b.gameId ?? "")));
}

function chartEntrySummary(entry) {
  if (entry.granularity === "game") {
    const opponentName = entry.opponentDisplay ? gameOpponentDisplayName(entry.opponentDisplay, entry.league) : "";
    const opponent = opponentName ? `상대 ${opponentName}${entry.homeAway ? ` · ${entry.homeAway}` : ""} · ` : "";
    return `${opponent}${entry.summary}`;
  }
  const opponentName = entry.opponentDisplay ? gameOpponentDisplayName(entry.opponentDisplay, entry.league) : "";
  const opponent = opponentName ? `상대 ${opponentName}${entry.homeAway ? ` · ${entry.homeAway}` : ""} · ` : "";
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
  const color = number > 0 ? "#236bb5" : "#c23535";
  const arrow = number > 0 ? "▲" : "▼";
  return `<span style="color:${color};font-weight:700">${arrow}${Math.abs(number).toFixed(1)}</span>`;
}

function chartTooltipHtml(entry, delta) {
  if (!entry) return "";
  const opponentName = entry.opponentDisplay ? gameOpponentDisplayName(entry.opponentDisplay, entry.league) : "상대 정보 없음";
  const gameContext = `${opponentName}${entry.homeAway ? ` · ${entry.homeAway}` : ""}`;
  const lines = entry.granularity === "game"
    ? [
        `vs. ${gameContext}`,
        entry.performance?.kind === "pitching"
          ? `${entry.performance.battersFaced ?? entry.paCount ?? 0}타자 상대`
          : `${entry.paCount ?? 0}타석`,
        `성적 ${entry.summary || "기록 없음"}`,
        ...(entry.results?.length ? [`결과 ${entry.results.slice(0, 6).join(" · ")}${entry.results.length > 6 ? " · …" : ""}`] : []),
        `폼 변화 ${chartDeltaHtml(delta)}`
      ]
    : [
        `vs. ${gameContext}`,
        `${entry.plateAppearanceNumber ? `${entry.plateAppearanceNumber}번째 타석` : "타석 번호 없음"}`,
        `결과 ${entry.result || "—"}`,
        `폼 변화 ${chartDeltaHtml(delta)}`
      ];

  return `<div class="echarts-tooltip-content">
    <span class="echarts-tooltip-kicker">${escapeChartHtml(entry.granularityLabel)}</span>
    <strong>${escapeChartHtml(formatDate(entry.date))} · 폼 ${escapeChartHtml(formatRating(entry.rating))}</strong>
    <div class="echarts-tooltip-lines">${lines.map((line) => `<span>${line.includes("폼 변화") ? line : escapeChartHtml(line)}</span>`).join("")}</div>
  </div>`;
}

function chartDateFromAxisValue(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return String(value ?? "");
  return formatShortDate(date.toISOString().slice(0, 10));
}

function ratingLeaguePalette(league) {
  const normalized = gameLeagueLabel(league);
  if (normalized === "1군") {
    return { key: "major", label: "1군", fill: "#3c82bf", border: "#245a88", line: "#2f6f9f" };
  }
  if (normalized === "2군") {
    return { key: "minor", label: "2군", fill: "#a66b3f", border: "#704324", line: "#8b5e3c" };
  }
  return { key: "unknown", label: "기타", fill: "#8a9299", border: "#626970", line: "#737b82" };
}

function RatingChart({ ratings, player }) {
  const [viewMode, setViewMode] = useState("game");
  const [showAllGames, setShowAllGames] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const entries = useMemo(() => buildChartEntries(viewMode, ratings, player), [viewMode, ratings, player]);
  const selectedAppearances = useMemo(() => selectedDate
    ? sortAppearances(player).filter((appearance) => appearance.date === selectedDate)
    : [], [player, selectedDate]);
  const selectedAppearanceRatings = selectedAppearances
    .map((appearance) => toNumber(appearance.ratingAfter) ?? toNumber(appearance.ratingBefore))
    .filter((value) => value !== null);
  const selectedMaximumRating = selectedAppearanceRatings.length ? Math.max(...selectedAppearanceRatings) : null;
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const chartOptionRef = useRef({});

  const isZoomable = viewMode === "game";
  const timelineInfo = useMemo(() => {
    const dayMilliseconds = 24 * 60 * 60 * 1000;
    const times = entries.map((entry) => Date.parse(`${entry.date}T00:00:00`));
    const validTimes = times.filter(Number.isFinite);
    const useTimeScale = isZoomable && validTimes.length === entries.length && validTimes.length > 1;
    const earliest = validTimes.length ? Math.min(...validTimes) : 0;
    const latest = validTimes.length ? Math.max(...validTimes) : 0;
    const baselineTime = earliest - Math.max(dayMilliseconds, (latest - earliest) * 0.035);
    const recentStartTime = Math.max(earliest, latest - 30 * dayMilliseconds);
    const recentStartIndexCandidate = times.findIndex((time) => Number.isFinite(time) && time >= recentStartTime);
    const recentStartIndex = recentStartIndexCandidate >= 0
      ? recentStartIndexCandidate
      : Math.max(0, entries.length - Math.min(entries.length, 30));

    // Leave a visible gap from the 50.0 starting point even when there are hundreds of appearances.
    const plateAppearanceBaselineGap = Math.max(1, entries.length * 0.035);
    const plateAppearanceXValues = entries.map((_, index) => index + plateAppearanceBaselineGap);
    const plateAppearanceMaxValue = plateAppearanceBaselineGap + entries.length;
    const recentPlateAppearanceStartValue = entries.length > 100
      ? plateAppearanceBaselineGap + entries.length - 100
      : 0;
    const fullRange = useTimeScale
      ? latest - baselineTime
      : entries.length;
    const minimumZoomSpan = useTimeScale
      ? Math.min(30 * dayMilliseconds, Math.max(fullRange, 1))
      : isZoomable
        ? Math.min(30, Math.max(fullRange, 1))
        : Math.min(100, Math.max(entries.length, 1));

    return {
      times,
      useTimeScale,
      earliest,
      latest,
      baselineTime,
      recentStartTime,
      recentStartIndex,
      plateAppearanceXValues,
      plateAppearanceBaselineGap,
      plateAppearanceMaxValue,
      recentPlateAppearanceStartValue,
      minimumZoomSpan
    };
  }, [entries, isZoomable]);

  const values = entries.map((entry) => entry.rating);
  const observedMin = entries.length ? Math.min(50, ...values) : 0;
  const observedMax = entries.length ? Math.max(50, ...values) : 100;
  const observedRange = Math.max(observedMax - observedMin, 1);
  const bottomMargin = entries.length ? Math.max(observedRange * 0.05, 0.5) : 0;
  const topMargin = entries.length ? observedRange * 0.1 : 0;
  const axisMin = entries.length ? Math.max(0, observedMin - bottomMargin) : 0;
  // Keep the intended 10% headroom. Rounding this value up to the next
  // multiple of 10 made the visible upper margin jump from roughly 70 to 80.
  const axisMax = entries.length ? observedMax + topMargin : 100;
  const yAxisLabelValues = useMemo(() => {
    const first = Math.ceil(axisMin / 10) * 10;
    const last = Math.floor(axisMax / 10) * 10;
    const values = [];
    for (let value = first; value <= last; value += 10) {
      values.push(value);
    }
    return values;
  }, [axisMax, axisMin]);
  const maximumRating = entries.length ? Math.max(...values) : null;
  const maximumIndex = entries.reduce((lastIndex, entry, index) => (isSameRating(entry.rating, maximumRating) ? index : lastIndex), -1);
  const maximumEntry = maximumIndex >= 0 ? entries[maximumIndex] : null;

  const chartOption = useMemo(() => {
    if (!entries.length) return {};

    const xValues = timelineInfo.useTimeScale
      ? timelineInfo.times
      : isZoomable
        ? entries.map((_, index) => index + 1)
        : timelineInfo.plateAppearanceXValues;
    const baselineX = timelineInfo.useTimeScale ? timelineInfo.baselineTime : 0;
    const chartData = entries.map((entry, index) => {
      const maximum = isSameRating(entry.rating, maximumRating);
      const palette = ratingLeaguePalette(entry.league);
      return {
        value: [xValues[index], entry.rating],
        entryIndex: index,
        itemStyle: {
          color: palette.fill,
          borderColor: palette.border,
          borderWidth: maximum ? 2.8 : 1.6
        }
      };
    });
    const initialPalette = ratingLeaguePalette(entries[0].league);
    const lineSeries = [{
      type: "line",
      name: "시작 폼",
      data: [{ value: [baselineX, 50], isBaseline: true }, [xValues[0], entries[0].rating]],
      showSymbol: true,
      symbol: "circle",
      symbolSize: (_, params) => params.dataIndex === 0 ? 8 : 0,
      silent: true,
      tooltip: { show: false },
      itemStyle: { color: initialPalette.fill, borderColor: initialPalette.border, borderWidth: 1.6 },
      lineStyle: { color: initialPalette.line, width: 2.5 },
      z: 3
    }];
    if (entries.length > 1) {
      const addLeagueRun = (startEdge, endPoint, palette, runIndex) => {
        const data = [];
        for (let index = startEdge - 1; index <= endPoint; index += 1) {
          data.push([xValues[index], entries[index].rating]);
        }
        lineSeries.push({
          type: "line",
          name: `${palette.label} 폼 구간 ${runIndex + 1}`,
          data,
          showSymbol: false,
          connectNulls: false,
          smooth: false,
          silent: true,
          tooltip: { show: false },
          lineStyle: { color: palette.line, width: 2.5 },
          z: 3
        });
      };
      let runStartEdge = 1;
      let runPalette = ratingLeaguePalette(entries[1].league);
      let runIndex = 0;
      for (let edgeIndex = 2; edgeIndex < entries.length; edgeIndex += 1) {
        const nextPalette = ratingLeaguePalette(entries[edgeIndex].league);
        if (nextPalette.key !== runPalette.key) {
          addLeagueRun(runStartEdge, edgeIndex - 1, runPalette, runIndex);
          runStartEdge = edgeIndex;
          runPalette = nextPalette;
          runIndex += 1;
        }
      }
      addLeagueRun(runStartEdge, entries.length - 1, runPalette, runIndex);
    }

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
      ? (isZoomable ? (timelineInfo.useTimeScale ? timelineInfo.baselineTime : 0) : 0)
      : (isZoomable
        ? (timelineInfo.useTimeScale ? timelineInfo.recentStartTime : timelineInfo.recentStartIndex + 1)
        : timelineInfo.recentPlateAppearanceStartValue);
    const endValue = isZoomable
      ? (timelineInfo.useTimeScale ? timelineInfo.latest : entries.length)
      : timelineInfo.plateAppearanceMaxValue;
    const deltaForIndex = (index) => {
      const entry = entries[index];
      const prior = index > 0 ? entries[index - 1] : null;
      return entry?.ratingDelta ?? (entry && prior ? entry.rating - prior.rating : null);
    };

    return {
      animation: false,
      grid: {
        left: 38,
        right: 16,
        top: 14,
        bottom: 42,
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
          const item = items.find((candidate) => candidate?.seriesName === "폼" && candidate?.data?.entryIndex !== undefined)
            ?? items.find((candidate) => candidate?.data?.entryIndex !== undefined)
            ?? items[0];
          const index = Number(item?.data?.entryIndex);
          return Number.isInteger(index) && entries[index]
            ? chartTooltipHtml(entries[index], deltaForIndex(index))
            : items.some((candidate) => candidate?.data?.isBaseline) ? "시작 폼 50.0" : "";
        }
      },
      xAxis: {
        type: timelineInfo.useTimeScale ? "time" : isZoomable ? "category" : "value",
        boundaryGap: false,
        min: isZoomable ? undefined : 0,
        max: isZoomable ? undefined : timelineInfo.plateAppearanceMaxValue,
        data: timelineInfo.useTimeScale || !isZoomable ? undefined : ["시작", ...entries.map((entry) => entry.date)],
        axisLine: { lineStyle: { color: "#c9ced2" } },
        axisTick: { alignWithLabel: true, lineStyle: { color: "#c9ced2" } },
        axisLabel: {
          color: "#727980",
          fontSize: 10,
          hideOverlap: true,
          formatter: timelineInfo.useTimeScale
            ? chartDateFromAxisValue
            : isZoomable
              ? (value) => value === "시작" ? value : formatShortDate(value)
              : (value) => {
                  const numericValue = Number(value);
                  if (!Number.isFinite(numericValue) || !entries.length) return "";
                  if (numericValue === 0) return "시작";
                  if (numericValue < timelineInfo.plateAppearanceBaselineGap) return "";
                  const entryIndex = Math.min(entries.length - 1, Math.max(0, Math.floor(numericValue - timelineInfo.plateAppearanceBaselineGap)));
                  return formatShortDate(entries[entryIndex]?.date);
                }
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        min: axisMin,
        max: axisMax,
        interval: 10,
        axisLine: { show: false },
        axisTick: { show: false, customValues: yAxisLabelValues },
        axisLabel: {
          color: "#727980",
          fontSize: 11,
          customValues: yAxisLabelValues,
          formatter: (value) => {
            const number = Number(value);
            if (!Number.isFinite(number)) return "";
            const multiple = Math.round(number / 10) * 10;
            return Math.abs(number - multiple) < 0.000001 ? String(multiple) : "";
          }
        },
        splitLine: { lineStyle: { color: "#e1e4e7", width: 1 } }
      },
      dataZoom: entries.length > 1 ? [
        {
          type: "inside",
          xAxisIndex: [0],
          filterMode: "none",
          startValue,
          endValue,
          minValueSpan: timelineInfo.minimumZoomSpan,
          zoomOnMouseWheel: false,
          moveOnMouseMove: false,
          moveOnMouseWheel: false,
          preventDefaultMouseMove: false
        },
        {
          type: "slider",
          xAxisIndex: [0],
          filterMode: "none",
          startValue,
          endValue,
          minValueSpan: timelineInfo.minimumZoomSpan,
          height: 12,
          bottom: 8,
          showDetail: false,
          showDataShadow: false,
          brushSelect: false,
          borderColor: "#c9ced2",
          backgroundColor: "#f3f4f5",
          fillerColor: "#d8c09c",
          handleSize: "90%",
          handleStyle: { color: "#8b623d", borderColor: "#6f4c2f", borderWidth: 1 },
          moveHandleSize: 0
        }
      ] : [],
      series: [...lineSeries, {
        type: "line",
        name: "폼",
        data: chartData,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 8,
        cursor: "pointer",
        connectNulls: false,
        smooth: false,
        lineStyle: { color: "rgba(0, 0, 0, 0)", opacity: 0, width: 0 },
        // Hover emphasis on the points blurred the separate league-colored line series.
        // Keep the axis tooltip, but do not visually alter the chart on point hover.
        emphasis: { disabled: true },
        z: 4,
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
  }, [axisMax, axisMin, entries, isZoomable, maximumRating, showAllGames, timelineInfo, yAxisLabelValues]);

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
        chart.getZr().on("click", (event) => {
          const grid = chart.getModel().getComponent("grid")?.coordinateSystem?.getRect();
          if (!grid || event.offsetX < grid.x || event.offsetX > grid.x + grid.width) return;
          if (event.offsetY < grid.y || event.offsetY > grid.y + grid.height + 28) return;

          const axisValue = chart.convertFromPixel({ xAxisIndex: 0 }, event.offsetX);
          if (timelineInfo.useTimeScale) {
            if (Number(axisValue) < (timelineInfo.baselineTime + timelineInfo.times[0]) / 2) return;
            const nearest = entries.reduce((best, entry) => {
              const distance = Math.abs(Date.parse(`${entry.date}T00:00:00`) - Number(axisValue));
              return distance < best.distance ? { date: entry.date, distance } : best;
            }, { date: null, distance: Number.POSITIVE_INFINITY });
            if (nearest.date) setSelectedDate(nearest.date);
          } else {
            if (!isZoomable && Number(axisValue) < timelineInfo.plateAppearanceBaselineGap / 2) return;
            const index = entries.findIndex((entry) => entry.date === axisValue);
            const nearestIndex = index >= 0 ? index : isZoomable
              ? Math.round(Number(axisValue)) - 1
              : Math.round(Number(axisValue) - timelineInfo.plateAppearanceBaselineGap);
            if (entries[nearestIndex]?.date) setSelectedDate(entries[nearestIndex].date);
          }
        });

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
  }, [entries, isZoomable, timelineInfo.useTimeScale, viewMode]);

  useEffect(() => {
    chartOptionRef.current = chartOption;
    const chart = chartInstanceRef.current;
    if (chart) chart.setOption(chartOption, true);
  }, [chartOption]);

  return (
    <>
      <div className="detail-card-header rating-chart-header">
        <div className="rating-chart-title-group">
          <h3 id="rating-chart-title">폼 변화</h3>
          <div className="chart-league-legend" aria-label="그래프 색상 구분">
            <span><i className="chart-league-dot is-major" />1군</span>
            <span><i className="chart-league-dot is-minor" />2군</span>
          </div>
        </div>
        <div className="chart-toolbar">
          <div className="chart-mode-control" role="group" aria-label="폼 표시 단위">
            {CHART_MODES.map(([mode, label]) => (
              <button className={viewMode === mode ? "is-active" : ""} key={mode} type="button" onClick={() => setViewMode(mode)}>{label}</button>
            ))}
          </div>
          <div className="chart-zoom-control" role="group" aria-label="표시 기간">
            <button className={!showAllGames ? "is-active" : ""} type="button" onClick={() => setShowAllGames(false)}>{isZoomable ? "최근 1개월" : "최근 100타석"}</button>
            <button className={showAllGames ? "is-active" : ""} type="button" onClick={() => setShowAllGames(true)}>전체</button>
          </div>
        </div>
      </div>
      <div className="chart-shell">
      {entries.length ? (
        <div className="chart-scroller">
          <div className="chart-stage">
            <div
              className="rating-chart"
              ref={chartRef}
              role="img"
              aria-label={`${CHART_MODES.find(([mode]) => mode === viewMode)?.[1] ?? "경기별"} 폼 변화 그래프`}
            />
          </div>
        </div>
      ) : (
        <LoadingState>{CHART_MODES.find(([mode]) => mode === viewMode)?.[1] ?? "선택한"} 기록이 없습니다.</LoadingState>
      )}
      </div>
      <p className="chart-selection-hint">그래프에서 날짜를 클릭하면 해당 날짜의 타석 기록을 볼 수 있습니다.</p>
      {selectedDate && (
        <div className="chart-date-appearances">
          <div className="chart-date-appearances-header">
            <h4>{formatDate(selectedDate)} {isPitcherPlayer(player) ? "상대 타석" : "타석"} 기록 <span>{selectedAppearances.length}건</span></h4>
            <button type="button" onClick={() => setSelectedDate(null)} aria-label="선택한 날짜 닫기">닫기</button>
          </div>
          <PlateAppearanceTable appearances={selectedAppearances} maximumRating={selectedMaximumRating} player={player} />
        </div>
      )}
    </>
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

function GameContextCell({ entry, player }) {
  if (!entry?.gameId && !entry?.opponent) return <span>—</span>;
  const context = gameContextText(entry, player);
  return (
    <span className="game-context">
      <strong>vs. {context.opponent}</strong>
      {context.homeAway && <span>{context.homeAway}</span>}
    </span>
  );
}

function PlayerRecordDisclosure({ title, note, children, preview, hasMore = false, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasPreview = preview !== undefined;
  const classes = ["detail-card", "detail-disclosure", className].filter(Boolean).join(" ");

  if (hasPreview) {
    return (
      <section className={`${classes} detail-record-preview`}>
        <div className="detail-disclosure-summary is-static">
          <span className="detail-disclosure-title" role="heading" aria-level="3">{title}</span>
          <span className="detail-disclosure-note">{note}</span>
        </div>
        <div className="detail-disclosure-body">{isOpen ? children : preview}</div>
        {hasMore ? (
          <div className="detail-disclosure-actions">
            <button type="button" onClick={() => setIsOpen((current) => !current)}>
              {isOpen ? "최근 10개만 보기" : "전체 보기"}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <details
      className={classes}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="detail-disclosure-summary">
        <span className="detail-disclosure-title" role="heading" aria-level="3">{title}</span>
        <span className="detail-disclosure-note">{note}</span>
      </summary>
      {isOpen ? <div className="detail-disclosure-body">{children}</div> : null}
    </details>
  );
}

function RatingHistoryTable({ rows, maximumRating, columns, isPitcher, player }) {
  return (
    <div className="data-table-scroller">
      <table className="detail-table">
        <thead>
          <tr>
            <th scope="col" rowSpan="2">날짜</th>
            <th scope="col" rowSpan="2">리그</th>
            <th scope="col" rowSpan="2">경기</th>
            <th scope="col" rowSpan="2">폼</th>
            <th scope="col" rowSpan="2">변화</th>
            <th scope="col" colSpan={columns.length}>{isPitcher ? "투구 성적" : "타격 성적"}</th>
          </tr>
          <tr>{columns.map(([label]) => <th scope="col" key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => {
            const isMaximum = isSameRating(row.rating, maximumRating);
            return (
              <tr className={isMaximum ? "rating-history-max-row" : ""} key={row.key}>
                <td>{formatDate(row.date)}</td>
                <td className={recordLeagueCellClassName(row.league)}><span className="record-league">{gameLeagueLabel(row.league)}</span></td>
                <td><GameContextCell entry={row} player={player} /></td>
                <td className={`${ratingBand(row.rating)}${isMaximum ? " rating-history-max-rating" : ""}`}>{formatRating(row.rating)}</td>
                <td><Delta value={row.ratingDelta} /></td>
                {columns.map(([, key]) => <td key={key}>{formatPerformanceValue(row.performance?.[key])}</td>)}
              </tr>
            );
          }) : <tr><td colSpan={columns.length + 5}>표시할 경기 기록이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function RatingHistory({ ratings, player }) {
  const gameEntries = useMemo(() => buildGameEntries(ratings, sortAppearances(player), player), [ratings, player]);
  const rows = gameEntries.length
    ? gameEntries.slice().reverse()
    : ratings.map((snapshot, index) => ({
      key: `snapshot-${snapshot.date}-${index}`,
      date: snapshot.date,
      league: snapshot.league || null,
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
  const note = rows.length > 10 ? `최근 10개 표시 · 전체 ${rows.length}경기` : rows.length ? `${rows.length}경기` : "기록 없음";
  const tableProps = { maximumRating, columns, isPitcher, player };

  return (
    <PlayerRecordDisclosure
      title="경기 기록"
      note={note}
      preview={<RatingHistoryTable {...tableProps} rows={rows.slice(0, 10)} />}
      hasMore={rows.length > 10}
    >
      <RatingHistoryTable {...tableProps} rows={rows} />
    </PlayerRecordDisclosure>
  );
}

function PlateAppearanceTable({ appearances, maximumRating, player }) {
  const displayAppearances = appearances.map((appearance) => ({
    ...appearance,
    result: normalizePlateAppearanceResult(appearance.result)
  }));

  return (
    <div className="data-table-scroller">
      <table className="detail-table">
        <thead><tr><th scope="col">날짜</th><th scope="col">리그</th><th scope="col">경기</th><th scope="col">상대 선수</th><th scope="col">타순</th><th scope="col">타석 번호</th><th scope="col">결과</th><th scope="col">폼 전후</th><th scope="col">변화</th></tr></thead>
        <tbody>
          {displayAppearances.length ? displayAppearances.map((appearance) => {
            const before = toNumber(appearance.ratingBefore);
            const after = toNumber(appearance.ratingAfter);
            const ratingValue = after ?? before;
            const isMaximum = isSameRating(ratingValue, maximumRating);
            const effect = appearance.ratingEffect?.ratingDelta ?? appearance.ratingDelta ?? (before !== null && after !== null ? after - before : null);
            return (
              <tr className={isMaximum ? "rating-history-max-row" : ""} key={appearance.paId}>
                <td>{formatDate(appearance.date)}</td>
                <td className={recordLeagueCellClassName(appearance.league)}><span className="record-league">{gameLeagueLabel(appearance.league)}</span></td>
                <td><GameContextCell entry={appearance} player={player} /></td>
                <OpponentPlayerCell appearance={appearance} />
                <td>{appearance.battingOrder || "—"}번</td>
                <td>{appearance.plateAppearanceNumber || "—"}</td>
                <td>{appearance.result || "—"}</td>
                <td className={`${ratingBand(ratingValue)}${isMaximum ? " rating-history-max-rating" : ""}`}>{before !== null && after !== null ? `${formatRating(before)} → ${formatRating(after)}` : "—"}</td>
                <td><Delta value={effect} /></td>
              </tr>
            );
          }) : <tr><td colSpan="9">표시할 타석 기록이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function OpponentPlayerCell({ appearance }) {
  const name = opponentPlayerNameForAppearance(appearance);
  const playerId = opponentPlayerIdForAppearance(appearance);
  const href = playerId ? playerPageHref({ playerId }) : null;

  return (
    <td>
      {name ? (href ? <a className="player-link opponent-player-link" href={href}>{name}</a> : name) : "—"}
    </td>
  );
}

function PlateAppearances({ player }) {
  const appearances = [...(player.plateAppearances ?? [])].sort((a, b) => {
    const dateOrder = String(b.date ?? "").localeCompare(String(a.date ?? ""));
    if (dateOrder) return dateOrder;

    const gameOrder = String(b.gameId ?? "").localeCompare(String(a.gameId ?? ""));
    if (gameOrder) return gameOrder;

    const plateA = toNumber(a.plateAppearanceNumber) ?? 0;
    const plateB = toNumber(b.plateAppearanceNumber) ?? 0;
    return plateB - plateA || String(b.paId ?? "").localeCompare(String(a.paId ?? ""));
  });
  const appearanceRatings = appearances.map((appearance) => toNumber(appearance.ratingAfter) ?? toNumber(appearance.ratingBefore)).filter((value) => value !== null);
  const maximumRating = appearanceRatings.length ? Math.max(...appearanceRatings) : null;
  const title = isPitcherPlayer(player) ? "상대 타석 기록" : "타석 기록";
  const note = appearances.length > 10 ? `최근 10개 표시 · 전체 ${appearances.length}건` : appearances.length ? `${appearances.length}건` : "기록 없음";
  return (
    <PlayerRecordDisclosure
      title={title}
      note={note}
      preview={<PlateAppearanceTable appearances={appearances.slice(0, 10)} maximumRating={maximumRating} player={player} />}
      hasMore={appearances.length > 10}
    >
      <PlateAppearanceTable appearances={appearances} maximumRating={maximumRating} player={player} />
    </PlayerRecordDisclosure>
  );
}

function PlayerRatingChart({ ratings, player }) {
  return (
    <section className="detail-card rating-chart-card" aria-labelledby="rating-chart-title">
      <RatingChart ratings={ratings} player={player} />
    </section>
  );
}

const ROSTER_EVENT_LABELS = {
  call_up: "1군 등록",
  demotion: "1군 말소",
  registration: "등록",
  reinstatement: "복귀 등록",
  return: "복귀",
  return_from_rehab: "재활 복귀",
  injury_list: "부상자 명단",
  rehab_list: "치료·재활 명단",
  foreign_player_rehab: "외국인 재활 명단",
  trade: "이적",
  leave: "말소·이동",
  military_hold: "군 보류"
};

function rosterEventsFor(player) {
  const events = player?.rosterEvents ?? player?.rosterHistory ?? player?.registrationHistory ?? [];
  if (!Array.isArray(events)) return [];
  return events.slice().sort((a, b) => {
    const dateOrder = String(b.eventDate ?? b.date ?? "").localeCompare(String(a.eventDate ?? a.date ?? ""));
    if (dateOrder) return dateOrder;
    return String(b.eventId ?? b.id ?? "").localeCompare(String(a.eventId ?? a.id ?? ""));
  });
}

function rosterEventLabel(event) {
  const normalized = String(event?.eventTypeNormalized ?? event?.eventType ?? event?.type ?? "")
    .trim()
    .toLowerCase();
  return ROSTER_EVENT_LABELS[normalized]
    ?? event?.eventTypeRaw
    ?? event?.eventType
    ?? event?.type
    ?? "상태 변경";
}

function rosterComparisonKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function rosterTeamLabel(value) {
  const raw = String(value ?? "").trim().replace(/^team:/i, "");
  return raw ? fullTeamName(raw) : null;
}

function rosterLeagueLabel(value) {
  const normalized = rosterComparisonKey(value);
  if (!normalized) return null;
  if (["major", "1군", "kbo", "kbo리그"].includes(normalized)) return "1군";
  if (["futures", "2군", "퓨처스리그", "퓨쳐스리그"].includes(normalized)) return "2군";
  if (["residual", "잔류군"].includes(normalized)) return "잔류군";
  if (["released", "말소", "소속말소"].includes(normalized)) return "말소";
  return String(value ?? "").trim() || null;
}

function rosterLeagueTransition(fromValue, toValue) {
  const from = rosterLeagueLabel(fromValue);
  const to = rosterLeagueLabel(toValue);
  if (!to) return null;
  if (!from) return `None → ${to}`;
  if (rosterComparisonKey(from) === rosterComparisonKey(to)) return null;
  return `${from} → ${to}`;
}

function rosterTransition(fromValue, toValue, formatter) {
  const from = formatter(fromValue);
  const to = formatter(toValue);
  if (!from || !to || rosterComparisonKey(from) === rosterComparisonKey(to)) return null;
  return `${from} → ${to}`;
}

function rosterEventMovement(event) {
  const teamMovement = rosterTransition(
    event?.fromTeamName ?? event?.fromTeamCode ?? event?.fromTeamId ?? event?.from_team_id,
    event?.toTeamName ?? event?.toTeamCode ?? event?.toTeamId ?? event?.to_team_id,
    rosterTeamLabel
  );
  const leagueMovement = rosterLeagueTransition(event?.fromLeague, event?.toLeague);
  return [teamMovement, leagueMovement].filter(Boolean).join(" · ") || "—";
}

function isOfficialRosterEvent(event) {
  const origin = String(event?.eventOrigin ?? event?.origin ?? "").trim().toLowerCase();
  if (origin) return origin === "official";
  return event?.confirmed === true || event?.confirmed === 1 || event?.confirmed === "1";
}

function RosterHistory({ player }) {
  const events = rosterEventsFor(player);
  const currentMedicalStatus = medicalStatusText(player);
  const hasRosterEventData = [player?.rosterEvents, player?.rosterHistory, player?.registrationHistory]
    .some((value) => Array.isArray(value));
  const note = events.length ? `${events.length}건` : hasRosterEventData ? "이력 없음" : "기록 연결 대기";

  return (
    <section className="detail-card detail-disclosure roster-history-disclosure" aria-labelledby="roster-history-title">
      <div className="detail-disclosure-summary is-static roster-history-summary">
        <span className="detail-disclosure-title" id="roster-history-title">등록·말소·부상 기록</span>
        <span className="detail-disclosure-note">{note}</span>
      </div>
      <div className="detail-disclosure-body">
      {events.length ? (
        <div className="data-table-scroller">
          <table className="detail-table roster-history-table">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">구분</th>
                <th scope="col">이동 정보</th>
                <th scope="col">메모</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => (
                <tr
                  className={`roster-event-row ${isOfficialRosterEvent(event) ? "roster-event-row--official" : "roster-event-row--estimated"}`}
                  key={event.eventId ?? event.id ?? `${event.eventDate ?? event.date ?? "event"}-${index}`}
                >
                  <td>{formatDate(event.eventDate ?? event.date)}</td>
                  <td>{rosterEventLabel(event)}</td>
                  <td>{rosterEventMovement(event)}</td>
                  <td>{event.note ?? event.noteRaw ?? event.medicalNote ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="record-empty">
          {currentMedicalStatus
            ? `현재 상태: ${currentMedicalStatus}`
            : hasRosterEventData
              ? "등록·말소·부상 이력이 없습니다."
              : "등록·말소·부상 이력은 백엔드 API의 rosterEvents 연결 후 표시됩니다."}
        </p>
      )}
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
  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-content player-page-content">
        {error ? <LoadError>data/player_detail.json 파일과 데이터 접근 경로를 확인해 주세요.</LoadError> : player ? (
          <>
            <PlayerProfile player={player} ratings={ratings} />
            <PlayerRatingChart ratings={ratings} player={player} />
            <RosterHistory player={player} />
            <RatingHistory ratings={ratings} player={player} />
            <PlateAppearances player={player} />
          </>
        ) : <LoadingState>선수 데이터를 불러오는 중입니다.</LoadingState>}
      </main>
      <SiteFooter />
    </div>
  );
}

function App() {
  if (isPagePath("player")) return <PlayerPage />;
  if (isPagePath("diff")) return <DiffPage />;
  if (isPagePath("other")) return <OtherPage />;
  if (isPagePath("about") || isPagePath("release-note")) return <AboutPage />;
  return <HomePage />;
}

createRoot(document.getElementById("root")).render(<App />);
