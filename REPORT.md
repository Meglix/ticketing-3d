# REPORT — Cluj Arena "view from your seat" sales demo

## V2 — "cinematic night" (this update)

**Status: complete and verified on the final build.**

- 102 unit tests and 11 end-to-end tests pass.
- `npm run build` passes, and there are zero console errors in every e2e flow.
- Seven rounds of independent visual review against the reference frames. The
  final round graded **8 of 9 checklist items PASS**. The ninth, the
  foreground seats in the seat view, is an asset task (a modelled seat) and is
  documented below.
- Deployed privately (Vercel Authentication, as chosen) at
  https://ticketing-3d-orpin.vercel.app. Every push to
  `claude/relaxed-galileo-5jqhby` redeploys it, and I pushed only after the
  suite was green. The production deployment of the final build commit was
  confirmed READY.

The reference frames are in `reference/` (`frame_*.jpg`), not
`reference/cinematic/` as the brief said. They were used as style references
only and are not shipped in the app.

The V1 report (daylight look, two levels) is kept below, unchanged except
that its screenshots moved to `screenshots/v1/`.

### What changed

| Brief | Result |
|---|---|
| Night environment, no surroundings | Ground, plaza, hills and trees are gone. A near-black dome gradient with a faint warm haze is the only background. Floodlights are emissive strips plus instanced lamps that bloom. Real lighting is a dim hemisphere light and 4 cool spotlights from the roof edge, with soft-edged cones: the pitch is lit and the stands fall off. LED boards, a warm LED ribbon along every parapet and the gold seat are the warm accents. |
| Tone mapping, bloom, vignette, grain, SMAA | ACES Filmic. Bloom (only light sources exceed 1.0), a speed-driven radial blur during flights, SMAA, vignette and film grain (`postprocessing` 6.39.6 / `@react-three/postprocessing` 3.2.2). DOF was left out on purpose (DECISIONS 46). |
| Cinematic intro, 6–8 s, skippable | 7 s on the wall clock, starting after the first frame is shown. The camera orbits in from far and low while the four roof segments' floodlights power on one after another, under a "CLUJ ARENA" title card. A tap, click, drag, wheel or `prefers-reduced-motion` skips it, and the skipping tap selects nothing (e2e-tested). |
| Luminous overview → solid by distance | Structure edges are glowing lines. Seats read as fine light: only their backrests glow, tinted by tier, over dark treads, so every row is a thin line of light. The pitch dims. All of it crossfades to solid, lit materials with the camera's distance (`look.holo`), so it follows every flight automatically. |
| No price pills; stand names; sector name and price on hover/focus | The ~40 pills are gone. Four discreet stand names sit just outside the bowl on screen (turned along the rim on phones). The hover card (desktop) and the sector bar show the sector and "de la X lei". |
| Three levels with back navigation | Overview → tap a sector → 3/4 **sector focus** (seats tappable) → tap a free seat → 2.5 s curved flight with FOV change and speed blur → **seat view**. The turn is spread over the whole flight, with no top-down spin. The sector outline and the seat colours fade rather than pop. Back at every level: "Alt loc", "Toate sectoarele", Escape and the browser/phone back gesture (one level per step). The gold seat stays when you go back to its sector. |
| Seat states, demo availability | Available = tier colour, sold = dark grey, hovered = saturated cyan (raised), yours = gold with a soft glow plus a gold pin in the sector focus. In the seat view the seats around you crossfade to their real (tier) colour: you look at the stadium, not the availability map. Availability is deterministic fake data in `src/demo/availability.ts` (labelled DEMO DATA): clustered group bookings, 62–73 % sold per sector, press never for sale. |
| Picking only in the focused sector | An invisible InstancedMesh of boxes for that sector's seats (about 1,000); R3F's `instanceId` maps to the seat. On touch, a tap on a sold seat takes the nearest free seat within 28 px, because a seat is about 8 px wide on a phone. |
| First-person seat view | Over the shoulder, 0.85 m behind and 0.3 m above the eye point. The initial pitch is solved so that the top of your gold seat back sits just above the UI on every seat and screen. Your seat edge, armrests and the backs of the rows in front are in frame, with a soft fill light; the front of the stand is edged by the warm parapet ribbon. Drag to look around. |
| In-world LED boards "DE LA X LEI" | One board per sector on each ring's front ("SECTOR 2C · DE LA 100 LEI", "VIP 1C · DE LA 150 LEI", "2P · PRESĂ"), prices from the config. All boards are one texture atlas and one draw call. They glow, switch on with the lights, and are readable from the sector focus and the seat view. |
| Instanced seat model with LOD | One set of instance buffers, three LODs: 4 triangles far, 20 near, and a bucket-shaped detail seat (about 110 triangles, smooth-shaded like moulded plastic) for the focused sector only. |
| Minimal dark glass Romanian UI | Intro card; the overview hint and legend; a sector bar (free/total, seat-state legend, "Toate sectoarele"); a seat bar "Tribuna I · Sector 1C · Rând 6 · Loc 14 · 150 lei" with a gold **Cumpără** and "Alt loc"; the fake checkout ("Demo – fără plată reală"). "Demo – geometrie aproximativă" stays in the header. |
| Adaptive quality | A ladder of pixel ratio + effects tier (drei `PerformanceMonitor`): high → 0.75×DPR → medium (no grain) → low (no SMAA, no speed blur, fewer bloom levels). `?dpr=` / `?quality=` pin it. |

