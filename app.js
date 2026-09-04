/* ===== طراح پلان ساختمان — نسخه تولیدی ===== */
"use strict";

/* ---------- وضعیت ---------- */
const state = {
  width: 15, length: 12, bedrooms: 2, floors: 2,
  structure: "concrete", smartColumns: true, showDims: true,
  rooms: [], view: "2d",
  // zoom/pan (نمای SVG)
  scale: 1, tx: 0, ty: 0,
};

const $ = (id) => document.getElementById(id);
const svg = $("planSvg");

/* ---------- تولید اتاق‌ها بر اساس ابعاد ---------- */
function generateRooms() {
  const W = state.width, L = state.length;
  const wall = 0.2; // ضخامت دیوار (متر)
  const rooms = [];
  // ناحیه سراسری: پذیرایی + آشپزخانه در یک سمت، خواب‌ها سمت دیگر
  const bedZoneW = Math.min(5.5 + state.bedrooms, W * 0.55);
  const livingW = W - bedZoneW - wall;
  rooms.push({ name: "پذیرایی", x: 0, y: 0, w: livingW, h: L * 0.55, color: "#e0f2fe" });
  rooms.push({ name: "آشپزخانه", x: 0, y: L * 0.55, w: livingW, h: L * 0.45, color: "#fef9c3" });
  const bedH = L / state.bedrooms;
  for (let i = 0; i < state.bedrooms; i++) {
    rooms.push({
      name: "خواب " + (i + 1),
      x: livingW + wall, y: i * bedH,
      w: bedZoneW, h: bedH - (i < state.bedrooms - 1 ? wall : 0),
      color: i % 2 ? "#fce7f3" : "#ede9fe",
    });
  }
  rooms.push({ name: "سرویس", x: livingW - 2, y: L * 0.55, w: 2, h: 1.8, color: "#d1fae5" });
  state.rooms = rooms;
}

/* ---------- ستون‌ها ---------- */
function computeColumns() {
  const cols = [];
  const W = state.width, L = state.length;
  const stepX = 4.5, stepY = 4.5;
  for (let x = 0.4; x <= W - 0.2; x += stepX) {
    for (let y = 0.4; y <= L - 0.2; y += stepY) {
      cols.push({ x: Math.min(x, W - 0.4), y: Math.min(y, L - 0.4) });
    }
  }
  return state.smartColumns ? cols : cols.filter((c, i) => i % 2 === 0);
}

/* ---------- مختصات و بازنشانی ---------- */
function planBounds() {
  return { w: state.width + 2, h: state.length + 2 }; // حاشیه برای ابعادگذاری
}
function resetView() {
  const r = svg.getBoundingClientRect();
  const b = planBounds();
  const s = Math.min(r.width / b.w, r.height / b.h) * 0.9;
  state.scale = s;
  state.tx = (r.width - b.w * s) / 2;
  state.ty = (r.height - b.h * s) / 2;
  applyTransform();
  updateStatus();
}
function applyTransform() {
  const [g] = [svg.querySelector("#world")];
  if (g) g.setAttribute("transform", `translate(${state.tx},${state.ty}) scale(${state.scale})`);
}

/* ---------- رندر پلان ۲بعدی ---------- */
function render2D() {
  const b = planBounds();
  const pad = 1;
  const M = 30; // ضخامت خط دیوار بیرونی بر حسب px در مقیاس جهانی
  const W = state.width, L = state.length;
  const px = (m) => m * 40; // 40px per meter در فضای جهانی

  svg.setAttribute("viewBox", `0 0 ${b.w * 40} ${b.h * 40}`);

  let s = "";
  // کاغذ شطرنجی ملایم
  s += `<rect width="100%" height="100%" fill="#f8fafc"/>`;

  s += `<g id="world">`;
  // اتاق‌ها
  for (const r of state.rooms) {
    s += `<rect x="${px(r.x + pad)}" y="${px(r.y + pad)}" width="${px(r.w)}" height="${px(r.h)}"
          fill="${r.color}" stroke="#94a3b8" stroke-width="2"/>`;
  }
  // دیوار خارجی
  s += `<rect x="${px(pad)}" y="${px(pad)}" width="${px(W)}" height="${px(L)}"
        fill="none" stroke="#334155" stroke-width="${M}"/>`;
  // بازشواندها (در و پنجره) روی دیوار خارجی
  s += doorAndWindows(pad, W, L, px);
  // ستون‌ها
  const colColor = state.structure === "concrete" ? "#78716c" : "#475569";
  const colLabel = state.structure === "concrete" ? "بتنی" : "فلزی";
  for (const c of computeColumns()) {
    const size = 10;
    s += `<rect x="${px(c.x + pad) - size / 2}" y="${px(c.y + pad) - size / 2}" width="${size}" height="${size}"
          fill="${colColor}" stroke="#1e293b" stroke-width="1.5" rx="1"/>
          <title>ستون ${colLabel}</title>`;
  }
  // برچسب اتاق‌ها
  for (const r of state.rooms) {
    const cx = px(r.x + pad + r.w / 2), cy = px(r.y + pad + r.h / 2);
    s += `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="22" font-weight="700"
          fill="#1e293b" font-family="Vazirmatn,Tahoma">${r.name}</text>`;
    if (state.showDims) {
      s += `<text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="16" fill="#64748b"
            font-family="Vazirmatn,Tahoma" direction="rtl">${r.w.toFixed(1)} × ${r.h.toFixed(1)} متر</text>`;
    }
  }
  s += `</g>`;
  svg.innerHTML = s;
  applyTransform();
  updateStatus();
}

