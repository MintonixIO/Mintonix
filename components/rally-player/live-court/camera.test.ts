import assert from "node:assert/strict";
import test from "node:test";
import { BASE_FOV, BASE_ASPECT, fieldOfView } from "./camera.ts";

test("the field of view keeps the court's width in view on taller columns", () => {
  assert.equal(fieldOfView(BASE_ASPECT), BASE_FOV);
  assert.equal(fieldOfView(2.4), BASE_FOV);
  const tall = fieldOfView(1.15);
  assert.ok(tall > BASE_FOV && tall < 60, `got ${tall}`);
  // The horizontal angle matches the 16:10 framing.
  const horizontal = (fov: number, aspect: number) => 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  assert.ok(Math.abs(horizontal(tall, 1.15) - horizontal(BASE_FOV, BASE_ASPECT)) < 1e-9);
  assert.equal(fieldOfView(0), BASE_FOV);
});
