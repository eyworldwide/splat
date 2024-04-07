import { BlendFactor, BlendOperation, Buffer, BufferBindFlag, BufferMesh, BufferUsage, CullMode, Material, MeshRenderer, MeshTopology, Script, ShaderData, Texture2D, TextureFormat, TextureWrapMode, VertexBufferBinding, VertexElement, VertexElementFormat } from "@galacean/engine";
import { shader } from "./shader";

export class GaussianSplatting extends Script {
  shaderData: ShaderData;
  private geometry: BufferMesh;
  private indexBuffer: Buffer;

  onAwake(): void {
    const meshRenderer = this.entity.addComponent(MeshRenderer);
    const { engine } = this;

    const geometry = new BufferMesh(this.engine, "CustomGeometry");
    meshRenderer.mesh = geometry;

    const material = new Material(this.engine, shader);
    meshRenderer.setMaterial(material);
    material.renderState.rasterState.cullMode = CullMode.Off;

    const shaderData = material.shaderData;
    const renderState = material.renderState;
    const blendState = renderState.blendState;
    const target = blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.OneMinusDestinationAlpha;
    target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.One;
    target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;

    const depthState = renderState.depthState;
    depthState.enabled = false;

    const vertices: Float32Array = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);

    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      vertices,
      BufferUsage.Static
    );

    const vertexBufferBinding = new VertexBufferBinding(vertexBuffer, 0);

    const indexDataLength = 270491 * 4
    const indexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      indexDataLength,
      BufferUsage.Dynamic
    );

    const indexBufferBinding = new VertexBufferBinding(indexBuffer, 0);

    geometry.setVertexElements([
      new VertexElement("position", 0, VertexElementFormat.Vector2, 0),
      new VertexElement("index", 0, VertexElementFormat.Float, 1, 1),
    ]);

    geometry.setVertexBufferBindings(([vertexBufferBinding, indexBufferBinding]));

    geometry.addSubMesh(0, 4, MeshTopology.TriangleFan);


    this.shaderData = shaderData;
    this.geometry = geometry;
    this.indexBuffer = indexBuffer;
  }

  setTexture(texdata: ArrayBufferView, width: number, height: number) {
    const texture = new Texture2D(this.engine, width, height, TextureFormat.R32G32B32A32_UInt, false);
    texture.setPixelBuffer(texdata);
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;

    this.shaderData.setTexture("u_texture", texture);
  }

  setInstanceCount(count: number) {
    this.geometry.instanceCount = count;
  }

  setIndexBuffer(buffer: ArrayBufferView) {
    this.indexBuffer.setData(buffer);
  }
}