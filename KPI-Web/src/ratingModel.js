const STORAGE_KEY = "kpi-rating-model";
const MODELS = ["v3", "v4", "v4.1"];

export function selectedRatingModel(location = window.location, storage) {
  const query = new URLSearchParams(location.search).get("rating_model");
  if (MODELS.includes(query)) return query;
  try {
    const saved = (storage ?? window.localStorage).getItem(STORAGE_KEY);
    if (MODELS.includes(saved)) return saved;
  } catch {}
  return "v4.1";
}

export function ratingModelHref(href, model = selectedRatingModel()) {
  const [address, hash] = href.split("#");
  const [path, query = ""] = address.split("?");
  const params = new URLSearchParams(query);
  params.set("rating_model", model);
  return `${path}?${params}${hash === undefined ? "" : `#${hash}`}`;
}

export function switchRatingModel(model) {
  if (!MODELS.includes(model)) throw new Error("Unknown rating model");
  try { window.localStorage.setItem(STORAGE_KEY, model); } catch {}
  // Reload replaces all model-dependent state together, including in-flight requests.
  window.location.assign(ratingModelHref(window.location.href, model));
}
