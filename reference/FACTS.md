# Cluj Arena — facts used by the demo

Every fact the 3D demo depends on, labelled:

- **VERIFIED** — stated in the task brief and/or found in a public source with a URL.
- **ESTIMATED** — not found in any reachable source; derived by reasoning (explained).

## How the research was done (read this first)

The research environment blocks direct page fetches to every reference host
(`en/ro.wikipedia.org`, `commons.wikimedia.org`, `stadiumdb.com`,
`stadiumguide.com`, `archdaily.com`, `dicositiganas.ro`, `e-architect.com`,
`structurae.net` all failed with DNS `ENOTFOUND`; only package registries are
reachable). The only working research tool was a **web search engine that returns
short excerpts of pages**. So:

- *Evidence = "brief"*: given in the task brief as a known fact.
- *Evidence = "search excerpt"*: the search engine attributed the statement to the
  URL shown. I could not open the page itself, so the wording may be a summary.
  Treat these as strong hints, not as a read-and-checked primary source.
- No photo was viewed, downloaded or embedded. Visual properties (roof shape, seat
  colours, corner gaps) come from text descriptions, so they carry lower confidence.

## Venue identity

| Fact | Value | Status | Evidence / source |
|---|---|---|---|
| Name | Cluj Arena | VERIFIED | brief |
| Type | Football stadium with athletics track | VERIFIED | brief |
| Home club | FC Universitatea Cluj ("U" Cluj) | VERIFIED | brief; search excerpt https://stadiumdb.com/stadiums/rou/cluj_arena |
| Owner | Cluj County Council (Consiliul Județean Cluj) | VERIFIED | brief |
| Opened | 2011 (inauguration 1 Oct 2011) | VERIFIED | brief; search excerpt https://stadiumdb.com/stadiums/rou/cluj_arena |
| Location | 46.76833 N, 23.57222 E (Cluj-Napoca, Romania) | VERIFIED | brief |
| Architects | Dico și Țigănaș | VERIFIED | search excerpt https://dicositiganas.ro/portofolio/sport-leisure/cluj-arena/ , https://www.archdaily.com/210638/cluj-arena-dico-si-tiganas |
| Ticketing | bilete.ro | VERIFIED | brief; search excerpt https://www.bilete.ro/abonamente-fc-universitatea-cluj/ |

## Capacity

| Fact | Value | Status | Evidence / source |
|---|---|---|---|
| Total capacity used | **30,335** | VERIFIED | brief; search excerpt https://stadiumdb.com/stadiums/rou/cluj_arena |
| Other published totals | 30,020 / 30,201 / 30,355 / 30,596 | VERIFIED (that sources disagree) | search excerpts: stadiumguide.com, worldfootball.net, en.wikipedia.org, tfcstadiums.com |
| VIP / business seats | 1,464 | VERIFIED | brief; search excerpt stadiumdb.com |
| Press seats | 168 | VERIFIED | brief; search excerpt stadiumdb.com |
| Disabled (wheelchair) places | 32 | VERIFIED | brief; search excerpt stadiumdb.com |
| Covered seats | "over 28,000 of ~30,200 covered" | VERIFIED (excerpt) | search excerpt https://www.revistaconstructiilor.eu/index.php/2013/03/04/cluj-arena/ (and https://geplast.ro/montajul-invelitorii-cluj-arena-cu-policarbonat-marlon-st/) |
| "Not all seats are covered" | — | VERIFIED (excerpt) | search excerpt https://stadiumdb.com/stadiums/rou/cluj_arena |
| VIP boxes | 20 boxes (loje), 9–20 seats each, in Tribuna I | VERIFIED (excerpt, pre-opening) | search excerpt https://www.stiridecluj.ro/politic/cluj-arena-va-avea-20-de-loje-vip-care-vor-avea-intre-9-si-20-de-locuri-vezi-cum-vor-arata |
| VIP / press level | 1st floor, centre of Tribuna I (west); boxes on 3rd floor of Tribuna I | VERIFIED (excerpt, pre-opening) | search excerpt https://www.monitorulcj.ro/politica-administratie/6405-sala-de-conferinte-moderna-si-loje-vip-pe-cluj-arena |

