// وضعیت کلی اپلیکیشن
const state = {
  viewMode: '2d',
  zoom: 1,
  selectedId: null,
  floors: 3,
  structureType: 'concrete',
  smartColumns: true,
  hideWithCabinets: true,
  plotW: 10,
  plotH: 12,
  rooms: [],
  columns: [],
  history: []
};

function saveHistory() {
  state.history.push(JSON.stringify(state.rooms));
  if (state.history.length > 20) state.history.shift();
}

// المان‌های DOM
const viewportGroup = document.getElementById('viewportGroup');
const roomsGroup = document.getElementById('roomsGroup');
const columnsGroup = document.getElementById('columnsGroup');
const furnitureGroup = document.getElementById('furnitureGroup');
const zoomLevelText = document.getElementById('zoomLevelText');
const planSvg = document.getElementById('planSvg');

const view2dBtn = document.getElementById('view2dBtn');
const view3dBtn = document.getElementById('view3dBtn');
const canvasWrap2D = document.getElementById('canvasWrap2D');
const canvasWrap3D = document.getElementById('canvasWrap3D');
const zoomControls2D = document.getElementById('zoomControls2D');
const hint3D = document.getElementById('hint3D');
const viewTitle = document.getElementById('viewTitle');

const floorsSlider = document.getElementById('floorsCount');
const floorsText = document.getElementById('floorsCountText');
const structureSelect = document.getElementById('structureType');

// ۱. مدیریت زوم ۲بعدی
function applyZoom(newZoom) {
  state.zoom = Math.min(Math.max(newZoom, 0.4), 2.5);
  viewportGroup.setAttribute('transform', `scale(${state.zoom})`);
  zoomLevelText.innerText = `${Math.round(state.zoom * 100)}%`;
}

document.getElementById('zoomInBtn').onclick = () => applyZoom(state.zoom + 0.15);
document.getElementById('zoomOutBtn').onclick = () => applyZoom(state.zoom - 0.15);
document.getElementById('zoomResetBtn').onclick = () => applyZoom(1);

planSvg.addEventListener('wheel', (e) => {
  e.preventDefault();
  applyZoom(state.zoom + (e.deltaY < 0 ? 0.1 : -0.1));
}, { passive: false });

// ۲. کلید برگشت و پروژه جدید
document.getElementById('undoBtn').onclick = () => {
  if (state.history.length > 0) {
    state.rooms = JSON.parse(state.history.pop());
    generateStructuralColumns();
    renderPlan2D();
    if (state.viewMode === '3d') update3DScene();
  }
};

document.getElementById('newProjectBtn').onclick = () => {
  if (confirm('آیا می‌خواهید نقشه پاک شود؟')) {
    saveHistory();
    state.rooms = [];
    state.columns = [];
    renderPlan2D();
    if (state.viewMode === '3d') update3DScene();
  }
};

// ۳. تغییر طبقات و نوع سازه
floorsSlider.oninput = (e) => {
  state.floors = parseInt(e.target.value);
  floorsText.innerText = `${state.floors} طبقه`;
  if (state.viewMode === '3d') update3DScene();
};

structureSelect.onchange = (e) => {
  state.structureType = e.target.value;
  renderPlan2D();
  if (state.viewMode === '3d') update3DScene();
};

// ۴. ساخت خودکار پلان و آکس‌بندی ستون‌ها
function generateAutoPlan() {
  saveHistory();
  state.plotW = parseFloat(document.getElementById('plotWidth').value) || 10;
  state.plotH = parseFloat(document.getElementById('plotHeight').value) || 12;
  const beds = parseInt(document.getElementById('bedCount').value) || 2;
  const hasBalcony = document.getElementById('hasBalcony').checked;
  state.smartColumns = document.getElementById('smartColumns').checked;
  state.hideWithCabinets = document.getElementById('hideWithCabinets').checked;

  const w = state.plotW * 40;
  const h = state.plotH * 40;
  const startX = (1200 - w) / 2;
  const startY = (800 - h) / 2;

  const newRooms = [];
  const livingHeight = h * 0.55;

  newRooms.push({ id: 1, name: 'پذیرایی و نشیمن', x: startX, y: startY, width: w * 0.65, height: livingHeight });
  newRooms.push({ id: 2, name: 'آشپزخانه', x: startX + (w * 0.65), y: startY, width: w * 0.35, height: livingHeight * 0.65 });
  newRooms.push({ id: 3, name: 'حمام و سرویس', x: startX + (w * 0.65), y: startY + (livingHeight * 0.65), width: w * 0.35, height: livingHeight * 0.35 });

  const bedWidth = w / beds;
  const bedHeight = h - livingHeight;
  for (let i = 0; i < beds; i++) {
    newRooms.push({
      id: 4 + i,
      name: `اتاق خواب ${i + 1}`,
      x: startX + (i * bedWidth),
      y: startY + livingHeight,
      width: bedWidth - (hasBalcony && i === beds - 1 ? 50 : 0),
      height: bedHeight
    });
  }

  if (hasBalcony) {
    newRooms.push({ id: 99, name: 'بالکن', x: startX + w - 50, y: startY + livingHeight, width: 50, height: bedHeight });
  }

  state.rooms = newRooms;
  generateStructuralColumns();
  renderPlan2D();
  if (state.viewMode === '3d') update3DScene();
}

