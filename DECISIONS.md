# DECISIONS

Each entry: **decision** — alternatives — why. Newest at the bottom.

## Research

1. **Use search-engine excerpts as the research source; do not ask for network access.**
   Alternatives: request the environment's network policy to allow Wikipedia,
   StadiumDB, etc.; stop and wait. Why: every reference host failed with DNS
   `ENOTFOUND` (only package registries are allowed). The brief says not to stall
   and the owner is away, so an approval prompt would block the run. Each fact
   records its evidence type ("brief" / "search excerpt") in FACTS.md so the gap
   is visible.

2. **No photos viewed, downloaded or shipped.** Alternatives: none acceptable
   (copyright). Why: brief. Visual properties come from text descriptions and
   carry lower confidence.

## Architecture

3. **Pin mature major versions: Vite 7, TypeScript 5.9, vitest 4, React 19.3,
   R3F 9, drei 10, three 0.187, zod 4, @playwright/test 1.63.**
   Alternatives: latest majors (Vite 8 / Rolldown, TypeScript 7 native compiler,
   vitest 5). Why: the newest majors are recent, and the demo must build reliably
   on Vercel. `@playwright/test` is pinned to the same version as the pre-installed
   browser so nothing has to be downloaded.

4. **The bowl is described by one reference line (a rounded rectangle) and rows
   are its offset curves.** Alternatives: free polylines per sector; polar
   (angle/radius) sectors; per-seat coordinates in the JSON. Why: an offset of a
   rounded rectangle is again a rounded rectangle, so every row's length and every
   seat position have a closed form. Aisles automatically run along the normals
   (radial aisles), and a stadium with semicircular ends (athletics bowl) is the
   special case `cornerRadius = halfWidth`. A horseshoe template would provide a
   different (open) reference curve and reuse the same row/seat placement code.

5. **Sector extent = a span of arc length `s` along the reference line.**
   Alternatives: angles around the centre spot (polar angles are not aligned with
   the rows of a non-circular bowl); metres along each row (differs per row).
   Why: `s` is the one parameter shared by all rows. Mapping it to a row at
   offset `d` is exact (straights keep length, arcs scale by `(R + d) / R`).

6. **Rows are explicit in the JSON (per sector: seats, distance, elevation,
   rakeDeg), generated once by `scripts/author-cluj-arena.ts`.**
   Alternatives: a compact "profile" (first row, tread, riser, count) expanded at
   runtime; or both. Why: the brief asks for per-row data, and real venues have
   irregular rows (vomitories, VIP rows, wheelchair platforms), which only an
   explicit list can represent. The script records *how* the estimate was made,
   and the JSON is what the app reads. One path at runtime. `rakeDeg` is
   cross-checked against the row-to-row slope so the two cannot silently
   disagree.

7. **Seat count per row comes from the config, not from geometry; the generator
   checks that the seats fit.** Alternatives: compute seats from row length ×
   width. Why: the ticketing system is the truth for seat counts. Geometry only
   has to accommodate them, and if it can't, that is a config error to fail fast on.

8. **Seats placed at a fixed pitch (`seatWidth`), centred in the usable row length.**
   Alternatives: spread seats evenly over the whole row. Why: real rows have a
   constant seat pitch, and the left-over space reads as wider aisles or
   vomitories. On curved rows the chord between neighbours is shorter than the arc
   by about δ³/24ρ² (micrometres here), so the spacing test uses a 1 mm tolerance.

9. **Sightline test = C-value against every row in front, using the 2D signed
   distance to the reference line.** Alternatives: only the adjacent row in the
   same sector; a full 3D ray cast against meshes. Why: the signed distance
   `sd(p)` of a rounded rectangle is closed-form, and the rows are its level sets,
   so the point where the line of sight crosses any row is found exactly. Checking
   every row in front catches a sudden rake change, not just the neighbour. The
   stand's own parapets count as obstacles too.

