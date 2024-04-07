import { Camera, Logger, Matrix, Vector2, WebGLEngine } from "@galacean/engine";
import { GaussianSplatting } from "./runtime";
import { cameras } from './runtime/cameras';
import { getProjectionMatrix } from "./runtime/math";
import { createWorker } from './runtime/worker';

Logger.enable()

export async function createRuntime() {
	let camera = cameras[0];

	const url = `https://media.reshot.ai/models/nike_next/model.splat`;
	const viewMatrix = [0.95, 0.16, -0.26, 0, -0.16, 0.99, 0.01, 0, 0.26, 0.03, 0.97, 0, 0.01, -1.96, 2.82, 1];

	const req = await fetch(url, {
		mode: "cors", // no-cors, *cors, same-origin
		credentials: "omit", // include, *same-origin, omit
	});

	console.log(req);

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
	const { shaderData } = splat;

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
			splat.setTexture(texdata, texwidth, texheight);
		} else if (e.data.depthIndex) {
			const { depthIndex } = e.data;

			splat.setIndexBuffer(new Float32Array(depthIndex))
			vertexCount = e.data.vertexCount;
		}
	};

	const viewProjMatrix = new Matrix();

	const frame = () => {
		Matrix.multiply(cameraComponent.projectionMatrix, cameraComponent.viewMatrix, viewProjMatrix);
		worker.postMessage({ view: viewProjMatrix.elements });

		if (vertexCount > 0) {
			splat.setInstanceCount(vertexCount)
		}

		requestAnimationFrame(frame);
	};


	let vertexCount = 0;

	let bytesRead = 0;
	let lastVertexCount = -1;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

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

	worker.postMessage({
		buffer: splatData.buffer,
		vertexCount: Math.floor(bytesRead / rowLength),
	});

	frame();
}
