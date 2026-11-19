/**
 * Sixzee engine — pure, dependency-free 6-dice scoring and turn state.
 * Shared by the browser UI, the relay server, and the AI opponent.
 */

const CATEGORIES = [
  { id: 'ones', label: 'Ones', group: 'upper' },
  { id: 'twos', label: 'Twos', group: 'upper' },
  { id: 'threes', label: 'Threes', group: 'upper' },
  { id: 'fours', label: 'Fours', group: 'upper' },
  { id: 'fives', label: 'Fives', group: 'upper' },
  { id: 'sixes', label: 'Sixes', group: 'upper' },
  { id: 'threeKind', label: 'Three of a Kind', group: 'lower' },
  { id: 'fourKind', label: 'Four of a Kind', group: 'lower' },
  { id: 'fiveKind', label: 'Five of a Kind', group: 'lower' },
  { id: 'sixzee', label: 'SIXZEE', group: 'lower' },
  { id: 'fullHouse', label: 'Full House', group: 'lower' },
  { id: 'smallStraight', label: 'Small Straight', group: 'lower' },
  { id: 'largeStraight', label: 'Large Straight', group: 'lower' },
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const UPPER_BONUS_THRESHOLD = 84;
const UPPER_BONUS_POINTS = 35;
const DICE_COUNT = 6;
const ROLLS_PER_TURN = 3;

const FIVE_KIND_POINTS = 45;
const SIXZEE_POINTS = 60;
const FULL_HOUSE_POINTS = 30;
const SMALL_STRAIGHT_POINTS = 30;
const LARGE_STRAIGHT_POINTS = 40;

function createScorecard() {
  const card = {};
  for (const id of CATEGORY_IDS) card[id] = null;
  return card;
}

function validateDice(dice) {
  if (!Array.isArray(dice) || dice.length !== DICE_COUNT) {
    throw new Error(`Sixzee needs exactly ${DICE_COUNT} dice`);
  }
  const values = dice.map((d) => (typeof d === 'number' ? d : d.value));
  for (const value of values) {
    if (!Number.isInteger(value) || value < 1 || value > 6) {
      throw new Error('Dice values must be integers from 1 to 6');
    }
  }
  return values;
}

function diceValues(dice) {
  return validateDice(dice);
}

function counts(values) {
  const result = [0, 0, 0, 0, 0, 0, 0];
  for (const value of values) result[value] += 1;
  return result;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function longestStraight(values) {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i] === unique[i - 1] + 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function scoreRoll(dice, categoryId) {
  if (!CATEGORY_IDS.includes(categoryId)) throw new Error(`Unknown category: ${categoryId}`);
  const values = diceValues(dice);
  const freq = counts(values);
  const totalPips = sum(values);
  const maxOfAKind = Math.max(...freq.slice(1));
  const run = longestStraight(values);

  switch (categoryId) {
    case 'ones': return freq[1] * 1;
    case 'twos': return freq[2] * 2;
    case 'threes': return freq[3] * 3;
    case 'fours': return freq[4] * 4;
    case 'fives': return freq[5] * 5;
    case 'sixes': return freq[6] * 6;
    case 'threeKind': return maxOfAKind >= 3 ? totalPips : 0;
    case 'fourKind': return maxOfAKind >= 4 ? totalPips : 0;
    case 'fiveKind': return maxOfAKind >= 5 ? FIVE_KIND_POINTS : 0;
    case 'sixzee': return maxOfAKind === 6 ? SIXZEE_POINTS : 0;
    case 'fullHouse': {
      const groups = freq.slice(1).filter((count) => count > 0).sort((a, b) => b - a);
      return groups.length === 2 && groups[0] === 3 && groups[1] === 3 ? FULL_HOUSE_POINTS : 0;
    }
    case 'smallStraight': return run >= 4 ? SMALL_STRAIGHT_POINTS : 0;
    case 'largeStraight': return run >= 5 ? LARGE_STRAIGHT_POINTS : 0;
    default: return 0;
  }
}

function scoreCard(card) {
  let upperSubtotal = 0;
  let lowerSubtotal = 0;
  let filled = 0;
  for (const category of CATEGORIES) {
    const value = card[category.id];
    if (value === null || value === undefined) continue;
    filled += 1;
    if (category.group === 'upper') upperSubtotal += value;
    else lowerSubtotal += value;
  }
  const bonus = upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_POINTS : 0;
  return {
    upperSubtotal,
    bonus,
    lowerSubtotal,
    total: upperSubtotal + bonus + lowerSubtotal,
    filled,
    complete: filled === CATEGORIES.length,
  };
}

function openCategories(card) {
  return CATEGORIES.filter((c) => card[c.id] === null || card[c.id] === undefined);
}

function scoreOptions(dice, card) {
  const options = {};
  for (const category of openCategories(card)) options[category.id] = scoreRoll(dice, category.id);
  return options;
}

function rollDice(count = DICE_COUNT, rng = Math.random) {
  const result = [];
  for (let i = 0; i < count; i += 1) result.push(Math.floor(rng() * 6) + 1);
  return result;
}

function newDice(values = rollDice()) {
  return validateDice(values).map((value) => ({ value, held: false }));
}

class SixzeeGame {
  constructor({ players = ['Player 1', 'Player 2'], rng = Math.random } = {}) {
    if (players.length < 1) throw new Error('At least one player is required');
    this.rng = rng;
    this.players = players.map((name, index) => ({
      index,
      name,
      scorecard: createScorecard(),
      isAI: false,
    }));
    this.currentPlayer = 0;
    this.round = 1;
    this.rollsLeft = ROLLS_PER_TURN;
    this.dice = newDice(rollDice(DICE_COUNT, this.rng));
    this.phase = 'roll';
    this.winner = null;
  }

  get player() {
    return this.players[this.currentPlayer];
  }

  roll() {
    if (this.phase !== 'roll') throw new Error('Cannot roll in the current phase');
    if (this.rollsLeft <= 0) throw new Error('No rolls left this turn');
    this.dice = this.dice.map((die) => (
      die.held ? die : { value: Math.floor(this.rng() * 6) + 1, held: false }
    ));
    this.rollsLeft -= 1;
    return this.dice.map((die) => die.value);
  }

  toggleHold(index) {
    if (this.phase !== 'roll' || this.rollsLeft <= 0 || this.rollsLeft === ROLLS_PER_TURN) {
      return this.dice;
    }
    if (!this.dice[index]) throw new Error(`No die at index ${index}`);
    this.dice[index] = { ...this.dice[index], held: !this.dice[index].held };
    return this.dice;
  }

  setHolds(mask) {
    if (this.phase !== 'roll' || this.rollsLeft <= 0 || this.rollsLeft === ROLLS_PER_TURN) return this.dice;
    this.dice = this.dice.map((die, index) => ({ ...die, held: Boolean(mask & (1 << index)) }));
    return this.dice;
  }

  score(categoryId) {
    if (this.phase !== 'roll') throw new Error('Turn is already scored');
    const card = this.player.scorecard;
    if (card[categoryId] !== null) throw new Error('That category is already filled');
    card[categoryId] = scoreRoll(this.dice, categoryId);

    const next = (this.currentPlayer + 1) % this.players.length;
    if (next === 0) this.round += 1;
    if (this.players.every((p) => scoreCard(p.scorecard).complete)) {
      this.phase = 'done';
      this.winner = this.players.reduce((best, player) => (
        scoreCard(player.scorecard).total > scoreCard(best.scorecard).total ? player : best
      ), this.players[0]).index;
      return card[categoryId];
    }
    this.currentPlayer = next;
    this.rollsLeft = ROLLS_PER_TURN;
    this.dice = newDice(rollDice(DICE_COUNT, this.rng));
    return card[categoryId];
  }

  totals() {
    return this.players.map((player) => ({
      index: player.index,
      name: player.name,
      ...scoreCard(player.scorecard),
    }));
  }

  snapshot() {
    return {
      players: this.players.map((p) => ({
        index: p.index,
        name: p.name,
        scorecard: { ...p.scorecard },
        score: scoreCard(p.scorecard),
      })),
      currentPlayer: this.currentPlayer,
      round: this.round,
      rollsLeft: this.rollsLeft,
      dice: this.dice.map((die) => ({ ...die })),
      phase: this.phase,
      winner: this.winner,
    };
  }

  // Shape consumed by both the local UI and the SSE relay. The viewer index
  // is used to tag whose turn it is without leaking control to other seats.
  getState(viewerIndex = 0) {
    const snap = this.snapshot();
    return {
      ...snap,
      scores: snap.players.map((p) => p.score.total),
      phase: snap.phase === 'done' ? 'GAME_OVER' : 'ROLL',
      yourIndex: viewerIndex,
      isYourTurn: viewerIndex === snap.currentPlayer && snap.phase !== 'done',
      totalRounds: CATEGORIES.length,
    };
  }
}

class SixzeeServerEngine {
  constructor() {
    this.playerInfo = [];
    this.game = null;
  }

  addPlayer(name, id) {
    if (this.game) return false;
    this.playerInfo.push({ name, id });
    return true;
  }

  startGame() {
    if (this.game || this.playerInfo.length < 2) return false;
    this.game = new SixzeeGame({ players: this.playerInfo.map((p) => p.name) });
    return true;
  }

  getPlayerIndex(playerId) {
    return this.playerInfo.findIndex((p) => p.id === playerId);
  }

  getState(viewerIndex = 0) {
    if (!this.game) {
      return {
        players: this.playerInfo.map((p, index) => ({
          index,
          name: p.name,
          scorecard: createScorecard(),
          score: scoreCard(createScorecard()),
        })),
        scores: this.playerInfo.map(() => 0),
        currentPlayer: 0,
        round: 1,
        rollsLeft: ROLLS_PER_TURN,
        dice: newDice([1, 1, 1, 1, 1, 1]).map((die) => ({ ...die, value: 0 })),
        phase: 'WAITING',
        winner: null,
        yourIndex: viewerIndex,
        isYourTurn: false,
        totalRounds: CATEGORIES.length,
      };
    }
    return this.game.getState(viewerIndex);
  }

  requireTurn(index) {
    if (!this.game) throw new Error('Game has not started');
    if (index !== this.game.currentPlayer) throw new Error('Not your turn');
    if (this.game.phase !== 'roll') throw new Error('Game is over');
    return this.game;
  }

  roll(index) {
    this.requireTurn(index).roll();
    return { success: true };
  }

  setHolds(index, mask) {
    if (!Number.isInteger(mask) || mask < 0 || mask > 63) throw new Error('Invalid hold mask');
    this.requireTurn(index).setHolds(mask);
    return { success: true };
  }

  score(index, categoryId) {
    this.requireTurn(index).score(categoryId);
    return { success: true };
  }
}

class SixzeeAI {
  constructor(rng = Math.random) {
    this.rng = rng;
  }

  chooseCategory(dice, card) {
    const options = scoreOptions(dice, card);
    const open = openCategories(card);
    if (!open.length) return null;
    const upperNeed = UPPER_BONUS_THRESHOLD - scoreCard(card).upperSubtotal;
    let best = open[0];
    let bestValue = -Infinity;
    for (const category of open) {
      const points = options[category.id];
      const bonusWeight = category.group === 'upper' && upperNeed > 0
        ? Math.min(points, Math.max(0, upperNeed)) * 0.15
        : 0;
      const value = points + bonusWeight + (points === 0 ? -1000 : 0);
      if (value > bestValue) {
        bestValue = value;
        best = category;
      }
    }
    return best.id;
  }

  chooseHolds(dice, card, rollsLeft) {
    const values = diceValues(dice);
    if (rollsLeft <= 0) return values.map(() => true);

    let bestMask = 0;
    let bestScore = -Infinity;
    const samples = 24;
    for (let mask = 0; mask < (1 << DICE_COUNT); mask += 1) {
      const held = values.filter((_, index) => mask & (1 << index));
      let expected = 0;
      for (let sample = 0; sample < samples; sample += 1) {
        const candidate = [...held];
        while (candidate.length < DICE_COUNT) candidate.push(Math.floor(this.rng() * 6) + 1);
        const categoryId = this.chooseCategory(candidate, card);
        expected += categoryId ? scoreRoll(candidate, categoryId) : 0;
      }
      expected /= samples;
      // Prefer fewer held dice when scores are close, to keep improving.
      const adjusted = expected - (held.length * 0.01);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestMask = mask;
      }
    }
    return values.map((_, index) => Boolean(bestMask & (1 << index)));
  }
}

const SixzeeAPI = {
  CATEGORIES,
  CATEGORY_IDS,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_POINTS,
  DICE_COUNT,
  ROLLS_PER_TURN,
  createScorecard,
  validateDice,
  diceValues,
  scoreRoll,
  scoreCard,
  openCategories,
  scoreOptions,
  rollDice,
  newDice,
  SixzeeGame,
  SixzeeServerEngine,
  SixzeeAI,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SixzeeAPI;
}
if (typeof window !== 'undefined') {
  window.Sixzee = SixzeeAPI;
}
