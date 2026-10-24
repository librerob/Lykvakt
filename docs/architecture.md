# Architecture

The TypeScript extension uses native DOM controls and Material 3 inspired design tokens. A UI framework would add little to these few screens. Vite bundles two entries: an extension page and a service worker. All executable code is local. The CSP restricts connections to the extension origin and forbids remote scripts, frames and objects.

The extension page owns the unlocked session. The worker only reads public directory data, observes URL events when the optional permission is granted, and manages per-tab badges. It never receives an account, key, password or OTP. There are no content scripts, external messages or page-to-vault message endpoints.

The complete vault is one encrypted document in IndexedDB. Account metadata is encrypted with the seeds. A save seals a new document, then performs a strict-durability compare-and-swap transaction against the vault ID and revision. Concurrent stale writers fail with an actionable error; they do not overwrite a newer vault. There is no automatic merge of counter state.

UI operations validate the unlocked session before and after asynchronous crypto. An epoch invalidates late unlocks and sensitive UI results after locking. Explicit lock, tab switching, page hiding, page closure and inactivity drop key/data references and remove dialogs and OTP DOM nodes. Every sensitive operation checks wall-clock inactivity so a suspended timer does not extend access. Multiple pages have independent unlock state and revision-checked writes. Closing all pages or restarting Chrome therefore loses the only unwrapped keys.

Imports are bounded, parsed locally and fully validated. Unsupported records fail the whole import. The preview identifies exact duplicates and blocks conflicting configurations sharing a seed/type. Confirmation rechecks duplicates against current data, then commits the combined document atomically. Original records retain their settings and counters.

The implementation uses Web Crypto for HMAC, PBKDF2, HKDF, AES-GCM and AES-KW. `jsqr` decodes user-selected images; `tldts` supplies public/private suffix parsing. Runtime dependency notices are included in the package. Build and test dependencies do not ship in the extension.

Extension pages do not reliably report tab occlusion through document.hidden in tested Chromium. Full-window sessions therefore also observe chrome.tabs.onActivated and lock when a different tab in their own window becomes active. Only tab/window IDs are used; URL visibility is not needed. No guarantee is made about OS-lock or external-app focus signals.
