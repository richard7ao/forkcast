import assert from "node:assert/strict";
import { test } from "node:test";
import { bannedClaims, inventedNumbers } from "./truth";

const facts = ["Made from red lentils", "13g protein per 100g", "Baked, not fried", "Made in Yorkshire", "Vegan", "85g bag"];

test("an invented crowd size is flagged, so social proof cannot fabricate its own evidence", () => {
  assert.deepEqual(inventedNumbers("Loved by 10,000 Londoners", facts), ["10,000"]);
});

test("numbers read off the pack pass, so true protein and pack-size claims are never blocked", () => {
  assert.deepEqual(inventedNumbers("13g protein in every 85g bag", facts), []);
});

test("a near miss is still invented: 14g of protein is not the 13g on the pack", () => {
  assert.deepEqual(inventedNumbers("14g protein, baked not fried", facts), ["14"]);
});

test("a price passes only when a fact carries it", () => {
  assert.deepEqual(inventedNumbers("Just £1.80", [...facts, "£1.80"]), []);
  assert.deepEqual(inventedNumbers("Just £1.80", facts), ["1.80"]);
});

test("thousands commas do not change a number, on either side, so formatting never decides truth", () => {
  assert.deepEqual(inventedNumbers("Over 10000 bags baked", ["Over 10,000 bags baked"]), []);
  assert.deepEqual(inventedNumbers("Over 10,000 bags baked", ["Over 10000 bags baked"]), []);
});

test("spelled-out numbers are flagged, so 'ten thousand fans' cannot slip past the digit check", () => {
  const copy = "Ten thousand fans can't be wrong";
  assert.deepEqual(inventedNumbers(copy, facts), []);
  assert.deepEqual(bannedClaims(copy), ["Ten", "thousand"]);
});

test("sales, award, popularity and stock claims are flagged in any case or spelling, since no pack backs them", () => {
  assert.deepEqual(
    bannedClaims("Award-winning BESTSELLING mallows, the #1 treat, loved by campers. Limited edition, selling fast, while stocks last!"),
    ["Award-winning", "BESTSELLING", "#1", "loved by", "Limited edition", "selling fast", "while stocks last"],
  );
});

test("diet labels are flagged, because the real product contains pork gelatine and a vegan claim would be false", () => {
  assert.deepEqual(bannedClaims("Vegan, vegetarian and plant-based mallows; plant based too"), ["Vegan", "vegetarian", "plant-based", "plant based"]);
});

test("subjective framing passes, so each lever keeps its voice without inventing facts", () => {
  assert.deepEqual(bannedClaims("Pillowy, epic: the bag everyone grabs at a barbecue"), []);
});

test("number words inside other words are not numbers: someone, often and devoted all pass", () => {
  assert.deepEqual(bannedClaims("Someone often devoted to s'mores"), []);
});
