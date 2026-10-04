const STORAGE_KEY = "kpi-rating-model";

export function selectedRatingModel(location = window.location, storage) {
  const query = new URLSearchParams(location.search).get("rating_model");
  if (query === "v3" || query === "v4") return query;
  try { if ((storage ?? window.localStorage).getItem(STORAGE_KEY) === "v3") return "v3"; } catch {}
  return "v4";
}

export function ratingModelHref(href, model = selectedRatingModel()) {
  const [address, hash] = href.split("#");
  const [path, query = ""] = address.split("?");
  const params = new URLSearchParams(query);
  params.set("rating_model", model);
  return `${path}?${params}${hash === undefined ? "" : `#${hash}`}`;
}

export function switchRatingModel(model) {
  if (model !== "v3" && model !== "v4") throw new Error("Unknown rating model");
  try { window.localStorage.setItem(STORAGE_KEY, model); } catch {}
  // Reload replaces all model-dependent state together, including in-flight requests.
  window.location.assign(ratingModelHref(window.location.href, model));
}
