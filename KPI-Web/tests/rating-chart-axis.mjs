import assert from "node:assert/strict";
import { ratingAxisScale, visibleLineRatings } from "../src/ratingChartAxis.js";

const points = [
  { x: 0, rating: 50 },
  { x: 10, rating: 60 },
  { x: 20, rating: 90 },
  { x: 30, rating: 55 }
];

const zoomedRatings = visibleLineRatings(points, 0, 10);
assert.deepEqual(zoomedRatings, [50, 60]);
assert.ok(ratingAxisScale(zoomedRatings).max < 90);

const lineOnlyRatings = visibleLineRatings(points, 2, 4);
assert.deepEqual(lineOnlyRatings, [52, 54]);
assert.ok(ratingAxisScale(lineOnlyRatings).min < 52);

const narrowScale = ratingAxisScale([60.8]);
assert.ok(narrowScale.min < 60.8 && narrowScale.max > 60.8);
assert.ok(narrowScale.labels.length > 0);
assert.ok(narrowScale.interval < 10);

console.log("Visible rating chart axis passed");
