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
          ├──▶ src/interaction/  turns pointer events on sectors and seats into store actions
          └──▶ src/ui/           Romanian HTML overlay

   src/demo/availability.ts  ← DEMO DATA: deterministic fake "sold" seats (not part of the venue)
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

The app state is a handful of fields: `view` (`overview` | `sector` | `seat`),
`inTransit`, `hoveredSector`, `selectedSector`, `seatId`, `hoveredSeat`,
`checkoutOpen`, `introPlaying`, `sceneReady`, `sceneFailure`. Changes happen
only through named actions (`focusSector`, `selectSeat`, `back`,
`goToOverview`, `arrive`, `endIntro`, …), so "what happens when you tap" is
decided in one place.

```
 overview ──tap a sector──► sector focus ──tap a free seat──► seat view
    ▲                          │  ▲                              │
    └──── back / "Toate ───────┘  └──── back / "Alt loc" ────────┘
          sectoarele" / Esc              / Esc (the seat stays gold)
```

It is about 170 lines on React's `useSyncExternalStore`, with no library.
UI components subscribe to just the slice they show. The camera loop reads
`appStore.get()` every frame **without** causing React re-renders. Browser
history mirrors the *depth* (0/1/2): one entry per level going in, the back
gesture goes up one level, and going up through the UI consumes the entries
(`src/state/history.ts`).

## 5. Rendering (src/scene) — the "cinematic night" look

### One set of numbers drives the look (`look.ts`)

Every cinematic effect reads four numbers that `<LookDirector/>` writes once
per frame, before anything else draws:

| number | meaning | comes from |
|---|---|---|
| `holo` | 1 = luminous model, 0 = solid materials | camera distance from the centre spot (smoothstep 115 m → 240 m) |
| `intro` | seconds into the 7 s opening | the wall clock (skips jump it to the end) |
| `power` | floodlight level 0…1 | the intro clock, group by group |
| `speed` | camera speed (m/s), smoothed | frame-to-frame camera movement |

`holo` depends on *where the camera is*, not on which view is active. So
flying from the overview into a sector crossfades from luminous to solid by
itself, even when a flight is re-targeted mid-air. Nothing has to be animated
twice.

### What is drawn

- **No surroundings.** A dome shader that follows the camera gives a near-black
  gradient with a faint warm haze as the lights come on. There is no ground,
  city or terrain.
- **Seats: 30,335 instances in three levels of detail, sharing one set of
  instance buffers** (matrix + colour). Far is 4 triangles, near 20, and
  detail about 110 (pan, lip, bucket back with side wings, headrest, armrest, leg). Detail is drawn
  only for the focused sector. That sector's near/far copies are hidden by
  zeroing their matrices, so it is never drawn twice. The instance colour
  is the state:
  - overview: tier colour;
  - focused sector: tier colour (available), dark grey (sold), white (hovered);
  - other sectors: dimmed.

  A small shader patch (`onBeforeCompile`) also adds `colour × glow` to the
  emissive term, but only on the *backrests* (a `glowMask` vertex attribute),
  and darkens the seat bodies as `holo` rises. In the overview each row then
  reads as a thin line of light over dark treads, the "fine light" of the
  reference, still tinted by price tier. The pitch and track dim as well.
- **Your seat** is a separate gold mesh with a soft pulse and a small gold point
  light. Both fade with the camera's distance to it, so the seat view isn't blown out.
- **Structure lines.** `EdgesGeometry` of each sector, the roof and the facade,
  merged into additive HDR line sets. They glow in the luminous overview and
  fade out up close. The hovered or focused sector gets its own bright outline.
- **Floodlights** are emissive strips under each roof segment plus instanced
  lamp quads. They "power on" in sequence during the intro, one roof segment
  after another. Real lighting is only a hemisphere light and 4 spotlights at
  the roof edge, because forward shading pays per light per pixel.
- **LED fascia boards** ("SECTOR 1C · DE LA 150 LEI") run along each ring's
  front, one board per sector. Prices come from the config. All boards are one
  canvas texture atlas and one merged geometry, so they cost one draw call. The
  text is HDR-bright, so it blooms a little and switches on with the lights.
