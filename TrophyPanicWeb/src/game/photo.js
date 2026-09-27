// Wildlife photography: rate what is actually in the camera frame. A good
// photo fills the frame, is centred, catches the animal side-on and in
// focus (not behind a tree), and scores extra for doing something.

import { THREE } from '../three.js';

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();

function blockedByTerrain(T, a, b) {
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (y < T.heightAt(x, z) + 0.1) return true;
  }
  return false;
}

export function evaluatePhoto(game) {
  const cam = game.camera;
  cam.updateMatrixWorld();
  _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const o = cam.position;
  const viewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const vFov = cam.fov * Math.PI / 180;
  const subjects = [];
  for (const a of game.animals.list) {
    if (a.harvested) continue;
    const sp = a.species, s = a.identity.scale;
    const height = (sp.body.leg + sp.body.h) * s;
    const c = new THREE.Vector3(a.pos.x, a.pos.y + height * 0.6, a.pos.z);
    const dist = c.distanceTo(o);
    if (dist > 240 || dist < 1) continue;
    if (!_frustum.containsPoint(c)) continue;
    if (game.vegetation.segmentBlocked(o.x, o.y, o.z, c.x, c.y, c.z) >= 0) continue;
    if (blockedByTerrain(game.terrain, o, c)) continue;
    const ndc = c.clone().project(cam);
    const centred = 1 - Math.min(1, Math.hypot(ndc.x, ndc.y * 1.4));
    // how much of the frame height the animal fills (a third is lovely)
    const frac = (Math.max(height, sp.body.len * s * 0.8) / dist) / vFov;
    const fill = Math.min(1, frac / 0.33) * (frac > 0.9 ? 0.8 : 1);
    // side-on beats rear-end
    const f = a.facing !== undefined ? { x: Math.cos(a.facing), z: Math.sin(a.facing) } : { x: 1, z: 0 };
    const side = Math.abs(f.x * viewDir.z - f.z * viewDir.x);
    const charging = a.goal === 'Charge' && !a.downed;
    const action = a.downed ? 'resting (permanently)' : charging ? 'CHARGING' : a.goal === 'Flee' ? 'running' : a.grazeT > 0 ? 'grazing' : a.state === 'Curious' ? 'curious' : a.state === 'Stalking' ? 'stalking you' : 'posing';
    let score = 100 * (0.15 + 0.55 * fill) * (0.45 + 0.55 * centred) * (0.7 + 0.3 * side);
    if (charging) score += 30;
    else if (a.goal === 'Flee') score += 6;
    else if (a.grazeT > 0 || a.state === 'Curious') score += 10;
    if (a.downed) score *= 0.5;
    if (a.identity.rareTrait) score += 20;
    if (a.identity.trophySize01 > 0.8) score += 8;
    subjects.push({ a, score, dist, action, charging });
  }
  if (!subjects.length) return null;
  subjects.sort((x, y) => y.score - x.score);
  const best = subjects[0];
  const group = subjects.filter(s => s.a.species === best.a.species).length;
  let score = best.score + Math.min(3, group - 1) * 6;
  score = Math.max(0, Math.min(130, score));
  const stars = score >= 85 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : 1;
  return {
    animal: best.a, sp: best.a.species.id, name: best.a.species.displayName, nickname: best.a.identity.nickname,
    dist: best.dist, action: best.action, charging: best.charging, danger: best.a.species.danger || 0,
    group, score, stars, rare: !!best.a.identity.rareTrait,
  };
}