10. **State in a 40-line store on `useSyncExternalStore`.** Alternatives: zustand,
    Redux, React context. Why: no extra dependency (brief), and the camera loop
    can read `store.get()` without re-rendering React.

11. **Roof fades to a ghost in the overview and becomes solid in the seat view.**
    Alternatives: a camera high enough to look under the roof (impossible: the
    roof covers ~98 % of seats in plan); remove the roof. Why: the overview has to show
    the sectors, and the seat view has to show the real enclosure.

12. **No postprocessing library.** Alternatives: `@react-three/postprocessing`
    (bloom, SMAA, AO). Why: it is an extra dependency, the target is ~60 fps on a
    mid-range laptop and phones, and MSAA plus ACES tone mapping are enough for a
    clean stylised look.

## Build & tooling

13. **vitest 4.1.12 installed with `legacy-peer-deps=true` (in `.npmrc`).**
    Alternatives: vitest 3.2 (installs cleanly but `npm audit` reports critical
    advisories in its `tinypool`/`@vitest/mocker`); vitest 5 (new major).
    Why: 4.1.12 is the first patched 4.x, but npm 10 crashes
    (`Cannot read properties of null (reading 'edgesOut')`) while resolving its
    optional peer set. Every peer we need (react, three, vite) is a direct
    dependency, so skipping automatic peer installation is safe. The `.npmrc`
    makes Vercel's `npm install` behave the same. Result: 0 vulnerabilities.

14. **The authoring script runs on Node's built-in TypeScript type stripping
    (`node scripts/author-cluj-arena.ts`).** Alternatives: `tsx`/`ts-node`
    (extra dependency); a JS copy of the geometry (two sources of truth). Why:
    Node ≥ 22.18 runs erasable TypeScript directly. This forces explicit `.ts`
    import extensions and `import type`, which `tsconfig` enforces with
    `allowImportingTsExtensions`, `verbatimModuleSyntax` and `erasableSyntaxOnly`.

## Venue data

15. **Lane A ran before lanes B/C/D instead of in parallel with them.**
    Alternatives: all four lanes at once against stub data. Why: the scene,
    camera and picking all consume the generator's real output (sector solids,
    seat positions, bounds). Building against stubs would mean re-integrating
    later. B, C and D then run in parallel.

16. **Wheelchair spaces = a separate pitch-level "ring 0" in front of Tribuna II
    (sector `PD`, 32 spaces of 0.9 m).** Alternatives: a platform behind the
    lower ring (the lower ring's back wall and the upper ring's overhang would
    block it); flags on ordinary seats (an extra per-seat concept). Why: it is a
    plain sector in the existing model, it has excellent sightlines, and it is
    visible in the overview. Location ESTIMATED.

17. **Press = narrow sector `2P` at the centre of Tribuna I's upper ring,
    `price: null` ("not for sale").** Alternatives: the press as the front rows
    of 2C/2D (sectors would then not be wedges). Why: keeps every sector a
    simple span. The UI can show the view but not sell it.

18. **Span overlap tolerance 1 mm.** Why: spans are stored with mm precision
    and wrap around the perimeter (Tribuna I spans s = 0). Rounding left a
    0.4 mm "overlap" between 1A1 and 1Y. The validator caught it, and it is noise.

19. **Upper ring risers 0.47 → 0.54 m (30.4° → 34°).** Alternative: 0.45 →
    0.55 m (first estimate). Why: the first estimate met the required
    pitch-centre sightline but gave a near-touchline C-value of 57 mm, below
    the 60 mm design minimum. The new profile gives ≥ 77 mm everywhere and keeps
    the maximum rake at the usual 34° limit. The tests now enforce both focus points.

20. **Representative seat = middle seat of the middle row; label anchor 2 m
    above the middle row at the middle of the span.** Why: simple,
    deterministic, and always on the visible tread.