## Layout and naming

| Fact | Value | Status | Evidence / source |
|---|---|---|---|
| Seating rings | Inelul 1 (inferior, lower) and Inelul 2 (superior, upper) | VERIFIED | brief; search excerpt https://www.prosport.ro/fotbal-intern/liga-1/preturi-mici-la-inaugurarea-cluj-arena-cat-costa-sa-ii-vezi-pe-superdanco-si-stadiul-lucrarilor-la-stadion-8807382 |
| Stands | Tribuna I (main, VIP), Tribuna II (opposite), Peluza I, Peluza II (behind goals) | VERIFIED | brief |
| Four two-tier stands, bowl | "four two-tiered stands"; "bowl shape is the outcome of plot restrictions" | VERIFIED (excerpt) | search excerpts en.wikipedia.org/wiki/Cluj_Arena, stadiumdb.com |
| Tribuna I faces | West side ("tribuna unu-vest") | VERIFIED (excerpt) | search excerpt monitorulcj.ro (VIP article above) |
| Peluza I / II | Peluza I = Sud (south), Peluza II = Nord (north) | VERIFIED (excerpt) | search excerpt (stadium guide aggregator, see REFERENCE_ANALYSIS.md §1) |
| Sector code format | ring digit + letter (+ index), e.g. `2M2` | VERIFIED | brief |
| Real sector codes seen | `2A1, 2A2, 2B, 2C, 2D` (Tribuna I, ring 2); `1M1, 1M2` (Tribuna II); `1Y … 1T1` (Peluza I) | VERIFIED (excerpt, 2011 price list) | search excerpt https://www.sport.ro/superliga/u-cluj-a-anuntat-pretul-biletelor-pentru-inaugurarea-cluj-arena-cat-costa-sa-vezi-meciul-cu-echipa-lui.html |
| All other sector codes / boundaries | see config | ESTIMATED | letters interpolated to be consistent with the real examples above |
| Gaps between the "four frames" | spectators see the city through gaps between the four frames | VERIFIED (excerpt) | search excerpts https://archinect.com/dicositiganas/project/cluj-arena , https://architizer.com/projects/cluj-arena/ |

## Field of play

| Fact | Value | Status | Evidence / source |
|---|---|---|---|
| Pitch | 105 m × 68 m, natural grass, heated | VERIFIED (excerpt) | search excerpts https://www.worldfootball.net/stadiums/ve3391/cluj-arena/ , https://cluj.com/locatii/cluj-arena/ |
| Athletics track | IAAF-accredited, 8 lanes | VERIFIED | brief; search excerpt https://www.monitorulcj.ro/politica-administratie/7229-cluj-arena-singurul-stadion-din-tara-cu-pista-de-atletism-in-interior-vezi-cum-va-arata |
| Track geometry | 400 m standard track: bend radius 36.50 m, straights 84.39 m, lane 1.22 m | ESTIMATED | an IAAF-accredited track uses the World Athletics standard 400 m geometry; not measured on site |
| Pitch orientation | long axis north–south | ESTIMATED | follows from Tribuna I = west and Peluze = north/south |

## Structure, roof, facade

