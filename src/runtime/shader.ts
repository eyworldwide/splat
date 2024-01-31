import { Shader } from "@galacean/engine";
import fs from "./fs.glsl";
import vs from "./vs.glsl";

export const shader = Shader.create(
  "CustomShader",
  vs,
  fs
)