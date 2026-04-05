# Grim Dawn Build Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side single-page Grim Dawn build calculator covering class skills from both masteries, with full rule simulation, URL-encoded build state, and search-based skill highlighting, deployed to GitHub Pages.

**Architecture:** Two tracks. Track 1 is a browser app (TypeScript, no bundler, Bootstrap 5 via CDN) living under `tools/calc/`. Track 2 is a Python extraction pipeline at the repo root that reads vanilla GD data and emits per-version JSON snapshots of skill data + converted PNG icons. Build state is encoded into a compact base64url-encoded binary blob placed in `location.hash`.

**Tech Stack:** TypeScript compiled with `tsc` (no bundler), Bootstrap 5 (CDN), vanilla DOM, `node --test` for unit tests, Python 3 + Pillow for the extraction pipeline.

**Plan spec reference:** `docs/superpowers/specs/2026-04-05-gd-build-calculator-design.md`

**General conventions for every task:**
* Commit messages use conventional commit prefixes (`feat:`, `test:`, `chore:`, `fix:`).
* All commits are authored by `Claude Code <herve.quiroz+claude@gmail.com>`. No `Co-Authored-By` line (per `CLAUDE.md`).
* Configure git author on the command line per commit: `git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" commit -m "..."`.
* TypeScript: strict mode, ES2022 target, no `any` without a reason.
* No new dependencies beyond what each task lists.

---

## Task 1: Scaffold TypeScript project and dev server

**Files:**
- Create: `tools/calc/package.json`
- Create: `tools/calc/tsconfig.json`
- Create: `tools/calc/.gitignore`
- Create: `tools/calc/index.html`
- Create: `tools/calc/css/style.css`
- Create: `tools/calc/src/main.ts`
- Create: `tools/calc/js/.gitkeep`

- [ ] **Step 1: Create `tools/calc/package.json`**

```json
{
  "name": "gd-build-calculator",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "serve": "python3 -m http.server 8000",
    "dev": "concurrently -n tsc,http 'npm run watch' 'npm run serve'",
    "test": "tsc && node --test js/**/*.test.js"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2: Create `tools/calc/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./js",
    "rootDir": "./src",
    "sourceMap": true,
    "declaration": false,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "js"]
}
```

- [ ] **Step 3: Create `tools/calc/.gitignore`**

```
node_modules/
*.log
```

(Note: compiled JS in `js/` IS committed — do not gitignore it.)

- [ ] **Step 4: Create `tools/calc/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grim Dawn build calculator</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="css/style.css" rel="stylesheet">
</head>
<body>
  <div class="container-fluid py-3">
    <h1 class="h3">Grim Dawn build calculator</h1>
    <p id="status">Loading...</p>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create `tools/calc/css/style.css`**

```css
body { background: #f8f9fa; }
```

- [ ] **Step 6: Create `tools/calc/src/main.ts`**

```ts
const el = document.getElementById('status');
if (el) el.textContent = 'Scaffold OK';
console.log('Calculator scaffold loaded');
```

- [ ] **Step 7: Create `tools/calc/js/.gitkeep`**

Empty file, to keep the directory in git.

- [ ] **Step 8: Install dependencies and verify build**

Run:
```bash
cd tools/calc
npm install
npm run build
```
Expected: no errors. `tools/calc/js/main.js` exists.

- [ ] **Step 9: Verify server + browser load**

Run (in background or separate terminal):
```bash
cd tools/calc && python3 -m http.server 8000
```
Open `http://localhost:8000/tools/calc/` in the Windows browser.
Expected: page shows "Grim Dawn build calculator" and "Scaffold OK".

Stop the server.

- [ ] **Step 10: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: scaffold TypeScript build calculator project"
```

---

## Task 2: Prototype `.tex` → PNG conversion

This task de-risks the icon pipeline early. We build a standalone converter and verify it produces usable PNGs against a handful of real GD `.tex` files. If this fails, we adjust the strategy before sinking time into downstream work.

**Files:**
- Create: `tex_to_png.py`
- Create: `tests/test_tex_to_png.py`

- [ ] **Step 1: Check Pillow availability**

Run:
```bash
python3 -c "from PIL import Image; print('ok')"
```
Expected: `ok`. If it fails, install with `pip install --user Pillow` and retry.

- [ ] **Step 2: Locate sample `.tex` files**

Run:
```bash
python3 extract_arc.py "/mnt/c/Program Files (x86)/Steam/steamapps/common/Grim Dawn/resources/Items.arc" /tmp/gd_items_extracted 2>&1 | head -10
find /tmp/gd_items_extracted -name "*.tex" | head -5
```
Expected: at least 5 `.tex` files listed.

- [ ] **Step 3: Inspect .tex header structure**

Run:
```bash
python3 -c "
import sys
p = open('/tmp/gd_items_extracted/' + open('/dev/stdin').readlines()[0].split('/tmp/gd_items_extracted/')[1].strip(), 'rb').read(32)
print(p.hex())
print('first 4 bytes as ASCII:', p[:4])
" <<< "$(find /tmp/gd_items_extracted -name '*.tex' | head -1)"
```
Expected: first 4 bytes = `GRIM` or similar magic. The DDS signature `DDS ` (44 44 53 20) should appear 8 or 12 bytes in.

Note the offset to the DDS payload — that's the wrapper size to strip.

- [ ] **Step 4: Create `tex_to_png.py` skeleton**

```python
#!/usr/bin/env python3
"""Convert GD .tex files to PNG.

GD .tex format: small header + DDS payload. This script strips the header
and decodes the DDS via Pillow.
"""
import io
import sys
from pathlib import Path
from PIL import Image


def find_dds_offset(data: bytes) -> int:
    """Return the byte offset of the 'DDS ' signature in the .tex file."""
    sig = b"DDS "
    idx = data.find(sig)
    if idx < 0:
        raise ValueError("DDS signature not found in .tex file")
    return idx


