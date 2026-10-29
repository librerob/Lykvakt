# Chrome, Edge and Firefox

All three builds come from this repository and use the same vault and backup format. Each browser has its own local vault; accounts do not sync between browsers. Use an encrypted backup to move them.

## Build

Node 24 is required. Install with `npm ci --ignore-scripts`, then choose a target:

| Browser              | Build                   | Output          | Package                   |
| -------------------- | ----------------------- | --------------- | ------------------------- |
| Chrome 120+          | `npm run build`         | `dist/`         | `npm run package`         |
| Edge 120+            | `npm run build:edge`    | `dist-edge/`    | `npm run package:edge`    |
| Firefox 153+ desktop | `npm run build:firefox` | `dist-firefox/` | `npm run package:firefox` |

`npm run build:all` builds all three. Packages and separate SHA-256 files are written to `artifacts/`. Each ZIP contains manifest.json at its root; upload the ZIP for the store you are using.

For local testing, load the matching folder through Developer mode at chrome://extensions or edge://extensions. In Firefox, open about:debugging, choose This Firefox, then Load Temporary Add-on and select dist-firefox/manifest.json. Temporary Firefox installations are removed when Firefox closes. Normal Firefox distribution requires Mozilla signing; an unsigned ZIP is a submission package, not a permanently installable add-on.

## What differs

Chrome and Edge use the same service-worker code. Edge's manifest suggests Ctrl+Shift+7 (Command+Shift+7 on Mac), avoiding the Collections shortcut reserved in older supported Edge versions. Firefox on Linux suggests Ctrl+Shift+7 because Ctrl+Shift+Y is reserved for Downloads; other platforms keep the existing shortcut. Firefox uses a non-persistent background event page and its native browser API namespace. Its manifest has a stable add-on ID, a Firefox 153 minimum and an explicit declaration that no data is collected or transmitted.

The minimum keeps the browser-issued document IDs used by session authentication. The URL UUID in a Firefox installation differs from the add-on ID, so the session guard uses runtime.getURL to check the actual extension origin as well as the sender ID. Missing or mismatched identity fails closed. Chrome's existing popup-registry fallback and frame checks remain.

Both implementations use memory-only storage.session and alarms. Firefox restricts this storage to privileged extension contexts and does not implement setAccessLevel; Chrome and Edge must explicitly confirm TRUSTED_CONTEXTS before session reads or writes. There is no fallback to disk-backed extension storage. Permissions stay exactly clipboardWrite, storage and alarms, with no host permissions or content scripts.

## Validation and upload

The required validate check waits for Chrome and the reusable Other browsers workflow, so Edge or Firefox failures block merging and release preparation. Chrome keeps the existing unit, browser, axe and native-popup checks. Other browsers runs the same Chromium suite in Microsoft Edge and separate Firefox checks through Mozilla's geckodriver. Draft releases collect all three browser ZIPs and the matching Firefox source ZIP, verify their checksums, versions and source commit, and record the hashes in the notes. The Firefox harness uses a fresh synthetic profile and privileged browser-UI automation only in the test process; none of that access ships in the extension.

Workflow results are the source of truth for which browser versions passed. Store submission and approval are separate from a passing build.

Use the common description in [the listing draft](store/listing-draft.md) for Chrome Web Store, Edge Add-ons and Firefox Add-ons. Use the matching browser's screenshots, the same privacy-policy URL and a ZIP from the same commit. Include the complete source and reproducible build instructions when Mozilla requests them.

The Firefox manifest declares no collection because accounts, imports, session keys and backups stay local. Each store still needs its own developer account, listing, review and approval.

References: [Edge keyboard shortcuts](https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge), [Microsoft's porting guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension), [Firefox background support](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), [Firefox session storage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session), [document-ID compatibility](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/runtime.json), [Firefox data-consent declaration](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
