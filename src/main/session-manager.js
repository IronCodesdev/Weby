const fs = require('fs');
const path = require('path');
const { app, session } = require('electron');

class SessionManager {
  constructor(customStorageDir = null) {
    this.customStorageDir = customStorageDir;
    this.baseDir = customStorageDir || (app ? app.getPath('userData') : path.join(process.cwd(), 'weby_data'));
    this.profilesDir = path.join(this.baseDir, 'profiles');
    this.profilesConfigPath = path.join(this.baseDir, 'profiles.json');
    this.initProfiles();
  }

  initProfiles() {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
      if (!fs.existsSync(this.profilesDir)) {
        fs.mkdirSync(this.profilesDir, { recursive: true });
      }

      let config = null;
      if (fs.existsSync(this.profilesConfigPath)) {
        try {
          const raw = fs.readFileSync(this.profilesConfigPath, 'utf-8');
          config = JSON.parse(raw);
        } catch (e) {
          config = null;
        }
      }

      if (!config || !Array.isArray(config.profiles) || config.profiles.length === 0) {
        config = {
          activeProfileId: 'default',
          profiles: [
            {
              id: 'default',
              name: 'Default Profile',
              createdAt: Date.now()
            }
          ]
        };
        fs.writeFileSync(this.profilesConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      }

      this.activeProfileId = config.activeProfileId || config.profiles[0].id;

      // Ensure active profile directory exists
      const defaultProfileDir = path.join(this.profilesDir, 'default');
      if (!fs.existsSync(defaultProfileDir)) {
        fs.mkdirSync(defaultProfileDir, { recursive: true });
      }

      // Check for legacy root weby-state.json and migrate to default profile if needed
      const legacyStatePath = path.join(this.baseDir, 'weby-state.json');
      const defaultStatePath = path.join(defaultProfileDir, 'weby-state.json');
      if (fs.existsSync(legacyStatePath) && !fs.existsSync(defaultStatePath)) {
        try {
          fs.copyFileSync(legacyStatePath, defaultStatePath);
        } catch (e) {}
      }
    } catch (err) {
      console.error('[SessionManager] Error in initProfiles:', err);
      this.activeProfileId = 'default';
    }
  }