document.getElementById('generateBtn').onclick = generateAutoPlan;

// ۵. الگوریتم ستون‌گذاری
function generateStructuralColumns() {
  state.columns = [];
  if (!state.smartColumns) return;

  const colSize = state.structureType === 'concrete' ? 18 : 10;
  const points = new Set();

  state.rooms.forEach(r => {
    const corners = [
      `${r.x},${r.y}`,
      `${r.x + r.width},${r.y}`,
      `${r.x},${r.y + r.height}`,
      `${r.x + r.width},${r.y + r.height}`
    ];
    corners.forEach(p => points.add(p));
  });

  points.forEach(p => {
    const [x, y] = p.split(',').map(Number);
    state.columns.push({ x: x - colSize / 2, y: y - colSize / 2, size: colSize });
  });
}

// ۶. رندر پلان ۲بعدی
function renderPlan2D() {
  roomsGroup.innerHTML = '';
  columnsGroup.innerHTML = '';
  furnitureGroup.innerHTML = '';

  state.rooms.forEach(room => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'move';

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', room.x);
    rect.setAttribute('y', room.y);
    rect.setAttribute('width', room.width);
    rect.setAttribute('height', room.height);
    rect.setAttribute('class', `room-rect ${state.selectedId === room.id ? 'selected' : ''}`);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', room.x + room.width / 2);
    text.setAttribute('y', room.y + room.height / 2);
    text.setAttribute('class', 'room-text');
    text.textContent = room.name;

    const subtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subtext.setAttribute('x', room.x + room.width / 2);
    subtext.setAttribute('y', room.y + room.height / 2 + 18);
    subtext.setAttribute('class', 'room-subtext');
    subtext.textContent = `${Math.round((room.width * room.height) / 1600)} م.م`;

    if (state.hideWithCabinets && (room.name.includes('خواب') || room.name.includes('آشپزخانه'))) {
      const cab = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      cab.setAttribute('x', room.x + 2);
      cab.setAttribute('y', room.y + 2);
      cab.setAttribute('width', room.name.includes('خواب') ? 25 : 30);
      cab.setAttribute('height', room.height - 4);
      cab.setAttribute('class', 'cabinet-rect');
      furnitureGroup.appendChild(cab);
    }

    g.appendChild(rect);
    g.appendChild(text);
    g.appendChild(subtext);
    roomsGroup.appendChild(g);
  });

  state.columns.forEach(col => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', col.x);
    rect.setAttribute('y', col.y);
    rect.setAttribute('width', col.size);
    rect.setAttribute('height', col.size);
    rect.setAttribute('class', `column-rect ${state.structureType}`);
    columnsGroup.appendChild(rect);
  });
}

// ۷. موتور سه‌بعدی Three.js
let scene, camera, renderer, controls, skeletonGroup;

function init3D() {
  const container = document.getElementById('threeContainer');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d16);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 3000);
  camera.position.set(600, 700, 800);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
  dirLight.position.set(400, 800, 500);
  scene.add(dirLight);

  const gridHelper = new THREE.GridHelper(1400, 30, 0x1e293b, 0x0f172a);
  gridHelper.position.y = -2;
  scene.add(gridHelper);

  skeletonGroup = new THREE.Group();
  scene.add(skeletonGroup);

  document.getElementById('resetCameraBtn').onclick = () => {
    camera.position.set(600, 700, 800);
    controls.target.set(0, (state.floors * 60) / 2, 0);
  };

  window.addEventListener('resize', onWindowResize);
  animate();
}

