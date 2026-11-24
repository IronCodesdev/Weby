# Weby - Multi-Session Desktop Browser

Weby is an enhanced Electron-based multi-session desktop browser designed for professional privacy, account segregation, and power-user workflows. Each tab operates within an isolated session partition (separate cookies, LocalStorage, and IndexedDB), allowing simultaneous logins to multiple accounts on the same website across tabs without session leaks or conflicts.

---

## Key Features

### 1. Isolated Tab Sessions & Multi-Login
- **Dedicated Partitions**: Every tab runs in its own isolated storage partition (`persist:weby_session_*`), ensuring cookies, caches, and storage are strictly quarantined.
- **Session Labeling**: Visual session color tags and badges on each tab header.
- **Multi-Login Test Bench**: Built-in test page (`weby://demo`) to test and visually verify simultaneous multi-account logins in real time.

### 2. User Profiles
- **Complete Profile Isolation**: Support for multiple independent user profiles (e.g., *Personal*, *Work*, *Development*).
- **Isolated Storage**: Each profile maintains its own dedicated directory under `profiles/<profileId>/`, storing tabs, sessions, themes, settings, and extensions in strict isolation.
- **Profile Management**: Create, rename, delete, and switch profiles seamlessly via the toolbar pill or the application menu (`Profiles` menu).

### 3. Customizable Layout & Themes
- **Themes**: Support for **Dark**, **Light**, and **Custom** themes.
- **Color Customization**: Custom accent color and background color pickers with real-time hex display.
- **Tab Bar Position**: Choose between **Top** horizontal tab strip or **Side** vertical sidebar navigation.
- **UI Density**: Select **Comfortable** (spacious padding and heights) or **Compact** (dense, high-efficiency information layout).
- **Live Updates & Persistence**: Settings update instantly on selection without requiring a restart, and persist permanently per profile.

### 4. Advanced Sessions Control Panel
- **Comprehensive Metadata**: View all sessions with active tab count, cookie count, and estimated storage size.
- **Session Actions**:
  - **Open Tab**: Launch a new tab directly inside any selected session.
  - **Rename**: Assign meaningful names to sessions.
  - **Duplicate**: Clone a session into a new partition, copying all active cookies.
  - **Export Cookies**: Export session cookies as a clean, standardized JSON array.
  - **Import Cookies**: Import cookie JSON arrays directly into any session partition.
  - **Clear Data**: Wipe partition cookies, LocalStorage, and cache.
  - **Delete Session**: Remove a session, clean its partition data, and close related tabs.

### 5. Google Chrome Extensions Support
- **Unpacked Extension Loading**: Load unpacked Chrome extensions via directory picker (`Load Unpacked Extension...`).
- **Profile-Scoped Extensions**: Extensions are registered per profile and automatically applied to all partition sessions in that profile.
- **Management Controls**: Easily toggle extensions on/off or remove them from the profile.

---

## Electron Extension Support & Limitations

Weby uses Electron's native extension APIs (`ses.extensions.loadExtension`). While many popular Chrome extensions (such as ad blockers, user-agent switchers, and developer utilities) work smoothly, developers and users should be aware of Electron's architectural extension limitations:

| Capability / API | Status in Electron | Details & Limitations |
| :--- | :--- | :--- |
| **Manifest V2 & V3** | **Supported** | MV2 and MV3 extensions with service workers are supported in Electron 45+. |
| `chrome.storage` | **Supported** | `sync`, `local`, and `session` storage areas are persisted. |
| `chrome.declarativeNetRequest` | **Supported** | Request filtering and blocking rules execute at the network layer. |
| `chrome.runtime` | **Supported** | Messaging (`sendMessage`, `onMessage`) between extension scripts is supported. |
| `chrome.tabs` | **Partial** | Basic tab querying is supported; advanced events tied to Chrome's native window manager may not fire for `<webview>` tags. |
| `chrome.action` / `browserAction` | **Partial** | Badges and popups do not automatically render into Electron's host DOM window; popup HTML must be rendered in custom windows. |
| `chrome.webNavigation` | **Partial** | Navigation events on `<webview>` guests may not map 1:1 with Chrome tab IDs. |
| `chrome.bookmarks` / `history` | **Unsupported** | Electron does not bundle Chrome's native bookmark and history storage database. |
| `chrome.identity` | **Unsupported** | Google Chrome sync and OAuth identity APIs are not available outside the Chrome browser binary. |
| **Chrome Web Store (.crx)** | **Manual unpack** | Only unpacked extensions (folders containing `manifest.json`) can be loaded. `.crx` files must be unzipped prior to loading. |
| **Native Messaging** | **Unsupported** | `chrome.runtime.connectNative` is disabled in standard Electron webview sandboxes. |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation

