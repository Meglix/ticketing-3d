# Reference analysis — how the Cluj Arena geometry was derived

Companion to [FACTS.md](FACTS.md). For each stand and ring: what was derived,
from which source, and with what confidence. Anything rated **low** is stored in
`venues/cluj-arena.json` with `"estimated": true` (in practice every sector is
flagged, because no sector boundary or row count could be checked against a plan
or photo).

> **Source limitation.** Direct page fetches and photo viewing were blocked in the
> build environment (see FACTS.md). Everything below comes from search-engine
> excerpts of public pages plus engineering reasoning. **No photograph was viewed.**
> Before showing the demo as "the" Cluj Arena, the checklist in REPORT.md should be
> walked through at the stadium or against the bilete.ro sector map.

## 0. Coordinate frame used everywhere

- Origin = centre spot, at pitch level. `y` is up (metres).
- `x` runs along the pitch's long axis (towards Peluza II / north), `z` across it
  (towards Tribuna II / east). Tribuna I (west) is therefore at `z < 0`.
- The **bowl reference line** is the front edge of the stands (where the arena
  floor meets the lower-ring front wall). Each row is stored as its horizontal
  `distance` from that line. Rows are exact offset curves of the line, so radial
  aisles stay perpendicular to the rows, as they do in a real bowl.
- The reference line is a rounded rectangle. A position along it is the arc
  length `s` (metres), starting at the middle of Tribuna I and increasing
  clockwise when seen from above (towards Peluza II first).

## 1. Overall bowl (all stands)

| Item | Derived value | Source / reasoning | Confidence |
|---|---|---|---|
| Pitch | 105 × 68 m | search excerpts (worldfootball, cluj.com) | high |
| Track | 8 lanes, standard 400 m (R = 36.5 m, straights 84.39 m), outer edge R ≈ 46.3 m + 1 m kerb | brief + World Athletics standard geometry | medium (standard track assumed; sprint-straight extension not modelled) |
| Bowl reference line | rounded rectangle, half-length 92 m, half-width 50 m, corner radius 30 m (perimeter 516.5 m) | smallest "bowl" that keeps ≥ 2.5 m between the track edge and the front wall on the sides/ends and ~8.5 m in the corners (space for jump runways / D-zone equipment) | low |
| Touchline → front row | ≈ 17 m (sides), goal line → front row ≈ 40 m (ends) | consequence of the track | medium |
| Stand split | at the 45° diagonal of each corner arc | the "four frames" description implies four stands meeting at the corners | low |
| Upper ring corner gaps | 5 m of reference line at each corner diagonal (≈ 10 m at the facade) | "spectators see out through the gaps between the four frames" | low |
| Lower ring corners | continuous (aisles only) | "bowl" description; nothing says the lower ring is interrupted | low |
| Roof | four separate cantilever frames over the four stands, gaps at the corners | "four frames" + "steel cantilever trusses on concrete columns" | medium |
| Roof cantilever | 23 m in front of the columns; columns at the back of the upper ring (~24 m from the reference line), so the roof edge is ~1.5 m from the front wall | frame dims (23.07 m cantilever, 30.17 m frame) | medium |
| Roof heights | leading edge ~27 m, cornice 33.6 m, max ~35–36.6 m | heights from excerpt; profile shape estimated | medium |
| Roof cladding | inner ~7 m band translucent polycarbonate, rest opaque aluminium | 4,109 m² of polycarbonate ÷ ~590 m roof perimeter ≈ 7 m | medium |
| Facade | wraps the four frames at ~31 m from the reference line (column + 7.1 m back-span); white/champagne metal strips | excerpts (white-gold woven facade) | medium (look), low (position) |
| Floodlights | 386 fittings in a line along the roof leading edges | excerpt: attached to the roof structure | medium |
| Screens | 2 screens of 12.8 × 5.0 m (64 m²) at the back of the upper ring of each peluza | count/size from excerpt; position estimated | low |
| Seat colour (real) | grey shades | excerpts (low confidence); in the demo seats are coloured by price tier anyway | low |
| Building footprint | ≈ 246 × 162 m | consequence of the above | low |

## 2. Rings (same cross-section in all four stands — an explicit simplification)

The cross-section is calibrated so that (a) the total geometric capacity is a few
per cent above 30,335 (the rest is space lost to vomitories, stairs and camera
positions), (b) the roof's 23 m cantilever covers ~93 % of the seats (excerpt:
"over 28,000 of ~30,200 covered"), and (c) every seat has a sightline C-value
≥ 60 mm to the pitch centre (and in practice to the near touchline).

### Inelul 1 (lower ring)

