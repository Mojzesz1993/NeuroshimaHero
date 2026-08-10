/* ═══════════════════════════════════════════════════════
   NEUROSHIMA RPG — KARTA POSTACI (MULTIPLAYER LOGIC)
   ═══════════════════════════════════════════════════════ */

// ─── FIREBASE CONFIGURATION ───
const firebaseConfig = {
  apiKey: "AIzaSyBlP27hV8sTGfqk898i1fFVvqiNE8etKHI",
  authDomain: "neuroshimarpg-1efb1.firebaseapp.com",
  projectId: "neuroshimarpg-1efb1",
  storageBucket: "neuroshimarpg-1efb1.firebasestorage.app",
  messagingSenderId: "672079265154",
  appId: "1:672079265154:web:e2d66965662df9ea38239b"
};

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

// ─── STAN MULTIPLAYER ───
let mpState = {
    room: 'neuroshima-sesja-1',
    playerId: 'gracz_' + Math.random().toString(36).substr(2, 6),
    playerName: 'Wędrowiec ' + Math.floor(Math.random() * 100),
    isConnected: false,
    isEditable: true,
    inspectingPlayerId: null,
    unsubscribe: null,
    unsubscribeList: null
};

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

// ─── STAN POSTACI ───

function createDefaultState() {
    const skills = {};
    SKILL_CATEGORIES.forEach(cat => {
        cat.skills.forEach(skill => {
            skills[skill] = 0;
        });
    });

    return {
        info: {
            name: '',
            nickname: '',
            age: '',
            faction: '',
            factionCustom: '',
            description: ''
        },
        attributes: {
            strength: 5,
            perception: 5,
            endurance: 5,
            charisma: 5,
            intelligence: 5,
            agility: 5,
            luck: 5
        },
        skills: skills,
        health: {
            hp: 100,
            maxHp: 100,
            ap: 10,
            radiation: 0
        },
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

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

// ─── TOAST ───

let toastTimeout = null;

function showToast(message, duration = 3000) {
    const toast = $('#toast');
    const toastMsg = $('#toast-message');
    toastMsg.textContent = message;
    toast.classList.remove('hidden');

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400);
    }, duration);
}

// ─── MODAL ───

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

// ─── PULSE ANIMACJA DLA PRZYCISKÓW ───

function pulseButton(btn) {
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
    setTimeout(() => btn.classList.remove('pulse'), 250);
}

// ─── RENDEROWANIE: ATRYBUTY ───

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
                            ${!isReadOnly ? `<button class="btn-minus" data-action="attr-dec" data-attr="${attr.key}" aria-label="Zmniejsz ${attr.name}">−</button>` : ''}
                            <span class="attribute-value">${value}</span>
                            ${!isReadOnly ? `<button class="btn-plus" data-action="attr-inc" data-attr="${attr.key}" aria-label="Zwiększ ${attr.name}">+</button>` : ''}
                        </div>
                    </div>
                </div>
                <div class="attribute-bar">
                    <div class="attribute-bar-fill" style="width: ${percent}%; background: ${attr.color};"></div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