| Fact | Value | Status | Evidence / source |
|---|---|---|---|
| Max height / cornice | 36.60 m max, 33.60 m to cornice | VERIFIED (excerpt) | search excerpt (structural/tech summary; see https://www.researchgate.net/publication/234081354_Cluj_Arena_Structural_Analysis_and_Design) |
| Roof structure | steel cantilever trusses fixed on reinforced-concrete columns (1.20 × 0.80 m) | VERIFIED (excerpt) | search excerpts https://www.researchgate.net/publication/341179345_The_Steel_Structure_for_the_Roof_of_the_City_Stadium_of_Cluj-Napoca , https://structurae.net/en/structures/cluj-arena |
| Roof frame (design stage) | cantilever 23.07 m, frame 30.17 m, column 29.13 m, spacing 10 m, truss depth ~6 m | VERIFIED (excerpt, design-stage paper) | search excerpt https://www.researchgate.net/publication/234081344_Conceptual_structural_solutions_for_the_resistence_of_the_stadium_roof |
| Roof cladding | 24,168 m² envelope: 4,109 m² polycarbonate (translucent) + 20,059 m² aluminium strips | VERIFIED (excerpt) | search excerpts https://www.revistaconstructiilor.eu/index.php/2013/03/04/cluj-arena/ , https://geplast.ro/montajul-invelitorii-cluj-arena-cu-policarbonat-marlon-st/ |
| Facade | perforated/woven metal, white with gold iridescence, gaps between sheets | VERIFIED (excerpt) | search excerpts https://archinect.com/dicositiganas/project/cluj-arena , https://www.hunterdouglasarchitectural.com/referenceprojects/article.jsp?pId=8a81c11334109dfe0134330ab706022c |
| Floodlights | 386 fittings attached to the roof steel structure (no masts) | VERIFIED (excerpt) | search excerpt (Romanian venue guides, e.g. https://regionis.wansait.com/transilvania/cluj-transilvania/cluj-arena-stadionul-din-cluj-date-esentiale/) |
| Giant screens | two screens, each ≥ 60 m² | VERIFIED (excerpt, construction-stage) | search excerpt https://www.prosport.ro/?p=8273116 |
| Seat colour | grey, "in different shades of grey" | VERIFIED (excerpt, low confidence) | search excerpts https://beturi.ro/stiri-sport/totul-despre-cluj-arena/ , https://cluj.com/locatii/cluj-arena/ |

## Prices (DEMO tiers only)

| Fact | Value | Status | Evidence / source |
|---|---|---|---|
| Upper ring, Tribuna I | 30–100 lei (2A1 30, 2A2 40, 2B 60, 2C/2D 100) | VERIFIED (historical) | brief; search excerpt sport.ro 2011 list |
| Upper ring, Tribuna II | 25–40 lei | VERIFIED (historical) | brief |
| Peluze (upper) | 20 lei | VERIFIED (historical) | brief |
| Lower ring, Tribuna I | 25–50 lei | VERIFIED (historical) | brief |
| Lower ring, Peluze | 15 lei | VERIFIED (excerpt, 2011) | search excerpt https://www.prosport.ro/... (opening match: "15 lei for the lower-ring terrace") |
| Lower ring, Tribuna II | 20–25 lei (1M1/1M2 25 lei) | VERIFIED (excerpt, 2011) / ESTIMATED for corners | search excerpt sport.ro 2011 list |
| VIP | 150 lei | ESTIMATED | 2026 derby excerpt lists VIP A 100 / VIP B 120 lei; rounded up for a single demo tier |
| **All prices in the demo** | labelled "prețuri demo" | — | historical structure only, not current prices |

## Geometry (all ESTIMATED — see REFERENCE_ANALYSIS.md for the reasoning)

| Value used | Status | Short reason |
|---|---|---|
| Bowl inner edge: rounded rectangle 184 × 100 m, corner radius 30 m | ESTIMATED | must enclose the 8-lane track with ≥ 2.5 m clearance; corners rounded ("bowl") |
| Lower ring: 14 rows, 0.80 m treads, rake 21°→27°, first row 1.6 m above the track | ESTIMATED | capacity budget + standard tread depth + sightline C-value ≥ 60 mm |
| Wheelchair platform (32 spaces) at pitch level in front of Tribuna II | ESTIMATED | count sourced; position chosen (common in bowls with a track) |
| Upper ring: 16 rows, 0.80 m treads, rake 30°→34°, first row 11.5 m up, ≈ 2.7 m overhang over the lower ring | ESTIMATED | capacity budget; roof cantilever (23 m) must cover ~93 % of seats; touchline C-value ≥ 60 mm |
| Seat width 0.50 m (VIP 0.55 m, wheelchair space 0.90 m) | ESTIMATED | UEFA/Green Guide typical values |
| Roof: 4 separate cantilever frames, 5 m (reference-line) gaps at corner diagonals | ESTIMATED | "four frames" + "gaps" excerpts; exact gap width unknown |
| Roof edge ~27 m high, ~23 m cantilever; inner 7 m band translucent | ESTIMATED | from frame dimensions and the polycarbonate area / perimeter ratio |
| Screen positions | ESTIMATED | number and size sourced; position unknown |
