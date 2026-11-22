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
