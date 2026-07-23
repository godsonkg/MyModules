# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this repo is

`MyModules` is a personal collection of **Surge panel modules** and **network-config tooling**. There is no build system and no application to run — it is a set of standalone scripts plus data and CI glue. Two independent product lines live here:

1. **Surge panel modules** — small self-contained JavaScript scripts that render a card on the Surge (iOS/macOS proxy app) dashboard. Each is paired with a `.sgmodule` manifest.
2. **Python tooling** — a read-only proxy-config health checker and a fuel-price scraper, both stdlib-only and exercised by GitHub Actions.

The primary language of comments, docs, commit messages, and module UI is **Chinese (Simplified)**. Match that when editing existing files; keep code identifiers in English.

## Repository layout

```
MyModules/
├─ AI-Check.js              # Root-level Surge panel script (AI node monitor v3.6)
├─ AI-Check.sgmodule        # Manifest for AI-Check.js (references main/AI-Check.js)
├─ README.md                # User-facing docs (Chinese), fuel module focused
├─ Scripts/                 # Surge panel scripts + the fuel scraper
│  ├─ gd_fuel_price.js      # Panel: reads data/guangdong_fuel.json, renders prices
│  ├─ ipquality_surge.js    # Panel: egress IP quality + media/AI reachability
│  ├─ unlock_probe.js       # Panel: YouTube Premium unlock probe (can set policy group)
│  └─ update_fuel.py        # Scraper: fetches + validates fuel prices, writes JSON
├─ Surge/                   # .sgmodule manifests + rule lists
│  ├─ GD_FuelPrice.sgmodule # Manifest for gd_fuel_price.js
│  ├─ IPQuality.sgmodule    # Manifest for ipquality_surge.js
│  ├─ Gemini / Gemini.list  # Gemini/Google-AI domain rule set (identical content)
├─ data/
│  └─ guangdong_fuel.json   # Fuel-price data (auto-updated by CI, do not hand-edit)
├─ tools/proxy_health/      # Read-only Surge/Loon config checker (Python, stdlib only)
│  ├─ proxy_health.py       # CLI: check / test / compare subcommands
│  ├─ tests/test_proxy_health.py
│  ├─ examples/             # Sanitized surge.conf, loon.conf, route-tests.json
│  └─ README.md             # Tool docs (Chinese)
└─ .github/workflows/
   ├─ proxy_health.yml      # Runs unittests + checks sanitized examples on change
   └─ update_fuel.yml       # Daily fuel-price scrape + auto-commit
```

## Surge module architecture (read this before editing any panel script)

A Surge module is two files:

- **`*.sgmodule`** — an INI-style manifest with sections like `[Panel]`, `[Script]`, `[MITM]`, `[Rule]`, plus `#!name`, `#!desc`, `#!arguments` header directives. It declares the panel and points `script-path` at a **raw GitHub URL on the `main` branch**, e.g.
  `https://raw.githubusercontent.com/godsonkg/MyModules/main/Scripts/ipquality_surge.js`
- **`*.js`** — the actual script, executed inside Surge's JS runtime.

### Critical consequence: scripts are loaded from `main` at runtime

Users install modules by URL. Surge fetches the `.js` from the pinned `main`-branch raw URL every run (subject to `script-update-interval`). **A change to a script has zero effect on installed users until it is merged to `main`.** Do not assume a branch edit is "live". When editing, keep the manifest's `script-path`/`source` URLs pointed at `main` unless deliberately changing distribution.

### Surge runtime globals available to scripts (no imports)

Panel scripts are plain JS with no module system. They rely on Surge-provided globals:

- `$httpClient.get(opts, cb)` — HTTP; `opts.policy` routes the request through a named Surge node/policy group (this is how IP-quality/unlock probes test a *specific* egress).
- `$done({ title, content, icon, 'icon-color' })` — renders the panel card and ends the script.
- `$argument` — the module's `argument=` string; parsed manually (see below).
- `$persistentStore.read/write` (Surge) or `$prefs` (QX) — local key/value cache.
- `$notification.post` / `$notify`, `$surge.setSelectGroupPolicy`, `$environment.platform`.
- Panel icons are **SF Symbol** names (e.g. `shield.lefthalf.filled`, `fuelpump.fill`).

### Conventions to preserve when editing scripts

- **Argument parsing is not uniform** — match the file you are editing:
  - `ipquality_surge.js` and `gd_fuel_price.js` use `&`-separated `k=v` with `decodeURIComponent`.
  - `unlock_probe.js` uses **`,`-separated** `k=v`.
