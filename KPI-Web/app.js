const state = {
  data: null
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatRating(value) {
  const number = toNumber(value);
  return number === null ? "—" : number.toFixed(1);
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

function renderPlayerName(player) {
  if (!player) return '<td class="name-cell empty-cell" aria-label="선수 없음"></td>';
  const grayClass = player.gray ? " is-gray" : "";
  return '<td class="name-cell' + grayClass + '" title="' + escapeHtml(player.name) + '">' + escapeHtml(player.name) + "</td>";
}

function renderPlayerRating(player) {
  if (!player) return '<td class="rating-cell empty-cell" aria-label="Rating 없음"></td>';
  return '<td class="rating-cell ' + ratingBand(player.rating) + '">' + formatRating(player.rating) + "</td>";
}

function renderTeamHeader(teams, league) {
  const teamCells = teams
    .map((team) => '<th colspan="4" scope="colgroup">' + escapeHtml(team.team) + "</th>")
    .join("");
  const leagueCells = teams
    .map(() => '<th colspan="4">' + escapeHtml(league) + "</th>")
    .join("");
  const roleCells = teams
    .map(() => '<th colspan="2">타자</th><th colspan="2">투수</th>')
    .join("");
  const fieldCells = teams
    .map(() => '<th>이름</th><th>Rating</th><th>이름</th><th>Rating</th>')
    .join("");

  return (
    "<thead>" +
    '<tr class="team-row">' + teamCells + "</tr>" +
    '<tr class="league-row">' + leagueCells + "</tr>" +
    '<tr class="role-row">' + roleCells + "</tr>" +
    '<tr class="field-row">' + fieldCells + "</tr>" +
    "</thead>"
  );
}

function renderTeamColumns(teams) {
  return teams
    .map(() => '<col class="name-column"><col class="rating-column"><col class="name-column"><col class="rating-column">')
    .join("");
}

function renderAverageRow(teams) {
  if (!teams.length || teams[0].league !== "1군") return "";

  const batterValues = teams.map((team) => team.averages?.batter);
  const pitcherValues = teams.map((team) => team.averages?.pitcher);
  const cells = teams.map((team) => {
    const batter = team.averages?.batter;
    const pitcher = team.averages?.pitcher;
    const batterClass = averageBand(batter, batterValues);
    const pitcherClass = averageBand(pitcher, pitcherValues);
    return (
      '<td class="average-label ' + batterClass + '">9명 평균</td>' +
      '<td class="average-value ' + batterClass + '">' + formatRating(batter) + "</td>" +
      '<td class="average-label ' + pitcherClass + '">9명 평균</td>' +
      '<td class="average-value ' + pitcherClass + '">' + formatRating(pitcher) + "</td>"
    );
  }).join("");

  return '<tr class="average-row">' + cells + "</tr>";
}

function renderBody(teams) {
  const rowCount = Math.max(
    1,
    ...teams.map((team) => Math.max(team.batters?.length || 0, team.pitchers?.length || 0))
  );

  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const cells = teams.map((team) => {
      const batter = team.batters?.[rowIndex] ?? null;
      const pitcher = team.pitchers?.[rowIndex] ?? null;
      return renderPlayerName(batter) + renderPlayerRating(batter) + renderPlayerName(pitcher) + renderPlayerRating(pitcher);
    }).join("");
    return "<tr>" + cells + "</tr>";
  }).join("");

  return rows + renderAverageRow(teams);
}

function renderSection(section, index) {
  const teams = section.teams ?? [];
  if (!teams.length) return "";

  return (
    '<section class="rating-section' + (index ? " is-secondary" : "") + '" aria-labelledby="section-title-' + index + '">' +
      '<div class="section-heading">' +
        '<h3 id="section-title-' + index + '">' + escapeHtml(section.league) + "</h3>" +
        "<span>" + teams.length + "개 구단</span>" +
      "</div>" +
      '<div class="matrix-scroller">' +
        '<table class="rating-matrix" aria-describedby="section-title-' + index + '">' +
          '<colgroup>' + renderTeamColumns(teams) + "</colgroup>" +
          renderTeamHeader(teams, section.league) +
          "<tbody>" + renderBody(teams) + "</tbody>" +
        "</table>" +
      "</div>" +
    "</section>"
  );
}

function render() {
  const sections = state.data?.sections ?? [];
  $("#rating-sections").innerHTML = sections.map(renderSection).join("");
  $("#last-updated").textContent = state.data?.meta?.asOf
    ? state.data.meta.asOf + " 기준"
    : "최신 데이터";
}

async function loadData() {
  try {
    const response = await fetch("./data/sheet_reference.json", { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    state.data = await response.json();
    render();
  } catch (error) {
    console.error("KPI reference data load failed", error);
    $("#last-updated").textContent = "데이터 연결 필요";
    $("#rating-sections").innerHTML =
      '<div class="error-state"><strong>표 데이터를 불러오지 못했습니다.</strong><span>data/sheet_reference.json 파일을 확인해 주세요.</span></div>';
  }
}

loadData();
