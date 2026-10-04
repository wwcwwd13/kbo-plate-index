import assert from "node:assert/strict";
import { initialRatingLines } from "../src/initialRating.js";

const initial = {
  rating: 57.4633757485, firstLeague: "2군", pitcherIsStarter: true,
  breakdown: { baseRating: 50, leagueAdjustment: -5.4399863072, pitchingRoleAdjustment: 13.0888474716,
    handAdjustment: -0.1953841705, centeringAdjustment: 0.0098987546, hand: "L" }
};
assert.deepEqual(initialRatingLines(initial), ["기준 50.0점", "2군 −5.44점", "선발 +13.09점", "좌투 −0.20점", "평균 보정 +0.01점"]);
assert.deepEqual(initialRatingLines({ ...initial, firstLeague: "1군", pitcherIsStarter: false,
  breakdown: { ...initial.breakdown, leagueAdjustment: 4.66711, pitchingRoleAdjustment: 3.164306, handAdjustment: -0.093136, hand: "R" } }),
  ["기준 50.0점", "1군 +4.67점", "구원 +3.16점", "우투 −0.09점", "평균 보정 +0.01점"]);
assert.deepEqual(initialRatingLines({ ...initial, pitcherIsStarter: null, breakdown: { ...initial.breakdown, pitchingRoleAdjustment: 0, handAdjustment: 4.1716545, centeringAdjustment: -0.14838, hand: "S" } }),
  ["기준 50.0점", "2군 −5.44점", "양타 +4.17점", "평균 보정 −0.15점"]);
assert.deepEqual(initialRatingLines({ rating: 47.6 }), ["기준 50.0점", "총 보정 −2.40점", "보정 상세는 제공되지 않습니다."]);
assert.deepEqual(initialRatingLines(null), ["초기 계산 근거가 없습니다."]);
console.log("Initial rating display checks passed.");