  getProfilesConfig() {
    try {
      if (fs.existsSync(this.profilesConfigPath)) {
        const raw = fs.readFileSync(this.profilesConfigPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {}
    return {
      activeProfileId: 'default',
      profiles: [{ id: 'default', name: 'Default Profile', createdAt: Date.now() }]
    };
  }

  saveProfilesConfig(config) {
    try {
      fs.writeFileSync(this.profilesConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[SessionManager] Error saving profiles.json:', e);
      return false;
    }
  }

  getProfiles() {
    const config = this.getProfilesConfig();
    return {
      activeProfileId: this.activeProfileId || config.activeProfileId || 'default',
      profiles: config.profiles.map(p => ({
        ...p,
        folder: path.join(this.profilesDir, p.id)
      }))
    };
  }

  getActiveProfileId() {
    return this.activeProfileId || 'default';
  }

  getActiveProfile() {
    const { activeProfileId, profiles } = this.getProfiles();
    return profiles.find(p => p.id === activeProfileId) || profiles[0];
  }

  getProfileDir(profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const dir = path.join(this.profilesDir, pId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  createProfile(name) {
    const trimmed = (name || '').trim();
    const config = this.getProfilesConfig();
    const profileName = trimmed || `Profile ${config.profiles.length + 1}`;
    const id = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newProfile = {
      id,
      name: profileName,
      createdAt: Date.now()
    };

    config.profiles.push(newProfile);
    this.saveProfilesConfig(config);

    const dir = this.getProfileDir(id);

    // Initialize default profile data
    this.saveState(this.getDefaultState(id), id);
    this.saveSettings(this.getDefaultSettings(), id);
    this.saveSessions(this.getDefaultSessions(id), id);
    this.saveExtensions([], id);

    return {
      ...newProfile,
      folder: dir
    };
  }

  renameProfile(profileId, newName) {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      throw new Error('Profile name cannot be empty');
    }

    const config = this.getProfilesConfig();
    const profile = config.profiles.find(p => p.id === profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    profile.name = trimmed;
    this.saveProfilesConfig(config);
    return {
      ...profile,
      folder: path.join(this.profilesDir, profile.id)
    };
  }

  deleteProfile(profileId) {
    const config = this.getProfilesConfig();
    if (config.profiles.length <= 1) {
      throw new Error('Cannot delete the only remaining profile');
    }
    if (this.activeProfileId === profileId) {
      throw new Error('Cannot delete currently active profile. Please switch to another profile first.');
    }

    const index = config.profiles.findIndex(p => p.id === profileId);
    if (index === -1) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const targetDir = path.join(this.profilesDir, profileId);
    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
      } catch (e) {
        console.error(`[SessionManager] Could not remove profile folder ${targetDir}:`, e);
      }
    }

    config.profiles.splice(index, 1);
    this.saveProfilesConfig(config);
    return { success: true };
  }

  switchProfile(profileId) {
    const config = this.getProfilesConfig();
    const target = config.profiles.find(p => p.id === profileId);
    if (!target) {
      throw new Error(`Profile ${profileId} not found`);
    }

    this.activeProfileId = profileId;
    config.activeProfileId = profileId;
    this.saveProfilesConfig(config);

    return {
      ...target,
      folder: path.join(this.profilesDir, target.id)
    };
  }

  // State Management
  getStorageFilePath(profileId = null) {
    const dir = this.getProfileDir(profileId);
    return path.join(dir, 'weby-state.json');
  }

  getDefaultState(profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    return {
      nextSessionIndex: 2,
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          sessionName: 'Session 1',
          sessionId: 'session_1',
          color: '#6366f1',
          partition: `persist:weby_session_${pId}_1`,
          url: 'https://example.com',
          title: 'Session 1 - Example Domain',
          active: true
        }
      ]
    };
  }

  loadState(profileId = null) {
    try {
      const filePath = this.getStorageFilePath(profileId);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
          return parsed;
        }
      }

      // Check legacy root state file if default profile
      const pId = profileId || this.getActiveProfileId();
      if (pId === 'default') {
        const rootPath = path.join(this.baseDir, 'weby-state.json');
        if (fs.existsSync(rootPath)) {
          const raw = fs.readFileSync(rootPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.error('[SessionManager] Error loading saved state:', err);
    }
    return this.getDefaultState(profileId);
  }

  saveState(state, profileId = null) {
    try {
      const pId = profileId || this.getActiveProfileId();
      const filePath = this.getStorageFilePath(pId);
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tempPath, filePath);

      // Keep root weby-state.json in sync for default profile backward compatibility
      if (pId === 'default') {
        const rootPath = path.join(this.baseDir, 'weby-state.json');
        try {
          fs.writeFileSync(rootPath, JSON.stringify(state, null, 2), 'utf-8');
        } catch (e) {}
      }

      // Keep sessions.json in sync with any newly discovered sessions in state
      this.syncSessionsFromState(state, pId);
      return true;
    } catch (err) {
      console.error('[SessionManager] Error saving state:', err);
      return false;
    }
  }

  createTabMetadata(sessionIndex, customName = null, initialUrl = 'https://example.com', sessionId = null, color = null, profileId = null) {
    // Also support passing an options object
    if (typeof sessionIndex === 'object' && sessionIndex !== null) {
      const opts = sessionIndex;
      sessionIndex = opts.sessionIndex;
      customName = opts.customName;
      initialUrl = opts.initialUrl || 'https://example.com';
      sessionId = opts.sessionId;
      color = opts.color;
      profileId = opts.profileId;
    }

    const pId = profileId || this.getActiveProfileId();
    const id = `tab-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const sessionName = customName || `Session ${sessionIndex || 1}`;
    const sId = sessionId || `session_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const sessionColor = color || this.getRandomColor();
    const partition = `persist:weby_session_${pId}_${sId}`;

    return {
      id,
      sessionName,
      sessionId: sId,
      color: sessionColor,
      partition,
      url: initialUrl || 'https://example.com',
      title: sessionName,
      active: true
    };
  }

  getRandomColor() {
    const colors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Settings Management
  getDefaultSettings() {
    return {
      theme: 'dark', // 'dark' | 'light' | 'custom'
      accentColor: '#6366f1',
      backgroundColor: '#1e1e24',
      tabPosition: 'top', // 'top' | 'side'
      density: 'comfortable' // 'comfortable' | 'compact'
    };
  }

  getSettingsPath(profileId = null) {
    return path.join(this.getProfileDir(profileId), 'settings.json');
  }

  getSettings(profileId = null) {
    try {
      const filePath = this.getSettingsPath(profileId);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...this.getDefaultSettings(), ...parsed };
      }
    } catch (e) {
      console.error('[SessionManager] Error loading settings:', e);
    }
    return this.getDefaultSettings();
  }

  saveSettings(newSettings, profileId = null) {
    try {
      const current = this.getSettings(profileId);
      const updated = { ...current, ...newSettings };
      const filePath = this.getSettingsPath(profileId);
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    } catch (e) {
      console.error('[SessionManager] Error saving settings:', e);
      throw e;
    }
  }

  // Session Control Panel Management
  getSessionsPath(profileId = null) {
    return path.join(this.getProfileDir(profileId), 'sessions.json');
  }

  getDefaultSessions(profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    return [
      {
        id: 'session_1',
        name: 'Session 1',
        color: '#6366f1',
        partition: `persist:weby_session_${pId}_1`,
        createdAt: Date.now()
      }
    ];
  }

  loadRawSessions(profileId = null) {
    try {
      const filePath = this.getSessionsPath(profileId);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return this.getDefaultSessions(profileId);
  }

  saveSessions(sessions, profileId = null) {
    try {
      const filePath = this.getSessionsPath(profileId);
      fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[SessionManager] Error saving sessions:', e);
      return false;
    }
  }

  syncSessionsFromState(state, profileId = null) {
    try {
      const pId = profileId || this.getActiveProfileId();
      const sessions = this.loadRawSessions(pId);
      let changed = false;

      if (state && Array.isArray(state.tabs)) {
        state.tabs.forEach(tab => {
          let s = sessions.find(sess => sess.partition === tab.partition || (tab.sessionId && sess.id === tab.sessionId));
          if (!s) {
            s = {
              id: tab.sessionId || `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              name: tab.sessionName || 'Session',
              color: tab.color || '#6366f1',
              partition: tab.partition,
              createdAt: Date.now()
            };
            sessions.push(s);
            changed = true;
          } else if (tab.sessionName && s.name !== tab.sessionName) {
            s.name = tab.sessionName;
            changed = true;
          }
        });
      }

      if (changed) {
        this.saveSessions(sessions, pId);
      }
    } catch (e) {}
  }

  async getSessionsWithMetadata(profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const sessions = this.loadRawSessions(pId);
    const state = this.loadState(pId);
    const tabs = state.tabs || [];

    const enriched = await Promise.all(sessions.map(async (sess) => {
      const tabCount = tabs.filter(t => t.partition === sess.partition || (t.sessionId && t.sessionId === sess.id)).length;
      let cookieCount = 0;
      let storageSize = 0;

      try {
        if (session && typeof session.fromPartition === 'function') {
          const ses = session.fromPartition(sess.partition);
          if (ses && ses.cookies) {
            const cookies = await ses.cookies.get({});
            cookieCount = cookies ? cookies.length : 0;
          }
          if (ses && typeof ses.getCacheSize === 'function') {
            storageSize = await ses.getCacheSize();
          }
        }
      } catch (err) {}

      return {
        ...sess,
        tabCount,
        cookieCount,
        storageSize
      };
    }));

    return enriched;
  }

  async renameSession(sessionId, newName, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const sessions = this.loadRawSessions(pId);
    const sess = sessions.find(s => s.id === sessionId);
    if (!sess) {
      throw new Error(`Session ${sessionId} not found`);
    }

    sess.name = (newName || '').trim() || sess.name;
    this.saveSessions(sessions, pId);

    // Also update tabs in state
    const state = this.loadState(pId);
    let stateChanged = false;
    state.tabs.forEach(tab => {
      if (tab.partition === sess.partition || tab.sessionId === sessionId) {
        tab.sessionName = sess.name;
        stateChanged = true;
      }
    });

    if (stateChanged) {
      this.saveState(state, pId);
    }

    return sess;
  }

  async duplicateSession(sessionId, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const sessions = this.loadRawSessions(pId);
    const sourceSess = sessions.find(s => s.id === sessionId);
    if (!sourceSess) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const newId = `session_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const newPartition = `persist:weby_session_${pId}_${newId}`;
    const newName = `${sourceSess.name} (Copy)`;

    const newSess = {
      id: newId,
      name: newName,
      color: sourceSess.color || this.getRandomColor(),
      partition: newPartition,
      createdAt: Date.now()
    };

    sessions.push(newSess);
    this.saveSessions(sessions, pId);

    // Copy cookies from source partition to new partition
    try {
      if (session && typeof session.fromPartition === 'function') {
        const srcSes = session.fromPartition(sourceSess.partition);
        const dstSes = session.fromPartition(newPartition);
        const cookies = await srcSes.cookies.get({});

        for (const c of cookies) {
          const domain = c.domain ? c.domain.replace(/^\./, '') : 'localhost';
          const protocol = c.secure ? 'https://' : 'http://';
          const url = `${protocol}${domain}${c.path || '/'}`;
          try {
            await dstSes.cookies.set({
              url,
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
              secure: c.secure,
              httpOnly: c.httpOnly,
              expirationDate: c.expirationDate,
              sameSite: c.sameSite
            });
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('[SessionManager] Error duplicating cookies:', e);
    }

    return newSess;
  }

  async deleteSession(sessionId, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const sessions = this.loadRawSessions(pId);
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index === -1) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const [deletedSess] = sessions.splice(index, 1);
    this.saveSessions(sessions, pId);

    // Clear partition storage
    try {
      await this.clearPartition(deletedSess.partition);
    } catch (e) {}

    // Update state to remove any closed tabs or reassign
    const state = this.loadState(pId);
    state.tabs = state.tabs.filter(t => t.partition !== deletedSess.partition && t.sessionId !== sessionId);
    if (state.tabs.length === 0) {
      // Re-add default tab
      state.tabs = this.getDefaultState(pId).tabs;
      state.activeTabId = state.tabs[0].id;
    } else if (!state.tabs.some(t => t.id === state.activeTabId)) {
      state.activeTabId = state.tabs[0].id;
    }
    this.saveState(state, pId);

    return { success: true };
  }

  async getCookies(partition, url = null) {
    const ses = session.fromPartition(partition);
    const filter = url ? { url } : {};
    return await ses.cookies.get(filter);
  }

  async setCookie(partition, details) {
    const ses = session.fromPartition(partition);
    return await ses.cookies.set(details);
  }

  async clearPartition(partition) {
    const ses = session.fromPartition(partition);
    await ses.clearStorageData();
    return true;
  }

  async exportCookies(partition) {
    const ses = session.fromPartition(partition);
    const cookies = await ses.cookies.get({});
    return JSON.stringify(cookies, null, 2);
  }

  async importCookies(partition, cookiesData) {
    let cookies = [];
    if (typeof cookiesData === 'string') {
      cookies = JSON.parse(cookiesData);
    } else if (Array.isArray(cookiesData)) {
      cookies = cookiesData;
    }

    if (!Array.isArray(cookies)) {
      throw new Error('Cookies data must be a JSON array of cookie objects');
    }

    const ses = session.fromPartition(partition);
    let importedCount = 0;

    for (const c of cookies) {
      if (!c.name || c.value === undefined) continue;
      const domain = c.domain ? c.domain.replace(/^\./, '') : 'localhost';
      const protocol = c.secure ? 'https://' : 'http://';
      const url = c.url || `${protocol}${domain}${c.path || '/'}`;

      try {
        await ses.cookies.set({
          url,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: !!c.secure,
          httpOnly: !!c.httpOnly,
          expirationDate: c.expirationDate,
          sameSite: c.sameSite
        });
        importedCount++;
      } catch (e) {
        console.warn(`[SessionManager] Could not import cookie ${c.name}:`, e.message);
      }
    }

    return { importedCount, total: cookies.length };
  }

  // Extensions Management
  getExtensionsFilePath(profileId = null) {
    return path.join(this.getProfileDir(profileId), 'extensions.json');
  }

  getExtensions(profileId = null) {
    try {
      const filePath = this.getExtensionsFilePath(profileId);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  saveExtensions(extensions, profileId = null) {
    try {
      const filePath = this.getExtensionsFilePath(profileId);
      fs.writeFileSync(filePath, JSON.stringify(extensions, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[SessionManager] Error saving extensions:', e);
      return false;
    }
  }

  addExtension(extensionPath, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    if (!fs.existsSync(extensionPath)) {
      throw new Error(`Extension path does not exist: ${extensionPath}`);
    }

    const manifestPath = path.join(extensionPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Invalid extension: manifest.json not found');
    }

    const rawManifest = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(rawManifest);

    const extId = `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newExt = {
      id: extId,
      name: manifest.name || path.basename(extensionPath),
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      path: path.resolve(extensionPath),
      enabled: true,
      addedAt: Date.now()
    };

    const exts = this.getExtensions(pId);
    // If extension with same path already exists, update it
    const existingIndex = exts.findIndex(e => e.path === newExt.path);
    if (existingIndex !== -1) {
      exts[existingIndex] = { ...exts[existingIndex], ...newExt, id: exts[existingIndex].id };
    } else {
      exts.push(newExt);
    }

    this.saveExtensions(exts, pId);
    return newExt;
  }

  toggleExtension(extensionId, enabled, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const exts = this.getExtensions(pId);
    const ext = exts.find(e => e.id === extensionId);
    if (!ext) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    ext.enabled = !!enabled;
    this.saveExtensions(exts, pId);
    return ext;
  }

  removeExtension(extensionId, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const exts = this.getExtensions(pId);
    const filtered = exts.filter(e => e.id !== extensionId);
    this.saveExtensions(filtered, pId);
    return { success: true };
  }

  async applyExtensionsToSession(ses, profileId = null) {
    const pId = profileId || this.getActiveProfileId();
    const exts = this.getExtensions(pId);
    const enabledExts = exts.filter(e => e.enabled);

    const loaded = [];
    for (const ext of enabledExts) {
      try {
        if (ses) {
          let loadedExt = null;
          if (ses.extensions && typeof ses.extensions.loadExtension === 'function') {
            loadedExt = await ses.extensions.loadExtension(ext.path, { allowFileAccess: true });
          } else if (typeof ses.loadExtension === 'function') {
            loadedExt = await ses.loadExtension(ext.path, { allowFileAccess: true });
          }
          if (loadedExt) loaded.push(loadedExt);
        }
      } catch (err) {
        console.warn(`[SessionManager] Could not load extension ${ext.name} (${ext.path}):`, err.message);
      }
    }
    return loaded;
  }
}

module.exports = SessionManager;