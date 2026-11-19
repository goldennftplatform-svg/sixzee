'use strict';

// Real relay, independent players: publish, discover, sit, roll, and finish.
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sixzee-multiplayer-'));
process.env.SIXZEE_STORE_FILE = path.join(temp, 'users.json');
process.env.SIXZEE_MATCH_FILE = path.join(temp, 'matches.json');
const { server } = require('../server');

(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    async function request(route, body) {
        const response = await fetch(base + route, body ? {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        } : {});
        return { status: response.status, ...await response.json() };
    }

    assert.equal((await request('/api/health')).multiplayerProtocol, 1);
    assert.equal((await request('/api/health')).service, 'sixzee');

    // Six-seat tables are the upper bound; a seventh seat must be refused.
    const six = await request('/api/tables', { mode: '6player', name: 'P1', playerId: 'p1' });
    assert.equal(six.success, true);
    const sixRoot = '/api/tables/' + six.tableId;
    for (let seat = 2; seat <= 6; seat += 1) {
        assert.equal((await request(sixRoot + '/join', {
            name: 'P' + seat, playerId: 'p' + seat
        })).success, true);
    }
    assert.equal((await request(sixRoot + '/join', { name: 'P7', playerId: 'p7' })).status, 409);
    let sixState = (await request(sixRoot + '/state', { playerId: 'p1', pull: true })).state;
    assert.equal(sixState.players.length, 6);
    // A full table waits in the lobby until every seat has explicitly readied.
    assert.equal(sixState.phase, 'WAITING');
    assert.equal(sixState.readyCount, 0);
    assert.ok(sixState.players.every((p) => p.ready === false));
    for (let seat = 1; seat <= 6; seat += 1) {
        assert.equal((await request(sixRoot + '/ready', { playerId: 'p' + seat, ready: true })).success, true);
    }
    sixState = (await request(sixRoot + '/state', { playerId: 'p1', pull: true })).state;
    assert.equal(sixState.phase, 'ROLL');

    const created = await request('/api/tables', { mode: '1v1', name: 'HOST', playerId: 'host' });
    assert.equal(created.success, true);
    const root = '/api/tables/' + created.tableId;
    let hostState = (await request(root + '/state', { playerId: 'host', pull: true })).state;
    assert.equal(hostState.phase, 'WAITING');
    assert.equal(hostState.readyCount, 0);
    assert.equal(hostState.canStart, false);
    assert.equal((await request(root + '/join', { name: 'GUEST', playerId: 'guest' })).success, true);
    assert.equal((await request(root + '/join', { name: 'THIRD', playerId: 'third' })).status, 409);
    // Two seats filled is still a waiting room — no dice until both ready up.
    hostState = (await request(root + '/state', { playerId: 'host', pull: true })).state;
    assert.equal(hostState.phase, 'WAITING');
    assert.equal((await request(root + '/ready', { playerId: 'host', ready: true })).success, true);
    hostState = (await request(root + '/state', { playerId: 'host', pull: true })).state;
    assert.equal(hostState.phase, 'WAITING');
    assert.equal(hostState.readyCount, 1);
    assert.equal((await request(root + '/ready', { playerId: 'guest', ready: true })).success, true);

    let state = (await request(root + '/state', { playerId: 'host', pull: true })).state;
    assert.equal(state.phase, 'ROLL');
    assert.equal(state.dice.length, 6);
    assert.equal(state.players.length, 2);
    assert.equal(state.totalRounds, 13);
    assert.equal((await request(root + '/action', { playerId: 'outsider', action: 'roll' })).status, 403);
    assert.equal((await request(root + '/action', { playerId: 'guest', action: 'roll' })).status, 400);

    let moves = 0;
    while (state.phase !== 'GAME_OVER' && moves++ < 40) {
        const playerId = state.players[state.currentPlayer].index === 0 ? 'host' : 'guest';
        const rolled = await request(root + '/action', { playerId, action: 'roll' });
        assert.equal(rolled.success, true, JSON.stringify(rolled));
        const open = Object.keys(rolled.state.players[rolled.state.yourIndex].scorecard)
            .find((id) => rolled.state.players[rolled.state.yourIndex].scorecard[id] === null);
        const scored = await request(root + '/action', { playerId, action: 'score', payload: { categoryId: open } });
        assert.equal(scored.success, true, JSON.stringify(scored));
        state = scored.state;
    }
    assert.equal(state.phase, 'GAME_OVER', 'both humans must be able to finish 13 categories');
    assert.ok(state.winner === 0 || state.winner === 1);
    assert.ok(state.players.every((p) => p.score.complete));

    console.log('PASS: Sixzee relay — table publish/discovery, seat guards, dice turns, and full match');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(temp, { recursive: true, force: true });
});
