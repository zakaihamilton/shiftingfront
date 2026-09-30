import { initAtlasBake, bakeAtlasRowSlice, finalizeAtlasBake } from "./terrainAtlasBake";
import type { AtlasWorld } from "./terrainMaterials";

const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (value: unknown, transfers: Transferable[]) => void;
};
let generation = 0;
scope.onmessage = ({ data }) => {
  const token = ++generation;
  if (data.type === "cancel") return;
  void (async () => {
    try {
      const context = initAtlasBake(data.world as AtlasWorld, data.grainGeneration);
      while (context.currentRow < context.rows) {
        if (token !== generation) return;
        bakeAtlasRowSlice(context, 4);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (token !== generation) return;
      const atlas = finalizeAtlasBake(context);
      scope.postMessage({ id: data.id, generation: data.generation, atlas }, [atlas.data.buffer as ArrayBuffer, atlas.waterCells.buffer as ArrayBuffer]);
    } catch {
      scope.postMessage({ id: data.id, generation: data.generation, error: true }, []);
    }
  })();
};
