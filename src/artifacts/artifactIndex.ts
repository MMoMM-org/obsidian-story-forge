import artifactIndexRaw from "../../dist/artifact-index.json";
import type { ArtifactIndex } from "./artifactTypes";

/**
 * The bundled artifact index, built by `artifacts:build` (scripts/build-artifacts.mjs) from
 * schema/*.json. `set` is inferred as `string` from JSON; the build only ever emits the three
 * ArtifactSet values, so the cast is safe.
 *
 * @ref SDD/ADR-38
 */
export const artifactIndex = artifactIndexRaw as unknown as ArtifactIndex;
