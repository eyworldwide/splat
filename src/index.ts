import {
	Camera,
	Logger,
	Matrix,
	Texture2D,
	TextureFormat,
	TextureWrapMode,
	Vector2,
	WebGLEngine
} from "@galacean/engine";

import { cameras } from './runtime/cameras';
import { getProjectionMatrix, getViewMatrix, invert4, multiply4, rotate4, translate4 } from "./runtime/math";
import { createWorker } from './runtime/worker';
import { GaussianSplatting } from "./runtime";

Logger.enable()

export async function createRuntime() {
	let camera = cameras[0];

	let defaultViewMatrix = [
		0.47, 0.04, 0.88, 0, -0.11, 0.99, 0.02, 0, -0.88, -0.11, 0.47, 0, 0.07,
		0.03, 6.55, 1,
	];
	let viewMatrix = defaultViewMatrix;

	async function main() {
		let carousel = true;
		const params = new URLSearchParams(location.search);
		try {
			viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
			carousel = false;
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

		scene.background.solidColor.set(0, 0.0, 0, 0.0);

		// cameraEntity.addComponent(class extends Script {
		// 	onUpdate(deltaTime){
		// 		frame(deltaTime);
		// 	}
		// })

		engine.run();

		let projectionMatrix;


		const entity = rootEntity.createChild("mesh");
		const splat = entity.addComponent(GaussianSplatting);
		const { shaderData, geometry, indexBuffer } = splat;

		const resize = () => {
			shaderData.setVector2("focal", new Vector2(camera.fx, camera.fy));

			projectionMatrix = getProjectionMatrix(
				camera.fx,
				camera.fy,
				innerWidth,
				innerHeight,
			);

			engine.canvas.resizeByClientSize();

			shaderData.setVector2("viewport", new Vector2(innerWidth, innerHeight));

			cameraComponent.projectionMatrix = new Matrix(...projectionMatrix);
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
			let inv = invert4(viewMatrix);
			let shiftKey = activeKeys.includes("Shift") || activeKeys.includes("ShiftLeft") || activeKeys.includes("ShiftRight")

			if (activeKeys.includes("ArrowUp")) {
				if (shiftKey) {
					inv = translate4(inv, 0, -0.03, 0);
				} else {
					inv = translate4(inv, 0, 0, 0.1);
				}
			}
			if (activeKeys.includes("ArrowDown")) {
				if (shiftKey) {
					inv = translate4(inv, 0, 0.03, 0);
				} else {
					inv = translate4(inv, 0, 0, -0.1);
				}
			}
			if (activeKeys.includes("ArrowLeft"))
				inv = translate4(inv, -0.03, 0, 0);
			//
			if (activeKeys.includes("ArrowRight"))
				inv = translate4(inv, 0.03, 0, 0);
			// inv = rotate4(inv, 0.01, 0, 1, 0);
			if (activeKeys.includes("KeyA")) inv = rotate4(inv, -0.01, 0, 1, 0);
			if (activeKeys.includes("KeyD")) inv = rotate4(inv, 0.01, 0, 1, 0);
			if (activeKeys.includes("KeyQ")) inv = rotate4(inv, 0.01, 0, 0, 1);
			if (activeKeys.includes("KeyE")) inv = rotate4(inv, -0.01, 0, 0, 1);
			if (activeKeys.includes("KeyW")) inv = rotate4(inv, 0.005, 1, 0, 0);
			if (activeKeys.includes("KeyS")) inv = rotate4(inv, -0.005, 1, 0, 0);

			const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
			let isJumping = activeKeys.includes("Space");
			for (let gamepad of gamepads) {
				if (!gamepad) continue;

				const axisThreshold = 0.1; // Threshold to detect when the axis is intentionally moved
				const moveSpeed = 0.06;
				const rotateSpeed = 0.02;

				// Assuming the left stick controls translation (axes 0 and 1)
				if (Math.abs(gamepad.axes[0]) > axisThreshold) {
					inv = translate4(inv, moveSpeed * gamepad.axes[0], 0, 0);
					carousel = false;
				}
				if (Math.abs(gamepad.axes[1]) > axisThreshold) {
					inv = translate4(inv, 0, 0, -moveSpeed * gamepad.axes[1]);
					carousel = false;
				}
				if (gamepad.buttons[12].pressed || gamepad.buttons[13].pressed) {
					inv = translate4(inv, 0, -moveSpeed * (gamepad.buttons[12].pressed - gamepad.buttons[13].pressed), 0);
					carousel = false;
				}

				if (gamepad.buttons[14].pressed || gamepad.buttons[15].pressed) {
					inv = translate4(inv, -moveSpeed * (gamepad.buttons[14].pressed - gamepad.buttons[15].pressed), 0, 0);
					carousel = false;
				}

				// Assuming the right stick controls rotation (axes 2 and 3)
				if (Math.abs(gamepad.axes[2]) > axisThreshold) {
					inv = rotate4(inv, rotateSpeed * gamepad.axes[2], 0, 1, 0);
					carousel = false;
				}
				if (Math.abs(gamepad.axes[3]) > axisThreshold) {
					inv = rotate4(inv, -rotateSpeed * gamepad.axes[3], 1, 0, 0);
					carousel = false;
				}

				let tiltAxis = gamepad.buttons[6].value - gamepad.buttons[7].value;
				if (Math.abs(tiltAxis) > axisThreshold) {
					inv = rotate4(inv, rotateSpeed * tiltAxis, 0, 0, 1);
					carousel = false;
				}
				if (gamepad.buttons[4].pressed && !leftGamepadTrigger) {
					camera = cameras[(cameras.indexOf(camera) + 1) % cameras.length]
					inv = invert4(getViewMatrix(camera));
					carousel = false;
				}
				if (gamepad.buttons[5].pressed && !rightGamepadTrigger) {
					camera = cameras[(cameras.indexOf(camera) + cameras.length - 1) % cameras.length]
					inv = invert4(getViewMatrix(camera));
					carousel = false;
				}
				leftGamepadTrigger = gamepad.buttons[4].pressed;
				rightGamepadTrigger = gamepad.buttons[5].pressed;
				if (gamepad.buttons[0].pressed) {
					isJumping = true;
					carousel = false;
				}
				if (gamepad.buttons[3].pressed) {
					carousel = true;
				}
			}

			if (
				["KeyJ", "KeyK", "KeyL", "KeyI"].some((k) => activeKeys.includes(k))
			) {
				let d = 4;
				inv = translate4(inv, 0, 0, d);
				inv = rotate4(
					inv,
					activeKeys.includes("KeyJ")
						? -0.05
						: activeKeys.includes("KeyL")
							? 0.05
							: 0,
					0,
					1,
					0,
				);
				inv = rotate4(
					inv,
					activeKeys.includes("KeyI")
						? 0.05
						: activeKeys.includes("KeyK")
							? -0.05
							: 0,
					1,
					0,
					0,
				);
				inv = translate4(inv, 0, 0, -d);
			}

			viewMatrix = invert4(inv);

			if (carousel) {
				let inv = invert4(defaultViewMatrix);

				const t = Math.sin((Date.now() - start) / 5000);
				inv = translate4(inv, 2.5 * t, 0, 6 * (1 - Math.cos(t)));
				inv = rotate4(inv, -0.6 * t, 0, 1, 0);

				viewMatrix = invert4(inv);
			}

			if (isJumping) {
				jumpDelta = Math.min(1, jumpDelta + 0.05);
			} else {
				jumpDelta = Math.max(0, jumpDelta - 0.05);
			}

			let inv2 = invert4(viewMatrix);
			inv2 = translate4(inv2, 0, -jumpDelta, 0);
			inv2 = rotate4(inv2, -0.1 * jumpDelta, 1, 0, 0);
			let actualViewMatrix = invert4(inv2);

			const viewProj = multiply4(projectionMatrix, actualViewMatrix);
			worker.postMessage({ view: viewProj });

			if (vertexCount > 0) {
				cameraComponent.viewMatrix = new Matrix(...actualViewMatrix);
				geometry.instanceCount = vertexCount;
			} else {
				start = Date.now() + 2000;
			}

			requestAnimationFrame(frame);
		};


		let activeKeys = [];
		let currentCameraIndex = 0;

		window.addEventListener("keydown", (e) => {
			// if (document.activeElement != document.body) return;
			carousel = false;
			if (!activeKeys.includes(e.code)) activeKeys.push(e.code);
			if (/\d/.test(e.key)) {
				currentCameraIndex = parseInt(e.key)
				camera = cameras[currentCameraIndex];
				viewMatrix = getViewMatrix(camera);
			}
			if (['-', '_'].includes(e.key)) {
				currentCameraIndex = (currentCameraIndex + cameras.length - 1) % cameras.length;
				viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
			}
			if (['+', '='].includes(e.key)) {
				currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
				viewMatrix = getViewMatrix(cameras[currentCameraIndex]);
			}
			if (e.code == "KeyV") {
				location.hash =
					"#" +
					JSON.stringify(
						viewMatrix.map((k) => Math.round(k * 100) / 100),
					);
			} else if (e.code === "KeyP") {
				carousel = true;
			}
		});
		window.addEventListener("keyup", (e) => {
			activeKeys = activeKeys.filter((k) => k !== e.code);
		});
		window.addEventListener("blur", () => {
			activeKeys = [];
		});

		window.addEventListener(
			"wheel",
			(e) => {
				carousel = false;
				e.preventDefault();
				const lineHeight = 10;
				const scale =
					e.deltaMode == 1
						? lineHeight
						: e.deltaMode == 2
							? innerHeight
							: 1;
				let inv = invert4(viewMatrix);
				if (e.shiftKey) {
					inv = translate4(
						inv,
						(e.deltaX * scale) / innerWidth,
						(e.deltaY * scale) / innerHeight,
						0,
					);
				} else if (e.ctrlKey || e.metaKey) {
					// inv = rotate4(inv,  (e.deltaX * scale) / innerWidth,  0, 0, 1);
					// inv = translate4(inv,  0, (e.deltaY * scale) / innerHeight, 0);
					// let preY = inv[13];
					inv = translate4(
						inv,
						0,
						0,
						(-10 * (e.deltaY * scale)) / innerHeight,
					);
					// inv[13] = preY;
				} else {
					let d = 4;
					inv = translate4(inv, 0, 0, d);
					inv = rotate4(inv, -(e.deltaX * scale) / innerWidth, 0, 1, 0);
					inv = rotate4(inv, (e.deltaY * scale) / innerHeight, 1, 0, 0);
					inv = translate4(inv, 0, 0, -d);
				}

				viewMatrix = invert4(inv);
			},
			{ passive: false },
		);

		let startX, startY, down;
		canvas.addEventListener("mousedown", (e) => {
			carousel = false;
			e.preventDefault();
			startX = e.clientX;
			startY = e.clientY;
			down = e.ctrlKey || e.metaKey ? 2 : 1;
		});
		canvas.addEventListener("contextmenu", (e) => {
			carousel = false;
			e.preventDefault();
			startX = e.clientX;
			startY = e.clientY;
			down = 2;
		});

		canvas.addEventListener("mousemove", (e) => {
			e.preventDefault();
			if (down == 1) {
				let inv = invert4(viewMatrix);
				let dx = (5 * (e.clientX - startX)) / innerWidth;
				let dy = (5 * (e.clientY - startY)) / innerHeight;
				let d = 4;

				inv = translate4(inv, 0, 0, d);
				inv = rotate4(inv, dx, 0, 1, 0);
				inv = rotate4(inv, -dy, 1, 0, 0);
				inv = translate4(inv, 0, 0, -d);
				// let postAngle = Math.atan2(inv[0], inv[10])
				// inv = rotate4(inv, postAngle - preAngle, 0, 0, 1)
				// console.log(postAngle)
				viewMatrix = invert4(inv);

				startX = e.clientX;
				startY = e.clientY;
			} else if (down == 2) {
				let inv = invert4(viewMatrix);
				// inv = rotateY(inv, );
				// let preY = inv[13];
				inv = translate4(
					inv,
					(-10 * (e.clientX - startX)) / innerWidth,
					0,
					(10 * (e.clientY - startY)) / innerHeight,
				);
				// inv[13] = preY;
				viewMatrix = invert4(inv);

				startX = e.clientX;
				startY = e.clientY;
			}
		});
		canvas.addEventListener("mouseup", (e) => {
			e.preventDefault();
			down = false;
			startX = 0;
			startY = 0;
		});

		let altX = 0,
			altY = 0;
		canvas.addEventListener(
			"touchstart",
			(e) => {
				e.preventDefault();
				if (e.touches.length === 1) {
					carousel = false;
					startX = e.touches[0].clientX;
					startY = e.touches[0].clientY;
					down = 1;
				} else if (e.touches.length === 2) {
					// console.log('beep')
					carousel = false;
					startX = e.touches[0].clientX;
					altX = e.touches[1].clientX;
					startY = e.touches[0].clientY;
					altY = e.touches[1].clientY;
					down = 1;
				}
			},
			{ passive: false },
		);
		canvas.addEventListener(
			"touchmove",
			(e) => {
				e.preventDefault();
				if (e.touches.length === 1 && down) {
					let inv = invert4(viewMatrix);
					let dx = (4 * (e.touches[0].clientX - startX)) / innerWidth;
					let dy = (4 * (e.touches[0].clientY - startY)) / innerHeight;

					let d = 4;
					inv = translate4(inv, 0, 0, d);
					// inv = translate4(inv,  -x, -y, -z);
					// inv = translate4(inv,  x, y, z);
					inv = rotate4(inv, dx, 0, 1, 0);
					inv = rotate4(inv, -dy, 1, 0, 0);
					inv = translate4(inv, 0, 0, -d);

					viewMatrix = invert4(inv);

					startX = e.touches[0].clientX;
					startY = e.touches[0].clientY;
				} else if (e.touches.length === 2) {
					// alert('beep')
					const dtheta =
						Math.atan2(startY - altY, startX - altX) -
						Math.atan2(
							e.touches[0].clientY - e.touches[1].clientY,
							e.touches[0].clientX - e.touches[1].clientX,
						);
					const dscale =
						Math.hypot(startX - altX, startY - altY) /
						Math.hypot(
							e.touches[0].clientX - e.touches[1].clientX,
							e.touches[0].clientY - e.touches[1].clientY,
						);
					const dx =
						(e.touches[0].clientX +
							e.touches[1].clientX -
							(startX + altX)) /
						2;
					const dy =
						(e.touches[0].clientY +
							e.touches[1].clientY -
							(startY + altY)) /
						2;
					let inv = invert4(viewMatrix);
					// inv = translate4(inv,  0, 0, d);
					inv = rotate4(inv, dtheta, 0, 0, 1);

					inv = translate4(inv, -dx / innerWidth, -dy / innerHeight, 0);

					// let preY = inv[13];
					inv = translate4(inv, 0, 0, 3 * (1 - dscale));
					// inv[13] = preY;

					viewMatrix = invert4(inv);

					startX = e.touches[0].clientX;
					altX = e.touches[1].clientX;
					startY = e.touches[0].clientY;
					altY = e.touches[1].clientY;
				}
			},
			{ passive: false },
		);
		canvas.addEventListener(
			"touchend",
			(e) => {
				e.preventDefault();
				down = false;
				startX = 0;
				startY = 0;
			},
			{ passive: false },
		);

		let jumpDelta = 0;
		let vertexCount = 0;

		let start = 0;

		window.addEventListener("gamepadconnected", (e) => {
			const gp = navigator.getGamepads()[e.gamepad.index];
			console.log(
				`Gamepad connected at index ${gp.index}: ${gp.id}. It has ${gp.buttons.length} buttons and ${gp.axes.length} axes.`,
			);
		});
		window.addEventListener("gamepaddisconnected", (e) => {
			console.log("Gamepad disconnected");
		});

		let leftGamepadTrigger, rightGamepadTrigger;
		window.addEventListener("hashchange", (e) => {
			try {
				viewMatrix = JSON.parse(decodeURIComponent(location.hash.slice(1)));
				carousel = false;
			} catch (err) { }
		});

		const preventDefault = (e) => {
			e.preventDefault();
			e.stopPropagation();
		};
		document.addEventListener("dragenter", preventDefault);
		document.addEventListener("dragover", preventDefault);
		document.addEventListener("dragleave", preventDefault);

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


	main().catch((err) => {
		console.error(err.toString());
	});
}
