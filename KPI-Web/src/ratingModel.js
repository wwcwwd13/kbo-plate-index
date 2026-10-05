const MODELS = ["v3", "v4.2"];

export function selectedRatingModel(location = window.location) {
  const query = new URLSearchParams(location.search).get("rating_model");
  if (MODELS.includes(query)) return query;
  return "v4.2";
}

export function ratingModelHref(href, model = selectedRatingModel()) {
  const [address, hash] = href.split("#");
  const [path, query = ""] = address.split("?");
  const params = new URLSearchParams(query);
  if (model === "v4.2") params.delete("rating_model");
  else params.set("rating_model", model);
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}${hash === undefined ? "" : `#${hash}`}`;
}

export function switchRatingModel(model) {
  if (!MODELS.includes(model)) throw new Error("Unknown rating model");
  // Reload replaces all model-dependent state together, including in-flight requests.
  window.location.assign(ratingModelHref(window.location.href, model));
}
