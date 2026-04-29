/**
 * UACD v2 - Ultimate Animash Combo Database
 * Minimalist, fast, accessible
 */

(function() {
    'use strict';

    const CONFIG = {
        ITEMS_PER_PAGE: 12,
        BATCH_SIZE: 6,
        DEBOUNCE_MS: 250,
        LAZY_THRESHOLD: '50px',
        ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        searchInput: $('#searchInput'),
        resultsGrid: $('#resultsGrid'),
        loadMoreWrap: $('#loadMoreWrap'),
        loadMoreBtn: $('#loadMoreBtn'),
        loadMoreCount: $('#loadMoreCount'),
        emptyState: $('#emptyState'),
        errorState: $('#errorState'),
        statsInner: $('#statsInner'),
        statTotal: $('#statTotal'),
        statSTier: $('#statSTier'),
        statAnimash: $('#statAnimash'),
        statMashy: $('#statMashy'),
        statFav: $('#statFav'),
        resultsLabel: $('#resultsLabel'),
        resultsCount: $('#resultsCount'),
        modalOverlay: $('#modalOverlay'),
        modalSheet: $('#modalSheet'),
        modalThumb: $('#modalThumb'),
        modalName: $('#modalName'),
        modalCombo: $('#modalCombo'),
        modalTier: $('#modalTier'),
        modalGame: $('#modalGame'),
        modalBody: $('#modalBody'),
        modalFav: $('#modalFav'),
        modalCopy: $('#modalCopy'),
        modalClose: $('#modalClose'),
        modalCopyCombo: $('#modalCopyCombo'),
        modalShare: $('#modalShare'),
        backToTop: $('#backToTop'),
        toastContainer: $('#toastContainer'),
        filterToggle: $('#filterToggle'),
        filterPanel: $('#filterPanel'),
        moreMenuToggle: $('#moreMenuToggle'),
        moreMenu: $('#moreMenu'),
        viewToggle: $('#viewToggle'),
        viewToggleText: $('#viewToggleText'),
        themeToggle: $('#themeToggle'),
        themeToggleText: $('#themeToggleText'),
        filterTier: $('#filterTier'),
        filterGame: $('#filterGame'),
        filterFavorites: $('#filterFavorites'),
        filterSort: $('#filterSort'),
        filterCount: $('#filterCount'),
        resetFilters: $('#resetFilters'),
        resetEmpty: $('#resetEmpty'),
        retryLoad: $('#retryLoad'),
    };

    const state = {
        allCombos: [],
        filteredCombos: [],
        comboMap: new Map(),
        currentPage: 1,
        isLoading: false,
        currentView: 'grid',
        favorites: new Set(),
        filters: {
            search: '',
            tier: 'all',
            game: 'all',
            favorites: 'all',
            sort: 'name-asc',
        },
        currentModalId: null,
    };

    let searchDebounceTimer = null;
    let abortController = null;

    // ============================
    // Favorites (localStorage)
    // ============================
    function loadFavorites() {
        try {
            const raw = localStorage.getItem('uacd-favorites');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    state.favorites = new Set(parsed);
                }
            }
        } catch (e) {
            console.warn('Failed to load favorites:', e);
        }
    }

    function saveFavorites() {
        try {
            localStorage.setItem('uacd-favorites', JSON.stringify([...state.favorites]));
        } catch (e) {
            console.warn('Failed to save favorites:', e);
        }
    }

    function toggleFavorite(id) {
        if (state.favorites.has(id)) {
            state.favorites.delete(id);
            showToast('Removed from favorites');
        } else {
            state.favorites.add(id);
            showToast('Added to favorites ⭐');
        }
        saveFavorites();
        updateFavUI(id);
        updateStats();
        if (state.filters.favorites === 'fav') {
            applyFilters();
        }
    }

    function updateFavUI(id) {
        const isFav = state.favorites.has(id);
        // Card button
        const cardBtn = $(`.combo-card[data-id="${CSS.escape(id)}"] .fav-btn`);
        if (cardBtn) cardBtn.classList.toggle('favorited', isFav);
        // Modal button
        if (state.currentModalId === id && els.modalFav) {
            els.modalFav.classList.toggle('favorited', isFav);
        }
    }

    // ============================
    // Intersection Observers
    // ============================
    const scrollTopObserver = new IntersectionObserver((entries) => {
        els.backToTop.hidden = entries[0].isIntersecting;
    }, { threshold: 0 });

    // ============================
    // Helpers
    // ============================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getTierClass(tier) {
        const t = (tier || '').toLowerCase().replace(/\s+/g, '-');
        const valid = ['s','a','b','c','d','common','unique','rare','ultra-rare','legendary','mythical','divine','supreme'];
        return valid.includes(t) ? `tier-${t}` : 'tier-common';
    }

    function getGameClass(game) {
        const g = (game || '').toLowerCase();
        if (g.includes('animash') && g.includes('mashy')) return 'game-both';
        if (g.includes('mashy')) return 'game-mashy';
        if (g.includes('animash')) return 'game-animash';
        return 'game-animash';
    }

    function getGameLabel(game) {
        const g = (game || '').toLowerCase();
        if (g.includes('animash') && g.includes('mashy')) return 'Both';
        if (g.includes('mashy')) return 'Mashy';
        return 'Animash';
    }

    function getTargetClass(target) {
        const t = (target || '').toLowerCase();
        if (t.includes('allies') || t.includes('all ally')) return 'target-allies';
        if (t.includes('ally')) return 'target-ally';
        if (t.includes('enemies') || t.includes('all enemy')) return 'target-enemies';
        if (t.includes('enemy')) return 'target-enemy';
        return 'target-self';
    }

    function getTargetLabel(target) {
        const t = (target || '').toLowerCase();
        if (t.includes('allies') || t.includes('all ally')) return 'Allies';
        if (t.includes('ally')) return 'Ally';
        if (t.includes('enemies') || t.includes('all enemy')) return 'Enemies';
        if (t.includes('enemy')) return 'Enemy';
        return 'Self';
    }

    function getSkillTypeClass(slot) {
        const s = (slot || '').toLowerCase();
        if (s.includes('ultra')) return 'ultra';
        if (s.includes('special')) return 'special';
        if (s.includes('timer')) return 'timer';
        if (s.includes('trap')) return 'trap';
        return '';
    }

    function getSkillIcon(slot) {
        const s = (slot || '').toLowerCase();
        if (s.includes('ultra')) return '⚔️';
        if (s.includes('special')) return '💥';
        if (s.includes('timer')) return '⬆️';
        if (s.includes('trap')) return '🕸️';
        return '⚔️';
    }

    function showToast(message, duration = 2500) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        els.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('Copied to clipboard!');
        }
    }

    // ============================
    // Panel / Menu Toggle
    // ============================
    function togglePanel(panel, trigger, otherPanel, otherTrigger) {
        const isHidden = panel.hidden;
        if (!otherPanel.hidden) {
            otherPanel.hidden = true;
            otherTrigger?.classList.remove('active');
            otherTrigger?.setAttribute('aria-expanded', 'false');
        }
        if (isHidden) {
            panel.hidden = false;
            trigger.classList.add('active');
            trigger.setAttribute('aria-expanded', 'true');
        } else {
            panel.hidden = true;
            trigger.classList.remove('active');
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    function closeAllPanels() {
        els.filterPanel.hidden = true;
        els.filterToggle.classList.remove('active');
        els.filterToggle.setAttribute('aria-expanded', 'false');
        els.moreMenu.hidden = true;
        els.moreMenuToggle.classList.remove('active');
        els.moreMenuToggle.setAttribute('aria-expanded', 'false');
    }

    function initPanels() {
        els.filterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel(els.filterPanel, els.filterToggle, els.moreMenu, els.moreMenuToggle);
        });
        els.moreMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel(els.moreMenu, els.moreMenuToggle, els.filterPanel, els.filterToggle);
        });
        document.addEventListener('click', () => closeAllPanels());
    }

    // ============================
    // Data Loading
    // ============================
    async function loadData() {
        if (state.isLoading) return;
        state.isLoading = true;
        els.errorState.hidden = true;

        try {
            if (abortController) abortController.abort();
            abortController = new AbortController();

            // Load manifest first
            let manifestRes;
            try {
                manifestRes = await fetch('./data/index.json', { signal: abortController.signal });
                if (!manifestRes.ok) throw new Error();
            } catch {
                // Fallback to old data.json
                manifestRes = await fetch('./data.json', { signal: abortController.signal });
                if (!manifestRes.ok) throw new Error('Failed to load data');
                const data = await manifestRes.json();
                state.allCombos = data.combos || [];
                state.comboMap = new Map(state.allCombos.map(c => [c.id, c]));
                $$('.combo-card.skeleton').forEach(el => el.remove());
                applyFilters();
                updateStats();
                updateFilterCount();
                return;
            }

            const manifest = await manifestRes.json();
            const filenames = manifest.combos || [];
            if (filenames.length === 0) throw new Error('No combos in manifest');

            // Load in batches to avoid blocking
            const loaded = [];
            for (let i = 0; i < filenames.length; i += CONFIG.BATCH_SIZE) {
                const batch = filenames.slice(i, i + CONFIG.BATCH_SIZE);
                const batchPromises = batch.map(async (filename) => {
                    try {
                        const res = await fetch(`./data/${filename}`, { signal: abortController.signal });
                        if (!res.ok) return null;
                        return await res.json();
                    } catch {
                        console.warn(`Failed to load ${filename}`);
                        return null;
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                loaded.push(...batchResults.flat().filter(Boolean));

                // Yield to browser between batches
                if (i + CONFIG.BATCH_SIZE < filenames.length) {
                    await new Promise(r => requestAnimationFrame(r));
                }
            }

            state.allCombos = loaded;
            state.comboMap = new Map(loaded.map(c => [c.id, c]));

            $$('.combo-card.skeleton').forEach(el => el.remove());

            applyFilters();
            updateStats();
            updateFilterCount();

        } catch (err) {
            console.error('Load error:', err);
            els.errorState.hidden = false;
            els.resultsGrid.innerHTML = '';
        } finally {
            state.isLoading = false;
        }
    }

    // ============================
    // Filtering & Sorting
    // ============================
    function applyFilters() {
        const { search, tier, game, favorites, sort } = state.filters;
        const q = search.toLowerCase().trim();

        let results = state.allCombos.filter(combo => {
            const matchSearch = !q ||
                combo.name?.toLowerCase().includes(q) ||
                combo.combo?.toLowerCase().includes(q) ||
                combo.tier?.toLowerCase().includes(q) ||
                combo.game?.toLowerCase().includes(q);

            const matchTier = tier === 'all' || (combo.tier || '').toLowerCase() === tier;

            const g = (combo.game || '').toLowerCase();
            const matchGame = game === 'all' ||
                (game === 'both' && g.includes('animash') && g.includes('mashy')) ||
                (game === 'animash' && g.includes('animash') && !g.includes('mashy')) ||
                (game === 'mashy' && g.includes('mashy'));

            const matchFav = favorites === 'all' || state.favorites.has(combo.id);

            return matchSearch && matchTier && matchGame && matchFav;
        });

        results.sort((a, b) => {
            switch (sort) {
                case 'name-asc': return (a.name || '').localeCompare(b.name || '');
                case 'name-desc': return (b.name || '').localeCompare(a.name || '');
                case 'tier-desc': return tierRank(b.tier) - tierRank(a.tier);
                case 'tier-asc': return tierRank(a.tier) - tierRank(b.tier);
                default: return 0;
            }
        });

        state.filteredCombos = results;
        state.currentPage = 1;
        renderCombos();
    }

    function tierRank(tier) {
        const ranks = { 's':13,'a':12,'b':11,'c':10,'d':9,'supreme':8,'divine':7,'mythical':6,'legendary':5,'ultra-rare':4,'rare':3,'unique':2,'common':1 };
        return ranks[(tier || '').toLowerCase().replace(/\s+/g, '-')] || 0;
    }

    function updateStats() {
        const total = state.allCombos.length;
        const sTier = state.allCombos.filter(c => (c.tier || '').toLowerCase() === 's').length;
        const animash = state.allCombos.filter(c => {
            const g = (c.game || '').toLowerCase();
            return g.includes('animash') && !g.includes('mashy');
        }).length;
        const mashy = state.allCombos.filter(c => (c.game || '').toLowerCase().includes('mashy')).length;
        const fav = state.favorites.size;

        els.statTotal.textContent = total;
        els.statSTier.textContent = sTier;
        els.statAnimash.textContent = animash;
        els.statMashy.textContent = mashy;
        els.statFav.textContent = fav;
    }

    function updateFilterCount() {
        const active = [];
        if (state.filters.tier !== 'all') active.push('tier');
        if (state.filters.game !== 'all') active.push('game');
        if (state.filters.favorites !== 'all') active.push('fav');
        if (state.filters.sort !== 'name-asc') active.push('sort');
        if (state.filters.search) active.push('search');

        els.filterCount.textContent = active.length > 0
            ? `${active.length} active`
            : 'No filters';
    }

    // ============================
    // Rendering
    // ============================
    function renderCombos() {
        const { filteredCombos, currentPage } = state;
        const limit = currentPage * CONFIG.ITEMS_PER_PAGE;
        const toShow = filteredCombos.slice(0, limit);

        els.resultsCount.textContent = filteredCombos.length;
        els.resultsLabel.style.display = filteredCombos.length > 0 ? 'inline' : 'none';

        if (filteredCombos.length === 0) {
            els.resultsGrid.innerHTML = '';
            els.emptyState.hidden = false;
            els.loadMoreWrap.classList.remove('visible');
            return;
        }

        els.emptyState.hidden = true;

        const fragment = document.createDocumentFragment();
        const existingIds = new Set(
            Array.from(els.resultsGrid.children)
                .filter(el => !el.classList.contains('skeleton'))
                .map(el => el.dataset.id)
        );

        toShow.forEach((combo, idx) => {
            if (existingIds.has(combo.id)) return;
            const card = createComboCard(combo, idx);
            fragment.appendChild(card);
        });

        if (fragment.childNodes.length > 0) {
            els.resultsGrid.appendChild(fragment);
        }

        const visibleIds = new Set(toShow.map(c => c.id));
        Array.from(els.resultsGrid.children).forEach(el => {
            if (!el.classList.contains('skeleton') && !visibleIds.has(el.dataset.id)) {
                el.remove();
            }
        });

        const hasMore = toShow.length < filteredCombos.length;
        if (hasMore) {
            els.loadMoreWrap.classList.add('visible');
            els.loadMoreBtn.disabled = false;
            els.loadMoreCount.textContent = `(${filteredCombos.length - toShow.length} more)`;
            els.loadMoreBtn.querySelector('.btn-text').textContent = 'Load More';
        } else if (filteredCombos.length > CONFIG.ITEMS_PER_PAGE) {
            els.loadMoreWrap.classList.add('visible');
            els.loadMoreBtn.disabled = true;
            els.loadMoreCount.textContent = '(all loaded)';
            els.loadMoreBtn.querySelector('.btn-text').textContent = 'All Loaded';
        } else {
            els.loadMoreWrap.classList.remove('visible');
        }
    }

    function createComboCard(combo, idx) {
        const article = document.createElement('article');
        article.className = 'combo-card';
        article.dataset.id = combo.id;
        article.setAttribute('role', 'listitem');
        article.setAttribute('tabindex', '0');
        article.style.animationDelay = `${(idx % CONFIG.ITEMS_PER_PAGE) * 40}ms`;

        const isFav = state.favorites.has(combo.id);
        const thumb = combo.thumbnail || '';
        const tierClass = getTierClass(combo.tier);
        const gameClass = getGameClass(combo.game);
        const gameLabel = getGameLabel(combo.game);

        article.innerHTML = `
            <div class="card-thumb">
                ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(combo.name)}" loading="lazy">` : '🎮'}
            </div>
            <div class="card-info">
                <h3 class="card-name">${escapeHtml(combo.name)}</h3>
                <p class="card-combo">${escapeHtml(combo.combo)}</p>
                <div class="card-badges">
                    <span class="tier-badge ${tierClass}">${escapeHtml(combo.tier || 'Common')}</span>
                    <span class="game-badge ${gameClass}">${gameLabel}</span>
                </div>
                <div class="card-actions">
                    <button class="card-action-btn fav-btn ${isFav ? 'favorited' : ''}" aria-label="${isFav ? 'Remove favorite' : 'Add favorite'}" title="Favorite">
                        <svg viewBox="0 0 24 24" fill="${isFav ? '#ffc832' : 'none'}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                    <button class="card-action-btn copy-btn" aria-label="Copy combo" title="Copy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Events
        article.addEventListener('click', (e) => {
            if (e.target.closest('.card-action-btn')) return;
            openModal(combo.id);
        });
        article.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal(combo.id);
            }
        });

        article.querySelector('.fav-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(combo.id);
        });

        article.querySelector('.copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(combo.combo || '');
        });

        return article;
    }

    function loadMore() {
        state.currentPage++;
        renderCombos();
        const cards = els.resultsGrid.querySelectorAll('.combo-card:not(.skeleton)');
        const firstNew = cards[(state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE];
        if (firstNew) {
            firstNew.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // ============================
    // Modal
    // ============================
    function openModal(id) {
        const combo = state.comboMap.get(id);
        if (!combo) return;
        state.currentModalId = id;

        const isFav = state.favorites.has(id);
        const tierClass = getTierClass(combo.tier);
        const gameClass = getGameClass(combo.game);
        const gameLabel = getGameLabel(combo.game);

        // Header
        const thumb = combo.thumbnail || '';
        els.modalThumb.innerHTML = thumb
            ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(combo.name)}" loading="eager">`
            : '🎮';
        els.modalName.textContent = combo.name || '';
        els.modalCombo.textContent = combo.combo || '';
        els.modalTier.className = `tier-badge ${tierClass}`;
        els.modalTier.textContent = combo.tier || 'Common';
        els.modalGame.className = `game-badge ${gameClass}`;
        els.modalGame.textContent = gameLabel;
        els.modalFav.classList.toggle('favorited', isFav);

        // Body
        let bodyHtml = '';

        // Origin
        if (combo.origin) {
            bodyHtml += `
                <div class="modal-section-label">// ORIGIN</div>
                <div class="origin-text">${escapeHtml(combo.origin)}</div>
            `;
        }

        // Lore
        if (combo.lore) {
            const loreParagraphs = combo.lore.split(/\n|\r\n/).filter(Boolean);
            bodyHtml += `
                <div class="modal-section-label">// LORE</div>
                <div class="lore-text">
                    ${loreParagraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
                </div>
            `;
        }

        // Skills
        if (combo.skills && combo.skills.length > 0) {
            bodyHtml += `<div class="modal-section-label">// SKILLS</div><div class="skills-list">`;
            combo.skills.forEach(skill => {
                const typeClass = getSkillTypeClass(skill.slot);
                const icon = getSkillIcon(skill.slot);
                const targetClass = getTargetClass(skill.target);
                const targetLabel = getTargetLabel(skill.target);
                const effects = skill.effects || [];

                let effectsHtml = '';
                effects.forEach((fx, i) => {
                    if (i > 0) effectsHtml += `<span class="hit-sep"></span>`;
                    effectsHtml += `<span class="fx-emoji">${escapeHtml(fx.emoji || '')}</span>`;
                    if (fx.stat) {
                        effectsHtml += `<span class="fx-stat">${escapeHtml(fx.stat)}</span>`;
                    }
                });

                const unlockText = skill.unlock ? `Lv.${skill.unlock}` : '';
                const timerText = skill.timer ? `${skill.timer}T` : '';

                bodyHtml += `
                    <div class="skill-card ${typeClass}">
                        <div class="skill-icon-box">${icon}</div>
                        <div class="skill-info">
                            <div class="skill-top">
                                <span class="skill-slot-label">${escapeHtml(skill.slot || 'Skill')}</span>
                                <span class="skill-name">${escapeHtml(skill.name || '')}</span>
                                ${unlockText ? `<span class="skill-unlock">${escapeHtml(unlockText)}</span>` : ''}
                                ${timerText ? `<span class="timer-turns">${escapeHtml(timerText)}</span>` : ''}
                            </div>
                            <div class="skill-effects">
                                ${effectsHtml}
                                <span class="target-tag ${targetClass}">${targetLabel}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            bodyHtml += `</div>`;
        }

        els.modalBody.innerHTML = bodyHtml;
        els.modalOverlay.hidden = false;
        document.body.style.overflow = 'hidden';
        els.modalClose.focus();
    }

    function closeModal() {
        els.modalOverlay.hidden = true;
        document.body.style.overflow = '';
        state.currentModalId = null;
    }

    // ============================
    // Theme
    // ============================
    function initTheme() {
        const saved = localStorage.getItem('uacd-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (saved === 'light' || (!saved && !prefersDark)) {
            document.body.classList.add('light-mode');
        }
        updateThemeUI();

        els.themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('uacd-theme', isLight ? 'light' : 'dark');
            updateThemeUI();
            showToast(isLight ? 'Light mode' : 'Dark mode');
        });

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('uacd-theme')) {
                document.body.classList.toggle('light-mode', !e.matches);
                updateThemeUI();
            }
        });
    }

    function updateThemeUI() {
        const isLight = document.body.classList.contains('light-mode');
        els.themeToggleText.textContent = isLight ? 'Light Mode' : 'Dark Mode';
    }

    // ============================
    // View Toggle
    // ============================
    function initViewToggle() {
        const savedView = localStorage.getItem('uacd-view') || 'grid';
        setView(savedView);

        els.viewToggle.addEventListener('click', () => {
            const newView = state.currentView === 'grid' ? 'list' : 'grid';
            setView(newView);
            localStorage.setItem('uacd-view', newView);
            updateViewUI();
            showToast(newView === 'list' ? 'List view' : 'Grid view');
        });
    }

    function setView(view) {
        state.currentView = view;
        els.resultsGrid.setAttribute('data-view', view);
        document.body.setAttribute('data-view', view);
    }

    function updateViewUI() {
        els.viewToggleText.textContent = state.currentView === 'list' ? 'List View' : 'Grid View';
    }

    // ============================
    // Filter Selects
    // ============================
    function initFilterSelects() {
        els.filterTier.addEventListener('change', () => {
            state.filters.tier = els.filterTier.value;
            applyFilters();
            updateFilterCount();
        });
        els.filterGame.addEventListener('change', () => {
            state.filters.game = els.filterGame.value;
            applyFilters();
            updateFilterCount();
        });
        els.filterFavorites.addEventListener('change', () => {
            state.filters.favorites = els.filterFavorites.value;
            applyFilters();
            updateFilterCount();
        });
        els.filterSort.addEventListener('change', () => {
            state.filters.sort = els.filterSort.value;
            applyFilters();
            updateFilterCount();
        });
    }

    // ============================
    // Event Listeners
    // ============================
    function initEventListeners() {
        // Search
        els.searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                state.filters.search = els.searchInput.value;
                applyFilters();
                updateFilterCount();
            }, CONFIG.DEBOUNCE_MS);
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                els.searchInput.focus();
                els.searchInput.select();
            }
            if (e.key === 'Escape') {
                if (!els.modalOverlay.hidden) {
                    closeModal();
                } else {
                    closeAllPanels();
                }
            }
        });

        // Modal actions
        els.modalClose.addEventListener('click', closeModal);
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });
        els.modalFav.addEventListener('click', () => {
            if (state.currentModalId) toggleFavorite(state.currentModalId);
        });
        els.modalCopy.addEventListener('click', () => {
            const combo = state.comboMap.get(state.currentModalId);
            if (combo) copyToClipboard(combo.combo || '');
        });
        els.modalCopyCombo.addEventListener('click', () => {
            const combo = state.comboMap.get(state.currentModalId);
            if (combo) copyToClipboard(combo.combo || '');
        });
        els.modalShare.addEventListener('click', () => {
            const combo = state.comboMap.get(state.currentModalId);
            if (combo) {
                const url = new URL(window.location.href);
                url.searchParams.set('combo', combo.id);
                copyToClipboard(url.toString());
            }
        });

        // Load more
        els.loadMoreBtn.addEventListener('click', loadMore);

        // Back to top
        els.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Reset
        els.resetFilters.addEventListener('click', resetAllFilters);
        els.resetEmpty.addEventListener('click', resetAllFilters);
        els.retryLoad.addEventListener('click', () => {
            els.errorState.hidden = true;
            loadData();
        });

        // Scroll observer
        const topSentinel = document.createElement('div');
        topSentinel.style.cssText = 'position:absolute;top:0;height:1px;';
        document.body.prepend(topSentinel);
        scrollTopObserver.observe(topSentinel);
    }

    function resetAllFilters() {
        state.filters = { search: '', tier: 'all', game: 'all', favorites: 'all', sort: 'name-asc' };
        els.searchInput.value = '';
        els.filterTier.value = 'all';
        els.filterGame.value = 'all';
        els.filterFavorites.value = 'all';
        els.filterSort.value = 'name-asc';
        applyFilters();
        updateFilterCount();
        showToast('Filters reset');
    }

    // ============================
    // URL params (share link)
    // ============================
    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const comboId = params.get('combo');
        if (comboId && state.comboMap.has(comboId)) {
            setTimeout(() => openModal(comboId), 500);
        }
    }

    // ============================
    // Initialize
    // ============================
    function init() {
        loadFavorites();
        initTheme();
        initViewToggle();
        initPanels();
        initFilterSelects();
        initEventListeners();
        loadData().then(() => {
            checkUrlParams();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
