import {
  AmbientLight, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Float32BufferAttribute, Group, Line,
  LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Quaternion, Scene,
  Spherical, SphereGeometry, TorusGeometry, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createCourt, WebGLUnavailableError, type SceneColours } from "../analysis/shot-scene";
import { toScene, type Vec3 } from "../analysis/replay";
import { BONES, HEAD } from "./motion";
import { BASE_FOV, fieldOfView } from "./camera";

/**
 * The live court: court, net, both players' skeletons and the shuttle, seen from a low
 * corner on the broadcast camera's side. Viewers can drag to orbit and pinch to zoom; the
 * mouse wheel is left to the page. Imperative three.js only; `live-court.tsx` decides
 * what to show and when to render.
 */

export type CourtColours = Pick<SceneColours, "court" | "lines" | "net" | "background" | "brand">;

export type Flight = { position: Vec3 | null; trail: Vec3[]; colour: string };
/** A drawn racket, grip to tip, in court metres. */
export type Racket = { grip: Vec3; tip: Vec3 };

export interface CourtScene {
  setPlayers(colours: Record<string, string>): void;
  /** Joints per player (51 values, court metres) or null to hide that player, and each player's drawn racket. */
  setFrame(poses: Record<string, Float32Array | null>, flight: Flight | null, rackets?: Record<string, Racket | null>): void;
  /** Where a player's head is on the canvas, in CSS pixels, or null when hidden. */
  headOnCanvas(player: string): { x: number; y: number } | null;
  orbit(azimuth: number, polar: number): void;
  resetView(): void;
  onChange(listener: () => void): void;
  /** Called once the viewer first moves the camera away from the corner. */
  onMoved(listener: () => void): void;
  render(): void;
  resize(): void;
  dispose(): void;
}

// Low, at the left corner behind the camera-side baseline (scene z grows towards the camera).
const CORNER_POSITION: Vec3 = [-7.4, 2.3, 10.8];
const CORNER_TARGET: Vec3 = [0.4, 0.4, 0.6];
const BONE_RADIUS = 0.035;
const MAX_TRAIL = 256;
// Racket: a thin shaft from the grip, then an oval head (0.23 × 0.29 m) up to the tip.
const SHAFT_LENGTH = 0.39;
const HEAD_HALF_WIDTH = 0.115;
const HEAD_HALF_LENGTH = 0.145;

