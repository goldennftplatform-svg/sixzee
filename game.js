/*
 * SIXZEE — browser game controller.
 *
 * Owns the dice UI, 13-category scorecard, AI turns, and the same relay/wallet
 * seams as the original LITEcrib build.
 */
'use strict';

const SIXZEE_DIE_PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
};

// A blocky "6" with exactly 13 lit cells — one per scorecard category.
// Cells light up in reading order as a player fills their card.
const SIXZEE_PROGRESS_ROWS = ['111', '100', '111', '100', '101', '111'];

class SixzeeUI {
    constructor() {
        const api = window.Sixzee;
        this.api = api;
        this.engine = new api.SixzeeGame({ players: ['PLAYER 1', 'AI'] });
        this.network = new GameNetwork();
        this.localPlayerIndex = 0;
        this.tableId = null;
        this.isSinglePlayer = false;
        this.isRemote = false;
        this.remoteState = null;
        this.aiPlayers = new Map();
        this.aiThinking = false;
        this.gameLog = [];
        this.lastLogToken = '';

        this.stakedMatch = null;
        this.stakedMatchSettled = false;

        this.matchStats = this.createMatchStats();
        this.lastStatsRoundToken = null;
        this.matchResultToken = null;
        this.matchResultState = null;
        this.matchResultShown = false;
        this.matchSettlement = null;
        this.statsScoresInitialized = false;
        this.lastMatchMode = '1v1';
        this.lastPlayerName = '';

        this.setupNetworkListeners();
    }

    // -----------------------------------------------------------------------
    // Match bookkeeping (kept from the full build for staking + stats)
    // -----------------------------------------------------------------------
    createMatchStats() {
        return { startedAt: Date.now(), finishedAt: null, rounds: 0, players: {}, events: [] };
    }

    resetMatchStats() {
        this.matchStats = this.createMatchStats();
        this.lastStatsRoundToken = null;
        this.matchResultToken = null;
        this.matchResultState = null;
        this.matchResultShown = false;
        this.matchSettlement = null;
        this.statsScoresInitialized = false;
        this.updateMatchStatsButton();
    }

    roundToken(state) {
        return state?.round + '|' + (state?.currentPlayer ?? 0);
    }

    trackRound(state) {
        if (!state || state.phase === 'GAME_OVER') return;
        const token = this.roundToken(state);
        if (token === this.lastStatsRoundToken) return;
        this.lastStatsRoundToken = token;
        this.matchStats.rounds = Math.max(this.matchStats.rounds, state.round || 1);
    }

    updateMatchStatsButton() {
        const btn = document.getElementById('match-stats-btn');
        if (btn) btn.hidden = !this.matchResultState;
    }

    // -----------------------------------------------------------------------
    // Network + lobby
    // -----------------------------------------------------------------------
    setupNetworkListeners() {
        this.network.on('connected', () => {
            this.updateConnectionStatus(true);
            this.loadTables();
        });
        this.network.on('disconnected', () => this.updateConnectionStatus(false));
        this.network.on('state', (state) => this.handleStateUpdate(state));
        this.network.on('tableList', (tables) => this.renderTableList(tables));
        this.network.on('chat', (chat) => this.addLogEntry(`${chat.playerName}: ${chat.message}`, 'system'));
    }

    async init() {
        try {
            this.setupLobbyControls();
            await this.network.connect();
            this.loadPlayerName();
            this.loadTables();
            // A friend can share a direct "take this seat" link (?table=id).
            const inviteId = new URLSearchParams(location.search).get('table');
            if (inviteId) {
                this.pendingInviteTable = inviteId;
                const saved = localStorage.getItem('sixzee_player_name');
                if (saved) {
                    this.joinGame(inviteId);
                } else {
                    document.getElementById('player-name')?.focus();
                    this.showModal('INVITED TO A TABLE', '<p>Enter your name, then press <strong>JOIN SIXZEE</strong> to take your seat.</p>', [
                        { text: 'OK', action: () => this.hideModal() }
                    ]);
                }
            }
        } catch (e) {
            console.error('Failed to connect:', e);
            this.showModal('CONNECTION ISSUE', 'The relay could not be reached. Solo play is still available.', [
                { text: 'OK', action: () => this.hideModal() }
            ]);
        }
    }

    setupLobbyControls() {
        document.getElementById('lobby-ready-btn')?.addEventListener('click', () => {
            const state = this.tableLobbyState;
            const you = state?.players?.[state.yourIndex];
            if (this.network.setReady) this.network.setReady(!(you?.ready));
        });
        document.getElementById('lobby-leave-btn')?.addEventListener('click', async () => {
            if (this.network.leaveTable) await this.network.leaveTable();
            this.tableLobbyState = null;
            this.returnToLobby();
        });
        document.getElementById('lobby-invite-btn')?.addEventListener('click', async () => {
            const id = this.tableLobbyState?.tableId || this.tableId || '';
            const base = this.network.getServerUrl?.() || location.origin;
            const link = `${base}/?table=${encodeURIComponent(id)}`;
            let copied = false;
            try {
                await navigator.clipboard.writeText(link);
                copied = true;
            } catch (e) {
                copied = false;
            }
            this.showModal('INVITE A FRIEND', `
                <p>Send this link so a friend takes a seat at your table:</p>
                <p style="word-break:break-all;font-family:monospace">${this.escapeHtml(link)}</p>
                <p>${copied ? 'Link copied to your clipboard.' : 'Copy the link above and share it.'}</p>
            `, [{ text: 'OK', class: 'primary', action: () => this.hideModal() }]);
        });
    }

