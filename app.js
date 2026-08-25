// وضعیت کلی برنامه
const state = {
  mode: 'auto',
  zoom: 1,
  selectedTool: 'select',
  selectedId: null,
  rooms: [],
  history: []
};

// ذخیره وضعیت برای برگشت (Undo)
function saveHistory() {
  state.history.push(JSON.stringify(state.rooms));
  if (state.history.length > 20) state.history.shift();
}

// عناصر DOM
const viewportGroup = document.getElementById('viewportGroup');
const roomsGroup = document.getElementById('roomsGroup');
const zoomLevelText = document.getElementById('zoomLevelText');
const planSvg = document.getElementById('planSvg');

// ۱. مدیریت زوم
function applyZoom(newZoom) {
  state.zoom = Math.min(Math.max(newZoom, 0.4), 2.5); // محدود بین ۴۰٪ تا ۲۵۰٪
  viewportGroup.setAttribute('transform', `scale(${state.zoom})`);
  zoomLevelText.innerText = `${Math.round(state.zoom * 100)}%`;
}

document.getElementById('zoomInBtn').onclick = () => applyZoom(state.zoom + 0.15);
document.getElementById('zoomOutBtn').onclick = () => applyZoom(state.zoom - 0.15);
document.getElementById('zoomResetBtn').onclick = () => applyZoom(1);

// زوم با غلتک ماوس (Wheel)
planSvg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.1 : -0.1;
  applyZoom(state.zoom + delta);
}, { passive: false });

// ۲. کلید برگشت (Undo)
document.getElementById('undoBtn').onclick = () => {
  if (state.history.length > 0) {
    const previousState = state.history.pop();
    state.rooms = JSON.parse(previousState);
    state.selectedId = null;
    renderPlan();
  } else {
    alert('مرحله‌ای برای بازگشت وجود ندارد.');
  }
};

// ۳. پروژه جدید / پاک کردن نقشه
document.getElementById('newProjectBtn').onclick = () => {
  if (confirm('آیا می‌خواهید نقشه پاک شود و از نو شروع کنید؟')) {
    saveHistory();
    state.rooms = [];
    state.selectedId = null;
    applyZoom(1);
    renderPlan();
  }
};

// ۴. تغییر حالت بین خودکار و دستی
const autoPanel = document.getElementById('autoPanel');
const manualPanel = document.getElementById('manualPanel');
const modeAutoBtn = document.getElementById('modeAutoBtn');
const modeManualBtn = document.getElementById('modeManualBtn');

modeAutoBtn.onclick = () => {
  state.mode = 'auto';
  modeAutoBtn.classList.add('is-active');
  modeManualBtn.classList.remove('is-active');
  autoPanel.classList.remove('hidden');
  manualPanel.classList.add('hidden');
};

modeManualBtn.onclick = () => {
  state.mode = 'manual';
  modeManualBtn.classList.add('is-active');
  modeAutoBtn.classList.remove('is-active');
  manualPanel.classList.remove('hidden');
  autoPanel.classList.add('hidden');
};

// ۵. تولید خودکار نقشه بر اساس مشخصات
function generateAutoPlan() {
  saveHistory();
  const w = parseFloat(document.getElementById('plotWidth').value) * 40 || 400;
  const h = parseFloat(document.getElementById('plotHeight').value) * 40 || 480;
  const beds = parseInt(document.getElementById('bedCount').value) || 2;
  const hasBalcony = document.getElementById('hasBalcony').checked;

  const startX = (1200 - w) / 2;
  const startY = (800 - h) / 2;

  const newRooms = [];
  
  // پذیرایی
  const livingHeight = h * 0.55;
  newRooms.push({
    id: 1,
    name: 'پذیرایی و نشیمن',
    x: startX,
    y: startY,
    width: w * 0.65,
    height: livingHeight
  });

  // آشپزخانه
  newRooms.push({
    id: 2,
    name: 'آشپزخانه',
    x: startX + (w * 0.65),
    y: startY,
    width: w * 0.35,
    height: livingHeight * 0.65
  });

  // سرویس و حمام
  newRooms.push({
    id: 3,
    name: 'حمام و سرویس',
    x: startX + (w * 0.65),
    y: startY + (livingHeight * 0.65),
    width: w * 0.35,
    height: livingHeight * 0.35
  });

  // اتاق‌های خواب
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

  // بالکن در صورت نیاز
  if (hasBalcony) {
    newRooms.push({
      id: 99,
      name: 'بالکن',
      x: startX + w - 50,
      y: startY + livingHeight,
      width: 50,
      height: bedHeight
    });
  }

  state.rooms = newRooms;
  renderPlan();
}

