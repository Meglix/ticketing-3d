/**
 * Output types of the geometry generator: the contract between the pure
 * geometry code (no three.js) and the renderer / camera / UI.
 *
 * Coordinate frame (metres): origin = centre spot at pitch level, y up,
 * x along the pitch's long axis, z across it. Plan vectors use {x, z}.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Seat {
  /** Stable id, e.g. "2M2-R7-S15". */
  id: string;
  /** Stand id from the config, e.g. "T2". */
  stand: string;
  /** Ring number (1 = lowest). */
  ring: number;
  /** Sector code, e.g. "2M2". */
  sector: string;
  row: number;
  seat: number;
  /** Centre of the seat footprint, y = elevation of the row's tread. */
  position: Vec3;
  /** Unit plan vector the spectator faces (towards the field). */
  facing: Vec2;
}

export type SectorCategory = 'standard' | 'vip' | 'press' | 'accessible';

export interface SectorInfo {
  code: string;
  name: string;
  standId: string;
  standName: string;
  ring: number;
  ringName: string;
  tierId: string;
  category: SectorCategory;
  estimated: boolean;
  /** Seats of this sector are manifest.seats[seatStart .. seatEnd-1] (contiguous). */
  seatStart: number;
  seatEnd: number;
  rowCount: number;
  /** Index into manifest.seats of the seat the camera flies to. */
  representativeSeat: number;
  /** Point above the sector where its label is drawn. */
  labelAnchor: Vec3;
}

export interface SeatManifest {
  venueId: string;
  seats: Seat[];
  sectors: SectorInfo[];
}

/** Indexed triangle mesh as plain arrays (the renderer wraps it in a BufferGeometry). */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** A straight structural member (truss chord, column, rib) drawn as a box. */
export interface Beam {
  from: Vec3;
  to: Vec3;
  /** Size across the beam: width is horizontal, height is vertical-ish. */
  width: number;
  height: number;
}

export interface Floodlight {
  position: Vec3;
  /** Point the fitting is aimed at. */
  target: Vec3;
}

export interface ScreenPlacement {
  center: Vec3;
  /** Unit plan vector the screen face points to. */
  facing: Vec2;
  width: number;
  height: number;
}

export interface StructureData {
  /**
   * Closed solid of each sector (parapet, stepped treads/risers, back wall,
   * underside, end caps), keyed by sector code. Also the tap target.
   */
  sectorSurfaces: Record<string, MeshData>;
  roof: {
    /** Opaque (aluminium) part of the roof skin. */
    opaque: MeshData;
    /** Translucent (polycarbonate) band along the leading edge. */
    translucent: MeshData;
    trusses: Beam[];
    columns: Beam[];
  };
  facade: MeshData;
  floodlights: Floodlight[];
  screens: ScreenPlacement[];
  /** Plan half-extents and max height of everything built, for camera framing. */
  bounds: { halfLength: number; halfWidth: number; height: number };
}
