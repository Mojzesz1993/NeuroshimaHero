Masz w 100% rację. Automatyczna synchronizacja w obie strony (bez żadnego klikania „Zapisz”) to absolutny standard i najlepsze rozwiązanie dla aplikacji czasu rzeczywistego.

Wcześniej rozdzieliłem to przyciskiem, ponieważ w czystym JavaScripcie ciągłe nadpisywanie całej strony danymi z chmury powoduje tzw. „kradzież focusu” (jeśli gracz wpisuje historię postaci, a MG w tym samym momencie odbierze mu HP, graczowi zniknie kursor z pola tekstowego).

Rozwiązałem to za pomocą **chirurgicznych aktualizacji DOM**. Oznacza to, że Panel MG wysyła nowe statystyki w tle, a przeglądarka gracza podmienia *tylko* same cyferki zdrowia i punktów akcji, nie przerywając mu gry ani pisania notatek. Zniknął też całkowicie przycisk "Zapisz zmiany gracza" – teraz Mistrz Gry po prostu wpisuje nowe HP, a chmura aktualizuje się sama po pół sekundy.

Oto ostateczna, kompletna wersja pliku **`app.js`**, która realizuje płynną synchronizację dwukierunkową. Podmień całą jego zawartość:

```javascript
/* ═══════════════════════════════════════════════════════
   NEUROSHIMA RPG — KARTA POSTACI (MULTIPLAYER + MG LOGIC)
   ═══════════════════════════════════════════════════════ */

// ─── KONFIGURACJA FIREBASE & MG ───
const firebaseConfig = {
    apiKey: "AIzaSyD-TUTAJ_WKLEJ_SWOJ_KLUCZ",
    authDomain: "twoj-projekt.firebaseapp.com",
    projectId: "twoj-projekt",
    storageBucket: "twoj-projekt.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456789"
};

// TAJNE HASŁO DO PANELU MISTRZA GRY
const GM_PASSWORD = "neuroshima2026";

let db = null;
let isFirebaseInitialized = false;

try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        isFirebaseInitialized = true;
    }
} catch (e) {
    console.warn("Firebase initialization warning:", e);
}

// ─── STAN APLIKACJI ───
let mpState = {
    room: 'neuroshima-sesja-1',
    playerId: 'gracz_' + Math.random().toString(36).substr(2, 6),
    playerName: 'Wędrowiec ' + Math.floor(Math.random() * 100),
    isConnected: false,
    isEditable: true,
    isGM: false,
    inspectingPlayerId: null,
    unsubscribe: null,
    unsubscribeList: null,
    unsubscribeSession: null,
    unsubscribeMgPlayers: null,
    unsubscribeMine: null
};

let gmSaveTimeouts = {}; // Do auto-zapisu MG

// ─── DEFINICJE DANYCH ───

const ATTRIBUTES = [
    { key: 'strength',     letter: 'S', name: 'Siła',          color: '#ff4444' },
    { key: 'perception',   letter: 'P', name: 'Percepcja',     color: '#44aaff' },
    { key: 'endurance',    letter: 'E', name: 'Wytrzymałość',  color: '#44ff44' },
    { key: 'charisma',     letter: 'C', name: 'Charyzma',      color: '#ff44ff' },
    { key: 'intelligence', letter: 'I', name: 'Inteligencja',  color: '#ffaa44' },
    { key: 'agility',      letter: 'A', name: 'Zręczność',     color: '#44ffff' },
    { key: 'luck',         letter: 'L', name: 'Szczęście',     color: '#ffff44' }
];

const SKILL_CATEGORIES = [
    { name: 'BOJOWE',      skills: ['Broń palna', 'Broń biała', 'Broń ciężka', 'Uniki', 'Rzucanie'] },
    { name: 'PRZETRWANIE', skills: ['Przetrwanie', 'Medycyna', 'Nawigacja', 'Tropienie', 'Jazda'] },
    { name: 'TECHNICZNE',  skills: ['Mechanika', 'Elektronika', 'Informatyka', 'Chemia', 'Wytwarzanie'] },
    { name: 'SPOŁECZNE',   skills: ['Perswazja', 'Zastraszanie', 'Handel', 'Przywództwo', 'Intuicja'] },
    { name: 'SPECJALNE',   skills: ['Skradanie', 'Włamywanie', 'Spostrzegawczość', 'Zwinność', 'Wiedza'] }
];

const STATUS_OPTIONS = ['Zdrowy', 'Ranny', 'Ciężko ranny', 'Napromieniowany'];

const ATTR_MIN = 1;
const ATTR_MAX = 10;
const SKILL_MIN = 0;
const SKILL_MAX = 20;

function createDefaultState() {
    const skills = {};
    SKILL_CATEGORIES.forEach(cat => {
        cat.skills.forEach(skill => {
            skills[skill] = 0;
        });
    });

    return {
        info: { name: '', nickname: '', age: '', faction: '', factionCustom: '', description: '' },
        attributes: { strength: 5, perception: 5, endurance: 5, charisma: 5, intelligence: 5, agility: 5, luck: 5 },
        skills: skills,
        health: { hp: 100, maxHp: 100, ap: 10, radiation: 0 },
        status: [],
        weapons: [],
        items: [],
        mutations: [],
        notes: ''
    };
}

let state = createDefaultState();

// ─── NARZĘDZIA ───

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function $(selector) { return document.querySelector(selector); }
function $$(selector) { return document.querySelectorAll(selector); }

let toastTimeout = null;
function showToast(message, duration = 3000) {
    const toast = $('#toast');
    const toastMsg = $('#toast-message');
    toastMsg.textContent = message;
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, duration);
}

let modalCallback = null;
function showModal(title, message, onConfirm) {
    const overlay = $('#modal-confirm');
    $('#modal-title').textContent = title;
    $('#modal-message').textContent = message;
    overlay.classList.remove('hidden');
    modalCallback = onConfirm;
}

function hideModal() {
    $('#modal-confirm').classList.add('hidden');
    modalCallback = null;
}

function pulseButton(btn) {
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 250);
}

// ─── RENDEROWANIE ───

function renderAttributes() {
    const container = $('#content-attributes');
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    container.innerHTML = `<div class="attributes-grid">
        ${ATTRIBUTES.map(attr => {
            const value = state.attributes[attr.key];
            const percent = (value / ATTR_MAX) * 100;
            return `
            <div class="attribute-card" data-attr="${attr.key}">
                <div>
                    <div class="attribute-letter" style="color: ${attr.color}">${attr.letter}</div>
                    <div class="attribute-info">
                        <div class="attribute-name">${attr.name}</div>
                        <div class="attribute-controls">
                            ${!isReadOnly ? `<button class="btn-minus" data-action="attr-dec" data-attr="${attr.key}">−</button>` : ''}
                            <span class="attribute-value">${value}</span>
                            ${!isReadOnly ? `<button class="btn-plus" data-action="attr-inc" data-attr="${attr.key}">+</button>` : ''}
                        </div>
                    </div>
                </div>
                <div class="attribute-bar"><div class="attribute-bar-fill" style="width: ${percent}%; background: ${attr.color};"></div></div>
            </div>`;
        }).join('')}
    </div>`;
}

function renderSkills() {
    const container = $('#content-skills');
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    container.innerHTML = `<div class="skills-container">
        ${SKILL_CATEGORIES.map(cat => `
        <div class="skill-category">
            <div class="skill-category-header">${cat.name}</div>
            ${cat.skills.map(skill => `
            <div class="skill-row">
                <span class="skill-name">${skill}</span>
                <div class="skill-controls">
                    ${!isReadOnly ? `<button class="btn-minus" data-action="skill-dec" data-skill="${skill}">−</button>` : ''}
                    <span class="skill-value">${state.skills[skill]}</span>
                    ${!isReadOnly ? `<button class="btn-plus" data-action="skill-inc" data-skill="${skill}">+</button>` : ''}
                </div>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
}

function renderHealth() {
    const container = $('#content-health');
    const h = state.health;
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    container.innerHTML = `
    <div class="health-grid">
        <div class="health-stat">
            <div class="health-stat-label">PUNKTY ŻYCIA (HP)</div>
            <div class="health-stat-controls">
                ${!isReadOnly ? `<button class="btn-minus" data-action="hp-dec">−</button>` : ''}
                <span class="health-stat-value" id="hp-value">${h.hp} / ${h.maxHp}</span>
                ${!isReadOnly ? `<button class="btn-plus" data-action="hp-inc">+</button>` : ''}
            </div>
        </div>
        <div class="health-stat">
            <div class="health-stat-label">PUNKTY AKCJI (AP)</div>
            <div class="health-stat-controls">
                ${!isReadOnly ? `<button class="btn-minus" data-action="ap-dec">−</button>` : ''}
                <span class="health-stat-value" id="ap-value">${h.ap}</span>
                ${!isReadOnly ? `<button class="btn-plus" data-action="ap-inc">+</button>` : ''}
            </div>
        </div>
    </div>
    <div class="radiation-container">
        <div class="radiation-header">
            <span class="radiation-label">☢ PROMIENIOWANIE</span>
            <span class="radiation-value" id="radiation-value">${h.radiation}%</span>
        </div>
        <div class="radiation-bar"><div class="radiation-bar-fill" id="radiation-fill" style="width: ${h.radiation}%"></div></div>
        ${!isReadOnly ? `<input type="range" class="radiation-slider" id="radiation-slider" min="0" max="100" value="${h.radiation}">` : ''}
    </div>
    <div class="status-container">
        <span class="status-label">STAN:</span>
        <div class="status-chips">
            ${STATUS_OPTIONS.map(s => `
            <button class="status-chip ${state.status.includes(s) ? 'active' : ''} ${isReadOnly ? 'disabled-chip' : ''}"
                    ${!isReadOnly ? `data-status="${s}" data-action="toggle-status"` : 'disabled'}>${s}</button>`).join('')}
        </div>
    </div>`;
}

function renderWeaponCard(weapon, index) {
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    return `
    <div class="weapon-card" data-weapon-id="${weapon.id}">
        <div class="weapon-card-header">
            <span class="weapon-card-title">BROŃ #${index + 1}</span>
            ${!isReadOnly ? `<button class="btn-remove" data-action="remove-weapon" data-weapon-id="${weapon.id}">✕</button>` : ''}
        </div>
        <div class="weapon-fields">
            <div class="form-group"><label>Nazwa</label><input type="text" data-weapon-id="${weapon.id}" data-field="name" value="${escapeHtml(weapon.name)}" ${isReadOnly ? 'disabled' : ''}></div>
            <div class="form-group"><label>Obrażenia</label><input type="text" data-weapon-id="${weapon.id}" data-field="damage" value="${escapeHtml(weapon.damage)}" ${isReadOnly ? 'disabled' : ''}></div>
        </div>
        <div class="ammo-section">
            <span class="ammo-label">NABOJE</span>
            <div class="ammo-controls">
                ${!isReadOnly ? `<button class="btn-minus" data-weapon-id="${weapon.id}" data-action="ammo-dec">−</button>` : ''}
                <span class="ammo-value" data-weapon-id="${weapon.id}">${weapon.ammo}</span>
                ${!isReadOnly ? `<button class="btn-plus" data-weapon-id="${weapon.id}" data-action="ammo-inc">+</button>` : ''}
            </div>
        </div>
    </div>`;
}

function renderAllWeapons() { $('#weapons-list').innerHTML = state.weapons.map((w, i) => renderWeaponCard(w, i)).join(''); }

function renderItemCard(item, index) {
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    return `
    <div class="item-card" data-item-id="${item.id}">
        <div class="item-card-header">
            <span class="item-card-title">PRZEDMIOT #${index + 1}</span>
            ${!isReadOnly ? `<button class="btn-remove" data-action="remove-item" data-item-id="${item.id}">✕</button>` : ''}
        </div>
        <div class="item-fields">
            <div class="form-group"><label>Nazwa</label><input type="text" data-item-id="${item.id}" data-field="name" value="${escapeHtml(item.name)}" ${isReadOnly ? 'disabled' : ''}></div>
            <div class="form-group"><label>Ilość</label>
                <div class="item-quantity">
                    ${!isReadOnly ? `<button class="btn-minus" data-item-id="${item.id}" data-action="item-qty-dec">−</button>` : ''}
                    <span class="item-quantity-value" data-item-id="${item.id}">${item.quantity}</span>
                    ${!isReadOnly ? `<button class="btn-plus" data-item-id="${item.id}" data-action="item-qty-inc">+</button>` : ''}
                </div>
            </div>
            <div class="form-group full-width"><label>Opis</label><input type="text" data-item-id="${item.id}" data-field="description" value="${escapeHtml(item.description)}" ${isReadOnly ? 'disabled' : ''}></div>
        </div>
    </div>`;
}

function renderAllItems() { $('#items-list').innerHTML = state.items.map((item, i) => renderItemCard(item, i)).join(''); }

function renderMutationCard(mutation, index) {
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    return `
    <div class="mutation-card" data-mutation-id="${mutation.id}">
        <div class="mutation-card-header">
            <span class="mutation-card-title">MUTACJA #${index + 1}</span>
            ${!isReadOnly ? `<button class="btn-remove" data-action="remove-mutation" data-mutation-id="${mutation.id}">✕</button>` : ''}
        </div>
        <div class="mutation-fields">
            <div class="form-group"><label>Nazwa</label><input type="text" data-mutation-id="${mutation.id}" data-field="name" value="${escapeHtml(mutation.name)}" ${isReadOnly ? 'disabled' : ''}></div>
            <div class="form-group full-width"><label>Opis</label><textarea data-mutation-id="${mutation.id}" data-field="description" rows="2" ${isReadOnly ? 'disabled' : ''}>${escapeHtml(mutation.description)}</textarea></div>
        </div>
    </div>`;
}

function renderAllMutations() { $('#mutations-list').innerHTML = state.mutations.map((m, i) => renderMutationCard(m, i)).join(''); }

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// ─── LOGIKA STANU ───

function gatherState() {
    state.info.name = $('#char-name').value.trim();
    state.info.nickname = $('#char-nickname').value.trim();
    state.info.age = $('#char-age').value;
    const factionSelect = $('#char-faction').value;
    if (factionSelect === '__custom__') {
        state.info.faction = '__custom__';
        state.info.factionCustom = $('#char-faction-custom').value.trim();
    } else {
        state.info.faction = factionSelect;
        state.info.factionCustom = '';
    }
    state.info.description = $('#char-description').value.trim();

    state.weapons.forEach(w => {
        const card = $(`.weapon-card[data-weapon-id="${w.id}"]`);
        if (card) {
            w.name = card.querySelector('[data-field="name"]').value.trim();
            w.damage = card.querySelector('[data-field="damage"]').value.trim();
        }
    });

    state.items.forEach(i => {
        const card = $(`.item-card[data-item-id="${i.id}"]`);
        if (card) {
            i.name = card.querySelector('[data-field="name"]').value.trim();
            i.description = card.querySelector('[data-field="description"]').value.trim();
        }
    });

    state.mutations.forEach(m => {
        const card = $(`.mutation-card[data-mutation-id="${m.id}"]`);
        if (card) {
            m.name = card.querySelector('[data-field="name"]').value.trim();
            m.description = card.querySelector('[data-field="description"]').value.trim();
        }
    });

    state.notes = $('#char-notes').value;
    return JSON.parse(JSON.stringify(state));
}

function loadState(newState) {
    const defaults = createDefaultState();
    state.info = { ...defaults.info, ...(newState.info || {}) };
    state.attributes = { ...defaults.attributes, ...(newState.attributes || {}) };
    state.health = { ...defaults.health, ...(newState.health || {}) };
    state.status = Array.isArray(newState.status) ? [...newState.status] : [];
    state.notes = newState.notes || '';

    state.skills = { ...defaults.skills };
    if (newState.skills) {
        Object.keys(newState.skills).forEach(key => {
            if (key in state.skills) state.skills[key] = clamp(newState.skills[key], SKILL_MIN, SKILL_MAX);
        });
    }

    Object.keys(state.attributes).forEach(key => {
        state.attributes[key] = clamp(state.attributes[key], ATTR_MIN, ATTR_MAX);
    });

    state.weapons = Array.isArray(newState.weapons) ? newState.weapons.map(w => ({ id: w.id || generateId(), name: w.name || '', damage: w.damage || '', ammo: w.ammo || 0 })) : [];
    state.items = Array.isArray(newState.items) ? newState.items.map(i => ({ id: i.id || generateId(), name: i.name || '', quantity: i.quantity || 1, description: i.description || '' })) : [];
    state.mutations = Array.isArray(newState.mutations) ? newState.mutations.map(m => ({ id: m.id || generateId(), name: m.name || '', description: m.description || '' })) : [];

    $('#char-name').value = state.info.name;
    $('#char-nickname').value = state.info.nickname;
    $('#char-age').value = state.info.age;
    $('#char-description').value = state.info.description;
    $('#char-notes').value = state.notes;

    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    $('#char-name').disabled = isReadOnly;
    $('#char-nickname').disabled = isReadOnly;
    $('#char-age').disabled = isReadOnly;
    $('#char-faction').disabled = isReadOnly;
    $('#char-faction-custom').disabled = isReadOnly;
    $('#char-description').disabled = isReadOnly;
    $('#char-notes').disabled = isReadOnly;

    if (state.info.faction === '__custom__') {
        $('#char-faction').value = '__custom__';
        $('#custom-faction-group').classList.remove('hidden');
        $('#char-faction-custom').value = state.info.factionCustom;
    } else {
        const selectEl = $('#char-faction');
        const optionExists = Array.from(selectEl.options).some(o => o.value === state.info.faction);
        if (optionExists) {
            selectEl.value = state.info.faction;
        } else if (state.info.faction) {
            selectEl.value = '__custom__';
            $('#custom-faction-group').classList.remove('hidden');
            $('#char-faction-custom').value = state.info.faction;
            state.info.factionCustom = state.info.faction;
            state.info.faction = '__custom__';
        } else {
            selectEl.value = '';
        }
        if (state.info.faction !== '__custom__') $('#custom-faction-group').classList.add('hidden');
    }

    renderAttributes();
    renderSkills();
    renderHealth();
    renderAllWeapons();
    renderAllItems();
    renderAllMutations();
}

// ─── MULTIPLAYER SYNC (FIREBASE) ───

let saveTimeout = null;
function triggerCloudSave() {
    if (!mpState.isConnected || !isFirebaseInitialized || mpState.inspectingPlayerId !== null || !mpState.isEditable || mpState.isGM) return;
    gatherState();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const docRef = db.collection('sessions').doc(mpState.room).collection('players').doc(mpState.playerId);
        docRef.set({
            playerName: mpState.playerName,
            characterName: state.info.name || 'Bezimienny',
            faction: state.info.faction === '__custom__' ? state.info.factionCustom : (state.info.faction || 'Niezrzeszony'),
            hp: state.health.hp,
            maxHp: state.health.maxHp,
            data: state,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(err => console.error("Cloud save error:", err));
    }, 400);
}

function connectToSession() {
    if (!isFirebaseInitialized) {
        showToast('✗ Brak biblioteki Firebase lub konfiguracji.', 4000);
        return;
    }

    const roomInput = $('#mp-room').value.trim() || 'neuroshima-sesja-1';
    const nameInput = $('#mp-player-name').value.trim();

    if (!nameInput) {
        showToast('⚠ Wpisz swoje imię/nick przed połączeniem!', 3000);
        $('#mp-player-name').focus();
        return;
    }

    mpState.room = roomInput;
    mpState.playerName = nameInput;
    mpState.isConnected = true;

    $('#mp-status-text').textContent = 'Połączono (' + mpState.room + ')';
    $('#mp-status-indicator').classList.add('connected');
    if (!mpState.isGM) $('#btn-toggle-edit').classList.remove('hidden');
    showToast('✓ Połączono z sesją: ' + mpState.room);

    if (mpState.unsubscribeList) mpState.unsubscribeList();
    if (mpState.unsubscribeSession) mpState.unsubscribeSession();

    // Nasłuchuj graczy do paska online
    const playersRef = db.collection('sessions').doc(mpState.room).collection('players');
    mpState.unsubscribeList = playersRef.onSnapshot(snapshot => {
        const playersListEl = $('#mp-players-list');
        playersListEl.innerHTML = '';
        if (snapshot.empty) {
            playersListEl.innerHTML = '<span class="text-muted">Brak innych graczy w pokoju</span>';
            return;
        }
        snapshot.forEach(doc => {
            const pData = doc.data();
            const pId = doc.id;
            const isMe = pId === mpState.playerId;
            const isInspected = mpState.inspectingPlayerId === pId;

            const chip = document.createElement('button');
            chip.className = `mp-player-chip ${isMe ? 'is-me' : ''} ${isInspected ? 'is-inspected' : ''}`;
            chip.innerHTML = `
                <span class="mp-player-dot">●</span>
                <span class="mp-player-name-text">${escapeHtml(pData.playerName)} (${escapeHtml(pData.characterName || 'Brak imienia')})</span>
                <span class="mp-player-hp">[HP: ${pData.hp}/${pData.maxHp}]</span>
            `;
            chip.addEventListener('click', () => {
                if (mpState.isGM) return;
                if (isMe) switchToMyCharacter();
                else inspectPlayer(pId, pData.playerName);
            });
            playersListEl.appendChild(chip);
        });
    });

    // Nasłuchuj komunikatów MG
    const sessionRef = db.collection('sessions').doc(mpState.room);
    mpState.unsubscribeSession = sessionRef.onSnapshot(doc => {
        if (doc.exists) {
            const sData = doc.data();
            if (sData.broadcast && sData.broadcastTimestamp) {
                const now = Date.now();
                const bTime = sData.broadcastTimestamp.toMillis ? sData.broadcastTimestamp.toMillis() : now;
                if (now - bTime < 15000 && sData.broadcastSender !== mpState.playerId) {
                    showToast('📢 KOMUNIKAT OD MG: ' + sData.broadcast, 8000);
                }
            }
        }
    });

    if (!mpState.isGM) {
        triggerCloudSave();
        switchToMyCharacter();
    }
}

function inspectPlayer(targetPlayerId, targetPlayerName) {
    mpState.inspectingPlayerId = targetPlayerId;
    if (mpState.unsubscribe) mpState.unsubscribe();

    $('#btn-toggle-edit').classList.add('hidden');
    $('#view-mode-badge').textContent = `PODGLĄD GRACZA: ${targetPlayerName}`;
    $('#view-mode-badge').className = 'badge-inspect';
    $('#mp-back-to-mine').classList.remove('hidden');

    showToast(`👁 Podglądasz postać gracza: ${targetPlayerName}`);

    const docRef = db.collection('sessions').doc(mpState.room).collection('players').doc(targetPlayerId);
    mpState.unsubscribe = docRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.data) loadState(data.data);
        }
    });
}

