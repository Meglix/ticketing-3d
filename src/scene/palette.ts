/**
 * Scene colours in one place so the look can be tuned without hunting
 * through components. Price-tier colours come from the venue config.
 */
export const PALETTE = {
  grassLight: '#55a04a',
  grassDark: '#47903d',
  line: '#f7f7f2',
  track: '#b9533a', // terracotta tartan
  trackLine: '#f4efe8',
  apron: '#a04d38',
  screenFrame: '#1d2430',

  // --- V2 night look ---------------------------------------------------------
  /** Concrete in the luminous overview: nearly black, the edges carry the shape. */
  holoConcrete: '#06080d',
  /** Concrete close up at night (lit by the floodlights). */
  nightConcrete: '#2b2c30',
  /** Cool glow of the structure lines. */
  holoLine: '#8fb4ff',
  /** Night roof (dark aluminium) and facade. */
  nightRoof: '#2b2e34',
  nightFacade: '#24252a',
  /** Seats that are sold (sector focus). */
  sold: '#2a2e36',
  /** The selected seat. */
  gold: '#f5c542',
} as const;
