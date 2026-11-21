// SIXZEE entry point — initializes the dice game and binds UI events.
let game = null;

document.addEventListener('DOMContentLoaded', async () => {
    game = new SixzeeUI();
    window.game = game;
    setupEventListeners();
    await game.init();
});

function setupEventListeners() {
    setupWalletDropdown();

    document.querySelectorAll('.mode-card').forEach((card) => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.mode-card').forEach((c) => c.classList.remove('selected'));
            card.classList.add('selected');
        });
    });

    // PLAY VS AI: signed-in accounts can stake test credits against the funded
    // AI bankroll; everyone else plays free.
    document.getElementById('play-ai-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('player-name').value.trim().toUpperCase();
        if (!name) {
            game.showModal('ERROR', 'Enter your name first!', [{ text: 'OK', action: () => game.hideModal() }]);
            return;
        }
        game.savePlayerName(name);
        const mode = document.querySelector('.mode-card.selected')?.dataset.mode || '1v1';
        const wallet = window.SixzeeWallet;
        if (wallet && wallet.isConnected()) {
            if (mode !== '1v1') {
                game.showModal('TOKEN MATCH IS 1V1',
                    '<p>The funded AI bankroll plays head-to-head token matches. Select <strong>HEAD-TO-HEAD</strong>, then press PLAY VS AI.</p>',
                    [{ text: 'OK', action: () => game.hideModal() }]);
                return;
            }
            const result = await wallet.createAiMatch();
            if (!result.ok) {
                game.showModal('TOKEN STAKE FAILED', `<p>${game.escapeHtml(result.error || 'Could not start the match.')}</p>`, [
                    { text: 'OK', action: () => game.hideModal() }
                ]);
                return;
            }
            game.startStakedAiMatch(result.data, name);
            wallet.status('STAKED — WINNER TAKES ' + result.data.stake.winnerPoints + ' TEST PTS');
            return;
        }
        game.clearStakedMatch();
        game.setupLocalGame(mode, name);
    });

    document.getElementById('join-btn')?.addEventListener('click', () => {
        const name = document.getElementById('player-name').value.trim().toUpperCase();
        if (!name) {
            game.showModal('ERROR', 'Enter your name first!', [{ text: 'OK', action: () => game.hideModal() }]);
            return;
        }
        game.savePlayerName(name);
        if (game.pendingInviteTable) {
            game.joinGame(game.pendingInviteTable);
            return;
        }
        game.showModal('READY', `Name set to: ${name}. Select a table or create one.`, [
            { text: 'OK', action: () => game.hideModal() }
        ]);
    });

    document.addEventListener('click', (e) => {
        if (e.target.id === 'create-table-btn') game.showCreateTableModal();
    });

    document.getElementById('roll-btn')?.addEventListener('click', () => game.rollAction());
    document.getElementById('rules-btn')?.addEventListener('click', () => game.showRules());
    document.getElementById('match-stats-btn')?.addEventListener('click', () => game.showLastMatchResult());

    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') game.hideModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Escape') {
            game.hideModal();
            return;
        }
        if (document.getElementById('game-screen')?.classList.contains('active') === false) return;
        if (e.key === ' ') {
            e.preventDefault();
            if (!document.getElementById('roll-btn')?.disabled) game.rollAction();
        }
        if (e.key.toLowerCase() === 'r') game.showRules();
    });
}

function setupWalletDropdown() {
    const toggle = document.getElementById('wallet-toggle');
    const menu = document.getElementById('wallet-menu');
    if (!toggle || !menu) return;

    const setOpen = (open) => {
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
    };

    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(menu.hidden);
    });

    menu.addEventListener('click', (event) => event.stopPropagation());

    document.addEventListener('click', () => {
        if (!menu.hidden) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.hidden) {
            setOpen(false);
            toggle.focus();
        }
    });
}

window.addEventListener('beforeunload', () => {
    if (game?.network) game.network.disconnect();
});

window.game = game;
