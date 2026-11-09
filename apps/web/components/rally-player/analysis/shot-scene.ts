import {
  AmbientLight, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute,
  Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, SphereGeometry, Vector3, WebGLRenderer, type Material,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Shot } from "../contract";
import { cameraPreset, toScene, trailIndex, type CameraPreset, type Vec3 } from "./replay";
import { COURT, shuttleAt } from "./shots";

/**
 * The 3D replay of one shot: court, net, the shuttle's measured flight and a camera the
 * viewer can orbit. Imperative three.js only; `shot-stage.tsx` drives it and decides when
 * to render (on demand, so an idle replay costs nothing).
 */

export class WebGLUnavailableError extends Error {
  constructor() { super("WebGL is unavailable"); }
}

export type SceneColours = { brand: string; court: string; lines: string; net: string; background: string };

export interface ShotScene {
  setShot(shot: Shot, hitterColour: string): void;
  setTime(time: number): void;
  setCamera(preset: CameraPreset, animate: boolean): void;
  onChange(listener: () => void): void;
  render(): void;
  resize(): void;
  dispose(): void;
}

const EASE_MS = 450;

function courtLines(): Vec3[] {
  const { width: w, length: l, netY, singlesInset: s, shortService, doublesLongService: d } = COURT;
  const segments: [number, number, number, number][] = [
    [0, 0, 0, l], [w, 0, w, l], [s, 0, s, l], [w - s, 0, w - s, l],
    [w / 2, 0, w / 2, netY - shortService], [w / 2, netY + shortService, w / 2, l],
    ...[0, l, d, l - d, netY - shortService, netY + shortService].map((y): [number, number, number, number] => [0, y, w, y]),
  ];
  // Lift lines a millimetre so they never z-fight with the court surface.
  return segments.flatMap(([x1, y1, x2, y2]) => [toScene([x1, y1, 0.001]), toScene([x2, y2, 0.001])]);
}

function netCrossing(shot: Shot): Vec3 | null {
  if (shot.netClearance === null) return null;
  for (let i = 1; i < shot.path.length; i++) {
    const [, x0, y0, z0] = shot.path[i - 1];
    const [, x1, y1, z1] = shot.path[i];
    if ((y0 - COURT.netY) * (y1 - COURT.netY) <= 0 && y0 !== y1) {
      const f = (COURT.netY - y0) / (y1 - y0);
      return toScene([x0 + f * (x1 - x0), COURT.netY, z0 + f * (z1 - z0)]);
    }
  }
  return null;
}

