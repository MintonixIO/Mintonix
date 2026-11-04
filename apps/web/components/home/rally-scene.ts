/*
 * The hero's 3D court: reconstructed player poses, rackets and shuttle flight for
 * one rally at a time, drawn with three.js and rotated by dragging.
 * Motion files come from RESEARCH/scripts/export_hero.py: centimetres on the court,
 * x across (0..610), y along (0..1340), z up. three.js uses y up, so (x, y, z) → (x, z, y).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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

export type SceneColors = { a: string; b: string; court: string; shuttle: string };

export class RallyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(25, 16 / 10, 0.1, 200);
  private controls: OrbitControls;
  private players: { bones: THREE.LineSegments; joints: THREE.InstancedMesh; head: THREE.Mesh; racket: THREE.Line; group: THREE.Group }[] = [];
  private shuttle: THREE.Mesh;
  private trail: THREE.Line;
  private drop: THREE.Line;
  private pose = new Float32Array(51);
  private point = new Float32Array(3);
  // Broadcast view, matching the source calibration: 7.3 m up, 14.3 m behind the near baseline.
  private home = { position: new THREE.Vector3(W / 2, 7.3, L + 14.3), target: new THREE.Vector3(W / 2, 0.3, L / 2) };
  onInteract?: () => void;

  constructor(private canvas: HTMLCanvasElement, colors: SceneColors) {
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
    this.controls.addEventListener("start", () => this.onInteract?.());
    this.resetView();

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(4, 10, 8);
    this.scene.add(sun);

    this.drawCourt(colors.court);
    for (const color of [colors.a, colors.b]) this.players.push(this.createPlayer(color));

    const shuttleColor = new THREE.Color(colors.shuttle);
    this.shuttle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({ color: shuttleColor }));
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true }));
    this.trail.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    this.trail.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL * 4), 4));
    this.drop = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineDashedMaterial({ color: shuttleColor, transparent: true, opacity: 0.35, dashSize: 0.08, gapSize: 0.08 }));
    this.scene.add(this.shuttle, this.trail, this.drop);
    for (let i = 0; i < TRAIL; i++) (this.trail.geometry.getAttribute("color") as THREE.BufferAttribute).setXYZW(i, shuttleColor.r, shuttleColor.g, shuttleColor.b, (i / (TRAIL - 1)) ** 1.6 * 0.85);
  }

  resetView() {
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  resize(width: number, height: number) {
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Draw the rally at a fractional frame; returns whether damping still needs frames. */
  update(rally: PreparedRally | null, frame: number) {
    for (const [i, key] of (["a", "b"] as const).entries()) {
      const player = this.players[i];
      const track = rally?.[key];
      const visible = !!track && sampleAt(track.pose, frame, this.pose, HOLD);
      player.group.visible = visible;
      if (!visible || !track) continue;
      const positions = player.bones.geometry.getAttribute("position") as THREE.BufferAttribute;
      BONES.forEach(([from, to], bone) => {
        positions.setXYZ(bone * 2, this.pose[from * 3], this.pose[from * 3 + 1], this.pose[from * 3 + 2]);
        positions.setXYZ(bone * 2 + 1, this.pose[to * 3], this.pose[to * 3 + 1], this.pose[to * 3 + 2]);
      });
      positions.needsUpdate = true;
      player.bones.geometry.computeBoundingSphere();
      const matrix = new THREE.Matrix4();
      for (let j = 0; j < 17; j++) player.joints.setMatrixAt(j, matrix.makeTranslation(this.pose[j * 3], this.pose[j * 3 + 1], this.pose[j * 3 + 2]));
      player.joints.instanceMatrix.needsUpdate = true;
      player.head.position.set(this.pose[HEAD * 3], this.pose[HEAD * 3 + 1] + 0.04, this.pose[HEAD * 3 + 2]);

      const hasRacket = sampleAt(track.racket, frame, this.point, HOLD);
      player.racket.visible = hasRacket;
      if (hasRacket) {
        // The exporter extends the forearm of the playing hand; start from the nearer wrist.
        const [w] = WRISTS.map((j) => ({ j, d: (this.pose[j * 3] - this.point[0]) ** 2 + (this.pose[j * 3 + 1] - this.point[1]) ** 2 + (this.pose[j * 3 + 2] - this.point[2]) ** 2 })).sort((p, q) => p.d - q.d);
        const line = player.racket.geometry.getAttribute("position") as THREE.BufferAttribute;
        line.setXYZ(0, this.pose[w.j * 3], this.pose[w.j * 3 + 1], this.pose[w.j * 3 + 2]);
        line.setXYZ(1, this.point[0], this.point[1], this.point[2]);
        line.needsUpdate = true;
        player.racket.geometry.computeBoundingSphere();
      }
    }

    const shuttles = rally?.shuttle;
    const flying = !!shuttles && sampleAt(shuttles, frame, this.point, 1);
    this.shuttle.visible = this.trail.visible = this.drop.visible = flying;
    if (flying && shuttles) {
      this.shuttle.position.set(this.point[0], this.point[1], this.point[2]);
      const drop = this.drop.geometry.getAttribute("position") as THREE.BufferAttribute;
      drop.setXYZ(0, this.point[0], 0, this.point[2]);
      drop.setXYZ(1, this.point[0], this.point[1], this.point[2]);
      drop.needsUpdate = true;
      this.drop.computeLineDistances();
      // Trail: consecutive stored frames behind the shuttle, oldest first, ending at the shuttle.
      const trail = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
      const behind: Float32Array[] = [];
      for (let f = Math.floor(frame); behind.length < TRAIL - 1 && f >= 0 && shuttles[f]; f--) behind.push(shuttles[f]!);
      trail.setXYZ(TRAIL - 1, this.point[0], this.point[1], this.point[2]);
      for (let i = 0; i < TRAIL - 1; i++) {
        // Slots older than the flight collapse onto its first point.
        const p = behind[Math.min(i, behind.length - 1)] ?? this.point;
        trail.setXYZ(TRAIL - 2 - i, p[0], p[1], p[2]);
      }
      trail.needsUpdate = true;
      this.trail.geometry.computeBoundingSphere();
    }

    const moving = this.controls.update();
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

  private drawCourt(color: string) {
    const line = (points: number[][], opacity = 0.85) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, y, z = 0]) => new THREE.Vector3(x, z, y)));
      this.scene.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.06, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, L / 2);
    this.scene.add(floor);

    line([[0, 0], [W, 0], [W, L], [0, L], [0, 0]]);
    for (const x of [0.46, W - 0.46]) line([[x, 0], [x, L]]);
    for (const y of [0.76, L - 0.76, L / 2 - 1.98, L / 2 + 1.98]) line([[0, y], [W, y]]);
    line([[W / 2, 0], [W / 2, L / 2 - 1.98]]);
    line([[W / 2, L / 2 + 1.98], [W / 2, L]]);

    const net = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, 0.76), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(W / 2, NET_H - 0.38, L / 2);
    this.scene.add(net);
    line([[-0.1, L / 2, NET_H], [W + 0.1, L / 2, NET_H]], 1);
    line([[-0.1, L / 2, NET_H - 0.76], [W + 0.1, L / 2, NET_H - 0.76]], 0.4);
    for (const x of [-0.1, W + 0.1]) line([[x, L / 2, 0], [x, L / 2, NET_H]], 1);
  }

  private createPlayer(color: string) {
    const group = new THREE.Group();
    const bones = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color }));
    bones.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3));
    const joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }), 17);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    const racket = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    group.add(bones, joints, head, racket);
    group.visible = false;
    this.scene.add(group);
    return { bones, joints, head, racket, group };
  }
}
