import { Entity, LoadItem, Loader, ResourceManager, resourceLoader } from "@galacean/engine";
import { GaussianSplatting } from "./GaussionSplatting";
import { createWorker } from "./worker";

// @ts-ignore
@resourceLoader("GaussianSplatting", ["splat"])
export class SplatLoader extends Loader<Entity> {
  private reader;
  private splat: GaussianSplatting;
  // @ts-ignore
  load(item: LoadItem, resourceManager: ResourceManager): Promise<Entity> {
    const { engine } = resourceManager;
    const entity = new Entity(engine);
    const splat = entity.addComponent(GaussianSplatting);
    this.splat = splat;

    const { urls } = item;

    return fetch(urls[0], {
      mode: "cors", // no-cors, *cors, same-origin
      credentials: "omit", // include, *same-origin, omit
    }).then(async (req) => {
      const reader = req.body.getReader();
      let splatData = new Uint8Array(req.headers.get("content-length"));
      let bytesRead = 0;
      let lastVertexCount = -1;
      let vertexCount = 0;
      const rowLength = 3 * 4 + 3 * 4 + 4 + 4;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        splatData.set(value, bytesRead);
        bytesRead += value.length;

        if (vertexCount > lastVertexCount) {
          splat.worker.postMessage({
            buffer: splatData.buffer,
            vertexCount: Math.floor(bytesRead / rowLength),
          });
          lastVertexCount = vertexCount;
        }
      }

      splat.worker.postMessage({
        buffer: splatData.buffer,
        vertexCount: Math.floor(bytesRead / rowLength),
      });

      return entity;
    });
  }
}