### Screenshots

From the e2e run on the production build, after **real taps** with a pointer
(mouse on desktop, touch on the phone). Desktop 1440×900 at DPR 1, phone 390×844 at DPR 2.

| Stage | Desktop 1440×900 | Phone 390×844 |
|---|---|---|
| 1. Intro (camera moving: speed blur) | ![](screenshots/desktop-1-intro.jpg) | ![](screenshots/phone-1-intro.jpg) |
| 2. Overview | ![](screenshots/desktop-2-overview.jpg) | ![](screenshots/phone-2-overview.jpg) |
| 3. Sector focus 1C (VIP) | ![](screenshots/desktop-3-sector.jpg) | ![](screenshots/phone-3-sector.jpg) |
| 3b. Seat hover (desktop) | ![](screenshots/desktop-3-sector-hover.jpg) | — |
| 4. Seat view | ![](screenshots/desktop-4-seat.jpg) | ![](screenshots/phone-4-seat.jpg) |
| 5. Fake checkout | ![](screenshots/desktop-5-checkout.jpg) | ![](screenshots/phone-5-checkout.jpg) |
| 6. Back to the sector (gold seat + pin) | ![](screenshots/desktop-6-sector-with-gold-seat.jpg) | ![](screenshots/phone-6-sector-with-gold-seat.jpg) |
| 7. Seat view, Tribuna II · 2M2 | ![](screenshots/desktop-7-seat-tribuna-II-2M2.jpg) | ![](screenshots/phone-7-seat-tribuna-II-2M2.jpg) |
| 7. Seat view, Peluza II · 1H | ![](screenshots/desktop-7-seat-peluza-II-1H.jpg) | ![](screenshots/phone-7-seat-peluza-II-1H.jpg) |
| 7. Seat view, Peluza I · 2V | ![](screenshots/desktop-7-seat-peluza-I-2V.jpg) | ![](screenshots/phone-7-seat-peluza-I-2V.jpg) |

Also: corner sector at the roof gap, ![](screenshots/desktop-8-seat-corner-2O2.jpg).

### Video of the full flow

[`screenshots/flow.webm`](screenshots/flow.webm), 1440×900, 25 fps, 29.8 s, 745 frames:

1. the full intro, a little orbit and a sector hover;
2. a tap on 1C and the flight to the sector focus;
3. a seat hover and tap, then the curved flight into the seat;
4. looking around, the fake checkout;
5. back to the sector and then the overview.

**How it was made, honestly:** this machine has no GPU, so headless Chromium
renders WebGL in software at about 2–3 fps, and a real-time screen recording
is a slideshow. The first version was exactly that: 4 min 11 s and 22.7 MB,
not committed. The committed video is rendered **frame by frame**. The app
runs in capture mode (`?capture`): its clock is virtual and the spec advances
it 40 ms per frame and screenshots each one (DECISIONS 63). Every frame is the
real production build reacting to real pointer input; only time is simulated.
So the video shows the motion a GPU would show, but it is **not** a
measurement of frame rate on any device.

### Performance per stage

Measured by `e2e/perf.spec.ts` in headless Chromium with **SwiftShader (software
WebGL on the CPU, no GPU)**. Each stage was warmed up for 2.5 s and then
sampled for 4 s. Draw calls and triangles are whole-frame totals: the scene
plus about 10 post-processing passes.

| Stage | Laptop 1440×900, quality pinned **high**, DPR 1 | Laptop 1440×900, **adaptive** | Phone 390×844 (DPR 2), **adaptive** |
|---|---|---|---|
| Overview | 2.6 fps · p95 450 ms · **JS 2.7 ms/frame** · 111 calls · 156k tris | 2.7 fps · stays on high, DPR 1 | 4.3 fps · high, DPR 1.5 |
| Sector focus | 2.5 fps · p95 500 ms · **JS 2.0 ms/frame** · 57 calls · 717k tris | 2.6 fps · steps down to medium | 6.5 fps · steps down to low, DPR 1 |
| Seat view | 2.2 fps · p95 550 ms · **JS 3.8 ms/frame** · 74 calls · 723k tris | 2.4 fps · medium | 5.7 fps · medium, DPR 1 |

**How to read this:**

- The fps column measures this container's CPU rasteriser, not a laptop or a
  phone. About 500 ms of main-thread time per frame is spent waiting for the
  software GPU.
- What transfers to real hardware is **our JavaScript cost: about 2–4 ms per
  frame** at a fixed quality. The adaptive run's 6–9 ms includes the one-off
  rebuild of the effect chain when the quality tier steps down.
  The per-frame seat-colour crossfade adds nothing measurable.
- It also shows that **the adaptive ladder works**: under load it drops to
  medium/low and DPR 1 by itself.
- **The geometry load in the sector focus and seat view (about 720k triangles)
  is the biggest remaining lever.** Within 140 m every seat of the stadium is
  drawn with the 20-triangle model. Per-instance distance LOD would cut it
  to roughly 300k: the detail sector is about 110k, nearby seats at 20
  triangles about 60k, and distant seats at 4 triangles about 120k (next steps).
