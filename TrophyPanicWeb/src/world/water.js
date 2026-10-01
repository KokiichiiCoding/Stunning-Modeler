// Stylised water: turquoise, gently animated, with foamy shorelines drawn
// from the terrain height texture.

import { THREE } from '../three.js';
import { WATER_LEVEL, WORLD_SIZE, HALF } from './terrainData.js';

export function buildWater(heightTex) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uHeight: { value: heightTex },
        uHalf: { value: HALF },
        uLevel: { value: WATER_LEVEL },
        uDeep: { value: new THREE.Color(0x2f9fb8) },
        uShallow: { value: new THREE.Color(0x6fe0d8) },
        uFoam: { value: new THREE.Color(0xf4fffb) },
        uLight: { value: 1.0 },
      },
    ]),
    vertexShader: `
      uniform float uTime;
      varying vec2 vWorld;
      varying float vWave;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.09 + uTime * 1.1) * 0.06 + cos(p.z * 0.07 - uTime * 0.9) * 0.06;
        p.y += w;
        vWave = w;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uHalf, uLevel, uLight;
      uniform sampler2D uHeight;
      uniform vec3 uDeep, uShallow, uFoam;
      varying vec2 vWorld;
      varying float vWave;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = (vWorld + uHalf) / (uHalf * 2.0);
        float ground = texture2D(uHeight, uv).r;
        float depth = uLevel - ground;
        if (depth < -0.3) discard;
        float t = clamp(depth / 3.5, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, t);
        // Toon ripple bands
        float ripple = sin(vWorld.x * 0.35 + uTime * 1.3) * sin(vWorld.y * 0.31 - uTime * 1.1);
        col += step(0.82, ripple) * 0.07;
        // Shoreline foam, wobbling over time
        float foamEdge = 0.35 + 0.15 * sin(uTime * 1.6 + vWorld.x * 0.2 + vWorld.y * 0.17);
        float foam = 1.0 - smoothstep(foamEdge * 0.6, foamEdge, depth);
        col = mix(col, uFoam, foam * 0.9);
        col *= uLight;
        float alpha = mix(0.72, 0.9, t) + foam * 0.1;
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.renderOrder = 2;
  mesh.name = 'water';
  return { mesh, update(t, light) { mat.uniforms.uTime.value = t; mat.uniforms.uLight.value = light; } };
}