export function createCourtScene(canvas: HTMLCanvasElement, colours: CourtColours): CourtScene {
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
  const scene = new Scene();
  scene.background = new Color(colours.background);
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 12, 6);
  scene.add(sun);
  const court = keep(createCourt(colours));
  scene.add(court.object);

  // Skeletons: one cylinder per bone and a sphere for the head, moved every frame.
  const boneGeometry = keep(new CylinderGeometry(BONE_RADIUS, BONE_RADIUS, 1, 8));
  const headGeometry = keep(new SphereGeometry(0.11, 16, 12));
  const shaftGeometry = keep(new CylinderGeometry(0.011, 0.011, 1, 6));
  const racketHeadGeometry = keep(new TorusGeometry(HEAD_HALF_WIDTH, 0.009, 6, 32));
  const skeletons = new Map<string, { group: Group; bones: Mesh[]; head: Mesh; shaft: Mesh; racketHead: Mesh }>();
  const grip = new Vector3();
  const tip = new Vector3();
  const up = new Vector3(0, 1, 0);
  const from = new Vector3();
  const to = new Vector3();
  const direction = new Vector3();
  const rotation = new Quaternion();

  function joint(values: Float32Array, index: number, out: Vector3) {
    const [x, y, z] = toScene([values[index * 3], values[index * 3 + 1], values[index * 3 + 2]]);
    return out.set(x, y, z);
  }

  // Shuttle and the current flight's trail.
  const shuttle = new Mesh(keep(new SphereGeometry(0.05, 16, 12)), keep(new MeshBasicMaterial({ color: colours.brand })));
  shuttle.visible = false;
  scene.add(shuttle);
  const trailPositions = new Float32BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3);
  const trailGeometry = keep(new BufferGeometry());
  trailGeometry.setAttribute("position", trailPositions);
  const trailMaterial = keep(new LineBasicMaterial({ color: colours.brand }));
  const trail = new Line(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  scene.add(trail);

  const camera = new PerspectiveCamera(BASE_FOV, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 4;
  controls.maxDistance = 30;
  controls.enablePan = false;
  const listeners: (() => void)[] = [];
  const movedListeners: (() => void)[] = [];
  let moved = false;
  const notify = () => { for (const listener of listeners) listener(); };
  const markMoved = () => {
    if (moved) return;
    moved = true;
    for (const listener of movedListeners) listener();
  };
  controls.addEventListener("change", notify);
  controls.addEventListener("start", markMoved);

  // The wheel scrolls the page and the rally list, never zooms: stop it before OrbitControls
  // sees it (capture on the parent) and leave the default scroll alone. Pinch still zooms.
  const parent = canvas.parentElement;
  const passWheel = (event: WheelEvent) => event.stopPropagation();
  parent?.addEventListener("wheel", passWheel, { capture: true });

  function place(position: Vec3, target: Vec3) {
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
  }
  place(CORNER_POSITION, CORNER_TARGET);

  const api: CourtScene = {
    setPlayers(playerColours) {
      for (const { group } of skeletons.values()) scene.remove(group);
      skeletons.clear();
      for (const [player, colour] of Object.entries(playerColours)) {
        const material = keep(new MeshStandardMaterial({ color: colour }));
        const group = new Group();
        const bones = BONES.map(() => new Mesh(boneGeometry, material));
        const head = new Mesh(headGeometry, material);
        const shaft = new Mesh(shaftGeometry, material);
        const racketHead = new Mesh(racketHeadGeometry, material);
        racketHead.scale.set(1, HEAD_HALF_LENGTH / HEAD_HALF_WIDTH, 1);
        group.add(...bones, head, shaft, racketHead);
        group.visible = false;
        scene.add(group);
        skeletons.set(player, { group, bones, head, shaft, racketHead });
      }
    },
    setFrame(poses, flight, rackets = {}) {
      for (const [player, skeleton] of skeletons) {
        const values = poses[player];
        skeleton.group.visible = Boolean(values);
        if (!values) continue;
        BONES.forEach(([a, b], i) => {
          joint(values, a, from);
          joint(values, b, to);
          direction.subVectors(to, from);
          const length = direction.length();
          const bone = skeleton.bones[i];
          bone.position.addVectors(from, to).multiplyScalar(0.5);
          bone.scale.set(1, Math.max(length, 1e-3), 1);
          bone.quaternion.copy(length > 1e-6 ? rotation.setFromUnitVectors(up, direction.divideScalar(length)) : rotation.identity());
        });
        joint(values, HEAD, skeleton.head.position);
        const racket = rackets[player];
        skeleton.shaft.visible = skeleton.racketHead.visible = Boolean(racket);
        if (racket) {
          grip.set(...toScene(racket.grip));
          tip.set(...toScene(racket.tip));
          direction.subVectors(tip, grip).normalize();
          rotation.setFromUnitVectors(up, direction);
          skeleton.shaft.position.copy(grip).addScaledVector(direction, SHAFT_LENGTH / 2);
          skeleton.shaft.scale.set(1, SHAFT_LENGTH, 1);
          skeleton.shaft.quaternion.copy(rotation);
          skeleton.racketHead.position.copy(grip).addScaledVector(direction, SHAFT_LENGTH + HEAD_HALF_LENGTH);
          skeleton.racketHead.quaternion.copy(rotation);
        }
      }
      shuttle.visible = Boolean(flight?.position);
      if (flight?.position) shuttle.position.set(...toScene(flight.position));
      const points = flight?.trail.slice(-MAX_TRAIL) ?? [];
      points.forEach((point, i) => trailPositions.setXYZ(i, ...toScene(point)));
      trailPositions.needsUpdate = true;
      trailGeometry.setDrawRange(0, points.length);
      if (flight) trailMaterial.color.set(flight.colour);
    },
    headOnCanvas(player) {
      const skeleton = skeletons.get(player);
      if (!skeleton?.group.visible) return null;
      const projected = skeleton.head.position.clone().project(camera);
      if (projected.z > 1) return null;
      return { x: (projected.x + 1) / 2 * canvas.clientWidth, y: (1 - projected.y) / 2 * canvas.clientHeight };
    },
    orbit(azimuth, polar) {
      const offset = camera.position.clone().sub(controls.target);
      const spherical = new Spherical().setFromVector3(offset);
      spherical.theta += azimuth;
      spherical.phi = Math.min(controls.maxPolarAngle, Math.max(0.1, spherical.phi + polar));
      camera.position.copy(controls.target).add(new Vector3().setFromSpherical(spherical));
      controls.update();
      markMoved();
    },
    resetView() {
      place(CORNER_POSITION, CORNER_TARGET);
      moved = false;
      notify();
    },
    onChange(listener) { listeners.push(listener); },
    onMoved(listener) { movedListeners.push(listener); },
    render() { renderer.render(scene, camera); },
    resize() {
      const { clientWidth: width, clientHeight: height } = canvas;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = fieldOfView(camera.aspect);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      parent?.removeEventListener("wheel", passWheel, { capture: true });
      controls.removeEventListener("change", notify);
      controls.removeEventListener("start", markMoved);
      controls.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
    },
  };
  return api;
}