- **Self-contained / no third-party deps.** `ipquality_surge.js` was deliberately rewritten to stop `eval`-ing an upstream Loon script (which kept breaking). Do not reintroduce external-script dependencies.
- **Version stamps.** Some scripts carry a `SCRIPT_VERSION` constant (e.g. `"2026-07-19.s5"`). Bump it when making a meaningful change so logs identify the running version.
- **Graceful degradation.** Scripts must never leave the panel blank. `gd_fuel_price.js` falls back remote → local cache → embedded sample; probes return `❌ 不可达`-style strings on failure rather than throwing. Preserve these fallback chains.
- **Cross-runtime shim.** `gd_fuel_price.js` supports both Surge (`$httpClient`/`$persistentStore`) and Quantumult X (`$task`/`$prefs`) via a `$` adapter object. Keep both paths working if you touch it.

> Note on `AI-Check.*`: this pair predates the `Surge/` + `Scripts/` split and lives at the repo **root** (`AI-Check.sgmodule` references `main/AI-Check.js`). Newer modules put the manifest in `Surge/` and the script in `Scripts/`. Follow the newer layout for anything new.

## Fuel-price pipeline

Flow: `update_fuel.py` (CI, daily) → `data/guangdong_fuel.json` → `gd_fuel_price.js` (panel).

- **`Scripts/update_fuel.py`** (Python 3, stdlib only — `urllib`, `re`, `json`):
  - Scrapes the Guangdong DRC official adjustment notice (max retail price for 92#/95#/0# diesel) and a third-party reference page (`oil.qqday.com`) for the 98# price.
  - `validate_prices()` enforces range `4.0–20.0` and ordering `92# < 95# < 98#` and `diesel < 92#`. **Keep validation strict** — the panel independently re-validates (`isValidData`, prices 4–20) and rejects bad data to avoid caching an error page.
  - Writes `data/guangdong_fuel.json` (UTF-8, `ensure_ascii=False`, 2-space indent) **only when values changed**; exits non-zero on scrape/parse failure so CI keeps the prior file.
- **`data/guangdong_fuel.json` is CI-owned** — do not hand-edit; the daily workflow overwrites it and auto-commits "Update Guangdong fuel price".
- **`.github/workflows/update_fuel.yml`** runs `cron: "20 0 * * *"` (UTC) = **08:20 Beijing**, plus `workflow_dispatch`.

## Proxy Health Checker (`tools/proxy_health/`)

A **read-only** static analyzer for Surge/Loon configs — it never forwards traffic and never modifies the input config.

- **Entry point:** `python tools/proxy_health/proxy_health.py <command> ...`, three subcommands:
  - `check <config>` — parse `[Proxy]`/`[Proxy Group]`/`[Rule]`, flag missing policy groups, duplicate/conflicting rules, rules after `FINAL/MATCH`, broad-suffix shadowing, and privacy leaks (subscription tokens, node URIs, MITM keys, SSIDs).
  - `test <config> <cases.json>` — domain-routing regression (`expect` per case).
  - `compare <surge> <loon> <cases.json>` — cross-client routing diff (`expect_surge`/`expect_loon`).
  - Global flags: `--format text|markdown|json`, `--output`, `--fail-on error|warning|never`, `--secret-level off|warning|error`.
- **Hard rule: never print secret values.** The checker reports only finding *type*, line number, and policy name — matched tokens/passwords/certs must stay out of output. Preserve this when adding checks.
- **Stdlib only, Python 3.10+.** No third-party imports.
- Only sanitized example configs belong in this public repo; real configs stay local.

## Testing & CI

- **Run the Python tests:**
  ```
  python -m unittest discover -s tools/proxy_health/tests -v
  ```
- **Smoke-check the checker against the sanitized examples** (what CI does):
  ```
  python tools/proxy_health/proxy_health.py check   tools/proxy_health/examples/surge.conf
  python tools/proxy_health/proxy_health.py test    tools/proxy_health/examples/loon.conf  tools/proxy_health/examples/route-tests.json
  python tools/proxy_health/proxy_health.py compare tools/proxy_health/examples/surge.conf tools/proxy_health/examples/loon.conf tools/proxy_health/examples/route-tests.json
  ```
- `proxy_health.yml` runs on any push/PR touching `tools/proxy_health/**`. There is **no automated test for the JS panel scripts** — verify those manually in Surge.

## Working conventions

- **Language:** Chinese for user-facing text, comments, and docs; English for code identifiers.
- **No dependencies / no build:** everything is stdlib Python or vanilla JS. Do not add package managers, bundlers, or npm/pip requirements.
- **Distribution is via raw `main` URLs** — treat `main` as the release channel for installed modules; merges are deployments.
- **Don't hand-edit generated data** (`data/guangdong_fuel.json`).
- **Keep panels non-empty on error** and **keep the checker silent about secrets** — these are the two invariants most likely to be broken by a well-meaning refactor.
- Manifest metadata (`#!name`, `#!desc`, `#!arguments-desc`, icons, `homepage=https://github.com/godsonkg/MyModules`) is user-visible; update it alongside behavior changes.
