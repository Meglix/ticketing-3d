# PLAN — Cluj Arena "view from your seat" sales demo

Status: written before implementation and kept current. Decisions with
alternatives are logged in [DECISIONS.md](DECISIONS.md).

## 1. Architecture (one direction of data flow)

```
venues/cluj-arena.json          (data: stands → rings → sectors → rows)
        │  zod schema + semantic checks  (fail fast, readable error)
        ▼
src/venue/  ── VenueConfig (typed, validated)
        │
        ▼
src/geometry/  (pure TypeScript, NO three.js — unit-tested)
   ├─ seats:     config → SeatManifest  [{id, stand, ring, sector, row, seat, position, facing}]
   ├─ structure: config → plain vertex buffers (stepped stands, parapets, roof, facade)
   └─ sightlines: C-value checks used by the tests
        │
        ▼
src/scene/   (React Three Fiber: turns buffers into meshes; InstancedMesh for seats)
src/camera/  (camera math, pure + tested; CameraRig drives the camera each frame)
src/interaction/ (sector hover/tap → store)
src/ui/      (Romanian DOM overlay: header, legend, seat panel, fake checkout)
        ▲
        │  everything talks through one tiny store
src/state/store.ts  (useSyncExternalStore; no extra library)
```

Rules:
- The generator knows nothing about Cluj Arena. Everything specific lives in the
  JSON. The generator only knows the **bowl** template (a closed reference line
  whose offset curves are the rows). A future **horseshoe** template (theatres)
  plugs in as another branch of the `layout.template` discriminated union and its
  own reference curve; the seat placement code is shared.
- Rendering code never computes seat positions; it only reads the manifest.
- The camera never reads React state in the render loop; it reads the store
  snapshot inside `useFrame`.

## 2. File layout

```
venues/cluj-arena.json            venue data (generated once by the authoring script, then the source of truth)
scripts/author-cluj-arena.ts      how the estimated Cluj data was produced (row profiles, sector spans, capacity fit)
reference/FACTS.md, REFERENCE_ANALYSIS.md
src/
  main.tsx, App.tsx               composition only
  state/store.ts                  app state + actions (contract between lanes)
  venue/schema.ts                 zod schema (+ inferred TS types)
  venue/validate.ts               semantic checks (unique codes, tier refs, monotonic rows, spans, capacity)
  venue/loadVenue.ts              parse → validate → generate → indices (memoised)
  geometry/types.ts               Vec2/Vec3, Seat, SectorInfo, MeshData (contract)
  geometry/roundedRect.ts         the bowl reference curve: point/normal at (s, d), offset lengths
  geometry/seats.ts               seat placement
  geometry/structure.ts           stepped stands, parapets, soffits, back walls, roof, facade, floodlights
  geometry/sightlines.ts          C-value computation
  geometry/generate.ts            template dispatch (bowl now; horseshoe later)
  geometry/*.test.ts              vitest
  camera/                         tween math (tested) + CameraRig.tsx
  interaction/                    SectorPickers.tsx
  scene/                          Stage.tsx, Seats.tsx, Stands.tsx, Roof.tsx, Pitch.tsx, Track.tsx, Labels.tsx, Environment.tsx
  ui/                             Overlay.tsx, Header.tsx, Legend.tsx, SeatPanel.tsx, CheckoutModal.tsx, strings.ts, ui.css
e2e/                              Playwright specs (screenshots, FPS, console errors)
screenshots/                      Playwright output committed for the report
```

## 3. Config schema (summary — the zod file is the authority)