    loadPlayerName() {
        const saved = localStorage.getItem('sixzee_player_name');
        if (saved) document.getElementById('player-name').value = saved;
    }

    savePlayerName(name) {
        localStorage.setItem('sixzee_player_name', name);
    }

    loadTables() {
        this.renderTableList(this.network.getTableList());
    }

    modeSeats(mode) {
        return this.api.seatCountForMode(mode) || 2;
    }

    modeLabel(mode) {
        const seats = this.modeSeats(mode);
        return seats === 2 ? 'HEAD-TO-HEAD' : `${seats}-PLAYER SAFARI`;
    }

    modeIcon(mode) {
        const icons = { 2: '🎲', 3: '🦏', 4: '🦒', 5: '🐘', 6: '🦁' };
        return icons[this.modeSeats(mode)] || '🎲';
    }

    renderTableList(tables) {
        const grid = document.getElementById('tables-grid');
        if (!grid) return;
        if (!tables || tables.length === 0) {
            grid.innerHTML = `
                <div class="table-card empty">
                    <div class="table-icon">🎲</div>
                    <p>No tables yet</p>
                    <button class="pixel-btn create-table-btn" id="create-table-btn">CREATE TABLE</button>
                </div>`;
            grid.querySelector('#create-table-btn')?.addEventListener('click', () => this.showCreateTableModal());
            return;
        }
        grid.innerHTML = tables.map((table) => {
            const maxPlayers = this.modeSeats(table.mode);
            const count = table.players.length;
            const isFull = count >= maxPlayers;
            const ready = table.players.filter((p) => p.ready).length;
            const yours = table.players.some((p) => p.id === this.network.playerId);
            const status = isFull && ready === maxPlayers
                ? 'IN PLAY · NO AI'
                : isFull
                    ? `${ready}/${maxPlayers} READY · NO AI`
                    : yours
                        ? `YOUR TABLE · WAITING FOR ${maxPlayers - count} MORE`
                        : 'CLICK TO SIT';
            return `
                <div class="table-card ${isFull && ready === maxPlayers ? 'full' : ''} ${yours ? 'current' : ''}" data-table-id="${table.id}">
                    <div class="table-icon">${this.modeIcon(table.mode)}</div>
                    <h4>${this.modeLabel(table.mode)}</h4>
                    <div class="table-meta">Table #${table.id.slice(-5).toUpperCase()}</div>
                    <div>${count}/${maxPlayers} SEATED · ${ready} READY</div>
                    <div>${status}</div>
                </div>`;
        }).join('');
        grid.querySelectorAll('.table-card:not(.empty):not(.full)').forEach((card) => {
            card.addEventListener('click', () => this.joinGame(card.dataset.tableId));
        });
    }

    showCreateTableModal() {
        const mode = document.querySelector('.mode-card.selected')?.dataset.mode || '1v1';
        const seats = this.modeSeats(mode);
        this.showModal('CREATE TABLE', `
            <p>Create a <strong>${seats}-player human table</strong>?</p>
            <p>No AI opponents. You will sit at the table, invite friends, and everyone presses <strong>READY UP</strong> before the dice roll.</p>
        `, [
            { text: 'CREATE', class: 'primary', action: () => this.createTable(mode) },
            { text: 'CANCEL', action: () => this.hideModal() }
        ]);
    }

    async createTable(mode) {
        const name = document.getElementById('player-name').value.trim().toUpperCase();
        if (!name) {
            this.showModal('ERROR', 'Enter your name first!', [{ text: 'OK', action: () => this.hideModal() }]);
            return;
        }
        this.savePlayerName(name);
        const result = await this.network.createTable(mode, name);
        if (!result.success && !result.ok) {
            this.showModal('TABLE UNAVAILABLE', this.escapeHtml(result.error || 'Could not create table.'), [
                { text: 'OK', action: () => this.hideModal() }
            ]);
            return;
        }
        this.clearStakedMatch();
        this.resetMatchStats();
        this.isSinglePlayer = false;
        this.aiPlayers.clear();
        this.tableId = result.tableId;
        this.loadTables();
        this.hideModal();
    }

    async joinGame(tableId) {
        const name = document.getElementById('player-name').value.trim().toUpperCase();
        if (!name) {
            this.showModal('ERROR', 'Enter your name first!', [{ text: 'OK', action: () => this.hideModal() }]);
            return;
        }
        this.savePlayerName(name);
        const result = await this.network.joinTable(tableId, name);
        if (!result.success && !result.ok) {
            this.showModal('JOIN FAILED', this.escapeHtml(result.error || 'Could not join table.'), [
                { text: 'OK', action: () => this.hideModal() }
            ]);
            return;
        }
        this.clearStakedMatch();
        this.resetMatchStats();
        this.isSinglePlayer = false;
        this.isRemote = true;
        this.tableId = tableId;
        this.pendingInviteTable = null;
        this.hideModal();
    }

    // -----------------------------------------------------------------------
    // Local + AI game setup
    // -----------------------------------------------------------------------
    getAIName(index) {
        const names = ['🦁 SIMBA', '🦓 ZARA', '🦏 KIFARU', '🐘 TEMBO', '🦒 TWIGA', '🐆 CHUI'];
        return names[(index - 1) % names.length];
    }