function doorAndWindows(pad, W, L, px) {
  let s = "";
  // پنجره‌ها (خط آبی روی دیوار)
  s += `<line x1="${px(pad + 1)}" y1="${px(pad)}" x2="${px(pad + W / 2)}" y2="${px(pad)}" stroke="#0ea5e9" stroke-width="8"/>`;
  s += `<line x1="${px(pad + 1)}" y1="${px(pad + L)}" x2="${px(pad + W / 2)}" y2="${px(pad + L)}" stroke="#0ea5e9" stroke-width="8"/>`;
  s += `<line x1="${px(pad)}" y1="${px(pad + 1)}" x2="${px(pad)}" y2="${px(pad + L / 2)}" stroke="#0ea5e9" stroke-width="8"/>`;
  // در ورودی (کمان) — dx در وسط ضلع بالایی
  const dx = px(pad + W / 2);
  s += `<g stroke="#f59e0b" fill="none" stroke-width="3">
        <line x1="${dx}" y1="${px(pad)}" x2="${dx}" y2="${px(pad)}" stroke-width="14" stroke="#f8fafc"/>
        <path d="M ${dx} ${px(pad)} A 50 50 0 0 0 ${dx - 50} ${px(pad) - 50}"/>
        <line x1="${dx}" y1="${px(pad)}" x2="${dx}" y2="${px(pad) - 50}"/>
      </g>`;
  return s;
}

function updateStatus() {
  const area = state.rooms.reduce((a, r) => a + r.w * r.h, 0);
  $("statusArea").textContent = `مساحت مفید: ${area.toFixed(1)} م²`;
  $("statusRooms").textContent = `اتاق‌ها: ${state.rooms.length}`;
  $("statusZoom").textContent = `زوم: ${Math.round(state.scale / 40 * 100)}٪`;
  const nCols = computeColumns().length;
  $("structInfo").textContent = `ستون‌ها: ${nCols} عدد (${state.structure === "concrete" ? "بتنی" : "فلزی"})`;
}

/* ---------- زوم از مرکز ویوپورت ---------- */
function zoomAtCenter(factor) {
  const r = svg.getBoundingClientRect();
  const cx = r.width / 2, cy = r.height / 2; // مرکز ویوپورت
  const ns = Math.min(Math.max(state.scale * factor, 8), 200);
  // فرمول زوم حول نقطه: نگه‌داشتن نقطه زیر نشانگر ثابت
  state.tx = cx - ((cx - state.tx) * ns) / state.scale;
  state.ty = cy - ((cy - state.ty) * ns) / state.scale;
  state.scale = ns;
  applyTransform();
  updateStatus();
}

/* ---------- رویدادها ---------- */
$("zoomIn").addEventListener("click", () => zoomAtCenter(1.25));
$("zoomOut").addEventListener("click", () => zoomAtCenter(0.8));
$("zoomReset").addEventListener("click", resetView);
$("zoomFit").addEventListener("click", resetView);

svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomAtCenter(e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });

// پن
let dragging = false, sx = 0, sy = 0;
svg.addEventListener("pointerdown", (e) => {
  dragging = true; sx = e.clientX - state.tx; sy = e.clientY - state.ty;
  svg.classList.add("dragging"); svg.setPointerCapture(e.pointerId);
});
svg.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  state.tx = e.clientX - sx; state.ty = e.clientY - sy;
  applyTransform();
});
svg.addEventListener("pointerup", () => { dragging = false; svg.classList.remove("dragging"); });

/* ---------- فرم‌ها ---------- */
function syncFromForm() {
  state.width = +$("inWidth").value || 15;
  state.length = +$("inLength").value || 12;
  state.bedrooms = +$("inBedrooms").value || 2;
  state.floors = +$("inFloors").value || 2;
  state.smartColumns = $("smartColumns").checked;
  state.showDims = $("showDims").checked;
}
document.querySelectorAll("#structureType .seg").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#structureType .seg").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.structure = btn.dataset.val;
    render2D();
  });
});
["inWidth", "inLength", "inBedrooms", "inFloors", "smartColumns", "showDims"].forEach(id => {
  $(id).addEventListener("change", () => { syncFromForm(); generateRooms(); resetView(); });
});

$("btnRun").addEventListener("click", () => {
  syncFromForm(); generateRooms(); resetView();
  if (state.view === "3d") build3D();
  const btn = $("btnRun");
  btn.textContent = "✅ پلان تولید شد";
  setTimeout(() => (btn.textContent = "🚀 اجرای طراحی و تولید پلان"), 1600);
});