export function createShotScene(canvas: HTMLCanvasElement, colours: SceneColours): ShotScene {
  if (!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))) throw new WebGLUnavailableError();
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    throw new WebGLUnavailableError();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const material = <T extends Material>(item: T) => keep(item);

  const scene = new Scene();
  scene.background = new Color(colours.background);
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 12, 6);
  scene.add(sun);

  // Court
  const surface = new Mesh(keep(new PlaneGeometry(COURT.width, COURT.length)), material(new MeshStandardMaterial({ color: colours.court })));
  surface.rotation.x = -Math.PI / 2;
  scene.add(surface);
  const linesGeometry = keep(new BufferGeometry().setFromPoints(courtLines().map((p) => new Vector3(...p))));
  scene.add(new LineSegments(linesGeometry, material(new LineBasicMaterial({ color: colours.lines }))));

  // Net: translucent mesh between its bottom and top edges, with two posts.
  const netHeight = COURT.netTop - COURT.netBottom;
  const net = new Mesh(keep(new PlaneGeometry(COURT.width, netHeight)),
    material(new MeshBasicMaterial({ color: colours.net, transparent: true, opacity: 0.35, side: DoubleSide })));
  net.position.set(0, COURT.netBottom + netHeight / 2, 0);
  scene.add(net);
  const netTape = new LineSegments(
    keep(new BufferGeometry().setFromPoints([new Vector3(-COURT.width / 2, COURT.netTop, 0), new Vector3(COURT.width / 2, COURT.netTop, 0)])),
    material(new LineBasicMaterial({ color: colours.lines })),
  );
  scene.add(netTape);
  const postGeometry = keep(new CylinderGeometry(0.02, 0.02, COURT.postTop, 12));
  const postMaterial = material(new MeshStandardMaterial({ color: colours.lines }));
  for (const x of [-COURT.width / 2, COURT.width / 2]) {
    const post = new Mesh(postGeometry, postMaterial);
    post.position.set(x, COURT.postTop / 2, 0);
    scene.add(post);
  }

  // Flight: trail line, live shuttle and markers. Rebuilt per shot.
  const markerGeometry = keep(new SphereGeometry(0.06, 16, 12));
  const shuttle = new Mesh(keep(new SphereGeometry(0.05, 16, 12)), material(new MeshBasicMaterial({ color: colours.brand })));
  scene.add(shuttle);
  let shot: Shot | null = null;
  let trail: Line | null = null;
  let trailPositions: Float32BufferAttribute | null = null;
  let flightObjects: (Mesh | Line)[] = [];
  let flightDisposables: { dispose(): void }[] = [];

  function clearFlight() {
    for (const object of flightObjects) scene.remove(object);
    for (const item of flightDisposables) item.dispose();
    flightObjects = [];
    flightDisposables = [];
    trail = null;
    trailPositions = null;
  }

  function addMarker(at: Vec3, colour: string) {
    const markerMaterial = new MeshBasicMaterial({ color: colour });
    flightDisposables.push(markerMaterial);
    const marker = new Mesh(markerGeometry, markerMaterial);
    marker.position.set(...at);
    scene.add(marker);
    flightObjects.push(marker);
  }

  // Camera and controls
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 3;
  controls.maxDistance = 40;
  const listeners: (() => void)[] = [];
  const notify = () => { for (const listener of listeners) listener(); };
  controls.addEventListener("change", notify);
  let ease = 0;

  function place(position: Vec3, target: Vec3) {
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
  }

  const api: ShotScene = {
    setShot(next, hitterColour) {
      clearFlight();
      shot = next;
      const points = next.path.map(([, x, y, z]) => toScene([x, y, z]));
      if (points.length === 0) return;
      // One spare vertex at the end carries the live shuttle position.
      trailPositions = new Float32BufferAttribute(new Float32Array((points.length + 1) * 3), 3);
      points.forEach((p, i) => trailPositions!.setXYZ(i, ...p));
      const trailGeometry = new BufferGeometry();
      trailGeometry.setAttribute("position", trailPositions);
      const trailMaterial = new LineBasicMaterial({ color: hitterColour });
      flightDisposables.push(trailGeometry, trailMaterial);
      trail = new Line(trailGeometry, trailMaterial);
      trail.frustumCulled = false;
      scene.add(trail);
      flightObjects.push(trail);
      addMarker(toScene(next.contact), hitterColour);
      addMarker(toScene(next.end), colours.lines);
      const apex = points.reduce((high, p) => (p[1] > high[1] ? p : high), points[0]);
      addMarker(apex, colours.brand);
      const crossing = netCrossing(next);
      if (crossing) addMarker(crossing, colours.net);
    },
    setTime(time) {
      if (!shot || !trail || !trailPositions || shot.path.length === 0) return;
      const passed = trailIndex(shot, time);
      const last = shot.path.at(-1)!;
      const at = shuttleAt(shot, time) ?? (passed === 0 ? shot.path[0].slice(1) : last.slice(1));
      const position = toScene(at);
      shuttle.position.set(...position);
      trailPositions.setXYZ(passed, ...position);
      trailPositions.needsUpdate = true;
      trail.geometry.setDrawRange(0, passed + 1);
    },
    setCamera(preset, animate) {
      const { position, target } = cameraPreset(preset, shot ?? ({ contact: [3.05, 2, 1], end: [3.05, 11, 0], hitterEnd: "far" } as Shot));
      cancelAnimationFrame(ease);
      if (!animate) {
        place(position, target);
        notify();
        return;
      }
      const fromPosition = camera.position.clone();
      const fromTarget = controls.target.clone();
      const toPosition = new Vector3(...position);
      const toTarget = new Vector3(...target);
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / EASE_MS);
        const eased = 1 - (1 - t) ** 3;
        camera.position.lerpVectors(fromPosition, toPosition, eased);
        controls.target.lerpVectors(fromTarget, toTarget, eased);
        controls.update();
        notify();
        if (t < 1) ease = requestAnimationFrame(step);
      };
      ease = requestAnimationFrame(step);
    },
    onChange(listener) { listeners.push(listener); },
    render() { renderer.render(scene, camera); },
    resize() {
      const { clientWidth: width, clientHeight: height } = canvas;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      cancelAnimationFrame(ease);
      controls.removeEventListener("change", notify);
      controls.dispose();
      clearFlight();
      for (const item of disposables) item.dispose();
      renderer.dispose();
    },
  };
  return api;
}
