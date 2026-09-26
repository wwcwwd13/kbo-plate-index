const TEAM_ALIASES = {
  lg: "LG", hh: "한화", ss: "삼성", ssg: "SSG", nc: "NC",
  kt: "KT", ob: "두산", lt: "롯데", kia: "KIA", wo: "키움"
};

export function teamKey(value) {
  const key = String(value ?? "").trim().toLowerCase();
  return TEAM_ALIASES[key] ?? String(value ?? "").trim();
}

export function ratingOrder(a, b) {
  return Number(b.rating ?? -Infinity) - Number(a.rating ?? -Infinity)
    || String(a.name).localeCompare(String(b.name), "ko");
}

export function rankTeamsByMetric(teams, key) {
  return new Map([...teams]
    .filter((team) => team[key] != null && Number.isFinite(Number(team[key])))
    .sort((a, b) => Number(b[key]) - Number(a[key]) || a.team.localeCompare(b.team, "ko"))
    .map((team, index) => [team.team, index + 1]));
}

function isAsianGamesAssignment(player) {
  const reason = String(player?.rosterStatusReason ?? "").trim().toLowerCase().replace(/\s+/g, "");
  return ["아시안게임출전", "asian_games_assignment"].includes(reason);
}

export function buildOtherStats(data, standings, latestDiff) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const major = sections.find((section) => section.league === "1군");
  const rankByTeam = new Map((standings?.teams ?? []).map((entry) => [teamKey(entry.team), entry.rank]));
  const teams = (major?.teams ?? []).map((team) => ({
    team: teamKey(team.team),
    leagueRank: rankByTeam.get(teamKey(team.team)) ?? null,
    teamStrength: team.averages?.average18 ?? null,
    batterStrength: team.averages?.batter ?? null,
    pitcherStrength: team.averages?.pitcher ?? null
  }));

  const players = new Map();
  const latestDate = latestDiff?.meta?.date ?? null;
  const matchingDiff = latestDate === data?.meta?.asOf
    && latestDiff?.meta?.modelVersion === data?.meta?.modelVersion;
  const deltas = new Map();
  if (matchingDiff) {
    for (const section of latestDiff.sections ?? []) {
      for (const team of section.teams ?? []) {
        for (const player of [...(team.batters ?? []), ...(team.pitchers ?? [])]) {
          if (player.playerId) deltas.set(player.playerId, player.ratingDelta);
        }
      }
    }
  }
  for (const section of sections) {
    for (const team of section.teams ?? []) {
      for (const [role, roster] of [["batter", team.batters], ["pitcher", team.pitchers]]) {
        for (const player of roster ?? []) {
          if (!player.playerId || players.has(player.playerId)) continue;
          players.set(player.playerId, {
            ...player,
            role,
            team: teamKey(team.team ?? team.teamName),
            latestDateDelta: deltas.has(player.playerId) ? deltas.get(player.playerId) : null
          });
        }
      }
    }
  }
  const all = [...players.values()];
  const byRole = (role, filter = () => true) => all.filter((player) => player.role === role && filter(player)).sort(ratingOrder);
  return {
    teams,
    asianBatters: byRole("batter", isAsianGamesAssignment),
    asianPitchers: byRole("pitcher", isAsianGamesAssignment),
    batters: byRole("batter").slice(0, 50),
    pitchers: byRole("pitcher").slice(0, 50)
  };
}
