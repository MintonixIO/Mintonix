/*
 * The hero's 3D court: reconstructed player poses, rackets and shuttle flight for
 * one rally at a time, drawn with three.js and rotated by dragging.
 * Motion files come from RESEARCH/scripts/export_hero.py: centimetres on the court,
 * x across (0..610), y along (0..1340), z up. three.js uses y up, so (x, y, z) → (x, z, y).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

export type Sample = { f: number; a?: number[]; b?: number[]; ar?: number[]; br?: number[]; s?: number[] };
export type RallyMotion = { fps: number; samples: Sample[] };

type Track = { pose: (Float32Array | undefined)[]; racket: (Float32Array | undefined)[] };
export type PreparedRally = { a: Track; b: Track; shuttle: (Float32Array | undefined)[]; frames: number };

const W = 6.1;
const L = 13.4;
const NET_H = 1.55;
const BONES = [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7], [7, 8], [8, 9], [9, 10], [8, 11], [11, 12], [12, 13], [8, 14], [14, 15], [15, 16]];
const HEAD = 10;
const WRISTS = [13, 16];
const TRAIL = 14; // frames of shuttle flight kept behind the shuttle
const HOLD = 4; // frames a pose may be held across a missing sample
const REFLECTION = 0.16; // opacity of the players' mirror image in the floor

/** Idle drift: a slow sway around the broadcast view, resumed this long after a drag ends. */
const DRIFT = { resumeMs: 2200, azimuth: 0.2, polar: 0.05, periodS: 40, ease: 0.008 };

const toVec = (values: number[]) => {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 3) {
    out[i] = values[i] / 100;
    out[i + 1] = values[i + 2] / 100;
    out[i + 2] = values[i + 1] / 100;
  }
  return out;
};

export function prepareRally(motion: RallyMotion, frames: number): PreparedRally {
  const track = (): Track => ({ pose: new Array(frames), racket: new Array(frames) });
  const rally: PreparedRally = { a: track(), b: track(), shuttle: new Array(frames), frames };
  for (const sample of motion.samples) {
    if (sample.a) rally.a.pose[sample.f] = toVec(sample.a);
    if (sample.b) rally.b.pose[sample.f] = toVec(sample.b);
    if (sample.ar) rally.a.racket[sample.f] = toVec(sample.ar);
    if (sample.br) rally.b.racket[sample.f] = toVec(sample.br);
    if (sample.s) rally.shuttle[sample.f] = toVec(sample.s);
  }
  return rally;
}

/** Nearest stored values around a fractional frame, blended when both sides exist. */
function sampleAt(series: (Float32Array | undefined)[], frame: number, out: Float32Array, hold: number) {
  const base = Math.floor(frame);
  let before = -1;
  for (let f = base; f >= Math.max(0, base - hold); f--) if (series[f]) { before = f; break; }
  let after = -1;
  for (let f = base + 1; f <= Math.min(series.length - 1, base + hold); f++) if (series[f]) { after = f; break; }
  if (before < 0 && after < 0) return false;
  if (before < 0 || after < 0) { out.set(series[before < 0 ? after : before]!); return true; }
  const a = series[before]!, b = series[after]!, t = (frame - before) / (after - before);
  for (let i = 0; i < out.length; i++) out[i] = a[i] + (b[i] - a[i]) * t;
  return true;
}

export type SceneColors = { a: string; b: string; court: string; shuttle: string; background: string };

type Figure = { group: THREE.Group; bones: LineSegments2; bonePositions: THREE.InterleavedBuffer; joints: THREE.InstancedMesh; head: THREE.Mesh; racket: LineSegments2 };