    setupLocalGame(mode, playerName) {
        this.hideTableLobby();
        const count = this.modeSeats(mode);
        this.lastMatchMode = mode;
        this.lastPlayerName = playerName;
        this.resetMatchStats();
        this.isRemote = false;
        this.remoteState = null;
        this.isSinglePlayer = true;
        this.aiThinking = false;
        this.localPlayerIndex = 0;
        this.aiPlayers.clear();
        const players = [playerName.toUpperCase()];
        for (let i = 1; i < count; i += 1) {
            players.push(this.getAIName(i));
            this.aiPlayers.set(i, new this.api.SixzeeAI());
        }
        this.engine = new this.api.SixzeeGame({ players });
        this.gameLog = [];
        this.addLogEntry(`${this.modeLabel(mode)} Sixzee started. Dice are on the table — roll to begin!`, 'system');
        this.showGameScreen();
        this.renderGameState(this.engine.getState(this.localPlayerIndex));
        this.maybeRunAi();
    }

    startFreeMatch(name) {
        this.isSinglePlayer = true;
        this.setupLocalGame(this.lastMatchMode || '1v1', name);
    }

    playAgain() {
        const name = this.lastPlayerName || document.getElementById('player-name')?.value.trim().toUpperCase() || 'PLAYER';
        this.hideModal();
        if (!this.isSinglePlayer) {
            this.createTable(this.lastMatchMode || '1v1');
            return;
        }
        this.clearStakedMatch();
        this.startFreeMatch(name);
    }

    returnToLobby() {
        this.hideModal();
        this.hideTableLobby();
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('landing-screen').classList.add('active');
        this.loadTables();
    }

