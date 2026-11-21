const TEAM_ALIASES = {
  lg: "LG", hh: "한화", ss: "삼성", ssg: "SSG", nc: "NC",
  kt: "KT", ob: "두산", lt: "롯데", kia: "KIA", wo: "키움"
};
const KBO_CLUBS = new Set(Object.values(TEAM_ALIASES));
// KBO Trade.aspx lists this release as a free-agent announcement.
// The archived API omits the date for that event type.
const ARCHIVED_2026_RELEASE_DATES = new Map([
  ["player:kbo:55322:pitcher", "2026-06-25"]
]);

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

function archiveTeamStrength(sections, rankByTeam) {
  const rosters = new Map([...rankByTeam.keys()].map((team) => [
    team, { batters: new Map(), pitchers: new Map() }
  ]));
  for (const section of sections) {
    if (String(section.league).replace(/\s/g, "") === "소속말소") continue;
    for (const team of section.teams ?? []) {
      const key = teamKey(team.team ?? team.teamName);
      const roster = rosters.get(key === "고양" ? "키움" : key);
      if (!roster) continue;
      for (const role of ["batters", "pitchers"]) {
        for (const player of team[role] ?? []) {
          if (!player.playerId || player.rating == null || !Number.isFinite(Number(player.rating))) continue;
          if (!roster[role].has(player.playerId)) roster[role].set(player.playerId, Number(player.rating));
        }
      }
    }
  }
  const topNineMean = (ratings) => {
    const top = [...ratings.values()].sort((a, b) => b - a).slice(0, 9);
    return top.length ? top.reduce((sum, rating) => sum + rating, 0) / top.length : null;
  };
  return [...rosters].map(([team, roster]) => {
    const batterStrength = topNineMean(roster.batters);
    const pitcherStrength = topNineMean(roster.pitchers);
    return {
      team, leagueRank: rankByTeam.get(team), batterStrength, pitcherStrength,
      teamStrength: batterStrength == null || pitcherStrength == null
        ? null : (batterStrength + pitcherStrength) / 2
    };
  });
}

export function buildOtherStats(data, standings, latestDiff, { archived = false } = {}) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const major = sections.find((section) => section.league === "1군");
  const rankByTeam = new Map((standings?.teams ?? []).map((entry) => [teamKey(entry.team), entry.rank]));
  const teams = archived ? archiveTeamStrength(sections, rankByTeam) : (major?.teams ?? []).map((team) => ({
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
  const dailyPlayers = new Map();
  if (matchingDiff) {
    for (const section of latestDiff.sections ?? []) {
      for (const team of section.teams ?? []) {
        for (const player of [...(team.batters ?? []), ...(team.pitchers ?? [])]) {
          if (player.playerId) dailyPlayers.set(player.playerId, player);
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
            rosterSection: section.league,
            releaseDate: player.releaseDate ?? (
              archived && section.league === "소속 말소" && data?.meta?.asOf?.startsWith("2026-")
                ? ARCHIVED_2026_RELEASE_DATES.get(player.playerId) ?? null
                : null
            ),
            team: teamKey(team.team ?? team.teamName),
            latestDateDelta: dailyPlayers.get(player.playerId)?.ratingDelta ?? null,
            latestDateDiff: dailyPlayers.get(player.playerId) ?? null
          });
        }
      }
    }
  }
  const all = [...players.values()];
  const byRole = (role, filter = () => true) => all.filter((player) => player.role === role && filter(player)).sort(ratingOrder);
  const international = all.filter((player) => {
    const club = player.team === "고양" ? "키움" : player.team;
    return KBO_CLUBS.has(club) && player.rating != null && Number.isFinite(Number(player.rating));
  }).sort(ratingOrder);
  return {
    teams,
    batters: byRole("batter").slice(0, 50),
    pitchers: byRole("pitcher").slice(0, 50),
    foreignPitchers: international.filter((player) => player.contractType === "자유선발" && player.role === "pitcher"),
    foreignBatters: international.filter((player) => player.contractType === "자유선발" && player.role === "batter"),
    asiaQuota: international.filter((player) => player.contractType === "아시아쿼터")
  };
}

export function buildLineupPools(data) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const major = sections.find((section) => section.league === "1군");
  const pools = new Map((major?.teams ?? []).map((team) => [teamKey(team.team), {
    team: teamKey(team.team), batters: new Map(), pitchers: new Map(), latestLineup: team.latestLineup ?? null
  }]));

  for (const section of sections) {
    for (const team of section.teams ?? []) {
      const pool = pools.get(teamKey(team.team));
      if (!pool) continue;
      for (const [source, target] of [["batters", pool.batters], ["pitchers", pool.pitchers]]) {
        for (const player of team[source] ?? []) {
          if (!player.playerId || target.has(player.playerId)) continue;
          target.set(player.playerId, { ...player, league: section.league });
        }
      }
    }
  }

  return [...pools.values()].map((pool) => ({
    team: pool.team,
    latestLineup: pool.latestLineup,
    batters: [...pool.batters.values()].sort((a, b) => (a.league === "1군" ? 0 : 1) - (b.league === "1군" ? 0 : 1) || a.name.localeCompare(b.name, "ko")),
    pitchers: [...pool.pitchers.values()].sort((a, b) => (a.league === "1군" ? 0 : 1) - (b.league === "1군" ? 0 : 1) || a.name.localeCompare(b.name, "ko"))
  }));
}

export function lineupWeightedRating(batterRatings, pitcherRating) {
  if (batterRatings.length !== 9 || batterRatings.some((rating) => rating == null || !Number.isFinite(Number(rating)))
    || pitcherRating == null || !Number.isFinite(Number(pitcherRating))) return null;
  return (batterRatings.reduce((sum, rating) => sum + Number(rating), 0) + 6 * Number(pitcherRating)) / 15;
}

export function moveLineupBatter(batters, fromIndex, toIndex) {
  if (fromIndex < 0 || fromIndex >= batters.length || toIndex < 0 || toIndex >= batters.length || fromIndex === toIndex) return batters;
  const reordered = [...batters];
  reordered.splice(toIndex, 0, reordered.splice(fromIndex, 1)[0]);
  return reordered;
}
