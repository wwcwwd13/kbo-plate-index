import { selectedSeason } from "./season";
import { selectedRatingModel } from "./ratingModel";

export const OPENING_PREVIEW_MODEL = "kpi-v4.2-2027-opening-preview";

function apiPath(route, params = {}, season = selectedSeason()) {
  return `${configuredApiBase(season)}${route}?${new URLSearchParams({ ...params, rating_model: selectedRatingModel() })}`;
}

export async function fetchRatingModels() {
  return fetchJson(`${configuredApiBase()}/api/rating-models`);
}

function isDirectoryPagePath() {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  return /\/(?:player|team|diff|other)\/(?:index\.html)?$/.test(pathname);
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

function configuredApiBase(season = selectedSeason()) {
  const archiveBase = import.meta.env.VITE_API_2026_BASE_URL ?? import.meta.env.VITE_API_BASE_URL;
  const base = season === "2027"
    ? (import.meta.env.VITE_API_2027_BASE_URL || (isLocalHost() ? "/season-2027"
      : archiveBase?.trim() ? `${archiveBase.trim().replace(/\/$/, "")}/season-2027` : ""))
    : archiveBase;
  return String(base ?? "").trim().replace(/\/$/, "");
}

export function isSeasonAwaitingApi() {
  return selectedSeason() === "2027" && !configuredApiBase();
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
  // Revalidate stored responses so unchanged JSON can use an empty 304 reply.
  // The browser merges that reply with its cached body automatically.
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

export async function fetch2026FinalStandings() {
  const data = await fetchJson(staticDataPath("final-standings-2026.json"));
  if (data.season !== 2026 || !Array.isArray(data.teams) || data.teams.length !== 10) {
    throw new Error("2026 final standings are unavailable");
  }
  return [...data.teams].sort((a, b) => a.rank - b.rank);
}

export async function fetchTeamArchive2026() {
  const [standings, games] = await Promise.all([
    fetchJson(staticDataPath("final-standings-2026.json")),
    fetchJson(staticDataPath("team-games-2026.json"))
  ]);
  return { standings, ...games };
}

export async function fetchTeamRatings(season = selectedSeason()) {
  const apiBase = configuredApiBase(season);
  if (season === "2027" && !apiBase) return { sections: [] };

  if (!isLocalHost() && !apiBase) {
    throw new Error("KPI API is not configured");
  }

  if (isLocalHost() || apiBase) {
    try {
      return await fetchJson(apiPath("/api/team-ratings", {}, season));
    } catch (error) {
      // Local development can continue with the reference table while the API starts.
      if (!isLocalHost() || selectedRatingModel() !== "v4") throw error;
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

export async function fetchOtherStats() {
  const [ratings, standings, latestDiff] = await Promise.all([
    fetchTeamRatings(),
    selectedSeason() === "2027" ? { teams: [] } : fetchJson(staticDataPath("final-standings-2026.json")),
    fetchRatingDiff()
  ]);
  // The preview inherits the last roster state without copying its event history.
  const archiveRatings = ratings.meta?.modelVersion === OPENING_PREVIEW_MODEL
    ? await fetchTeamRatings("2026").catch(() => null)
    : null;
  return { ratings, standings, latestDiff, archiveRatings };
}

export async function fetchRatingDiffDates() {
  if (isSeasonAwaitingApi()) return { latest: null, dates: [] };
  const apiBase = configuredApiBase();
  if (!isLocalHost() && !apiBase) throw new Error("KPI API is not configured");
  return fetchJson(apiPath("/api/rating-diff-dates"));
}

export async function fetchRatingDiff(date) {
  if (isSeasonAwaitingApi()) return { meta: { date: null, hasGames: false }, sections: [] };
  const apiBase = configuredApiBase();
  if (!isLocalHost() && !apiBase) throw new Error("KPI API is not configured");
  return fetchJson(apiPath("/api/rating-diffs", date ? { date } : {}));
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
  if (isSeasonAwaitingApi()) return { player: null };
  const apiBase = configuredApiBase();
  const canUseApi = isLocalHost() || apiBase;
  if (!canUseApi) return fetchJson(DATA_PATHS.playerDetail);

  try {
    const data = await fetchJson(apiPath("/api/player", { player_id: playerId }));
    return attachApiAssetUrls(data, apiBase);
  } catch (error) {
    if (!isLocalHost() || selectedRatingModel() !== "v4") throw error;
    // Keep the static fixture available when the API is not running yet.
    return fetchJson(DATA_PATHS.playerDetail);
  }
}
