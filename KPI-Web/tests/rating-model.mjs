import assert from "node:assert/strict";
import { selectedRatingModel, ratingModelHref } from "../src/ratingModel.js";

assert.equal(selectedRatingModel({ search: "?rating_model=v3" }), "v4.2");
assert.equal(ratingModelHref("./?rating_model=v3"), "./");
assert.equal(ratingModelHref("../player/?player_id=123&rating_model=v3#chart"), "../player/?player_id=123#chart");
console.log("v4.2 model and legacy links passed.");
