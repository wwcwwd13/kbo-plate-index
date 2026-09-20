function isDirectoryPagePath() {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  return /\/(?:player|diff)\/(?:index\.html)?$/.test(pathname);
}

function staticDataPath(fileName) {
  return `${isDirectoryPagePath() ? "../" : "./"}${fileName}`;
}

const DATA_PATHS = {
  teamRatings: staticDataPath("sheet_reference.json"),
  playerDetail: staticDataPath("player_detail.json")
};

function isLocalHost() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function configuredApiBase() {
  return String(import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

function resolveApiAssetUrl(value, apiBase) {
  const url = String(value ?? "").trim();
  if (!url || !apiBase || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return url;
  return url.startsWith("/") ? `${apiBase}${url}` : `${apiBase}/${url}`;
}

function attachApiAssetUrls(data, apiBase) {
  const player = data?.player;
  if (!player?.imageUrl) return data;
  return {
    ...data,
    player: {
      ...player,
      imageUrl: resolveApiAssetUrl(player.imageUrl, apiBase)
    }
  };
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

export async function fetchTeamRatings() {
  const apiBase = configuredApiBase();

  if (!isLocalHost() && !apiBase) {
    throw new Error("KPI API is not configured");
  }

  if (isLocalHost() || apiBase) {
    try {
      return await fetchJson(`${apiBase}/api/team-ratings`);
    } catch (error) {
      // Local development can continue with the reference table while the API starts.
      if (!isLocalHost()) throw error;
    }
  }

  const data = await fetchJson(DATA_PATHS.teamRatings);

  try {
    const linkMap = await fetchJson("/api/players/link-map");
    return attachPlayerIds(data, linkMap);
  } catch (error) {
    // Keep the static table available when the API is not running yet.
    return data;
  }
}

export async function fetchRatingDiffDates() {
  const apiBase = configuredApiBase();
  if (!isLocalHost() && !apiBase) throw new Error("KPI API is not configured");
  return fetchJson(`${apiBase}/api/rating-diff-dates`);
}

export async function fetchRatingDiff(date) {
  const apiBase = configuredApiBase();
  if (!isLocalHost() && !apiBase) throw new Error("KPI API is not configured");
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return fetchJson(`${apiBase}/api/rating-diffs${query}`);
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function attachPlayerIds(data, linkMap) {
  const candidates = Array.isArray(linkMap) ? linkMap : [];
  const used = new Set();

  const findPlayer = (player, team, league, role) => {
    const name = normalize(player.name);
    const teamCode = normalize(team.team);
    const desiredLeague = normalize(league);
    const desiredRole = role === "batters" ? "batter" : "pitcher";
    const sameTeam = (candidate) => normalize(candidate.teamCode) === teamCode || normalize(candidate.teamName) === teamCode;
    const matches = candidates.filter((candidate) =>
      normalize(candidate.name) === name &&
      candidate.role === desiredRole &&
      sameTeam(candidate) &&
      normalize(candidate.league) === desiredLeague
    );

    const teamRoleMatches = matches.length ? matches : candidates.filter((candidate) =>
      normalize(candidate.name) === name &&
      candidate.role === desiredRole &&
      sameTeam(candidate)
    );

    let match = teamRoleMatches.length === 1 ? teamRoleMatches[0] : null;
    if (!match && teamRoleMatches.length > 1) {
      const targetRating = numeric(player.rating);
      const ranked = teamRoleMatches
        .map((candidate) => ({ candidate, distance: targetRating === null || numeric(candidate.latestRating) === null ? null : Math.abs(numeric(candidate.latestRating) - targetRating) }))
        .filter((entry) => entry.distance !== null)
        .sort((a, b) => a.distance - b.distance);
      if (ranked.length === 1 || (ranked.length > 1 && ranked[0].distance < ranked[1].distance)) match = ranked[0].candidate;
    }
    if (!match || used.has(match.playerId)) return player;
    used.add(match.playerId);
    return { ...player, playerId: match.playerId };
  };

  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      teams: section.teams.map((team) => ({
        ...team,
        batters: team.batters.map((player) => findPlayer(player, team, section.league, "batters")),
        pitchers: team.pitchers.map((player) => findPlayer(player, team, section.league, "pitchers"))
      }))
    }))
  };
}

export async function fetchPlayerDetail(playerId) {
  const apiBase = configuredApiBase();
  const canUseApi = isLocalHost() || apiBase;
  if (!canUseApi) return fetchJson(DATA_PATHS.playerDetail);

  const query = new URLSearchParams({ player_id: playerId }).toString();
  try {
    const data = await fetchJson(`${apiBase}/api/player?${query}`);
    return attachApiAssetUrls(data, apiBase);
  } catch (error) {
    // Keep the static fixture available when the API is not running yet.
    return fetchJson(DATA_PATHS.playerDetail);
  }
}
