document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const groundWidthInput = document.getElementById('ground-width');
    const groundLengthInput = document.getElementById('ground-length');
    const bedroomsInput = document.getElementById('bedrooms');
    const floorsInput = document.getElementById('floors');
    const structureTypeInput = document.getElementById('structure-type');
    const autoColumnsCheckbox = document.getElementById('auto-columns');
    const generateBtn = document.getElementById('generate-btn');
    const addRoomBtn = document.getElementById('add-room-btn');
    const addBalconyBtn = document.getElementById('add-balcony-btn');
    const removeBalconyBtn = document.getElementById('remove-balcony-btn');
    const exportSvgBtn = document.getElementById('export-svg-btn');
    const printBtn = document.getElementById('print-btn');
    const view2dBtn = document.getElementById('view-2d-btn');
    const view3dBtn = document.getElementById('view-3d-btn');
    const svg = document.getElementById('floorplan-svg');
    const threeContainer = document.getElementById('three-container');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const resetZoomBtn = document.getElementById('reset-zoom-btn');
    const panToolBtn = document.getElementById('pan-tool-btn');
    const drawToolBtn = document.getElementById('draw-tool-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const saveStorageBtn = document.getElementById('save-storage-btn');
    const loadStorageBtn = document.getElementById('load-storage-btn');

    const SVG_NS = "http://www.w3.org/2000/svg";
    const RENDER_SCALE = 50; 

    // --- Application State ---
    let state = {
        groundWidth: 10,
        groundLength: 25,
        bedrooms: 2,
        floors: 1,
        structureType: 'concrete',
        autoColumns: true,
        rooms: [],
        walls: [],
        columns: [],
        hasBalcony: false,
        pan: { x: 0, y: 0, active: false, start: { x: 0, y: 0 } },
        zoom: 1,
        tool: 'pan',
        drawing: { active: false, start: {x: 0, y: 0}, end: {x: 0, y: 0}, tempLine: null }
    };

    let history = [];
    let historyIndex = -1;
    let scene, camera, renderer, controls;

    // --- Core Functions ---
    function generateFloorplan() {
        // Reset pan & zoom for new plans
        state.pan = { x: 0, y: 0, active: false, start: { x: 0, y: 0 } };
        state.zoom = 1;

        state.groundWidth = parseFloat(groundWidthInput.value) || 10;
        state.groundLength = parseFloat(groundLengthInput.value) || 25;
        state.bedrooms = parseInt(bedroomsInput.value) || 2;
        state.floors = parseInt(floorsInput.value) || 1;
        state.structureType = structureTypeInput.value;
        state.autoColumns = autoColumnsCheckbox.checked;

        generateRooms();
        if (state.autoColumns) {
            generateColumns();
        } else {
            state.columns = [];
        }
        
        captureHistory();
        render();
    }

    function generateRooms() {
        state.rooms = [];
        state.walls = [];
        state.hasBalcony = false;

        const w = state.groundWidth;
        const l = state.groundLength;

        const livingRatio = 0.4;
        const livingLength = l * livingRatio;
        state.rooms.push({ name: 'پذیرایی', x: 0, y: 0, width: w, height: livingLength, type: 'living' });
        state.rooms.push({ name: 'آشپزخانه', x: 0, y: livingLength, width: w / 2, height: 3, type: 'kitchen' });

        const serviceY = livingLength;
        const serviceWidth = 2;
        const wcHeight = 2;
        const bathHeight = 3;
        state.rooms.push({ name: 'سرویس', x: w - serviceWidth, y: serviceY, width: serviceWidth, height: wcHeight, type: 'wc' });
        state.rooms.push({ name: 'حمام', x: w - serviceWidth, y: serviceY + wcHeight, width: serviceWidth, height: bathHeight, type: 'bath' });

        const bedroomsAreaY = livingLength + Math.max(3, wcHeight + bathHeight); 
        const remainingLength = Math.max(0, l - bedroomsAreaY);
        const bedroomWidth = (w / state.bedrooms);
        
        for (let i = 0; i < state.bedrooms; i++) {
            state.rooms.push({
                name: `خواب ${i + 1}`,
                x: i * bedroomWidth,
                y: bedroomsAreaY,
                width: bedroomWidth,
                height: remainingLength,
                type: 'bedroom'
            });
        }
        
        state.rooms.push({ name: 'ورودی', x: w - 1.2, y: 0, width: 1.2, height: 0, type: 'door' });

        extractWallsFromRooms();
    }
    
    function addBalcony() {
        if(state.hasBalcony) return;
        state.hasBalcony = true;
        const livingRoom = state.rooms.find(r => r.type === 'living');
        if (livingRoom) {
            state.rooms.push({
                name: 'بالکن',
                x: 0,
                y: -1.5,
                width: livingRoom.width / 2,
                height: 1.5,
                type: 'balcony'
            });
        }
        extractWallsFromRooms();
        captureHistory();
        render();
    }

    function removeBalcony() {
        if(!state.hasBalcony) return;
        state.hasBalcony = false;
        state.rooms = state.rooms.filter(r => r.type !== 'balcony');
        extractWallsFromRooms();
        captureHistory();
        render();
    }

    function extractWallsFromRooms() {
        const wallSegments = new Set();
        const addWall = (x1, y1, x2, y2) => {
            // Safely sort numbers to avoid coordinate mismatch
            const key = [x1, y1, x2, y2].sort((a, b) => a - b).join(',');
            if (!wallSegments.has(key)) {
                wallSegments.add(key);
                state.walls.push({ x1, y1, x2, y2 });
            }
        };

        state.rooms.forEach(room => {
            if (room.type === 'door' || room.type === 'balcony') return; 
            const x1 = room.x;
            const y1 = room.y;
            const x2 = room.x + (room.width || 0);
            const y2 = room.y + (room.height || 0);
            addWall(x1, y1, x2, y1); 
            addWall(x2, y1, x2, y2); 
            addWall(x1, y2, x2, y2); 
            addWall(x1, y1, x1, y2); 
        });
    }

    function generateColumns() {
        state.columns = [];
        const colSize = (state.structureType === 'concrete' ? 0.4 : 0.3); 
        const gridX = [], gridY = [];

        state.rooms.forEach(room => {
            if(room.type !== 'door') {
                gridX.push(room.x, room.x + (room.width || 0));
                gridY.push(room.y, room.y + (room.height || 0));
            }
        });

        gridX.push(0, state.groundWidth);
        gridY.push(0, state.groundLength);

        const uniqueX = [...new Set(gridX)].sort((a,b)=>a-b);
        const uniqueY = [...new Set(gridY)].sort((a,b)=>a-b);

        uniqueX.forEach(x => {
            uniqueY.forEach(y => {
                const isOnWall = state.walls.some(w =>
                    (w.x1 === x && w.x2 === x && y >= Math.min(w.y1, w.y2) && y <= Math.max(w.y1, w.y2)) ||
                    (w.y1 === y && w.y2 === y && x >= Math.min(w.x1, w.x2) && x <= Math.max(w.x1, w.x2))
                );

                if (isOnWall && x <= state.groundWidth && y <= state.groundLength) {
                    state.columns.push({ x: x - colSize / 2, y: y - colSize / 2, width: colSize, height: colSize });
                }
            });
        });
    }

    function addRoom() {
        state.rooms.push({ name: 'اتاق جدید', x: 1, y: 1, width: 4, height: 3, type: 'bedroom'});
        extractWallsFromRooms();
        captureHistory();
        render();
    }

    // --- Rendering ---
    function render() {
        if (view2dBtn.classList.contains('active')) {
            renderSVG();
        }
        if (view3dBtn.classList.contains('active')) {
            render3D();
        }
        updateHistoryButtons();
    }

    function renderSVG() {
        // Safe clear (innerHTML not supported consistently for SVG)
        while(svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        // Safe Defs creation
        const defs = document.createElementNS(SVG_NS, 'defs');
        const marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', 'dim-tick');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '0');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '2');
        marker.setAttribute('markerHeight', '10');
        marker.setAttribute('orient', 'auto-start-reverse');
        
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        
        marker.appendChild(path);
        defs.appendChild(marker);
        svg.appendChild(defs);

        // Sanitize Pan and Zoom to prevent blank screen
        if (isNaN(state.zoom) || state.zoom <= 0) state.zoom = 1;
        if (isNaN(state.pan.x)) state.pan.x = 0;
        if (isNaN(state.pan.y)) state.pan.y = 0;

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
        svg.appendChild(g);

        try {
            (state.rooms || []).forEach(room => {
                if (room.type === 'balcony') {
                    drawBalcony(g, room);
                } else if (room.type === 'door') {
                    drawDoor(g, {x: room.x, y: room.y, width: room.width, wall: 'bottom'});
                } else {
                    const text = document.createElementNS(SVG_NS, 'text');
                    text.setAttribute('x', (room.x + (room.width || 0) / 2) * RENDER_SCALE);
                    text.setAttribute('y', (room.y + (room.height || 0) / 2) * RENDER_SCALE);
                    text.setAttribute('class', 'room-label');
                    text.textContent = room.name;
                    g.appendChild(text);

                    drawDimension(g, room.x, room.y - 0.5, room.x + (room.width||0), room.y - 0.5, room.width || 0);
                    drawDimension(g, room.x - 0.5, room.y, room.x - 0.5, room.y + (room.height||0), room.height || 0);
                }
            });
            
            (state.walls || []).forEach(wall => drawWall(g, wall));
            
            (state.columns || []).forEach(col => {
                const rect = document.createElementNS(SVG_NS, 'rect');
                rect.setAttribute('x', col.x * RENDER_SCALE);
                rect.setAttribute('y', col.y * RENDER_SCALE);
                rect.setAttribute('width', col.width * RENDER_SCALE);
                rect.setAttribute('height', col.height * RENDER_SCALE);
                rect.setAttribute('class', 'column');
                g.appendChild(rect);
            });
        } catch (e) {
            console.error("Rendering Error:", e);
        }
    }

    function drawWall(parent, wall) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', wall.x1 * RENDER_SCALE);
        line.setAttribute('y1', wall.y1 * RENDER_SCALE);
        line.setAttribute('x2', wall.x2 * RENDER_SCALE);
        line.setAttribute('y2', wall.y2 * RENDER_SCALE);
        line.setAttribute('class', 'wall');
        parent.appendChild(line);
    }
    
    function drawBalcony(parent, balcony) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', balcony.x * RENDER_SCALE);
        rect.setAttribute('y', balcony.y * RENDER_SCALE);
        rect.setAttribute('width', balcony.width * RENDER_SCALE);
        rect.setAttribute('height', balcony.height * RENDER_SCALE);
        rect.setAttribute('class', 'balcony');
        parent.appendChild(rect);
    }

    function drawDoor(parent, door) {
        const x = door.x * RENDER_SCALE;
        const y = door.y * RENDER_SCALE;
        const width = door.width * RENDER_SCALE;
        
        if (width <= 0) return;

        const gap = document.createElementNS(SVG_NS, 'line');
        gap.setAttribute('x1', x);
        gap.setAttribute('y1', y);
        gap.setAttribute('x2', x + width);
        gap.setAttribute('y2', y);
        const bgColor = getComputedStyle(document.body).getPropertyValue('--card-background').trim() || '#ffffff';
        gap.setAttribute('stroke', bgColor);
        gap.setAttribute('stroke-width', '10'); 
        parent.appendChild(gap);

        const arc = document.createElementNS(SVG_NS, 'path');
        const endY = y - width; 
        const d = `M ${x} ${y} A ${width} ${width} 0 0 0 ${x} ${endY}`;
        arc.setAttribute('d', d);
        arc.setAttribute('class', 'door-arc');
        parent.appendChild(arc);

        const panel = document.createElementNS(SVG_NS, 'line');
        panel.setAttribute('x1', x);
        panel.setAttribute('y1', y);
        panel.setAttribute('x2', x);
        panel.setAttribute('y2', endY);
        panel.setAttribute('class', 'wall'); 
        parent.appendChild(panel);
    }

    function drawDimension(parent, x1, y1, x2, y2, label) {
        const g = document.createElementNS(SVG_NS, 'g');
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', x1 * RENDER_SCALE);
        line.setAttribute('y1', y1 * RENDER_SCALE);
        line.setAttribute('x2', x2 * RENDER_SCALE);
        line.setAttribute('y2', y2 * RENDER_SCALE);
        line.setAttribute('class', 'dim-line');
        g.appendChild(line);

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', ((x1 + x2) / 2) * RENDER_SCALE);
        text.setAttribute('y', ((y1 + y2) / 2 - 0.2) * RENDER_SCALE);
        text.setAttribute('class', 'dim-text');
        text.textContent = (Number(label) || 0).toFixed(2) + 'm';
        g.appendChild(text);
        parent.appendChild(g);
    }
    
    // --- 3D Rendering ---
    function init3D() {
        if (typeof THREE === 'undefined') return; 
        scene = new THREE.Scene();
        scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--background-color').trim() || '#f4f7f9');

        camera = new THREE.PerspectiveCamera(75, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 1000);
        camera.position.set(state.groundWidth * 1.5, state.groundLength * 1.5, state.groundWidth * 1.5);
        camera.lookAt(state.groundWidth / 2, 0, state.groundLength / 2);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
        renderer.shadowMap.enabled = true;
        threeContainer.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        scene.add(directionalLight);
    }

    function render3D() {
        if (typeof THREE === 'undefined') {
            alert("کتابخانه 3D هنوز بارگذاری نشده است. لطفاً اتصال اینترنت خود را بررسی کنید.");
            return;
        }
        if (!scene) init3D();

        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(state.groundWidth, 100, state.groundLength);
        scene.add(directionalLight);

        const wallHeight = 3;
        const wallThickness = 0.2;
        const slabThickness = 0.3;

        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const slabMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
        const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

        for (let i = 0; i < state.floors; i++) {
            const slabGeom = new THREE.BoxGeometry(state.groundWidth, slabThickness, state.groundLength);
            const slab = new THREE.Mesh(slabGeom, slabMaterial);
            slab.position.set(state.groundWidth / 2, i * wallHeight, state.groundLength / 2);
            scene.add(slab);
        }

        for (let i = 0; i < state.floors; i++) {
            if (i < state.floors - 1 || state.floors === 1) {
                (state.walls || []).forEach(wall => {
                    const length = Math.sqrt(Math.pow(wall.x2 - wall.x1, 2) + Math.pow(wall.y2 - wall.y1, 2));
                    const isHorizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
                    const wallGeom = new THREE.BoxGeometry(
                        isHorizontal ? length : wallThickness,
                        wallHeight,
                        isHorizontal ? wallThickness : length
                    );
                    const mesh = new THREE.Mesh(wallGeom, wallMaterial);
                    mesh.position.set(
                        (wall.x1 + wall.x2) / 2,
                        wallHeight / 2 + i * wallHeight,
                        (wall.y1 + wall.y2) / 2
                    );
                    scene.add(mesh);
                });
            }
        }
        
        (state.columns || []).forEach(col => {
            const colHeight = state.floors * wallHeight;
            const colGeom = new THREE.BoxGeometry(col.width, colHeight, col.height);
            const mesh = new THREE.Mesh(colGeom, columnMaterial);
            mesh.position.set(
                col.x + col.width / 2,
                colHeight / 2,
                col.y + col.height / 2
            );
            scene.add(mesh);
        });

        renderer.render(scene, camera);
    }
    
    // --- Pan, Zoom, and Tool Handling ---
    function getMousePos(evt) {
        const CTM = svg.getScreenCTM();
        if(!CTM) return {x:0, y:0, x_m:0, y_m:0};
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        const transformedPt = pt.matrixTransform(CTM.inverse());
        return {
            x: transformedPt.x,
            y: transformedPt.y,
            x_m: (transformedPt.x / RENDER_SCALE), 
            y_m: (transformedPt.y / RENDER_SCALE)  
        };
    }

    function handleMouseDown(e) {
        e.preventDefault();
        const mousePos = getMousePos(e);

        if (state.tool === 'pan') {
            state.pan.active = true;
            state.pan.start.x = e.clientX - state.pan.x;
            state.pan.start.y = e.clientY - state.pan.y;
            svg.style.cursor = 'grabbing';
        } else if (state.tool === 'draw') {
            state.drawing.active = true;
            state.drawing.start = { x: mousePos.x_m, y: mousePos.y_m };
            state.drawing.end = { x: mousePos.x_m, y: mousePos.y_m };
            
            if (!state.drawing.tempLine) {
                 const g = svg.querySelector('g');
                 if(g) {
                     state.drawing.tempLine = document.createElementNS(SVG_NS, 'line');
                     state.drawing.tempLine.setAttribute('class', 'temp-draw-line');
                     g.appendChild(state.drawing.tempLine);
                 }
            }
        }
    }

    function handleMouseMove(e) {
        if (state.pan.active) {
            state.pan.x = e.clientX - state.pan.start.x;
            state.pan.y = e.clientY - state.pan.start.y;
            const g = svg.querySelector('g');
            if(g) g.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
        } else if (state.drawing.active) {
             const mousePos = getMousePos(e);
             state.drawing.end = { x: mousePos.x_m, y: mousePos.y_m };
             
             if(state.drawing.tempLine) {
                 state.drawing.tempLine.setAttribute('x1', state.drawing.start.x * RENDER_SCALE);
                 state.drawing.tempLine.setAttribute('y1', state.drawing.start.y * RENDER_SCALE);
                 state.drawing.tempLine.setAttribute('x2', state.drawing.end.x * RENDER_SCALE);
                 state.drawing.tempLine.setAttribute('y2', state.drawing.end.y * RENDER_SCALE);
             }
        }
    }

    function handleMouseUp(e) {
        if (state.pan.active) {
            state.pan.active = false;
            svg.style.cursor = 'grab';
        } else if (state.drawing.active) {
            state.drawing.active = false;
            
             if(state.drawing.tempLine) {
                 state.drawing.tempLine.remove();
                 state.drawing.tempLine = null;
             }
             
            const newWall = {
                x1: state.drawing.start.x,
                y1: state.drawing.start.y,
                x2: state.drawing.end.x,
                y2: state.drawing.end.y
            };
            
            if (Math.abs(newWall.x1-newWall.x2) > 0.1 || Math.abs(newWall.y1-newWall.y2) > 0.1) {
                 state.walls.push(newWall);
                 captureHistory();
                 render();
            }
        }
    }
    
     function handleWheel(e) {
        e.preventDefault();
        const scaleAmount = 1.1;
        const CTM = svg.getScreenCTM();
        if(!CTM) return;
        
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const mousePoint = pt.matrixTransform(CTM.inverse());

        const oldZoom = state.zoom;
        if (e.deltaY < 0) { 
            state.zoom *= scaleAmount;
        } else { 
            state.zoom /= scaleAmount;
        }
        
        state.zoom = Math.max(0.1, Math.min(state.zoom, 10)); 

        state.pan.x = mousePoint.x - (mousePoint.x - state.pan.x) * (state.zoom / oldZoom);
        state.pan.y = mousePoint.y - (mousePoint.y - state.pan.y) * (state.zoom / oldZoom);

        const g = svg.querySelector('g');
        if(g) g.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
    }

    function switchTool(tool) {
        state.tool = tool;
        panToolBtn.classList.toggle('active', tool === 'pan');
        drawToolBtn.classList.toggle('active', tool === 'draw');
        svg.classList.toggle('drawing', tool === 'draw');
        svg.style.cursor = tool === 'draw' ? 'crosshair' : 'grab';
    }


    // --- History Management (Undo/Redo) ---
    function captureHistory() {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }

        // Deep clone state safely (stripping DOM elements to avoid Circular JSON errors)
        const safeState = {
            ...state,
            drawing: { active: false, start: {x:0, y:0}, end: {x:0, y:0}, tempLine: null } // strip tempLine
        };
        const stateSnapshot = JSON.parse(JSON.stringify(safeState));
        
        history.push(stateSnapshot);
        historyIndex++;

        if (history.length > 50) {
            history.shift();
            historyIndex--;
        }
        updateHistoryButtons();
    }
    
    function applyHistoryState(snapshot) {
        Object.assign(state, JSON.parse(JSON.stringify(snapshot)));
        
        groundWidthInput.value = state.groundWidth;
        groundLengthInput.value = state.groundLength;
        bedroomsInput.value = state.bedrooms;
        floorsInput.value = state.floors;
        structureTypeInput.value = state.structureType;
        autoColumnsCheckbox.checked = state.autoColumns;
        
        render();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            applyHistoryState(history[historyIndex]);
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
             applyHistoryState(history[historyIndex]);
        }
    }
    
    function updateHistoryButtons() {
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
    }


    // --- I/O and Utility Functions ---
    function exportSVG() {
        const svgClone = svg.cloneNode(true);
        const g = svgClone.querySelector('g');
        if(g) g.setAttribute('transform', '');
        
        const bbox = svg.getBBox(); 
        const padding = 20;
        svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding*2} ${bbox.height + padding*2}`);
        svgClone.setAttribute('width', bbox.width + padding*2);
        svgClone.setAttribute('height', bbox.height + padding*2);
        
        svgClone.setAttribute("xmlns", SVG_NS);

        const svgData = new XMLSerializer().serializeToString(svgClone);
        const svgBlob = new Blob([`<?xml version="1.0" standalone="no"?>\r\n`, svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'floorplan.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function printPlan() {
        window.print();
    }
    
    function saveToLocalStorage() {
        try {
            // Strip DOM elements before saving
            const safeState = { ...state, drawing: { active: false, start: {x:0, y:0}, end: {x:0, y:0}, tempLine: null } };
            const dataToSave = {
                currentState: safeState,
                history: history,
                historyIndex: historyIndex
            };
            localStorage.setItem('floorplanAppState', JSON.stringify(dataToSave));
            alert('نقشه با موفقیت در حافظه مرورگر ذخیره شد.');
        } catch (e) {
            console.error("Failed to save to localStorage:", e);
            alert('خطا در ذخیره‌سازی. ممکن است حافظه مرورگر پر باشد.');
        }
    }
    
    function loadFromLocalStorage(isManual = false) {
        try {
            const savedData = localStorage.getItem('floorplanAppState');
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                history = parsedData.history || [];
                historyIndex = parsedData.historyIndex || -1;
                
                if (historyIndex >= 0 && history[historyIndex]) {
                     applyHistoryState(history[historyIndex]);
                } else if (parsedData.currentState) { 
                    applyHistoryState(parsedData.currentState);
                    history = [];
                    historyIndex = -1;
                    captureHistory(); 
                }
                
                if (isManual) alert('نقشه ذخیره‌شده با موفقیت بازیابی شد.');
                return true;
            } else {
                if (isManual) alert('هیچ نقشه ذخیره‌شده‌ای یافت نشد.');
                return false;
            }
        } catch (e) {
            console.error("Failed to load from localStorage:", e);
            if (isManual) alert('خطا در بازیابی نقشه.');
            return false;
        }
    }

    // --- Event Listeners ---
    generateBtn.addEventListener('click', () => {
        // Clear saved broken states manually by regenerating
        generateFloorplan();
    });
    addRoomBtn.addEventListener('click', addRoom);
    addBalconyBtn.addEventListener('click', addBalcony);
    removeBalconyBtn.addEventListener('click', removeBalcony);
    exportSvgBtn.addEventListener('click', exportSVG);
    printBtn.addEventListener('click', printPlan);
    
    panToolBtn.addEventListener('click', () => switchTool('pan'));
    drawToolBtn.addEventListener('click', () => switchTool('draw'));
    
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undo();
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        }
    });

    saveStorageBtn.addEventListener('click', saveToLocalStorage);
    loadStorageBtn.addEventListener('click', () => loadFromLocalStorage(true));

    view2dBtn.addEventListener('click', () => {
        view2dBtn.classList.add('active');
        view3dBtn.classList.remove('active');
        svg.style.display = 'block';
        threeContainer.style.display = 'none';
        render();
    });

    view3dBtn.addEventListener('click', () => {
        view3dBtn.classList.add('active');
        view2dBtn.classList.remove('active');
        sv
