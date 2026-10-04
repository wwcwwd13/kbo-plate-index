import assert from "node:assert/strict";
import { selectedRatingModel, ratingModelHref } from "../src/ratingModel.js";

const saved = { getItem: () => "v3" };
assert.equal(selectedRatingModel({ search: "" }, saved), "v3");
assert.equal(selectedRatingModel({ search: "?rating_model=v4" }, saved), "v4");
assert.equal(selectedRatingModel({ search: "?rating_model=bad" }, { getItem: () => { throw Error(); } }), "v4");
assert.equal(ratingModelHref("../player/?player_id=123#chart", "v3"), "../player/?player_id=123&rating_model=v3#chart");
assert.equal(ratingModelHref("./?rating_model=v3", "v4"), "./?rating_model=v4");
console.log("Rating model selection passed.");
