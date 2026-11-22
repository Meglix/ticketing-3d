# Architecture — how the demo works and why

This explains the key decisions in plain language. The goal: you should be able
to open any file and know why it exists and what it is allowed to know about.
Decisions with their alternatives are also logged in [DECISIONS.md](DECISIONS.md).

## 1. The big picture: one direction of data flow

```
 venues/cluj-arena.json   ← data only (could come from a CMS / ticketing system later)
          │
          ▼  src/venue/        parse + validate  (zod, then semantic checks)
   VenueConfig (trusted)
          │
          ▼  src/geometry/     PURE TypeScript: numbers in, numbers out. No three.js, no React.
   SeatManifest  (30,335 seats: id, stand, ring, sector, row, seat, position, facing)
   StructureData (vertex buffers: stepped stands, roof, facade; trusses, floodlights…)
          │
          ├──▶ src/scene/        React Three Fiber: wraps buffers in meshes and draws them
          ├──▶ src/camera/       where the camera is and how it flies
          ├──▶ src/interaction/  turns pointer events on sectors into store actions
          └──▶ src/ui/           Romanian HTML overlay
                     ▲
                     │ all of them read/write ONE small store: src/state/store.ts
```

Why this shape:

- **The hard, testable part is pure.** Seat positions, the capacity and the
  sightlines are the product's core promise ("this is what you'll see from your
  seat"). That code has no rendering dependency, so it runs in plain Node, in
  unit tests and in the authoring script, and its results don't depend on a GPU.
- **Rendering is a thin consumer.** The scene never computes a seat position; it
  only turns arrays into GPU buffers. If the geometry is wrong, the tests catch
  it before anything is drawn.
- **Venue-agnostic.** Nothing in `src/geometry/` mentions Cluj Arena. A second
  stadium is a second JSON file (see README → "Add a new venue").

## 2. The data model (venues/cluj-arena.json)

The hierarchy follows how venues are sold: **stand → ring → sector → row**.

- A **row** has `seats`, `distance` (metres from the front of the stands),
  `elevation` (height of its tread above the pitch) and `rakeDeg` (slope).
- A **sector** has a `code` ("2M2"), a price `tier`, a `category`
  (standard / vip / press / accessible), an `estimated` flag and a `span`.
- A **ring** carries the structural bits shared by its sectors: front parapet
  height, whether it stands on the ground or on a slab (`slabThickness`), and
  the back-wall height.

The rows are explicit (not "14 rows of 0.8 m starting at…"), because real data
is irregular: VIP rows, missing seats at vomitories, wheelchair platforms. The
estimated Cluj numbers were produced once by `scripts/author-cluj-arena.ts`,
which documents *how* they were estimated. The JSON is what the app reads.

### Validation: fail fast, say exactly what is wrong

`parseVenueConfig()` runs in two stages:

1. **zod** checks the shape: types, ranges, required fields. Objects are
   *strict*, so a typo like `seatWidht` is an error instead of a silently
   ignored key. Messages carry the JSON path, e.g.
   `stands[0].rings[0].sectors[0].rows[2].seats: expected number`.
2. **Semantic checks** that a schema can't express: unique codes, tiers that
   exist, rows moving back and up, `rakeDeg` agreeing with the actual
   row-to-row slope, every row's seats physically fitting, sectors not
   overlapping, the totals matching the declared capacity, and the track
   fitting inside the bowl. All problems are collected and reported together.

The app catches the error at start-up and shows the list instead of a broken
3D scene.

## 3. The geometry idea: one reference line, rows as offsets

The plan view of a bowl stadium is drawn around one closed curve, the
**reference line**: the front edge of the stands. We use a **rounded
rectangle** (straights + quarter-circle corners):

```
              s grows clockwise (seen from above), starting at the middle of Tribuna I
        ┌────────────────── Tribuna I (−z side) ──────────────────┐
     ╭──┘                                                          └──╮
     │   ← a row = the same rounded rectangle pushed outwards by d  →  │
 Peluza I                       ( pitch + track )                  Peluza II
     │                                                                │
     ╰──┐                                                          ┌──╯
        └────────────────── Tribuna II (+z side) ─────────────────┘
```

Key fact: **pushing a rounded rectangle outwards by `d` gives another rounded
rectangle** (same straights, corner radius `R + d`). So:

- every row is an *exact* offset curve of the reference line;
- a sector is just a range of arc length `s` on the reference line
  (`span.from … span.to`). The same range maps onto every row, and the
  sector's side boundaries are the line's normals, which is exactly how radial
  aisles run in a real stadium;