- The post-processing chain costs fill rate: bloom mips, SMAA, blur and grain
  are full-screen passes. That is why the tiers drop them first.

**No real-GPU number is claimed.** Open the deployed site with `?fps` on the
demo laptop and a mid-range phone to measure. The 60 fps (laptop) and
≥ 30 fps (phone) targets are design targets backed by the CPU cost and
triangle counts above, not measurements.

### Tests

- **Unit (vitest): 102 passed, 12 files.** New in V2:
  - demo availability: deterministic; 60–75 % sold in every sector; press never for sale; clustered; lower and central rows sell first;
  - seat picking: a ray from the real sector-focus camera, on laptop and phone, picks exactly the seat aimed at; touch forgiveness picks the nearest free seat and never a sold one;
  - roof-safe flights for every sector: overview → focus → seat view → focus → overview, laptop and phone;
  - no spin: flights never look further down than their end poses and turn evenly (this test fails on the first V2 flight code);
  - seat-view framing: the top of your own seat back projects to the intended screen height for every sector, laptop and phone.
- **End-to-end (Playwright, production build): 11 passed, 0 failed** (about 16 min
  under software GL; the full suite was re-run after every review round).
  - Desktop and phone: intro → overview → real tap on a sector → sector focus → real tap on a free seat → seat view → Cumpără → Escape → "Alt loc" (the gold seat is kept) → "Toate sectoarele". Then one sector in each other stand, going back with Escape on desktop and the UI on the phone.
  - Robustness:
    - the intro-skipping tap selects nothing;
    - taps on other sectors while the camera is flying re-target it, and the last tap wins;
    - Escape mid-flight;
    - corner sectors at the roof gaps;
    - the press box can be viewed but nothing in it is for sale;
    - choosing another seat moves the gold seat;
    - the browser back gesture goes up one level per step.
  - FPS and draw calls per stage (above), and the flow video.
  - **Zero console errors** in every test.
- `npm run build` passes (tsc + Vite).

### Independent review

The brief asked for a separate reviewer agent to compare the screenshots with
the reference frames on a checklist, iterating until every item passes or is
documented as a limitation. Each round used a **fresh** general-purpose agent
with no shared context. It got the reference frames, all the stills and, from
round 2 on, a frame sequence of the seat flight from the video. Between rounds
I fixed what it found; the reasoning is in DECISIONS 61–70.

| # | Checklist item | R1 | R2 | R3 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|---|---|---|---|
| 1 | Black background, no surroundings | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | Glowing night lighting, bloom | ◐ | ◐ | ◐ | ✅ | ✅ | ✅ | ✅ |
| 3 | Luminous overview | ◐ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Readable in-world LED price boards | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | Individual seat selection, states | ◐ | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Gold selected seat, soft glow | ◐ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | First-person seat view | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| 8 | Smooth curved camera flight | ◐ | ◐ | ✅ | ✅ | ◐ | ◐ | ✅ |
| 9 | Premium minimal UI | ◐ | ◐ | ◐ | ◐ | ✅ | ◐ | ✅ |

✅ PASS · ◐ PARTIAL · ❌ FAIL (no item was ever graded FAIL).

**What the rounds changed (the main findings, each traced to a root cause):**

- **R1 → overview as fine light, not a price heatmap.** Only the seat
  backrests glow, the seat bodies go dark, and the pitch dims.
  - The VIP tier moved from gold to silver, because gold is "your seat".
  - The header got a scrim; the phone separators no longer dangle at line ends.
  - Hover became cyan; your seat got a gold pin.
  - Lights now stay in the scene at intensity 0, because toggling their
    visibility recompiled every shader on the first tap.
- **R2 → the flight spin.** Flights interpolated the look-*target point*, which
  swept under the camera, so the view tipped straight down and spun.
  - Flights now interpolate the view *direction*, with a regression test.
  - The seat-view pitch is now solved from geometry, with a test.
- **R3 → the seat view shows the stadium.** The "black boxes" in front were
  sold seats drawn in the availability map's dark grey.
  - Moulded (smooth-normal) seats.
  - Floodlight falloff, and bloom only from light sources.
  - The intro clock starts after the first frame, which compiles every shader.
- **R4 → crossfades instead of pops** between the availability map and the real
  seat colours. Also: calmer intro blur, a larger phone sector framing, and
  phone bottom sheets.
- **R5 → a warm LED ribbon on the parapets.** The front of the stand read as a
  dark seam. The seat flight is now 2.5 s.
- **R6 → the outline fade starts exactly at the tap** (it dropped to about 25 %
  on the tap frame). On phones the seat and price stay together, and the header
  sits on a glass card.

**Round 7 (final): 8/9 PASS.** The reviewer diffed the tap frames and
confirmed **no pops in the 3D scene**: the colours fade evenly and the flight
settles cleanly. The one PARTIAL is **the seat view's foreground seats**: the
box-built bucket seat looks like a placeholder next to the reference's
upholstered seats. The reviewer classifies the seat model as an **asset
task**; between-row ambient occlusion would help without one. Its other
findings are polish and are listed under limitations.

### Limitations compared with the reference

