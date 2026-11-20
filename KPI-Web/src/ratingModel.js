export function selectedRatingModel() {
  return "v4.2";
}

export function ratingModelHref(href) {
  const [address, hash] = href.split("#");
  const [path, query = ""] = address.split("?");
  const params = new URLSearchParams(query);
  params.delete("rating_model");
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}${hash === undefined ? "" : `#${hash}`}`;
}