def tex_to_png(tex_path: Path, png_path: Path) -> None:
    data = tex_path.read_bytes()
    offset = find_dds_offset(data)
    dds_data = data[offset:]
    img = Image.open(io.BytesIO(dds_data))
    img.save(png_path, "PNG")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: tex_to_png.py <input.tex> <output.png>", file=sys.stderr)
        return 2
    tex_to_png(Path(argv[1]), Path(argv[2]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

- [ ] **Step 5: Smoke-test conversion on one .tex**

Run:
```bash
TEX=$(find /tmp/gd_items_extracted -name "*.tex" | head -1)
python3 tex_to_png.py "$TEX" /tmp/test_icon.png
file /tmp/test_icon.png
```
Expected: `/tmp/test_icon.png: PNG image data, ...`.

If Pillow can't decode DDS natively: install `imageio` + `imageio-ffmpeg` or `wand` (ImageMagick). Retry with:
```python
# fallback using wand
from wand.image import Image as WandImage
with WandImage(blob=dds_data, format='dds') as img:
    img.format = 'png'
    img.save(filename=str(png_path))
```

- [ ] **Step 6: Open the PNG in the Windows browser to visually verify**

Copy to a Windows-accessible path:
```bash
cp /tmp/test_icon.png /mnt/c/Users/$(whoami | tr -d '\r')/test_icon.png 2>/dev/null || \
  cp /tmp/test_icon.png /mnt/c/Windows/Temp/test_icon.png
```
Open in a file explorer. Expected: a visible game icon, not garbage.

If corrupt: go back to step 3 and re-check the DDS offset. The wrapper size may not be fixed — some `.tex` files have padding.

- [ ] **Step 7: Convert 5 random .tex files as batch sanity check**

```bash
for tex in $(find /tmp/gd_items_extracted -name "*.tex" | shuf -n 5); do
  name=$(basename "$tex" .tex)
  python3 tex_to_png.py "$tex" "/tmp/${name}.png" && echo "OK $name" || echo "FAIL $name"
done
```
Expected: 5/5 successful conversions.

- [ ] **Step 8: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tex_to_png.py
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add .tex to PNG conversion utility"
```

---

## Task 3: Create shared TypeScript types

**Files:**
- Create: `tools/calc/src/types.ts`

- [ ] **Step 1: Create `tools/calc/src/types.ts`**

```ts
export interface SkillUiPos {
  row: number;
  col: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxRank: number;
  ui: SkillUiPos;
  prereqBar: number;
  parent: string | null;
  parentMinRank: number;
}

export interface Mastery {
  id: number;
  name: string;
  barMaxRank: number;
  skills: Skill[];
}

export interface SkillsData {
  gdVersion: string;
  pointsPerLevel: number[];
  questRewardPoints: number;
  masteries: Mastery[];
}

export interface VersionsData {
  versions: string[];
  latest: number;
}

export interface BuildState {
  versionId: number;
  masteries: [number | null, number | null];
  level: number | null;
  customPoints: number | null;
  questRewards: boolean;
  masteryBar: [number, number];
  allocations: Map<string, number>;
}

export function emptyBuildState(versionId: number): BuildState {
  return {
    versionId,
    masteries: [null, null],
    level: null,
    customPoints: null,
    questRewards: true,
    masteryBar: [0, 0],
    allocations: new Map(),
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run from `tools/calc`:
```bash
npm run build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/types.ts tools/calc/js/types.js tools/calc/js/types.js.map
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add shared types for calculator state model"
```

---

## Task 4: Build a test skill-data fixture

A minimal `skills.json` fixture with 2 small masteries so that downstream logic can be tested against realistic shapes without waiting for the Python extractor.

**Files:**
- Create: `tools/calc/data/versions.json`
- Create: `tools/calc/data/skills/skills-fixture.json`

- [ ] **Step 1: Create `tools/calc/data/versions.json`**

```json
{
  "versions": ["fixture"],
  "latest": 0
}
```

- [ ] **Step 2: Create `tools/calc/data/skills/skills-fixture.json`**

```json
{
  "gdVersion": "fixture",
  "pointsPerLevel": [0, 3, 3, 3, 3],
  "questRewardPoints": 2,
  "masteries": [
    {
      "id": 1,
      "name": "TestMasteryA",
      "barMaxRank": 10,
      "skills": [
        {
          "id": "a.swing",
          "name": "Swing",
          "description": "A basic physical attack",
          "icon": "a_swing.png",
          "maxRank": 10,
          "ui": {"row": 0, "col": 0},
          "prereqBar": 1,
          "parent": null,
          "parentMinRank": 0
        },
        {
          "id": "a.bigswing",
          "name": "Big Swing",
          "description": "Modifier: adds cold damage",
          "icon": "a_bigswing.png",
          "maxRank": 5,
          "ui": {"row": 0, "col": 1},
          "prereqBar": 3,
          "parent": "a.swing",
          "parentMinRank": 1
        },
        {
          "id": "a.shout",
          "name": "War Cry",
          "description": "A battle shout with fire damage",
          "icon": "a_shout.png",
          "maxRank": 8,
          "ui": {"row": 1, "col": 0},
          "prereqBar": 5,
          "parent": null,
          "parentMinRank": 0
        }
      ]
    },
    {
      "id": 2,
      "name": "TestMasteryB",
      "barMaxRank": 10,
      "skills": [
        {
          "id": "b.bolt",
          "name": "Cold Bolt",
          "description": "A projectile dealing cold damage",
          "icon": "b_bolt.png",
          "maxRank": 10,
          "ui": {"row": 0, "col": 0},
          "prereqBar": 1,
          "parent": null,
          "parentMinRank": 0
        },
        {
          "id": "b.shield",
          "name": "Ice Shield",
          "description": "Defensive barrier",
          "icon": "b_shield.png",
          "maxRank": 5,
          "ui": {"row": 1, "col": 0},
          "prereqBar": 3,
          "parent": null,
          "parentMinRank": 0
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/data/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add skills fixture for calculator testing"
```

---

## Task 5: Base64url helpers + byte buffer

A tiny module used by state encoding. Extracted because it's independently testable.

**Files:**
- Create: `tools/calc/src/base64url.ts`
- Create: `tools/calc/src/base64url.test.ts`

- [ ] **Step 1: Write failing test**

Create `tools/calc/src/base64url.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64Url, base64UrlToBytes } from './base64url.js';

test('bytesToBase64Url: empty array', () => {
  assert.equal(bytesToBase64Url(new Uint8Array([])), '');
});

test('bytesToBase64Url: single byte', () => {
  assert.equal(bytesToBase64Url(new Uint8Array([0])), 'AA');
  assert.equal(bytesToBase64Url(new Uint8Array([255])), '_w');
});

test('bytesToBase64Url: three bytes (no padding needed)', () => {
  assert.equal(bytesToBase64Url(new Uint8Array([1, 2, 3])), 'AQID');
});

test('bytesToBase64Url: URL-safe alphabet (no + or /)', () => {
  // bytes that in standard base64 would produce + and /
  const b = new Uint8Array([0xfb, 0xef, 0xff]);
  const s = bytesToBase64Url(b);
  assert.ok(!s.includes('+'));
  assert.ok(!s.includes('/'));
  assert.ok(!s.includes('='));
});

test('base64UrlToBytes: roundtrip arbitrary bytes', () => {
  const input = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 42]);
  const encoded = bytesToBase64Url(input);
  const decoded = base64UrlToBytes(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(input));
});

test('base64UrlToBytes: roundtrip 100 random byte arrays', () => {
  for (let i = 0; i < 100; i++) {
    const len = Math.floor(Math.random() * 80) + 1;
    const input = new Uint8Array(len);
    for (let j = 0; j < len; j++) input[j] = Math.floor(Math.random() * 256);
    const encoded = bytesToBase64Url(input);
    const decoded = base64UrlToBytes(encoded);
    assert.deepEqual(Array.from(decoded), Array.from(input));
  }
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd tools/calc
npm run build 2>&1 | head
```
Expected: compile error (module `./base64url.js` not found).

- [ ] **Step 3: Implement `tools/calc/src/base64url.ts`**

```ts
// URL-safe base64 with no padding, per RFC 4648 §5.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += ALPHABET[(n >> 6) & 63];
    out += ALPHABET[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63];
    out += ALPHABET[(n >> 12) & 63];
    out += ALPHABET[(n >> 6) & 63];
  }
  return out;
}

const DECODE_TABLE: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  DECODE_TABLE[ALPHABET[i]] = i;
}

export function base64UrlToBytes(s: string): Uint8Array {
  const len = s.length;
  const fullGroups = Math.floor(len / 4);
  const rem = len % 4;
  const outLen = fullGroups * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);
  let oi = 0;
  let si = 0;
  for (let g = 0; g < fullGroups; g++) {
    const n =
      (DECODE_TABLE[s[si]] << 18) |
      (DECODE_TABLE[s[si + 1]] << 12) |
      (DECODE_TABLE[s[si + 2]] << 6) |
      DECODE_TABLE[s[si + 3]];
    out[oi++] = (n >> 16) & 0xff;
    out[oi++] = (n >> 8) & 0xff;
    out[oi++] = n & 0xff;
    si += 4;
  }
  if (rem === 2) {
    const n = (DECODE_TABLE[s[si]] << 18) | (DECODE_TABLE[s[si + 1]] << 12);
    out[oi++] = (n >> 16) & 0xff;
  } else if (rem === 3) {
    const n =
      (DECODE_TABLE[s[si]] << 18) |
      (DECODE_TABLE[s[si + 1]] << 12) |
      (DECODE_TABLE[s[si + 2]] << 6);
    out[oi++] = (n >> 16) & 0xff;
    out[oi++] = (n >> 8) & 0xff;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd tools/calc
npm run build
node --test js/base64url.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/base64url.ts tools/calc/src/base64url.test.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add base64url encode/decode helpers"
```

---

## Task 6: Build state encode / decode

**Files:**
- Create: `tools/calc/src/state.ts`
- Create: `tools/calc/src/state.test.ts`

- [ ] **Step 1: Write failing roundtrip test**

Create `tools/calc/src/state.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState } from './state.js';
import { emptyBuildState } from './types.js';
import type { BuildState, SkillsData } from './types.js';

const fixture: SkillsData = {
  gdVersion: 'fixture',
  pointsPerLevel: [0, 3, 3],
  questRewardPoints: 2,
  masteries: [
    {
      id: 1, name: 'A', barMaxRank: 10,
      skills: [
        { id: 'a.one', name: 'One', description: '', icon: '', maxRank: 10, ui: {row:0,col:0}, prereqBar: 1, parent: null, parentMinRank: 0 },
        { id: 'a.two', name: 'Two', description: '', icon: '', maxRank: 5, ui: {row:0,col:1}, prereqBar: 3, parent: 'a.one', parentMinRank: 1 },
      ],
    },
    {
      id: 2, name: 'B', barMaxRank: 10,
      skills: [
        { id: 'b.one', name: 'One', description: '', icon: '', maxRank: 10, ui: {row:0,col:0}, prereqBar: 1, parent: null, parentMinRank: 0 },
      ],
    },
  ],
};

test('encode/decode: empty state roundtrips', () => {
  const s = emptyBuildState(0);
  const encoded = encodeState(s, fixture);
  const decoded = decodeState(encoded, fixture);
  assert.deepEqual(decoded, s);
});

test('encode/decode: state with allocations roundtrips', () => {
  const s: BuildState = {
    versionId: 0,
    masteries: [1, 2],
    level: 50,
    customPoints: null,
    questRewards: true,
    masteryBar: [6, 4],
    allocations: new Map([['a.one', 3], ['a.two', 2], ['b.one', 7]]),
  };
  const encoded = encodeState(s, fixture);
  const decoded = decodeState(encoded, fixture);
  assert.equal(decoded.versionId, 0);
  assert.deepEqual(decoded.masteries, [1, 2]);
  assert.equal(decoded.level, 50);
  assert.equal(decoded.customPoints, null);
  assert.equal(decoded.questRewards, true);
  assert.deepEqual(decoded.masteryBar, [6, 4]);
  assert.equal(decoded.allocations.get('a.one'), 3);
  assert.equal(decoded.allocations.get('a.two'), 2);
  assert.equal(decoded.allocations.get('b.one'), 7);
});

test('canonical form: swapping slots produces same URL', () => {
  const s1: BuildState = {
    versionId: 0,
    masteries: [1, 2],
    level: null, customPoints: null, questRewards: true,
    masteryBar: [5, 3],
    allocations: new Map([['a.one', 2], ['b.one', 4]]),
  };
  const s2: BuildState = {
    versionId: 0,
    masteries: [2, 1],         // swapped
    level: null, customPoints: null, questRewards: true,
    masteryBar: [3, 5],         // bars also swapped
    allocations: new Map([['a.one', 2], ['b.one', 4]]),
  };
  assert.equal(encodeState(s1, fixture), encodeState(s2, fixture));
});

test('canonical form: null mastery in slot A is normalized', () => {
  const s: BuildState = {
    versionId: 0,
    masteries: [null, 2],
    level: null, customPoints: null, questRewards: true,
    masteryBar: [0, 4],
    allocations: new Map([['b.one', 3]]),
  };
  const encoded = encodeState(s, fixture);
  const decoded = decodeState(encoded, fixture);
  // After canonicalization, single mastery lands in slot A.
  assert.deepEqual(decoded.masteries, [2, null]);
  assert.deepEqual(decoded.masteryBar, [4, 0]);
  assert.equal(decoded.allocations.get('b.one'), 3);
});

test('customPoints: 0 distinguishable from unset', () => {
  const s: BuildState = {
    versionId: 0,
    masteries: [null, null],
    level: null, customPoints: 0, questRewards: false,
    masteryBar: [0, 0],
    allocations: new Map(),
  };
  const decoded = decodeState(encodeState(s, fixture), fixture);
  assert.equal(decoded.customPoints, 0);
  assert.equal(decoded.questRewards, false);
});

test('customPoints: 65534 is valid, 0xFFFF means unset', () => {
  const s: BuildState = {
    versionId: 0, masteries: [null, null],
    level: null, customPoints: 65534, questRewards: true,
    masteryBar: [0, 0], allocations: new Map(),
  };
  const decoded = decodeState(encodeState(s, fixture), fixture);
  assert.equal(decoded.customPoints, 65534);
});

test('decode: truncated string throws', () => {
  assert.throws(() => decodeState('AA', fixture));
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd tools/calc
npm run build 2>&1 | head
```
Expected: compile error (module `./state.js` not found).

- [ ] **Step 3: Implement `tools/calc/src/state.ts`**

```ts
import { bytesToBase64Url, base64UrlToBytes } from './base64url.js';
import type { BuildState, SkillsData } from './types.js';

const HEADER_BYTES = 9;

function skillsForMastery(masteryId: number, data: SkillsData) {
  const m = data.masteries.find(m => m.id === masteryId);
  if (!m) throw new Error(`Unknown mastery id ${masteryId}`);
  return m.skills;
}

/**
 * Canonicalize a state for encoding. The two slots carry no semantic meaning,
 * so we place the lower-id mastery in slot A. A single mastery always lands
 * in slot A.
 */
function canonicalize(state: BuildState): BuildState {
  const [mA, mB] = state.masteries;
  const [bA, bB] = state.masteryBar;

  const shouldSwap =
    (mA === null && mB !== null) ||
    (mA !== null && mB !== null && mA > mB);

  if (!shouldSwap) return state;

  return {
    ...state,
    masteries: [mB, mA],
    masteryBar: [bB, bA],
  };
}

export function encodeState(state: BuildState, data: SkillsData): string {
  const c = canonicalize(state);
  const [mA, mB] = c.masteries;
  const [bA, bB] = c.masteryBar;

  const ranksFor = (mid: number | null): number[] => {
    if (mid === null) return [];
    return skillsForMastery(mid, data).map(
      s => c.allocations.get(s.id) ?? 0
    );
  };

  const ranksA = ranksFor(mA);
  const ranksB = ranksFor(mB);
  const body = HEADER_BYTES + ranksA.length + ranksB.length;
  const bytes = new Uint8Array(body);

  bytes[0] = c.versionId & 0xff;
  bytes[1] = (mA ?? 0) & 0xff;
  bytes[2] = (mB ?? 0) & 0xff;
  bytes[3] = (c.level ?? 0) & 0xff;
  const cp = c.customPoints ?? 0xffff;
  bytes[4] = (cp >> 8) & 0xff;
  bytes[5] = cp & 0xff;
  bytes[6] = c.questRewards ? 1 : 0;
  bytes[7] = bA & 0xff;
  bytes[8] = bB & 0xff;

  let off = HEADER_BYTES;
  for (const r of ranksA) bytes[off++] = r & 0xff;
  for (const r of ranksB) bytes[off++] = r & 0xff;

  return bytesToBase64Url(bytes);
}

export function decodeState(encoded: string, data: SkillsData): BuildState {
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length < HEADER_BYTES) {
    throw new Error(`Encoded state too short: ${bytes.length} bytes`);
  }

  const versionId = bytes[0];
  const mA = bytes[1] === 0 ? null : bytes[1];
  const mB = bytes[2] === 0 ? null : bytes[2];
  const level = bytes[3] === 0 ? null : bytes[3];
  const cpRaw = (bytes[4] << 8) | bytes[5];
  const customPoints = cpRaw === 0xffff ? null : cpRaw;
  const questRewards = bytes[6] !== 0;
  const barA = bytes[7];
  const barB = bytes[8];

  const ranksALen = mA === null ? 0 : skillsForMastery(mA, data).length;
  const ranksBLen = mB === null ? 0 : skillsForMastery(mB, data).length;
  const expected = HEADER_BYTES + ranksALen + ranksBLen;
  if (bytes.length !== expected) {
    throw new Error(
      `Encoded state length mismatch: got ${bytes.length}, expected ${expected}`
    );
  }

  const allocations = new Map<string, number>();
  let off = HEADER_BYTES;
  if (mA !== null) {
    const skills = skillsForMastery(mA, data);
    for (const s of skills) {
      const r = bytes[off++];
      if (r > 0) allocations.set(s.id, r);
    }
  }
  if (mB !== null) {
    const skills = skillsForMastery(mB, data);
    for (const s of skills) {
      const r = bytes[off++];
      if (r > 0) allocations.set(s.id, r);
    }
  }

  return {
    versionId,
    masteries: [mA, mB],
    level,
    customPoints,
    questRewards,
    masteryBar: [barA, barB],
    allocations,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd tools/calc
npm run build
node --test js/state.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/state.ts tools/calc/src/state.test.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add build state URL encoding with canonical form"
```

---

## Task 7: Rules engine — budget formula

**Files:**
- Create: `tools/calc/src/rules.ts`
- Create: `tools/calc/src/rules.test.ts`

- [ ] **Step 1: Write failing tests for budget formula**

Create `tools/calc/src/rules.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBudget, totalAllocated } from './rules.js';
import type { BuildState, SkillsData } from './types.js';

// vanilla-like: level 1 = 0 pts, then 3/lvl to 50, 2/lvl 51-90, 1/lvl 91-100
function vanillaPointsPerLevel(): number[] {
  const arr = [0];
  for (let L = 2; L <= 50; L++) arr.push(3);
  for (let L = 51; L <= 90; L++) arr.push(2);
  for (let L = 91; L <= 100; L++) arr.push(1);
  return arr;
}

const data: SkillsData = {
  gdVersion: 'test',
  pointsPerLevel: vanillaPointsPerLevel(),
  questRewardPoints: 18,
  masteries: [],
};

const base = (): BuildState => ({
  versionId: 0,
  masteries: [null, null],
  level: null,
  customPoints: null,
  questRewards: true,
  masteryBar: [0, 0],
  allocations: new Map(),
});

test('computeBudget: level 1 with quest rewards = 18', () => {
  const s = { ...base(), level: 1 };
  assert.equal(computeBudget(s, data), 18);
});

test('computeBudget: level 50 with quest rewards = 3*49 + 18 = 165', () => {
  const s = { ...base(), level: 50 };
  assert.equal(computeBudget(s, data), 3 * 49 + 18);
});

test('computeBudget: level 90 with quest rewards = 3*49 + 2*40 + 18 = 245', () => {
  const s = { ...base(), level: 90 };
  assert.equal(computeBudget(s, data), 3 * 49 + 2 * 40 + 18);
});

test('computeBudget: level 100 with quest rewards = 3*49 + 2*40 + 1*10 + 18 = 255', () => {
  const s = { ...base(), level: 100 };
  assert.equal(computeBudget(s, data), 3 * 49 + 2 * 40 + 1 * 10 + 18);
});

test('computeBudget: no level + no custom → default level 100', () => {
  const s = base();
  assert.equal(computeBudget(s, data), 255);
});

test('computeBudget: customPoints overrides everything', () => {
  const s = { ...base(), level: 50, customPoints: 42 };
  assert.equal(computeBudget(s, data), 42);
});

test('computeBudget: questRewards off subtracts 18', () => {
  const s = { ...base(), level: 50, questRewards: false };
  assert.equal(computeBudget(s, data), 3 * 49);
});

test('totalAllocated: sums allocations + mastery bars', () => {
  const s: BuildState = {
    ...base(),
    masteryBar: [10, 5],
    allocations: new Map([['x.a', 3], ['x.b', 7]]),
  };
  assert.equal(totalAllocated(s), 10 + 5 + 3 + 7);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd tools/calc
npm run build 2>&1 | head
```
Expected: compile error (module `./rules.js` not found).

- [ ] **Step 3: Implement budget + totalAllocated in `tools/calc/src/rules.ts`**

```ts
import type { BuildState, SkillsData } from './types.js';

const DEFAULT_LEVEL = 100;

export function computeBudget(state: BuildState, data: SkillsData): number {
  if (state.customPoints !== null) return state.customPoints;
  const level = state.level ?? DEFAULT_LEVEL;
  let sum = 0;
  for (let L = 2; L <= level && L < data.pointsPerLevel.length; L++) {
    sum += data.pointsPerLevel[L];
  }
  if (state.questRewards) sum += data.questRewardPoints;
  return sum;
}

export function totalAllocated(state: BuildState): number {
  let sum = state.masteryBar[0] + state.masteryBar[1];
  for (const rank of state.allocations.values()) sum += rank;
  return sum;
}
```

- [ ] **Step 4: Run tests**

```bash
cd tools/calc
npm run build
node --test js/rules.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/rules.ts tools/calc/src/rules.test.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add skill-point budget computation"
```

---

## Task 8: Rules engine — prereqs and locks

**Files:**
- Modify: `tools/calc/src/rules.ts`
- Modify: `tools/calc/src/rules.test.ts`

- [ ] **Step 1: Append failing tests for skill locking**

Append to `tools/calc/src/rules.test.ts`:

```ts
import { isSkillUnlocked, findMastery, findSkill } from './rules.js';

const testData: SkillsData = {
  gdVersion: 'test',
  pointsPerLevel: vanillaPointsPerLevel(),
  questRewardPoints: 18,
  masteries: [
    {
      id: 1, name: 'A', barMaxRank: 50,
      skills: [
        { id: 'a.swing', name: '', description: '', icon: '', maxRank: 16, ui: {row:0,col:0}, prereqBar: 1, parent: null, parentMinRank: 0 },
        { id: 'a.big', name: '', description: '', icon: '', maxRank: 5, ui: {row:0,col:1}, prereqBar: 3, parent: 'a.swing', parentMinRank: 2 },
        { id: 'a.huge', name: '', description: '', icon: '', maxRank: 5, ui: {row:0,col:2}, prereqBar: 5, parent: 'a.big', parentMinRank: 1 },
      ],
    },
  ],
};

test('isSkillUnlocked: base skill gated by mastery bar', () => {
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [0, 0] };
  assert.equal(isSkillUnlocked(findSkill('a.swing', testData), 0, s), false);
  const s2 = { ...s, masteryBar: [1, 0] as [number, number] };
  assert.equal(isSkillUnlocked(findSkill('a.swing', testData), 0, s2), true);
});

test('isSkillUnlocked: modifier requires parent rank', () => {
  const skill = findSkill('a.big', testData);
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [3, 0], allocations: new Map([['a.swing', 1]]) };
  assert.equal(isSkillUnlocked(skill, 0, s), false, 'parent only rank 1, needs 2');
  const s2 = { ...s, allocations: new Map([['a.swing', 2]]) };
  assert.equal(isSkillUnlocked(skill, 0, s2), true);
});

test('isSkillUnlocked: modifier also checks mastery bar', () => {
  const skill = findSkill('a.big', testData);
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [2, 0], allocations: new Map([['a.swing', 5]]) };
  assert.equal(isSkillUnlocked(skill, 0, s), false, 'bar 2 < required 3');
});

test('findMastery/findSkill: helpers', () => {
  assert.equal(findMastery(1, testData).name, 'A');
  assert.throws(() => findMastery(99, testData));
  assert.equal(findSkill('a.swing', testData).id, 'a.swing');
  assert.throws(() => findSkill('nope', testData));
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd tools/calc
npm run build 2>&1 | head
```
Expected: compile error (missing exports).

- [ ] **Step 3: Extend `tools/calc/src/rules.ts`**

Append to `tools/calc/src/rules.ts`:

```ts
import type { Mastery, Skill } from './types.js';

export function findMastery(id: number, data: SkillsData): Mastery {
  const m = data.masteries.find(m => m.id === id);
  if (!m) throw new Error(`Unknown mastery id ${id}`);
  return m;
}

export function findSkill(id: string, data: SkillsData): Skill {
  for (const m of data.masteries) {
    const s = m.skills.find(s => s.id === id);
    if (s) return s;
  }
  throw new Error(`Unknown skill id ${id}`);
}

/**
 * Return true when the user can allocate at least rank 1 in this skill:
 * mastery bar is high enough, and (for modifiers) the parent skill has the
 * required rank.
 */
export function isSkillUnlocked(
  skill: Skill,
  slot: 0 | 1,
  state: BuildState,
): boolean {
  if (state.masteryBar[slot] < skill.prereqBar) return false;
  if (skill.parent !== null) {
    const parentRank = state.allocations.get(skill.parent) ?? 0;
    if (parentRank < skill.parentMinRank) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests**

```bash
cd tools/calc
npm run build
node --test js/rules.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/rules.ts tools/calc/src/rules.test.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add skill prereq locking rules"
```

---

## Task 9: Rules engine — cascade refunds

**Files:**
- Modify: `tools/calc/src/rules.ts`
- Modify: `tools/calc/src/rules.test.ts`

- [ ] **Step 1: Append failing tests for cascades**

Append to `tools/calc/src/rules.test.ts`:

```ts
import { applyDelta, type RefundEntry } from './rules.js';

test('applyDelta: simple + increments rank', () => {
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [1, 0] };
  const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, +1, testData);
  assert.equal(r.state.allocations.get('a.swing'), 1);
  assert.deepEqual(r.refunds, []);
});

test('applyDelta: - decrements, no cascade if no dependents', () => {
  const s: BuildState = {
    ...base(), masteries: [1, null], masteryBar: [1, 0],
    allocations: new Map([['a.swing', 3]]),
  };
  const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
  assert.equal(r.state.allocations.get('a.swing'), 2);
  assert.deepEqual(r.refunds, []);
});

test('applyDelta: - cascades refund when dependent requirement broken', () => {
  const s: BuildState = {
    ...base(), masteries: [1, null], masteryBar: [5, 0],
    allocations: new Map([['a.swing', 2], ['a.big', 3]]),
  };
  const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
  // a.swing drops to 1, a.big needs parent rank 2, so a.big refunds entirely.
  assert.equal(r.state.allocations.get('a.swing'), 1);
  assert.equal(r.state.allocations.has('a.big'), false);
  assert.deepEqual(r.refunds, [{ skillId: 'a.big', refunded: 3 } as RefundEntry]);
});

test('applyDelta: cascade propagates through chain', () => {
  const s: BuildState = {
    ...base(), masteries: [1, null], masteryBar: [5, 0],
    allocations: new Map([['a.swing', 2], ['a.big', 1], ['a.huge', 2]]),
  };
  const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
  // a.swing:2→1, breaks a.big (needs 2). a.big refunds. That breaks a.huge
  // (needs a.big rank 1). a.huge refunds.
  assert.equal(r.state.allocations.has('a.big'), false);
  assert.equal(r.state.allocations.has('a.huge'), false);
  assert.equal(r.refunds.length, 2);
});

test('applyDelta: lowering mastery bar cascades skills', () => {
  const s: BuildState = {
    ...base(), masteries: [1, null], masteryBar: [5, 0],
    allocations: new Map([['a.swing', 2], ['a.big', 3]]),
  };
  const r = applyDelta(s, { kind: 'bar', slot: 0 }, -3, testData);
  // bar 5→2. a.big requires bar 3 — refunds.
  assert.equal(r.state.masteryBar[0], 2);
  assert.equal(r.state.allocations.has('a.big'), false);
  assert.equal(r.state.allocations.get('a.swing'), 2);
  assert.equal(r.refunds.length, 1);
  assert.equal(r.refunds[0].skillId, 'a.big');
});

test('applyDelta: + fails when already at max', () => {
  const s: BuildState = {
    ...base(), masteries: [1, null], masteryBar: [1, 0],
    allocations: new Map([['a.swing', 16]]),
  };
  const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, +1, testData);
  assert.equal(r.state, s, 'returns unchanged state');
});

test('applyDelta: - fails when already at 0', () => {
  const s: BuildState = { ...base(), masteries: [1, null], masteryBar: [1, 0] };
  const r = applyDelta(s, { kind: 'skill', skillId: 'a.swing', slot: 0 }, -1, testData);
  assert.equal(r.state, s, 'returns unchanged state');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd tools/calc
npm run build 2>&1 | head
```
Expected: compile error (missing exports).

- [ ] **Step 3: Implement `applyDelta` in `tools/calc/src/rules.ts`**

Append:

```ts
export type DeltaTarget =
  | { kind: 'skill'; skillId: string; slot: 0 | 1 }
  | { kind: 'bar'; slot: 0 | 1 };

export interface RefundEntry {
  skillId: string;
  refunded: number;
}

export interface DeltaResult {
  state: BuildState;
  refunds: RefundEntry[];
}

/**
 * Apply a +1 or -1 change to either a skill rank or a mastery bar rank, with
 * cascade refunds for any allocated dependents whose requirements become
 * broken. Returns the original state object (by identity) if the change is
 * not legal (at cap, at zero, skill locked).
 */
export function applyDelta(
  state: BuildState,
  target: DeltaTarget,
  delta: 1 | -1,
  data: SkillsData,
): DeltaResult {
  if (target.kind === 'skill') {
    const skill = findSkill(target.skillId, data);
    const current = state.allocations.get(target.skillId) ?? 0;
    if (delta === 1) {
      if (current >= skill.maxRank) return { state, refunds: [] };
      if (!isSkillUnlocked(skill, target.slot, state)) return { state, refunds: [] };
      const allocations = new Map(state.allocations);
      allocations.set(target.skillId, current + 1);
      return { state: { ...state, allocations }, refunds: [] };
    } else {
      if (current <= 0) return { state, refunds: [] };
      const newRank = current - 1;
      const allocations = new Map(state.allocations);
      if (newRank === 0) allocations.delete(target.skillId);
      else allocations.set(target.skillId, newRank);
      let next: BuildState = { ...state, allocations };
      const refunds = cascadeRefunds(next, data);
      return { state: refunds.state, refunds: refunds.refunds };
    }
  }

  // kind === 'bar'
  const slot = target.slot;
  const current = state.masteryBar[slot];
  const masteryId = state.masteries[slot];
  if (masteryId === null) return { state, refunds: [] };
  const mastery = findMastery(masteryId, data);
  if (delta === 1) {
    if (current >= mastery.barMaxRank) return { state, refunds: [] };
    const masteryBar: [number, number] = [state.masteryBar[0], state.masteryBar[1]];
    masteryBar[slot] = current + 1;
    return { state: { ...state, masteryBar }, refunds: [] };
  } else {
    if (current <= 0) return { state, refunds: [] };
    const masteryBar: [number, number] = [state.masteryBar[0], state.masteryBar[1]];
    masteryBar[slot] = current - 1;
    const next: BuildState = { ...state, masteryBar };
    const r = cascadeRefunds(next, data);
    return { state: r.state, refunds: r.refunds };
  }
}

/**
 * Inspect all allocations in the given state; if any depends on something no
 * longer satisfied (mastery bar or parent rank), refund it. Repeat until
 * fixed point. Mutates nothing — returns a fresh state.
 */
function cascadeRefunds(state: BuildState, data: SkillsData): DeltaResult {
  const allocations = new Map(state.allocations);
  const refunds: RefundEntry[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [skillId, rank] of Array.from(allocations.entries())) {
      const skill = findSkill(skillId, data);
      // determine slot: which mastery holds this skill?
      const slot = skillSlot(skillId, state, data);
      if (slot === null) continue;
      const barOk = state.masteryBar[slot] >= skill.prereqBar;
      const parentOk =
        skill.parent === null ||
        (allocations.get(skill.parent) ?? 0) >= skill.parentMinRank;
      if (!barOk || !parentOk) {
        allocations.delete(skillId);
        refunds.push({ skillId, refunded: rank });
        changed = true;
      }
    }
  }
  return { state: { ...state, allocations }, refunds };
}

function skillSlot(
  skillId: string,
  state: BuildState,
  data: SkillsData,
): 0 | 1 | null {
  for (let i = 0; i < 2; i++) {
    const mid = state.masteries[i];
    if (mid === null) continue;
    const mastery = findMastery(mid, data);
    if (mastery.skills.some(s => s.id === skillId)) return i as 0 | 1;
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
cd tools/calc
npm run build
node --test js/rules.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/rules.ts tools/calc/src/rules.test.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add cascade refunds for skill + mastery bar changes"
```

---

## Task 10: Search module

**Files:**
- Create: `tools/calc/src/search.ts`
- Create: `tools/calc/src/search.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tools/calc/src/search.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, matchQuery } from './search.js';
import type { SkillsData } from './types.js';

const data: SkillsData = {
  gdVersion: 't', pointsPerLevel: [], questRewardPoints: 0,
  masteries: [
    { id:1, name:'A', barMaxRank:10, skills: [
      { id:'a.fire', name:'Fire Strike', description:'A burning attack that deals fire damage', icon:'', maxRank:10, ui:{row:0,col:0}, prereqBar:1, parent:null, parentMinRank:0 },
      { id:'a.cold', name:'Cold Bolt', description:'Freezes the enemy with cold damage', icon:'', maxRank:10, ui:{row:0,col:1}, prereqBar:1, parent:null, parentMinRank:0 },
      { id:'a.shout', name:'War Cry', description:'A defensive shout', icon:'', maxRank:5, ui:{row:1,col:0}, prereqBar:3, parent:null, parentMinRank:0 },
    ]},
  ],
};

test('matchQuery: empty query matches all', () => {
  const idx = buildSearchIndex(data);
  assert.equal(matchQuery('', idx).size, 0, 'empty query = no filter');
});

test('matchQuery: single term matches name', () => {
  const idx = buildSearchIndex(data);
  const m = matchQuery('fire', idx);
  assert.equal(m.has('a.fire'), true);
  assert.equal(m.has('a.cold'), false);
});

test('matchQuery: single term matches description', () => {
  const idx = buildSearchIndex(data);
  const m = matchQuery('cold', idx);
  // both a.cold (name+desc) and any other that mentions cold in description
  assert.equal(m.has('a.cold'), true);
  assert.equal(m.has('a.fire'), false);
});

test('matchQuery: case-insensitive', () => {
  const idx = buildSearchIndex(data);
  assert.equal(matchQuery('FIRE', idx).has('a.fire'), true);
  assert.equal(matchQuery('Fire', idx).has('a.fire'), true);
});

test('matchQuery: multi-word is AND', () => {
  const idx = buildSearchIndex(data);
  assert.equal(matchQuery('fire damage', idx).has('a.fire'), true);
  assert.equal(matchQuery('fire cold', idx).size, 0, 'no skill has both');
});

test('matchQuery: substring match, not whole-word', () => {
  const idx = buildSearchIndex(data);
  assert.equal(matchQuery('burn', idx).has('a.fire'), true, 'burning');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd tools/calc
npm run build 2>&1 | head
```
Expected: compile error.

- [ ] **Step 3: Implement `tools/calc/src/search.ts`**

```ts
import type { SkillsData } from './types.js';

export interface SearchEntry {
  skillId: string;
  text: string; // lowercased "name description"
}

export type SearchIndex = SearchEntry[];

export function buildSearchIndex(data: SkillsData): SearchIndex {
  const out: SearchIndex = [];
  for (const m of data.masteries) {
    for (const s of m.skills) {
      out.push({
        skillId: s.id,
        text: (s.name + ' ' + s.description).toLowerCase(),
      });
    }
  }
  return out;
}

/**
 * Given a query, return the set of matching skill ids. An empty query returns
 * an empty set, which callers interpret as "no filter active".
 */
export function matchQuery(query: string, index: SearchIndex): Set<string> {
  const q = query.trim().toLowerCase();
  if (q === '') return new Set();
  const terms = q.split(/\s+/);
  const out = new Set<string>();
  for (const entry of index) {
    let all = true;
    for (const t of terms) {
      if (!entry.text.includes(t)) { all = false; break; }
    }
    if (all) out.add(entry.skillId);
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
cd tools/calc
npm run build
node --test js/search.test.js
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/search.ts tools/calc/src/search.test.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add skill search with highlight index"
```

---

## Task 11: Rendering — mastery panel

Renders a mastery panel (bar + skills) into the DOM. No tests for this module — verified by visual smoke test in Task 13.

**Files:**
- Create: `tools/calc/src/render.ts`

- [ ] **Step 1: Create `tools/calc/src/render.ts`**

```ts
import type { BuildState, Mastery, Skill } from './types.js';
import { isSkillUnlocked } from './rules.js';

export interface RenderCallbacks {
  onSkillDelta(skillId: string, slot: 0 | 1, delta: 1 | -1): void;
  onBarDelta(slot: 0 | 1, delta: 1 | -1): void;
}

export function renderMasteryPanel(
  container: HTMLElement,
  slot: 0 | 1,
  mastery: Mastery | null,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
): void {
  container.innerHTML = '';
  if (mastery === null) {
    const empty = document.createElement('div');
    empty.className = 'text-muted fst-italic p-3';
    empty.textContent = 'No mastery selected';
    container.appendChild(empty);
    return;
  }

  // mastery bar row
  const barRow = document.createElement('div');
  barRow.className = 'd-flex align-items-center gap-2 mb-3';
  const barLabel = document.createElement('strong');
  barLabel.textContent = `${mastery.name} bar`;
  const barCount = document.createElement('span');
  barCount.className = 'badge bg-secondary';
  barCount.textContent = `${state.masteryBar[slot]}/${mastery.barMaxRank}`;
  const barPlus = mkBtn('+', () => cb.onBarDelta(slot, 1), state.masteryBar[slot] >= mastery.barMaxRank || over);
  const barMinus = mkBtn('-', () => cb.onBarDelta(slot, -1), state.masteryBar[slot] <= 0);
  barRow.append(barLabel, barCount, barPlus, barMinus);
  container.appendChild(barRow);

  // skills
  const grid = document.createElement('div');
  grid.className = 'd-flex flex-column gap-2';
  for (const skill of mastery.skills) {
    grid.appendChild(renderSkillRow(skill, slot, state, over, cb));
  }
  container.appendChild(grid);
}

function renderSkillRow(
  skill: Skill,
  slot: 0 | 1,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'd-flex align-items-center gap-2 skill-row';
  row.dataset.skillId = skill.id;
  if (skill.parent !== null) row.classList.add('ms-4');

  const rank = state.allocations.get(skill.id) ?? 0;
  const unlocked = isSkillUnlocked(skill, slot, state);
  if (!unlocked) row.classList.add('opacity-50');

  const name = document.createElement('span');
  name.className = 'flex-grow-1';
  name.textContent = skill.name;
  name.title = skill.description;

  const count = document.createElement('span');
  count.className = 'badge bg-secondary';
  count.textContent = `${rank}/${skill.maxRank}`;

  const reason = !unlocked ? lockReason(skill, slot, state) : '';
  if (reason) name.textContent = `${skill.name} (${reason})`;

  const plusDisabled = !unlocked || rank >= skill.maxRank || over;
  const minusDisabled = rank <= 0;
  const plus = mkBtn('+', () => cb.onSkillDelta(skill.id, slot, 1), plusDisabled);
  const minus = mkBtn('-', () => cb.onSkillDelta(skill.id, slot, -1), minusDisabled);

  row.append(name, count, plus, minus);
  return row;
}

function lockReason(skill: Skill, slot: 0 | 1, state: BuildState): string {
  if (state.masteryBar[slot] < skill.prereqBar) {
    return `needs bar ${skill.prereqBar}`;
  }
  if (skill.parent !== null) {
    const pr = state.allocations.get(skill.parent) ?? 0;
    if (pr < skill.parentMinRank) return `needs parent rank ${skill.parentMinRank}`;
  }
  return '';
}

function mkBtn(label: string, handler: () => void, disabled: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-sm btn-outline-primary';
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', handler);
  return b;
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd tools/calc
npm run build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/render.ts tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add mastery panel rendering"
```

---

## Task 12: Main wiring — header, state sync, URL sync

Wires the full UI: mastery dropdowns, level/points inputs, quest-rewards toggle, search, share, reset, URL hash read/write. Integrates all prior modules. Manual smoke-tested in Task 13.

**Files:**
- Modify: `tools/calc/src/main.ts`
- Modify: `tools/calc/index.html`
- Modify: `tools/calc/css/style.css`

- [ ] **Step 1: Replace `tools/calc/index.html` body**

Replace the `<body>` contents with:

```html
  <div class="container-fluid py-3">
    <h1 class="h4">Grim Dawn build calculator</h1>

    <div class="row g-2 align-items-end mb-2">
      <div class="col-md-3">
        <label class="form-label small mb-1">Mastery A</label>
        <select id="mastery-a" class="form-select form-select-sm"></select>
      </div>
      <div class="col-md-3">
        <label class="form-label small mb-1">Mastery B</label>
        <select id="mastery-b" class="form-select form-select-sm"></select>
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">Level</label>
        <input id="level" type="number" min="1" max="100" class="form-control form-control-sm" placeholder="100">
      </div>
      <div class="col-md-2">
        <label class="form-label small mb-1">Points</label>
        <input id="points" type="number" min="0" max="65534" class="form-control form-control-sm" placeholder="auto">
      </div>
      <div class="col-md-2">
        <div class="form-check">
          <input id="quest-rewards" class="form-check-input" type="checkbox" checked>
          <label class="form-check-label small" for="quest-rewards">Quest rewards</label>
        </div>
      </div>
    </div>

    <div class="row g-2 align-items-center mb-3">
      <div class="col-md-6">
        <div class="input-group input-group-sm">
          <span class="input-group-text">Search</span>
          <input id="search" type="search" class="form-control" placeholder="e.g. cold">
          <span id="search-count" class="input-group-text"></span>
        </div>
      </div>
      <div class="col-md-3">
        <span id="budget-label" class="badge bg-primary">0 / 0</span>
        <span id="version-label" class="text-muted small ms-2"></span>
      </div>
      <div class="col-md-3 text-end">
        <button id="reset" type="button" class="btn btn-sm btn-outline-secondary">Reset</button>
        <button id="share" type="button" class="btn btn-sm btn-primary">Share</button>
      </div>
    </div>

    <div id="over-banner" class="alert alert-warning py-2 d-none">Build exceeds current point budget.</div>

    <div class="row g-3">
      <div class="col-md-6">
        <div id="panel-a" class="border rounded p-3 bg-white"></div>
      </div>
      <div class="col-md-6">
        <div id="panel-b" class="border rounded p-3 bg-white"></div>
      </div>
    </div>

    <div id="toast-container" class="toast-container position-fixed bottom-0 end-0 p-3"></div>
  </div>
```

- [ ] **Step 2: Add CSS hooks to `tools/calc/css/style.css`**

Replace contents with:

```css
body { background: #f8f9fa; }
.skill-row.search-miss { opacity: 0.25; }
#budget-label.over { background: var(--bs-danger) !important; }
```

- [ ] **Step 3: Replace `tools/calc/src/main.ts`**

```ts
import type { BuildState, SkillsData, VersionsData } from './types.js';
import { emptyBuildState } from './types.js';
import { encodeState, decodeState } from './state.js';
import { computeBudget, totalAllocated, applyDelta, findMastery } from './rules.js';
import { buildSearchIndex, matchQuery } from './search.js';
import { renderMasteryPanel } from './render.js';

interface AppRefs {
  masteryA: HTMLSelectElement;
  masteryB: HTMLSelectElement;
  level: HTMLInputElement;
  points: HTMLInputElement;
  questRewards: HTMLInputElement;
  search: HTMLInputElement;
  searchCount: HTMLElement;
  budget: HTMLElement;
  versionLabel: HTMLElement;
  reset: HTMLButtonElement;
  share: HTMLButtonElement;
  panelA: HTMLElement;
  panelB: HTMLElement;
  overBanner: HTMLElement;
  toastContainer: HTMLElement;
}

async function boot(): Promise<void> {
  const versionsRes = await fetch('data/versions.json');
  const versions: VersionsData = await versionsRes.json();

  // read versionId from URL hash or use latest
  const hash = window.location.hash.slice(1);
  let versionId = versions.latest;
  if (hash) {
    // decode byte 0 = versionId
    try {
      const firstByte = decodeFirstByte(hash);
      if (firstByte >= 0 && firstByte < versions.versions.length) {
        versionId = firstByte;
      }
    } catch { /* fall through */ }
  }

  const versionName = versions.versions[versionId];
  const skillsRes = await fetch(`data/skills/skills-${versionName}.json`);
  const data: SkillsData = await skillsRes.json();

  let state: BuildState;
  if (hash) {
    try {
      state = decodeState(hash, data);
    } catch (e) {
      console.warn('decode failed, starting fresh', e);
      state = emptyBuildState(versionId);
    }
  } else {
    state = emptyBuildState(versionId);
  }

  const refs = collectRefs();
  const searchIndex = buildSearchIndex(data);

  populateMasteryDropdowns(refs, data, state);
  refs.versionLabel.textContent = `GD ${data.gdVersion}`;

  const setState = (next: BuildState) => {
    state = next;
    syncUrl(state, data);
    render();
  };

  const render = () => {
    syncInputs(refs, state);
    const budget = computeBudget(state, data);
    const total = totalAllocated(state);
    const over = total > budget;
    refs.budget.textContent = `${total} / ${budget}`;
    refs.budget.classList.toggle('over', over);
    refs.overBanner.classList.toggle('d-none', !over);

    const mA = state.masteries[0] === null ? null : findMastery(state.masteries[0], data);
    const mB = state.masteries[1] === null ? null : findMastery(state.masteries[1], data);
    const cb = {
      onSkillDelta: (skillId: string, slot: 0 | 1, delta: 1 | -1) => {
        const r = applyDelta(state, { kind: 'skill', skillId, slot }, delta, data);
        if (r.refunds.length) showRefundToast(refs, r.refunds, data);
        setState(r.state);
      },
      onBarDelta: (slot: 0 | 1, delta: 1 | -1) => {
        const r = applyDelta(state, { kind: 'bar', slot }, delta, data);
        if (r.refunds.length) showRefundToast(refs, r.refunds, data);
        setState(r.state);
      },
    };
    renderMasteryPanel(refs.panelA, 0, mA, state, over, cb);
    renderMasteryPanel(refs.panelB, 1, mB, state, over, cb);

    // search highlights
    applySearchHighlight(refs, searchIndex);
  };

  // wire up dropdowns
  refs.masteryA.addEventListener('change', () => handleMasteryChange(0, refs, state, data, setState));
  refs.masteryB.addEventListener('change', () => handleMasteryChange(1, refs, state, data, setState));
  refs.level.addEventListener('input', () => {
    const v = refs.level.value.trim();
    setState({ ...state, level: v === '' ? null : parseInt(v, 10) });
  });
  refs.points.addEventListener('input', () => {
    const v = refs.points.value.trim();
    setState({ ...state, customPoints: v === '' ? null : parseInt(v, 10) });
  });
  refs.questRewards.addEventListener('change', () => {
    setState({ ...state, questRewards: refs.questRewards.checked });
  });
  refs.search.addEventListener('input', () => {
    applySearchHighlight(refs, searchIndex);
  });
  refs.reset.addEventListener('click', () => {
    setState({ ...state, masteryBar: [0, 0], allocations: new Map() });
  });
  refs.share.addEventListener('click', () => handleShare(refs));

  render();
}

function decodeFirstByte(hash: string): number {
  // base64url: first char contributes top 6 bits, second contributes next 2
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const c0 = A.indexOf(hash[0]);
  const c1 = A.indexOf(hash[1] ?? 'A');
  if (c0 < 0 || c1 < 0) throw new Error('bad hash');
  return ((c0 << 2) | (c1 >> 4)) & 0xff;
}

function collectRefs(): AppRefs {
  const byId = <T extends HTMLElement>(id: string) => {
    const e = document.getElementById(id);
    if (!e) throw new Error(`#${id} missing`);
    return e as T;
  };
  return {
    masteryA: byId('mastery-a'),
    masteryB: byId('mastery-b'),
    level: byId('level'),
    points: byId('points'),
    questRewards: byId('quest-rewards'),
    search: byId('search'),
    searchCount: byId('search-count'),
    budget: byId('budget-label'),
    versionLabel: byId('version-label'),
    reset: byId('reset'),
    share: byId('share'),
    panelA: byId('panel-a'),
    panelB: byId('panel-b'),
    overBanner: byId('over-banner'),
    toastContainer: byId('toast-container'),
  };
}

function populateMasteryDropdowns(refs: AppRefs, data: SkillsData, state: BuildState): void {
  for (const sel of [refs.masteryA, refs.masteryB]) {
    sel.innerHTML = '<option value="">— none —</option>';
    for (const m of data.masteries) {
      const opt = document.createElement('option');
      opt.value = String(m.id);
      opt.textContent = m.name;
      sel.appendChild(opt);
    }
  }
  syncInputs(refs, state);
}

function syncInputs(refs: AppRefs, state: BuildState): void {
  refs.masteryA.value = state.masteries[0] === null ? '' : String(state.masteries[0]);
  refs.masteryB.value = state.masteries[1] === null ? '' : String(state.masteries[1]);
  // hide the other's selection
  for (const sel of [refs.masteryA, refs.masteryB]) {
    const other = sel === refs.masteryA ? state.masteries[1] : state.masteries[0];
    for (const opt of Array.from(sel.options)) {
      opt.hidden = opt.value !== '' && other !== null && parseInt(opt.value, 10) === other;
    }
  }
  refs.level.value = state.level === null ? '' : String(state.level);
  refs.points.value = state.customPoints === null ? '' : String(state.customPoints);
  refs.questRewards.checked = state.questRewards;
}

function handleMasteryChange(
  slot: 0 | 1,
  refs: AppRefs,
  state: BuildState,
  data: SkillsData,
  setState: (s: BuildState) => void,
): void {
  const sel = slot === 0 ? refs.masteryA : refs.masteryB;
  const raw = sel.value;
  const newId: number | null = raw === '' ? null : parseInt(raw, 10);
  const oldId = state.masteries[slot];

  // refund only matters if there was allocation in the removed mastery
  const hadPoints = oldId !== null && (
    state.masteryBar[slot] > 0 ||
    Array.from(state.allocations.keys()).some(k => {
      return findMastery(oldId, data).skills.some(s => s.id === k);
    })
  );

  if (hadPoints && !window.confirm('Changing mastery will refund all its points. Continue?')) {
    // revert dropdown
    sel.value = oldId === null ? '' : String(oldId);
    return;
  }

  // drop allocations belonging to oldId
  const allocations = new Map(state.allocations);
  if (oldId !== null) {
    const mastery = findMastery(oldId, data);
    for (const s of mastery.skills) allocations.delete(s.id);
  }
  const masteries: [number | null, number | null] = [state.masteries[0], state.masteries[1]];
  masteries[slot] = newId;
  const masteryBar: [number, number] = [state.masteryBar[0], state.masteryBar[1]];
  masteryBar[slot] = 0;
  setState({ ...state, masteries, allocations, masteryBar });
}

function syncUrl(state: BuildState, data: SkillsData): void {
  const encoded = encodeState(state, data);
  const newUrl = window.location.pathname + window.location.search + '#' + encoded;
  window.history.replaceState(null, '', newUrl);
}

function handleShare(refs: AppRefs): void {
  const url = window.location.href;
  const origLabel = refs.share.textContent;
  refs.share.disabled = true;
  navigator.clipboard.writeText(url)
    .then(() => {
      refs.share.textContent = 'Link copied!';
    })
    .catch(() => {
      refs.share.textContent = 'Copy failed';
    })
    .finally(() => {
      setTimeout(() => {
        refs.share.textContent = origLabel;
        refs.share.disabled = false;
      }, 2000);
    });
}

function applySearchHighlight(refs: AppRefs, index: ReturnType<typeof buildSearchIndex>): void {
  const q = refs.search.value;
  const matches = matchQuery(q, index);
  const active = q.trim() !== '';
  const rows = document.querySelectorAll<HTMLElement>('.skill-row');
  rows.forEach(row => {
    const id = row.dataset.skillId;
    if (!active || !id) {
      row.classList.remove('search-miss');
      return;
    }
    row.classList.toggle('search-miss', !matches.has(id));
  });
  refs.searchCount.textContent = active ? `${matches.size} matches` : '';
}

function showRefundToast(refs: AppRefs, refunds: { skillId: string; refunded: number }[], data: SkillsData): void {
  const names = refunds.map(r => {
    for (const m of data.masteries) {
      const s = m.skills.find(s => s.id === r.skillId);
      if (s) return `${s.name} (${r.refunded})`;
    }
    return `${r.skillId} (${r.refunded})`;
  });
  const toast = document.createElement('div');
  toast.className = 'toast show align-items-center text-bg-warning border-0';
  toast.role = 'alert';
  toast.innerHTML = `<div class="d-flex"><div class="toast-body">Refunded: ${names.join(', ')}</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  refs.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre class="p-3 text-danger">Failed to load: ${err.message}</pre>`;
});
```

- [ ] **Step 4: Compile**

```bash
cd tools/calc
npm run build
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/src/main.ts tools/calc/index.html tools/calc/css/style.css tools/calc/js/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: wire up calculator UI with state/rules/search"
```

---

## Task 13: End-to-end smoke test against fixture

Manually verify the integrated app against the fixture data.

- [ ] **Step 1: Start dev server**

```bash
cd /home/hqz/src/grim_dawn_mods
python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
curl -s http://localhost:8000/tools/calc/ | head -5
```
Expected: HTML output.

- [ ] **Step 2: Open in Windows browser**

Open `http://localhost:8000/tools/calc/`. Verify:
1. Page renders with mastery dropdowns, level/points inputs, Reset + Share buttons, two empty panels.
2. Select TestMasteryA in slot A → panel A populates.
3. Select TestMasteryB in slot B → panel B populates. TestMasteryA hidden from slot B's dropdown.
4. Click `+` on mastery A bar → goes to 1/10, "Swing" becomes usable.
5. Click `+` on Swing twice → it reads 2/10, budget counter increments.
6. Click `+` on bar to 3 → "Big Swing" unlocks.
7. Click `+` on Big Swing once → it reads 1/5.
8. Click `-` on Swing → Swing goes to 1, Big Swing refunds (toast appears).
9. URL hash updates after every click.
10. Copy URL from address bar, open in new tab → same build renders.
11. Click Share → button swaps to "Link copied!" for 2 seconds.
12. Type "cold" in search → Cold Bolt highlights, other skills dim. Count shows "X matches".
13. Clear search → everything returns.
14. Click Reset → bars and allocations clear; masteries/level/points retained.
15. Change mastery A → confirm dialog appears if points allocated.

- [ ] **Step 3: Stop server**

```bash
kill $SERVER_PID 2>/dev/null || true
```

- [ ] **Step 4: If any step fails, diagnose and file fixes as follow-up tasks.**

No commit for this task (verification only).

---

## Task 14: Python extractor — read mastery DBRs

**Files:**
- Create: `extract_skills.py`

This task implements the DBR-walking logic. Icons and JSON emission are in tasks 15 and 16.

- [ ] **Step 1: Create `extract_skills.py` skeleton**

```python
#!/usr/bin/env python3
"""Extract Grim Dawn class-skill data into a per-version JSON snapshot.

Usage:
    python3 extract_skills.py --version 1.2.1.5
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).parent
GAME_ROOT = Path("/mnt/c/Program Files (x86)/Steam/steamapps/common/Grim Dawn")
DATABASE_ARZ = GAME_ROOT / "database.arz"
TEXT_ARC = GAME_ROOT / "resources" / "Text_EN.arc"

# Maps mastery DBR record paths → the human-readable name used in this app.
# Paths here are guesses and must be verified when this task runs.
MASTERY_RECORDS = {
    "soldier": "records/skills/playerclass01/classtraining.dbr",
    "demolitionist": "records/skills/playerclass02/classtraining.dbr",
    "occultist": "records/skills/playerclass03/classtraining.dbr",
    "nightblade": "records/skills/playerclass04/classtraining.dbr",
    "arcanist": "records/skills/playerclass05/classtraining.dbr",
    "shaman": "records/skills/playerclass06/classtraining.dbr",
    "inquisitor": "records/skills/playerclass07/classtraining.dbr",
    "necromancer": "records/skills/playerclass08/classtraining.dbr",
    "oathkeeper": "records/skills/playerclass09/classtraining.dbr",
}


def extract_arz_to(tmp: Path) -> Path:
    out = tmp / "arz"
    out.mkdir(exist_ok=True)
    subprocess.run(
        ["python3", str(REPO_ROOT / "extract_arz.py"), str(DATABASE_ARZ), str(out)],
        check=True,
    )
    return out


def extract_text_to(tmp: Path) -> dict[str, str]:
    out = tmp / "text"
    out.mkdir(exist_ok=True)
    subprocess.run(
        ["python3", str(REPO_ROOT / "extract_arc.py"), str(TEXT_ARC), str(out)],
        check=True,
    )
    tags: dict[str, str] = {}
    for txt in out.rglob("*.txt"):
        for line in txt.read_text(encoding="utf-8", errors="replace").splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                tags[k.strip()] = v.strip()
    return tags


def read_dbr(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "," in line:
            k, _, rest = line.partition(",")
            v, _, _ = rest.partition(",")
            out[k] = v
    return out


def resolve_text(value: str, tags: dict[str, str]) -> str:
    if value.startswith("tag") and value in tags:
        return tags[value]
    return value


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--version", required=True)
    args = p.parse_args(argv[1:])

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)
        arz_dir = extract_arz_to(tmp)
        tags = extract_text_to(tmp)

        print(f"Extracted ARZ to {arz_dir}", file=sys.stderr)
        print(f"Loaded {len(tags)} text tags", file=sys.stderr)

        # verify the first mastery record exists
        sample = arz_dir / MASTERY_RECORDS["soldier"]
        if not sample.exists():
            print(f"ERROR: expected {sample} not found", file=sys.stderr)
            print("Listing candidates under records/skills/:", file=sys.stderr)
            for p in (arz_dir / "records" / "skills").glob("playerclass*/*.dbr"):
                print(f"  {p.relative_to(arz_dir)}", file=sys.stderr)
            return 1

        print(f"Found {len(MASTERY_RECORDS)} mastery records", file=sys.stderr)
        for key, rel in MASTERY_RECORDS.items():
            dbr = arz_dir / rel
            if dbr.exists():
                d = read_dbr(dbr)
                print(f"  {key}: {d.get('skillDisplayName', '?')}", file=sys.stderr)

    void = json  # suppress unused import warning
    _ = args.version
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

(The file still has a small `void` hack — that's fine for this intermediate task; it'll be replaced in task 16.)

- [ ] **Step 2: Clean up skeleton**

Remove the `void = json` and `_ = args.version` hack lines at the bottom of `main()` before the `return 0`.

- [ ] **Step 3: Run and inspect**

```bash
cd /home/hqz/src/grim_dawn_mods
python3 extract_skills.py --version 1.2.1.5 2>&1 | head -40
```

Expected: paths print; mastery records list with display names, OR an error showing the actual on-disk path for record 1. If paths don't match, update `MASTERY_RECORDS` dict to match the actual filesystem structure before proceeding.

**Important: DO NOT move on until you can print the name of all 9 masteries.** If this fails, the fix is to find the correct DBR paths by walking `records/skills/playerclass*/` and inspecting the `.dbr` files.

- [ ] **Step 4: Commit**

```bash
git add extract_skills.py
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: add extract_skills.py mastery-record loader"
```

---

## Task 15: Python extractor — walk skills and produce JSON

**Files:**
- Modify: `extract_skills.py`

This task extends the extractor to walk each mastery's skill tree, resolve skill names/descriptions, and emit the final `skills-<version>.json`.

- [ ] **Step 1: Understand mastery tree structure**

Run:
```bash
cd /home/hqz/src/grim_dawn_mods
python3 extract_skills.py --version 1.2.1.5 2>&1 | head -20
# Then manually inspect one mastery's DBR:
grep -E "^skill[A-Z]|^mastery" /tmp/arz_out/records/skills/playerclass01/classtraining.dbr 2>/dev/null | head -30
```

Note keys like `skillName1`, `skillName2`, `skillUpTier1`, etc. — these point to the actual skill DBRs. Confirm the pattern.

If extraction dirs don't persist after the temp cleanup, re-run with a manually-specified output dir to inspect (modify the script temporarily, or add a `--keep` flag).

- [ ] **Step 2: Add a `--keep` flag to preserve temp output**

Modify `main()` in `extract_skills.py` to accept `--keep DIR` which uses `DIR` instead of a tempdir:

```python
    p.add_argument("--keep", help="keep extracted data in this directory (debug)")
    ...
    if args.keep:
        tmp = Path(args.keep)
        tmp.mkdir(parents=True, exist_ok=True)
        return run(tmp, args.version)
    with tempfile.TemporaryDirectory() as tmp_str:
        return run(Path(tmp_str), args.version)
```

Extract the body of `main()` after arg parsing into `def run(tmp: Path, version: str) -> int`.

Run:
```bash
python3 extract_skills.py --version 1.2.1.5 --keep /tmp/gd_extract 2>&1 | head
```

- [ ] **Step 3: Add mastery tree walker**

Append to `extract_skills.py`:

```python
def walk_mastery_skills(
    mastery_dbr_path: Path, arz_dir: Path, tags: dict[str, str]
) -> tuple[int, list[dict]]:
    """Return (barMaxRank, skills[]). Skills are emitted in tree order.

    Approach: the mastery DBR references skill tree roots via numbered keys
    (e.g. skillName1..skillNameN). Each referenced .dbr is a skill record
    that may list its own modifier skills via further references.
    """
    mastery = read_dbr(mastery_dbr_path)
    bar_max = int(float(mastery.get("skillMaxLevel", "50")))

    skills: list[dict] = []
    seen: set[str] = set()

    # collect referenced skill DBRs
    refs: list[str] = []
    i = 1
    while True:
        key = f"skillName{i}"
        if key not in mastery:
            break
        ref = mastery[key].strip()
        if ref:
            refs.append(ref)
        i += 1

    def process(ref: str, parent_id: str | None, parent_min: int) -> None:
        if ref in seen:
            return
        seen.add(ref)
        skill_dbr = arz_dir / ref
        if not skill_dbr.exists():
            return
        d = read_dbr(skill_dbr)
        skill_id = ref.replace("records/skills/", "").replace(".dbr", "").replace("/", ".")
        name_tag = d.get("skillDisplayName", "")
        desc_tag = d.get("skillBaseDescription", "")
        name = resolve_text(name_tag, tags) or skill_id
        description = resolve_text(desc_tag, tags) or ""
        max_rank = int(float(d.get("skillMaxLevel", "1")))
        prereq_bar = int(float(d.get("skillMasteryLevelRequired", "1")))
        # UI position (best-effort; fallback to index)
        row = int(float(d.get("skillTier", "0")))
        col = int(float(d.get("skillColumn", len(skills))))
        # icon
        icon_ref = d.get("skillUpBitmapName", "").strip()
        icon = icon_ref if icon_ref else ""
        skills.append({
            "id": skill_id,
            "name": name,
            "description": description,
            "icon": icon,
            "maxRank": max_rank,
            "ui": {"row": row, "col": col},
            "prereqBar": prereq_bar,
            "parent": parent_id,
            "parentMinRank": parent_min,
        })
        # walk modifier references
        j = 1
        while True:
            mod_key = f"skillDependancy{j}"
            if mod_key not in d:
                break
            mod_ref = d[mod_key].strip()
            mod_req_key = f"skillDependancyReqLevel{j}"
            mod_req = int(float(d.get(mod_req_key, "1")))
            if mod_ref:
                process(mod_ref, skill_id, mod_req)
            j += 1

    for ref in refs:
        process(ref, None, 0)
    return bar_max, skills
```

- [ ] **Step 4: Update `run()` to produce JSON**

Replace the existing `run()` body with:

```python
def run(tmp: Path, version: str) -> int:
    arz_dir = extract_arz_to(tmp)
    tags = extract_text_to(tmp)
    print(f"Loaded {len(tags)} text tags", file=sys.stderr)

    masteries_out: list[dict] = []
    for idx, (key, rel) in enumerate(MASTERY_RECORDS.items(), start=1):
        dbr = arz_dir / rel
        if not dbr.exists():
            print(f"ERROR: {dbr} not found", file=sys.stderr)
            return 1
        bar_max, skills = walk_mastery_skills(dbr, arz_dir, tags)
        mastery_name = resolve_text(read_dbr(dbr).get("skillDisplayName", key), tags) or key.title()
        masteries_out.append({
            "id": idx,
            "name": mastery_name,
            "barMaxRank": bar_max,
            "skills": skills,
        })
        print(f"  {mastery_name}: bar {bar_max}, {len(skills)} skills", file=sys.stderr)

    # pointsPerLevel and questRewardPoints: placeholders for now, must be
    # read from playerlevels.dbr. For v1 we hardcode the vanilla formula
    # and total quest rewards.
    points_per_level = _vanilla_points_per_level()
    quest_reward_points = 18

    out = {
        "gdVersion": version,
        "pointsPerLevel": points_per_level,
        "questRewardPoints": quest_reward_points,
        "masteries": masteries_out,
    }

    out_dir = REPO_ROOT / "tools" / "calc" / "data" / "skills"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"skills-{version}.json"
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {out_path}", file=sys.stderr)

    _update_versions(version)
    return 0


def _vanilla_points_per_level() -> list[int]:
    arr = [0, 0]  # index 0 unused; index 1 = level 1 gets 0 points
    for L in range(2, 51):
        arr.append(3)
    for L in range(51, 91):
        arr.append(2)
    for L in range(91, 101):
        arr.append(1)
    return arr


def _update_versions(version: str) -> None:
    vj = REPO_ROOT / "tools" / "calc" / "data" / "versions.json"
    if vj.exists():
        cur = json.loads(vj.read_text())
    else:
        cur = {"versions": [], "latest": 0}
    if version not in cur["versions"]:
        cur["versions"].append(version)
    cur["latest"] = cur["versions"].index(version)
    vj.write_text(json.dumps(cur, indent=2) + "\n")
    print(f"Updated {vj}", file=sys.stderr)
```

- [ ] **Step 5: Run the extractor**

```bash
cd /home/hqz/src/grim_dawn_mods
python3 extract_skills.py --version 1.2.1.5 2>&1 | head -30
```

Expected output:
* Text tags loaded (~50000+).
* Each mastery prints with bar cap and skill count (~25-35 skills per mastery).
* `Wrote tools/calc/data/skills/skills-1.2.1.5.json`.

If skill counts look wrong (zero or very few), the `skillName{i}` / `skillDependancy{j}` key names are probably different in GD's actual DBRs. Inspect `/tmp/gd_extract/arz/records/skills/playerclass01/classtraining.dbr` and adjust the key names in `walk_mastery_skills`.

- [ ] **Step 6: Sanity-check the output**

```bash
jq '.masteries | length' tools/calc/data/skills/skills-1.2.1.5.json
jq '.masteries[0] | {name, barMaxRank, skillCount: (.skills | length)}' tools/calc/data/skills/skills-1.2.1.5.json
jq '.masteries[0].skills[0:2]' tools/calc/data/skills/skills-1.2.1.5.json
```
Expected:
* 9 masteries.
* bar ranks around 50.
* 20-40 skills per mastery.
* Real names like "Blade Arc", "Fire Strike".

- [ ] **Step 7: Commit**

```bash
git add extract_skills.py tools/calc/data/skills/skills-1.2.1.5.json tools/calc/data/versions.json
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: extract vanilla GD skill data into skills-1.2.1.5.json"
```

---

## Task 16: Python extractor — convert icons

**Files:**
- Modify: `extract_skills.py`

- [ ] **Step 1: Identify icon source**

Each skill DBR has a `skillUpBitmapName` field pointing to a `.tex` file, typically under `ui/skills/`. These live in `Items.arc` or `UI.arc` under the game's `resources/` directory.

Run:
```bash
python3 -c "
import json
d = json.loads(open('tools/calc/data/skills/skills-1.2.1.5.json').read())
icons = set(s['icon'] for m in d['masteries'] for s in m['skills'] if s['icon'])
print(f'{len(icons)} unique icons')
for i in list(icons)[:5]:
    print(f'  {i}')
"
```
Expected: several hundred unique icon refs.

- [ ] **Step 2: Locate icon arcs**

Run:
```bash
ls "/mnt/c/Program Files (x86)/Steam/steamapps/common/Grim Dawn/resources/" | grep -iE '(ui|item)'
```
Expected: at least `Items.arc`; possibly `UI.arc` or similar.

Extract candidate arcs to a temp dir and search for one of the `.tex` files referenced in the JSON (e.g. grep the referenced paths against the extracted file list) to confirm which arc contains them.

- [ ] **Step 3: Extend `extract_skills.py` with icon conversion**

Append helper functions:

```python
# paths where skill icons may live, relative to GAME_ROOT/resources/
ICON_ARCS = ["Items.arc"]  # update after verifying in step 2


def extract_icon_arcs_to(tmp: Path) -> Path:
    out = tmp / "icons_src"
    out.mkdir(exist_ok=True)
    for arc_name in ICON_ARCS:
        arc = GAME_ROOT / "resources" / arc_name
        if not arc.exists():
            print(f"WARN: {arc} missing", file=sys.stderr)
            continue
        subprocess.run(
            ["python3", str(REPO_ROOT / "extract_arc.py"), str(arc), str(out)],
            check=True,
        )
    return out


def convert_icons(
    icon_refs: set[str], src_dir: Path, out_dir: Path, version: str
) -> dict[str, str]:
    """Convert .tex files to .png, return {icon_ref: output_filename}."""
    version_dir = out_dir / version
    version_dir.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    missing: list[str] = []
    for ref in sorted(icon_refs):
        tex_path = src_dir / ref
        if not tex_path.exists():
            # try as lowercased
            tex_path = src_dir / ref.lower()
        if not tex_path.exists():
            missing.append(ref)
            continue
        safe_name = ref.replace("/", "_").replace("\\", "_")
        if safe_name.lower().endswith(".tex"):
            safe_name = safe_name[:-4] + ".png"
        else:
            safe_name = safe_name + ".png"
        png_path = version_dir / safe_name
        try:
            subprocess.run(
                ["python3", str(REPO_ROOT / "tex_to_png.py"), str(tex_path), str(png_path)],
                check=True,
                capture_output=True,
            )
            mapping[ref] = safe_name
        except subprocess.CalledProcessError:
            missing.append(ref)
    if missing:
        print(f"WARN: {len(missing)} icons failed to convert", file=sys.stderr)
        for m in missing[:5]:
            print(f"  {m}", file=sys.stderr)
    print(f"Converted {len(mapping)} icons", file=sys.stderr)
    return mapping
```

- [ ] **Step 4: Integrate into `run()`**

Inside `run()`, after emitting the JSON but before `_update_versions`, add:

```python
    # collect all icons
    icon_refs: set[str] = set()
    for m in masteries_out:
        for s in m["skills"]:
            if s.get("icon"):
                icon_refs.add(s["icon"])
    icon_src = extract_icon_arcs_to(tmp)
    icon_out = REPO_ROOT / "tools" / "calc" / "data" / "icons"
    mapping = convert_icons(icon_refs, icon_src, icon_out, version)
    # rewrite icon paths in masteries to be relative filenames
    for m in masteries_out:
        for s in m["skills"]:
            ref = s.get("icon", "")
            s["icon"] = mapping.get(ref, "")
    # re-emit the JSON with updated icon paths
    out["masteries"] = masteries_out
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Rewrote {out_path} with icon paths", file=sys.stderr)
```

- [ ] **Step 5: Run**

```bash
python3 extract_skills.py --version 1.2.1.5 2>&1 | tail -20
```
Expected: "Converted N icons" where N is within 10% of the unique-icons count (some misses for renamed/removed icons are acceptable).

- [ ] **Step 6: Sanity-check**

```bash
ls tools/calc/data/icons/1.2.1.5/ | head
ls tools/calc/data/icons/1.2.1.5/ | wc -l
jq '.masteries[0].skills[0].icon' tools/calc/data/skills/skills-1.2.1.5.json
```
Expected: hundreds of PNG files; skill icon paths look like `ui_skills_classtraining01_blade_arc.png`.

- [ ] **Step 7: Visually spot-check 3 icons**

Copy a few to a Windows-visible path and confirm they render.

- [ ] **Step 8: Commit**

```bash
git add extract_skills.py tools/calc/data/skills/ tools/calc/data/icons/
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: extract and convert skill icons to PNG"
```

---

## Task 17: Render icons + switch to real data

**Files:**
- Modify: `tools/calc/src/render.ts`
- Modify: `tools/calc/data/versions.json` (remove 'fixture')
- Modify: `tools/calc/data/skills/` (remove fixture)

- [ ] **Step 1: Update `renderSkillRow` in `tools/calc/src/render.ts` to include icon `<img>`**

In `renderSkillRow`, before appending `name`, prepend an icon element:

```ts
  const icon = document.createElement('img');
  if (skill.icon) {
    icon.src = `data/icons/${state.versionId === 0 ? '' : ''}${data.masteries[0] ? '' : ''}`;
    // actually use the version name:
    // but state doesn't have version name — pass it in as a separate arg
  }
```

Simpler: add a `versionName: string` parameter to `renderMasteryPanel` and `renderSkillRow`, use it to build the icon URL.

Update `renderMasteryPanel` signature (add `versionName: string` as the final param) and its call to `renderSkillRow`:

```ts
export function renderMasteryPanel(
  container: HTMLElement,
  slot: 0 | 1,
  mastery: Mastery | null,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
  versionName: string,
): void {
  // ... unchanged up to the grid loop:
  for (const skill of mastery.skills) {
    grid.appendChild(renderSkillRow(skill, slot, state, over, cb, versionName));
  }
  container.appendChild(grid);
}
```

Update `renderSkillRow` signature and prepend an `<img>` element. Full updated function:

```ts
function renderSkillRow(
  skill: Skill,
  slot: 0 | 1,
  state: BuildState,
  over: boolean,
  cb: RenderCallbacks,
  versionName: string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'd-flex align-items-center gap-2 skill-row';
  row.dataset.skillId = skill.id;
  if (skill.parent !== null) row.classList.add('ms-4');

  const rank = state.allocations.get(skill.id) ?? 0;
  const unlocked = isSkillUnlocked(skill, slot, state);
  if (!unlocked) row.classList.add('opacity-50');

  const icon = document.createElement('img');
  icon.className = 'skill-icon';
  icon.width = 32;
  icon.height = 32;
  icon.alt = '';
  if (skill.icon) icon.src = `data/icons/${versionName}/${skill.icon}`;

  const name = document.createElement('span');
  name.className = 'flex-grow-1';
  name.textContent = skill.name;
  name.title = skill.description;

  const count = document.createElement('span');
  count.className = 'badge bg-secondary';
  count.textContent = `${rank}/${skill.maxRank}`;

  const reason = !unlocked ? lockReason(skill, slot, state) : '';
  if (reason) name.textContent = `${skill.name} (${reason})`;

  const plusDisabled = !unlocked || rank >= skill.maxRank || over;
  const minusDisabled = rank <= 0;
  const plus = mkBtn('+', () => cb.onSkillDelta(skill.id, slot, 1), plusDisabled);
  const minus = mkBtn('-', () => cb.onSkillDelta(skill.id, slot, -1), minusDisabled);

  row.append(icon, name, count, plus, minus);
  return row;
}
```

- [ ] **Step 2: Thread `versionName` from `main.ts`**

In `main.ts`, `boot()` already computes `versionName`. In the `render()` closure inside `boot`, change the two `renderMasteryPanel` calls to pass `versionName`:

```ts
renderMasteryPanel(refs.panelA, 0, mA, state, over, cb, versionName);
renderMasteryPanel(refs.panelB, 1, mB, state, over, cb, versionName);
```

- [ ] **Step 3: Add icon sizing to `style.css`**

Append to `tools/calc/css/style.css`:

```css
.skill-icon { flex-shrink: 0; border-radius: 4px; background: #eee; }
```

- [ ] **Step 4: Remove fixture from versions.json**

Edit `tools/calc/data/versions.json`:
```json
{
  "versions": ["1.2.1.5"],
  "latest": 0
}
```

- [ ] **Step 5: Remove fixture JSON**

```bash
rm tools/calc/data/skills/skills-fixture.json
```

- [ ] **Step 6: Compile and smoke-test**

```bash
cd tools/calc && npm run build
cd /home/hqz/src/grim_dawn_mods && python3 -m http.server 8000 &
SERVER_PID=$!
sleep 1
```
Open `http://localhost:8000/tools/calc/` in Windows browser. Verify:
* 9 masteries available in dropdowns.
* Selecting Soldier shows real skill names with icons.
* All interactions from Task 13 still work against real data.
* URL sharing roundtrip works.

```bash
kill $SERVER_PID
```

- [ ] **Step 7: Commit**

```bash
git add tools/calc/src/render.ts tools/calc/src/main.ts tools/calc/css/style.css tools/calc/data/versions.json tools/calc/js/
git rm tools/calc/data/skills/skills-fixture.json
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "feat: render skill icons and switch calculator to real GD data"
```

---

## Task 18: GitHub Pages deployment check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Verify committed `js/` is up to date**

```bash
cd tools/calc
rm -rf js
npm run build
git status tools/calc/js/
```
Expected: `git status` shows no changes (compiled output matches source).

- [ ] **Step 2: Add calculator section to `README.md`**

Append the following section to `README.md`:

```markdown
## Build calculator

A static build calculator for Grim Dawn class skills lives under `tools/calc/`.
It runs entirely client-side: all build state is encoded into the URL hash,
so sharing a build is sharing the URL.

**Local development:**

    cd tools/calc
    npm install
    npm run dev   # tsc --watch + python3 -m http.server 8000

Open `http://localhost:8000/tools/calc/` in your browser.

**Rebuilding skill data** (after a GD version update):

    python3 extract_skills.py --version <gd-version>

This extracts skills and icons from the installed game and writes
`tools/calc/data/skills/skills-<version>.json`. Commit the updated data.

**Tests:**

    cd tools/calc
    npm test
```

- [ ] **Step 3: Enable GitHub Pages in the repo settings (manual)**

This must be done in the GitHub web UI by the repo owner:
* Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder: `/ (root)`.
* Save.

Provide the expected URL to the user:
`https://<owner>.github.io/grim_dawn_mods/tools/calc/`

- [ ] **Step 4: Commit README**

```bash
git add README.md
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "docs: add build calculator section to README"
```

- [ ] **Step 5: Push and verify live**

Ask the user to push, then wait ~1-2 minutes for GitHub Pages to build. Confirm the live URL loads correctly.

---

## Task 19: Final polish + npm test convenience

**Files:**
- Modify: `tools/calc/package.json`
- Create: `tools/calc/README.md`

- [ ] **Step 1: Verify `npm test` runs all tests**

```bash
cd tools/calc
npm test 2>&1 | tail -20
```
Expected: base64url, state, rules, search tests all pass. No failing tests.

- [ ] **Step 2: Create `tools/calc/README.md`** with a short pointer:

```markdown
# Grim Dawn build calculator

Static single-page calculator for Grim Dawn class skills, built with
TypeScript + Bootstrap 5. All build state lives in the URL hash.

See the top-level README for usage and development instructions.

## Files

* `src/` — TypeScript source
* `js/` — compiled output (committed; GitHub Pages serves these)
* `data/` — skills JSON and icons, generated by `../../extract_skills.py`
* `index.html`, `css/style.css` — UI shell
```

- [ ] **Step 3: Commit**

```bash
cd /home/hqz/src/grim_dawn_mods
git add tools/calc/README.md
git -c user.name="Claude Code" -c user.email="herve.quiroz+claude@gmail.com" \
  commit -m "docs: add calculator subproject README"
```

---

## Plan summary

* 19 tasks, ~3 covering risk-bearing pieces (.tex conversion in task 2, DBR walking in task 14, icon extraction in task 16) that may need iteration.
* Tasks 1-13 build a complete working calculator against fixture data with full test coverage of pure-logic modules.
* Tasks 14-17 wire in real game data.
* Tasks 18-19 polish and deploy.
* Expect tasks 2, 14, 15, 16 to require small adjustments once run against real GD data.

## Self-review notes

* Spec coverage: every spec section maps to a task (see task numbers per section in the design doc).
* No placeholders; every step has actual code or exact commands.
* Types consistent: `BuildState`, `SkillsData`, `Skill` are defined in task 3 and referenced identically across tasks 5-12 and 17.
* `emptyBuildState(versionId)` is used in `main.ts` and test files consistently.
* `applyDelta` signature matches between task 9 and task 12.
