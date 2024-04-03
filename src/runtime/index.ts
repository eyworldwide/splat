import { Loader } from "@galacean/engine";
import { GaussianSplatting } from "./GaussionSplatting";

export { SplatLoader } from "./Loader";
export { GaussianSplatting };

Loader.registerClass("GaussianSplatting", GaussianSplatting);