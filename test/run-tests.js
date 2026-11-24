const { app, session, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Optimize switches for container / virtual framebuffers
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Prevent app from quitting when BrowserWindow is closed during test execution
app.on('window-all-closed', () => {});

const testTempDir = path.join(app.getPath('temp'), 'weby_test_' + Date.now());
fs.mkdirSync(testTempDir, { recursive: true });
app.setPath('userData', testTempDir);

const SessionManager = require('../src/main/session-manager');

// Color helpers for terminal output
const green = (str) => `\x1b[32m${str}\x1b[0m`;
const red = (str) => `\x1b[31m${str}\x1b[0m`;
const cyan = (str) => `\x1b[36m${str}\x1b[0m`;
const bold = (str) => `\x1b[1m${str}\x1b[0m`;

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  process.stdout.write(`  • ${name} ... `);
  try {
    await fn();
    console.log(green('PASSED'));
    passedCount++;
  } catch (err) {
    console.log(red('FAILED'));
    console.error(err);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log(bold(cyan('\n===============================================')));
  console.log(bold(cyan('  Weby Multi-Session Browser - Test Suite')));
  console.log(bold(cyan('===============================================\n')));

  const sessionManager = new SessionManager(testTempDir);

  // Register all IPC handlers for full renderer integration testing
  ipcMain.handle('weby:load-state', async () => sessionManager.loadState());
  ipcMain.handle('weby:save-state', async (event, state) => sessionManager.saveState(state));
  ipcMain.handle('weby:create-tab', async (event, data) => sessionManager.createTabMetadata(data));
  ipcMain.handle('weby:get-cookies', async (event, { partition, url }) => sessionManager.getCookies(partition, url));
  ipcMain.handle('weby:clear-partition', async (event, partition) => sessionManager.clearPartition(partition));

  ipcMain.handle('weby:get-profiles', async () => sessionManager.getProfiles());
  ipcMain.handle('weby:create-profile', async (event, name) => sessionManager.createProfile(name));
  ipcMain.handle('weby:rename-profile', async (event, { id, name }) => sessionManager.renameProfile(id, name));
  ipcMain.handle('weby:delete-profile', async (event, id) => sessionManager.deleteProfile(id));
  ipcMain.handle('weby:switch-profile', async (event, id) => sessionManager.switchProfile(id));

  ipcMain.handle('weby:get-settings', async () => sessionManager.getSettings());
  ipcMain.handle('weby:save-settings', async (event, settings) => sessionManager.saveSettings(settings));

  ipcMain.handle('weby:get-sessions', async () => sessionManager.getSessionsWithMetadata());
  ipcMain.handle('weby:rename-session', async (event, { id, name }) => sessionManager.renameSession(id, name));
  ipcMain.handle('weby:duplicate-session', async (event, id) => sessionManager.duplicateSession(id));
  ipcMain.handle('weby:delete-session', async (event, id) => sessionManager.deleteSession(id));
  ipcMain.handle('weby:export-cookies', async (event, partition) => sessionManager.exportCookies(partition));
  ipcMain.handle('weby:import-cookies', async (event, { partition, cookiesJson }) => sessionManager.importCookies(partition, cookiesJson));

  ipcMain.handle('weby:get-extensions', async () => sessionManager.getExtensions());
  ipcMain.handle('weby:add-extension-path', async (event, p) => sessionManager.addExtension(p));
  ipcMain.handle('weby:toggle-extension', async (event, { id, enabled }) => sessionManager.toggleExtension(id, enabled));
  ipcMain.handle('weby:remove-extension', async (event, id) => sessionManager.removeExtension(id));

  const partition1 = `persist:weby_test_p1_${Date.now()}`;
  const partition2 = `persist:weby_test_p2_${Date.now()}`;
  const targetDomain = 'https://portal.my-site.com';

  console.log(bold('--- 1. Session & Cookie Isolation Verification ---'));

  await test('Set cookie for User Alice in Partition 1 and ensure Partition 2 has no cookies', async () => {
    const ses1 = session.fromPartition(partition1);
    const ses2 = session.fromPartition(partition2);

    await ses1.clearStorageData({ storages: ['cookies'] });
    await ses2.clearStorageData({ storages: ['cookies'] });

    // Set auth cookie in Partition 1
    await ses1.cookies.set({
      url: targetDomain,
      name: 'account_user',
      value: 'Alice_Corporate',
      domain: 'portal.my-site.com',
      path: '/'
    });

    // Verify Partition 1 has the cookie
    const p1Cookies = await ses1.cookies.get({ url: targetDomain });
    assert.strictEqual(p1Cookies.length, 1, 'Partition 1 should have exactly 1 cookie');
    assert.strictEqual(p1Cookies[0].name, 'account_user');
    assert.strictEqual(p1Cookies[0].value, 'Alice_Corporate');

    // CRITICAL ISOLATION CHECK: Partition 2 must NOT have this cookie
    const p2Cookies = await ses2.cookies.get({ url: targetDomain });
    assert.strictEqual(p2Cookies.length, 0, 'Partition 2 MUST have 0 cookies (isolated from Partition 1)');
  });

  await test('Set different account cookie for User Bob in Partition 2 on same domain simultaneously', async () => {
    const ses1 = session.fromPartition(partition1);
    const ses2 = session.fromPartition(partition2);

    // Set auth cookie in Partition 2 for the same website
    await ses2.cookies.set({
      url: targetDomain,
      name: 'account_user',
      value: 'Bob_Personal',
      domain: 'portal.my-site.com',
      path: '/'
    });

    // Partition 1 still has Alice
    const p1Cookies = await ses1.cookies.get({ url: targetDomain });
    const aliceCookie = p1Cookies.find(c => c.name === 'account_user');
    assert(aliceCookie, 'Partition 1 must still have account_user');
    assert.strictEqual(aliceCookie.value, 'Alice_Corporate', 'Partition 1 must retain Alice');

    // Partition 2 has Bob
    const p2Cookies = await ses2.cookies.get({ url: targetDomain });
    const bobCookie = p2Cookies.find(c => c.name === 'account_user');
    assert(bobCookie, 'Partition 2 must have account_user');
    assert.strictEqual(bobCookie.value, 'Bob_Personal', 'Partition 2 must have Bob');

    // Assert values are completely different
    assert.notStrictEqual(aliceCookie.value, bobCookie.value, 'Different accounts on the same site must not conflict');
  });

  await test('Multiple independent cookies remain strictly isolated between partitions', async () => {
    const ses1 = session.fromPartition(partition1);
    const ses2 = session.fromPartition(partition2);

    await ses1.cookies.set({
      url: targetDomain,
      name: 'role',
      value: 'admin',
      domain: 'portal.my-site.com',
      path: '/'
    });

    await ses2.cookies.set({
      url: targetDomain,
      name: 'cart_items',
      value: 'item_99',
      domain: 'portal.my-site.com',
      path: '/'
    });

    const p1Cookies = await ses1.cookies.get({ url: targetDomain });
    const p2Cookies = await ses2.cookies.get({ url: targetDomain });

    assert(p1Cookies.some(c => c.name === 'role' && c.value === 'admin'), 'P1 has role=admin');
    assert(!p1Cookies.some(c => c.name === 'cart_items'), 'P1 must not have cart_items from P2');

    assert(p2Cookies.some(c => c.name === 'cart_items' && c.value === 'item_99'), 'P2 has cart_items');
    assert(!p2Cookies.some(c => c.name === 'role'), 'P2 must not have role=admin from P1');
  });

  await test('Clearing storage data in Partition 1 does not affect Partition 2 cookies', async () => {
    const ses1 = session.fromPartition(partition1);
    const ses2 = session.fromPartition(partition2);

    // Clear partition 1 cookies
    await ses1.clearStorageData({ storages: ['cookies'] });

    // Verify partition 1 is cleared
    const p1Cookies = await ses1.cookies.get({ url: targetDomain });
    assert.strictEqual(p1Cookies.length, 0, 'Partition 1 cookies should be empty after clear');

    // Verify partition 2 still retains Bob and cart_items intact
    const p2Cookies = await ses2.cookies.get({ url: targetDomain });
    assert(p2Cookies.some(c => c.name === 'account_user' && c.value === 'Bob_Personal'), 'Partition 2 must retain Bob');
    assert(p2Cookies.some(c => c.name === 'cart_items' && c.value === 'item_99'), 'Partition 2 must retain cart_items');
  });

  console.log(bold('\n--- 2. State & Session Persistence Verification ---'));

  await test('SessionManager creates valid persistent tab metadata', async () => {
    const manager = new SessionManager(testTempDir);
    const tabMeta = manager.createTabMetadata(3, 'Finance Session', 'https://finance.example.com');

    assert(tabMeta.id.startsWith('tab-'), 'Tab ID should start with tab-');
    assert.strictEqual(tabMeta.sessionName, 'Finance Session');
    assert(tabMeta.partition.startsWith('persist:weby_session_'), 'Partition must be persistent');
    assert.strictEqual(tabMeta.url, 'https://finance.example.com');
  });

  await test('SessionManager saves and restores state across simulated restart', async () => {
    const manager1 = new SessionManager(testTempDir);
    const stateToSave = {
      nextSessionIndex: 3,
      activeTabId: 'tab-persisted-2',
      tabs: [
        {
          id: 'tab-persisted-1',
          sessionName: 'Work Email',
          partition: partition1,
          url: 'https://mail.work.com',
          title: 'Work Inbox',
          active: false
        },
        {
          id: 'tab-persisted-2',
          sessionName: 'Personal Email',
          partition: partition2,
          url: 'https://mail.personal.com',
          title: 'Personal Inbox',
          active: true
        }
      ]
    };

    const saved = manager1.saveState(stateToSave);
    assert.strictEqual(saved, true, 'State should save successfully');

    // Simulate restart with fresh SessionManager instance
    const manager2 = new SessionManager(testTempDir);
    const restoredState = manager2.loadState();

    assert.strictEqual(restoredState.nextSessionIndex, 3);
    assert.strictEqual(restoredState.activeTabId, 'tab-persisted-2');
    assert.strictEqual(restoredState.tabs.length, 2);
    assert.strictEqual(restoredState.tabs[0].sessionName, 'Work Email');
    assert.strictEqual(restoredState.tabs[0].partition, partition1);
    assert.strictEqual(restoredState.tabs[1].sessionName, 'Personal Email');
    assert.strictEqual(restoredState.tabs[1].partition, partition2);

    // Verify persistent partition cookies are preserved on disk
    const ses2 = session.fromPartition(restoredState.tabs[1].partition);
    const p2Cookies = await ses2.cookies.get({ url: targetDomain });
    const bobCookie = p2Cookies.find(c => c.name === 'account_user');
    assert(bobCookie, 'Bob cookie must still exist after simulated restart');
    assert.strictEqual(bobCookie.value, 'Bob_Personal');
  });

  console.log(bold('\n--- 3. UI Structure, Layout, & Lifecycle Verification ---'));

  await test('Renderer HTML loads all mandatory UI controls, creates tabs, and isolates partitions', async () => {
    // Reset state to clean default
    sessionManager.saveState(sessionManager.getDefaultState());

    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        preload: path.join(__dirname, '../src/main/preload.js'),
        webviewTag: true,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    await new Promise(r => setTimeout(r, 400));

    // 1. Verify all required UI controls exist
    const uiCheck = await win.webContents.executeJavaScript(`
      ({
        hasTabBar: !!document.getElementById('tab-strip'),
        hasNewTabBtn: !!document.getElementById('btn-new-tab'),
        hasAddressBar: !!document.getElementById('address-input'),
        hasBackBtn: !!document.getElementById('btn-back'),
        hasForwardBtn: !!document.getElementById('btn-forward'),
        hasRefreshBtn: !!document.getElementById('btn-refresh'),
        hasActiveSessionPill: !!document.getElementById('active-session-pill'),
        hasActiveSessionName: !!document.getElementById('active-session-name'),
        hasWebviewContainer: !!document.getElementById('webview-container'),
        tabCount: document.querySelectorAll('#tab-strip .tab').length,
        hasSessionBadge: document.querySelectorAll('.tab-session-badge').length > 0,
        hasCloseBtn: document.querySelectorAll('.tab-close-btn').length > 0,
        hasSettingsBtn: !!document.getElementById('btn-settings-panel'),
        hasSessionsBtn: !!document.getElementById('btn-sessions-panel'),
        hasExtensionsBtn: !!document.getElementById('btn-extensions-panel'),
        hasProfileSelector: !!document.getElementById('btn-profile-selector')
      })
    `);

    assert.strictEqual(uiCheck.hasTabBar, true, 'Tab bar must exist');
    assert.strictEqual(uiCheck.hasNewTabBtn, true, 'New tab button must exist');
    assert.strictEqual(uiCheck.hasAddressBar, true, 'Address bar must exist');
    assert.strictEqual(uiCheck.hasBackBtn, true, 'Back button must exist');
    assert.strictEqual(uiCheck.hasForwardBtn, true, 'Forward button must exist');
    assert.strictEqual(uiCheck.hasRefreshBtn, true, 'Refresh button must exist');
    assert.strictEqual(uiCheck.hasActiveSessionPill, true, 'Active session pill must exist');
    assert.strictEqual(uiCheck.hasActiveSessionName, true, 'Active session name element must exist');
    assert.strictEqual(uiCheck.hasWebviewContainer, true, 'Webview container must exist');
    assert(uiCheck.tabCount >= 1, 'At least 1 tab must be loaded in the tab strip');
    assert.strictEqual(uiCheck.hasSessionBadge, true, 'Each tab must display session badge');
    assert.strictEqual(uiCheck.hasCloseBtn, true, 'Each tab must have a close button');
    assert.strictEqual(uiCheck.hasSettingsBtn, true, 'Settings button must exist');
    assert.strictEqual(uiCheck.hasSessionsBtn, true, 'Sessions button must exist');
    assert.strictEqual(uiCheck.hasExtensionsBtn, true, 'Extensions button must exist');
    assert.strictEqual(uiCheck.hasProfileSelector, true, 'Profile selector must exist');

    // 2. Click "+ New Tab" button to add another isolated tab
    await win.webContents.executeJavaScript(`
      document.getElementById('btn-new-tab').click();
    `);
    await new Promise(r => setTimeout(r, 300));

    // Verify 2 tabs and 2 webviews exist with different persistent partitions
    const tabState = await win.webContents.executeJavaScript(`
      ({
        tabCount: document.querySelectorAll('#tab-strip .tab').length,
        webviewCount: document.querySelectorAll('#webview-container webview').length,
        partitions: Array.from(document.querySelectorAll('#webview-container webview')).map(w => w.getAttribute('partition')),
        sessionNames: Array.from(document.querySelectorAll('.tab-session-badge')).map(b => b.textContent)
      })
    `);

    assert.strictEqual(tabState.tabCount, 2, 'Should have 2 tabs after clicking new tab');
    assert.strictEqual(tabState.webviewCount, 2, 'Should have 2 webview instances');
    assert.notStrictEqual(tabState.partitions[0], tabState.partitions[1], 'Webviews must have different partitions');
    assert(tabState.partitions[0].startsWith('persist:'), 'Partition 1 must be persistent');
    assert(tabState.partitions[1].startsWith('persist:'), 'Partition 2 must be persistent');
    assert.strictEqual(tabState.sessionNames.length, 2, 'Each tab must have a session name');

    // 3. Test closing a tab
    await win.webContents.executeJavaScript(`
      const closeButtons = document.querySelectorAll('.tab-close-btn');
      closeButtons[closeButtons.length - 1].click();
    `);
    await new Promise(r => setTimeout(r, 200));

    const closedState = await win.webContents.executeJavaScript(`
      document.querySelectorAll('#tab-strip .tab').length
    `);
    assert.strictEqual(closedState, 1, 'Should have 1 tab after closing the second tab');

    // 4. Test live theme and layout changes on document attributes
    await win.webContents.executeJavaScript(`
      document.getElementById('theme-light').click();
      document.getElementById('tab-pos-side').click();
      document.getElementById('density-compact').click();
    `);
    await new Promise(r => setTimeout(r, 200));

    const liveAttrs = await win.webContents.executeJavaScript(`
      ({
        theme: document.documentElement.getAttribute('data-theme'),
        tabPos: document.documentElement.getAttribute('data-tab-position'),
        density: document.documentElement.getAttribute('data-density')
      })
    `);

    assert.strictEqual(liveAttrs.theme, 'light', 'Renderer should reflect data-theme="light"');
    assert.strictEqual(liveAttrs.tabPos, 'side', 'Renderer should reflect data-tab-position="side"');
    assert.strictEqual(liveAttrs.density, 'compact', 'Renderer should reflect data-density="compact"');

    // Reset back to top / dark
    await win.webContents.executeJavaScript(`
      document.getElementById('theme-dark').click();
      document.getElementById('tab-pos-top').click();
      document.getElementById('density-comfortable').click();
    `);
    await new Promise(r => setTimeout(r, 200));

    win.destroy();
  });

  console.log(bold('\n--- 4. Themes & Layout Settings Verification ---'));

  await test('Theme and layout settings save and persist across restarts', async () => {
    const customSettings = {
      theme: 'custom',
      accentColor: '#ec4899',
      backgroundColor: '#0f172a',
      tabPosition: 'side',
      density: 'compact'
    };

    sessionManager.saveSettings(customSettings);

    // Verify disk persistence by reading with fresh SessionManager
    const freshManager = new SessionManager(testTempDir);
    const loadedSettings = freshManager.getSettings();

    assert.strictEqual(loadedSettings.theme, 'custom', 'Theme should be custom');
    assert.strictEqual(loadedSettings.accentColor, '#ec4899', 'Accent color should match');
    assert.strictEqual(loadedSettings.backgroundColor, '#0f172a', 'Background color should match');
    assert.strictEqual(loadedSettings.tabPosition, 'side', 'Tab position should be side');
    assert.strictEqual(loadedSettings.density, 'compact', 'Density should be compact');
  });

  console.log(bold('\n--- 5. Advanced Sessions Control Panel Actions Verification ---'));

  await test('Session metadata accurately tracks cookie counts and tab counts', async () => {
    const defaultSessions = sessionManager.loadRawSessions();
    assert(defaultSessions.length > 0, 'At least 1 session exists');
    const firstSess = defaultSessions[0];

    // Seed cookie in this partition
    const ses = session.fromPartition(firstSess.partition);
    await ses.cookies.set({
      url: 'https://test-panel.com',
      name: 'panel_token',
      value: 'secure_xyz_123',
      domain: 'test-panel.com',
      path: '/'
    });

    const enriched = await sessionManager.getSessionsWithMetadata();
    const targetMeta = enriched.find(s => s.id === firstSess.id);
    assert(targetMeta, 'Found target session metadata');
    assert(targetMeta.cookieCount >= 1, `Cookie count should be >= 1 (got ${targetMeta.cookieCount})`);
  });

  await test('Session panel actions: rename, duplicate, export/import cookies, clear, delete', async () => {
    const defaultSessions = sessionManager.loadRawSessions();
    const sourceSess = defaultSessions[0];

    // 1. Rename action
    const renamed = await sessionManager.renameSession(sourceSess.id, 'Renamed Production Session');
    assert.strictEqual(renamed.name, 'Renamed Production Session');

    // 2. Duplicate action (cloning partition and cookies)
    const duplicated = await sessionManager.duplicateSession(sourceSess.id);
    assert(duplicated.name.includes('(Copy)'), 'Duplicated session name should have Copy');
    assert.notStrictEqual(duplicated.partition, sourceSess.partition, 'Partitions must differ');

    // Verify duplicated partition has the cloned cookie
    const dupSes = session.fromPartition(duplicated.partition);
    const dupCookies = await dupSes.cookies.get({});
    assert(dupCookies.some(c => c.name === 'panel_token'), 'Duplicated session must retain cloned cookies');

    // 3. Export cookies as JSON
    const exportedJson = await sessionManager.exportCookies(duplicated.partition);
    const parsedCookies = JSON.parse(exportedJson);
    assert(Array.isArray(parsedCookies) && parsedCookies.length >= 1, 'Exported JSON must be valid array');

    // 4. Clear partition data
    await sessionManager.clearPartition(duplicated.partition);
    const clearedCookies = await dupSes.cookies.get({});
    assert.strictEqual(clearedCookies.length, 0, 'Partition cookies must be 0 after clear');

    // 5. Import cookies from JSON back into cleared partition
    const importRes = await sessionManager.importCookies(duplicated.partition, exportedJson);
    assert(importRes.importedCount >= 1, 'Imported count should be >= 1');
    const restoredCookies = await dupSes.cookies.get({});
    assert(restoredCookies.some(c => c.name === 'panel_token'), 'Restored cookie must exist after import');

    // 6. Delete session
    const deleteRes = await sessionManager.deleteSession(duplicated.id);
    assert.strictEqual(deleteRes.success, true);
    const postDeleteSessions = sessionManager.loadRawSessions();
    assert(!postDeleteSessions.some(s => s.id === duplicated.id), 'Deleted session should no longer exist');
  });

  console.log(bold('\n--- 6. User Profile Isolation Verification ---'));

  await test('User profiles create separate folders and strictly isolate tabs, cookies, and settings', async () => {
    // Create Profile A ("Marketing") and Profile B ("Developer")
    const profA = sessionManager.createProfile('Marketing Profile');
    const profB = sessionManager.createProfile('Developer Profile');

    assert(fs.existsSync(profA.folder), 'Marketing profile folder must exist');
    assert(fs.existsSync(profB.folder), 'Developer profile folder must exist');
    assert.notStrictEqual(profA.folder, profB.folder, 'Profile folders must be distinct');

    // Save different settings in each profile
    sessionManager.saveSettings({ theme: 'light', accentColor: '#10b981' }, profA.id);
    sessionManager.saveSettings({ theme: 'dark', accentColor: '#ef4444' }, profB.id);

    const settingsA = sessionManager.getSettings(profA.id);
    const settingsB = sessionManager.getSettings(profB.id);
    assert.strictEqual(settingsA.theme, 'light', 'Profile A theme is light');
    assert.strictEqual(settingsA.accentColor, '#10b981', 'Profile A accent is green');
    assert.strictEqual(settingsB.theme, 'dark', 'Profile B theme is dark');
    assert.strictEqual(settingsB.accentColor, '#ef4444', 'Profile B accent is red');

    // Switch to Profile A, set tab and cookie
    sessionManager.switchProfile(profA.id);
    const tabMetaA = sessionManager.createTabMetadata(1, 'Marketing Tab', 'https://marketing.hub.com', null, null, profA.id);
    sessionManager.saveState({
      nextSessionIndex: 2,
      activeTabId: tabMetaA.id,
      tabs: [tabMetaA]
    }, profA.id);

    const sesA = session.fromPartition(tabMetaA.partition);
    await sesA.cookies.set({
      url: 'https://marketing.hub.com',
      name: 'hub_auth',
      value: 'Marketing_Director',
      domain: 'marketing.hub.com',
      path: '/'
    });

    // Switch to Profile B, verify tabs and cookies are completely isolated
    sessionManager.switchProfile(profB.id);
    const stateB = sessionManager.loadState(profB.id);
    assert(!stateB.tabs.some(t => t.sessionName === 'Marketing Tab'), 'Profile B must not contain Profile A tabs');

    const tabMetaB = sessionManager.createTabMetadata(1, 'Dev Tab', 'https://github.com', null, null, profB.id);
    const sesB = session.fromPartition(tabMetaB.partition);
    const cookiesInB = await sesB.cookies.get({ url: 'https://marketing.hub.com' });
    assert.strictEqual(cookiesInB.length, 0, 'Profile B partition MUST NOT contain Profile A cookies');

    // Delete Profile B
    sessionManager.switchProfile(profA.id);
    const delRes = sessionManager.deleteProfile(profB.id);
    assert.strictEqual(delRes.success, true);
    assert(!fs.existsSync(profB.folder), 'Deleted profile folder should be removed from disk');

    // Switch back to default
    sessionManager.switchProfile('default');
  });

  console.log(bold('\n--- 7. Chrome Extensions Loading Verification ---'));

  await test('Load sample unpacked Chrome extension, verify manifest parsing and session loading', async () => {
    const fixtureExtPath = path.join(__dirname, 'fixtures/sample-extension');
    assert(fs.existsSync(fixtureExtPath), 'Fixture extension directory must exist');

    // 1. Add extension to SessionManager
    const addedExt = sessionManager.addExtension(fixtureExtPath);
    assert.strictEqual(addedExt.name, 'Weby Test Sample Extension');
    assert.strictEqual(addedExt.version, '1.0.0');
    assert.strictEqual(addedExt.enabled, true);

    const exts = sessionManager.getExtensions();
    assert(exts.some(e => e.id === addedExt.id), 'Extension should be in list');

    // 2. Load into an Electron session partition
    const testPartition = `persist:weby_ext_test_${Date.now()}`;
    const ses = session.fromPartition(testPartition);
    const loadedExtensions = await sessionManager.applyExtensionsToSession(ses);

    // Electron session.loadExtension returns the extension or registers it
    assert(Array.isArray(loadedExtensions), 'Loaded extensions result must be an array');
    const getAllFn = (ses.extensions && typeof ses.extensions.getAllExtensions === 'function')
      ? () => ses.extensions.getAllExtensions()
      : (typeof ses.getAllExtensions === 'function' ? () => ses.getAllExtensions() : null);

    if (getAllFn) {
      const allExts = getAllFn();
      assert(allExts.some(e => e.name === 'Weby Test Sample Extension'), 'Extension should be registered in Electron session');
    }

    // 3. Toggle extension
    const toggled = sessionManager.toggleExtension(addedExt.id, false);
    assert.strictEqual(toggled.enabled, false);

    // 4. Remove extension
    const removeRes = sessionManager.removeExtension(addedExt.id);
    assert.strictEqual(removeRes.success, true);
    assert(!sessionManager.getExtensions().some(e => e.id === addedExt.id), 'Extension should be removed');
  });

  // Clean up test temp files
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch (e) {}

  console.log(bold(cyan('\n===============================================')));
  console.log(`Results: ${green(`${passedCount} passed`)}, ${failedCount > 0 ? red(`${failedCount} failed`) : '0 failed'}`);
  console.log(bold(cyan('===============================================\n')));

  if (failedCount > 0) {
    app.exit(1);
  } else {
    app.exit(0);
  }
}

app.whenReady().then(runTestSuite);