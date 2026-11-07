import type { MessageInitShape } from "@bufbuild/protobuf";
import type {
  MovePokemonSchema,
  ReleasePokemonSchema,
  RenameBoxSchema,
  SetBoxWallpaperSchema,
} from "@pokeuniverse/contracts/party/v1/box";

/** A BILL'S PC action that changes the boxes; mic-core answers each with a BoxView. */
export type BoxAction =
  | { case: "movePokemon"; value: MessageInitShape<typeof MovePokemonSchema> }
  | { case: "releasePokemon"; value: MessageInitShape<typeof ReleasePokemonSchema> }
  | { case: "renameBox"; value: MessageInitShape<typeof RenameBoxSchema> }
  | { case: "setBoxWallpaper"; value: MessageInitShape<typeof SetBoxWallpaperSchema> };