```jsonc
{
  "id": "cluj-arena", "name": "Cluj Arena", "city": "Cluj-Napoca",
  "capacity": { "total": 30335, "vip": 1464, "press": 168, "accessible": 32 },
  "eyeHeight": 1.2,          // metres above the row's tread
  "seatWidth": 0.5,          // default centre-to-centre seat pitch; a sector may override
  "aisleWidth": 1.2,         // radial aisle between neighbouring sectors
  "minCValue": 0.06,         // sightline requirement (m) used by validation/tests
  "priceTiers": [{ "id": "p15", "label": "15 lei", "price": 15, "color": "#2f9e8f" }, …],
  "pitch": { "length": 105, "width": 68 },
  "track": { "lanes": 8, "laneWidth": 1.22, "innerRadius": 36.5, "straightLength": 84.39 },
  "layout": { "template": "bowl",
              "referenceLine": { "halfLength": 92, "halfWidth": 50, "cornerRadius": 30 } },
  "stands": [{
    "id": "T1", "name": "Tribuna I",
    "rings": [{
      "ring": 1, "name": "Inelul 1", "parapetHeight": 1.1, "slabThickness": null, "backWallHeight": 2.5,
      "sectors": [{
        "code": "1A1", "tier": "p25", "category": "standard", "estimated": true,
        "span": { "from": -85.56, "to": -62.0 },          // metres along the reference line
        "rows": [{ "row": 1, "seats": 52, "distance": 1.0, "elevation": 1.6, "rakeDeg": 20.6 }, …]
      }]
    }]
  }],
  "roof":   { "estimated": true, "segments": [{ "from": …, "to": … }], "inner": {…}, "outer": {…}, … },
  "facade": { "estimated": true, "distance": 31.1, "height": 33.6 },
  "floodlights": { "count": 386 },
  "screens": [{ "x": …, "z": …, "yaw": …, "width": 12.8, "height": 5, "elevation": … }]
}
```

Validation (fail fast, message names the JSON path):
1. zod: types, ranges, required fields.
2. semantic: unique sector codes; tier references exist; rows strictly increasing
   in `distance`, non-decreasing in `elevation`; `rakeDeg` consistent with the
   row-to-row slope (±1.5°); spans have `to > from` and are within one perimeter;
   seats fit in their row (`seats × seatWidth ≤ row length − aisle`); category
   totals and the grand total equal `capacity`.

## 4. Work split (lanes)

| Lane | Owner | Scope | Depends on |
|---|---|---|---|
| A | main session | schema, validation, generator, structure buffers, sightlines, Cluj JSON, tests | — |
| B | parallel agent (worktree) | scene/rendering (`src/scene/`) | A's buffers + manifest |
| C | parallel agent (worktree) | camera tween + seat-view look controls + sector picking (`src/camera/`, `src/interaction/`) | A's manifest, store |
| D | parallel agent (worktree) | Romanian UI overlay (`src/ui/`) | store + types only |
| Integration | main session | `App.tsx`, merge, fix seams | B, C, D |
| Verification | main session | Playwright screenshots (1440×900, 390×844), FPS, console errors, build | integration |
| Review | separate reviewer agent | spec compliance, reference comparison, break-it tests | verification |

Lane A runs first because B and C need real geometry; D starts in parallel
with A because it only needs the store and the types. B, C, D each touch only
their own folders; shared files (`store.ts`, `types.ts`, `App.tsx`,
`package.json`) are owned by the main session.

## 5. Interaction contract (store)

```
view: 'overview' | 'seat'     where the camera is (or is flying to)
inTransit: boolean            camera tween running
hoveredSector: string | null  (desktop hover)
selectedSector: string | null
seatId: string | null         seat the camera sits on
checkoutOpen: boolean
actions: hoverSector, selectSector(code), goToOverview, arrive, openCheckout, closeCheckout
```

- Tap = pointer down/up with < 6 px movement (otherwise it was a drag).
- A new tap during a flight retargets the tween **from the current camera pose**
  (no queue, no snapping), which makes rapid taps safe.
- Fly time 1.5 s, ease-in-out cubic; the roof fades in as the camera descends.

## 6. Verification plan

- vitest: capacity = config total (30,335); category totals; min seat spacing
  ≥ seat width (spatial hash over all seats); every seat's C-value to the pitch
  centre ≥ `minCValue`; invalid configs fail with readable errors; tween math.
- Playwright (pre-installed Chromium): overview + one sector per stand at
  1440×900 and 390×844 → `screenshots/`; zero console errors; FPS sampled with
  `requestAnimationFrame` over 5 s in the overview (headless = software GL, so
  this is a lower bound; an in-app `?fps` meter lets the user measure on real
  hardware).
- `npm run build` must pass (tsc + vite).