    showGameScreen() {
        document.getElementById('landing-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
    }

    // -----------------------------------------------------------------------
    // Staking + results (same relay economy as the original build)
    // -----------------------------------------------------------------------
    clearStakedMatch() {
        this.stakedMatch = null;
        this.stakedMatchSettled = false;
        const badge = document.getElementById('stake-badge');
        if (badge) {
            badge.textContent = 'FREE PLAY';
            badge.classList.remove('staked');
        }
        const status = document.getElementById('status-text');
        if (status && status.textContent === 'TOKEN MATCH') status.textContent = 'LOCAL GAME';
    }

    startStakedAiMatch(data, playerName) {
        const match = data && data.match;
        if (!match || !match.players || match.players.length !== 2) {
            this.showModal('TOKEN MATCH ERROR', '<p>The escrow response was incomplete. No dice were rolled.</p>', [
                { text: 'OK', action: () => this.hideModal() }
            ]);
            return;
        }
        this.clearStakedMatch();
        this.stakedMatch = {
            id: match.id,
            humanId: match.players[0].id,
            aiId: match.players[1].id,
            stake: data.stake || null,
            ai: data.ai || null
        };
        const stake = data.stake || { entryPoints: 20, potPoints: 40, feePoints: 0.1, winnerPoints: 39.9, testLtcPerEntry: 0.02 };
        const badge = document.getElementById('stake-badge');
        if (badge) {
            badge.textContent = '🪙 ' + stake.entryPoints + ' TEST PTS / ' + stake.testLtcPerEntry + ' tLTC';
            badge.classList.add('staked');
        }
        this.setupLocalGame('1v1', playerName);
        const status = document.getElementById('status-text');
        if (status) status.textContent = 'TOKEN MATCH';
        this.addLogEntry('Token match armed: ' + stake.entryPoints + ' test pts each. Winner takes ' + stake.winnerPoints + ' pts.', 'system');
        this.showModal('YOU ARE PLAYING FOR TOKENS', `
            <p><strong>Stake:</strong> ${stake.entryPoints} test pts (${stake.testLtcPerEntry} tLTC) each.</p>
            <p><strong>Pot:</strong> ${stake.potPoints} pts · <strong>House fee:</strong> ${stake.feePoints} pts · <strong>Winner gets:</strong> ${stake.winnerPoints} pts.</p>
            <p>Test tokens have no cash value.</p>
        `, [{ text: 'ROLL DICE', class: 'primary', action: () => this.hideModal() }]);
    }

    async finishStakedMatch(state, force = false) {
        if (!this.stakedMatch) return;
        if (this.stakedMatchSettled && !force) return;
        if (!state || state.phase !== 'GAME_OVER' || state.winner == null) return;
        this.stakedMatchSettled = true;

        const winnerId = state.winner === 0 ? this.stakedMatch.humanId
            : state.winner === 1 ? this.stakedMatch.aiId : null;
        if (!winnerId) {
            this.setSettlementError('No winning seat was reported.');
            return;
        }
        const relay = String(window.location.origin).replace(/\/$/, '');
        let token = '';
        try { token = localStorage.getItem('sixzee_auth_token') || ''; } catch (e) {}
        if (!token) {
            this.stakedMatchSettled = false;
            this.setSettlementError('Sign in to settle this test-token match.');
            return;
        }
        try {
            const response = await fetch(relay + '/api/games/match/' + encodeURIComponent(this.stakedMatch.id) + '/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ winnerId })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result?.error || 'settlement failed');
            const match = result.match;
            const humanWon = match.winnerRole ? match.winnerRole !== 'ai' : match.winner === this.stakedMatch.humanId;
            const cfg = window.SIXZEE_CONFIG || {};
            const perLtc = (cfg.pricing && cfg.pricing.pointsPerTestLtc) || cfg.pointsPerTestLtc || 1000;
            const tLtc = (match.payout / perLtc).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
            this.matchSettlement = { status: 'settled', payout: match.payout, fee: match.fee, pot: match.pot, tLtc, humanWon };
            this.addLogEntry(humanWon
                ? 'Settled: you won ' + match.payout + ' test pts (' + tLtc + ' tLTC).'
                : 'Settled: AI bankroll won ' + match.payout + ' pts.', 'system');
            window.dispatchEvent(new CustomEvent('sixzee:settled', { detail: result }));
            this.refreshVisibleResult();
        } catch (e) {
            this.stakedMatchSettled = false;
            this.setSettlementError(e.message || 'network error');
        }
    }

    setSettlementError(message) {
        this.matchSettlement = { status: 'error', error: String(message || 'Settlement failed') };
        this.refreshVisibleResult();
    }

    refreshVisibleResult() {
        this.updateMatchStatsButton();
        const overlay = document.getElementById('modal-overlay');
        const header = document.getElementById('modal-header');
        if (overlay && header && !overlay.classList.contains('hidden') && header.textContent === 'MATCH RESULT') {
            this.renderMatchResultModal();
        }
    }

    showMatchResult(state) {
        if (!state || state.phase !== 'GAME_OVER' || state.winner == null) return;
        const token = state.winner + '|' + (state.scores || []).join(',')
            + '|' + (state.players || []).map((p) => p.sixzeeBonuses || 0).join(',');
        if (this.matchResultToken === token) return;
        this.matchResultToken = token;
        this.matchResultShown = true;
        this.matchStats.finishedAt = Date.now();
        this.matchResultState = {
            phase: 'GAME_OVER',
            winner: state.winner,
            scores: [...(state.scores || [])],
            players: (state.players || []).map((p) => ({
                name: p.name,
                score: p.score?.total ?? p.score ?? 0,
                sixzeeBonuses: p.sixzeeBonuses || 0,
            }))
        };
        this.updateMatchStatsButton();
        this.renderMatchResultModal();
        if (this.stakedMatch && !this.stakedMatchSettled) {
            this.matchSettlement = { status: 'settling' };
            this.finishStakedMatch(this.matchResultState);
        }
    }

    buildResultCardHtml(state) {
        const winner = state.players[state.winner];
        const rows = state.players.map((p, i) => `
            <div class="score-row">
                <span>${i === state.winner ? '👑 ' : ''}${this.escapeHtml(p.name)}${p.sixzeeBonuses ? ` <small>+${p.sixzeeBonuses * 100} sixzee</small>` : ''}</span>
                <b>${p.score}</b>
            </div>`).join('');
        let settlement = '';
        if (this.matchSettlement) {
            if (this.matchSettlement.status === 'settled') {
                settlement = `<p class="wallet-tip gold">Payout: ${this.matchSettlement.payout} test pts (${this.matchSettlement.tLtc} tLTC).</p>`;
            } else if (this.matchSettlement.status === 'error') {
                settlement = `<p class="wallet-tip">Settlement: ${this.escapeHtml(this.matchSettlement.error)}</p>`;
            } else {
                settlement = '<p class="wallet-tip">Settling test-token payout…</p>';
            }
        }
        return `<p><strong>${this.escapeHtml(winner?.name || 'WINNER')}</strong> takes the board.</p>${rows}${settlement}`;
    }

    buildStatsHtml(state) {
        const rows = state.players.map((p, i) => `
            <div class="score-row"><span>${this.escapeHtml(p.name)}</span><b>${p.score}</b></div>`).join('');
        return `<p>Rounds played: ${this.matchStats.rounds || state.players[0]?.score?.filled || 0} / 13</p>${rows}`;
    }

    renderMatchResultModal() {
        if (!this.matchResultState) return;
        const needsRetry = this.stakedMatch && this.matchSettlement?.status === 'error';
        const actions = [];
        if (needsRetry) {
            actions.push({ text: 'RETRY PAYOUT', class: 'primary', action: () => this.finishStakedMatch(this.matchResultState, true) });
        }
        actions.push(
            { text: this.isSinglePlayer ? 'REMATCH' : 'NEW TABLE', class: needsRetry ? '' : 'primary', action: () => this.playAgain() },
            { text: 'VIEW STATS', action: () => this.showMatchStats() },
            { text: 'BACK TO LOBBY', action: () => this.returnToLobby() }
        );
        this.showModal('MATCH RESULT', this.buildResultCardHtml(this.matchResultState), actions, { className: 'result-modal' });
    }

    showMatchStats() {
        const state = this.matchResultState || this.getCurrentState();
        const finished = Boolean(this.matchResultState);
        this.showModal(finished ? 'MATCH STATS' : 'MATCH STATS · LIVE', this.buildStatsHtml(state), [
            { text: finished ? (this.isSinglePlayer ? 'REMATCH' : 'NEW TABLE') : 'BACK TO GAME', class: 'primary', action: () => finished ? this.playAgain() : this.hideModal() },
            { text: finished ? 'BACK TO RESULT' : 'CLOSE', action: () => finished ? this.renderMatchResultModal() : this.hideModal() }
        ], { className: 'stats-modal' });
    }

    showLastMatchResult() {
        if (this.matchResultState) this.renderMatchResultModal();
        else this.showMatchStats();
    }

    showRules() {
        this.showModal('SIXZEE RULES', `
            <p><strong>2–6 players. 6 dice. 3 rolls. 13 categories.</strong> The dice stay on the table between turns — hold any of them, reroll the rest, then claim a category.</p>
            <p><strong>Upper:</strong> Ones–Sixes score face value × count. Reach <strong>84</strong> for a <strong>+35 bonus</strong>.</p>
            <p><strong>Lower:</strong> 3-of-a-kind / 4-of-a-kind score all six dice; 5-of-a-kind = 45; SIXZEE (six of a kind) = 60; Full House (3+3) = 30; Small Straight (4 in a row) = 30; Large Straight (5 in a row) = 40.</p>
            <p><strong>Classic extras:</strong> after your SIXZEE box holds 60, every later SIXZEE earns <strong>+100</strong> and becomes a <strong>joker</strong> — it may also score Full House or either straight.</p>
            <p>A roll that does not fit a category scores zero and closes it. Highest total wins. No Chance category.</p>
        `, [{ text: 'GOT IT', class: 'primary', action: () => this.hideModal() }]);
    }

    // -----------------------------------------------------------------------
    // State flow + rendering
    // -----------------------------------------------------------------------
    getCurrentState() {
        if (this.isRemote && this.remoteState) return this.remoteState;
        return this.engine.getState(this.localPlayerIndex);
    }

    handleStateUpdate(state) {
        if (!state) return;
        // A reconnecting browser gets its table id on every snapshot now, so
        // reloading mid-game restores the same seat instead of a fresh one.
        this.tableId = state.tableId || this.tableId || this.network.tableId;
        if (state.phase === 'WAITING') {
            this.showTableLobby(state);
            return;
        }
        this.isRemote = true;
        this.remoteState = state;
        this.hideTableLobby();
        this.showGameScreen();
        this.renderGameState(state);
        if (state.phase === 'GAME_OVER') this.showMatchResult(state);
    }

    showTableLobby(state) {
        // Waiting room: everyone can see the seats and who is ready. The game
        // screen stays parked until every seat is taken and ready.
        this.tableLobbyState = state;
        this.isRemote = true;
        this.tableId = state.tableId || this.tableId;
        this.showGameScreen();
        const lobby = document.getElementById('table-lobby');
        if (!lobby) return;
        lobby.hidden = false;
        document.querySelector('.sixzee-board')?.classList.add('lobby-hidden');
        document.getElementById('phase-indicator')?.classList.add('lobby-hidden');
        document.getElementById('game-log')?.classList.add('lobby-hidden');

        const maxPlayers = state.maxPlayers || (state.players ? state.players.length : 2);
        const yourIndex = Number(state.yourIndex) || 0;
        const you = state.players?.[yourIndex];
        const readyCount = state.players?.filter(p => p.ready).length || 0;
        const filled = state.players?.length || 0;
        const title = document.getElementById('lobby-title');
        if (title) title.textContent = `${this.modeLabel(state.mode || '1v1')} · TABLE #${String(this.tableId || '').slice(-5).toUpperCase()}`;
        const sub = document.getElementById('lobby-sub');
        if (sub) sub.textContent = `Seats ${filled}/${maxPlayers} · Ready ${readyCount}/${maxPlayers} — the dice roll when everyone is ready.`;

        const seatsHost = document.getElementById('lobby-seats');
        if (seatsHost) {
            const colors = ['#f4bb3f', '#5fe0d0', '#ff8fb1', '#a6d86b', '#c58bff', '#ff9d5c'];
            let html = '';
            for (let i = 0; i < maxPlayers; i += 1) {
                const p = state.players?.[i];
                const isYou = i === yourIndex;
                if (!p) {
                    html += `<div class="lobby-seat empty"><span class="seat-num">${i + 1}</span><span class="seat-name">OPEN SEAT</span><span class="seat-ready">WAITING</span></div>`;
                    continue;
                }
                const away = p.present === false;
                html += `<div class="lobby-seat ${p.ready ? 'ready' : ''} ${isYou ? 'you' : ''} ${away ? 'away' : ''}" style="--chip-color:${colors[i % colors.length]}">
                    <span class="seat-num">${i + 1}</span>
                    <span class="seat-name">${this.escapeHtml(p.name)}${isYou ? ' (YOU)' : ''}</span>
                    <span class="seat-ready">${away ? '⚠ AWAY — SEAT SAVED' : p.ready ? '✓ READY' : 'NOT READY'}</span>
                </div>`;
            }
            seatsHost.innerHTML = html;
        }

        const readyBtn = document.getElementById('lobby-ready-btn');
        if (readyBtn) {
            readyBtn.textContent = you?.ready ? 'UNREADY' : 'READY UP';
            readyBtn.classList.toggle('is-ready', !!you?.ready);
        }
        const status = document.getElementById('lobby-status');
        if (status) {
            if (state.canStart) status.textContent = 'ALL SEATS READY — DEALING IN…';
            else if (filled < maxPlayers) status.textContent = `Waiting for ${maxPlayers - filled} more player${maxPlayers - filled === 1 ? '' : 's'} to take a seat.`;
            else status.textContent = `${maxPlayers - readyCount} player${maxPlayers - readyCount === 1 ? ' still needs' : 's still need'} to ready up.`;
        }
    }

    hideTableLobby() {
        this.tableLobbyState = null;
        const lobby = document.getElementById('table-lobby');
        if (lobby) lobby.hidden = true;
        document.querySelector('.sixzee-board')?.classList.remove('lobby-hidden');
        document.getElementById('phase-indicator')?.classList.remove('lobby-hidden');
        document.getElementById('game-log')?.classList.remove('lobby-hidden');
    }

    renderGameState(state) {
        this.trackRound(state);
        const tableId = document.getElementById('table-id-display');
        if (tableId) tableId.textContent = this.isRemote ? `TABLE #${String(this.tableId || '').slice(-5).toUpperCase()}` : 'LOCAL SIXZEE';
        const badge = document.getElementById('mode-badge');
        if (badge) badge.textContent = this.isSinglePlayer ? 'VS AI' : 'MULTIPLAYER';

        this.renderPlayerChips(state);
        this.renderOpponents(state);
        this.renderDice(state);
        this.renderScorecards(state);
        this.renderStatus(state);
    }

    sixGlyph(filled, compact = false) {
        const total = SIXZEE_PROGRESS_ROWS.join('').split('1').length - 1;
        const progress = Math.max(0, Math.min(total, Number(filled) || 0));
        let cell = 0;
        const rows = SIXZEE_PROGRESS_ROWS.map((row) => `
            <span class="six-row">${row.split('').map((value) => {
                if (value !== '1') return '<span class="six-cell gap"></span>';
                cell += 1;
                return `<span class="six-cell ${cell <= progress ? 'lit' : ''}"></span>`;
            }).join('')}</span>`).join('');
        return `<span class="six-glyph ${compact ? 'compact' : ''}" role="img" aria-label="${progress} of ${total} categories filled">${rows}</span>`;
    }

    renderPlayerChips(state) {
        const host = document.getElementById('player-scores');
        if (!host) return;
        const colors = ['#f4bb3f', '#5fe0d0', '#ff8fb1', '#a6d86b', '#c58bff', '#ff9d5c'];
        host.innerHTML = state.players.map((p, i) => {
            const away = p.present === false;
            return `
            <div class="player-chip ${i === state.currentPlayer ? 'active' : ''} ${away ? 'away' : ''}" style="--chip-color:${colors[i % colors.length]}">
                ${this.sixGlyph(p.score?.filled || 0, true)}
                <span class="chip-copy">
                    <span class="chip-name">${this.escapeHtml(p.name)}${away ? ' · AWAY' : ''}</span>
                    ${p.sixzeeBonuses ? `<span class="chip-bonus" title="${p.sixzeeBonuses} extra Sixzee bonus">+${p.sixzeeBonuses * 100} SIXZEE</span>` : ''}
                </span>
                <b>${p.score?.total ?? 0}</b>
            </div>`;
        }).join('');
    }

    renderOpponents(state) {
        const host = document.getElementById('opponents-area');
        if (!host) return;
        const others = state.players
            .map((p, index) => ({ player: p, index }))
            .filter((entry) => entry.index !== state.yourIndex);
        host.innerHTML = others.map(({ player, index }) => `
            <div class="opponent-card ${index === state.currentPlayer ? 'active' : 'waiting'}">
                ${this.sixGlyph(player.score?.filled || 0, true)}
                <span>${this.escapeHtml(player.name)}</span>
                <b>${player.score?.total ?? 0}</b>
                <small>${player.score?.filled ?? 0}/13</small>
            </div>`).join('');
    }

    renderDice(state) {
        const tray = document.getElementById('dice-tray');
        if (!tray) return;
        // Dice carry over from the previous player, so they are only blank
        // before the very first roll of the whole game.
        const blank = !state.hasRolled && state.phase !== 'GAME_OVER';
        const canHold = state.isYourTurn && !blank && state.rollsLeft > 0 && state.phase !== 'GAME_OVER';
        tray.innerHTML = state.dice.map((die, index) => {
            const held = Boolean(die.held);
            const pips = blank ? [] : (SIXZEE_DIE_PIPS[die.value] || []);
            const face = Array.from({ length: 9 }, (_, cell) => (
                pips.includes(cell) ? '<span class="pip"></span>' : '<span></span>'
            )).join('');
            return `<button type="button" class="die ${held ? 'held' : ''} ${canHold ? '' : 'locked'}"
                        data-die-index="${index}" aria-label="Die ${index + 1}${held ? ', held' : ''}" ${canHold ? '' : 'disabled'}>
                        <span class="die-face">${face}</span>
                    </button>`;
        }).join('');
        tray.querySelectorAll('.die:not(.locked)').forEach((el) => {
            el.addEventListener('click', () => this.toggleHold(Number(el.dataset.dieIndex)));
        });

        const rolls = document.getElementById('rolls-left');
        if (rolls) rolls.textContent = state.phase === 'GAME_OVER'
            ? 'GAME OVER'
            : state.rollsLeft === 3 && state.hasRolled
                ? '3 REROLLS · DICE CARRIED'
                : `${state.rollsLeft} ROLL${state.rollsLeft === 1 ? '' : 'S'} LEFT`;
        const round = document.getElementById('round-label');
        if (round) round.textContent = `ROUND ${Math.min(state.round, 13)} / 13`;
        const rollBtn = document.getElementById('roll-btn');
        if (rollBtn) {
            rollBtn.disabled = !(state.isYourTurn && state.rollsLeft > 0 && state.phase !== 'GAME_OVER');
            rollBtn.textContent = state.hasRolled ? `REROLL (${state.rollsLeft})` : 'ROLL DICE';
        }
    }

    renderScorecards(state) {
        const player = state.players[state.yourIndex] || {};
        const card = player.scorecard || {};
        const score = player.score || this.api.scoreCard(card, player.sixzeeBonuses || 0);
        // Carried dice can be scored immediately; no need to burn a reroll.
        const canScore = state.isYourTurn && state.hasRolled && state.phase !== 'GAME_OVER';
        const values = state.dice.map((d) => d.value);
        const options = canScore ? this.api.scoreOptions(values, card) : {};
        const joker = canScore && this.api.jokerEligible(values, card);
        const cats = this.api.CATEGORIES;
        const upper = cats.filter((c) => c.group === 'upper');
        const lower = cats.filter((c) => c.group === 'lower');

        const meta = {
            ones: ['⚀', 'count × 1'], twos: ['⚁', 'count × 2'], threes: ['⚂', 'count × 3'],
            fours: ['⚃', 'count × 4'], fives: ['⚄', 'count × 5'], sixes: ['⚅', 'count × 6'],
            threeKind: ['🎯', '3 matching · all dice'], fourKind: ['🎯', '4 matching · all dice'],
            fiveKind: ['🔥', '5 matching · 45 pts'], sixzee: ['👑', 'all six · 60 pts'],
            fullHouse: ['🏠', 'three + three · 30'], smallStraight: ['🛤️', '4 in a row · 30'],
            largeStraight: ['⚡', '5 in a row · 40'],
        };

        const row = (cat) => {
            const value = card[cat.id];
            const filled = value !== null && value !== undefined;
            const preview = options[cat.id];
            const [icon, hint] = meta[cat.id] || ['🎲', ''];
            const cls = [
                'score-cell',
                filled ? 'filled' : '',
                filled && value === 0 ? 'zero' : '',
                !filled && canScore ? 'preview' : '',
                cat.id === 'sixzee' ? 'jackpot' : '',
            ].join(' ');
            const shown = filled ? value : (canScore && preview != null ? `<span class="preview-value">${preview}</span>` : '—');
            return `<button type="button" class="${cls}" data-category="${cat.id}" ${filled || !canScore ? 'disabled' : ''}>
                        <span class="cat-icon">${icon}</span>
                        <span class="cat-copy"><span class="cat-name">${cat.label}</span><small>${hint}</small></span>
                        <span class="score-value">${shown}</span>
                    </button>`;
        };

        const summary = (label, value, className = '') => `
            <div class="score-summary ${className}"><span>${label}</span><b>${value}</b></div>`;

        const upperHost = document.getElementById('upper-scorecard');
        const lowerHost = document.getElementById('lower-scorecard');
        if (upperHost) {
            upperHost.innerHTML = `
                <div class="scorecard-head"><h3>UPPER SECTION</h3><span>THE FACE CARDS</span></div>
                ${upper.map(row).join('')}
                ${summary('Upper subtotal', score.upperSubtotal, 'summary-line')}
                ${summary('Bonus · reach 84', score.bonus ? `+${score.bonus}` : '0 / 35', score.bonus ? 'summary-hit' : '')}`;
        }
        if (lowerHost) {
            lowerHost.innerHTML = `
                <div class="scorecard-head">
                    <h3>LOWER SECTION</h3>
                    ${joker ? '<span class="joker-badge">JOKER READY</span>' : '<span>THE COMBOS</span>'}
                </div>
                ${lower.map(row).join('')}
                ${summary('Sixzee bonus', `${player.sixzeeBonuses || 0} × 100 = ${score.sixzeeBonus}`, score.sixzeeBonus ? 'summary-hit' : '')}
                ${summary('Lower subtotal', score.lowerSubtotal, 'summary-line')}`;
        }
        document.querySelectorAll('.score-cell[data-category]:not(:disabled)').forEach((el) => {
            el.addEventListener('click', () => this.scoreCategory(el.dataset.category));
        });

        const totals = document.getElementById('score-totals');
        if (totals) {
            const upperPct = Math.min(100, Math.round((score.upperSubtotal / 84) * 100));
            const progressLabel = score.filled === 13
                ? 'CARD COMPLETE'
                : score.bonus ? 'UPPER BONUS LOCKED' : `${13 - score.filled} CATEGORIES OPEN`;
            totals.innerHTML = `
                <div class="sixzee-progress-card">
                    <div class="progress-six">${this.sixGlyph(score.filled)}</div>
                    <div class="progress-main">
                        <span class="progress-kicker">SIXZEE · CARD PROGRESS</span>
                        <div class="progress-title"><strong>${score.filled}</strong><span>/13</span><em>${progressLabel}</em></div>
                        <div class="bonus-meter"><span style="width:${upperPct}%"></span></div>
                        <div class="bonus-caption"><span>UPPER BONUS</span><b>${score.upperSubtotal} / 84</b><small>${score.bonus ? '+35 LOCKED' : '+35 AT 84'}</small></div>
                    </div>
                    <div class="progress-score">
                        <span>GRAND TOTAL</span>
                        <b>${score.total}</b>
                        <small>UP ${score.upperSubtotal} · LOW ${score.lowerSubtotal}${score.sixzeeBonus ? ` · +${score.sixzeeBonus}` : ''}</small>
                    </div>
                </div>`;
        }
    }

    renderStatus(state) {
        const turn = document.getElementById('turn-status');
        const phase = document.getElementById('phase-label');
        const sub = document.getElementById('phase-sub');
        const yourTurn = Boolean(state.isYourTurn);
        if (turn) turn.textContent = state.phase === 'GAME_OVER'
            ? 'GAME OVER'
            : yourTurn ? 'YOUR TURN' : `${state.players[state.currentPlayer]?.name || 'OPPONENT'}'S TURN`;
        if (phase) phase.textContent = state.phase === 'GAME_OVER' ? 'FINAL SCORE' : `ROUND ${state.round} OF 13`;
        if (sub) sub.textContent = state.phase === 'GAME_OVER'
            ? 'Highest total wins' : yourTurn ? 'Dice carry over · hold, reroll, then claim a category' : 'Waiting for the other players…';
    }

    // -----------------------------------------------------------------------
    // Player actions
    // -----------------------------------------------------------------------
    async rollAction() {
        const state = this.getCurrentState();
        if (!state.isYourTurn || state.rollsLeft <= 0 || state.phase === 'GAME_OVER') return;
        if (this.isRemote) {
            await this.network.sendGameAction('roll');
            return;
        }
        this.engine.roll();
        this.renderGameState(this.engine.getState(this.localPlayerIndex));
    }

    async toggleHold(index) {
        const state = this.getCurrentState();
        if (!state.isYourTurn || !state.hasRolled || state.rollsLeft <= 0 || state.phase === 'GAME_OVER') return;
        if (this.isRemote) {
            const mask = state.dice.reduce((acc, die, i) => (
                acc | ((i === index ? !die.held : die.held) ? (1 << i) : 0)
            ), 0);
            await this.network.sendGameAction('holds', { mask });
            return;
        }
        this.engine.toggleHold(index);
        this.renderGameState(this.engine.getState(this.localPlayerIndex));
    }

    async scoreCategory(categoryId) {
        const state = this.getCurrentState();
        if (!state.isYourTurn || !state.hasRolled || state.phase === 'GAME_OVER') return;
        if (this.isRemote) {
            await this.network.sendGameAction('score', { categoryId });
            return;
        }
        const points = this.engine.score(categoryId);
        const name = state.players[state.yourIndex]?.name || 'YOU';
        const bonus = this.engine.lastBonusAwarded ? ' +100 SIXZEE BONUS!' : '';
        this.addLogEntry(`${name} scored ${points} in ${this.api.CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId}.${bonus}`, 'score');
        const fresh = this.engine.getState(this.localPlayerIndex);
        this.renderGameState(fresh);
        if (fresh.phase === 'GAME_OVER') this.showMatchResult(fresh);
        else this.maybeRunAi();
    }

    async maybeRunAi() {
        if (this.isRemote || this.aiThinking) return;
        let state = this.engine.getState(this.localPlayerIndex);
        if (state.phase === 'GAME_OVER' || !this.aiPlayers.has(state.currentPlayer)) return;
        this.aiThinking = true;
        try {
            while (state.phase !== 'GAME_OVER' && this.aiPlayers.has(state.currentPlayer)) {
                const index = state.currentPlayer;
                const ai = this.aiPlayers.get(index);
                const name = this.engine.players[index].name;
                await new Promise((resolve) => setTimeout(resolve, 450));
                this.engine.roll();
                if (this.engine.rollsLeft > 0) {
                    const holds = ai.chooseHolds(this.engine.dice.map((d) => d.value), this.engine.player.scorecard, this.engine.rollsLeft);
                    this.engine.setHolds(holds.reduce((mask, held, i) => mask | (held ? (1 << i) : 0), 0));
                    await new Promise((resolve) => setTimeout(resolve, 400));
                    this.engine.roll();
                }
                if (this.engine.rollsLeft > 0) {
                    const holds = ai.chooseHolds(this.engine.dice.map((d) => d.value), this.engine.player.scorecard, this.engine.rollsLeft);
                    this.engine.setHolds(holds.reduce((mask, held, i) => mask | (held ? (1 << i) : 0), 0));
                    await new Promise((resolve) => setTimeout(resolve, 400));
                    this.engine.roll();
                }
                const category = ai.chooseCategory(this.engine.dice.map((d) => d.value), this.engine.player.scorecard);
                const points = this.engine.score(category);
                const bonus = this.engine.lastBonusAwarded ? ' +100 SIXZEE BONUS!' : '';
                this.addLogEntry(`${name} scored ${points} in ${this.api.CATEGORIES.find((c) => c.id === category)?.label || category}.${bonus}`, 'score');
                state = this.engine.getState(this.localPlayerIndex);
                this.renderGameState(state);
            }
            if (state.phase === 'GAME_OVER') this.showMatchResult(state);
        } finally {
            this.aiThinking = false;
        }
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------
    addLogEntry(message, type = 'system') {
        this.gameLog.push({ message, type, at: Date.now() });
        if (this.gameLog.length > 80) this.gameLog.shift();
        const host = document.getElementById('log-messages');
        if (host) {
            host.innerHTML = this.gameLog.slice(-30).reverse().map((entry) => (
                `<div class="log-message ${entry.type}">${this.escapeHtml(entry.message)}</div>`
            )).join('');
        }
    }

    updateConnectionStatus(connected) {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        const status = this.network.getConnectionStatus();
        if (dot) dot.classList.toggle('connected', Boolean(connected));
        if (text && !this.stakedMatch) {
            text.textContent = connected
                ? (status.mode === 'relay' ? 'RELAY CONNECTED' : 'SOLO MODE')
                : 'OFFLINE';
        }
    }

    showModal(title, content, actions = [], options = {}) {
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal');
        if (!overlay || !modal) return;
        document.getElementById('modal-header').textContent = title;
        document.getElementById('modal-content').innerHTML = content;
        const host = document.getElementById('modal-actions');
        host.innerHTML = '';
        (actions || []).forEach((action) => {
            const btn = document.createElement('button');
            btn.className = 'pixel-btn' + (action.class ? ' ' + action.class : '');
            btn.textContent = action.text;
            btn.addEventListener('click', () => action.action?.());
            host.appendChild(btn);
        });
        modal.className = 'modal pixel-border' + (options.className ? ' ' + options.className : '');
        overlay.classList.remove('hidden');
    }

    hideModal() {
        document.getElementById('modal-overlay')?.classList.add('hidden');
    }

    escapeHtml(text) {
        return String(text ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[char]);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SixzeeUI };
} else {
    window.SixzeeUI = SixzeeUI;
}