function switchToMyCharacter() {
    mpState.inspectingPlayerId = null;
    if (mpState.unsubscribe) {
        mpState.unsubscribe();
        mpState.unsubscribe = null;
    }

    if (!mpState.isGM) {
        $('#btn-toggle-edit').classList.remove('hidden');
        updateEditModeBadgeAndUI();
    }
    $('#mp-back-to-mine').classList.add('hidden');
    $('#mp-back-to-mg').classList.add('hidden');

    showToast('✏ Wrzucono do Twojej postaci');
    
    loadState(state); // Pełne załadowanie bazy

    // Chirurgiczne nasłuchiwanie chmury (MG -> Gracz) bez utraty focusu
    if (mpState.isConnected && isFirebaseInitialized && !mpState.isGM) {
        if (mpState.unsubscribeMine) mpState.unsubscribeMine();

        const myDocRef = db.collection('sessions').doc(mpState.room).collection('players').doc(mpState.playerId);
        
        mpState.unsubscribeMine = myDocRef.onSnapshot(doc => {
            if (doc.metadata.hasPendingWrites) return; // Ignoruj to co sam właśnie wpisujesz

            if (doc.exists && mpState.inspectingPlayerId === null) {
                const cloudData = doc.data();
                if (cloudData && cloudData.data && cloudData.data.health) {
                    const h = cloudData.data.health;
                    
                    state.health.hp = h.hp;
                    state.health.maxHp = h.maxHp;
                    state.health.ap = h.ap;
                    state.health.radiation = h.radiation;

                    // Modyfikacja samych węzłów tekstowych
                    const hpEl = $('#hp-value');
                    if (hpEl) hpEl.textContent = `${h.hp} / ${h.maxHp}`;
                    
                    const apEl = $('#ap-value');
                    if (apEl) apEl.textContent = h.ap;
                    
                    const radVal = $('#radiation-value');
                    if (radVal) radVal.textContent = `${h.radiation}%`;
                    
                    const radFill = $('#radiation-fill');
                    if (radFill) radFill.style.width = `${h.radiation}%`;

                    const radSlider = $('#radiation-slider');
                    if (radSlider) radSlider.value = h.radiation;
                }
            }
        });
    }
}

