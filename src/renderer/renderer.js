// Weby Multi-Session Isolated Desktop Browser Renderer Logic

(function() {
  'use strict';

  // State
  let tabs = [];
  let activeTabId = null;
  let nextSessionIndex = 1;
  let currentSettings = {
    theme: 'dark',
    accentColor: '#6366f1',
    backgroundColor: '#1e1e24',
    tabPosition: 'top',
    density: 'comfortable'
  };
  let currentProfiles = { activeProfileId: 'default', profiles: [] };

  // DOM Elements - Navigation & Core
  const tabStrip = document.getElementById('tab-strip');
  const btnNewTab = document.getElementById('btn-new-tab');
  const btnBack = document.getElementById('btn-back');
  const btnForward = document.getElementById('btn-forward');
  const btnRefresh = document.getElementById('btn-refresh');
  const addressForm = document.getElementById('address-form');
  const addressInput = document.getElementById('address-input');
  const activeSessionPill = document.getElementById('active-session-pill');
  const activeSessionNameEl = document.getElementById('active-session-name');
  const activeSessionDot = document.getElementById('active-session-dot');
  const activeProfileNameEl = document.getElementById('active-profile-name');
  const btnProfileSelector = document.getElementById('btn-profile-selector');
  const btnSessionsPanel = document.getElementById('btn-sessions-panel');
  const btnExtensionsPanel = document.getElementById('btn-extensions-panel');
  const btnSettingsPanel = document.getElementById('btn-settings-panel');
  const btnSessionManager = document.getElementById('btn-session-manager');
  const webviewContainer = document.getElementById('webview-container');
  const loadProgressBar = document.getElementById('load-progress-bar');

  // Modals
  const cookieModal = document.getElementById('cookie-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const cookiePartitionName = document.getElementById('cookie-partition-name');
  const cookieList = document.getElementById('cookie-list');

  const settingsModal = document.getElementById('settings-modal');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const themeDarkRadio = document.getElementById('theme-dark');
  const themeLightRadio = document.getElementById('theme-light');
  const themeCustomRadio = document.getElementById('theme-custom');
  const customColorControls = document.getElementById('custom-color-controls');
  const settingAccentColor = document.getElementById('setting-accent-color');
  const settingBgColor = document.getElementById('setting-bg-color');
  const accentColorHex = document.getElementById('accent-color-hex');
  const bgColorHex = document.getElementById('bg-color-hex');
  const tabPosTopRadio = document.getElementById('tab-pos-top');
  const tabPosSideRadio = document.getElementById('tab-pos-side');
  const densityComfortableRadio = document.getElementById('density-comfortable');
  const densityCompactRadio = document.getElementById('density-compact');
  const settingsStatus = document.getElementById('settings-status');

  const sessionsModal = document.getElementById('sessions-modal');
  const btnCloseSessions = document.getElementById('btn-close-sessions');
  const sessionsList = document.getElementById('sessions-list');
  const btnCreateSession = document.getElementById('btn-create-session');

  const extensionsModal = document.getElementById('extensions-modal');
  const btnCloseExtensions = document.getElementById('btn-close-extensions');
  const extensionsList = document.getElementById('extensions-list');
  const btnLoadUnpackedExt = document.getElementById('btn-load-unpacked-ext');

  const profilesModal = document.getElementById('profiles-modal');
  const btnCloseProfiles = document.getElementById('btn-close-profiles');
  const profilesList = document.getElementById('profiles-list');
  const newProfileNameInput = document.getElementById('new-profile-name');
  const btnAddProfile = document.getElementById('btn-add-profile');

  const cookieIoModal = document.getElementById('cookie-io-modal');
  const btnCloseCookieIo = document.getElementById('btn-close-cookie-io');
  const cookieIoTitle = document.getElementById('cookie-io-title');
  const cookieIoDesc = document.getElementById('cookie-io-desc');
  const cookieIoTextarea = document.getElementById('cookie-io-textarea');
  const btnCookieIoCopy = document.getElementById('btn-cookie-io-copy');
  const btnCookieIoSubmit = document.getElementById('btn-cookie-io-submit');
  let currentIoPartition = null;

  // Default demo / welcome URL
  const demoUrl = new URL('demo.html', window.location.href).href;

  function formatUrl(input) {
    let url = input.trim();
    if (!url) return 'about:blank';
    if (url === 'about:blank') return 'about:blank';
    if (url === 'weby://demo' || url === 'demo') return demoUrl;

    if (/^[a-zA-Z]+:\/\//.test(url)) {
      return url;
    }
    if (/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(:[0-9]+)?(\/.*)?$/.test(url) || url.startsWith('localhost')) {
      return 'https://' + url;
    }
    return 'https://www.google.com/search?q=' + encodeURIComponent(url);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function saveCurrentState() {
    if (!window.webyAPI || !window.webyAPI.saveState) return;
    const serializableTabs = tabs.map(tab => {
      const wv = document.getElementById(`webview-${tab.id}`);
      let currentUrl = tab.url;
      try {
        if (wv && typeof wv.getURL === 'function') {
          const u = wv.getURL();
          if (u && u !== 'about:blank') currentUrl = u;
        }
      } catch (e) {}

      return {
        id: tab.id,
        sessionName: tab.sessionName,
        sessionId: tab.sessionId,
        color: tab.color,
        partition: tab.partition,
        url: currentUrl,
        title: tab.title || tab.sessionName,
        active: tab.id === activeTabId
      };
    });

    const state = {
      nextSessionIndex,
      activeTabId,
      tabs: serializableTabs
    };

    window.webyAPI.saveState(state);
  }

  function getActiveTab() {
    return tabs.find(t => t.id === activeTabId) || null;
  }

  function getActiveWebview() {
    if (!activeTabId) return null;
    return document.getElementById(`webview-${activeTabId}`);
  }

  function updateNavControls() {
    const wv = getActiveWebview();
    const activeTab = getActiveTab();

    if (!wv || !activeTab) {
      btnBack.disabled = true;
      btnForward.disabled = true;
      addressInput.value = '';
      activeSessionNameEl.textContent = 'No Session';
      return;
    }

    // Update session name & dot
    activeSessionNameEl.textContent = activeTab.sessionName;
    if (activeSessionDot) {
      activeSessionDot.style.backgroundColor = activeTab.color || '#10b981';
    }

    // Update navigation buttons
    try {
      btnBack.disabled = !wv.canGoBack();
      btnForward.disabled = !wv.canGoForward();
    } catch (e) {
      btnBack.disabled = true;
      btnForward.disabled = true;
    }

    // Update address bar
    try {
      const currentUrl = wv.getURL();
      if (currentUrl === demoUrl) {
        addressInput.value = 'weby://demo';
      } else if (currentUrl && currentUrl !== 'about:blank') {
        addressInput.value = currentUrl;
      } else {
        addressInput.value = activeTab.url === demoUrl ? 'weby://demo' : (activeTab.url || '');
      }
    } catch (e) {
      addressInput.value = activeTab.url || '';
    }
  }

  function createTabElement(tabData) {
    const tabEl = document.createElement('div');
    tabEl.id = `tab-header-${tabData.id}`;
    tabEl.className = 'tab' + (tabData.id === activeTabId ? ' active' : '');
    tabEl.setAttribute('role', 'tab');
    tabEl.setAttribute('data-tab-id', tabData.id);

    // Session badge
    const sessionBadge = document.createElement('span');
    sessionBadge.className = 'tab-session-badge';
    sessionBadge.id = `badge-${tabData.id}`;
    sessionBadge.textContent = tabData.sessionName;
    sessionBadge.title = `Isolated Session: ${tabData.sessionName} (${tabData.partition})`;
    if (tabData.color) {
      sessionBadge.style.backgroundColor = tabData.color;
    }

    // Tab title
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.id = `title-${tabData.id}`;
    titleEl.textContent = tabData.title || tabData.sessionName;

    // Close tab button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close Tab (Ctrl+W)';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tabData.id);
    });

    tabEl.appendChild(sessionBadge);
    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);

    // Switch to tab on click
    tabEl.addEventListener('click', () => {
      switchTab(tabData.id);
    });

    // Double click badge to rename session
    sessionBadge.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      promptRenameSession(tabData.id);
    });

    return tabEl;
  }

  function createWebviewElement(tabData) {
    const wv = document.createElement('webview');
    wv.id = `webview-${tabData.id}`;
    wv.className = 'tab-webview' + (tabData.id === activeTabId ? ' active' : '');
    wv.setAttribute('partition', tabData.partition);
    wv.setAttribute('allowpopups', 'true');
    wv.setAttribute('src', tabData.url || demoUrl);

    // Webview event handlers
    wv.addEventListener('did-start-loading', () => {
      if (tabData.id === activeTabId) {
        loadProgressBar.className = 'loading';
      }
    });

    wv.addEventListener('did-stop-loading', () => {
      if (tabData.id === activeTabId) {
        loadProgressBar.className = 'finished';
        setTimeout(() => {
          if (loadProgressBar.className === 'finished') {
            loadProgressBar.className = '';
          }
        }, 300);
        updateNavControls();
      }
      saveCurrentState();
    });

    wv.addEventListener('did-navigate', (event) => {
      tabData.url = event.url;
      if (tabData.id === activeTabId) {
        updateNavControls();
      }
      saveCurrentState();
    });

    wv.addEventListener('did-navigate-in-page', (event) => {
      tabData.url = event.url;
      if (tabData.id === activeTabId) {
        updateNavControls();
      }
      saveCurrentState();
    });

    wv.addEventListener('page-title-updated', (event) => {
      tabData.title = event.title;
      const titleEl = document.getElementById(`title-${tabData.id}`);
      if (titleEl) {
        titleEl.textContent = event.title || tabData.sessionName;
      }
      saveCurrentState();
    });

    wv.addEventListener('did-fail-load', (event) => {
      console.warn(`[Webview] Failed to load "${event.validatedURL}": ${event.errorDescription} (${event.errorCode})`);
      if (tabData.id === activeTabId) {
        loadProgressBar.className = '';
        updateNavControls();
      }
    });

    wv.addEventListener('new-window', (e) => {
      e.preventDefault();
      addNewTab(null, e.url);
    });

    return wv;
  }

  function switchTab(tabId) {
    if (!tabs.some(t => t.id === tabId)) return;

    activeTabId = tabId;

    // Update tab bar UI
    document.querySelectorAll('.tab').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-tab-id') === tabId);
    });

    // Update webview elements
    document.querySelectorAll('.tab-webview').forEach(el => {
      el.classList.toggle('active', el.id === `webview-${tabId}`);
    });

    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.active = true;
    }

    updateNavControls();
    saveCurrentState();
  }

  async function addNewTab(customName = null, initialUrl = null, sessionOptions = null) {
    const targetUrl = initialUrl || demoUrl;
    let tabData;

    const payload = {
      sessionIndex: nextSessionIndex++,
      customName,
      initialUrl: targetUrl,
      ...(sessionOptions || {})
    };

    if (window.webyAPI && window.webyAPI.createTab) {
      tabData = await window.webyAPI.createTab(payload);
    } else {
      const idx = nextSessionIndex;
      tabData = {
        id: `tab-${Date.now()}`,
        sessionName: customName || `Session ${idx}`,
        partition: `persist:weby_session_${Date.now()}`,
        url: targetUrl,
        title: customName || `Session ${idx}`,
        active: true
      };
    }

    tabs.push(tabData);

    const tabEl = createTabElement(tabData);
    tabStrip.appendChild(tabEl);

    const wvEl = createWebviewElement(tabData);
    webviewContainer.appendChild(wvEl);

    switchTab(tabData.id);
    tabEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
    return tabData;
  }

  function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tabEl = document.getElementById(`tab-header-${tabId}`);
    if (tabEl) tabEl.remove();

    const wvEl = document.getElementById(`webview-${tabId}`);
    if (wvEl) wvEl.remove();

    tabs.splice(tabIndex, 1);

    if (activeTabId === tabId) {
      if (tabs.length > 0) {
        const nextIndex = Math.min(tabIndex, tabs.length - 1);
        switchTab(tabs[nextIndex].id);
      } else {
        addNewTab();
      }
    } else {
      saveCurrentState();
    }
  }

  function promptRenameSession(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const newName = prompt('Enter a new name for this isolated session:', tab.sessionName);
    if (newName && newName.trim()) {
      tab.sessionName = newName.trim();
      const badge = document.getElementById(`badge-${tabId}`);
      if (badge) badge.textContent = tab.sessionName;

      if (tabId === activeTabId) {
        activeSessionNameEl.textContent = tab.sessionName;
      }
      saveCurrentState();

      // If backend session rename API available, sync it
      if (tab.sessionId && window.webyAPI && window.webyAPI.renameSession) {
        window.webyAPI.renameSession(tab.sessionId, tab.sessionName).catch(() => {});
      }
    }
  }

  // Settings & Theme Management
  function applySettings(settings) {
    currentSettings = { ...currentSettings, ...settings };
    const doc = document.documentElement;

    doc.setAttribute('data-theme', currentSettings.theme);
    doc.setAttribute('data-tab-position', currentSettings.tabPosition);
    doc.setAttribute('data-density', currentSettings.density);

    // Apply colors
    if (currentSettings.accentColor) {
      doc.style.setProperty('--accent-color', currentSettings.accentColor);
      doc.style.setProperty('--badge-bg', currentSettings.accentColor);
    }

    if (currentSettings.theme === 'custom' && currentSettings.backgroundColor) {
      doc.style.setProperty('--bg-primary', currentSettings.backgroundColor);
      doc.style.setProperty('--bg-secondary', lightenDarkenColor(currentSettings.backgroundColor, 15));
      doc.style.setProperty('--bg-tab-active', lightenDarkenColor(currentSettings.backgroundColor, 25));
      doc.style.setProperty('--bg-hover', lightenDarkenColor(currentSettings.backgroundColor, 35));
      doc.style.setProperty('--bg-input', lightenDarkenColor(currentSettings.backgroundColor, -15));
    } else {
      // Remove custom background overrides for default themes
      doc.style.removeProperty('--bg-primary');
      doc.style.removeProperty('--bg-secondary');
      doc.style.removeProperty('--bg-tab-active');
      doc.style.removeProperty('--bg-hover');
      doc.style.removeProperty('--bg-input');
    }

    // Sync UI form controls if open
    syncSettingsForm();
  }

  function lightenDarkenColor(col, amt) {
    let usePound = false;
    if (col[0] === '#') {
      col = col.slice(1);
      usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? '#' : '') + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  }

  function syncSettingsForm() {
    if (currentSettings.theme === 'dark') themeDarkRadio.checked = true;
    else if (currentSettings.theme === 'light') themeLightRadio.checked = true;
    else if (currentSettings.theme === 'custom') themeCustomRadio.checked = true;

    if (currentSettings.tabPosition === 'side') tabPosSideRadio.checked = true;
    else tabPosTopRadio.checked = true;

    if (currentSettings.density === 'compact') densityCompactRadio.checked = true;
    else densityComfortableRadio.checked = true;

    settingAccentColor.value = currentSettings.accentColor || '#6366f1';
    accentColorHex.textContent = currentSettings.accentColor || '#6366f1';

    settingBgColor.value = currentSettings.backgroundColor || '#1e1e24';
    bgColorHex.textContent = currentSettings.backgroundColor || '#1e1e24';
  }

  async function updateSetting(key, val) {
    currentSettings[key] = val;
    applySettings(currentSettings);
    if (window.webyAPI && window.webyAPI.saveSettings) {
      await window.webyAPI.saveSettings(currentSettings);
      settingsStatus.textContent = 'Settings saved live';
      setTimeout(() => { settingsStatus.textContent = 'Settings saved automatically'; }, 1500);
    }
  }

  // Advanced Sessions Control Panel Logic
  async function renderSessionsList() {
    if (!window.webyAPI || !window.webyAPI.getSessions) return;
    sessionsList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">Loading sessions metadata...</div>';

    try {
      const sessions = await window.webyAPI.getSessions();
      if (!sessions || sessions.length === 0) {
        sessionsList.innerHTML = '<em>No sessions configured.</em>';
        return;
      }

      sessionsList.innerHTML = '';
      sessions.forEach(sess => {
        const card = document.createElement('div');
        card.className = 'session-card';

        card.innerHTML = `
          <div class="session-card-header">
            <div class="session-title-group">
              <span class="session-color-tag" style="background-color: ${escapeHtml(sess.color || '#6366f1')}"></span>
              <span class="session-name-text">${escapeHtml(sess.name)}</span>
            </div>
            <div class="session-meta-chips">
              <span class="meta-chip"><strong>${sess.tabCount || 0}</strong> tabs</span>
              <span class="meta-chip"><strong>${sess.cookieCount || 0}</strong> cookies</span>
              <span class="meta-chip"><strong>${formatBytes(sess.storageSize)}</strong> storage</span>
            </div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">
            Partition: <code>${escapeHtml(sess.partition)}</code>
          </div>
          <div class="session-actions-row">
            <button class="sm-btn btn-open-tab" data-id="${escapeHtml(sess.id)}">Open Tab</button>
            <button class="sm-btn btn-rename-sess" data-id="${escapeHtml(sess.id)}">Rename</button>
            <button class="sm-btn btn-duplicate-sess" data-id="${escapeHtml(sess.id)}">Duplicate</button>
            <button class="sm-btn btn-export-cookies" data-partition="${escapeHtml(sess.partition)}" data-name="${escapeHtml(sess.name)}">Export Cookies</button>
            <button class="sm-btn btn-import-cookies" data-partition="${escapeHtml(sess.partition)}" data-name="${escapeHtml(sess.name)}">Import Cookies</button>
            <button class="sm-btn btn-clear-sess" data-partition="${escapeHtml(sess.partition)}">Clear Data</button>
            <button class="sm-btn danger-btn btn-delete-sess" data-id="${escapeHtml(sess.id)}">Delete</button>
          </div>
        `;

        // Action Handlers
        card.querySelector('.btn-open-tab').addEventListener('click', () => {
          sessionsModal.classList.add('hidden');
          addNewTab(sess.name, demoUrl, {
            sessionId: sess.id,
            customName: sess.name,
            color: sess.color
          });
        });

        card.querySelector('.btn-rename-sess').addEventListener('click', async () => {
          const newName = prompt('Enter new session name:', sess.name);
          if (newName && newName.trim()) {
            await window.webyAPI.renameSession(sess.id, newName.trim());
            // Update open tabs with that session
            tabs.forEach(t => {
              if (t.sessionId === sess.id || t.partition === sess.partition) {
                t.sessionName = newName.trim();
                const b = document.getElementById(`badge-${t.id}`);
                if (b) b.textContent = newName.trim();
              }
            });
            updateNavControls();
            renderSessionsList();
          }
        });

        card.querySelector('.btn-duplicate-sess').addEventListener('click', async () => {
          await window.webyAPI.duplicateSession(sess.id);
          renderSessionsList();
        });

        card.querySelector('.btn-clear-sess').addEventListener('click', async () => {
          if (confirm(`Clear all cookies and cache for session "${sess.name}"?`)) {
            await window.webyAPI.clearPartition(sess.partition);
            renderSessionsList();
          }
        });

        card.querySelector('.btn-delete-sess').addEventListener('click', async () => {
          if (confirm(`Delete session "${sess.name}" and remove associated tabs?`)) {
            try {
              await window.webyAPI.deleteSession(sess.id);
              // Re-load tabs
              const restoredState = await window.webyAPI.loadState();
              reloadTabsFromState(restoredState);
              renderSessionsList();
            } catch (e) {
              alert(e.message);
            }
          }
        });

        card.querySelector('.btn-export-cookies').addEventListener('click', async () => {
          try {
            const cookiesJson = await window.webyAPI.exportCookies(sess.partition);
            currentIoPartition = sess.partition;
            cookieIoTitle.textContent = `Export Cookies: ${sess.name}`;
            cookieIoDesc.textContent = `JSON dump for partition ${sess.partition}`;
            cookieIoTextarea.value = cookiesJson;
            cookieIoTextarea.readOnly = true;
            btnCookieIoSubmit.style.display = 'none';
            btnCookieIoCopy.style.display = 'inline-block';
            cookieIoModal.classList.remove('hidden');
          } catch (e) {
            alert('Export failed: ' + e.message);
          }
        });

        card.querySelector('.btn-import-cookies').addEventListener('click', () => {
          currentIoPartition = sess.partition;
          cookieIoTitle.textContent = `Import Cookies: ${sess.name}`;
          cookieIoDesc.textContent = `Paste JSON array of cookie objects to import into ${sess.partition}`;
          cookieIoTextarea.value = '[\n  {\n    "name": "session_id",\n    "value": "xyz123",\n    "domain": "example.com"\n  }\n]';
          cookieIoTextarea.readOnly = false;
          btnCookieIoSubmit.style.display = 'inline-block';
          btnCookieIoCopy.style.display = 'none';
          cookieIoModal.classList.remove('hidden');
        });

        sessionsList.appendChild(card);
      });
    } catch (e) {
      sessionsList.textContent = 'Error loading sessions: ' + e.message;
    }
  }

  // Chrome Extensions Manager Logic
  async function renderExtensionsList() {
    if (!window.webyAPI || !window.webyAPI.getExtensions) return;
    extensionsList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">Loading extensions...</div>';

    try {
      const exts = await window.webyAPI.getExtensions();
      if (!exts || exts.length === 0) {
        extensionsList.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-muted); font-size: 12px;">No unpacked extensions loaded for this profile yet. Click "Load Unpacked Extension..." above.</div>';
        return;
      }

      extensionsList.innerHTML = '';
      exts.forEach(ext => {
        const card = document.createElement('div');
        card.className = 'ext-card';
        card.innerHTML = `
          <div class="ext-info">
            <div class="ext-title-row">
              <span class="ext-name">${escapeHtml(ext.name)}</span>
              <span class="ext-ver">v${escapeHtml(ext.version)}</span>
            </div>
            ${ext.description ? `<div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(ext.description)}</div>` : ''}
            <div class="ext-path">${escapeHtml(ext.path)}</div>
          </div>
          <div class="ext-actions">
            <label class="switch" title="Enable or disable extension">
              <input type="checkbox" class="toggle-ext" ${ext.enabled ? 'checked' : ''} data-id="${escapeHtml(ext.id)}">
              <span class="slider"></span>
            </label>
            <button class="danger-btn btn-remove-ext" data-id="${escapeHtml(ext.id)}">Remove</button>
          </div>
        `;

        card.querySelector('.toggle-ext').addEventListener('change', async (e) => {
          await window.webyAPI.toggleExtension(ext.id, e.target.checked);
        });

        card.querySelector('.btn-remove-ext').addEventListener('click', async () => {
          if (confirm(`Remove extension "${ext.name}"?`)) {
            await window.webyAPI.removeExtension(ext.id);
            renderExtensionsList();
          }
        });

        extensionsList.appendChild(card);
      });
    } catch (e) {
      extensionsList.textContent = 'Error loading extensions: ' + e.message;
    }
  }

  // User Profiles Management Logic
  async function loadProfiles() {
    if (!window.webyAPI || !window.webyAPI.getProfiles) return;
    try {
      currentProfiles = await window.webyAPI.getProfiles();
      const active = currentProfiles.profiles.find(p => p.id === currentProfiles.activeProfileId);
      if (active && activeProfileNameEl) {
        activeProfileNameEl.textContent = active.name;
      }
    } catch (e) {}
  }

  async function renderProfilesList() {
    await loadProfiles();
    profilesList.innerHTML = '';

    currentProfiles.profiles.forEach(p => {
      const isActive = p.id === currentProfiles.activeProfileId;
      const item = document.createElement('div');
      item.className = 'profile-item' + (isActive ? ' active-profile' : '');

      item.innerHTML = `
        <div class="profile-info">
          <strong>${escapeHtml(p.name)}</strong>
          ${isActive ? '<span class="profile-badge">Active</span>' : ''}
        </div>
        <div style="display: flex; gap: 6px;">
          ${!isActive ? `<button class="sm-btn btn-switch-profile" data-id="${escapeHtml(p.id)}">Switch</button>` : ''}
          <button class="sm-btn btn-rename-profile" data-id="${escapeHtml(p.id)}">Rename</button>
          ${!isActive && currentProfiles.profiles.length > 1 ? `<button class="danger-btn btn-delete-profile" data-id="${escapeHtml(p.id)}">Delete</button>` : ''}
        </div>
      `;

      if (!isActive) {
        item.querySelector('.btn-switch-profile').addEventListener('click', async () => {
          await switchProfile(p.id);
        });
      }

      item.querySelector('.btn-rename-profile').addEventListener('click', async () => {
        const newName = prompt('Enter new profile name:', p.name);
        if (newName && newName.trim()) {
          await window.webyAPI.renameProfile(p.id, newName.trim());
          await renderProfilesList();
        }
      });

      const delBtn = item.querySelector('.btn-delete-profile');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (confirm(`Delete profile "${p.name}" and all its isolated data?`)) {
            await window.webyAPI.deleteProfile(p.id);
            await renderProfilesList();
          }
        });
      }

      profilesList.appendChild(item);
    });
  }

  async function switchProfile(profileId) {
    if (!window.webyAPI || !window.webyAPI.switchProfile) return;
    try {
      await window.webyAPI.switchProfile(profileId);
      profilesModal.classList.add('hidden');

      // Reload settings for new profile
      const settings = await window.webyAPI.getSettings();
      applySettings(settings);

      // Reload tabs for new profile
      const newState = await window.webyAPI.loadState();
      reloadTabsFromState(newState);

      // Reload active profile label
      await loadProfiles();
    } catch (e) {
      alert('Could not switch profile: ' + e.message);
    }
  }

  function reloadTabsFromState(savedState) {
    // Clear existing DOM webviews and tabs
    tabStrip.innerHTML = '';
    webviewContainer.innerHTML = '';
    tabs = [];
    activeTabId = null;

    if (savedState && Array.isArray(savedState.tabs) && savedState.tabs.length > 0) {
      nextSessionIndex = savedState.nextSessionIndex || (savedState.tabs.length + 1);
      tabs = savedState.tabs;
      activeTabId = savedState.activeTabId || tabs[0].id;

      tabs.forEach(tab => {
        if (!tab.url) tab.url = demoUrl;
        const tabEl = createTabElement(tab);
        tabStrip.appendChild(tabEl);

        const wvEl = createWebviewElement(tab);
        webviewContainer.appendChild(wvEl);
      });

      switchTab(activeTabId);
    } else {
      addNewTab('Session 1', demoUrl);
    }
  }

  // Navigation handlers
  btnBack.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv && wv.canGoBack()) {
      wv.goBack();
    }
  });

  btnForward.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv && wv.canGoForward()) {
      wv.goForward();
    }
  });

  btnRefresh.addEventListener('click', () => {
    const wv = getActiveWebview();
    if (wv) {
      wv.reload();
    }
  });

  addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputVal = addressInput.value.trim();
    if (!inputVal) return;

    const formatted = formatUrl(inputVal);
    const wv = getActiveWebview();
    const activeTab = getActiveTab();

    if (wv) {
      wv.loadURL(formatted);
      if (activeTab) {
        activeTab.url = formatted;
        saveCurrentState();
      }
    }
  });

  btnNewTab.addEventListener('click', () => {
    addNewTab();
  });

  activeSessionPill.addEventListener('click', () => {
    if (activeTabId) {
      promptRenameSession(activeTabId);
    }
  });

  // Modal Helper Functions
  function openModal(modalEl) {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    modalEl.classList.remove('hidden');
    document.body.classList.add('has-modal');
  }

  function closeModal(modalEl) {
    modalEl.classList.add('hidden');
    if (!document.querySelector('.modal:not(.hidden)')) {
      document.body.classList.remove('has-modal');
    }
  }

  // Toolbar Modal Triggers
  btnProfileSelector.addEventListener('click', () => {
    renderProfilesList();
    openModal(profilesModal);
  });

  btnSessionsPanel.addEventListener('click', () => {
    renderSessionsList();
    openModal(sessionsModal);
  });

  btnExtensionsPanel.addEventListener('click', () => {
    renderExtensionsList();
    openModal(extensionsModal);
  });

  btnSettingsPanel.addEventListener('click', () => {
    syncSettingsForm();
    openModal(settingsModal);
  });

  // Settings Event Listeners
  themeDarkRadio.addEventListener('change', () => updateSetting('theme', 'dark'));
  themeLightRadio.addEventListener('change', () => updateSetting('theme', 'light'));
  themeCustomRadio.addEventListener('change', () => updateSetting('theme', 'custom'));

  tabPosTopRadio.addEventListener('change', () => updateSetting('tabPosition', 'top'));
  tabPosSideRadio.addEventListener('change', () => updateSetting('tabPosition', 'side'));

  densityComfortableRadio.addEventListener('change', () => updateSetting('density', 'comfortable'));
  densityCompactRadio.addEventListener('change', () => updateSetting('density', 'compact'));

  settingAccentColor.addEventListener('input', (e) => {
    accentColorHex.textContent = e.target.value;
    updateSetting('accentColor', e.target.value);
  });

  settingBgColor.addEventListener('input', (e) => {
    bgColorHex.textContent = e.target.value;
    updateSetting('backgroundColor', e.target.value);
  });

  // Sessions Modal Action: Create Session
  btnCreateSession.addEventListener('click', async () => {
    const name = prompt('Enter a name for the new session:', `Session ${nextSessionIndex}`);
    if (name && name.trim()) {
      closeModal(sessionsModal);
      await addNewTab(name.trim(), demoUrl);
    }
  });

  // Extensions Modal Action: Load Unpacked
  btnLoadUnpackedExt.addEventListener('click', async () => {
    if (window.webyAPI && window.webyAPI.addExtensionPrompt) {
      const added = await window.webyAPI.addExtensionPrompt();
      if (added) {
        renderExtensionsList();
      }
    }
  });

  // Profiles Modal Action: Add Profile
  btnAddProfile.addEventListener('click', async () => {
    const name = newProfileNameInput.value.trim();
    if (name) {
      await window.webyAPI.createProfile(name);
      newProfileNameInput.value = '';
      await renderProfilesList();
    }
  });

  // Cookie Export/Import Modal Handlers
  btnCookieIoCopy.addEventListener('click', () => {
    cookieIoTextarea.select();
    document.execCommand('copy');
    btnCookieIoCopy.textContent = 'Copied!';
    setTimeout(() => { btnCookieIoCopy.textContent = 'Copy to Clipboard'; }, 1500);
  });

  btnCookieIoSubmit.addEventListener('click', async () => {
    try {
      const data = cookieIoTextarea.value.trim();
      const result = await window.webyAPI.importCookies(currentIoPartition, data);
      alert(`Successfully imported ${result.importedCount} cookies.`);
      closeModal(cookieIoModal);
      renderSessionsList();
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  });

  // Close Modals
  btnCloseModal.addEventListener('click', () => closeModal(cookieModal));
  btnCloseSettings.addEventListener('click', () => closeModal(settingsModal));
  btnCloseSessions.addEventListener('click', () => closeModal(sessionsModal));
  btnCloseExtensions.addEventListener('click', () => closeModal(extensionsModal));
  btnCloseProfiles.addEventListener('click', () => closeModal(profilesModal));
  btnCloseCookieIo.addEventListener('click', () => closeModal(cookieIoModal));

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeModal(e.target);
    }
  });

  // Legacy Modal / Cookie Inspection
  btnSessionManager.addEventListener('click', async () => {
    const activeTab = getActiveTab();
    if (!activeTab) return;

    cookiePartitionName.textContent = activeTab.partition;
    cookieList.textContent = 'Fetching isolated session cookies...';
    openModal(cookieModal);

    try {
      const wv = getActiveWebview();
      const currentUrl = (wv && wv.getURL && wv.getURL()) || activeTab.url;
      const cookies = await window.webyAPI.getCookies(activeTab.partition, currentUrl);

      if (!cookies || cookies.length === 0) {
        cookieList.innerHTML = `<em>No cookies currently stored for partition: <code>${escapeHtml(activeTab.partition)}</code></em>`;
      } else {
        cookieList.innerHTML = cookies.map(c => `
          <div class="cookie-item">
            <span class="cookie-name">${escapeHtml(c.name)}</span> = <span class="cookie-value">${escapeHtml(c.value)}</span>
            <div style="font-size: 10px; color: var(--text-muted);">Domain: ${escapeHtml(c.domain)} | Path: ${escapeHtml(c.path)} | Expires: ${c.expirationDate ? new Date(c.expirationDate * 1000).toLocaleString() : 'Session'}</div>
          </div>
        `).join('');
      }
    } catch (err) {
      cookieList.textContent = 'Error reading cookies: ' + err.message;
    }
  });

  // Handle menu actions from main process
  if (window.webyAPI && window.webyAPI.onMenuAction) {
    window.webyAPI.onMenuAction((action, data) => {
      if (action === 'new-tab') {
        addNewTab();
      } else if (action === 'close-tab') {
        if (activeTabId) closeTab(activeTabId);
      } else if (action === 'reload') {
        const wv = getActiveWebview();
        if (wv) wv.reload();
      } else if (action === 'open-settings') {
        syncSettingsForm();
        openModal(settingsModal);
      } else if (action === 'open-sessions') {
        renderSessionsList();
        openModal(sessionsModal);
      } else if (action === 'open-extensions') {
        renderExtensionsList();
        openModal(extensionsModal);
      } else if (action === 'open-profiles' || action === 'new-profile') {
        renderProfilesList();
        openModal(profilesModal);
        if (action === 'new-profile') {
          setTimeout(() => newProfileNameInput.focus(), 100);
        }
      } else if (action === 'profile-switched') {
        switchProfile(data);
      }
    });
  }

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      addNewTab();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (activeTabId) closeTab(activeTabId);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
      e.preventDefault();
      const wv = getActiveWebview();
      if (wv) wv.reload();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      addressInput.focus();
      addressInput.select();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      syncSettingsForm();
      settingsModal.classList.remove('hidden');
    }
  });

  // App Initialization
  async function init() {
    try {
      // 1. Load profiles and current active profile
      await loadProfiles();

      // 2. Load and apply settings (theme, density, tab position)
      if (window.webyAPI && window.webyAPI.getSettings) {
        const settings = await window.webyAPI.getSettings();
        applySettings(settings);
      }

      // 3. Load tab state
      let savedState = null;
      if (window.webyAPI && window.webyAPI.loadState) {
        savedState = await window.webyAPI.loadState();
      }

      reloadTabsFromState(savedState);
    } catch (err) {
      console.error('Initialization error:', err);
      await addNewTab('Session 1', demoUrl);
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();