// ─── RENDEROWANIE: UMIEJĘTNOŚCI ───

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
                    ${!isReadOnly ? `<button class="btn-minus" data-action="skill-dec" data-skill="${skill}" aria-label="Zmniejsz ${skill}">−</button>` : ''}
                    <span class="skill-value">${state.skills[skill]}</span>
                    ${!isReadOnly ? `<button class="btn-plus" data-action="skill-inc" data-skill="${skill}" aria-label="Zwiększ ${skill}">+</button>` : ''}
                </div>
            </div>`).join('')}
        </div>`).join('')}
    </div>`;
}

// ─── RENDEROWANIE: ZDROWIE ───

function renderHealth() {
    const container = $('#content-health');
    const h = state.health;
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    container.innerHTML = `
    <div class="health-grid">
        <div class="health-stat">
            <div class="health-stat-label">PUNKTY ŻYCIA (HP)</div>
            <div class="health-stat-controls">
                ${!isReadOnly ? `<button class="btn-minus" data-action="hp-dec" aria-label="Zmniejsz HP">−</button>` : ''}
                <span class="health-stat-value" id="hp-value">${h.hp} / ${h.maxHp}</span>
                ${!isReadOnly ? `<button class="btn-plus" data-action="hp-inc" aria-label="Zwiększ HP">+</button>` : ''}
            </div>
        </div>
        <div class="health-stat">
            <div class="health-stat-label">PUNKTY AKCJI (AP)</div>
            <div class="health-stat-controls">
                ${!isReadOnly ? `<button class="btn-minus" data-action="ap-dec" aria-label="Zmniejsz AP">−</button>` : ''}
                <span class="health-stat-value" id="ap-value">${h.ap}</span>
                ${!isReadOnly ? `<button class="btn-plus" data-action="ap-inc" aria-label="Zwiększ AP">+</button>` : ''}
            </div>
        </div>
    </div>
    <div class="radiation-container">
        <div class="radiation-header">
            <span class="radiation-label">☢ PROMIENIOWANIE</span>
            <span class="radiation-value" id="radiation-value">${h.radiation}%</span>
        </div>
        <div class="radiation-bar">
            <div class="radiation-bar-fill" id="radiation-fill" style="width: ${h.radiation}%"></div>
        </div>
        ${!isReadOnly ? `<input type="range" class="radiation-slider" id="radiation-slider" min="0" max="100" value="${h.radiation}" aria-label="Poziom promieniowania">` : ''}
    </div>
    <div class="status-container">
        <span class="status-label">STAN:</span>
        <div class="status-chips">
            ${STATUS_OPTIONS.map(s => `
            <button class="status-chip ${state.status.includes(s) ? 'active' : ''} ${isReadOnly ? 'disabled-chip' : ''}"
                    ${!isReadOnly ? `data-status="${s}" data-action="toggle-status"` : 'disabled'}>${s}</button>
            `).join('')}
        </div>
    </div>`;
}

// ─── RENDEROWANIE: BROŃ ───

function renderWeaponCard(weapon, index) {
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    return `
    <div class="weapon-card" data-weapon-id="${weapon.id}">
        <div class="weapon-card-header">
            <span class="weapon-card-title">BROŃ #${index + 1}</span>
            ${!isReadOnly ? `<button class="btn-remove" data-action="remove-weapon" data-weapon-id="${weapon.id}" aria-label="Usuń broń">✕</button>` : ''}
        </div>
        <div class="weapon-fields">
            <div class="form-group">
                <label>Nazwa</label>
                <input type="text" data-weapon-id="${weapon.id}" data-field="name"
                       value="${escapeHtml(weapon.name)}" placeholder="Nazwa broni..." autocomplete="off" ${isReadOnly ? 'disabled' : ''}>
            </div>
            <div class="form-group">
                <label>Obrażenia</label>
                <input type="text" data-weapon-id="${weapon.id}" data-field="damage"
                       value="${escapeHtml(weapon.damage)}" placeholder="np. 2k6+3" autocomplete="off" ${isReadOnly ? 'disabled' : ''}>
            </div>
        </div>
        <div class="ammo-section">
            <span class="ammo-label">NABOJE</span>
            <div class="ammo-controls">
                ${!isReadOnly ? `<button class="btn-minus" data-weapon-id="${weapon.id}" data-action="ammo-dec" aria-label="Zmniejsz naboje">−</button>` : ''}
                <span class="ammo-value" data-weapon-id="${weapon.id}">${weapon.ammo}</span>
                ${!isReadOnly ? `<button class="btn-plus" data-weapon-id="${weapon.id}" data-action="ammo-inc" aria-label="Zwiększ naboje">+</button>` : ''}
            </div>
        </div>
    </div>`;
}

function renderAllWeapons() {
    const list = $('#weapons-list');
    list.innerHTML = state.weapons.map((w, i) => renderWeaponCard(w, i)).join('');
}

// ─── RENDEROWANIE: PRZEDMIOTY ───

function renderItemCard(item, index) {
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    return `
    <div class="item-card" data-item-id="${item.id}">
        <div class="item-card-header">
            <span class="item-card-title">PRZEDMIOT #${index + 1}</span>
            ${!isReadOnly ? `<button class="btn-remove" data-action="remove-item" data-item-id="${item.id}" aria-label="Usuń przedmiot">✕</button>` : ''}
        </div>
        <div class="item-fields">
            <div class="form-group">
                <label>Nazwa</label>
                <input type="text" data-item-id="${item.id}" data-field="name"
                       value="${escapeHtml(item.name)}" placeholder="Nazwa przedmiotu..." autocomplete="off" ${isReadOnly ? 'disabled' : ''}>
            </div>
            <div class="form-group">
                <label>Ilość</label>
                <div class="item-quantity">
                    ${!isReadOnly ? `<button class="btn-minus" data-item-id="${item.id}" data-action="item-qty-dec" aria-label="Zmniejsz ilość">−</button>` : ''}
                    <span class="item-quantity-value" data-item-id="${item.id}">${item.quantity}</span>
                    ${!isReadOnly ? `<button class="btn-plus" data-item-id="${item.id}" data-action="item-qty-inc" aria-label="Zwiększ ilość">+</button>` : ''}
                </div>
            </div>
            <div class="form-group full-width">
                <label>Opis (opcjonalny)</label>
                <input type="text" data-item-id="${item.id}" data-field="description"
                       value="${escapeHtml(item.description)}" placeholder="Krótki opis..." autocomplete="off" ${isReadOnly ? 'disabled' : ''}>
            </div>
        </div>
    </div>`;
}

function renderAllItems() {
    const list = $('#items-list');
    list.innerHTML = state.items.map((item, i) => renderItemCard(item, i)).join('');
}

// ─── RENDEROWANIE: MUTACJE ───

function renderMutationCard(mutation, index) {
    const isReadOnly = mpState.inspectingPlayerId !== null || !mpState.isEditable;
    return `
    <div class="mutation-card" data-mutation-id="${mutation.id}">
        <div class="mutation-card-header">
            <span class="mutation-card-title">MUTACJA #${index + 1}</span>
            ${!isReadOnly ? `<button class="btn-remove" data-action="remove-mutation" data-mutation-id="${mutation.id}" aria-label="Usuń mutację">✕</button>` : ''}
        </div>
        <div class="mutation-fields">
            <div class="form-group">
                <label>Nazwa</label>
                <input type="text" data-mutation-id="${mutation.id}" data-field="name"
                       value="${escapeHtml(mutation.name)}" placeholder="Nazwa mutacji..." autocomplete="off" ${isReadOnly ? 'disabled' : ''}>
            </div>
            <div class="form-group full-width">
                <label>Opis / Efekt</label>
                <textarea data-mutation-id="${mutation.id}" data-field="description"
                          rows="2" placeholder="Opisz efekt mutacji..." ${isReadOnly ? 'disabled' : ''}>${escapeHtml(mutation.description)}</textarea>
            </div>
        </div>
    </div>`;
}

function renderAllMutations() {
    const list = $('#mutations-list');
    list.innerHTML = state.mutations.map((m, i) => renderMutationCard(m, i)).join('');
}

// ─── POMOCNICZE ───

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// ─── ZBIERANIE STANU Z DOM ───

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

    state.weapons.forEach(weapon => {
        const card = $(`.weapon-card[data-weapon-id="${weapon.id}"]`);
        if (card) {
            const nameInput = card.querySelector('[data-field="name"]');
            const dmgInput = card.querySelector('[data-field="damage"]');
            if (nameInput) weapon.name = nameInput.value.trim();
            if (dmgInput) weapon.damage = dmgInput.value.trim();
        }
    });

    state.items.forEach(item => {
        const card = $(`.item-card[data-item-id="${item.id}"]`);
        if (card) {
            const nameInput = card.querySelector('[data-field="name"]');
            const descInput = card.querySelector('[data-field="description"]');
            if (nameInput) item.name = nameInput.value.trim();
            if (descInput) item.description = descInput.value.trim();
        }
    });

    state.mutations.forEach(mutation => {
        const card = $(`.mutation-card[data-mutation-id="${mutation.id}"]`);
        if (card) {
            const nameInput = card.querySelector('[data-field="name"]');
            const descInput = card.querySelector('[data-field="description"]');
            if (nameInput) mutation.name = nameInput.value.trim();
            if (descInput) mutation.description = descInput.value.trim();
        }
    });

    state.notes = $('#char-notes').value;

    return JSON.parse(JSON.stringify(state));
}

// ─── ŁADOWANIE STANU DO DOM ───

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
            if (key in state.skills) {
                state.skills[key] = clamp(newState.skills[key], SKILL_MIN, SKILL_MAX);
            }
        });
    }

    Object.keys(state.attributes).forEach(key => {
        state.attributes[key] = clamp(state.attributes[key], ATTR_MIN, ATTR_MAX);
    });

    state.weapons = Array.isArray(newState.weapons)
        ? newState.weapons.map(w => ({ id: w.id || generateId(), name: w.name || '', damage: w.damage || '', ammo: w.ammo || 0 }))
        : [];

    state.items = Array.isArray(newState.items)
        ? newState.items.map(i => ({ id: i.id || generateId(), name: i.name || '', quantity: i.quantity || 1, description: i.description || '' }))
        : [];

    state.mutations = Array.isArray(newState.mutations)
        ? newState.mutations.map(m => ({ id: m.id || generateId(), name: m.name || '', description: m.description || '' }))
        : [];

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
        if (state.info.faction !== '__custom__') {
            $('#custom-faction-group').classList.add('hidden');
        }
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
    if (!mpState.isConnected || !isFirebaseInitialized || mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
    
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
        }, { merge: true }).catch(err => {
            console.error("Cloud save error:", err);
        });
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
    $('#btn-toggle-edit').classList.remove('hidden');
    showToast('✓ Połączono z sesją: ' + mpState.room);

    if (mpState.unsubscribeList) mpState.unsubscribeList();
    
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
                if (isMe) {
                    switchToMyCharacter();
                } else {
                    inspectPlayer(pId, pData.playerName);
                }
            });

            playersListEl.appendChild(chip);
        });
    });

    triggerCloudSave();
    switchToMyCharacter();
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
            if (data.data) {
                loadState(data.data);
            }
        }
    });
}

function switchToMyCharacter() {
    mpState.inspectingPlayerId = null;
    if (mpState.unsubscribe) {
        mpState.unsubscribe();
        mpState.unsubscribe = null;
    }

    $('#btn-toggle-edit').classList.remove('hidden');
    updateEditModeBadgeAndUI();
    $('#mp-back-to-mine').classList.add('hidden');

    showToast('✏ Wrzucono do Twojej postaci');
    loadState(state);
}

function toggleEditMode() {
    if (mpState.inspectingPlayerId !== null) return;
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

// ─── EKSPORT JSON ───

function exportJSON() {
    const data = gatherState();
    const exportData = JSON.parse(JSON.stringify(data));
    if (exportData.info.faction === '__custom__') {
        exportData.info.faction = exportData.info.factionCustom || 'Nieznana';
    }
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

// ─── IMPORT JSON ───

function importJSON(file) {
    if (mpState.inspectingPlayerId !== null || !mpState.isEditable) {
        showToast('✗ Nie możesz edytować ani importować w tym trybie!', 4000);
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object') throw new Error('Nieprawidłowy format pliku');
            if (!data.info && !data.attributes) throw new Error('Plik nie zawiera danych postaci');

            if (data.info && data.info.faction && !data.info.factionCustom) {
                const knownFactions = ['Stalowcy', 'Hegemonia', 'Moloch', 'Outpost', 'Neojunkiezi', 'Mutanci', 'Niezrzeszeni', ''];
                if (!knownFactions.includes(data.info.faction)) {
                    data.info.factionCustom = data.info.faction;
                    data.info.faction = '__custom__';
                }
            }

            loadState(data);
            triggerCloudSave();
            showToast('✓ Postać wczytana pomyślnie!');
        } catch (err) {
            showToast('✗ Błąd: ' + err.message, 4000);
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
}

function resetCharacter() {
    if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
    state = createDefaultState();
    loadState(state);
    triggerCloudSave();
    showToast('⊕ Utworzono nową kartę postaci');
}

// ─── OBSŁUGA ZDARZEŃ ───

function setupEventListeners() {

    $('#mp-connect-btn').addEventListener('click', connectToSession);
    $('#mp-back-to-mine').addEventListener('click', switchToMyCharacter);
    $('#btn-toggle-edit').addEventListener('click', toggleEditMode);

    document.addEventListener('click', function(e) {
        const header = e.target.closest('.section-header');
        if (!header) return;
        const section = header.closest('.sheet-section');
        const content = section.querySelector('.section-content');
        if (content) content.classList.toggle('open');
    });

    $('#char-faction').addEventListener('change', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
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
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;

        const action = btn.dataset.action;

        if (btn.classList.contains('btn-plus') || btn.classList.contains('btn-minus')) {
            pulseButton(btn);
        }

        if (action === 'attr-inc' || action === 'attr-dec') {
            const attrKey = btn.dataset.attr;
            const delta = action === 'attr-inc' ? 1 : -1;
            state.attributes[attrKey] = clamp(state.attributes[attrKey] + delta, ATTR_MIN, ATTR_MAX);
            renderAttributes();
            triggerCloudSave();
            return;
        }

        if (action === 'skill-inc' || action === 'skill-dec') {
            const skillName = btn.dataset.skill;
            const delta = action === 'skill-inc' ? 1 : -1;
            state.skills[skillName] = clamp(state.skills[skillName] + delta, SKILL_MIN, SKILL_MAX);
            renderSkills();
            triggerCloudSave();
            return;
        }

        if (action === 'hp-inc' || action === 'hp-dec') {
            const delta = action === 'hp-inc' ? 1 : -1;
            state.health.hp = clamp(state.health.hp + delta, 0, 999);
            renderHealth();
            triggerCloudSave();
            return;
        }

        if (action === 'ap-inc' || action === 'ap-dec') {
            const delta = action === 'ap-inc' ? 1 : -1;
            state.health.ap = clamp(state.health.ap + delta, 0, 99);
            renderHealth();
            triggerCloudSave();
            return;
        }

        if (action === 'toggle-status') {
            const statusName = btn.dataset.status;
            const isActive = state.status.includes(statusName);

            if (isActive) {
                state.status = state.status.filter(s => s !== statusName);
            } else {
                if (statusName === 'Zdrowy') {
                    state.status = state.status.filter(s => s !== 'Ranny' && s !== 'Ciężko ranny');
                } else if (statusName === 'Ranny' || statusName === 'Ciężko ranny') {
                    state.status = state.status.filter(s => s !== 'Zdrowy' && s !== 'Ranny' && s !== 'Ciężko ranny');
                }
                state.status.push(statusName);
            }
            renderHealth();
            triggerCloudSave();
            return;
        }

        if (action === 'ammo-inc' || action === 'ammo-dec') {
            const weaponId = btn.dataset.weaponId;
            const weapon = state.weapons.find(w => w.id === weaponId);
            if (!weapon) return;
            const delta = action === 'ammo-inc' ? 1 : -1;
            weapon.ammo = clamp(weapon.ammo + delta, 0, 9999);
            renderAllWeapons();
            triggerCloudSave();
            return;
        }

        if (action === 'remove-weapon') {
            const weaponId = btn.dataset.weaponId;
            state.weapons = state.weapons.filter(w => w.id !== weaponId);
            renderAllWeapons();
            triggerCloudSave();
            return;
        }

        if (action === 'item-qty-inc' || action === 'item-qty-dec') {
            const itemId = btn.dataset.itemId;
            const item = state.items.find(i => i.id === itemId);
            if (!item) return;
            const delta = action === 'item-qty-inc' ? 1 : -1;
            item.quantity = clamp(item.quantity + delta, 0, 9999);
            renderAllItems();
            triggerCloudSave();
            return;
        }

        if (action === 'remove-item') {
            const itemId = btn.dataset.itemId;
            state.items = state.items.filter(i => i.id !== itemId);
            renderAllItems();
            triggerCloudSave();
            return;
        }

        if (action === 'remove-mutation') {
            const mutationId = btn.dataset.mutationId;
            state.mutations = state.mutations.filter(m => m.id !== mutationId);
            renderAllMutations();
            triggerCloudSave();
            return;
        }
    });

    document.addEventListener('input', function(e) {
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

    $('#btn-add-weapon').addEventListener('click', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
        state.weapons.push({ id: generateId(), name: '', damage: '', ammo: 30 });
        renderAllWeapons();
        triggerCloudSave();
    });

    $('#btn-add-item').addEventListener('click', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
        state.items.push({ id: generateId(), name: '', quantity: 1, description: '' });
        renderAllItems();
        triggerCloudSave();
    });

    $('#btn-add-mutation').addEventListener('click', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
        state.mutations.push({ id: generateId(), name: '', description: '' });
        renderAllMutations();
        triggerCloudSave();
    });

    $('#btn-export').addEventListener('click', exportJSON);

    $('#btn-import').addEventListener('click', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
        $('#file-import').click();
    });

    $('#file-import').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            importJSON(e.target.files[0]);
            e.target.value = '';
        }
    });

    $('#btn-new').addEventListener('click', function() {
        if (mpState.inspectingPlayerId !== null || !mpState.isEditable) return;
        showModal(
            'Nowa Karta Postaci',
            'Czy na pewno chcesz utworzyć nową kartę? Obecne dane zostaną nadpisane na chmurze.',
            resetCharacter
        );
    });

    $('#modal-confirm-btn').addEventListener('click', function() {
        if (modalCallback) modalCallback();
        hideModal();
    });

    $('#modal-cancel').addEventListener('click', hideModal);
    $('#modal-confirm').addEventListener('click', function(e) {
        if (e.target === this) hideModal();
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = $('#modal-confirm');
            if (!modal.classList.contains('hidden')) hideModal();
        }
    });
}

// ─── INICJALIZACJA ───

document.addEventListener('DOMContentLoaded', function() {
    $('#mp-player-name').value = 'Gracz_' + Math.floor(Math.random() * 900 + 100);
    renderAttributes();
    renderSkills();
    renderHealth();
    setupEventListeners();
});