function toggleEditMode() {
    if (mpState.inspectingPlayerId !== null || mpState.isGM) return;
    mpState.isEditable = !mpState.isEditable;
    updateEditModeBadgeAndUI();
    loadState(state);

    if (mpState.isEditable) {
        showToast('✏ Włączono tryb edycji');
        triggerCloudSave();
    } else {
        showToast('🔒 Edycja zablokowana (tryb podglądu karty)');
    }
}

function updateEditModeBadgeAndUI() {
    const badge = $('#view-mode-badge');
    const toggleBtn = $('#btn-toggle-edit');
    if (mpState.isEditable) {
        badge.textContent = 'TRYB EDYCJI';
        badge.className = 'badge-edit';
        toggleBtn.innerHTML = '<span class="btn-icon">🔒</span><span class="btn-text">Zablokuj edycję</span>';
    } else {
        badge.textContent = 'TRYB PODGLĄDU';
        badge.className = 'badge-inspect';
        toggleBtn.innerHTML = '<span class="btn-icon">✏</span><span class="btn-text">Włącz edycję</span>';
    }
}

// ─── PANEL MISTRZA GRY (MG) ───

function openMgLoginModal() {
    $('#mg-password-input').value = '';
    $('#modal-mg-login').classList.remove('hidden');
    $('#mg-password-input').focus();
}