- **Stand names** ("TRIBUNA I") are DOM labels in the overview, placed in
  screen space just *outside* the bowl (see DECISIONS 51). The per-sector price
  pills are gone: the name and price appear on hover and in the sector panel.

### Post-processing (`Effects.tsx`)

The composer renders the scene into a half-float (HDR) buffer, then runs:

1. Bloom (threshold 0.92): only light sources are brighter than 1.0, so only
   they glow.
2. Speed blur: a radial blur whose strength is the camera's speed, so it is
   zero at rest.
3. ACES Filmic tone mapping.
4. SMAA anti-aliasing.
5. Vignette.
6. Film grain.

Depth of field was left out (DECISIONS 46).

### Adaptive quality

One ladder, stepped by drei's `PerformanceMonitor` when the frame rate drops
(or rises):

| step | pixel ratio | effects |
|---|---|---|
| 0 | device (max 2) | all (bloom with 8 mip levels) |
| 1 | 0.75 × device | all |
| 2 | 1 | no film grain, 6 bloom levels |
| 3 | 1 | also no SMAA and no speed blur, 5 bloom levels |

`?dpr=` and `?quality=high|medium|low` pin it. The level in use is on the
canvas container (`data-dpr`, `data-quality`).

## 6. Camera and interaction (src/camera, src/interaction)

**Pure math first** (`cameraMath.ts`, `focus.ts`, `flight.ts`, all unit-tested):

- *Overview framing* computes the exact distance at which the venue's real
  outline fits the screen for the current aspect ratio (laptop: from behind
  Tribuna II; portrait phone: from behind a peluza, long axis down the screen).
- *Sector focus* (`focus.ts`): a 3/4 view from over the field, 22° to the side
  and 24° above, FOV 42°. It is framed so the sector fills about 78 % of the
  screen, including its LED board. Because the camera is always on the field
  side of the roof edge, the roof never gets in the way.
- *Seat view* (`seatViewPose`): over the shoulder, 0.85 m behind and 0.3 m above
  the seated eye point, looking along the seat's facing. The initial pitch is
  *solved* so that the top of your own seat back lands just above the UI
  (a fixed screen height per screen shape). Your gold seat and, over it, the
  backs of the rows in front are then always in frame, on every seat. The exact
  eye point is still what the sightline maths and tests use (DECISIONS 56, 65).
  The FOV targets a 90° horizontal view.
- *Flights never go through the roof.* A seat is "inside" the structure, and
  the only clean way in is over the pitch. Each seat gets a **portal** above the
  pitch in front of it, placed so that the line portal → eye passes under every
  overhang edge derived from the config. A flight is line → Hermite curve →
  line, with FOV interpolated along it. The view *direction* is interpolated
  too (yaw on the shortest arc, pitch linearly), not the look-at point, so a
  half turn is spread over the whole flight and the camera never tips past
  its start and end pitch (DECISIONS 65). Tests fly every sector (overview → focus
  → seat → focus → overview, on laptop and phone), every pair of seats and
  mid-air retargets, checking every sample against the structure. A control
  test confirms a naive straight-line flight is caught.

**The rig** (`CameraRig.tsx`) is a small state machine inside `useFrame`:
`intro → overview ⇄ flying ⇄ sector ⇄ flying ⇄ seat`. Each frame it reads
the store's destination (`overview`, `sector:1C` or `seat:1C-R6-S14`). When the
destination changes, it plans a new flight **from wherever the camera is right
now** (1.6 s, or 2.2 s into a seat). That one rule makes rapid repeated taps
safe: no queue and no snapping, and the last tap wins. While seated, a drag
looks around within limits. Escape goes up one level.

**Intro.** The camera orbits in from far, low and swung about 140°, while the
floodlights power on. It runs on the wall clock (7 s) so a slow device doesn't
get a stretched intro. Any tap, drag, wheel or pinch skips it, and so does
`prefers-reduced-motion`. The skipping tap is swallowed so it doesn't also
select a sector.

**Seat picking** (`SeatPicker.tsx`, `seatPicking.ts`): while a sector is
focused, an invisible InstancedMesh of boxes, one per seat of *that sector
only*, is raycast by R3F. `instanceId` maps straight to the seat (`seatStart +
i`). Mouse hover highlights the seat and shows "Rând 6 · Loc 14 · 150 lei ·
Liber". A tap on a free seat selects it and flies in. Sold seats can't be
chosen. On touch, a tap on a sold seat takes the nearest free seat within
28 px on screen, because a seat is about 8 px wide on a phone.

