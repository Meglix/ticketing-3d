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
   fitting inside the bowl, rows not standing on the field of play, roof
   segments not overlapping. All shape problems (stage 1) are reported
   together; the semantic checks (stage 2) run once the shape is valid (they
   need typed data) and again report all their problems together. zod paths
   name the sector, e.g. `stands[2].rings[2].sectors[4] (2M2).rows[0].seats`.

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
A theatre would need a different, open curve (a horseshoe): see §9 for what
that touches.

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

The scene only turns arrays into GPU buffers, plus a few procedural extras
(pitch markings, track, sky, hills). The rules that keep it fast:

- **One draw call for 30,335 seats.** `Seats.tsx` uses a single
  `InstancedMesh`: one seat geometry drawn 30,335 times, each instance with its
  own transform matrix (from `position` + `facing`) and colour (price tier).
  Colours are rewritten only when hover/selection changes, and only for the
  sector ranges that changed. That's why the generator keeps each sector's seats
  contiguous (`seatStart … seatEnd`).
- **Level of detail.** From the overview a seat is 2–7 px wide, so a second
  instanced mesh with a 4-triangle seat (instead of 20) is drawn when the camera
  is far. Both meshes **share** the same matrix and colour buffers, so switching
  costs nothing and colours never desync. Result: ~650k → ~165k triangles in
  the overview, ~90 draw calls in total.
- **Stands** are the generator's per-sector solids (`structure.sectorSurfaces`),
  one mesh each, so a sector can be tinted and tapped on its own.
- **The roof fades with camera height** (`overviewFactor`): a ghost in the
  overview, so you can see the sectors under a roof that covers ~98 % of seats in plan,
  and solid in the seat view. Trusses, fins and columns stop drawing when faded.
  Nothing on the roof has pointer handlers, so it never steals a tap.
- **Labels** ("2M2 · de la 40 lei") are DOM chips positioned from inside the
  render loop through refs (no React re-render per frame). A greedy pass shows
  hovered/selected and nearest labels first and hides any label that would
  overlap one already placed, so a phone never shows an unreadable carpet.
- **No shadows and no postprocessing.** A hemisphere + sun light and ACES tone
  mapping give the clean, slightly stylised look. Real-time shadows of 30k
  instances would cost more than everything else together.
- **Adaptive resolution.** Fill rate is the cost that grows with screen
  density (DPR 2 ≈ half the frame rate of DPR 1 in our measurements). drei's
  `PerformanceMonitor` lowers the pixel ratio in 0.5 steps (never below 1) if
  a device can't hold its frame rate, and raises it again when there is
  headroom. `?dpr=<n>` pins it for screenshots and comparisons.
- **The sky dome travels with the camera** (radius 4 km, inside the 5 km far
  plane), the usual skybox trick; its shader colours by direction only.

Measured cost: about 1.5–2 ms of JavaScript per frame. The rest is pure GPU
work (see REPORT.md for the numbers and why the headless figures are a floor).

## 6. Camera and interaction (src/camera, src/interaction)

**Pure math first** (`cameraMath.ts`, `flight.ts`, all unit-tested):

- *Overview framing* computes the exact distance at which the venue's real
  outline fits the screen for the current aspect ratio. A laptop looks from
  behind Tribuna II at the main stand (so VIP and press are visible); a portrait
  phone looks from behind a peluza, so the stadium's long axis runs down the
  screen and fills it.
- *Seat pose*: eye = seat + 1.2 m, looking at the centre spot. On tall phone
  screens the look is tilted down a little so the top half isn't sky.
  Look-around is clamped to ±75° yaw around the direction to the centre and
  −50°…+20° pitch.
- *Flights that never go through the roof.* A seat sits "inside" the
  structure, and the only clean way in is over the pitch. Each seat gets a
  **portal**: a point above the pitch in front of it, just above roof height,
  far enough out that the straight line portal → eye passes *under* every
  overhang edge (roof leading edge, upper-ring fascia). These edges are derived
  from the config. A flight = line → smooth Hermite curve between portals →
  line. Tests fly all 58 sectors from both overviews, every pair of seats
  (3,306 flights) and mid-air retargets, and check every sample against the
  structure. A deliberately naive straight-line flight is caught (control test).

**The rig** (`CameraRig.tsx`) is a small state machine inside `useFrame`:
`intro → overview ⇄ flying ⇄ seat`. It reads `appStore.get()` each frame (no
React re-render). When the store's destination changes, it plans a new
1.5 s ease-in-out flight **from wherever the camera is right now**, using the
current position, look target and fov. That one rule makes rapid repeated
taps safe: no queue, no snapping, the last tap wins. `actions.arrive()` is
called when a flight ends.

