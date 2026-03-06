import { CodePlayground } from "./codePlayground.js";
import { FileManager } from "./fileManager.js";
import { LayoutManager } from "./layoutManager.js";

function migrateV1toV2() {
  const V1_KEY = "mini-playground-v1";
  const V2_KEY = FileManager.STORAGE_KEY;

  // 이미 v2가 있으면 건너뜀
  try {
    const v2 = localStorage.getItem(V2_KEY);
    if (v2) {
      const parsed = JSON.parse(v2);
      if (parsed && parsed.version === 2) {
        localStorage.removeItem(V1_KEY);
        return;
      }
    }
  } catch {}

  // v1 데이터 읽기
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved) return;

    const genId = () =>
      "f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);

    const files = [];
    if (saved.html)
      files.push({ id: genId(), name: "index.html", content: saved.html });
    if (saved.css)
      files.push({ id: genId(), name: "style.css", content: saved.css });
    if (saved.js)
      files.push({ id: genId(), name: "main.js", content: saved.js });
    if (saved.rust)
      files.push({ id: genId(), name: "lib.rs", content: saved.rust });

    if (files.length === 0) return;

    const v2State = {
      version: 2,
      files,
      libs: Array.isArray(saved.libs) ? saved.libs : [],
      activeFileId: files[0].id,
      openFileIds: files.map((f) => f.id),
      settings: { lineWrapping: false, fontSize: 14, tabSize: 2 },
    };

    localStorage.setItem(V2_KEY, JSON.stringify(v2State));
    localStorage.removeItem(V1_KEY);
  } catch {}
}