$("btnAddRoom").addEventListener("click", () => {
  state.rooms.push({
    name: "اتاق اضافه " + (state.rooms.length + 1),
    x: 0.5, y: 0.5, w: 3, h: 3, color: "#e0e7ff",
  });
  render2D();
});
$("btnDelBalcony").addEventListener("click", () => {
  state.rooms = state.rooms.filter(r => !/بالکن|تراس/.test(r.name));
  render2D();
});
$("btnExport").addEventListener("click", () => {
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>' + svg.outerHTML], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "floorplan.svg";
  a.click();
});
$("btnPrint").addEventListener("click", () => window.print());

/* ---------- سوییچ ۲بعدی / ۳بعدی ---------- */
$("btn2d").addEventListener("click", () => switchView("2d"));
$("btn3d").addEventListener("click", () => switchView("3d"));
function switchView(v) {
  state.view = v;
  $("btn2d").classList.toggle("active", v === "2d");
  $("btn3d").classList.toggle("active", v === "3d");
  $("canvas2d").classList.toggle("active", v === "2d");
  $("canvas3d").classList.toggle("active", v === "3d");
  if (v === "2d") { setTimeout(resetView, 50); }
  else build3D();
}

/* ---------- ۳بعدی (Three.js + OrbitControls) ---------- */
let renderer3, scene3, camera3, controls3;
function build3D() {
  if (typeof THREE === "undefined") {
    $("threeContainer").innerHTML =
      '<p style="padding:2rem;text-align:center;color:#64748b">Three.js بارگذاری نشد (عدم دسترسی CDN). نمای ۲بعدی فعال است.</p>';
    return;
  }
  const cont = $("threeContainer");
  cont.innerHTML = "";
  if (!renderer3) {
    renderer3 = new THREE.WebGLRenderer({ antialias: true });
    cont.appendChild(renderer3.domElement);
  }
  const w = cont.clientWidth, h = cont.clientHeight;
  renderer3.setSize(w, h);
  scene3 = new THREE.Scene();
  scene3.background = new THREE.Color(0xdfe8f2);
  camera3 = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
  camera3.position.set(state.width * 1.2, state.width, state.length * 1.4);
  controls3 = new THREE.OrbitControls(camera3, renderer3.domElement);
  controls3.enableDamping = true;

  scene3.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(20, 30, 15);
  scene3.add(dl);

  const fh = 3.2, ft = 0.25; // ارتفاع طبقه و ضخامت دال
  const cols = computeColumns();
  const colGeo = new THREE.BoxGeometry(0.4, fh, 0.4);
  const colMat = new THREE.MeshLambertMaterial({ color: state.structure === "concrete" ? 0x9ca3af : 0x64748b });
  const slabMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.75 });
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.55 });

  for (let f = 0; f < state.floors; f++) {
    const y = f * fh;
    // ستون‌ها
    for (const c of cols) {
      const m = new THREE.Mesh(colGeo, colMat);
      m.position.set(c.x, y + fh / 2, c.y);
      scene3.add(m);
    }
    // دال
    const slab = new THREE.Mesh(new THREE.BoxGeometry(state.width, ft, state.length), slabMat);
    slab.position.set(state.width / 2, y + fh, state.length / 2);
    scene3.add(slab);
    // دیوار محیطی نیمه‌شفاف
    if (f < state.floors - 1 || f === 0) {
      const mkWall = (ww, dd, px, pz) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, fh, dd), wallMat);
        wall.position.set(px, y + fh / 2, pz);
        scene3.add(wall);
      };
      mkWall(state.width, 0.2, state.width / 2, 0.1);
      mkWall(state.width, 0.2, state.width / 2, state.length - 0.1);
      mkWall(0.2, state.length, 0.1, state.length / 2);
      mkWall(0.2, state.length, state.width - 0.1, state.length / 2);
    }
  }
  // زمین
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(state.width * 3, state.length * 3),
    new THREE.MeshLambertMaterial({ color: 0xa7c4a0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(state.width / 2, -0.05, state.length / 2);
  scene3.add(ground);

  if (!build3D._loop) {
    build3D._loop = true;
    (function loop() {
      requestAnimationFrame(loop);
      if (controls3) { controls3.update(); renderer3.render(scene3, camera3); }
    })();
  } else {
    renderer3.render(scene3, camera3);
  }
}
window.addEventListener("resize", () => {
  if (state.view !== "3d" || !renderer3) return;
  const cont = $("threeContainer");
  camera3.aspect = cont.clientWidth / cont.clientHeight;
  camera3.updateProjectionMatrix();
  renderer3.setSize(cont.clientWidth, cont.clientHeight);
});

/* ---------- شروع ---------- */
syncFromForm();
generateRooms();
window.addEventListener("load", () => setTimeout(resetView, 60));
setTimeout(resetView, 300);