**Rotation and history.** If the phone rotates during a flight or while
seated, the portrait down-tilt is swapped for the one the new screen shape
wants, and the user's look is kept. Entering a seat pushes one browser
history entry, so the phone's back gesture returns to the overview instead of
leaving the demo (`src/state/history.ts`).

**Taps vs. drags** (`sectorHandlers.ts`): R3F reports how far the pointer
moved between down and up (`e.delta`). Under 6 px is a tap, which selects;
more is the end of an orbit or look-around drag, which is ignored. Hover reacts
only to a mouse, so a finger never leaves a sticky highlight.

**Test seam** (`TestSeam.tsx`): `window.__clujDemo.sectorScreenPoint(code)`
projects a point on that sector's treads to screen pixels with the live camera
(checked to be unobstructed and inside the sector). Playwright then does a
*real* tap there. It is a read-only window into the app, not a shortcut around
the UI.

## 7. UI overlay (src/ui)

Plain React + CSS, every string in `strings.ts` (Romanian). The overlay root is
`pointer-events: none`, so drags and taps fall through to the canvas; only
panels and buttons take events. Each component subscribes to just the store
slice it shows.

- Header with the venue name and the permanent **"Demo – geometrie aproximativă"** badge.
- **Prețuri demo** legend from the config's tiers: a bottom price bar on
  laptops, a collapsible bar on phones.
- Context hints ("Atinge/Apasă pe un sector…", "Te ducem la locul tău…") and
  a desktop hover card.
- **Seat panel**: stand, ring, sector, row, seat, price. "Cumpără" is
  disabled for the press sector, and "Înapoi la stadion" returns to the
  overview. It is a bottom sheet on phones and a card on laptops.
- **Fake checkout**: a prominent **"Demo – fără plată reală"** banner,
  1–4 adjacent seats and a total, with no payment or personal-data fields.
  It is an accessible dialog: focus is trapped, Escape and backdrop close it,
  and focus returns to the button.
- Phones in landscape (short screens) get a compact seat card and a
  two-column checkout that fits without scrolling.
- A loader until the first frame, and full-screen pages for the failure cases:
  an invalid config (validation messages), an unknown `?venue=`, and 3D that
  can't run (no WebGL, a lost GPU context, or a crash inside the scene, caught
  by an error boundary). Each has a reload button instead of a blank page.

## 8. Testing strategy

| Layer | How it is tested |
|---|---|
| Reference curve math | exact identities vs. brute-force numeric integration; continuity at segment joins; level-set property |
| Venue data | real JSON: seat count = 30,335 (+ VIP/press/wheelchair split), unique ids, min spacing ≥ seat width (spatial hash over all seats), each seat on its row and facing the field, C-values for every seat |
| Validation | 15 deliberately broken configs, each must fail with a specific message |
| UI helpers | price formatting, seat summaries, config-error rendering |
| Meshes | finite, in range, winding agrees with normals, roof above every spectator |
| Camera math | pure functions: framing fits the outline on laptop + phone, clamps, portrait tilt, and roof-safe flights for every sector, every seat pair and mid-air retargets (with a control test) |
| Whole app | Playwright on the production build: real taps per stand at 1440×900 and 390×844, screenshots, zero console errors, FPS |

## 9. Extension point: a theatre ("horseshoe") template — what it would touch

Honest scope (found by the independent review): the *data model* and the
*seat placement* are template-agnostic. Rows are offsets of a reference curve
and sectors are spans along it. But the closed rounded rectangle is still
assumed in these places:

| Module | What assumes the bowl |
|---|---|
| `geometry/generate.ts` | `referenceCurveFor()`: the template switch (the intended entry point) |
| `geometry/roundedRect.ts` | the curve itself: `frameAt`, `offsetLength`, `signedDistance` |
| `geometry/seats.ts`, `structure.ts` | wrap-around of `s` (a closed curve) |
| `geometry/sightlines.ts` | `signedDistance` of the rounded rectangle (exact level sets) |
| `venue/validate.ts` | span wrapping, track/pitch fit, field-of-play check |
| `camera/flight.ts`, `interaction/hitSector.ts` | portals/overhangs and hit tests use `signedDistance` |
| `scene/Field.tsx`, `scene/Environment.tsx` | the bowl outline for the apron and the plaza |

A horseshoe template therefore means: (1) a `ReferenceCurve` interface
(`perimeter`, `closed`, `frameAt`, `offsetLength`, `paramAtOffsetLength`,
`signedDistance`) implemented by both shapes; (2) those 7 modules call the
interface instead of the rounded-rectangle functions; (3) balcony/box rules
(stacked tiers that overhang the stalls) in the template's structure builder.
This is deliberately *not* done yet: with one implementation, an interface
would be a guess. The seat placement, validation of rows and sightline method
carry over unchanged.

