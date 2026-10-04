function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function signedPoints(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded < 0 ? "−" : "+"}${Math.abs(rounded).toFixed(2)}점`;
}

export function initialRatingLines(initial) {
  const breakdown = initial?.breakdown;
  const fields = ["baseRating", "leagueAdjustment", "pitchingRoleAdjustment", "handAdjustment", "centeringAdjustment"];
  if (!breakdown || fields.some((key) => number(breakdown[key]) === null)) {
    const rating = number(initial?.rating);
    return rating === null ? ["초기 계산 근거가 없습니다."]
      : ["기준 50.0점", `총 보정 ${signedPoints(rating - 50)}`, "보정 상세는 제공되지 않습니다."];
  }
  const isPitcher = typeof initial.pitcherIsStarter === "boolean";
  const handLabel = isPitcher
    ? ({ L: "좌투", R: "우투", "?": "투구손 미상" }[breakdown.hand] ?? "투구손 미상")
    : ({ L: "좌타", R: "우타", S: "양타", "?": "타격손 미상" }[breakdown.hand] ?? "타격손 미상");
  return [
    `기준 ${Number(breakdown.baseRating).toFixed(1)}점`,
    `${initial.firstLeague || "첫 등장 리그"} ${signedPoints(Number(breakdown.leagueAdjustment))}`,
    ...(isPitcher ? [`${initial.pitcherIsStarter ? "선발" : "구원"} ${signedPoints(Number(breakdown.pitchingRoleAdjustment))}`] : []),
    `${handLabel} ${signedPoints(Number(breakdown.handAdjustment))}`,
    `평균 보정 ${signedPoints(Number(breakdown.centeringAdjustment))}`
  ];
}