- **No global illumination, ambient occlusion or real shadows.** The reference
  looks pre-rendered or baked. Here the stands are lit by a hemisphere light,
  4 spotlights and a fill light in the seat view, so up close they are flatter
  than the reference.
  Real-time shadows of 30k instances, or path-traced lighting, are beyond a
  browser demo. Baked vertex AO from the generator is feasible (next steps).
- **Seat model (the main remaining gap; every reviewer flagged it):** a
  bucket-shaped box model (about 110 triangles, smooth-shaded), not a moulded,
  upholstered shell. In the seat view it reads as a block-out next to the
  reference. That is an asset task (a modelled instanced seat), not a WebGL
  limit. There is no crowd.
- **Overview palette:** the reference is near-monochrome navy. Here seats are
  tinted by price tier because the brief asks for it, at a lower intensity
  after review round 1.
- **Floodlights** read as bright LED strips. There is no glare, lens flare or
  visible light cones: volumetrics and flares are possible but costly, and
  were left for later.
- **LED boards** use a bitmap text atlas. Far boards smudge at phone
  resolution, and very close, steep views soften the letters.
- **No row highlight:** the reference outlines the selected row; the demo marks
  the seat (gold) and adds a pin in the sector focus.
- **Thin lines alias:** pitch markings and track lanes break into dashes when
  seen from far away, at least in the software-rendered captures. SMAA is on;
  drawing the markings into a mipmapped pitch texture is the robust fix.
- **Phone:** seats in the sector focus are about 8 px wide, which is why touch
  forgiveness (nearest free seat within 28 px) exists. Your own seat is large
  in a portrait seat view; the camera can't move further back without ending
  up behind the seat back of the row behind (rows are 0.80 m deep).
- **Frame rate not measured on a GPU** (see above). The flow video is
  frame-accurate but not real-time evidence of fps.
- **Remaining polish from the final review** (all browser-fixable):
  - The overview's fine seat lines shimmer (moiré), and the red track draws
    more attention than the reference's dark floor.
  - In lower-ring seat views a dark strip remains between the front row and
    the warm ribbon: the back of the front wall.
  - The demo's sold-seat clusters form large blobs in the sector focus. The
    availability generator could cluster by row instead.
  - On a phone seat view the header card covers part of the floodlight row,
    and "Loc N · price" wraps onto a second line for long stand names.
  - The cyan hover was only checked against silver, purple and blue tiers, not
    the teal 15-lei tier.
- **Geometry and prices are still estimates** (V1 §6 checklist), and seat
  availability is fake demo data.

### Next 3 steps

1. **Measure on the real devices, then spend the headroom.** Open `?fps` on
   the sales laptop and a mid-range Android phone.
   - Add per-instance distance LOD for the seats in the sector focus and seat
     view: a tiny compute pass, or a split into near/far instance sets per
     frame. That cuts about 720k triangles to roughly 300k.
   - Render on demand when the camera is idle.
   - Then tune the tier thresholds from the measurements.
2. **Close the biggest visual gaps vs the reference:**
   - a proper seat mesh (a ~300-triangle instanced GLTF shell). This is the one
     item the final review left PARTIAL;
   - baked ambient occlusion per vertex from the generator, which already knows
     every step, rail and overhang;
   - soft glare sprites at the floodlights;
   - a row highlight in the sector focus.
3. **Make it real data:** replace `src/demo/availability.ts` with a feed from
   the ticketing system and add a share link per seat (`?seat=1C-R6-S14`).
   Ground-truth the geometry with the §6 checklist (one visit), so the seat
   views can be shown as "Cluj Arena" without the "approximate" badge.

---

---

## V1 report — the original build (kept for reference)

Everything below describes V1 (daylight look, two levels: overview → seat). Its screenshots are in `screenshots/v1/`.

**Status: complete and verified.** All 85 unit tests and 7 end-to-end tests pass;
the typecheck and `npm run build` pass; there are zero console errors. An
independent reviewer agent (fresh context, did not write the code) checked
the build against the spec and tried to break it; its findings were fixed or
documented (see §5). Everything is committed and pushed on
`claude/relaxed-galileo-5jqhby`.

