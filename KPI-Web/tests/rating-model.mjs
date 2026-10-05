import assert from "node:assert/strict";
import { selectedRatingModel, ratingModelHref, switchRatingModel } from "../src/ratingModel.js";

const saved = { getItem: () => "v3" };
assert.equal(selectedRatingModel({ search: "" }, saved), "v4.2");
assert.equal(selectedRatingModel({ search: "?rating_model=v4" }, saved), "v4.2");
assert.equal(selectedRatingModel({ search: "?rating_model=bad" }, { getItem: () => { throw Error(); } }), "v4.2");
assert.equal(selectedRatingModel({ search: "?rating_model=v4.2" }, saved), "v4.2");
assert.equal(selectedRatingModel({ search: "" }, { getItem: () => "v4" }), "v4.2");
assert.equal(selectedRatingModel({ search: "" }, { getItem: () => "v4.2" }), "v4.2");
assert.equal(ratingModelHref("../player/?player_id=123#chart", "v3"), "../player/?player_id=123&rating_model=v3#chart");
assert.equal(ratingModelHref("./?rating_model=v3", "v4.2"), "./");
assert.equal(ratingModelHref("../diff/?date=2026-10-03", "v4.2"), "../diff/?date=2026-10-03");
let assigned;
globalThis.window = {
  location: { search: "", href: "https://example.com/?date=2026-10-04#chart", assign: (href) => { assigned = href; } },
  get localStorage() { throw new Error("Model selection must not access localStorage"); },
};
assert.equal(selectedRatingModel(), "v4.2");
switchRatingModel("v3");
assert.equal(assigned, "https://example.com/?date=2026-10-04&rating_model=v3#chart");
assert.throws(() => switchRatingModel("bad"), /Unknown rating model/);
delete globalThis.window;
console.log("Rating model selection passed.");
