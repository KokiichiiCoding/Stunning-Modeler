// "Storybook" post-processing: the scene renders into an HDR target, a
// quarter-res bright pass is blurred into bloom, then one composite pass
// adds the glow, warms and lifts the colours a touch, and frames the shot
// with a soft vignette before tone mapping and sRGB output.

import { THREE } from '../three.js';

const FS_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `
  uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.6, l), 1.0);
  }`;

const BLUR = `
  uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
    c += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316;
    c += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
    c += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.070;
    c += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.070;
    gl_FragColor = vec4(c, 1.0);
  }`;

const COMPOSITE = `
  uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uVignette; uniform vec3 uTint; uniform float uSat;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom;
    c *= uTint;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    vec2 d = vUv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(d * vec2(1.15, 1.0)) * 1.25);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function quad(mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false;
  const s = new THREE.Scene(); s.add(m);
  return s;
}

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.enabled = true;
    const opts = { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true };
    this.rt = new THREE.WebGLRenderTarget(4, 4, { ...opts, samples: 4 });
    this.a = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.b = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (frag, uniforms, toneMapped = false) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped });
    this.brightMat = mk(BRIGHT, { tSrc: { value: null }, uThreshold: { value: 0.85 } });
    this.blurMat = mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.compMat = mk(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.55 }, uVignette: { value: 0.32 },
      uTint: { value: new THREE.Color(1.035, 1.0, 0.955) }, uSat: { value: 1.12 },
    }, true);
    this.brightScene = quad(this.brightMat);
    this.blurScene = quad(this.blurMat);
    this.compScene = quad(this.compMat);
  }

  setSize(w, h, pr) {
    const W = Math.max(4, Math.floor(w * pr)), H = Math.max(4, Math.floor(h * pr));
    this.rt.setSize(W, H);
    this.a.setSize(Math.max(4, W >> 2), Math.max(4, H >> 2));
    this.b.setSize(Math.max(4, W >> 2), Math.max(4, H >> 2));
    this.texel = [1 / Math.max(4, W >> 2), 1 / Math.max(4, H >> 2)];
  }

  /** Begin drawing the frame into the HDR target (call before scene renders). */
  begin() {
    this.r.setRenderTarget(this.rt);
    this.r.clear();
  }

  /** Bloom + grade + vignette onto the screen. */
  end(night = 0) {
    const r = this.r;
    this.brightMat.uniforms.tSrc.value = this.rt.texture;
    this.brightMat.uniforms.uThreshold.value = 0.85 - night * 0.45; // lanterns bloom more at night
    r.setRenderTarget(this.a); r.render(this.brightScene, this.cam);
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tSrc.value = this.a.texture; this.blurMat.uniforms.uDir.value.set(this.texel[0] * (1 + i), 0);
      r.setRenderTarget(this.b); r.render(this.blurScene, this.cam);
      this.blurMat.uniforms.tSrc.value = this.b.texture; this.blurMat.uniforms.uDir.value.set(0, this.texel[1] * (1 + i));
      r.setRenderTarget(this.a); r.render(this.blurScene, this.cam);
    }
    this.compMat.uniforms.tScene.value = this.rt.texture;
    this.compMat.uniforms.tBloom.value = this.a.texture;
    r.setRenderTarget(null);
    r.render(this.compScene, this.cam);
  }
}