21. **A second, fictional venue (`venues/example-arena.json`, football-only,
    one ring, no track, continuous roof) and invariant tests over every venue
    file.** Alternatives: only Cluj Arena. Why: it proves the generator is
    venue-agnostic (different corner radius, no track, single ring, no gaps) and
    shows what "add a venue" means. It paid off immediately: its first profile
    (0.32 m front risers) gave a 24 mm touchline C-value at the oblique corner
    seats, and the suite rejected it. The risers were raised to 0.38 → 0.46 m.
    `?venue=example-arena` shows it in the app.

22. **Venues are discovered with `import.meta.glob('/venues/*.json')`, chosen by
    `?venue=<id>`.** Alternatives: a hard-coded import; a registry file to keep
    in sync. Why: adding a venue = adding one JSON file.

23. **In-app `?fps` meter (rAF-based) + `window.__renderInfo` (three.js
    draw calls / triangles).** Why: headless CI renders with SwiftShader (CPU),
    so its FPS is only a floor. The meter lets the owner measure on the actual
    demo laptop and phone.

## Integration

24. **Default desktop overview from behind Tribuna II (azimuth +z, 52°), not
    Tribuna I (lane C's first choice, 48°).** Why: the first integrated
    screenshot showed that, seen from behind Tribuna I, its own upper-ring
    overhang hid the lower ring, which holds the VIP sectors 1C/1D. In a sales
    demo the premium inventory must be the most visible thing. The hidden
    lower ring is now Tribuna II's (20–25 lei); orbiting reveals it. Phones
    keep the view from behind Peluza I.

25. **Portrait seat view: the initial look is tilted down by half of
    (fov − 60°).** Alternatives: a narrower fov on phones (less context);
    leave it centred (≈ 40 % of the screen was sky). Why: the far stand now sits
    near the top edge as on a laptop. Yaw limits still centre on the pitch centre.

26. **Desktop legend = one slim price bar at the bottom, stacked under the
    hint.** Alternative: lane D's top-right card. Why: the card covered the
    stadium's right-hand sectors and labels, and positioning the hint and legend
    independently let them collide on narrower laptops (seen at 1024 px).

27. **e2e rapid-tap test re-projects each sector at tap time.** Why: the first
    version resolved all tap points before the first tap. Once the camera
    moves, a stale point lands on a neighbouring sector (2M1) and the app
    correctly flies there, so the test was wrong, not the app.

28. **Seat LOD: a second InstancedMesh with a 4-triangle double-sided seat,
    shown when the camera is > 140 m from the centre; it shares the instance
    matrix and colour buffers.** Alternatives: one 20-triangle mesh (lane B's
    version); GPU-side LOD in a custom shader. Why: in the overview a seat is
    2–7 px, so 80 % of the triangles bought nothing. Measured in the same
    headless setup: 648k → 163k triangles, DPR 1 software-rendered fps 3.6 →
    5.4, script time per frame unchanged (~1.5–2 ms). Sharing the buffers
    means no extra upload and no colour desync. At the switch distance there is
    no visible pop (screenshot check).

29. **Field without a track: grass fills the whole bowl, no apron.** Found by
    rendering `?venue=example-arena`. The renderer's track-less fallback built
    a "track-shaped" infield (52.5 m straights + 37 m bends) that reached
    outside a compact bowl, so the apron's hole was bigger than its outline and
    triangulated into garbage (red/green z-fighting). Lesson: the second venue
    tests the renderer's assumptions, not only the generator's.

## Independent review (fresh reviewer agent, no shared context) — fixes

30. **Sky dome follows the camera, radius 4000 m (< far 5000 m).** The sky
    sphere (r = 7000 m) sat beyond the rig's far plane, so it was never drawn
    and every view showed a flat grey background. Alternatives: raise `far`
    (more depth-precision loss in the overview); shrink a static sphere (it
    could still be clipped when the camera orbits far out). Following the
    camera is the standard skybox technique, and the shader colours by direction only.

31. **Label placement ranked by commercial value, with nudging.** Order:
    hovered → VIP → wheelchair platform (a showcase) → price high to low →
    press last; ties go to the nearest label, then the code. A colliding label
    is tried one chip height above and below before it is hidden. Desktop
    labels went from 33 to 50 of 58 (all premium sectors, 2M2 included); phone
    from 23 to 35. The cheapest lower-ring labels may still hide; their price
    shows on hover (desktop) and in the seat panel.

32. **Fail visibly when 3D can't run:** an up-front WebGL check, an error
    boundary around the stage, and `webglcontextlost` handling, all leading to
    one Romanian fallback screen with "Reîncarcă pagina". Before, a
    missing WebGL context unmounted the whole React tree (blank white page).

33. **Height-aware layout for phones in landscape**
    (`orientation: landscape and max-height: 520px`): a compact 340 px seat
    card on the right, and a two-column checkout that fits 390 px without
    scrolling. Width alone had selected the desktop card (≈ 74 % of the height).

34. **Floodlights hide with the ghosted roof**, otherwise they drew a stray
    dotted line over the track in the overview.

35. **Rotating the phone re-applies the portrait tilt** (mid-flight or seated),
    keeping the user's yaw and relative pitch.

36. **Browser history for the seat view:** entering a seat pushes one entry.
    Back (including Android's back gesture) returns to the overview, and leaving
    through the UI consumes the entry. Alternative: no history (the back
    gesture would leave the demo in front of a client).

37. **Validator gaps closed:** roof segments longer than one lap or
    overlapping; floodlight count ≤ 5000; eye height 0.8–2 m; rows placed on
    the field of play (behind the track/pitch edge, checked only once the field
    itself fits); shape-error paths carry the sector code. Still by design:
    semantic checks run only after the shape is valid, because they need a
    typed config.

38. **Lower ring of Tribuna I now spans 25–50 lei, as in the brief:** 1B/1E
    moved from 40 to a new 50-lei tier. VIP (1C/1D, 150 lei) stays its own
    category.

39. **drei is now used: `PerformanceMonitor` drives an adaptive pixel ratio**
    (steps of 0.5 between 1 and min(2, devicePixelRatio), settling at 1 after
    3 flip-flops). `?dpr=<n>` pins it (used by e2e screenshots and the perf
    spec). Alternative: remove drei (the brief names it). Why: the
    measurements show fill rate is the cost that grows with DPR, so this is the
    lever that protects frame rate on mid-range phones.

40. **e2e waits for `cameraIdle()`, not just the store.** The 2.2 s intro
    sweep isn't a store transit. A tap point projected during it went stale and
    made the new back-gesture test flaky (1 in 3). That was a test
    synchronisation bug, not an app bug.

41. **Not changed, documented instead:** the horseshoe extension point is
    narrower than first written: the closed rounded-rectangle assumption is
    used in 7 modules (see ARCHITECTURE §9). An interface now would be
    speculative, so it waits for the second template. Eye height is
    1.2 m above the *tread* (the standard seated sightline convention, ≈ 0.73 m
    above the seat pan): confirm with the owner. R3F 9.8 logs a
    `THREE.Clock` deprecation *warning* with three 0.187, which we can't fix
    without an upstream release. The seat view draws all seats at full detail
    (~645k triangles), which is fine for laptops, and the adaptive DPR covers phones.

42. **The "hide the hint while the legend is open" rule is phone-only.** It
    was first written unscoped, and the desktop legend is always open, so the
    overview hint disappeared on laptops. The final screenshot review caught
    it, and the e2e now asserts that the hint and legend are visible on both
    viewports.


## V2 — "cinematic night"

43. **One shared per-frame `look` state (`src/scene/look.ts`) drives the whole
    cinematic behaviour:** `holo` (luminous ↔ solid), `intro` (clock),
    `power` (floodlight level), `speed` (camera speed). It is written once per
    frame by `<LookDirector/>` (useFrame priority −1, before everything else)
    and read by each scene component in its own useFrame. Alternatives: React
    state/context (a re-render per frame), or each component computing its own
    numbers (the intro, lights and bloom would drift apart). Why: one place to
    tune, no re-renders, and every part stays in sync.

44. **`holo` comes from camera distance, not from the view state**
    (smoothstep from 115 m to 240 m from the centre spot). Alternative: a tween
    started on each view change. Why: the crossfade from luminous model to solid
    materials then follows the flight by itself, including flights that are
    re-targeted mid-air. There's no second animation to keep in sync with the camera.

45. **Post-processing via `@react-three/postprocessing` 3.2.2 / `postprocessing`
    6.39.6 (pinned).** Chain: Bloom (mipmap, threshold 0.92) → speed blur →
    ACES Filmic tone mapping → SMAA → vignette → film grain. The composer renders
    in half-float HDR with the renderer's tone mapping off, so tone mapping is
    an effect near the end. Only light sources go above 1.0 and bloom:
    floodlight strips ×1.9, lamps ×4, LED text ×1.75, the gold seat. Everything
    else stays below the threshold, so bloom marks lights rather than haze.
    ACES Filmic over AgX: chosen for contrast and saturated tier colours. AgX
    was not A/B-tested in this run.

46. **No depth of field (the brief marks it optional).** Why: in the seat view the
    things nearest the camera are your own seat and the backs in front, which
    are exactly what the brief wants in frame. Blurring them works against that,
    and a full-resolution circle-of-confusion pass is the most expensive effect
    on a phone. The flights get a speed-driven radial blur instead: a custom
    `CONVOLUTION` effect whose strength comes from camera speed, so it is
    zero at rest without any timing logic. It is off on the low tier.

47. **Adaptive quality is one ladder: [max DPR/high, 0.75·max/high, 1/medium,
    1/low].** drei's `PerformanceMonitor` steps along it. The tiers drop film
    grain (medium), then SMAA, the speed blur and bloom levels (low).
    `?dpr=` / `?quality=` pin it. The canvas container exposes `data-quality` /
    `data-dpr` for the perf spec. Why: one knob per step, cheapest-to-lose first.

48. **Night environment: no surroundings at all** (ground, plaza, hills and trees
    removed). A camera-following dome shader gives a near-black gradient with
    a faint warm haze as the lights come on. Lighting: a hemisphere light plus
    4 spotlights at the roof's leading edge (not one light per lamp: forward
    shading cost grows with lights × fragments). The visible "floodlights" are
    emissive strips and instanced lamp quads that bloom.

49. **Cinematic intro on a wall clock (7 s), skippable.** The floodlight
    groups (one per roof segment, order T1, P2, T2, P1) power on in sequence
    while the camera orbits in and settles. Wall clock, not summed frame deltas:
    with software GL at 2 fps, clamped deltas stretched the intro past 2 minutes.
    A tap, click, drag, wheel or pinch skips it, and so does `prefers-reduced-motion`.
    **The tap that skips the intro is swallowed** (a capture-phase click
    listener): otherwise it also selected whatever sector was under it while
    the camera moved. A robustness e2e covers this.

50. **Luminous overview without new geometry.** The seats' instance colours also
    feed `totalEmissiveRadiance × uGlow` through a small `onBeforeCompile`
    patch, so they read as fine light. The structure gets `EdgesGeometry` lines
    (35° threshold), merged into one additive HDR line set per part, with opacity
    following `holo` and `power`. Alternative: a separate "hologram" scene.
    Why: one scene that crossfades costs nothing extra to keep in sync.

51. **The ~40 price pills are gone.** Stand names stay as discreet labels, and
    the sector name and price appear on hover (desktop) and in the sector panel.
    The labels are placed in screen space *outside* the bowl: anchored on the
    roof cornice, pushed away from the bowl's on-screen centre by half their
    own size plus 10 px, clamped to the viewport, and turned along the rim when
    there is no room beside the bowl (phones). An earlier fixed 3D anchor put
    "TRIBUNA II" over its own seats and behind the hint pill, and the end-stand
    names over the video screens.

52. **Three-level flow `overview → sector → seat`, one level back at a time.**
    The chosen (gold) seat survives going back to its sector, so "Alt loc"
    shows it in context. Browser history pushes one entry per level and the
    back gesture pops one level. When going up through the UI we consume the
    entries with `history.go(-n)` and ignore our own popstates (`ownPops`).

53. **Sector focus pose: from over the field, 3/4 view** (22° to the side, 24°
    elevation, FOV 42°, framed to about 78 % of the screen). The camera is
    always on the field side of the roof edge, so no roof gets in the way. Flight
    tests cover overview → focus → seat → focus → overview for every sector,
    on laptop and phone aspect ratios.

54. **Seat picking = an invisible InstancedMesh of boxes for the focused sector
    only** (`material.visible = false` is still raycast; instance i is seat
    `seatStart + i`). Alternatives: GPU colour picking (an extra render
    pass and async read-back), or raycasting all 30,335 detailed seats. Why:
    about 1,000 boxes keep every pointer move cheap, and the result is exact. A
    unit test raycasts from the real focus camera to sampled seats.
    **Touch forgiveness:** a tap that lands on a sold seat takes the nearest
    free seat within 28 px on screen. On a phone a seat is about 8 px wide in
    the sector focus.

55. **Demo availability is its own clearly labelled module (`src/demo/`)** and
    isn't part of the venue config. It is deterministic (seeded mulberry32 plus
    an FNV hash per sector), so screenshots, tests and the live demo agree. Sales
    come in group "bookings" of 1–6 adjacent seats, weighted toward lower rows
    and the centre, and stop at an exact per-sector target between 62 and 73 %.
    Press seats are never for sale.

