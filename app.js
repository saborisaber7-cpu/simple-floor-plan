(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'building-floorplan-webapp-v2';
  const VIEW = { w: 1600, h: 1100 };
  const $ = (id) => document.getElementById(id);
  const faDigits = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (value) => String(Math.round(Number(value) || 0)).replace(/[0-9]/g, (d) => faDigits[d]);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const uid = () => `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  const els = {
    svg: $('planSvg'),
    scene: $('sceneLayer'),
    overlay: $('overlayLayer'),
    gridLayer: $('gridLayer'),
    canvasEmpty: $('canvasEmpty'),
    autoPanel: $('autoPanel'),
    manualPanel: $('manualPanel'),
    modeAutoBtn: $('modeAutoBtn'),
    modeManualBtn: $('modeManualBtn'),
    autoSummaryChip: $('autoSummaryChip'),
    manualHintChip: $('manualHintChip'),
    wizardStage: $('wizardStage'),
    wizardSteps: $('wizardSteps'),
    wizardBackBtn: $('wizardBackBtn'),
    wizardNextBtn: $('wizardNextBtn'),
    generateBtn: $('generateBtn'),
    commandInput: $('commandInput'),
    sendCommandBtn: $('sendCommandBtn'),
    projectTitle: $('projectTitle'),
    summaryStrip: $('summaryStrip'),
    printTitle: $('printTitle'),
    printSummary: $('printSummary'),
    undoBtn: $('undoBtn'),
    redoBtn: $('redoBtn'),
    saveBtn: $('saveBtn'),
    loadBtn: $('loadBtn'),
    importFile: $('importFile'),
    printBtn: $('printBtn'),
    exportSvgBtn: $('exportSvgBtn'),
    gridToggle: $('gridToggle'),
    snapToggle: $('snapToggle'),
    zoomOutBtn: $('zoomOutBtn'),
    zoomInBtn: $('zoomInBtn'),
    resetZoomBtn: $('resetZoomBtn'),
    zoomReadout: $('zoomReadout'),
    inspectorGrid: $('inspectorGrid'),
    selectionMeta: $('selectionMeta'),
    summaryStrip: $('summaryStrip'),
    svgDefs: $('svgDefs'),
  };

  const roomPalette = {
    living: { label: 'پذیرایی', fill: '#e9f4ff', stroke: '#284c6b' },
    kitchen: { label: 'آشپزخانه', fill: '#fff0dc', stroke: '#8c5a1d' },
    kitchenOpen: { label: 'آشپزخانه باز', fill: '#fff4e7', stroke: '#ab7425' },
    bedroom: { label: 'اتاق خواب', fill: '#f0ecff', stroke: '#5b4ea3' },
    bathroom: { label: 'حمام', fill: '#eef8ff', stroke: '#2f6e8a' },
    balcony: { label: 'بالکن', fill: '#e8fbf2', stroke: '#2a7b54' },
    hall: { label: 'راهرو', fill: '#f4f7f7', stroke: '#5f6d72' },
    entry: { label: 'ورودی', fill: '#f7f3ea', stroke: '#8d7458' },
    custom: { label: 'فضا', fill: '#f7f7f7', stroke: '#394c54' },
  };

  const defaultAuto = {
    footprintMode: 'dims',
    area: 120,
    length: 12,
    width: 10,
    bedrooms: 2,
    bathrooms: 1,
    kitchen: 'open',
    balcony: 'yes',
    entrySide: 'south',
    kitchenPlacement: 'nearLiving',
    title: 'نقشه مسکونی',
  };

  const state = {
    mode: 'auto',
    wizardStep: 0,
    auto: { ...defaultAuto },
    plan: {
      title: 'پروژه جدید',
      scale: 72,
      footprint: { x: 110, y: 120, w: 960, h: 760 },
      rooms: [],
      walls: [],
      openings: [],
      selected: null,
    },
    grid: true,
    snap: true,
    zoom: 1,
    tool: 'select',
    history: [],
    future: [],
    draft: null,
    drag: null,
    command: '',
    status: 'ready',
  };

  function snapshot() {
    return deepClone({
      mode: state.mode,
      wizardStep: state.wizardStep,
      auto: state.auto,
      plan: state.plan,
      grid: state.grid,
      snap: state.snap,
      zoom: state.zoom,
      tool: state.tool,
    });
  }

  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 60) state.history.shift();
    state.future.length = 0;
    refreshActions();
  }

  function restore(snap) {
    state.mode = snap.mode || 'auto';
    state.wizardStep = snap.wizardStep || 0;
    state.auto = { ...defaultAuto, ...(snap.auto || {}) };
    state.plan = snap.plan || state.plan;
    state.grid = snap.grid ?? true;
    state.snap = snap.snap ?? true;
    state.zoom = snap.zoom || 1;
    state.tool = snap.tool || 'select';
    syncModeUI();
    syncControls();
    renderAll();
  }

  function saveLocal(silent = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
    if (!silent) setStatus('ذخیره شد');
  }

  function loadLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      restore(parsed);
      return true;
    } catch {
      return false;
    }
  }

  let saveTimer = null;
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLocal(true), 180);
  }

  function setStatus(text) {
    state.status = text;
    els.manualHintChip.textContent = `ابزار انتخاب شده: ${toolLabel(state.tool)}`;
    els.autoSummaryChip.textContent = buildAutoSummary();
    els.printTitle.textContent = state.plan.title || 'طراحی نقشه ساختمان';
    els.printSummary.textContent = buildSummaryText();
    queueSave();
  }

  function toolLabel(tool) {
    return ({ select: 'انتخاب', room: 'افزودن اتاق', wall: 'ترسیم دیوار', door: 'در', window: 'پنجره', delete: 'حذف' }[tool] || 'انتخاب');
  }

  function roomLabel(type, openKitchen = false) {
    if (type === 'kitchen') return openKitchen ? roomPalette.kitchenOpen.label : roomPalette.kitchen.label;
    return (roomPalette[type] || roomPalette.custom).label;
  }

  function areaText(room) {
    return `${fa((room.w * room.h) / (state.plan.scale * state.plan.scale))} مترمربع`;
  }

  function buildAutoSummary() {
    const a = state.auto;
    const dims = a.footprintMode === 'area'
      ? `${fa(a.area)} مترمربع`
      : `${fa(a.length)}×${fa(a.width)} متر`;
    return `${dims} | ${fa(a.bedrooms)} خواب | ${fa(a.bathrooms)} حمام | ${a.kitchen === 'open' ? 'آشپزخانه باز' : 'آشپزخانه بسته'}`;
  }

  function buildSummaryText() {
    const rooms = state.plan.rooms.length;
    const walls = state.plan.walls.length;
    const totalArea = estimateArea();
    return `${fa(totalArea)} مترمربع | ${fa(rooms)} فضا | ${fa(walls)} دیوار`;
  }

  function estimateArea() {
    const f = state.plan.footprint;
    return Math.round((f.w / state.plan.scale) * (f.h / state.plan.scale));
  }

  function syncModeUI() {
    const auto = state.mode === 'auto';
    els.modeAutoBtn.classList.toggle('is-active', auto);
    els.modeManualBtn.classList.toggle('is-active', !auto);
    els.autoPanel.classList.toggle('hidden', !auto);
    els.manualPanel.classList.toggle('hidden', auto);
  }

  function syncControls() {
    els.gridToggle.checked = state.grid;
    els.snapToggle.checked = state.snap;
    els.zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
    els.selectionMeta.textContent = describeSelection();
    renderWizard();
    renderInspector();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    pushHistory();
    state.mode = mode;
    if (mode === 'manual' && state.plan.rooms.length === 0) {
      initManualSeed();
    }
    syncModeUI();
    renderAll();
    setStatus(mode === 'auto' ? 'حالت ساده' : 'حالت دستی');
  }

  function meterToScene(m) {
    return m * state.plan.scale;
  }

  function sceneToMeter(px) {
    return px / state.plan.scale;
  }

  function getSvgPoint(evt) {
    const rect = els.svg.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * VIEW.w;
    const y = ((evt.clientY - rect.top) / rect.height) * VIEW.h;
    return { x: x / state.zoom, y: y / state.zoom };
  }

  function snapPoint(p) {
    if (!state.snap) return p;
    const grid = 20;
    return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
  }

  function rectFromPoints(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    return { x, y, w, h };
  }

  function normalizeRect(r) {
    return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
  }

  function selectedItem() {
    if (!state.plan.selected) return null;
    const { kind, id } = state.plan.selected;
    return state.plan[kind + 's'].find((item) => item.id === id) || null;
  }

  function setSelected(kind, id, extra = {}) {
    if (!kind || !id) {
      state.plan.selected = null;
    } else {
      state.plan.selected = { kind, id, ...extra };
    }
    renderInspector();
    renderAll();
  }

  function describeSelection() {
    const item = selectedItem();
    if (!item) return 'هیچ موردی انتخاب نشده';
    return `${kindLabel(item.kind || state.plan.selected?.kind)}: ${item.label || roomLabel(item.type || 'custom')}`;
  }

  function kindLabel(kind) {
    return ({ room: 'فضا', wall: 'دیوار', opening: 'بازشو' }[kind] || 'مورد');
  }

  function initManualSeed() {
    const f = { x: 110, y: 120, w: 980, h: 760 };
    state.plan = {
      title: 'پروژه دستی',
      scale: 72,
      footprint: f,
      rooms: [],
      walls: [],
      openings: [],
      selected: null,
    };
  }

  function newRoom(type, x, y, w, h, opts = {}) {
    const pal = roomPalette[type] || roomPalette.custom;
    return {
      id: uid(),
      kind: 'room',
      type,
      x, y, w, h,
      label: opts.label || roomLabel(type, opts.openKitchen),
      openKitchen: !!opts.openKitchen,
      fill: opts.fill || pal.fill,
      stroke: opts.stroke || pal.stroke,
      locked: !!opts.locked,
    };
  }

  function newWall(x1, y1, x2, y2) {
    return { id: uid(), kind: 'wall', x1, y1, x2, y2, label: 'دیوار' };
  }

  function newOpening(type, wallId, x, y, angle = 0) {
    return { id: uid(), kind: 'opening', type, wallId, x, y, angle, label: type === 'door' ? 'در' : 'پنجره' };
  }

  function buildAutoPlan() {
    pushHistory();
    const a = state.auto;
    const scale = 72;
    const length = a.footprintMode === 'area' ? Math.max(8, Math.round(Math.sqrt(Number(a.area) || 120) * 1.2)) : Number(a.length) || 12;
    const width = a.footprintMode === 'area' ? Math.max(7, Math.round((Number(a.area) || 120) / length)) : Number(a.width) || 10;
    const footprint = { x: 140, y: 120, w: meterToScene(length), h: meterToScene(width) };
    const inner = { x: footprint.x + 28, y: footprint.y + 28, w: footprint.w - 56, h: footprint.h - 56 };
    const title = a.title || 'نقشه مسکونی';
    const bedrooms = clamp(Number(a.bedrooms) || 1, 1, 6);
    const bathrooms = clamp(Number(a.bathrooms) || 1, 1, 4);
    const kitchenOpen = a.kitchen === 'open';
    const rooms = [];
    const walls = [];
    const openings = [];
    const gap = 14;
    const topBand = Math.max(220, inner.h * 0.35);
    const bottomBand = inner.h - topBand - gap;
    const serviceStrip = Math.max(160, inner.w * 0.24);
    const bedroomAreaW = inner.w - serviceStrip - gap;
    const rowCount = bedrooms > 2 ? 2 : 1;
    const colCount = bedrooms > 2 ? 2 : bedrooms;
    const cellW = (bedroomAreaW - (colCount - 1) * gap) / colCount;
    const cellH = (topBand - (rowCount - 1) * gap) / rowCount;

    for (let i = 0; i < bedrooms; i += 1) {
      const row = Math.floor(i / colCount);
      const col = i % colCount;
      const x = inner.x + col * (cellW + gap);
      const y = inner.y + row * (cellH + gap);
      rooms.push(newRoom('bedroom', x, y, cellW, cellH, { label: `اتاق خواب ${fa(i + 1)}` }));
    }

    const bathW = serviceStrip;
    const bathH = (topBand - (bathrooms - 1) * gap) / bathrooms;
    for (let i = 0; i < bathrooms; i += 1) {
      const x = inner.x + bedroomAreaW + gap;
      const y = inner.y + i * (bathH + gap);
      rooms.push(newRoom('bathroom', x, y, bathW, bathH, { label: bathrooms > 1 ? `حمام ${fa(i + 1)}` : 'حمام' }));
    }

    const livingW = Math.max(340, inner.w * 0.58);
    const kitchenW = inner.w - livingW - gap;
    const livingH = bottomBand;
    const living = newRoom('living', inner.x, inner.y + topBand + gap, livingW, livingH, { label: 'پذیرایی' });
    const kitchen = newRoom('kitchen', inner.x + livingW + gap, inner.y + topBand + gap, kitchenW, bottomBand, { label: kitchenOpen ? 'آشپزخانه باز' : 'آشپزخانه بسته', openKitchen: kitchenOpen });
    rooms.push(living, kitchen);

    const hall = newRoom('hall', inner.x + livingW - 110, inner.y + topBand + gap, 110, bottomBand, { label: 'راهرو', fill: '#eef2f1', stroke: '#6d7a7f' });
    rooms.push(hall);

    if (a.balcony === 'yes') {
      rooms.push(newRoom('balcony', living.x + living.w - 200, living.y + living.h - 110, 200, 110, { label: 'بالکن' }));
    }

    const outer = [
      newWall(footprint.x, footprint.y, footprint.x + footprint.w, footprint.y),
      newWall(footprint.x + footprint.w, footprint.y, footprint.x + footprint.w, footprint.y + footprint.h),
      newWall(footprint.x + footprint.w, footprint.y + footprint.h, footprint.x, footprint.y + footprint.h),
      newWall(footprint.x, footprint.y + footprint.h, footprint.x, footprint.y),
    ];

    if (a.entrySide === 'south') openings.push(newOpening('door', outer[2].id, footprint.x + footprint.w / 2, footprint.y + footprint.h, 0));
    if (a.entrySide === 'north') openings.push(newOpening('door', outer[0].id, footprint.x + footprint.w / 2, footprint.y, 0));
    if (a.entrySide === 'east') openings.push(newOpening('door', outer[1].id, footprint.x + footprint.w, footprint.y + footprint.h / 2, 90));
    if (a.entrySide === 'west') openings.push(newOpening('door', outer[3].id, footprint.x, footprint.y + footprint.h / 2, 90));

    openings.push(newOpening('window', living.id, living.x + living.w * 0.45, living.y + living.h, 0));
    openings.push(newOpening('door', kitchen.id, kitchen.x, kitchen.y + kitchen.h * 0.35, 90));

    state.plan = { title, scale, footprint, rooms, walls: outer, openings, selected: null };
    state.zoom = 1;
    state.tool = 'select';
    state.grid = true;
    state.snap = true;
    state.mode = 'auto';
    syncModeUI();
    syncControls();
    renderAll();
    setStatus('نقشه خودکار ساخته شد');
  }

  function rebuildAutoRooms() {
    buildAutoPlan();
  }

  function swapKitchenAndLiving() {
    const living = state.plan.rooms.find((r) => r.type === 'living');
    const kitchen = state.plan.rooms.find((r) => r.type === 'kitchen');
    if (!living || !kitchen) return false;
    pushHistory();
    const temp = { x: living.x, y: living.y, w: living.w, h: living.h, label: living.label, fill: living.fill, stroke: living.stroke };
    living.x = kitchen.x; living.y = kitchen.y; living.w = kitchen.w; living.h = kitchen.h; living.label = kitchen.label; living.fill = kitchen.fill; living.stroke = kitchen.stroke;
    kitchen.x = temp.x; kitchen.y = temp.y; kitchen.w = temp.w; kitchen.h = temp.h; kitchen.label = temp.label; kitchen.fill = temp.fill; kitchen.stroke = temp.stroke;
    kitchen.openKitchen = !kitchen.openKitchen;
    if (kitchen.openKitchen) kitchen.label = 'آشپزخانه باز';
    setStatus('جابجایی انجام شد');
    renderAll();
    return true;
  }

  function addAutoBedroom() {
    const rooms = state.plan.rooms.filter((r) => r.type === 'bedroom');
    if (rooms.length >= 6) return false;
    pushHistory();
    const last = rooms[rooms.length - 1] || state.plan.rooms.find((r) => r.type === 'living');
    if (!last) return false;
    const w = Math.max(180, last.w * 0.82);
    const h = Math.max(150, last.h * 0.75);
    state.plan.rooms.push(newRoom('bedroom', last.x + 18, last.y + 18, w, h, { label: `اتاق خواب ${fa(rooms.length + 1)}` }));
    setStatus('اتاق خواب اضافه شد');
    renderAll();
    return true;
  }

  function removeAutoBalcony() {
    const before = state.plan.rooms.length;
    pushHistory();
    state.plan.rooms = state.plan.rooms.filter((r) => r.type !== 'balcony');
    if (state.plan.rooms.length === before) return false;
    setStatus('بالکن حذف شد');
    renderAll();
    return true;
  }

  function biggerLiving() {
    const living = state.plan.rooms.find((r) => r.type === 'living');
    if (!living) return false;
    pushHistory();
    living.w = clamp(living.w + 70, 300, state.plan.footprint.w - 250);
    living.h = clamp(living.h + 30, 220, state.plan.footprint.h - 220);
    setStatus('پذیرایی بزرگ‌تر شد');
    renderAll();
    return true;
  }

  function toggleKitchenType() {
    const kitchen = state.plan.rooms.find((r) => r.type === 'kitchen');
    if (!kitchen) return false;
    pushHistory();
    kitchen.openKitchen = !kitchen.openKitchen;
    kitchen.label = roomLabel('kitchen', kitchen.openKitchen);
    kitchen.fill = kitchen.openKitchen ? roomPalette.kitchenOpen.fill : roomPalette.kitchen.fill;
    kitchen.stroke = kitchen.openKitchen ? roomPalette.kitchenOpen.stroke : roomPalette.kitchen.stroke;
    setStatus('نوع آشپزخانه تغییر کرد');
    renderAll();
    return true;
  }

  function addBathroom() {
    pushHistory();
    const bathCount = state.plan.rooms.filter((r) => r.type === 'bathroom').length;
    const base = state.plan.rooms.find((r) => r.type === 'bathroom') || state.plan.rooms.find((r) => r.type === 'kitchen');
    if (!base) return false;
    const room = newRoom('bathroom', base.x + 24, base.y + 24, Math.max(140, base.w * 0.85), Math.max(130, base.h * 0.8), { label: `حمام ${fa(bathCount + 1)}` });
    state.plan.rooms.push(room);
    setStatus('حمام اضافه شد');
    renderAll();
    return true;
  }

  function applyCommand(text) {
    const value = text.trim();
    if (!value) return;
    pushHistory();
    let handled = false;
    const t = value.replace(/\s+/g, '');
    if (/جابجا/.test(value) && /آشپزخانه/.test(value) && /پذیرایی/.test(value)) handled = swapKitchenAndLiving();
    else if (/(افزودن|اضافه).*(اتاق|خواب)/.test(value)) handled = addAutoBedroom();
    else if (/(حذف|بردار).*(بالکن)/.test(value)) handled = removeAutoBalcony();
    else if (/(بزرگ|گسترش).*(پذیرایی|نشیمن)/.test(value)) handled = biggerLiving();
    else if (/(باز|بسته).*(آشپزخانه)/.test(value)) handled = toggleKitchenType();
    else if (/(حمام|سرویس).*(اضافه|بیشتر)/.test(value)) handled = addBathroom();
    else if (/(دوباره|بازساز)/.test(value)) { rebuildAutoRooms(); handled = true; }
    if (!handled && /اتاق خواب/.test(value)) handled = addAutoBedroom();
    if (!handled) {
      setStatus('فرمان نامفهوم بود');
      renderAll();
      return;
    }
    els.commandInput.value = '';
    renderAll();
  }

  function updateWizardStep(delta) {
    state.wizardStep = clamp(state.wizardStep + delta, 0, 3);
    renderWizard();
  }

  function wizardFieldHTML() {
    const a = state.auto;
    const step = state.wizardStep;
    if (step === 0) {
      return `
        <div class="stage-card">
          <h2 class="stage-title">ابعاد را مشخص کنید</h2>
          <p class="stage-desc">می‌توانید مساحت یا طول و عرض را وارد کنید.</p>
          <div class="choice-row">
            <button type="button" class="ghost-btn ${a.footprintMode === 'area' ? 'is-active' : ''}" data-footprint-mode="area">فقط مساحت</button>
            <button type="button" class="ghost-btn ${a.footprintMode === 'dims' ? 'is-active' : ''}" data-footprint-mode="dims">طول و عرض</button>
          </div>
          ${a.footprintMode === 'area'
            ? `<div class="wizard-grid"><div class="field full"><span>مساحت (مترمربع)</span><input id="autoArea" type="number" min="30" max="1000" step="1" value="${a.area}"></div></div>`
            : `<div class="wizard-grid"><div class="field"><span>طول (متر)</span><input id="autoLength" type="number" min="4" max="30" step="0.1" value="${a.length}"></div><div class="field"><span>عرض (متر)</span><input id="autoWidth" type="number" min="4" max="30" step="0.1" value="${a.width}"></div></div>`}
        </div>`;
    }
    if (step === 1) {
      return `
        <div class="stage-card">
          <h2 class="stage-title">تعداد فضاها</h2>
          <p class="stage-desc">تعداد اتاق خواب و حمام را انتخاب کنید.</p>
          <div class="wizard-grid">
            <div class="field"><span>اتاق خواب</span><input id="autoBedrooms" type="number" min="1" max="6" step="1" value="${a.bedrooms}"></div>
            <div class="field"><span>حمام</span><input id="autoBathrooms" type="number" min="1" max="4" step="1" value="${a.bathrooms}"></div>
          </div>
        </div>`;
    }
    if (step === 2) {
      return `
        <div class="stage-card">
          <h2 class="stage-title">آشپزخانه و بالکن</h2>
          <p class="stage-desc">چند انتخاب ساده برای فرم کلی نقشه.</p>
          <div class="wizard-grid">
            <div class="field">
              <span>نوع آشپزخانه</span>
              <select id="autoKitchen"><option value="open" ${a.kitchen === 'open' ? 'selected' : ''}>باز / اپن</option><option value="closed" ${a.kitchen === 'closed' ? 'selected' : ''}>بسته</option></select>
            </div>
            <div class="field">
              <span>بالکن</span>
              <select id="autoBalcony"><option value="yes" ${a.balcony === 'yes' ? 'selected' : ''}>دارد</option><option value="no" ${a.balcony === 'no' ? 'selected' : ''}>ندارد</option></select>
            </div>
            <div class="field full">
              <span>درب ورودی از کدام سمت باشد؟</span>
              <select id="autoEntrySide"><option value="south" ${a.entrySide === 'south' ? 'selected' : ''}>جنوب</option><option value="north" ${a.entrySide === 'north' ? 'selected' : ''}>شمال</option><option value="east" ${a.entrySide === 'east' ? 'selected' : ''}>شرق</option><option value="west" ${a.entrySide === 'west' ? 'selected' : ''}>غرب</option></select>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="stage-card">
        <h2 class="stage-title">بازبینی و ساخت</h2>
        <p class="stage-desc">خلاصه انتخاب‌ها را بررسی کنید و نقشه را بسازید.</p>
        <div class="wizard-grid">
          <div class="field full"><span>عنوان پروژه</span><input id="autoTitle" type="text" value="${escapeHtml(a.title)}"></div>
          <div class="field full"><span>خلاصه</span><input type="text" value="${escapeHtml(buildAutoSummary())}" readonly></div>
        </div>
      </div>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function bindWizardInputs() {
    const ids = ['autoArea', 'autoLength', 'autoWidth', 'autoBedrooms', 'autoBathrooms', 'autoKitchen', 'autoBalcony', 'autoEntrySide', 'autoTitle'];
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const a = state.auto;
        if (id === 'autoArea') a.area = Number(el.value || 0);
        if (id === 'autoLength') a.length = Number(el.value || 0);
        if (id === 'autoWidth') a.width = Number(el.value || 0);
        if (id === 'autoBedrooms') a.bedrooms = Number(el.value || 1);
        if (id === 'autoBathrooms') a.bathrooms = Number(el.value || 1);
        if (id === 'autoKitchen') a.kitchen = el.value;
        if (id === 'autoBalcony') a.balcony = el.value;
        if (id === 'autoEntrySide') a.entrySide = el.value;
        if (id === 'autoTitle') a.title = el.value;
        renderWizard();
        setStatus(buildAutoSummary());
      });
    });
    document.querySelectorAll('[data-footprint-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.auto.footprintMode = btn.dataset.footprintMode;
        renderWizard();
        setStatus(buildAutoSummary());
      });
    });
  }

  function renderWizard() {
    els.wizardStage.innerHTML = wizardFieldHTML();
    els.wizardSteps.querySelectorAll('.step').forEach((btn) => {
      const step = Number(btn.dataset.step);
      btn.classList.toggle('is-active', step === state.wizardStep);
      btn.classList.toggle('is-done', step < state.wizardStep);
    });
    els.wizardBackBtn.disabled = state.wizardStep === 0;
    els.wizardNextBtn.disabled = state.wizardStep === 3;
    bindWizardInputs();
  }

  function renderInspector() {
    const item = selectedItem();
    if (!item) {
      els.inspectorGrid.innerHTML = '<div class="empty-note">برای ویرایش دقیق، یک فضا یا دیوار را انتخاب کنید.</div>';
      els.selectionMeta.textContent = 'هیچ موردی انتخاب نشده';
      return;
    }
    els.selectionMeta.textContent = `${kindLabel(item.kind)}: ${item.label || item.type || 'مورد'}`;
    if (item.kind === 'room') {
      els.inspectorGrid.innerHTML = `
        <div class="prop full"><label>عنوان فضا</label><input id="propLabel" type="text" value="${escapeHtml(item.label || '')}"></div>
        <div class="pair">
          <div class="prop"><label>عرض</label><input id="propW" type="number" min="60" step="1" value="${Math.round(item.w)}"></div>
          <div class="prop"><label>ارتفاع</label><input id="propH" type="number" min="60" step="1" value="${Math.round(item.h)}"></div>
        </div>
        <div class="pair">
          <div class="prop"><label>x</label><input id="propX" type="number" step="1" value="${Math.round(item.x)}"></div>
          <div class="prop"><label>y</label><input id="propY" type="number" step="1" value="${Math.round(item.y)}"></div>
        </div>
        <div class="prop full"><label>مساحت</label><input type="text" value="${areaText(item)}" readonly></div>
      `;
      bindInspectorRoom(item.id);
      return;
    }
    if (item.kind === 'wall') {
      els.inspectorGrid.innerHTML = `
        <div class="pair">
          <div class="prop"><label>x1</label><input id="propX1" type="number" step="1" value="${Math.round(item.x1)}"></div>
          <div class="prop"><label>y1</label><input id="propY1" type="number" step="1" value="${Math.round(item.y1)}"></div>
        </div>
        <div class="pair">
          <div class="prop"><label>x2</label><input id="propX2" type="number" step="1" value="${Math.round(item.x2)}"></div>
          <div class="prop"><label>y2</label><input id="propY2" type="number" step="1" value="${Math.round(item.y2)}"></div>
        </div>
      `;
      bindInspectorWall(item.id);
      return;
    }
    els.inspectorGrid.innerHTML = `
      <div class="prop full"><label>نوع</label><input type="text" value="${item.type === 'door' ? 'در' : 'پنجره'}" readonly></div>
      <div class="prop full"><label>مختصات</label><input type="text" value="${Math.round(item.x)}, ${Math.round(item.y)}" readonly></div>
      <div class="prop full"><button type="button" class="ghost-btn" id="deleteOpeningBtn">حذف بازشو</button></div>
    `;
    const del = $('deleteOpeningBtn');
    if (del) del.addEventListener('click', () => deleteSelected());
  }

  function bindInspectorRoom(id) {
    const attach = (inputId, key) => {
      const el = $(inputId);
      if (!el) return;
      el.addEventListener('input', () => {
        const item = state.plan.rooms.find((r) => r.id === id);
        if (!item) return;
        pushHistory();
        if (key === 'label') item.label = el.value;
        else item[key] = Number(el.value);
        renderAll();
      });
    };
    attach('propLabel', 'label');
    attach('propW', 'w');
    attach('propH', 'h');
    attach('propX', 'x');
    attach('propY', 'y');
  }

  function bindInspectorWall(id) {
    ['propX1', 'propY1', 'propX2', 'propY2'].forEach((name) => {
      const el = $(name);
      if (!el) return;
      el.addEventListener('input', () => {
        const wall = state.plan.walls.find((w) => w.id === id);
        if (!wall) return;
        pushHistory();
        wall.x1 = Number($('propX1').value);
        wall.y1 = Number($('propY1').value);
        wall.x2 = Number($('propX2').value);
        wall.y2 = Number($('propY2').value);
        renderAll();
      });
    });
  }

  function makeSvgEl(name, attrs = {}) {
    const el = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }

  function renderGrid() {
    els.gridLayer.classList.toggle('hidden', !state.grid);
  }

  function renderAll() {
    renderGrid();
    els.zoomReadout.textContent = `${Math.round(state.zoom * 100)}%`;
    els.scene.innerHTML = '';
    els.overlay.innerHTML = '';
    els.canvasEmpty.classList.toggle('hidden', !!(state.plan.rooms.length || state.plan.walls.length || state.plan.openings.length));
    els.projectTitle.textContent = state.plan.title || 'پروژه جدید';
    els.summaryStrip.innerHTML = `<span>${buildSummaryText()}</span><span>${fa(state.plan.rooms.filter((r) => r.kind === 'room').length)} فضا</span><span>${fa(state.plan.walls.length)} دیوار</span>`;
    els.printTitle.textContent = state.plan.title || 'طراحی نقشه ساختمان';
    els.printSummary.textContent = `${buildSummaryText()} | ${state.mode === 'auto' ? 'حالت خودکار' : 'حالت دستی'}`;
    const scene = makeSvgEl('g', { class: 'scene-root', transform: `scale(${state.zoom})` });
    drawBoundary(scene);
    drawGridLines(scene);
    state.plan.walls.forEach((wall) => drawWall(scene, wall));
    state.plan.rooms.forEach((room) => drawRoom(scene, room));
    state.plan.openings.forEach((opening) => drawOpening(scene, opening));
    drawSelection(scene);
    if (state.draft) drawDraft(scene);
    els.scene.appendChild(scene);
    renderInspector();
    refreshActions();
    bindSceneEvents();
  }

  function drawBoundary(parent) {
    const f = state.plan.footprint;
    if (!f) return;
    parent.appendChild(makeSvgEl('rect', { x: f.x, y: f.y, width: f.w, height: f.h, class: 'boundary' }));
  }

  function drawGridLines(parent) {
    if (!state.grid) return;
    const f = state.plan.footprint;
    if (!f) return;
    const step = 40;
    for (let x = f.x; x <= f.x + f.w; x += step) parent.appendChild(makeSvgEl('line', { x1: x, y1: f.y, x2: x, y2: f.y + f.h, class: 'grid-line' }));
    for (let y = f.y; y <= f.y + f.h; y += step) parent.appendChild(makeSvgEl('line', { x1: f.x, y1: y, x2: f.x + f.w, y2: y, class: 'grid-line' }));
  }

  function roomCornerPoints(room) {
    return [
      { key: 'nw', x: room.x, y: room.y },
      { key: 'ne', x: room.x + room.w, y: room.y },
      { key: 'se', x: room.x + room.w, y: room.y + room.h },
      { key: 'sw', x: room.x, y: room.y + room.h },
    ];
  }

  function drawRoom(parent, room) {
    const g = makeSvgEl('g', { 'data-kind': 'room', 'data-id': room.id });
    const rect = makeSvgEl('rect', {
      x: room.x,
      y: room.y,
      width: room.w,
      height: room.h,
      fill: room.fill,
      stroke: room.stroke,
      class: `room-shape${state.plan.selected?.kind === 'room' && state.plan.selected.id === room.id ? ' is-selected' : ''}`,
    });
    g.appendChild(rect);
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2 - 10;
    g.appendChild(makeSvgEl('text', { x: cx, y: cy, class: 'room-label' }));
    g.lastChild.textContent = room.label || roomLabel(room.type, room.openKitchen);
    g.appendChild(makeSvgEl('text', { x: cx, y: cy + 24, class: 'room-area' }));
    g.lastChild.textContent = areaText(room);
    if (state.plan.selected?.kind === 'room' && state.plan.selected.id === room.id) {
      roomCornerPoints(room).forEach((p) => {
        g.appendChild(makeSvgEl('circle', { cx: p.x, cy: p.y, r: 8, class: 'handle', 'data-handle': p.key, 'data-id': room.id, 'data-kind': 'room-handle' }));
      });
      g.appendChild(makeSvgEl('circle', { cx: room.x + room.w / 2, cy: room.y + room.h / 2, r: 10, class: 'handle', 'data-handle': 'move', 'data-id': room.id, 'data-kind': 'room-handle' }));
    }
    parent.appendChild(g);
  }

  function drawWall(parent, wall) {
    const g = makeSvgEl('g', { 'data-kind': 'wall', 'data-id': wall.id });
    const selected = state.plan.selected?.kind === 'wall' && state.plan.selected.id === wall.id;
    g.appendChild(makeSvgEl('line', { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, class: `wall-line${selected ? ' is-selected' : ''}` }));
    if (selected) {
      [[wall.x1, wall.y1, 'a'], [wall.x2, wall.y2, 'b'], [(wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2, 'move']].forEach(([x, y, handle]) => {
        g.appendChild(makeSvgEl('circle', { cx: x, cy: y, r: handle === 'move' ? 9 : 7, class: 'handle wall', 'data-handle': handle, 'data-id': wall.id, 'data-kind': 'wall-handle' }));
      });
    }
    parent.appendChild(g);
  }

  function drawOpening(parent, opening) {
    const wall = state.plan.walls.find((w) => w.id === opening.wallId);
    const x = opening.x;
    const y = opening.y;
    const lineAttrs = opening.type === 'door'
      ? { x1: x - 22, y1: y, x2: x + 22, y2: y, class: 'door-line' }
      : { x1: x - 28, y1: y, x2: x + 28, y2: y, class: 'window-line' };
    const g = makeSvgEl('g', { 'data-kind': 'opening', 'data-id': opening.id });
    g.appendChild(makeSvgEl('line', { ...lineAttrs, 'data-opening': opening.type }));
    g.appendChild(makeSvgEl('line', { x1: lineAttrs.x1, y1: lineAttrs.y1, x2: lineAttrs.x2, y2: lineAttrs.y2, class: 'opening-highlight' }));
    parent.appendChild(g);
  }

  function drawSelection(parent) {
    if (!state.plan.selected) return;
  }

  function drawDraft(parent) {
    const d = state.draft;
    if (d.kind === 'room') {
      parent.appendChild(makeSvgEl('rect', { x: d.rect.x, y: d.rect.y, width: d.rect.w, height: d.rect.h, class: 'preview' }));
      parent.appendChild(makeSvgEl('text', { x: d.rect.x + 10, y: d.rect.y - 10, class: 'preview-label' })).textContent = `${fa(sceneToMeter(d.rect.w).toFixed(1))}×${fa(sceneToMeter(d.rect.h).toFixed(1))} متر`;
      return;
    }
    if (d.kind === 'wall') {
      parent.appendChild(makeSvgEl('line', { x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, class: 'preview' }));
      const len = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      parent.appendChild(makeSvgEl('text', { x: (d.a.x + d.b.x) / 2 + 10, y: (d.a.y + d.b.y) / 2 - 10, class: 'preview-label' })).textContent = `${fa(sceneToMeter(len).toFixed(1))} متر`;
    }
  }

  function wallHitTest(point) {
    let best = null;
    let bestDist = Infinity;
    for (const wall of state.plan.walls) {
      const d = distanceToSegment(point, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
      if (d < bestDist) { bestDist = d; best = wall; }
    }
    return bestDist < 18 ? best : null;
  }

  function distanceToSegment(p, a, b) {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = p.x - a.x;
    const wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
    const t = c1 / c2;
    const px = a.x + t * vx;
    const py = a.y + t * vy;
    return Math.hypot(p.x - px, p.y - py);
  }

  function roomHitTest(point) {
    for (let i = state.plan.rooms.length - 1; i >= 0; i -= 1) {
      const r = state.plan.rooms[i];
      if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) return r;
    }
    return null;
  }

  function openingHitTest(point) {
    return state.plan.openings.find((o) => Math.hypot(point.x - o.x, point.y - o.y) < 24) || null;
  }

  function bindSceneEvents() {
    if (bindSceneEvents.bound) return;
    bindSceneEvents.bound = true;

    els.svg.addEventListener('pointerdown', (evt) => {
      const point = getSvgPoint(evt);
      const target = evt.target.closest('[data-kind]');
      const selected = selectedItem();

      if (state.tool === 'room') {
        state.draft = { kind: 'room', start: point, rect: { x: point.x, y: point.y, w: 0, h: 0 } };
        els.svg.setPointerCapture(evt.pointerId);
        renderAll();
        return;
      }

      if (state.tool === 'wall') {
        if (!state.draft || state.draft.kind !== 'wall') {
          state.draft = { kind: 'wall', a: point, b: point };
          els.svg.setPointerCapture(evt.pointerId);
          renderAll();
          return;
        }
        const wall = newWall(state.draft.a.x, state.draft.a.y, point.x, point.y);
        state.plan.walls.push(wall);
        state.draft = null;
        pushHistory();
        renderAll();
        setSelected('wall', wall.id);
        return;
      }

      if (state.tool === 'door' || state.tool === 'window') {
        const wall = wallHitTest(point);
        if (!wall) return;
        pushHistory();
        state.plan.openings.push(newOpening(state.tool, wall.id, point.x, point.y, 0));
        setSelected('opening', state.plan.openings[state.plan.openings.length - 1].id);
        renderAll();
        return;
      }

      if (state.tool === 'delete') {
        const hit = target ? target.dataset.kind : null;
        if (hit) {
          deleteByTarget(target);
        }
        return;
      }

      if (target && target.dataset.kind === 'room') {
        const room = state.plan.rooms.find((r) => r.id === target.dataset.id);
        if (!room) return;
        setSelected('room', room.id, { handle: 'move' });
        state.drag = { kind: 'room', id: room.id, action: 'move', start: point, offset: { x: point.x - room.x, y: point.y - room.y }, original: deepClone(room) };
        els.svg.setPointerCapture(evt.pointerId);
        return;
      }

      if (target && target.dataset.kind === 'room-handle') {
        const room = state.plan.rooms.find((r) => r.id === target.dataset.id);
        if (!room) return;
        const handle = target.dataset.handle;
        setSelected('room', room.id, { handle });
        state.drag = { kind: 'room', id: room.id, action: 'resize', handle, start: point, original: deepClone(room) };
        els.svg.setPointerCapture(evt.pointerId);
        return;
      }

      if (target && target.dataset.kind === 'wall') {
        const wall = state.plan.walls.find((w) => w.id === target.dataset.id);
        if (!wall) return;
        setSelected('wall', wall.id, { handle: 'move' });
        state.drag = { kind: 'wall', id: wall.id, action: 'move', start: point, original: deepClone(wall) };
        els.svg.setPointerCapture(evt.pointerId);
        return;
      }

      if (target && target.dataset.kind === 'wall-handle') {
        const wall = state.plan.walls.find((w) => w.id === target.dataset.id);
        if (!wall) return;
        setSelected('wall', wall.id, { handle: target.dataset.handle });
        state.drag = { kind: 'wall', id: wall.id, action: 'resize', handle: target.dataset.handle, start: point, original: deepClone(wall) };
        els.svg.setPointerCapture(evt.pointerId);
        return;
      }

      if (target && target.dataset.kind === 'opening') {
        const opening = state.plan.openings.find((o) => o.id === target.dataset.id);
        if (opening) setSelected('opening', opening.id);
        return;
      }

      if (state.tool === 'select') {
        const room = roomHitTest(point);
        if (room) { setSelected('room', room.id); return; }
        const wall = wallHitTest(point);
        if (wall) { setSelected('wall', wall.id); return; }
        const opening = openingHitTest(point);
        if (opening) { setSelected('opening', opening.id); return; }
      }

      setSelected(null, null);
    });

    els.svg.addEventListener('pointermove', (evt) => {
      const point = getSvgPoint(evt);
      if (state.draft) {
        if (state.draft.kind === 'room') {
          const rect = normalizeRect(rectFromPoints(state.draft.start, point));
          state.draft.rect = rect;
          renderAll();
          return;
        }
        if (state.draft.kind === 'wall') {
          state.draft.b = point;
          const dx = point.x - state.draft.a.x;
          const dy = point.y - state.draft.a.y;
          const ang = Math.round((Math.atan2(dy, dx) * 180 / Math.PI) / 45) * 45;
          if (state.snap) {
            const len = Math.hypot(dx, dy);
            const rad = ang * Math.PI / 180;
            state.draft.b = { x: state.draft.a.x + Math.cos(rad) * len, y: state.draft.a.y + Math.sin(rad) * len };
          }
          renderAll();
          return;
        }
      }
      if (!state.drag) return;
      if (state.drag.kind === 'room') {
        const room = state.plan.rooms.find((r) => r.id === state.drag.id);
        if (!room) return;
        pushMoveTarget(room, point);
        renderAll();
      }
      if (state.drag.kind === 'wall') {
        const wall = state.plan.walls.find((w) => w.id === state.drag.id);
        if (!wall) return;
        pushMoveWall(wall, point);
        renderAll();
      }
    });

    els.svg.addEventListener('pointerup', (evt) => {
      if (state.draft) {
        if (state.draft.kind === 'room') {
          const rect = normalizeRect(state.draft.rect);
          if (rect.w > 30 && rect.h > 30) {
            pushHistory();
            const type = inferRoomTypeFromPreset();
            state.plan.rooms.push(newRoom(type, rect.x, rect.y, rect.w, rect.h, { label: roomLabel(type) }));
            setStatus('اتاق اضافه شد');
          }
          state.draft = null;
          renderAll();
        } else if (state.draft.kind === 'wall') {
          const len = Math.hypot(state.draft.b.x - state.draft.a.x, state.draft.b.y - state.draft.a.y);
          if (len > 18) {
            pushHistory();
            state.plan.walls.push(newWall(state.draft.a.x, state.draft.a.y, state.draft.b.x, state.draft.b.y));
            setStatus('دیوار اضافه شد');
          }
          state.draft = null;
          renderAll();
        }
      }
      if (state.drag) {
        pushHistory();
      }
      state.drag = null;
      try { els.svg.releasePointerCapture(evt.pointerId); } catch {}
    });
  }

  function inferRoomTypeFromPreset() {
    return state.mode === 'manual' ? 'custom' : 'living';
  }

  function pushMoveTarget(room, point) {
    const original = state.drag.original;
    if (!original) return;
    if (state.drag.action === 'move') {
      const x = point.x - state.drag.offset.x;
      const y = point.y - state.drag.offset.y;
      room.x = x; room.y = y;
      return;
    }
    const minSize = 60;
    if (state.drag.handle === 'nw') {
      room.w = Math.max(minSize, original.x + original.w - point.x);
      room.h = Math.max(minSize, original.y + original.h - point.y);
      room.x = Math.min(point.x, original.x + original.w - minSize);
      room.y = Math.min(point.y, original.y + original.h - minSize);
    } else if (state.drag.handle === 'ne') {
      room.w = Math.max(minSize, point.x - original.x);
      room.h = Math.max(minSize, original.y + original.h - point.y);
      room.y = Math.min(point.y, original.y + original.h - minSize);
    } else if (state.drag.handle === 'se') {
      room.w = Math.max(minSize, point.x - original.x);
      room.h = Math.max(minSize, point.y - original.y);
    } else if (state.drag.handle === 'sw') {
      room.w = Math.max(minSize, original.x + original.w - point.x);
      room.x = Math.min(point.x, original.x + original.w - minSize);
      room.h = Math.max(minSize, point.y - original.y);
    }
  }

  function pushMoveWall(wall, point) {
    const original = state.drag.original;
    if (!original) return;
    const dx = point.x - state.drag.start.x;
    const dy = point.y - state.drag.start.y;
    if (state.drag.action === 'move') {
      wall.x1 = original.x1 + dx; wall.y1 = original.y1 + dy;
      wall.x2 = original.x2 + dx; wall.y2 = original.y2 + dy;
      return;
    }
    if (state.drag.handle === 'a') {
      wall.x1 = point.x; wall.y1 = point.y;
    } else if (state.drag.handle === 'b') {
      wall.x2 = point.x; wall.y2 = point.y;
    }
  }

  function deleteByTarget(target) {
    const kind = target.dataset.kind;
    const id = target.dataset.id;
    if (!kind || !id) return;
    pushHistory();
    if (kind === 'room' || kind === 'room-handle') state.plan.rooms = state.plan.rooms.filter((r) => r.id !== id);
    else if (kind === 'wall' || kind === 'wall-handle') state.plan.walls = state.plan.walls.filter((w) => w.id !== id);
    else if (kind === 'opening') state.plan.openings = state.plan.openings.filter((o) => o.id !== id);
    state.plan.selected = null;
    renderAll();
  }

  function refreshActions() {
    els.undoBtn.disabled = state.history.length === 0;
    els.redoBtn.disabled = state.future.length === 0;
  }

  function deleteSelected() {
    const item = selectedItem();
    if (!item || !state.plan.selected) return;
    pushHistory();
    if (state.plan.selected.kind === 'room') state.plan.rooms = state.plan.rooms.filter((r) => r.id !== item.id);
    if (state.plan.selected.kind === 'wall') state.plan.walls = state.plan.walls.filter((w) => w.id !== item.id);
    if (state.plan.selected.kind === 'opening') state.plan.openings = state.plan.openings.filter((o) => o.id !== item.id);
    state.plan.selected = null;
    renderAll();
  }

  function exportSvg() {
    const clone = els.svg.cloneNode(true);
    clone.querySelectorAll('.is-selected,.handle,.preview,.preview-label').forEach((n) => n.remove());
    clone.setAttribute('xmlns', SVG_NS);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.plan.title || 'floorplan').replace(/\s+/g, '-')}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printPlan() {
    window.print();
  }

  function handleKeydown(evt) {
    if (/input|textarea|select/i.test(evt.target.tagName)) return;
    if (evt.key === 'Delete' || evt.key === 'Backspace') {
      deleteSelected();
      return;
    }
    if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z') {
      evt.preventDefault(); undo();
    }
    if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'y') {
      evt.preventDefault(); redo();
    }
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(snapshot());
    const prev = state.history.pop();
    restore(prev);
    setStatus('واگرد انجام شد');
  }

  function redo() {
    if (!state.future.length) return;
    state.history.push(snapshot());
    const next = state.future.pop();
    restore(next);
    setStatus('بازگرد انجام شد');
  }

  function ensureManualIfNeeded() {
    if (state.mode !== 'manual') setMode('manual');
  }

  function handleQuickAction(action) {
    if (state.mode !== 'auto') setMode('auto');
    if (action === 'swap-kitchen-living') swapKitchenAndLiving();
    if (action === 'add-bedroom') addAutoBedroom();
    if (action === 'remove-balcony') removeAutoBalcony();
    if (action === 'bigger-living') biggerLiving();
    if (action === 'toggle-kitchen') toggleKitchenType();
    if (action === 'add-bathroom') addBathroom();
  }

  function resetView() {
    pushHistory();
    state.zoom = 1;
    renderAll();
    setStatus('نمایش ریست شد');
  }

  function zoom(delta) {
    state.zoom = clamp(Math.round((state.zoom + delta) * 100) / 100, 0.6, 1.8);
    renderAll();
    queueSave();
  }

  function init() {
    bindSceneEvents();
    els.modeAutoBtn.addEventListener('click', () => setMode('auto'));
    els.modeManualBtn.addEventListener('click', () => setMode('manual'));
    els.wizardSteps.addEventListener('click', (evt) => {
      const btn = evt.target.closest('.step');
      if (!btn) return;
      state.wizardStep = Number(btn.dataset.step);
      renderWizard();
    });
    els.wizardBackBtn.addEventListener('click', () => updateWizardStep(-1));
    els.wizardNextBtn.addEventListener('click', () => updateWizardStep(1));
    els.generateBtn.addEventListener('click', () => buildAutoPlan());
    els.sendCommandBtn.addEventListener('click', () => applyCommand(els.commandInput.value));
    els.commandInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCommand(els.commandInput.value); });
    document.querySelectorAll('[data-action]').forEach((btn) => btn.addEventListener('click', () => handleQuickAction(btn.dataset.action)));
    document.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => {
      ensureManualIfNeeded();
      state.tool = btn.dataset.tool;
      document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('is-active', x === btn));
      setStatus(`ابزار ${toolLabel(state.tool)}`);
      renderAll();
    }));
    document.querySelectorAll('[data-preset]').forEach((btn) => btn.addEventListener('click', () => {
      ensureManualIfNeeded();
      const type = btn.dataset.preset;
      state.tool = 'room';
      document.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('is-active', x.dataset.tool === 'room'));
      state.plan.selected = null;
      state.draft = { kind: 'room', preset: type, start: { x: 220, y: 220 }, rect: { x: 220, y: 220, w: meterToScene(type === 'living' ? 5 : 3.5), h: meterToScene(type === 'living' ? 4 : 3) } };
      renderAll();
      setStatus(`الگوی ${roomLabel(type)} آماده ترسیم است`);
    }));
    els.gridToggle.addEventListener('change', () => { state.grid = els.gridToggle.checked; renderAll(); queueSave(); });
    els.snapToggle.addEventListener('change', () => { state.snap = els.snapToggle.checked; queueSave(); });
    els.zoomOutBtn.addEventListener('click', () => zoom(-0.1));
    els.zoomInBtn.addEventListener('click', () => zoom(0.1));
    els.resetZoomBtn.addEventListener('click', resetView);
    els.undoBtn.addEventListener('click', undo);
    els.redoBtn.addEventListener('click', redo);
    els.saveBtn.addEventListener('click', () => saveLocal(false));
    els.loadBtn.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', async (evt) => {
      const file = evt.target.files && evt.target.files[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        restore(parsed);
        setStatus('فایل بارگذاری شد');
      } catch {
        setStatus('فایل قابل خواندن نبود');
      }
      evt.target.value = '';
    });
    els.printBtn.addEventListener('click', printPlan);
    els.exportSvgBtn.addEventListener('click', exportSvg);
    document.addEventListener('keydown', handleKeydown);

    if (!loadLocal()) {
      renderWizard();
      initManualSeed();
    }
    syncModeUI();
    syncControls();
    renderAll();
    setStatus('آماده');
  }

  init();
})();
