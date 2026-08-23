(() => {
  const svg = document.querySelector('#planSvg'), viewport = document.querySelector('#viewport');
  const objects = document.querySelector('#objects'), draft = document.querySelector('#draft');
  const state = { tool: 'select', items: [], selected: null, zoom: 1, pan: {x: 0, y: 0}, drawing: null, history: [], future: [], dragging: false, last: null };
  const $ = id => document.getElementById(id);
  const fa = n => String(Math.round(n)).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function snapshot() { state.history.push(JSON.stringify(state.items)); if (state.history.length > 40) state.history.shift(); state.future = []; }
  function restore(data) { state.items = JSON.parse(data); state.selected = null; render(); }
  function render() {
    objects.replaceChildren();
    state.items.forEach(item => {
      let el;
      if (item.type === 'wall') { el = document.createElementNS('http://www.w3.org/2000/svg','line'); el.setAttribute('x1',item.x1); el.setAttribute('y1',item.y1); el.setAttribute('x2',item.x2); el.setAttribute('y2',item.y2); el.setAttribute('class','wall'); }
      if (item.type === 'room') { el = document.createElementNS('http://www.w3.org/2000/svg','rect'); el.setAttribute('x',item.x); el.setAttribute('y',item.y); el.setAttribute('width',item.w); el.setAttribute('height',item.h); el.setAttribute('class','room'); const text=document.createElementNS('http://www.w3.org/2000/svg','text'); text.setAttribute('x',item.x+item.w/2); text.setAttribute('y',item.y+item.h/2); text.setAttribute('class','room-label'); text.textContent=item.label; el.append(text); }
      if (item.type === 'door') { el = document.createElementNS('http://www.w3.org/2000/svg','path'); el.setAttribute('d',`M ${item.x} ${item.y} h 70 M ${item.x} ${item.y} A 70 70 0 0 1 ${item.x+70} ${item.y+70}`); el.setAttribute('class','door'); }
      if (item.type === 'window') { el = document.createElementNS('http://www.w3.org/2000/svg','line'); el.setAttribute('x1',item.x-35); el.setAttribute('y1',item.y); el.setAttribute('x2',item.x+35); el.setAttribute('y2',item.y); el.setAttribute('class','window'); }
      if (!el) return; el.dataset.id=item.id; if (item.id===state.selected) el.classList.add('selected'); objects.append(el);
    });
    $('objectCount').textContent = fa(state.items.length) + ' عنصر'; $('emptyState').style.display = state.items.length ? 'none' : 'grid';
  }
  function point(e) { const r=svg.getBoundingClientRect(); return {x:(e.clientX-r.left-state.pan.x)/state.zoom, y:(e.clientY-r.top-state.pan.y)/state.zoom}; }
  function snap(p) { if (!$('snapToggle').checked) return p; const s=Number($('gridScale').value); return {x:Math.round(p.x/s)*s,y:Math.round(p.y/s)*s}; }
  function transform() { viewport.setAttribute('transform',`translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`); $('zoomLabel').textContent=fa(state.zoom*100)+'٪'; }
  function selectTool(name) { state.tool=name; document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===name)); const help={select:'برای انتخاب عنصر کلیک کنید؛ Delete برای حذف.',wall:'برای رسم دیوار، نقطه شروع و سپس نقطه پایان را کلیک کنید.',room:'گوشه اول و گوشه مقابل اتاق را کلیک کنید.',door:'برای قرار دادن در، روی نقطه موردنظر کلیک کنید.',window:'برای قرار دادن پنجره، روی دیوار کلیک کنید.',erase:'روی هر عنصر کلیک کنید تا حذف شود.'}; $('helpText').textContent=help[name]; }
  function finish(item) { snapshot(); state.items.push({...item,id:uid()}); state.drawing=null; draft.replaceChildren(); render(); }
  document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>selectTool(b.dataset.tool)));
  svg.addEventListener('pointerdown', e => { if(e.button!==0) return; const p=snap(point(e)); const target=e.target.closest('[data-id]');
    if(state.tool==='select' && target) { state.selected=target.dataset.id; render(); return; }
    if(state.tool==='erase' && target) { snapshot(); state.items=state.items.filter(i=>i.id!==target.dataset.id); render(); return; }
    if(state.tool==='door') return finish({type:'door',x:p.x,y:p.y});
    if(state.tool==='window') return finish({type:'window',x:p.x,y:p.y});
    if(['wall','room'].includes(state.tool)) { if(!state.drawing) { state.drawing={start:p}; } else { const s=state.drawing.start; if(state.tool==='wall') finish({type:'wall',x1:s.x,y1:s.y,x2:p.x,y2:p.y}); else finish({type:'room',x:Math.min(s.x,p.x),y:Math.min(s.y,p.y),w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y),label:'اتاق جدید'}); } return; }
    state.dragging=true; state.last={x:e.clientX,y:e.clientY}; svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e=> { const p=point(e); $('cursorPos').textContent=`X: ${fa(p.x)}  Y: ${fa(p.y)}`; if(state.dragging){state.pan.x+=e.clientX-state.last.x;state.pan.y+=e.clientY-state.last.y;state.last={x:e.clientX,y:e.clientY};transform();} });
  svg.addEventListener('pointerup',()=>state.dragging=false);
  svg.addEventListener('wheel', e=> { e.preventDefault(); state.zoom=Math.max(.35,Math.min(3,state.zoom*(e.deltaY<0?1.1:.9))); transform(); }, {passive:false});
  $('zoomIn').onclick=()=>{state.zoom=Math.min(3,state.zoom+0.1);transform()}; $('zoomOut').onclick=()=>{state.zoom=Math.max(.35,state.zoom-0.1);transform()}; $('resetView').onclick=()=>{state.zoom=1;state.pan={x:0,y:0};transform()};
  $('gridToggle').onchange=e=>document.querySelector('.canvas-wrap').classList.toggle('grid-hidden',!e.target.checked);
  $('gridScale').oninput=e=>{$('scaleValue').textContent=fa(e.target.value/100)+' متر'; const p=document.querySelector('#gridPattern'); p.setAttribute('width',e.target.value);p.setAttribute('height',e.target.value);};
  $('undoBtn').onclick=()=>{if(state.history.length){state.future.push(JSON.stringify(state.items));restore(state.history.pop())}};
  $('redoBtn').onclick=()=>{if(state.future.length){state.history.push(JSON.stringify(state.items));restore(state.future.pop())}};
  document.addEventListener('keydown',e=>{if(e.target.matches('input'))return; const keys={v:'select',w:'wall',r:'room',d:'door',n:'window',e:'erase'}; if(keys[e.key.toLowerCase()])selectTool(keys[e.key.toLowerCase()]); if(e.key==='Delete'&&state.selected){snapshot();state.items=state.items.filter(i=>i.id!==state.selected);state.selected=null;render()} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$('undoBtn').click()} if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y')$('redoBtn').click();});
  $('clearBtn').onclick=()=> $('confirmModal').classList.add('open'); $('cancelClear').onclick=()=> $('confirmModal').classList.remove('open'); $('confirmClear').onclick=()=>{snapshot();state.items=[];render();$('confirmModal').classList.remove('open')};
  $('saveBtn').onclick=()=>{localStorage.setItem('building-floorplan',JSON.stringify({items:state.items,scale:$('gridScale').value})); $('saveBtn').textContent='ذخیره شد'; setTimeout(()=>$('saveBtn').textContent='ذخیره پروژه',1300)};
  $('exportBtn').onclick=()=>{const clone=svg.cloneNode(true); clone.querySelector('#gridRect').remove(); clone.querySelector('#draft')?.remove(); clone.setAttribute('viewBox','-500 -300 1000 600'); const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='building-floorplan.svg';a.click();URL.revokeObjectURL(a.href)};
  const saved=localStorage.getItem('building-floorplan'); if(saved) {try{const d=JSON.parse(saved);state.items=d.items||[]; if(d.scale){$('gridScale').value=d.scale; $('gridScale').dispatchEvent(new Event('input'));}}catch(e){}} render(); transform();
})();