function closeMgLoginModal() {
    $('#modal-mg-login').classList.add('hidden');
}

function loginAsGM() {
    const pass = $('#mg-password-input').value;
    if (pass !== GM_PASSWORD) {
        showToast('✗ Niepoprawne hasło Mistrza Gry!', 4000);
        return;
    }
    closeMgLoginModal();
    activateGMMode();
}

function activateGMMode() {
    mpState.isGM = true;
    showToast('👑 Zalogowano pomyślnie jako Mistrz Gry!');

    $('#view-mode-badge').textContent = 'PANEL MISTRZA GRY';
    $('#view-mode-badge').className = 'badge-inspect';

    $('#sheet-main-container').classList.add('hidden');
    $('#mg-dashboard-container').classList.remove('hidden');
    $('#btn-toggle-edit').classList.add('hidden');
    $('#mp-back-to-mine').classList.add('hidden');
    $('#mp-back-to-mg').classList.remove('hidden');

    loadMgContent();
    initMgPlayersManager();
}

function deactivateGMMode() {
    mpState.isGM = false;
    if (mpState.unsubscribeMgPlayers) {
        mpState.unsubscribeMgPlayers();
        mpState.unsubscribeMgPlayers = null;
    }

    $('#mg-dashboard-container').classList.add('hidden');
    $('#sheet-main-container').classList.remove('hidden');
    $('#mp-back-to-mg').classList.add('hidden');

    switchToMyCharacter();
    showToast('Wylogowano z Panelu MG');
}

