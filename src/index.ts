import { Camera, Entity, Logger, Matrix, Vector2, WebGLEngine } from "@galacean/engine";
import { GaussianSplatting } from "./runtime";
import { cameras } from './cameras';
import { getProjectionMatrix } from "./runtime/math";

Logger.enable()

export async function createRuntime() {
	let camera = cameras[0];

	const url = `https://media.reshot.ai/models/nike_next/model.splat`;
	const viewMatrix = [0.95, 0.16, -0.26, 0, -0.16, 0.99, 0.01, 0, 0.26, 0.03, 0.97, 0, 0.01, -1.96, 2.82, 1];

	const engine = await WebGLEngine.create({
		canvas: "canvas",
		graphicDeviceOptions: {
			alpha: true
		}
	});

	const scene = engine.sceneManager.activeScene;
	scene.background.solidColor.set(0, 0.0, 0, 0.0);
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

	engine.run();

	const entity = await engine.resourceManager.load<Entity>({urls: [url], type: "GaussianSplatting"})

	rootEntity.addChild(entity);

	const splat = entity.getComponent(GaussianSplatting);
	splat.camera = cameraComponent;

	const { shaderData } = splat;

	const resize = () => {
		shaderData.setVector2("focal", new Vector2(camera.fx, camera.fy));
		shaderData.setVector2("viewport", new Vector2(innerWidth, innerHeight));

		engine.canvas.resizeByClientSize();
	};

	window.addEventListener("resize", resize);
	resize();
}
