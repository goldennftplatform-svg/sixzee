const assert = require('node:assert/strict');
const {
  CATEGORY_IDS,
  createScorecard,
  scoreRoll,
  scoreCard,
  seatCountForMode,
  isSixzeeRoll,
  jokerEligible,
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

// Classic Yahtzee extras: a filled SIXZEE box unlocks the 100-point bonus and
// joker substitutions for Full House and straights on later six-of-a-kinds.
const sixOfSixes = d(6, 6, 6, 6, 6, 6);
const emptyCard = createScorecard();
const jokerCard = createScorecard();
jokerCard.sixzee = 60;
assert.equal(isSixzeeRoll(sixOfSixes), true);
assert.equal(jokerEligible(sixOfSixes, emptyCard), false);
assert.equal(jokerEligible(sixOfSixes, jokerCard), true);
assert.equal(scoreRoll(sixOfSixes, 'fullHouse', emptyCard), 0);
assert.equal(scoreRoll(sixOfSixes, 'fullHouse', jokerCard), 30);
assert.equal(scoreRoll(sixOfSixes, 'smallStraight', jokerCard), 30);
assert.equal(scoreRoll(sixOfSixes, 'largeStraight', jokerCard), 40);
assert.equal(scoreCard(emptyCard, 0).sixzeeBonus, 0);
assert.equal(scoreCard(emptyCard, 2).sixzeeBonus, 200);
assert.equal(scoreCard(emptyCard, 2).total, 200);

assert.deepEqual(
  ['1v1', '3player', '4player', '5player', '6player'].map(seatCountForMode),
  [2, 3, 4, 5, 6]
);
assert.equal(seatCountForMode('unknown'), 0);
assert.throws(() => new SixzeeGame({ players: Array(7).fill('X') }), /at most 6/);

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

// Dice physically stay on the table between turns; holds are released.
const carry = new SixzeeGame({ players: ['A', 'B'], rng: () => 0.42 });
assert.equal(carry.hasRolled, false);
carry.roll();
const carriedValues = carry.dice.map((die) => die.value);
carry.score('ones');
assert.deepEqual(carry.dice.map((die) => die.value), carriedValues);
assert.equal(carry.dice.some((die) => die.held), false);
assert.equal(carry.hasRolled, true);
assert.equal(carry.rollsLeft, 3);

// Extra Sixzee: +100 even when the points are parked in another category.
const extras = new SixzeeGame({ players: ['A', 'B'], rng: () => 0.99 });
extras.roll();
extras.dice = sixOfSixes.map((value) => ({ value, held: false }));
assert.equal(extras.score('sixzee'), 60);
// Give the turn back to the same player for the extra-Sixzee assertion.
extras.currentPlayer = 0;
extras.roll();
extras.dice = sixOfSixes.map((value) => ({ value, held: false }));
assert.equal(extras.score('fullHouse'), 30);
assert.equal(extras.lastBonusAwarded, true);
assert.equal(extras.players[0].sixzeeBonuses, 1);
assert.equal(scoreCard(extras.players[0].scorecard, extras.players[0].sixzeeBonuses).sixzeeBonus, 100);
assert.equal(scoreCard(extras.players[0].scorecard, extras.players[0].sixzeeBonuses).total, 190);

console.log('Sixzee engine tests passed.');