// Inteligentna, dwukierunkowa lista graczy
function initMgPlayersManager() {
    if (!isFirebaseInitialized) return;
    const container = $('#mg-players-list-container');
    const playersRef = db.collection('sessions').doc(mpState.room).collection('players');

    if (mpState.unsubscribeMgPlayers) mpState.unsubscribeMgPlayers();

    container.innerHTML = ''; // Czyścimy przed startem nasłuchu

    mpState.unsubscribeMgPlayers = playersRef.onSnapshot(snapshot => {
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-muted">Brak podłączonych graczy w pokoju.</p>';
            return;
        }

        const emptyMsg = container.querySelector('.text-muted');
        if (emptyMsg) emptyMsg.remove();

        snapshot.docChanges().forEach(change => {
            const doc = change.doc;
            const pId = doc.id;
            const p = doc.data();
            const d = p.data || {};

            if (change.type === 'added') {
                const card = document.createElement('div');
                card.className = 'mg-player-card';
                card.id = `mg-card-${pId}`;
                card.innerHTML = `
                    <div class="mg-player-card-header">
                        <span id="mg-name-${pId}">${escapeHtml(p.playerName)} ➔ <strong>${escapeHtml(p.characterName || 'Bez imienia')}</strong> (${escapeHtml(p.faction || 'Brak frakcji')})</span>
                    </div>
                    <div class="mg-player-controls-grid">
                        <div class="form-group">
                            <label>HP (Aktualne / Max)</label>
                            <div class="mg-inline-inputs">
                                <input type="number" class="mg-input-hp" data-pid="${pId}" value="${d.health ? d.health.hp : 100}">
                                <span>/</span>
                                <input type="number" class="mg-input-maxhp" data-pid="${pId}" value="${d.health ? d.health.maxHp : 100}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Punkty Akcji (AP)</label>
                            <input type="number" class="mg-input-ap" data-pid="${pId}" value="${d.health ? d.health.ap : 10}">
                        </div>
                        <div class="form-group">
                            <label>Promieniowanie (%)</label>
                            <input type="number" class="mg-input-rad" data-pid="${pId}" min="0" max="100" value="${d.health ? d.health.radiation : 0}">
                        </div>
                    </div>
                    <div class="mg-player-actions">
                        <button class="btn btn-secondary btn-sm mg-inspect-player-btn" data-pid="${pId}" data-pname="${escapeHtml(p.playerName)}">👁 Podgląd pełnej karty</button>
                    </div>
                `;
                container.appendChild(card);
            }
            if (change.type === 'modified') {
                const card = document.getElementById(`mg-card-${pId}`);
                if (card) {
                    document.getElementById(`mg-name-${pId}`).innerHTML = `${escapeHtml(p.playerName)} ➔ <strong>${escapeHtml(p.characterName || 'Bez imienia')}</strong> (${escapeHtml(p.faction || 'Brak frakcji')})`;
                    
                    // Nadpisz inputy TYLKO, jeśli MG w nich akurat nie pisze
                    const hpInput = card.querySelector('.mg-input-hp');
                    if (document.activeElement !== hpInput) hpInput.value = d.health ? d.health.hp : 100;
                    
                    const maxHpInput = card.querySelector('.mg-input-maxhp');
                    if (document.activeElement !== maxHpInput) maxHpInput.value = d.health ? d.health.maxHp : 100;

                    const apInput = card.querySelector('.mg-input-ap');
                    if (document.activeElement !== apInput) apInput.value = d.health ? d.health.ap : 10;

                    const radInput = card.querySelector('.mg-input-rad');
                    if (document.activeElement !== radInput) radInput.value = d.health ? d.health.radiation : 0;
                }
            }
            if (change.type === 'removed') {
                const card = document.getElementById(`mg-card-${pId}`);
                if (card) card.remove();
            }
        });
    });
}