> **Read first:** every geometric value is an **estimate**. The build
> environment could not open any reference website or photo (only a search
> engine's text excerpts were reachable), so the stadium has not been checked
> against a plan or a photo. The checklist in §6 is what to verify at
> the stadium before calling it "Cluj Arena" in front of the venue's managers.

### 1. What works

| Brief | Result |
|---|---|
| Overview in 3D, from above at an angle | ✓ Framed for the screen shape: a laptop looks at the main stand (VIP, press and 100-lei sectors visible), a phone looks along the long axis. Drag to orbit, wheel/pinch to zoom (limited). |
| Sectors coloured by price tier, labelled "de la X lei" | ✓ 9 demo tiers plus press. Labels are ranked by commercial value, so premium sectors are always labelled: 50/58 labels on a 1440×900 laptop, 35/58 on a 390×844 phone (the hidden ones are the cheapest lower-ring sectors; their price shows on hover and in the seat panel). |
| Tap → highlight → ~1.5 s eased flight to a representative seat | ✓ 1.5 s ease-in-out cubic flight. It never passes through the roof or the stands (tested for all 58 sectors, all 3,306 seat-to-seat pairs and mid-air retargets). Other sectors turn grey. |
| Seat view at eye height, limited look-around, stand/sector/row/seat/price, back, pick another sector | ✓ Eye 1.2 m above the tread. Drag to look: ±75° yaw, −50°…+20° pitch. Seat panel shows all fields, "Înapoi la stadion". Tapping another sector from the seat flies straight there. The phone's back gesture also returns to the overview. |
| "Cumpără" → clearly fake checkout | ✓ "Demo – fără plată reală" banner, 1–4 adjacent seats, total, demo confirmation. No payment or personal-data fields. Disabled for the press sector. |
| Romanian UI, "Cluj Arena", "Demo – geometrie aproximativă", no logos | ✓ Including the error and fallback screens. No club names, crests or sponsor marks anywhere. |
| Laptop and phone | ✓ 1440×900, 390×844 portrait, and phones in landscape (compact layout). Adaptive resolution for slower devices. |
| Robust to fast repeated taps | ✓ Each new tap retargets the flight from the camera's current pose: no queue, no snapping, the last tap wins (e2e-tested). |
| Venue-agnostic generator with an extension point | ✓ A second, fictional venue (`?venue=example-arena`: football-only, one ring, no track) renders and passes the same invariant tests. The theatre ("horseshoe") extension point and its real scope are in ARCHITECTURE §9. |
| Invalid config fails fast | ✓ zod plus semantic checks; messages name the JSON path and the sector. The app shows the errors instead of a broken scene. |

### 2. Screenshots

All from Playwright on the production build. "Seat" screenshots were taken
after a **real tap** on the sector in the overview and the camera's arrival.

| | Laptop 1440×900 | Phone 390×844 |
|---|---|---|
| Overview | ![](screenshots/v1/desktop-overview.png) | ![](screenshots/v1/phone-overview.png) |
| Tribuna I · 2C (100 lei) | ![](screenshots/v1/desktop-seat-tribuna-I-2C.png) | ![](screenshots/v1/phone-seat-tribuna-I-2C.png) |
| Peluza II · 1H (lower ring) | ![](screenshots/v1/desktop-seat-peluza-II-1H.png) | ![](screenshots/v1/phone-seat-peluza-II-1H.png) |
| Tribuna II · 2M2 | ![](screenshots/v1/desktop-seat-tribuna-II-2M2.png) | ![](screenshots/v1/phone-seat-tribuna-II-2M2.png) |
| Peluza I · 2V | ![](screenshots/v1/desktop-seat-peluza-I-2V.png) | ![](screenshots/v1/phone-seat-peluza-I-2V.png) |
| Fake checkout | ![](screenshots/v1/desktop-checkout.png) | ![](screenshots/v1/phone-checkout.png) |

Extra: corner sector at the roof gap ![](screenshots/v1/desktop-seat-corner-2O2.png),
phone in landscape ![](screenshots/v1/phone-landscape-seat-2M2.png)
![](screenshots/v1/phone-landscape-checkout.png), and the second venue
![](screenshots/v1/example-arena-overview.png). The landscape and second-venue
shots are manual Playwright captures from the dev server.

### 3. Performance (overview, all 30,335 seats rendered)

| Measured in this environment (headless Chromium, **SwiftShader = CPU rendering, 4 cores**) | DPR 1 | DPR 2 |
|---|---|---|
| Frames per second | **4.0** | **1.75** |
| p95 frame time | 317 ms | 700 ms |
| **Our JavaScript per frame** (CDP `ScriptDuration`) | **1.8 ms** | **2.1 ms** |
| Main-thread time per frame (mostly waiting for the software rasteriser) | 283 ms | 799 ms |
| Draw calls / triangles | 89 / 158,298 | 89 / 158,298 |

**How to read this:** this container has no GPU, so every pixel is rasterised
on the CPU. Those fps numbers are a floor and say nothing about a laptop. What
does transfer to real hardware:

- **Our CPU cost is ~2 ms per frame**, about 12 % of a 60 fps budget.
- **The GPU load is small:** 89 draw calls and ~160k triangles in the overview
  (seat LOD: 4-triangle seats when far, 20 when near), plus about 645k
  triangles in the seat view. A mid-range laptop GPU handles this many times
  over.
- **Fill rate is what scales with screen density** (DPR 2 ≈ ½ the fps of DPR 1
  here). That's why the resolution adapts on slow devices.

**Please measure on the demo hardware:** open the deployed site with `?fps`
(e.g. `https://<your-app>.vercel.app/?fps`). A meter shows fps and the worst
frame. I could not measure a real GPU here, so I don't claim "60 fps". The
design target is that, and the numbers above are why I expect it.

### 4. Test results

**Unit tests (vitest): 85 passed, 9 files.**

| Area | What is checked |
|---|---|
| Seat count | generated seats = the sum of the rows = `capacity.total` = **30,335**; VIP **1,464**, press **168**, wheelchair **32**; unique ids; sectors contiguous |
| Seat spacing | no two seats closer than their seat width (spatial hash over all 30,335 seats, 1 mm tolerance for curved rows) |
| Sightlines | **every seat** clears the heads in front to the **pitch centre** with C ≥ 60 mm (minimum found: **252 mm**, at 1A2 row 2) and clears every parapet (minimum **73 mm**, 1A2 row 1). Stricter than asked: also to the **nearest touchline**, minimum **77 mm** (upper ring, Tribuna I) |
| Every venue file | the same invariants for `example-arena` (touchline minimum 65 mm). Its first draft failed at 24 mm and was fixed, which shows the tests catch real design errors |
| Curve maths | exact offset lengths vs. numeric integration, inverse mapping, level-set property, continuity |
| Validation | 19 broken configs, each rejected with a specific, located message |
| Meshes | finite, indices in range, triangle winding matches normals, roof ≥ 3 m above the highest eye |
| Camera | framing on laptop and phone, look clamps, portrait tilt, roof-safe flights for every sector and seat pair plus a control test that catches a naive straight-line flight |
| UI helpers | price formatting, seat summary, error rendering |

**End-to-end (Playwright, production build): 7 passed, 0 console errors.**
- Laptop and phone: overview → **real tap** on a sector in each stand (2C, 1H, 2M2, 2V) → seat view → back → fake checkout → Escape.
- Rapid taps (3 sectors in about 300 ms) end on the last one tapped.
- Escape mid-flight, corner sectors at the roof gaps (2A1, 2O2), the press sector (purchase disabled).
- Browser/phone back gesture returns from a seat to the overview.
- FPS at DPR 1 and 2 (above).

The one console *warning* on load (`THREE.Clock … deprecated`) comes from
@react-three/fiber 9.8 running with three 0.187; it is not an error and needs an upstream fix.

**Build:** `npm run build` passes (tsc + Vite). Gzipped: three.js 193 kB, R3F/drei 126 kB, app 60 kB.

### 5. Independent review — findings and what happened

The reviewer found no blockers and 17 findings. All four majors are fixed:

| # | Finding | Outcome |
|---|---|---|
| 1 | Sky never rendered (sky sphere beyond the camera's far plane) | **Fixed**: the sky dome follows the camera inside the far plane |
| 2 | Overview hid labels of premium sectors (33/58 shown, 2C/2D/1C/2M2 missing) | **Fixed**: commercial-value ranking plus nudging; 50/58, all premium shown |
| 3 | No WebGL fallback or error boundary (blank white page) | **Fixed**: WebGL check, error boundary, context-loss handling, Romanian fallback with reload |
| 4 | Phone landscape: seat card covered 74 % of the height; checkout scrolled | **Fixed**: compact card, two-column checkout that fits |
| 5 | Floodlights as a stray dotted line in the overview | **Fixed**: hidden with the ghosted roof |
| 6 | Rotating the phone lost the portrait tilt | **Fixed** |
| 7 | Phone back gesture left the demo | **Fixed**: history entry per seat view |
| 8 | Validator gaps (roof segments, floodlight count, eye height, rows on the field, index-only paths) | **Fixed** |
| 9 | Horseshoe extension point narrower than documented | **Documented honestly** (ARCHITECTURE §9); an interface waits for a second template |
| 10 | Lower ring of Tribuna I priced 25–40, not 25–50 | **Fixed** (1B/1E at 50 lei) |
| 11 | Eye height read as "above the tread" vs. "above the seat" | **Kept**, needs your confirmation (FACTS.md) |
| 12 | THREE.Clock warning | Upstream; documented |
| 13 | Phone: expanded legend pushed the hint over the stadium | **Fixed** (hint hides while the legend is open). Zoom always targets the centre: kept |
| 14 | Seat view draws all seats at full detail; continuous rendering | Kept (fine on laptops; adaptive DPR protects phones); next step 3 below |
| 15 | REPORT.md missing; wrong wheelchair-platform location; roof coverage stated as 93 % | **Fixed** (this file; docs corrected; coverage is 98 % in plan) |
| 16 | drei never imported | **Fixed**: drei's `PerformanceMonitor` drives the adaptive resolution |
| 17 | English details on the error page; misleading title for an unknown venue; static `<title>` | **Partly fixed**: distinct "Locație necunoscută" page, title from the venue. The validator details stay in English (they are for whoever edits the JSON) |

While fixing these, the e2e suite exposed a flaky test: it tapped during the
load-time camera intro. That was fixed in the test, which now waits for the
camera to be idle. The app behaviour was correct.

### 6. Still ESTIMATED: what to verify at the stadium

Seat counts per row were fitted to the sourced totals (30,335 / 1,464 / 168 / 32)
from an estimated cross-section, so per-sector counts are only as good as the
row counts. Spans are metres along the bowl's reference line (see README).

**Whole stadium (do these first; they move everything else)**
- [ ] Rows per ring: lower **14**, upper **16** (same in all four stands?)
- [ ] Row depth 0.80 m; seat width 0.50 m (VIP 0.55 m)
- [ ] Lower ring first-row height ≈ 1.6 m above the track; upper ring first row ≈ 11.5 m; upper ring overhangs the lower ring by ≈ 2.7 m
- [ ] Rakes: lower ≈ 21°→27°, upper ≈ 30°→34°
- [ ] Bowl front line ≈ 184 × 100 m with ≈ 30 m corner radius; corners of the lower ring continuous?
- [ ] Upper ring and roof **open at the four corners**? Gap width (≈ 10 m at the facade used)
- [ ] Roof leading edge position: the model covers 98 % of seats in plan, the source says ≈ 93 % (maybe 1–2 front rows uncovered)
- [ ] Roof edge ≈ 27–28 m high; translucent band ≈ 7 m deep
- [ ] Floodlights along the roof edge (386 fittings sourced)
- [ ] Two screens: position (modelled behind the upper ring of each peluza)
- [ ] Wheelchair spaces (32): location (modelled at pitch level in front of Tribuna II, sector `PD`)
- [ ] VIP/business (1,464): location (modelled as lower-ring sectors 1C/1D of Tribuna I) and the boxes level
- [ ] Press (168): location (modelled as narrow upper-ring sector 2P at the centre of Tribuna I)
- [ ] Which end is Peluza I (Sud) vs. II (Nord); Tribuna I on the west
- [ ] Real seat colours (sourced as "shades of grey"; the demo colours seats by price)
- [ ] Sector letters and boundaries against the bilete.ro seat map (only 2A1, 2A2, 2B, 2C, 2D, 1M1, 1M2, 2M2, 1T1, 1Y are sourced)

**Per sector** (rows, seats, demo price, span):

#### Tribuna I

**Inelul 1 (inferior)**: 8 sectors, rows 1–14, first tread 1.6 m, last 6.15 m

- [ ] **1A1**: 14 rows, 727 seats, 25 lei, span -85.562 … -62 m
- [ ] **1A2**: 14 rows, 378 seats, 30 lei, span -62 … -46.5 m
- [ ] **1B**: 14 rows, 378 seats, 50 lei, span -46.5 … -31 m
- [ ] **1C** (vip): 14 rows, 736 seats, 150 lei, span -31 … 0 m
- [ ] **1D** (vip): 14 rows, 728 seats, 150 lei, span 0 … 31 m
- [ ] **1E**: 14 rows, 378 seats, 50 lei, span 31 … 46.5 m
- [ ] **1F1**: 14 rows, 378 seats, 30 lei, span 46.5 … 62 m
- [ ] **1F2**: 14 rows, 727 seats, 25 lei, span 62 … 85.562 m

**Inelul 2 (superior)**: 9 sectors, rows 1–16, first tread 11.5 m, last 19.075 m

- [ ] **2A1**: 16 rows, 947 seats, 30 lei, span -83.062 … -62 m
- [ ] **2A2**: 16 rows, 432 seats, 40 lei, span -62 … -46.5 m
- [ ] **2B**: 16 rows, 432 seats, 60 lei, span -46.5 … -31 m
- [ ] **2C**: 16 rows, 800 seats, 100 lei, span -31 … -3.5 m
- [ ] **2P** (press): 16 rows, 168 seats, not for sale, span -3.5 … 3.5 m
- [ ] **2D**: 16 rows, 800 seats, 100 lei, span 3.5 … 31 m
- [ ] **2E**: 16 rows, 432 seats, 60 lei, span 31 … 46.5 m
- [ ] **2F1**: 16 rows, 432 seats, 40 lei, span 46.5 … 62 m
- [ ] **2F2**: 16 rows, 947 seats, 30 lei, span 62 … 83.062 m

#### Peluza II (Nord)

**Inelul 1 (inferior)**: 6 sectors, rows 1–14, first tread 1.6 m, last 6.15 m

- [ ] **1G1**: 14 rows, 343 seats, 15 lei, span 85.562 … 97.343 m
- [ ] **1G2**: 14 rows, 343 seats, 15 lei, span 97.343 … 109.124 m
- [ ] **1H**: 14 rows, 504 seats, 15 lei, span 109.124 … 129.124 m
- [ ] **1I**: 14 rows, 504 seats, 15 lei, span 129.124 … 149.124 m
- [ ] **1J1**: 14 rows, 343 seats, 15 lei, span 149.124 … 160.905 m
- [ ] **1J2**: 14 rows, 343 seats, 15 lei, span 160.905 … 172.686 m

**Inelul 2 (superior)**: 6 sectors, rows 1–16, first tread 11.5 m, last 19.075 m

- [ ] **2G1**: 16 rows, 392 seats, 20 lei, span 88.062 … 97.343 m
- [ ] **2G2**: 16 rows, 515 seats, 20 lei, span 97.343 … 109.124 m
- [ ] **2H**: 16 rows, 576 seats, 20 lei, span 109.124 … 129.124 m
- [ ] **2I**: 16 rows, 576 seats, 20 lei, span 129.124 … 149.124 m
- [ ] **2J1**: 16 rows, 515 seats, 20 lei, span 149.124 … 160.905 m
- [ ] **2J2**: 16 rows, 392 seats, 20 lei, span 160.905 … 170.186 m

#### Tribuna II

**Platformă (nivelul terenului)**: 1 sector, rows 1–1, first tread 0.15 m, last 0.15 m

- [ ] **PD** (accessible): 1 row, 32 seats, 15 lei, span 242.248 … 274.248 m

**Inelul 1 (inferior)**: 8 sectors, rows 1–14, first tread 1.6 m, last 6.15 m

- [ ] **1K1**: 14 rows, 727 seats, 20 lei, span 172.686 … 196.248 m
- [ ] **1K2**: 14 rows, 504 seats, 25 lei, span 196.248 … 216.918 m
- [ ] **1L**: 14 rows, 504 seats, 25 lei, span 216.918 … 237.578 m
- [ ] **1M1**: 14 rows, 504 seats, 25 lei, span 237.578 … 258.248 m
- [ ] **1M2**: 14 rows, 504 seats, 25 lei, span 258.248 … 278.918 m
- [ ] **1N**: 14 rows, 504 seats, 25 lei, span 278.918 … 299.578 m
- [ ] **1O1**: 14 rows, 504 seats, 25 lei, span 299.578 … 320.248 m
- [ ] **1O2**: 14 rows, 727 seats, 20 lei, span 320.248 … 343.81 m

**Inelul 2 (superior)**: 8 sectors, rows 1–16, first tread 11.5 m, last 19.075 m

- [ ] **2K1**: 16 rows, 947 seats, 25 lei, span 175.186 … 196.248 m
- [ ] **2K2**: 16 rows, 576 seats, 30 lei, span 196.248 … 216.918 m
- [ ] **2L**: 16 rows, 576 seats, 40 lei, span 216.918 … 237.578 m
- [ ] **2M1**: 16 rows, 576 seats, 40 lei, span 237.578 … 258.248 m
- [ ] **2M2**: 16 rows, 576 seats, 40 lei, span 258.248 … 278.918 m
- [ ] **2N**: 16 rows, 576 seats, 40 lei, span 278.918 … 299.578 m
- [ ] **2O1**: 16 rows, 576 seats, 30 lei, span 299.578 … 320.248 m
- [ ] **2O2**: 16 rows, 947 seats, 25 lei, span 320.248 … 341.31 m

#### Peluza I (Sud)

**Inelul 1 (inferior)**: 6 sectors, rows 1–14, first tread 1.6 m, last 6.15 m

- [ ] **1T1**: 14 rows, 343 seats, 15 lei, span 343.81 … 355.591 m
- [ ] **1T2**: 14 rows, 343 seats, 15 lei, span 355.591 … 367.372 m
- [ ] **1U**: 14 rows, 504 seats, 15 lei, span 367.372 … 387.372 m
- [ ] **1V**: 14 rows, 503 seats, 15 lei, span 387.372 … 407.372 m
- [ ] **1X**: 14 rows, 343 seats, 15 lei, span 407.372 … 419.153 m
- [ ] **1Y**: 14 rows, 343 seats, 15 lei, span 419.153 … 430.934 m

**Inelul 2 (superior)**: 6 sectors, rows 1–16, first tread 11.5 m, last 19.075 m

- [ ] **2T1**: 16 rows, 392 seats, 20 lei, span 346.31 … 355.591 m
- [ ] **2T2**: 16 rows, 513 seats, 20 lei, span 355.591 … 367.372 m
- [ ] **2U**: 16 rows, 560 seats, 20 lei, span 367.372 … 387.372 m
- [ ] **2V**: 16 rows, 560 seats, 20 lei, span 387.372 … 407.372 m
- [ ] **2X**: 16 rows, 513 seats, 20 lei, span 407.372 … 419.153 m
- [ ] **2Y**: 16 rows, 392 seats, 20 lei, span 419.153 … 428.434 m

### 7. Known limitations

- **Geometry is approximate** (§6). The tool flags it in the UI ("Demo – geometrie aproximativă", "Poziție estimată").
- **Prices are demo prices** following the historical structure; the VIP tier (150 lei) is an assumption.
- **Research was text-only:** no reference page or photo could be opened from the build environment (DNS-blocked); only search-engine excerpts. FACTS.md marks the evidence type of every fact.
- **FPS was not measured on a real GPU.** Use `?fps` on the demo laptop and phone.
- **Labels:** on a phone about a third of the cheapest sectors have no label in the overview (no room); their price shows after tapping.
- **One cross-section per ring** for all four stands. A real stand differs (VIP boxes level, press desks, vomitories as gaps in rows).
- **The seat view draws every seat at full detail** (~645k triangles). It is fine on laptops; the adaptive resolution is the phone safety net.
- **Console warning** `THREE.Clock … deprecated` from the R3F/three versions (not an error).
- **The theatre ("horseshoe") template** is designed for (ARCHITECTURE §9) but not built.
- **Checkout** is a mock with no booking logic. The "1–4 adjacent seats" assumes seats are free.

### 8. Recommended next 3 steps

1. **Ground-truth the venue (1 visit, ½ day).** Walk the §6 checklist with
   a laser meter and the bilete.ro seat map: row counts, first-row heights,
   corner gaps, sector boundaries and letters. Put the numbers into
   `scripts/author-cluj-arena.ts` (or real per-row seat counts straight into
   the JSON) and re-run `npm test`. The sightline and capacity tests will
   flag anything inconsistent. Take your own photos from 4–6 seats to compare
   with the seat views.
2. **Measure on the actual demo devices, then tune.** Deploy to Vercel
   (README), open `?fps` on the sales laptop and on a mid-range Android phone.
   If the phone seat view drops below ~45 fps, add per-seat distance LOD in a
   small custom shader (far seats at 4 triangles in the seat view too) and
   render on demand when the camera is idle.
3. **Make it sell: real availability and a seat picker.** Load sold/free
   seats from a JSON feed (or a bilete.ro export) and colour them. Let the
   user step through rows and seats within a sector (the seat view already
   works for any seat id). Add a share link per seat (`?seat=2M2-R8-S18`).
   That turns the demo into the managers' own "sell the view" story.