**Taps vs. drags**: R3F reports how far the pointer moved between down and up
(`e.delta`). Under 6 px is a tap; more is the end of a drag and is ignored.
Hover reacts only to a mouse, so a finger never leaves a sticky highlight.

**Demo availability** (`src/demo/availability.ts`, clearly labelled DEMO
DATA): deterministic fake sales. Group "bookings" of 1–6 adjacent seats,
weighted toward lower rows and the centre, reach an exact target between
62 and 73 % sold per sector. Press seats are never for sale. It is kept out of
the venue config on purpose; a real system would replace this module with an
API call.

**Test seam** (`TestSeam.tsx`), a read-only window used by Playwright:
- `sectorScreenPoint(code)` and `seatScreenPoint(seatId)` project a point
  with the live camera, check that it's unobstructed by UI, and raycast to
  confirm a real tap there hits that sector or seat.
- `availableSeat(code)` finds a free seat a tap can reach.

Playwright then does *real* taps.

## 7. UI overlay (src/ui)

Plain React + CSS, every string in `strings.ts` (Romanian). The overlay root is
`pointer-events: none`, so drags and taps reach the canvas; only panels and
buttons take events. The look is dark glass: translucent near-black panels,
thin borders, quiet type, and gold kept for the one action that matters ("Cumpără").

- **Intro title card** ("CLUJ ARENA · Vezi terenul de pe locul tău",
  "Atinge oriunde pentru a începe"). The rest of the UI waits until it ends.
- Header with the venue name and the permanent **"Demo – geometrie aproximativă"** badge.
- **Overview:** hint pill and the "Prețuri demo" legend.
- **Sector bar** (level 2): stand · sector · "de la 150 lei", free/total seats,
  the seat-state legend (liber / vândut / locul tău), and "Toate sectoarele".
- **Hover card** (desktop): a sector's name and price in the overview; a
  seat's row, number, price and state in the sector focus.
- **Seat bar** (level 3): "Tribuna I · Sector 1C · Rând 8 · Loc 6 · 150 lei",
  a gold "Cumpără", and "Alt loc" (back to the sector). It is a slim pill on
  laptops and a bottom card on phones.
- **Fake checkout**: a prominent **"Demo – fără plată reală"** banner,
  1–4 adjacent seats and a total, with no payment or personal-data fields.
  It is an accessible dialog: focus is trapped, Escape and backdrop close it,
  and focus returns to the button.
- A loader until the first frame, and full-screen pages for the failure cases
  (invalid config, unknown `?venue=`, no WebGL, lost GPU context, scene crash).

## 8. Testing strategy

| Layer | How it is tested |
|---|---|
| Reference curve math | exact identities vs. brute-force numeric integration; continuity at segment joins; level-set property |
| Venue data | real JSON: seat count = 30,335 (+ VIP/press/wheelchair split), unique ids, min spacing ≥ seat width, each seat on its row and facing the field, C-values for every seat |
| Validation | 19 deliberately broken configs, each must fail with a specific, located message |
| UI helpers | price formatting, seat summaries, config-error rendering |
| Meshes | finite, in range, winding agrees with normals, roof above every spectator |
| Camera math | framing fits the outline on laptop + phone, clamps, portrait tilt; roof-safe flights for every sector (overview ⇄ focus ⇄ seat view), every seat pair and mid-air retargets (with a control test) |
| Demo availability | deterministic; 60–75 % sold in every sector; press never for sale; sales come in clusters; lower and central rows sell first |
| Seat picking | a ray from the real sector-focus camera (laptop and phone) to sampled seats picks exactly that seat; touch forgiveness picks the nearest free seat and never a sold one |
| Whole app | Playwright on the production build. Real taps through intro → overview → sector → seat → checkout → back at every level, at 1440×900 and 390×844, with stills of each stage. Robustness: the skipping tap, rapid taps, Escape mid-flight, corner and press sectors, browser back. Zero console errors. FPS and draw calls per stage. A video of the whole flow. |

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