export class RallyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(25, 16 / 10, 0.1, 200);
  private controls: OrbitControls;
  private lineMaterials: LineMaterial[] = [];
  /** Each player is drawn twice: upright, and mirrored under the floor as a reflection. */
  private players: [Figure, Figure][] = [];
  private shuttles: THREE.Mesh[] = [];
  private trail: THREE.Line;
  private drop: THREE.Line;
  private pose = new Float32Array(51);
  private point = new Float32Array(3);
  private bonePositions = new Float32Array(BONES.length * 6); // scratch, copied into each figure's own buffer
  private matrix = new THREE.Matrix4();
  // Broadcast view, matching the source calibration: 7.3 m up, 14.3 m behind the near baseline.
  private home = { position: new THREE.Vector3(W / 2, 7.3, L + 14.3), target: new THREE.Vector3(W / 2, 0.3, L / 2) };
  private homeSpherical = new THREE.Spherical();
  private dragging = false;
  private releasedAt = -Infinity;
  private drifting: boolean;
  private desired = new THREE.Vector3();
  private spherical = new THREE.Spherical();

  constructor(canvas: HTMLCanvasElement, colors: SceneColors, options: { drift: boolean }) {
    this.drifting = options.drift;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.7;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.addEventListener("start", () => { this.dragging = true; });
    this.controls.addEventListener("end", () => { this.dragging = false; this.releasedAt = performance.now(); });
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.update();
    this.homeSpherical.setFromVector3(this.home.position.clone().sub(this.home.target));

    // Depth fog in the page colour lets the far court and net dissolve into the hero.
    this.scene.fog = new THREE.Fog(new THREE.Color(colors.background), 20, 42);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(4, 10, 8);
    this.scene.add(sun);

    this.drawCourt(colors.court);
    for (const color of [colors.a, colors.b]) {
      const mirror = this.createFigure(color, REFLECTION);
      mirror.group.scale.y = -1;
      this.players.push([this.createFigure(color, 1), mirror]);
    }

    const shuttleColor = new THREE.Color(colors.shuttle);
    for (const opacity of [1, REFLECTION]) {
      const shuttle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({ color: shuttleColor, transparent: opacity < 1, opacity }));
      this.shuttles.push(shuttle);
      this.scene.add(shuttle);
    }
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }));
    this.trail.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    this.trail.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 4), 4));
    for (let i = 0; i < TRAIL; i++) (this.trail.geometry.getAttribute("color") as THREE.BufferAttribute).setXYZW(i, shuttleColor.r, shuttleColor.g, shuttleColor.b, (i / (TRAIL - 1)) ** 1.6 * 0.85);
    this.drop = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineDashedMaterial({ color: shuttleColor, transparent: true, opacity: 0.35, dashSize: 0.08, gapSize: 0.08 }));
    this.scene.add(this.trail, this.drop);
  }

  resize(width: number, height: number) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    for (const material of this.lineMaterials) material.resolution.set(width, height);
  }

  /** Draw the rally at a fractional frame; returns whether the camera is still moving. */
  update(rally: PreparedRally | null, frame: number, now: number) {
    for (const [i, key] of (["a", "b"] as const).entries()) this.drawPlayer(this.players[i], rally?.[key], frame);
    this.drawShuttle(rally?.shuttle, frame);

    const drifting = this.drifting && !this.dragging && now - this.releasedAt > DRIFT.resumeMs;
    if (drifting) {
      // Ease towards a point that sways slowly around the broadcast view.
      const phase = (now / 1000 / DRIFT.periodS) * Math.PI * 2;
      this.spherical.copy(this.homeSpherical);
      this.spherical.theta += Math.sin(phase) * DRIFT.azimuth;
      this.spherical.phi += Math.sin(phase * 0.61) * DRIFT.polar;
      this.desired.setFromSpherical(this.spherical).add(this.home.target);
      this.camera.position.lerp(this.desired, DRIFT.ease);
      this.controls.target.lerp(this.home.target, DRIFT.ease);
    }
    const moving = this.controls.update() || drifting;
    this.renderer.render(this.scene, this.camera);
    return moving;
  }

  dispose() {
    this.controls.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(material) ? material : material ? [material] : []).forEach((m) => m.dispose());
    });
    this.renderer.dispose();
  }

  private drawPlayer(figures: [Figure, Figure], track: Track | undefined, frame: number) {
    const visible = !!track && sampleAt(track.pose, frame, this.pose, HOLD);
    const hasRacket = visible && !!track && sampleAt(track.racket, frame, this.point, HOLD);
    for (const figure of figures) figure.group.visible = visible;
    if (!visible) return;

    BONES.forEach(([from, to], bone) => {
      this.bonePositions.set(this.pose.subarray(from * 3, from * 3 + 3), bone * 6);
      this.bonePositions.set(this.pose.subarray(to * 3, to * 3 + 3), bone * 6 + 3);
    });
    // The exporter extends the forearm of the playing hand; start the racket from the nearer wrist.
    const wrist = WRISTS.reduce((best, j) => this.distanceToPoint(j) < this.distanceToPoint(best) ? j : best);
    for (const figure of figures) {
      (figure.bonePositions.array as Float32Array).set(this.bonePositions);
      figure.bonePositions.needsUpdate = true;
      for (let j = 0; j < 17; j++) figure.joints.setMatrixAt(j, this.matrix.makeTranslation(this.pose[j * 3], this.pose[j * 3 + 1], this.pose[j * 3 + 2]));
      figure.joints.instanceMatrix.needsUpdate = true;
      figure.head.position.set(this.pose[HEAD * 3], this.pose[HEAD * 3 + 1] + 0.04, this.pose[HEAD * 3 + 2]);
      figure.racket.visible = hasRacket;
      if (hasRacket) (figure.racket.geometry as LineSegmentsGeometry).setPositions([...this.pose.subarray(wrist * 3, wrist * 3 + 3), ...this.point]);
    }
  }

  private distanceToPoint(joint: number) {
    return (this.pose[joint * 3] - this.point[0]) ** 2 + (this.pose[joint * 3 + 1] - this.point[1]) ** 2 + (this.pose[joint * 3 + 2] - this.point[2]) ** 2;
  }

  private drawShuttle(series: (Float32Array | undefined)[] | undefined, frame: number) {
    const flying = !!series && sampleAt(series, frame, this.point, 1);
    for (const shuttle of this.shuttles) shuttle.visible = flying;
    this.trail.visible = this.drop.visible = flying;
    if (!flying || !series) return;
    const [x, y, z] = this.point;
    this.shuttles[0].position.set(x, y, z);
    this.shuttles[1].position.set(x, -y, z);
    const drop = this.drop.geometry.getAttribute("position") as THREE.BufferAttribute;
    drop.setXYZ(0, x, 0, z);
    drop.setXYZ(1, x, y, z);
    drop.needsUpdate = true;
    this.drop.computeLineDistances();
    // Trail: consecutive stored frames behind the shuttle, oldest first, ending at the shuttle.
    const trail = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const behind: Float32Array[] = [];
    for (let f = Math.floor(frame); behind.length < TRAIL - 1 && f >= 0 && series[f]; f--) behind.push(series[f]!);
    trail.setXYZ(TRAIL - 1, x, y, z);
    for (let i = 0; i < TRAIL - 1; i++) {
      // Slots older than the flight collapse onto its first point.
      const p = behind[Math.min(i, behind.length - 1)] ?? this.point;
      trail.setXYZ(TRAIL - 2 - i, p[0], p[1], p[2]);
    }
    trail.needsUpdate = true;
    this.trail.geometry.computeBoundingSphere();
  }

  private lineMaterial(color: string, linewidth: number, opacity: number, glow = false) {
    const material = new LineMaterial({
      color, linewidth, transparent: true, opacity, fog: true, depthWrite: !glow,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide, // reflections are mirrored, which flips the line quads' winding
    });
    this.lineMaterials.push(material);
    return material;
  }

  private drawCourt(color: string) {
    const segments: number[] = [];
    const add = (x1: number, y1: number, x2: number, y2: number, z = 0.002) => segments.push(x1, z, y1, x2, z, y2);
    add(0, 0, W, 0); add(W, 0, W, L); add(W, L, 0, L); add(0, L, 0, 0);
    for (const x of [0.46, W - 0.46]) add(x, 0, x, L);
    for (const y of [0.76, L - 0.76, L / 2 - 1.98, L / 2 + 1.98]) add(0, y, W, y);
    add(W / 2, 0, W / 2, L / 2 - 1.98);
    add(W / 2, L / 2 + 1.98, W / 2, L);
    // Lit lines: a crisp stroke over a wide, faint additive halo.
    for (const [width, opacity, glow] of [[7, 0.07, true], [1.4, 0.7, false]] as const) {
      const geometry = new LineSegmentsGeometry().setPositions(segments);
      this.scene.add(new LineSegments2(geometry, this.lineMaterial(color, width, opacity, glow)));
    }

    // An even court surface that stops at the outer lines. No canvas textures: Safari's
    // fingerprinting protection adds random noise to canvas pixels, which shows as specks.
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(W, L),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(W / 2, -0.01, L / 2);
    this.scene.add(surface);

    const net = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, 0.76), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(W / 2, NET_H - 0.38, L / 2);
    this.scene.add(net);
    const netLines = [-0.1, NET_H, L / 2, W + 0.1, NET_H, L / 2, -0.1, NET_H - 0.76, L / 2, W + 0.1, NET_H - 0.76, L / 2,
      -0.1, 0, L / 2, -0.1, NET_H, L / 2, W + 0.1, 0, L / 2, W + 0.1, NET_H, L / 2];
    for (const [width, opacity, glow] of [[6, 0.1, true], [1.4, 0.75, false]] as const) {
      this.scene.add(new LineSegments2(new LineSegmentsGeometry().setPositions(netLines), this.lineMaterial(color, width, opacity, glow)));
    }
  }

  private createFigure(color: string, opacity: number): Figure {
    const group = new THREE.Group();
    const faded = opacity < 1;
    // setPositions keeps the array it is given, so every figure needs its own.
    const bones = new LineSegments2(new LineSegmentsGeometry().setPositions(new Float32Array(BONES.length * 6)), this.lineMaterial(color, 2.2, opacity));
    const bonePositions = (bones.geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data;
    const racket = new LineSegments2(new LineSegmentsGeometry().setPositions(new Float32Array(6)), this.lineMaterial(color, 1.4, 0.7 * opacity));
    const solid = () => new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: faded, opacity, depthWrite: !faded, side: faded ? THREE.DoubleSide : THREE.FrontSide });
    const joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), solid(), 17);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), solid());
    for (const object of [bones, racket, joints]) object.frustumCulled = false; // geometry moves every frame
    group.add(bones, joints, head, racket);
    group.visible = false;
    this.scene.add(group);
    return { group, bones, bonePositions, joints, head, racket };
  }
}