function onWindowResize() {
  const container = document.getElementById('threeContainer');
  if (!container || !renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function update3DScene() {
  if (!skeletonGroup) return;

  while (skeletonGroup.children.length > 0) {
    skeletonGroup.remove(skeletonGroup.children[0]);
  }

  const isConcrete = state.structureType === 'concrete';
  const floorHeight = 70;
  const colThickness = isConcrete ? 10 : 5;

  const colMaterial = new THREE.MeshStandardMaterial({
    color: isConcrete ? 0x94a3b8 : 0xe11d48,
    metalness: isConcrete ? 0.1 : 0.8,
    roughness: isConcrete ? 0.9 : 0.2
  });

  const slabMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.35
  });

  const beamMaterial = new THREE.MeshStandardMaterial({
    color: isConcrete ? 0x64748b : 0xbe123c,
    metalness: isConcrete ? 0.1 : 0.7
  });

  const centerX = 600;
  const centerZ = 400;

  for (let f = 0; f < state.floors; f++) {
    const currentY = f * floorHeight;

    state.rooms.forEach(r => {
      const slabGeo = new THREE.BoxGeometry(r.width, 3, r.height);
      const slabMesh = new THREE.Mesh(slabGeo, slabMaterial);
      slabMesh.position.set((r.x + r.width / 2) - centerX, currentY + floorHeight, (r.y + r.height / 2) - centerZ);
      skeletonGroup.add(slabMesh);

      const beamGeoX = new THREE.BoxGeometry(r.width, colThickness * 0.8, colThickness * 0.8);
      const beamMesh1 = new THREE.Mesh(beamGeoX, beamMaterial);
      beamMesh1.position.set((r.x + r.width / 2) - centerX, currentY + floorHeight, r.y - centerZ);
      skeletonGroup.add(beamMesh1);

      const beamMesh2 = new THREE.Mesh(beamGeoX, beamMaterial);
      beamMesh2.position.set((r.x + r.width / 2) - centerX, currentY + floorHeight, (r.y + r.height) - centerZ);
      skeletonGroup.add(beamMesh2);
    });

    state.columns.forEach(col => {
      const colGeo = new THREE.BoxGeometry(colThickness, floorHeight, colThickness);
      const colMesh = new THREE.Mesh(colGeo, colMaterial);
      colMesh.position.set((col.x + col.size / 2) - centerX, currentY + floorHeight / 2, (col.y + col.size / 2) - centerZ);
      skeletonGroup.add(colMesh);
    });
  }

  if (controls) {
    controls.target.set(0, (state.floors * floorHeight) / 2, 0);
  }
}

// ۸. سوییچ بین حالت ۲بعدی و ۳بعدی
view2dBtn.onclick = () => {
  state.viewMode = '2d';
  view2dBtn.classList.add('is-active');
  view3dBtn.classList.remove('is-active');
  canvasWrap2D.classList.remove('hidden');
  canvasWrap3D.classList.add('hidden');
  zoomControls2D.classList.remove('hidden');
  hint3D.classList.add('hidden');
  viewTitle.innerText = 'پلان دوبعدی معماری';
};

view3dBtn.onclick = () => {
  state.viewMode = '3d';
  view3dBtn.classList.add('is-active');
  view2dBtn.classList.remove('is-active');
  canvasWrap3D.classList.remove('hidden');
  canvasWrap2D.classList.add('hidden');
  zoomControls2D.classList.add('hidden');
  hint3D.classList.remove('hidden');
  viewTitle.innerText = `مدل اسکلت سه‌بعدی (${state.floors} طبقه - ${state.structureType === 'concrete' ? 'بتنی' : 'فلزی'})`;

  if (!scene) init3D();
  setTimeout(() => {
    onWindowResize();
    update3DScene();
  }, 50);
};

// ابزارهای سریع
document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.onclick = () => {
    saveHistory();
    const action = btn.getAttribute('data-quick');
    if (action === 'add-bed') {
      const id = Date.now();
      state.rooms.push({ id, name: 'اتاق جدید', x: 400, y: 300, width: 140, height: 120 });
    } else if (action === 'del-balcony') {
      state.rooms = state.rooms.filter(r => r.name !== 'بالکن');
    }
    generateStructuralColumns();
    renderPlan2D();
    if (state.viewMode === '3d') update3DScene();
  };
});

// خروجی چاپ و SVG
document.getElementById('printBtn').onclick = () => window.print();
document.getElementById('exportSvgBtn').onclick = () => {
  const svgData = new XMLSerializer().serializeToString(planSvg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'floorplan.svg';
  a.click();
};

// شروع اولیه
generateAutoPlan();
