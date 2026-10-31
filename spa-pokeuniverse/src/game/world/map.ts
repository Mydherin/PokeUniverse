// The world's maps as the client gets them: the ClientMap `make maps` compiles from lib-maps
// (maps.md#outputs), the same for every art style. The server decides where the player is.

import { fromBinary } from "@bufbuild/protobuf";
import { ClientMapSchema, type ClientMap } from "@pokeuniverse/contracts/map/v1/map";

/** Map cells are 16×16 pixels in every FireRed-sized art style. */
export const TILE = 16;

export async function loadMap(id: string): Promise<ClientMap> {
  const res = await fetch(`/maps/${id}.binpb`);
  if (!res.ok) throw new Error(`map ${id}: ${res.status}`);
  return fromBinary(ClientMapSchema, new Uint8Array(await res.arrayBuffer()));
}

/** The tile drawn at a cell: the map's own, or its border repeated outside it. */
export function tileAt(map: ClientMap, x: number, y: number): number {
  if (x >= 0 && y >= 0 && x < map.width && y < map.height) return map.tiles[y * map.width + x];
  const w = map.borderWidth;
  const h = map.border.length / w;
  return map.border[mod(y, h) * w + mod(x, w)];
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