- the length of a row inside a sector has a closed form:
  `L(d) = (s1 − s0) + d · (turning angle between s0 and s1)`.
  Straights keep their length, and corners grow by `d` per radian
  (`offsetLength` in `roundedRect.ts`). Its inverse (`paramAtOffsetLength`)
  places each seat exactly, with no iteration.

An athletics bowl with semicircular ends is just `cornerRadius = halfWidth`.
A theatre would need a different, open curve (a horseshoe). That is the
extension point: `layout.template` is a discriminated union, and
`referenceCurveFor()` in `src/geometry/generate.ts` is the one switch to extend.

### Seat placement (`src/geometry/seats.ts`)

For each row: usable length = row length − one aisle (half at each end).
Seats sit at a fixed pitch (the seat width), and the block is centred.
Leftover space reads as wider aisles or vomitories, as in a real stand. Each
seat gets:

- `position`: the point on the row's offset curve, `y` = the row's elevation;
- `facing`: the inward normal (spectators face the field).

On a curved row the straight-line distance between two neighbours (the chord)
is a hair shorter than the arc pitch, by δ³/24ρ², which is micrometres here.
That's why the spacing test allows 1 mm.

### Sightlines (`src/geometry/sightlines.ts`)

Stadium designers measure sightlines with the **C-value**: how far your line
of sight passes above the eyes of the person in front. With C ≥ 60 mm you can
see the pitch over heads; 90–120 mm is good design.

The trick that makes our check exact: the **signed distance** to a rounded
rectangle has a closed form, and every row is a *level set* of it (`sd = d`).
The line from your eye to the focus point crosses each row in front of you
exactly once, so a bisection finds the crossing. Then we compare the line's
height there with the eye height of that row. Obstacles are every row and
parapet of the seat's stand. A line passing *under* an elevated ring (below its
slab) isn't blocked by it: that is how the back rows of the lower ring look out
under the upper ring's overhang.

Result for the estimated Cluj Arena: every seat has C ≥ 60 mm to the pitch
centre (required) **and** to the nearest touchline (stricter). The first
estimate of the upper ring failed the touchline check at 57 mm, and the rake was
corrected (DECISIONS.md #19). This is the kind of mistake the test exists to catch.

### Structure buffers (`src/geometry/structure.ts`)

Stands, roof and facade are built by **sweeping a 2D cross-section along the
reference line**. A sector's cross-section is a closed polygon in (distance,
height): front parapet, the stepped treads and risers, the back wall and the
underside (ground or slab). Each polygon edge becomes a strip of quads along
the curve: straights need only their two end samples, and arcs are sampled
every 3.75°. End caps close the solid. `MeshBuilder.tri()` orients every
triangle to match its intended normal, so face winding is correct by
construction (and tested).

The output is plain `Float32Array`/`Uint32Array` (`MeshData`). The renderer
wraps them in `BufferGeometry` without changing a number.

## 4. State: one tiny store (`src/state/store.ts`)

The whole app state is six fields: `view`, `inTransit`, `hoveredSector`,
`selectedSector`, `seatId`, `checkoutOpen` (+ `sceneReady`). Changes happen
only through named actions (`selectSector`, `goToOverview`, `arrive`, …), so
"what happens when you tap" is decided in one place.

It is ~100 lines on React's `useSyncExternalStore`, with no library:
- UI components subscribe to just the slice they show;
- the camera loop reads `appStore.get()` every frame **without** causing React
  re-renders (important at 60 fps).

## 5. Rendering (src/scene)

_Filled in after integration — see below._

## 6. Camera and interaction (src/camera, src/interaction)

_Filled in after integration — see below._

## 7. UI overlay (src/ui)

_Filled in after integration — see below._

## 8. Testing strategy

| Layer | How it is tested |
|---|---|
| Reference curve math | exact identities vs. brute-force numeric integration; continuity at segment joins; level-set property |
| Venue data | real JSON: seat count = 30,335 (+ VIP/press/wheelchair split), unique ids, min spacing ≥ seat width (spatial hash over all seats), each seat on its row and facing the field, C-values for every seat |
| Validation | 15 deliberately broken configs, each must fail with a specific message |
| Meshes | finite, in range, winding agrees with normals, roof above every spectator |
| Camera math | pure functions (easing, poses, clamps, retargeting) |
| Whole app | Playwright on the production build: real taps per stand at 1440×900 and 390×844, screenshots, zero console errors, FPS |
