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
    roof covers ~93 % of seats); remove the roof. Why: the overview has to show
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