| Item | Value | Confidence |
|---|---|---|
| Rows | 14 | low |
| Row depth | 0.80 m (UEFA/Green Guide typical minimum) | medium |
| First row | 1.0 m behind the front wall, tread 1.6 m above the track (eye 2.8 m) | low |
| Rake | risers 0.30 → 0.40 m (≈ 20.6° → 26.6°), the usual convex profile; last row 6.15 m | low |
| Front wall | 1.1 m above the first-row tread | low |
| Accessible platform | Tribuna II centre, behind the last row, 32 wheelchair spaces | low (count is sourced, location is not) |
| VIP / business | Tribuna I centre, sectors 1C and 1D, wider seats (0.55 m) — 1,464 seats in total | medium (count sourced, "VIP in Tribuna I" sourced, exact place estimated) |

### Inelul 2 (upper ring)

| Item | Value | Confidence |
|---|---|---|
| Rows | 16 | low |
| Row depth | 0.80 m | medium |
| First row | 10.0 m behind the reference line, tread 11.5 m high, last row 19.1 m. The front fascia (9.4 m) overhangs the lower ring's back wall (12.1 m) by ≈ 2.7 m; VIP boxes / concourse sit underneath | low |
| Rake | risers 0.47 → 0.54 m (≈ 30.4° → 34°; 34° is the usual maximum). Tuned so the near-touchline C-value is ≥ 60 mm (it was 57 mm with 0.45 m front risers) | low |
| Front parapet | 0.8 m above the first-row tread (typical value for a balustrade in front of seated rows) | low |
| Press | narrow sector 2P at the centre of Tribuna I, 168 seats | medium (count sourced, place = the usual press position at the centre of the main stand) |

## 3. Per stand

### Tribuna I (west, main stand, VIP)
- Sectors (both rings): A1, A2, B, C, D, E, F1, F2, running from the south-west
  corner to the north-west corner. Upper ring adds **2P (Presă)** between 2C and 2D.
  `2A1, 2A2, 2B, 2C, 2D` are real codes (2011 price list, excerpt); the rest are
  interpolated by symmetry. **Confidence: medium for names, low for boundaries.**
- Ring 2 prices follow the 2011 list exactly (A1 30, A2 40, B 60, C/D 100); E, F1,
  F2 mirror B, A2, A1.
- Ring 1: 1C/1D = VIP (150 lei), others 25–40 lei (brief: 25–50 lei).

### Tribuna II (east, opposite)
- Sectors K1, K2, L, M1, M2, N, O1, O2 (north-east → south-east). `1M1, 1M2` are
  real (2011 list); `2M2` is the brief's example. **Names medium, boundaries low.**
- Ring 2: 25–40 lei (brief). Ring 1: 20–25 lei (2011 list: 1M1/1M2 25 lei).

### Peluza II (north, behind a goal)
- Sectors G1, G2, H, I, J1, J2 (west → east). **All letters are ESTIMATED.**
- Ring 2: 20 lei (brief). Ring 1: 15 lei (2011 opening match excerpt).

### Peluza I (south, behind a goal)
- Sectors T1, T2, U, V, X, Y (east → west). `1T1 … 1Y` are real (2011 excerpt);
  the intermediate letters are ESTIMATED.
- Prices as Peluza II.

## 4. What I would check first at the stadium (highest impact on the demo)

1. Row counts per ring (drives the whole capacity calibration and the seat view).
2. Whether the upper-ring corners are really open, and how wide the gaps are.
3. Real sector boundaries and letters (the bilete.ro seat map for a "U" home match).
4. Height of the upper ring's first row and the overhang depth (shapes the view
   from the back rows of the lower ring).
5. Roof leading-edge position (which rows are uncovered) and screen positions.

## 5. Calibration results (from `npm run author:cluj` and the test suite)

| Quantity | Result |
|---|---|
| Seats generated | 30,335 (= capacity), 58 sectors |
| Standard seats | 28,671 of 29,892 geometric maximum (95.9 % fill; the rest = vomitories, stairs, wider aisles) |
| VIP / press / wheelchair | 1,464 / 168 / 32 (96.8 % / 95.5 % / 94.1 % of what fits) |
| Per stand (ring 1 + ring 2) | Tribuna I 4,430 + 5,390 · Tribuna II 4,478 + 5,350 (+32 platform) · Peluza II 2,380 + 2,966 · Peluza I 2,379 + 2,930 |
| Min C-value to the pitch centre | ≥ 60 mm for every seat (test-enforced) |
| Min C-value to the nearest touchline | 77 mm (upper ring, Tribuna I front rows); ≥ 60 mm everywhere (test-enforced) |
| Roof vs. top spectator | roof fascia ≥ 3 m above the highest eye (test-enforced) |
