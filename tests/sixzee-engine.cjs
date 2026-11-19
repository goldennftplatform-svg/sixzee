const assert = require('node:assert/strict');
const {
  CATEGORY_IDS,
  createScorecard,
  scoreRoll,
  scoreCard,
  SixzeeGame,
  SixzeeAI,
} = require('../sixzee-engine.js');

const d = (...values) => values;

assert.equal(scoreRoll(d(1, 1, 1, 2, 3, 4), 'ones'), 3);
assert.equal(scoreRoll(d(1, 1, 1, 2, 3, 4), 'twos'), 2);
assert.equal(scoreRoll(d(1, 1, 1, 2, 3, 4), 'threeKind'), 12);
assert.equal(scoreRoll(d(1, 1, 1, 2, 3, 4), 'fourKind'), 0);
assert.equal(scoreRoll(d(1, 1, 1, 2, 3, 4), 'smallStraight'), 30);
assert.equal(scoreRoll(d(1, 1, 1, 2, 3, 4), 'largeStraight'), 0);
assert.equal(scoreRoll(d(2, 2, 2, 2, 2, 5), 'fiveKind'), 45);
assert.equal(scoreRoll(d(2, 2, 2, 2, 2, 5), 'sixzee'), 0);
assert.equal(scoreRoll(d(2, 2, 2, 2, 2, 5), 'fourKind'), 15);
assert.equal(scoreRoll(d(6, 6, 6, 6, 6, 6), 'sixzee'), 60);
assert.equal(scoreRoll(d(6, 6, 6, 6, 6, 6), 'fiveKind'), 45);
assert.equal(scoreRoll(d(3, 3, 3, 5, 5, 5), 'fullHouse'), 30);
assert.equal(scoreRoll(d(3, 3, 3, 5, 5, 6), 'fullHouse'), 0);
assert.equal(scoreRoll(d(1, 2, 3, 4, 5, 6), 'largeStraight'), 40);
assert.equal(scoreRoll(d(1, 2, 3, 4, 5, 6), 'smallStraight'), 30);
assert.equal(scoreRoll(d(4, 4, 4, 4, 4, 4), 'sixes'), 0);
assert.equal(scoreRoll(d(4, 4, 4, 4, 4, 4), 'fours'), 24);

const card = createScorecard();
for (const face of ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']) card[face] = 14;
card.sixzee = 60;
assert.equal(scoreCard(card).upperSubtotal, 84);
assert.equal(scoreCard(card).bonus, 35);
assert.equal(scoreCard(card).total, 179);
card.sixzee = null;
assert.equal(scoreCard(card).bonus, 35);

let seed = 7;
const rng = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const game = new SixzeeGame({ players: ['A', 'B'], rng });
assert.equal(game.dice.length, 6);
assert.equal(game.rollsLeft, 3);
game.roll();
assert.equal(game.rollsLeft, 2);
game.setHolds(0b000001);
const heldValue = game.dice[0].value;
game.roll();
assert.equal(game.dice[0].value, heldValue);
game.roll();
assert.equal(game.rollsLeft, 0);
game.score('ones');
assert.equal(game.currentPlayer, 1);
assert.equal(game.round, 1);
assert.equal(game.rollsLeft, 3);

for (let i = 0; i < 26; i += 1) {
  if (game.phase === 'done') break;
  game.roll();
  const ai = new SixzeeAI(rng);
  game.score(ai.chooseCategory(game.dice.map((x) => x.value), game.player.scorecard));
}
assert.equal(game.phase, 'done');
assert.equal(game.players.every((p) => scoreCard(p.scorecard).complete), true);
assert.ok(game.winner === 0 || game.winner === 1);
assert.equal(CATEGORY_IDS.length, 13);

console.log('Sixzee engine tests passed.');