function saveMgContent(targetKey, textValue) {
    if (!isFirebaseInitialized) return;
    const docRef = db.collection('sessions').doc(mpState.room).collection('gm_data').doc('content');
    docRef.set({ [targetKey]: textValue }, { merge: true }).then(() => {
        showToast('✓ Zapisano pomyślnie w chmurze!');
    });
}

function loadMgContent() {
    if (!isFirebaseInitialized) return;
    const docRef = db.collection('sessions').doc(mpState.room).collection('gm_data').doc('content');
    docRef.get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if (data.locations) $('#mg-content-locations').value = data.locations;
            if (data.story) $('#mg-content-story').value = data.story;
            if (data.npcs) $('#mg-content-npcs').value = data.npcs;
            if (data.notes) $('#mg-content-notes').value = data.notes;
        }
    });
}

// ─── EKSPORT / IMPORT / NOWA ───

function exportJSON() {
    const data = gatherState();
    const exportData = JSON.parse(JSON.stringify(data));
    if (exportData.info.faction === '__custom__') exportData.info.faction = exportData.info.factionCustom || 'Nieznana';
    delete exportData.info.factionCustom;

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = (data.info.name || 'postac').replace(/[^a-zA-Z0-9_\u00C0-\u024F-]/g, '_');
    a.href = url;
    a.download = `${fileName}_neuroshima.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('☢ Karta wyeksportowana do JSON!');
}

function importJSON(file) {
    if (mpState.inspectingPlayerId !== null || !mpState.isEditable || mpState.isGM) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object') throw new Error('Nieprawidłowy format pliku');
            if (!data.info && !data.attributes) throw new Error('Plik nie zawiera danych postaci');
            loadState(data);
            triggerCloudSave();
            showToast('✓ Postać wczytana pomyślnie!');
        } catch (err) {
            showToast('✗ Błąd: ' + err.message, 4000);
        }
    };
    reader.readAsText(file);
}

function resetCharacter() {
    if (mpState.inspectingPlayerId !== null || !mpState.isEditable || mpState.isGM) return;
    state = createDefaultState();
    loadState(state);
    triggerCloudSave();
    showToast('⊕ Utworzono nową kartę postaci');
}

// ─── OBSŁUGA ZDARZEŃ ───

function setupEventListeners() {
    $('#mp-connect-btn').addEventListener('click', connectToSession);
    $('#mp-back-to-mine').addEventListener('click', switchToMyCharacter);
    $('#mp-back-to-mg').addEventListener('click', activateGMMode);
    $('#btn-toggle-edit').addEventListener('click', toggleEditMode);

    // MG Modal & Przycisk Wyjścia
    $('#mp-mg-login-btn').addEventListener('click', openMgLoginModal);
    $('#mg-login-cancel').addEventListener('click', closeMgLoginModal);
    $('#mg-login-confirm').addEventListener('click', loginAsGM);
    $('#mg-password-input').addEventListener('keydown', e => { if (e.key === 'Enter') loginAsGM(); });
    $('#mg-logout-btn').addEventListener('click', deactivateGMMode);

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('mg-inspect-player-btn')) {
            const pId = e.target.dataset.pid;
            const pName = e.target.dataset.pname;
            deactivateGMMode();
            inspectPlayer(pId, pName);
            $('#mp-back-to-mg').classList.remove('hidden');
        }
    });

    document.addEventListener('click', function(e) {
        const tabBtn = e.target.closest('.mg-tab-btn');
        if (tabBtn) {
            $$('.mg-tab-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
            $$('.mg-tab-btn').forEach(b => b.classList.add('btn-secondary'));
            tabBtn.classList.add('active', 'btn-primary');
            tabBtn.classList.remove('btn-secondary');

            $$('.mg-tab-content').forEach(c => c.classList.remove('active'));
            $('#' + tabBtn.dataset.mgTab).classList.add('active');
        }

        const saveBtn = e.target.closest('.mg-save-content-btn');
        if (saveBtn) {
            const target = saveBtn.dataset.target;
            const textVal = $('#mg-content-' + target).value;
            saveMgContent(target, textVal);
        }
    });

    $('#mg-send-broadcast-btn').addEventListener('click', function() {
        const msg = $('#mg-broadcast-input').value.trim();
        if (!msg) {
            showToast('⚠ Wpisz treść komunikatu!', 3000);
            return;
        }
        if (!isFirebaseInitialized) return;

        db.collection('sessions').doc(mpState.room).set({
            broadcast: msg,
            broadcastSender: mpState.playerId,
            broadcastTimestamp: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).then(() => {
            showToast('📢 Komunikat wysłany do całej drużyny!');
            $('#mg-broadcast-input').value = '';
        });
    });

    document.addEventListener('click', function(e) {
        const header = e.target.closest('.section-header');
        if (!header) return;
        const section = header.closest('.sheet-section');
        const content = section.querySelector('.section-content');
        if (content) content.classList.toggle('open');
    });

    $('#char-faction').addEventListener('change', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable || mpState.isGM) return;
        const customGroup = $('#custom-faction-group');
        if (this.value === '__custom__') {
            customGroup.classList.remove('hidden');
            $('#char-faction-custom').focus();
        } else {
            customGroup.classList.add('hidden');
        }
        triggerCloudSave();
    });

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable || mpState.isGM) return;

        const action = btn.dataset.action;
        if (btn.classList.contains('btn-plus') || btn.classList.contains('btn-minus')) pulseButton(btn);

        if (action === 'attr-inc' || action === 'attr-dec') {
            const attrKey = btn.dataset.attr;
            state.attributes[attrKey] = clamp(state.attributes[attrKey] + (action === 'attr-inc' ? 1 : -1), ATTR_MIN, ATTR_MAX);
            renderAttributes();
            triggerCloudSave();
            return;
        }

        if (action === 'skill-inc' || action === 'skill-dec') {
            const skillName = btn.dataset.skill;
            state.skills[skillName] = clamp(state.skills[skillName] + (action === 'skill-inc' ? 1 : -1), SKILL_MIN, SKILL_MAX);
            renderSkills();
            triggerCloudSave();
            return;
        }

        if (action === 'hp-inc' || action === 'hp-dec') {
            state.health.hp = clamp(state.health.hp + (action === 'hp-inc' ? 1 : -1), 0, 999);
            renderHealth();
            triggerCloudSave();
            return;
        }

        if (action === 'ap-inc' || action === 'ap-dec') {
            state.health.ap = clamp(state.health.ap + (action === 'ap-inc' ? 1 : -1), 0, 99);
            renderHealth();
            triggerCloudSave();
            return;
        }

        if (action === 'toggle-status') {
            const statusName = btn.dataset.status;
            if (state.status.includes(statusName)) {
                state.status = state.status.filter(s => s !== statusName);
            } else {
                if (statusName === 'Zdrowy') state.status = state.status.filter(s => s !== 'Ranny' && s !== 'Ciężko ranny');
                else if (statusName === 'Ranny' || statusName === 'Ciężko ranny') state.status = state.status.filter(s => s !== 'Zdrowy' && s !== 'Ranny' && s !== 'Ciężko ranny');
                state.status.push(statusName);
            }
            renderHealth();
            triggerCloudSave();
            return;
        }

        if (action === 'ammo-inc' || action === 'ammo-dec') {
            const weaponId = btn.dataset.weaponId;
            const w = state.weapons.find(w => w.id === weaponId);
            if (!w) return;
            w.ammo = clamp(w.ammo + (action === 'ammo-inc' ? 1 : -1), 0, 9999);
            renderAllWeapons();
            triggerCloudSave();
            return;
        }

        if (action === 'remove-weapon') {
            state.weapons = state.weapons.filter(w => w.id !== btn.dataset.weaponId);
            renderAllWeapons();
            triggerCloudSave();
            return;
        }

        if (action === 'item-qty-inc' || action === 'item-qty-dec') {
            const i = state.items.find(it => it.id === btn.dataset.itemId);
            if (!i) return;
            i.quantity = clamp(i.quantity + (action === 'item-qty-inc' ? 1 : -1), 0, 9999);
            renderAllItems();
            triggerCloudSave();
            return;
        }

        if (action === 'remove-item') {
            state.items = state.items.filter(it => it.id !== btn.dataset.itemId);
            renderAllItems();
            triggerCloudSave();
            return;
        }

        if (action === 'remove-mutation') {
            state.mutations = state.mutations.filter(m => m.id !== btn.dataset.mutationId);
            renderAllMutations();
            triggerCloudSave();
            return;
        }
    });

    document.addEventListener('input', function(e) {
        
        // AUTO-ZAPIS MG W TLE (BEZ KLIKANIA "ZAPISZ")
        if (mpState.isGM) {
            if (e.target.classList.contains('mg-input-hp') || 
                e.target.classList.contains('mg-input-maxhp') || 
                e.target.classList.contains('mg-input-ap') || 
                e.target.classList.contains('mg-input-rad')) {
                
                const pId = e.target.dataset.pid;
                if (gmSaveTimeouts[pId]) clearTimeout(gmSaveTimeouts[pId]);
                
                gmSaveTimeouts[pId] = setTimeout(() => {
                    const card = document.getElementById(`mg-card-${pId}`);
                    if (!card) return;

                    const newHp = parseInt(card.querySelector('.mg-input-hp').value) || 0;
                    const newMaxHp = parseInt(card.querySelector('.mg-input-maxhp').value) || 1;
                    const newAp = parseInt(card.querySelector('.mg-input-ap').value) || 0;
                    const newRad = parseInt(card.querySelector('.mg-input-rad').value) || 0;

                    db.collection('sessions').doc(mpState.room).collection('players').doc(pId).update({
                        hp: newHp,
                        maxHp: newMaxHp,
                        "data.health.hp": newHp,
                        "data.health.maxHp": newMaxHp,
                        "data.health.ap": newAp,
                        "data.health.radiation": newRad
                    });
                }, 400); 
            }
            return;
        }

        // AUTO-ZAPIS GRACZA W TLE
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
        
        if (e.target.id === 'radiation-slider') {
            const val = parseInt(e.target.value);
            state.health.radiation = val;
            $('#radiation-value').textContent = val + '%';
            $('#radiation-fill').style.width = val + '%';
            triggerCloudSave();
        } else if (['char-name', 'char-nickname', 'char-age', 'char-faction-custom', 'char-description', 'char-notes'].includes(e.target.id)) {
            triggerCloudSave();
        } else if (e.target.closest('.weapon-card') || e.target.closest('.item-card') || e.target.closest('.mutation-card')) {
            triggerCloudSave();
        }
    });

    $('#btn-add-weapon').addEventListener('click', () => { if (!mpState.isGM) { state.weapons.push({ id: generateId(), name: '', damage: '', ammo: 30 }); renderAllWeapons(); triggerCloudSave(); } });
    $('#btn-add-item').addEventListener('click', () => { if (!mpState.isGM) { state.items.push({ id: generateId(), name: '', quantity: 1, description: '' }); renderAllItems(); triggerCloudSave(); } });
    $('#btn-add-mutation').addEventListener('click', () => { if (!mpState.isGM) { state.mutations.push({ id: generateId(), name: '', description: '' }); renderAllMutations(); triggerCloudSave(); } });

    $('#btn-export').addEventListener('click', exportJSON);
    $('#btn-import').addEventListener('click', () => { if (!mpState.isGM) $('#file-import').click(); });
    $('#file-import').addEventListener('change', e => { if (e.target.files.length > 0) { importJSON(e.target.files[0]); e.target.value = ''; } });
    $('#btn-new').addEventListener('click', () => { if (!mpState.isGM) showModal('Nowa Karta Postaci', 'Czy na pewno chcesz utworzyć nową kartę?', resetCharacter); });

    $('#modal-confirm-btn').addEventListener('click', () => { if (modalCallback) modalCallback(); hideModal(); });
    $('#modal-cancel').addEventListener('click', hideModal);
    $('#modal-confirm').addEventListener('click', e => { if (e.target === this) hideModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideModal(); closeMgLoginModal(); } });
}

document.addEventListener('DOMContentLoaded', function() {
    $('#mp-player-name').value = 'Gracz_' + Math.floor(Math.random() * 900 + 100);
    renderAttributes();
    renderSkills();
    renderHealth();
    setupEventListeners();
});

```