document.getElementById('generateBtn').onclick = generateAutoPlan;

// ۶. تغییرات سریع
document.querySelectorAll('[data-quick]').forEach(btn => {
  btn.onclick = () => {
    saveHistory();
    const action = btn.getAttribute('data-quick');
    if (action === 'add-bed') {
      const id = Date.now();
      state.rooms.push({ id, name: 'اتاق جدید', x: 200, y: 200, width: 140, height: 120 });
    } else if (action === 'del-balcony') {
      state.rooms = state.rooms.filter(r => r.name !== 'بالکن');
    } else if (action === 'swap') {
      if (state.rooms.length >= 2) {
        const tempX = state.rooms[0].x;
        state.rooms[0].x = state.rooms[1].x;
        state.rooms[1].x = tempX;
      }
    }
    renderPlan();
  };
});

// ۷. افزودن اتاق آماده در حالت دستی
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.onclick = () => {
    saveHistory();
    const type = btn.getAttribute('data-preset');
    const labels = { living: 'پذیرایی', bedroom: 'اتاق خواب', kitchen: 'آشپزخانه', bath: 'حمام و توالت' };
    const sizes = { living: [200, 160], bedroom: [150, 130], kitchen: [130, 110], bath: [90, 80] };
    const [w, h] = sizes[type] || [120, 120];

    state.rooms.push({
      id: Date.now(),
      name: labels[type] || 'اتاق',
      x: 300,
      y: 250,
      width: w,
      height: h
    });
    renderPlan();
  };
});

// ابزارهای دستی
document.querySelectorAll('[data-tool]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.selectedTool = btn.getAttribute('data-tool');
  };
});

// حذف مورد انتخاب شده
document.getElementById('deleteItemBtn').onclick = () => {
  if (state.selectedId) {
    saveHistory();
    state.rooms = state.rooms.filter(r => r.id !== state.selectedId);
    state.selectedId = null;
    renderPlan();
  } else {
    alert('ابتدا یک اتاق را برای حذف انتخاب کنید.');
  }
};

// ۸. رندر کردن پلان در SVG
function renderPlan() {
  roomsGroup.innerHTML = '';

  state.rooms.forEach(room => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.style.cursor = 'move';

    // مستطیل اتاق
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', room.x);
    rect.setAttribute('y', room.y);
    rect.setAttribute('width', room.width);
    rect.setAttribute('height', room.height);
    rect.setAttribute('class', `room-rect ${state.selectedId === room.id ? 'selected' : ''}`);

    // متن نام اتاق
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', room.x + room.width / 2);
    text.setAttribute('y', room.y + room.height / 2);
    text.setAttribute('class', 'room-text');
    text.textContent = room.name;

    // متراژ تقریبی
    const subtext = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subtext.setAttribute('x', room.x + room.width / 2);
    subtext.setAttribute('y', room.y + room.height / 2 + 18);
    subtext.setAttribute('class', 'room-subtext');
    const area = Math.round((room.width * room.height) / 1600);
    subtext.textContent = `${area} م.م`;

    // انتخاب و درگ کردن اتاق
    g.onmousedown = (e) => {
      e.stopPropagation();
      state.selectedId = room.id;
      renderPlan();

      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startX = room.x;
      const startY = room.y;

      const onMouseMove = (moveEvent) => {
        const dx = (moveEvent.clientX - startMouseX) / state.zoom;
        const dy = (moveEvent.clientY - startMouseY) / state.zoom;
        room.x = Math.round((startX + dx) / 10) * 10;
        room.y = Math.round((startY + dy) / 10) * 10;
        renderPlan();
      };

      const onMouseUp = () => {
        saveHistory();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    g.appendChild(rect);
    g.appendChild(text);
    g.appendChild(subtext);
    roomsGroup.appendChild(g);
  });
}

// خروجی SVG و چاپ
document.getElementById('printBtn').onclick = () => window.print();
document.getElementById('exportSvgBtn').onclick = () => {
  const svgData = new XMLSerializer().serializeToString(planSvg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'floorplan.svg';
  link.click();
};

// شروع اولیه
generateAutoPlan();