56. **Seat view is over the shoulder, not at the exact eye point:** 0.85 m
    behind (0.3 m on a last row, against the back wall), 0.3 m higher, looking
    along the seat's facing, 11° down. Alternative: the exact eye point (V1).
    Why: the brief wants your own seat edge, armrests and the backs in front in
    frame. From the eye point your own seat sits under and behind the lens and
    is invisible. The offset is small enough that the view of the pitch is the
    same. The V1 sightline tests keep using the true eye point, and the new
    flight tests use the new pose.

57. **Seat model: three LODs sharing one set of instance buffers.** Far is
    4 triangles, near 20, detail about 70 (pan, lip, back, headrest, armrest,
    post, leg). Detail is used only for the focused sector, and that sector's
    near/far instances are hidden by zeroing their matrices. Why: 30,335 seats ×
    70 triangles would be about 2.1 M triangles for no visible gain at a distance.

58. **Gold means "your seat" and nothing else.** The VIP tier was gold in V1.
    A first recolour to platinum (#dfe3ea) bloomed into a white block in the
    luminous overview, so it is now silver (#b4bfd2), at about the
    luminance of the other tiers. The gold seat's glow and its point light fade
    with camera distance; at 1 m in the seat view full strength blew it out to
    a flat slab.

59. **LED fascia boards: one canvas texture atlas (1024×64 per row) and one
    merged geometry, so one draw call.** The text comes from the config prices
    ("SECTOR 1C · DE LA 150 LEI", "2P · PRESĂ"). It is pre-squeezed horizontally
    per board so long boards don't stretch the letters, and drawn with HDR
    colour that follows `power`, so it blooms slightly and switches on with the lights.

60. **e2e under software WebGL:** stage stills are JPEG q90 (film grain makes
    PNGs about 3.6 MB each). The desktop runs at DPR 1 (1440×900 images) and the
    phone at DPR 2. The rapid-taps test aims and dispatches its taps in the same
    page task (real DOM pointer events, through R3F's raycaster). Why: at
    about 2 fps a point aimed in one frame was stale when Playwright's input
    arrived a frame later. The app wasn't at fault (traced with per-frame timing:
    no single long frame, just 400–500 ms frames). The V1 screenshots are kept in
    `screenshots/v1/`.