```bash
cd /media/mohammed/Programs/Weby
npm install
```

### Launching the Application

```bash
npm start
```

### Keyboard Shortcuts

- `Ctrl+T` / `Cmd+T`: Open new isolated session tab
- `Ctrl+W` / `Cmd+W`: Close active tab
- `Ctrl+R` / `Cmd+R`: Reload active webview
- `Ctrl+L` / `Cmd+L`: Focus and select address bar
- `Ctrl+,` / `Cmd+,`: Open Settings & Themes modal
- `Ctrl+Shift+S`: Open Advanced Sessions Control Panel
- `Ctrl+Shift+E`: Open Chrome Extensions Manager

---

## Automated Test Suite

Weby features a rigorous automated test suite covering session isolation, state persistence, UI structures, customizable themes, control panel operations, profile isolation, and Chrome extension loading:

```bash
npm test
```

### Test Coverage Highlights

1. **Session & Cookie Isolation**: Verifies multi-user cookie isolation, simultaneous differing accounts on identical domains, independent cookie jars, and storage clearing boundaries.
2. **Persistence**: Validates tab metadata generation and restart state restoration from disk.
3. **UI Structure & Webview Lifecycle**: Validates DOM elements, dynamic `<webview>` partition attachment, tab addition, and tab deletion.
4. **Themes & Layout Settings**: Asserts persistence of theme/palette/density settings across restart and live attribute binding.
5. **Advanced Sessions Panel**: Verifies session metadata (tab count, cookie count, storage estimation), rename, duplicate with cookie cloning, JSON cookie export/import, data clearing, and deletion.
6. **User Profile Isolation**: Asserts separate folder creation under `profiles/`, independent tab lists, isolated session cookies, distinct theme configurations, and profile deletion cleanup.
7. **Chrome Extensions**: Tests manifest parsing, session registration with `ses.extensions.loadExtension`, toggling state, and profile removal.

---

## Architecture & Directory Structure

```
Weby/
├── package.json                   # Project scripts and dependencies
├── README.md                      # Comprehensive documentation
├── src/
│   ├── main/
│   │   ├── main.js                # Main Electron process, window, menu, IPC dispatch
│   │   ├── session-manager.js     # Profiles, settings, session metadata, cookie I/O, extensions
│   │   └── preload.js             # Secure contextBridge IPC surface
│   └── renderer/
│       ├── index.html             # Top/Side chrome, modals (settings, sessions, extensions, profiles)
│       ├── styles.css             # Theme palettes, compact/comfortable densities, side/top layouts
│       ├── renderer.js            # Tab controller, live theme applicator, panel managers
│       └── demo.html              # Multi-login interactive test bench
└── test/
    ├── fixtures/
    │   └── sample-extension/      # Minimal unpacked test Chrome extension
    │       └── manifest.json
    ├── run-tests.js               # 12 automated integration tests
    └── check-env.js               # Diagnostic environment check script
```

### Profile Data Layout

When running, profile data is isolated inside your user data directory (`~/.config/weby/` on Linux):

```
userData/
├── profiles.json                  # Active profile ID and registered profile index
└── profiles/
    ├── default/
    │   ├── weby-state.json        # Tabs and active tab state
    │   ├── settings.json          # Theme, density, tab position, custom colors
    │   ├── sessions.json          # Session definitions, labels, and partition mappings
    │   └── extensions.json        # Installed Chrome extensions for this profile
    └── profile_<id>/
        └── ... (fully isolated data per profile)
```