const DEFAULT_FILES = [
  {
    name: "index.html",
    content: `<canvas id="gl"></canvas>
<div class="hud">
  WebGL2 Ocean — Gerstner Waves<br/>
  • 드래그: 카메라 회전 / 휠: 줌<br/>
  • 파라미터는 JS 상단에서 조절 가능
</div>`,
  },
  {
    name: "style.css",
    content: `html,body { height:100%; margin:0; background:#0a0f18; overflow:hidden; }
#gl { width:100%; height:100%; display:block; }
.hud {
  position: fixed; left:12px; bottom:12px; color:#cbd5e1;
  font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: rgba(0,0,0,.35); padding:10px 12px;
  border:1px solid rgba(255,255,255,.08); border-radius:10px;
}`,
  },
  {
    name: "main.js",
    content: `(async () => {
// 러스트 모듈 초기화가 끝날 때까지 기다린다
const rust = await window.__rust;
console.log('rust ok:', rust);
console.log('add(2,3)=', rust.add?.(2, 3));

// ====== Config ======
const GRID_RES = 256;
const FOV = (55 * Math.PI) / 180;
const CAMERA = { dist: 8.0, azim: Math.PI * 0.25, elev: 0.35 };
const SUN_DIR = normalize([-0.5, 0.8, 0.2]);
const SUN_COLOR = [1.0, 0.95, 0.9];
const WATER_BASE = [0.02, 0.16, 0.24];
const SKY_TOP = [0.08, 0.23, 0.45];
const SKY_HORZ = [0.4, 0.58, 0.8];

const WAVES = [
  { dir: normalize([1.0, 0.4]), amp: 0.18, lambda: 4.0, speed: 1.0, steep: 0.75 },
  { dir: normalize([0.7, -1.0]), amp: 0.1, lambda: 2.2, speed: 1.4, steep: 0.75 },
  { dir: normalize([-0.8, 0.2]), amp: 0.06, lambda: 1.1, speed: 1.8, steep: 0.7 },
  { dir: normalize([0.2, 1.0]), amp: 0.03, lambda: 0.6, speed: 2.2, steep: 0.65 },
];

const canvas = document.getElementById("gl");
const gl = canvas.getContext("webgl2", { antialias: true });
if (!gl) { alert("WebGL2를 지원하지 않습니다."); return; }

function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr);
  const h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, canvas.width, canvas.height);
}
function onResize() { canvas.style.width = "100%"; canvas.style.height = "100%"; fit(); }
window.addEventListener("resize", onResize);
onResize();

const vertSrc = \`#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
uniform mat4 u_proj, u_view;
uniform float u_time;
uniform vec3 u_wavesDir[4];
uniform float u_wavesAmp[4], u_wavesLambda[4], u_wavesSpeed[4], u_wavesSteep[4];
uniform int u_waveCount;
out vec3 v_worldPos, v_worldNormal;
out float v_choppy;
vec3 gerstnerDisplace(vec3 p, out vec3 normal, out float choppy) {
  vec3 n = vec3(0.0, 1.0, 0.0), pos = p; choppy = 0.0;
  for (int i=0; i<4; ++i) {
    if (i >= u_waveCount) break;
    vec2 D = normalize(u_wavesDir[i].xz); float A = u_wavesAmp[i]; float L = u_wavesLambda[i];
    float S = u_wavesSpeed[i]; float steep = u_wavesSteep[i];
    float k = 2.0*3.14159265/L; float w = sqrt(9.81*k);
    float phase = k*dot(D, p.xz) - (w*S)*u_time;
    float cosP = cos(phase), sinP = sin(phase);
    pos.x += (steep*A)*D.x*cosP; pos.z += (steep*A)*D.y*cosP; pos.y += A*sinP;
    vec3 tx = vec3(1.0-(steep*A*k)*D.x*D.x*sinP, A*k*D.x*cosP, -(steep*A*k)*D.x*D.y*sinP);
    vec3 tz = vec3(-(steep*A*k)*D.x*D.y*sinP, A*k*D.y*cosP, 1.0-(steep*A*k)*D.y*D.y*sinP);
    n += normalize(cross(tz, tx)); choppy += (steep*A*k)*abs(cosP);
  }
  normal = normalize(n); return pos;
}
void main() {
  vec2 tile = a_pos * 20.0; vec3 base = vec3(tile.x, 0.0, tile.y);
  float c; vec3 N; vec3 worldPos = gerstnerDisplace(base, N, c);
  v_worldPos = worldPos; v_worldNormal = N; v_choppy = c;
  gl_Position = u_proj * u_view * vec4(worldPos, 1.0);
}\`;

const fragSrc = \`#version 300 es
precision highp float;
in vec3 v_worldPos, v_worldNormal; in float v_choppy; out vec4 o_color;
uniform vec3 u_camPos, u_sunDir, u_sunColor, u_waterBase, u_skyTop, u_skyHorz;
uniform float u_time;
float saturate(float x){ return clamp(x,0.0,1.0); }
vec3 saturate(vec3 v){ return clamp(v,vec3(0.0),vec3(1.0)); }
float fresnelSchlick(float cosTheta, float F0){ return F0+(1.0-F0)*pow(1.0-cosTheta,5.0); }
vec3 skyColor(vec3 dir){ float t=saturate(dir.y*0.5+0.5); return mix(u_skyHorz,u_skyTop,t); }
void main(){
  vec3 N=normalize(v_worldNormal), V=normalize(u_camPos-v_worldPos), L=normalize(u_sunDir), H=normalize(L+V);
  float cosV=saturate(dot(N,V)), F=fresnelSchlick(cosV,0.04);
  vec3 R=reflect(-V,N), env=skyColor(R), base=u_waterBase;
  float NdotL=saturate(dot(N,L)); vec3 diffuse=base*(0.08+0.22*NdotL);
  float spec=pow(saturate(dot(N,H)),120.0)*(0.35+0.65*NdotL); vec3 specular=u_sunColor*spec;
  float foamCrest=saturate(v_choppy*0.08-0.15), facing=1.0-cosV, foam=saturate(foamCrest*(0.3+0.7*facing));
  float flick=fract(sin(dot(v_worldPos.xz,vec2(12.9898,78.233)))*43758.5453);
  foam*=smoothstep(0.4,1.0,flick+0.15*sin(u_time*1.7+v_worldPos.x*0.2));
  vec3 color=mix(diffuse,env,F)+specular+foam*vec3(0.9,0.95,1.0);
  float dist=length(u_camPos-v_worldPos), fog=saturate(1.0-exp(-0.02*dist));
  vec3 fogCol=mix(u_skyHorz,u_skyTop,0.5); color=mix(color,fogCol,fog*0.35);
  o_color=vec4(saturate(color),1.0);
}\`;

function compileShader(type, src) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); throw new Error("Shader compile failed"); }
  return sh;
}
function createProgram(vs, fs) {
  const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); throw new Error("Program link failed"); }
  return p;
}
function normalize(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

function makeGrid(N) {
  const verts = new Float32Array((N+1)*(N+1)*2); let k = 0;
  for (let j=0; j<=N; j++) for (let i=0; i<=N; i++) { verts[k++]=(i/N)*2-1; verts[k++]=(j/N)*2-1; }
  const indices = new Uint32Array(N*N*6); let t = 0;
  for (let j=0; j<N; j++) for (let i=0; i<N; i++) {
    const a=j*(N+1)+i, b=a+1, c=a+(N+1), d=c+1;
    indices[t++]=a; indices[t++]=c; indices[t++]=b; indices[t++]=b; indices[t++]=c; indices[t++]=d;
  }
  return { verts, indices };
}
const grid = makeGrid(GRID_RES);

const prog = createProgram(compileShader(gl.VERTEX_SHADER, vertSrc), compileShader(gl.FRAGMENT_SHADER, fragSrc));
gl.useProgram(prog);

const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, grid.verts, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW);

const loc = (name) => gl.getUniformLocation(prog, name);
const u_proj=loc("u_proj"), u_view=loc("u_view"), u_time=loc("u_time");
const u_camPos=loc("u_camPos"), u_sunDir=loc("u_sunDir"), u_sunColor=loc("u_sunColor");
const u_waterBase=loc("u_waterBase"), u_skyTop=loc("u_skyTop"), u_skyHorz=loc("u_skyHorz");
const u_wavesDir=loc("u_wavesDir"), u_wavesAmp=loc("u_wavesAmp");
const u_wavesLambda=loc("u_wavesLambda"), u_wavesSpeed=loc("u_wavesSpeed");
const u_wavesSteep=loc("u_wavesSteep"), u_waveCount=loc("u_waveCount");

gl.uniform3fv(u_sunDir, SUN_DIR); gl.uniform3fv(u_sunColor, SUN_COLOR);
gl.uniform3fv(u_waterBase, WATER_BASE); gl.uniform3fv(u_skyTop, SKY_TOP); gl.uniform3fv(u_skyHorz, SKY_HORZ);

const WN = Math.min(4, WAVES.length);
const wavesDirArr = new Float32Array(4*3), wavesAmpArr = new Float32Array(4);
const wavesLamArr = new Float32Array(4), wavesSpdArr = new Float32Array(4), wavesStpArr = new Float32Array(4);
for (let i = 0; i < 4; i++) {
  const w = WAVES[i] || { dir: [1,0], amp: 0, lambda: 1, speed: 0, steep: 0 };
  wavesDirArr.set([w.dir[0], 0, w.dir[1]], i*3);
  wavesAmpArr[i]=w.amp; wavesLamArr[i]=w.lambda; wavesSpdArr[i]=w.speed; wavesStpArr[i]=w.steep;
}
gl.uniform3fv(u_wavesDir, wavesDirArr); gl.uniform1fv(u_wavesAmp, wavesAmpArr);
gl.uniform1fv(u_wavesLambda, wavesLamArr); gl.uniform1fv(u_wavesSpeed, wavesSpdArr);
gl.uniform1fv(u_wavesSteep, wavesStpArr); gl.uniform1i(u_waveCount, WN);

function perspective(fovy, aspect, near, far) {
  const f=1/Math.tan(fovy/2), nf=1/(near-far), out=new Float32Array(16);
  out[0]=f/aspect; out[5]=f; out[10]=(far+near)*nf; out[11]=-1; out[14]=2*far*near*nf; return out;
}
function lookAt(eye, target, up) {
  const z=normalize3(sub3(eye,target)), x=normalize3(cross(up,z)), y=cross(z,x), m=new Float32Array(16);
  m[0]=x[0]; m[1]=y[0]; m[2]=z[0]; m[4]=x[1]; m[5]=y[1]; m[6]=z[1];
  m[8]=x[2]; m[9]=y[2]; m[10]=z[2]; m[12]=-dot(x,eye); m[13]=-dot(y,eye); m[14]=-dot(z,eye); m[15]=1;
  return m;
}
function sub3(a,b) { return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function len(a) { return Math.hypot(a[0],a[1],a[2]); }
function normalize3(a) { const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; }

let isDrag=false, px=0, py=0;
canvas.addEventListener("mousedown", (e) => { isDrag=true; px=e.clientX; py=e.clientY; });
window.addEventListener("mouseup", () => (isDrag=false));
window.addEventListener("mousemove", (e) => {
  if (!isDrag) return;
  const dx=(e.clientX-px)/canvas.clientWidth, dy=(e.clientY-py)/canvas.clientHeight;
  CAMERA.azim -= dx*3.0; CAMERA.elev = Math.max(-1.2, Math.min(1.2, CAMERA.elev - dy*2.0));
  px=e.clientX; py=e.clientY;
});
canvas.addEventListener("wheel", (e) => {
  CAMERA.dist *= 1+Math.sign(e.deltaY)*0.08;
  CAMERA.dist = Math.max(2.5, Math.min(30.0, CAMERA.dist));
}, { passive: true });

gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

let t0 = performance.now();
function frame() {
  fit();
  const t = (performance.now() - t0) / 1000;
  gl.clearColor(0.02, 0.04, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const aspect = canvas.width / canvas.height;
  const proj = perspective(FOV, aspect, 0.01, 100.0);
  const ce=Math.cos(CAMERA.elev), se=Math.sin(CAMERA.elev);
  const ca=Math.cos(CAMERA.azim), sa=Math.sin(CAMERA.azim);
  const eye = [CAMERA.dist*ce*ca, Math.max(1.2, CAMERA.dist*se), CAMERA.dist*ce*sa];
  const view = lookAt(eye, [0,0,0], [0,1,0]);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(u_proj, false, proj); gl.uniformMatrix4fv(u_view, false, view);
  gl.uniform1f(u_time, t*0.75); gl.uniform3fv(u_camPos, new Float32Array(eye));
  gl.bindVertexArray(vao);
  gl.drawElements(gl.TRIANGLES, grid.indices.length, gl.UNSIGNED_INT, 0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();`,
  },
  {
    name: "lib.rs",
    content: `use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}`,
  },
];

(function () {
  // 1. v1 → v2 마이그레이션
  migrateV1toV2();

  // 2. 레이아웃 (GridStack)
  const layout = new LayoutManager();
  layout.init();

  // 3. 파일 매니저
  const editorContainer = document.querySelector("#editorContainer");
  const fileManager = new FileManager(editorContainer);

  // 4. CodePlayground
  const code = new CodePlayground({
    meta: "WebGL2 Ocean — Gerstner Waves",
    title: "WASM Playground",
    fileManager,
    defaultFiles: DEFAULT_FILES,
  });

  // GridStack 리사이즈 시 에디터 새로고침
  layout.gridManager.on("resizestop", () => {
    fileManager.refreshActiveEditor();
  });
})();
