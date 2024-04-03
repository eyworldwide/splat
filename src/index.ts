import {
	Camera,
	Logger,
	Matrix,
	Quaternion,
	Texture2D,
	TextureFormat,
	TextureWrapMode,
	Vector2,
	Vector3,
	WebGLEngine
} from "@galacean/engine";

import { cameras } from './runtime/cameras';
import { getProjectionMatrix, getViewMatrix, invert4, multiply4, rotate4, translate4 } from "./runtime/math";
import { createWorker } from './runtime/worker';
import { GaussianSplatting } from "./runtime";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

Logger.enable()

export async function createRuntime() {
	let camera = cameras[0];

	let defaultViewMatrix = [
		0.47, 0.04, 0.88, 0, -0.11, 0.99, 0.02, 0, -0.88, -0.11, 0.47, 0, 0.07,
		0.03, 6.55, 1,
	];
	let viewMatrix = defaultViewMatrix;

	async function main() {
		const params = new URLSearchParams(location.search);
		try {
			viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
		} catch (err) { }
		const url = new URL(
			// "nike.splat",
			// location.href,
			params.get("url") || "train.splat",
			"https://huggingface.co/cakewalk/splat-data/resolve/main/",
		);
		const req = await fetch(url, {
			mode: "cors", // no-cors, *cors, same-origin
			credentials: "omit", // include, *same-origin, omit
		});
		console.log(req);
		if (req.status != 200)
			throw new Error(req.status + " Unable to load " + req.url);

		const reader = req.body.getReader();
		let splatData = new Uint8Array(req.headers.get("content-length"));

		const rowLength = 3 * 4 + 3 * 4 + 4 + 4;

		const worker = new Worker(
			URL.createObjectURL(
				new Blob(["(", createWorker.toString(), ")(self)"], {
					type: "application/javascript",
				}),
			),
		);

		const engine = await WebGLEngine.create({
			canvas: "canvas",
			graphicDeviceOptions: {
				alpha: true
			}
		});

		const canvas = engine.canvas._webCanvas;
		const scene = engine.sceneManager.activeScene;
		const rootEntity = scene.createRootEntity();

		const cameraEntity = rootEntity.createChild("camera");
		const cameraComponent = cameraEntity.addComponent(Camera);
		cameraComponent.enableFrustumCulling = false;

		let projectionMatrix = getProjectionMatrix(
			camera.fx,
			camera.fy,
			innerWidth,
			innerHeight,
		);

		cameraComponent.projectionMatrix = new Matrix(...projectionMatrix);
		const worldMatrix = new Matrix();
		Matrix.invert(new Matrix(...viewMatrix), worldMatrix);
		cameraEntity.transform.worldMatrix = worldMatrix;

		// const position = cameraEntity.transform.position;

		// const orbitControl = cameraEntity.addComponent(OrbitControl);

		// const direction = new Vector3(-worldMatrix[8], -worldMatrix[9], -worldMatrix[10]);
		// Vector3.normalize(direction, direction);
		// Vector3.multiply(direction, new Vector3(100, 100, 100), direction);

		// const target = new Vector3();
		// Vector3.add(position, direction, target);
		// orbitControl.target = target;

		scene.background.solidColor.set(0, 0.0, 0, 0.0);

		engine.run();

		const entity = rootEntity.createChild("mesh");
		const splat = entity.addComponent(GaussianSplatting);
		const { shaderData, geometry, indexBuffer } = splat;

		const resize = () => {
			shaderData.setVector2("focal", new Vector2(camera.fx, camera.fy));
			shaderData.setVector2("viewport", new Vector2(innerWidth, innerHeight));

			engine.canvas.resizeByClientSize();
		};

		window.addEventListener("resize", resize);
		resize();


		worker.onmessage = (e) => {
			if (e.data.buffer) {
				splatData = new Uint8Array(e.data.buffer);
				const blob = new Blob([splatData.buffer], {
					type: "application/octet-stream",
				});
				const link = document.createElement("a");
				link.download = "model.splat";
				link.href = URL.createObjectURL(blob);
				document.body.appendChild(link);
				link.click();
			} else if (e.data.texdata) {
				const { texdata, texwidth, texheight } = e.data;

				const texture = new Texture2D(engine, texwidth, texheight, TextureFormat.R32G32B32A32_UInt, false);
				texture.setPixelBuffer(texdata);
				texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;

				shaderData.setTexture("u_texture", texture);

			} else if (e.data.depthIndex) {
				const { depthIndex } = e.data;

				// debugger;
				indexBuffer.setData(new Float32Array(depthIndex));
				vertexCount = e.data.vertexCount;
			}
		};

		const frame = () => {
			const viewProjMatrix = new Matrix();
			Matrix.multiply(cameraComponent.projectionMatrix, cameraComponent.viewMatrix, viewProjMatrix);
			worker.postMessage({ view: viewProjMatrix.elements });

			if (vertexCount > 0) {
				geometry.instanceCount = vertexCount;
			} else {
				start = Date.now() + 2000;
			}

			requestAnimationFrame(frame);
		};


		let vertexCount = 0;

		let start = 0;


		let bytesRead = 0;
		let lastVertexCount = -1;
		let stopLoading = false;

		while (true) {
			const { done, value } = await reader.read();
			if (done || stopLoading) break;

			splatData.set(value, bytesRead);
			bytesRead += value.length;

			if (vertexCount > lastVertexCount) {
				worker.postMessage({
					buffer: splatData.buffer,
					vertexCount: Math.floor(bytesRead / rowLength),
				});
				lastVertexCount = vertexCount;
			}
		}
		if (!stopLoading) {
			worker.postMessage({
				buffer: splatData.buffer,
				vertexCount: Math.floor(bytesRead / rowLength),
			});
		}

		frame();
	}


	main()
}
