import assert from "node:assert/strict";
import { buildOtherStats, rankTeamsByMetric } from "../src/otherStats.js";

const ratings = { meta: { asOf: "2026-09-25", modelVersion: "test-model" }, sections: [{ league: "1군", teams: [{
  team: "kt",
  averages: { average18: 66, batter: 70, pitcher: 62 },
  batters: [
    { playerId: "b1", name: "가", rating: 71, rosterStatusReason: "아시안 게임 출전" },
    { playerId: "b2", name: "나", rating: 75, rosterStatusReason: "futures_appearance_recent" }
  ],
  pitchers: [{ playerId: "p1", name: "다", rating: 80, rosterStatusReason: "asian_games_assignment" }]
}] }] };
const latestDiff = { meta: { date: "2026-09-25", modelVersion: "test-model" }, sections: [{
  teams: [{ batters: [{ playerId: "b1", ratingDelta: 2 }], pitchers: [{ playerId: "p1", ratingDelta: 0 }] }]
}] };
const result = buildOtherStats(ratings, { teams: [{ rank: 1, team: "KT" }] }, latestDiff);
assert.equal(result.teams[0].leagueRank, 1);
assert.equal(result.teams[0].teamStrength, 66);
assert.deepEqual(result.batters.map((player) => player.name), ["나", "가"]);
assert.deepEqual(result.asianBatters.map((player) => player.name), ["가"]);
assert.deepEqual(result.asianPitchers.map((player) => player.name), ["다"]);
assert.equal(result.asianBatters[0].team, "KT");
assert.equal(result.pitchers[0].team, "KT");
assert.equal(result.pitchers[0].latestDateDelta, 0);
assert.equal(result.batters.find((player) => player.playerId === "b1").latestDateDelta, 2);
assert.equal(result.batters.find((player) => player.playerId === "b2").latestDateDelta, null);
assert.equal(buildOtherStats(ratings, null, { ...latestDiff, meta: { date: "2026-09-24", modelVersion: "test-model" } }).pitchers[0].latestDateDelta, null);
assert.equal(rankTeamsByMetric([{ team: "KT", teamStrength: 66 }, { team: "LG", teamStrength: 70 }], "teamStrength").get("LG"), 1);
console.log("Other stats transformation passed");
