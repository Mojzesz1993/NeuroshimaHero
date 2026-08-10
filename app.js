<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Karta Postaci — Neuroshima RPG (Multiplayer)</title>
    <meta name="description" content="Generator kart postaci do gry RPG w klimacie postapokaliptycznym z obsługą wielu graczy na żywo. System Neuroshima z atrybutami S.P.E.C.I.A.L.">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <!-- Firebase SDK Compat (bez modułów, działa bezpośrednio w przeglądarce) -->
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
</head>
<body>

    <div class="scanlines" aria-hidden="true"></div>

    <div class="multiplayer-bar">
        <div class="mp-container">
            <div class="mp-group">
                <span class="mp-icon">🌐</span>
                <span class="mp-label">SESJA:</span>
                <input type="text" id="mp-room" value="neuroshima-sesja-1" placeholder="Nazwa pokoju..." autocomplete="off">
            </div>
            <div class="mp-group">
                <span class="mp-label">GRACZ:</span>
                <input type="text" id="mp-player-name" placeholder="Twoje imię / nick..." autocomplete="off">
                <button class="btn btn-primary btn-sm" id="mp-connect-btn">Połącz</button>
            </div>
            <div class="mp-status" id="mp-status-indicator">
                <span class="status-dot"></span> <span id="mp-status-text">Rozłączony</span>
            </div>
        </div>
        <div class="mp-players-bar" id="mp-players-container">
            <span class="mp-players-label">Gracze online:</span>
            <div id="mp-players-list" class="mp-players-chips">
                <span class="text-muted">Brak połączenia z sesją...</span>
            </div>
        </div>
    </div>

    <header class="main-header">
        <div class="header-content">
            <div class="header-title">
                <div class="radiation-icon" aria-hidden="true">☢</div>
                <div>
                    <h1 class="glitch" data-text="KARTA POSTACI">KARTA POSTACI</h1>
                    <p class="header-subtitle">NEUROSHIMA // SYSTEM S.P.E.C.I.A.L. <span id="view-mode-badge" class="badge-edit">TRYB EDYCJI</span></p>
                </div>
            </div>
            <div class="header-actions">
                <button class="btn btn-secondary hidden" id="mp-back-to-mine" title="Wróć do swojej postaci">
                    <span class="btn-icon">←</span>
                    <span class="btn-text">Moja Postać</span>
                </button>
                <button class="btn btn-secondary hidden" id="btn-toggle-edit" title="Przełącz tryb edycji / podglądu">
                    <span class="btn-icon">🔒</span>
                    <span class="btn-text">Zablokuj edycję</span>
                </button>
                <button class="btn btn-primary" id="btn-new" title="Nowa karta postaci">
                    <span class="btn-icon">⊕</span>
                    <span class="btn-text">Nowa</span>
                </button>
                <button class="btn btn-accent" id="btn-export" title="Eksportuj do JSON">
                    <span class="btn-icon">↓</span>
                    <span class="btn-text">Eksport</span>
                </button>
                <button class="btn btn-secondary" id="btn-import" title="Wczytaj postać z JSON">
                    <span class="btn-icon">↑</span>
                    <span class="btn-text">Wczytaj</span>
                </button>
                <input type="file" id="file-import" accept=".json" hidden aria-label="Importuj plik JSON">
            </div>
        </div>
    </header>

    <main class="sheet-container" id="sheet-main-container">

        <section class="sheet-section" id="section-info">
            <div class="section-header" data-section="info">
                <div class="section-header-left">
                    <span class="section-icon">👤</span>
                    <h2>DANE PODSTAWOWE</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-info">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="char-name">Imię</label>
                        <input type="text" id="char-name" placeholder="Wpisz imię..." autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label for="char-nickname">Pseudonim</label>
                        <input type="text" id="char-nickname" placeholder="Wpisz pseudonim..." autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label for="char-age">Wiek</label>
                        <input type="number" id="char-age" min="1" max="200" placeholder="25">
                    </div>
                    <div class="form-group">
                        <label for="char-faction">Frakcja</label>
                        <select id="char-faction">
                            <option value="">— Wybierz frakcję —</option>
                            <option value="Stalowcy">Stalowcy</option>
                            <option value="Hegemonia">Hegemonia</option>
                            <option value="Moloch">Moloch</option>
                            <option value="Outpost">Outpost</option>
                            <option value="Neojunkiezi">Neojunkiezi</option>
                            <option value="Mutanci">Mutanci</option>
                            <option value="Niezrzeszeni">Niezrzeszeni</option>
                            <option value="__custom__">— Własna frakcja —</option>
                        </select>
                    </div>
                    <div class="form-group hidden" id="custom-faction-group">
                        <label for="char-faction-custom">Własna frakcja</label>
                        <input type="text" id="char-faction-custom" placeholder="Nazwa frakcji..." autocomplete="off">
                    </div>
                    <div class="form-group full-width">
                        <label for="char-description">Opis / Wygląd</label>
                        <textarea id="char-description" rows="3" placeholder="Opisz wygląd, cechy charakterystyczne..."></textarea>
                    </div>
                </div>
            </div>
        </section>

        <section class="sheet-section" id="section-attributes">
            <div class="section-header" data-section="attributes">
                <div class="section-header-left">
                    <span class="section-icon">⚡</span>
                    <h2>S.P.E.C.I.A.L.</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-attributes"></div>
        </section>

        <section class="sheet-section" id="section-skills">
            <div class="section-header" data-section="skills">
                <div class="section-header-left">
                    <span class="section-icon">🎯</span>
                    <h2>UMIEJĘTNOŚCI</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-skills"></div>
        </section>

        <section class="sheet-section" id="section-health">
            <div class="section-header" data-section="health">
                <div class="section-header-left">
                    <span class="section-icon">❤️</span>
                    <h2>ZDROWIE I STAN</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-health"></div>
        </section>

        <section class="sheet-section" id="section-weapons">
            <div class="section-header" data-section="weapons">
                <div class="section-header-left">
                    <span class="section-icon">🔫</span>
                    <h2>BROŃ</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-weapons">
                <div id="weapons-list"></div>
                <button class="btn btn-add" id="btn-add-weapon">
                    <span>＋</span> Dodaj Broń
                </button>
            </div>
        </section>

        <section class="sheet-section" id="section-items">
            <div class="section-header" data-section="items">
                <div class="section-header-left">
                    <span class="section-icon">🎒</span>
                    <h2>EKWIPUNEK</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-items">
                <div id="items-list"></div>
                <button class="btn btn-add" id="btn-add-item">
                    <span>＋</span> Dodaj Przedmiot
                </button>
            </div>
        </section>

        <section class="sheet-section" id="section-mutations">
            <div class="section-header" data-section="mutations">
                <div class="section-header-left">
                    <span class="section-icon">🧬</span>
                    <h2>MUTACJE / CECHY SPECJALNE</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-mutations">
                <div id="mutations-list"></div>
                <button class="btn btn-add" id="btn-add-mutation">
                    <span>＋</span> Dodaj Mutację
                </button>
            </div>
        </section>

        <section class="sheet-section" id="section-notes">
            <div class="section-header" data-section="notes">
                <div class="section-header-left">
                    <span class="section-icon">📝</span>
                    <h2>NOTATKI / HISTORIA</h2>
                </div>
                <span class="toggle-icon" aria-hidden="true">▾</span>
            </div>
            <div class="section-content open" id="content-notes">
                <textarea id="char-notes" rows="8" placeholder="Zapisz historię postaci, ważne wydarzenia, notatki z sesji..."></textarea>
            </div>
        </section>

    </main>

    <footer class="main-footer">
        <p>☢ NEUROSHIMA RPG — GENERATOR KART POSTACI (MULTIPLAYER) ☢</p>
        <p class="footer-sub">Dane synchronizują się automatycznie w czasie rzeczywistym</p>
    </footer>

    <div class="modal-overlay hidden" id="modal-confirm">
        <div class="modal">
            <div class="modal-header">
                <span class="modal-icon">⚠</span>
                <h3 id="modal-title">Potwierdzenie</h3>
            </div>
            <p id="modal-message">Czy na pewno chcesz kontynuować?</p>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="modal-cancel">Anuluj</button>
                <button class="btn btn-danger" id="modal-confirm-btn">Potwierdź</button>
            </div>
        </div>
    </div>

    <div class="toast hidden" id="toast">
        <span id="toast-message"></span>
    </div>

    <script src="app.js"></script>
</body>
</html>