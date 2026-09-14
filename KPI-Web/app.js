const state = {
  league: "1군",
  data: null,
  selectedTeam: null,
  chart: null,
};

const $ = (selector) => document.querySelector(selector);

function formatScore(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—";
}

function formatDelta(value) {
  if (!Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

function currentTeams() {
  return state.data?.leagues?.[state.league] ?? [];
}

function renderSummary(teams) {
  $("#team-count").textContent = teams.length ? `${teams.length}개` : "—";
  const scores = teams.map((team) => Number(team.rating)).filter(Number.isFinite);
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  $("#league-average").textContent = average == null ? "—" : formatScore(average);
  $("#selected-team").textContent = state.selectedTeam?.team ?? "—";
  $("#selected-team-rating").textContent = state.selectedTeam
    ? `KPI ${formatScore(state.selectedTeam.rating)}`
    : "행을 선택하면 추이를 봅니다";
}

function renderTable(teams) {
  const body = $("#team-table-body");
  if (!teams.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="4">표시할 구단 데이터가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = teams.map((team, index) => {
    const selected = state.selectedTeam?.team === team.team ? " is-selected" : "";
    const delta = Number(team.delta);
    const deltaClass = Number.isFinite(delta) ? (delta >= 0 ? "delta-positive" : "delta-negative") : "";
    return `
      <tr data-team="${team.team}" class="${selected}">
        <td class="col-rank">${team.rank ?? index + 1}</td>
        <td>${team.team}</td>
        <td class="numeric score">${formatScore(team.rating)}</td>
        <td class="numeric ${deltaClass}">${formatDelta(team.delta)}</td>
      </tr>`;
  }).join("");

  body.querySelectorAll("tr[data-team]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedTeam = teams.find((team) => team.team === row.dataset.team) ?? null;
      renderSummary(teams);
      renderTable(teams);
      renderChart();
    });
  });
}

function renderChart() {
  const chartElement = $("#rating-chart");
  const empty = $("#chart-empty");
  if (!window.echarts || !state.selectedTeam?.history?.length) {
    empty.hidden = false;
    if (state.chart) state.chart.clear();
    return;
  }

  empty.hidden = true;
  state.chart ??= window.echarts.init(chartElement);
  const history = state.selectedTeam.history;
  state.chart.setOption({
    animation: false,
    grid: { left: 48, right: 24, top: 24, bottom: 36 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: history.map((point) => point.date), axisLabel: { color: "#8fa3ab" }, axisLine: { lineStyle: { color: "#33434c" } } },
    yAxis: { type: "value", scale: true, axisLabel: { color: "#8fa3ab" }, splitLine: { lineStyle: { color: "rgba(215,230,238,0.08)" } } },
    series: [{ type: "line", smooth: true, symbol: "circle", symbolSize: 6, data: history.map((point) => point.rating), lineStyle: { width: 3, color: "#8ee6bd" }, itemStyle: { color: "#8ee6bd" }, areaStyle: { color: "rgba(142,230,189,0.10)" } }],
  });
}

function render() {
  const teams = currentTeams();
  if (!state.selectedTeam || !teams.some((team) => team.team === state.selectedTeam.team)) {
    state.selectedTeam = teams[0] ?? null;
  }
  $("#as-of-date").textContent = state.data?.asOf ?? "데이터 연결 준비 중";
  $("#chart-title").textContent = state.selectedTeam ? `${state.selectedTeam.team} Rating 흐름` : "Rating 흐름";
  renderSummary(teams);
  renderTable(teams);
  renderChart();
}

function bindControls() {
  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.league = button.dataset.league;
      document.querySelectorAll(".segment").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      render();
    });
  });
  window.addEventListener("resize", () => state.chart?.resize());
}

async function loadData() {
  try {
    const response = await fetch("./data/team_ratings.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
  } catch (error) {
    console.warn("KPI data is not connected yet.", error);
    state.data = { asOf: "데이터 연결 준비 중", leagues: { "1군": [], "2군": [] } };
  }
  render();
}

bindControls();
loadData();
