import { readFile, writeFile } from "node:fs/promises";

const apiUrl = process.env.KPI_API_URL || "http://127.0.0.1:5050";
const dataPath = new URL("../data/sheet_reference.json", import.meta.url);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chooseMatch(player, team, league, role, candidates, used) {
  const name = normalize(player.name);
  const teamValue = normalize(team.team);
  const desiredLeague = normalize(league);
  const desiredRole = role === "batters" ? "batter" : "pitcher";
  const sameTeam = (candidate) =>
    normalize(candidate.teamCode) === teamValue || normalize(candidate.teamName) === teamValue;
  const sameNameAndRole = (candidate) =>
    normalize(candidate.name) === name && candidate.role === desiredRole && sameTeam(candidate);

  const exactMatches = candidates.filter(
    (candidate) => sameNameAndRole(candidate) && normalize(candidate.league) === desiredLeague,
  );
  const teamRoleMatches = exactMatches.length ? exactMatches : candidates.filter(sameNameAndRole);

  let match = teamRoleMatches.length === 1 ? teamRoleMatches[0] : null;
  if (!match && teamRoleMatches.length > 1) {
    const targetRating = numeric(player.rating);
    const ranked = teamRoleMatches
      .map((candidate) => ({
        candidate,
        distance:
          targetRating === null || numeric(candidate.latestRating) === null
            ? null
            : Math.abs(numeric(candidate.latestRating) - targetRating),
      }))
      .filter((entry) => entry.distance !== null)
      .sort((a, b) => a.distance - b.distance);

    if (
      ranked.length === 1 ||
      (ranked.length > 1 && ranked[0].distance < ranked[1].distance)
    ) {
      match = ranked[0].candidate;
    }
  }

  if (!match || used.has(match.playerId)) return null;
  used.add(match.playerId);
  return match;
}

const data = JSON.parse(await readFile(dataPath, "utf8"));
const response = await fetch(`${apiUrl}/api/players/link-map`);
if (!response.ok) throw new Error(`Could not load player link map: HTTP ${response.status}`);
const candidates = await response.json();
const used = new Set();
let total = 0;
let matched = 0;
const unmatched = [];

for (const section of data.sections ?? []) {
  for (const team of section.teams ?? []) {
    for (const role of ["batters", "pitchers"]) {
      for (const player of team[role] ?? []) {
        total += 1;
        const match = chooseMatch(player, team, section.league, role, candidates, used);
        if (match) {
          player.playerId = match.playerId;
          matched += 1;
        } else {
          delete player.playerId;
          unmatched.push(`${section.league}/${team.team}/${role}/${player.name}`);
        }
      }
    }
  }
}

await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Enriched ${matched}/${total} players.`);
if (unmatched.length) {
  console.log("Unmatched players:");
  for (const player of unmatched) console.log(`- ${player}`);
}
