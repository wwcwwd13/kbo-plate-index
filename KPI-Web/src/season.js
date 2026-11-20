export function selectedSeason(location = window.location) {
  return new URLSearchParams(location.search).get("season") === "2027" ? "2027" : "2026";
}

export function seasonHref(href, season = selectedSeason()) {
  const [address, hash] = href.split("#");
  const [path, query = ""] = address.split("?");
  const params = new URLSearchParams(query);
  params.set("season", season);
  return `${path}?${params}${hash === undefined ? "" : `#${hash}`}`;
}

export function seasonSwitchUrl(href, season) {
  const url = new URL(href);
  url.searchParams.set("season", season);
  url.searchParams.delete("date");
  url.searchParams.delete("rating_model");
  return url.href;
}
