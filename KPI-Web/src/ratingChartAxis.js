export function visibleLineRatings(points, start, end) {
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);
  const ratings = [];

  for (const point of points) {
    if (Number.isFinite(point.x) && Number.isFinite(point.rating) && point.x >= lower && point.x <= upper) {
      ratings.push(point.rating);
    }
  }

  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    if (!Number.isFinite(before.x) || !Number.isFinite(after.x)
      || !Number.isFinite(before.rating) || !Number.isFinite(after.rating)
      || before.x === after.x) continue;
    const segmentMin = Math.min(before.x, after.x);
    const segmentMax = Math.max(before.x, after.x);
    for (const edge of [lower, upper]) {
      if (edge > segmentMin && edge < segmentMax) {
        ratings.push(before.rating + (after.rating - before.rating) * (edge - before.x) / (after.x - before.x));
      }
    }
  }

  return ratings;
}

export function ratingAxisScale(ratings) {
  const values = ratings.filter(Number.isFinite);
  if (!values.length) return { min: 0, max: 100, interval: 10, labels: Array.from({ length: 11 }, (_, index) => index * 10) };

  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const spread = Math.max(observedMax - observedMin, 1);
  const min = observedMin >= 0
    ? Math.max(0, observedMin - Math.max(spread * 0.05, 0.5))
    : observedMin - Math.max(spread * 0.05, 0.5);
  const max = observedMax + Math.max(spread * 0.1, 0.5);
  const targetInterval = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(targetInterval));
  const normalized = targetInterval / magnitude;
  const interval = max - min >= 20 ? 10 : (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const labels = [];
  for (let tick = Math.ceil(min / interval); tick * interval <= max + 1e-9; tick += 1) {
    labels.push(Number((tick * interval).toFixed(4)));
  }
  return { min, max, interval, labels };
}
