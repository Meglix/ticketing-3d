/**
 * Scene colours in one place so the look can be tuned without hunting
 * through components. Price-tier colours come from the venue config.
 */
export const PALETTE = {
  concrete: '#d3cfc6',
  concreteHover: '#e7e3d9',
  steel: '#e4e7ea',
  roofSkin: '#f1f2f0',
  polycarbonate: '#e3eef5',
  facade: '#e3d8be', // white with a champagne / gold cast
  facadeFin: '#f3ede0',
  column: '#bcb7ad',
  grassLight: '#55a04a',
  grassDark: '#47903d',
  infield: '#4d9144',
  line: '#f7f7f2',
  track: '#b9533a', // terracotta tartan
  trackLine: '#f4efe8',
  apron: '#a04d38',
  ground: '#93a183',
  plaza: '#cbc7bd',
  skyTop: '#3674c4',
  skyHorizon: '#d9e3ec',
  hillsNear: '#6c8868',
  hillsFar: '#97aaab',
  buildings: '#ddd8cf',
  floodlight: '#fff4d6',
  screenFrame: '#1d2430',
  /** Colour other sectors' seats are pulled towards while a sector is selected. */
  dimTarget: '#b3b7bd',
} as const;
