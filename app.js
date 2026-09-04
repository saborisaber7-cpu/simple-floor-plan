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
    const RENDER_SCALE = 50; // pixels per meter

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
        tool: 'pan', // 'pan' or 'draw'
        drawing: { active: false, start: {x: 0, y: 0}, end: {x: 0, y: 0}, tempLine: null }
    };

    // --- History (Undo/Redo) State ---
    let history = [];
    let historyIndex = -1;


    // --- 3D Scene (Three.js) ---
    let scene, camera, renderer, controls;

    // --- Core Functions ---

    function generateFloorplan() {
        captureHistory();
        state.groundWidth = parseFloat(groundWidthInput.value);
        state.groundLength = parseFloat(groundLengthInput.value);
        state.bedrooms = parseInt(bedroomsInput.value);
        state.floors = parseInt(floorsInput.value);
        state.structureType = structureTypeInput.value;
        state.autoColumns = autoColumnsCheckbox.checked;

        generateRooms();
        if (state.autoColumns) {
            generateColumns();
        } else {
            state.columns = [];
        }
        render();
    }

    function generateRooms() {
        state.rooms = [];
        state.walls = [];
        state.hasBalcony = false;

        const w = state.groundWidth;
        const l = state.groundLength;

        // 1. Living Room & Kitchen (پذیرایی و آشپزخانه)
        const livingRatio = 0.4; // 40% of length for living area
        const livingLength = l * livingRatio;
        state.rooms.push({ name: 'پذیرایی', x: 0, y: 0, width: w, height: livingLength, type: 'living' });
        state.rooms.push({ name: 'آشپزخانه', x: 0, y: livingLength, width: w / 2, height: 3, type: 'kitchen' });

        // 2. Bathroom & WC (حمام و سرویس بهداشتی)
        // Fixed coordinates to prevent overlap
        const serviceY = livingLength;
        const serviceWidth = 2;
        const wcHeight = 2;
        const bathHeight = 3;
        state.rooms.push({ name: 'سرویس', x: w - serviceWidth, y: serviceY, width: serviceWidth, height: wcHeight, type: 'wc' });
        state.rooms.push({ name: 'حمام', x: w - serviceWidth, y: serviceY + wcHeight, width: serviceWidth, height: bathHeight, type: 'bath' });


        // 3. Bedrooms (اتاق خواب‌ها)
        const bedroomsAreaY = livingLength + Math.max(3, wcHeight + bathHeight); // Start after kitchen/services
        const remainingLength = l - bedroomsAreaY;
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
        
        // 4. Entrance Door (درب ورودی)
        state.rooms.push({ name: 'ورودی', x: w - 1.2, y: 0, width: 1.2, height: 0, type: 'door' }); // Use height=0 for door marker

        extractWallsFromRooms();
    }
    
    function addBalcony() {
        if(state.hasBalcony) return;
        captureHistory();
        state.hasBalcony = true;
        const livingRoom = state.rooms.find(r => r.type === 'living');
        if (livingRoom) {
            state.rooms.push({
                name: 'بالکن',
                x: 0,
                y: -1.5, // Protruding from the front
                width: livingRoom.width / 2,
                height: 1.5,
                type: 'balcony'
            });
        }
        extractWallsFromRooms();
        render();
    }

    function removeBalcony() {
        if(!state.hasBalcony) return;
        captureHistory();
        state.hasBalcony = false;
        state.rooms = state.rooms.filter(r => r.type !== 'balcony');
        extractWallsFromRooms();
        render();
    }


    function extractWallsFromRooms() {
        const wallSegments = new Set();
        const addWall = (x1, y1, x2, y2) => {
            const key = [x1, y1, x2, y2].sort().join(',');
            if (!wallSegments.has(key)) {
                wallSegments.add(key);
                state.walls.push({ x1, y1, x2, y2 });
            }
        };

        state.rooms.forEach(room => {
            if (room.type === 'door' || room.type === 'balcony') return; // Don't draw walls for doors/balconies
            const x1 = room.x;
            const y1 = room.y;
            const x2 = room.x + room.width;
            const y2 = room.y + room.height;
            addWall(x1, y1, x2, y1); // Top
            addWall(x2, y1, x2, y2); // Right
            addWall(x1, y2, x2, y2); // Bottom
            addWall(x1, y1, x1, y2); // Left
        });
    }

    function generateColumns() {
        state.columns = [];
        const colSize = (state.structureType === 'concrete' ? 0.4 : 0.3); // meters
        const gridX = [], gridY = [];

        // Create a grid based on room corners
        state.rooms.forEach(room => {
            if(room.type !== 'door') {
                gridX.push(room.x, room.x + room.width);
                gridY.push(room.y, room.y + room.height);
            }
        });

        // Add ground boundaries
        gridX.push(0, state.groundWidth);
        gridY.push(0, state.groundLength);

        // Deduplicate and sort grid lines
        const uniqueX = [...new Set(gridX)].sort((a,b)=>a-b);
        const uniqueY = [...new Set(gridY)].sort((a,b)=>a-b);

        // Place columns at intersections
        uniqueX.forEach(x => {
            uniqueY.forEach(y => {
                // Check if point is on a wall
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
        captureHistory();
        state.rooms.push({ name: 'اتاق جدید', x: 1, y: 1, width: 4, height: 3, type: 'bedroom'});
        extractWallsFromRooms();
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
        svg.innerHTML = ''; // Clear SVG

        // Add definitions for markers etc.
        const defs = document.createElementNS(SVG_NS, 'defs');
        defs.innerHTML = `<marker id="dim-tick" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="2" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="currentColor"/></marker>`;
        svg.appendChild(defs);

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('transform', `translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})`);
        svg.appendChild(g);

        // Render rooms, walls, doors, dimensions...
        state.rooms.forEach(room => {
            if (room.type === 'balcony') {
                drawBalcony(g, room);
            }
             if (room.type === 'door') {
                drawDoor(g, {x: room.x, y: room.y, width: room.width, wall: 'bottom'});
            } else {
                 // Room Label
                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', (room.x + room.width / 2) * RENDER_SCALE);
                text.setAttribute('y', (room.y + room.height / 2) * RENDER_SCALE);
                text.setAttribute('class', 'room-label');
                text.textContent = room.name;
                g.appendChild(text);

                // Dimensions
                drawDimension(g, room.x, room.y - 0.5, room.x + room.width, room.y - 0.5, room.width);
                drawDimension(g, room.x - 0.5, room.y, room.x - 0.5, room.y + room.height, room.height);
            }
        });
        
        state.walls.forEach(wall => drawWall(g, wall));
        
        state.columns.forEach(col => {
            const rect = document.createElementNS(SVG_NS, 'rect');
            rect.setAttribute('x', col.x * RENDER_SCALE);
            rect.setAttribute('y', col.y * RENDER_SCALE);
            rect.setAttribute('width', col.width * RENDER_SCALE);
            rect.setAttribute('height', col.height * RENDER_SCALE);
            rect.setAttribute('class', 'column');
            g.appendChild(rect);
        });

        // Update viewBox to handle pan/zoom
        updateViewBox();
    }

    // --- Drawing Helpers (SVG) ---
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
        
        if (width <= 0) return; // Don't render zero-length door line

        // Create a gap in the wall
        const gap = document.createElementNS(SVG_NS, 'line');
        gap.setAttribute('x1', x);
        gap.setAttribute('y1', y);
        gap.setAttribute('x2', x + width);
        gap.setAttribute('y2', y);
        gap.setAttribute('stroke', getComputedStyle(document.body).getPropertyValue('--card-background').trim());
        gap.setAttribute('stroke-width', '10'); // Thicker than wall to create a clean gap
        parent.appendChild(gap);

        // Draw door swing arc
        const arc = document.createElementNS(SVG_NS, 'path');
        const startX = x;
        const startY = y;
        const endX = x;
        const endY = y - width; // Arc goes "inward"
        // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        const d = `M ${startX} ${startY} A ${width} ${width} 0 0 0 ${endX} ${endY}`;
        arc.setAttribute('d', d);
        arc.setAttribute('class', 'door-arc');
        parent.appendChild(arc);

        // Draw door panel
        const panel = document.createElementNS(SVG_NS, 'line');
        panel.setAttribute('x1', startX);
        panel.setAttribute('y1', startY);
        panel.setAttribute('x2', endX);
        panel.setAttribute('y2', endY);
        panel.setAttribute('class', 'wall'); // Style as a wall for consistency
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
        text.textContent = label.toFixed(2) + 'm';
        g.appendChild(text);
        parent.appendChild(g);
    }
    
    function updateViewBox() {
        const bbox = svg.getBBox();
        const padding = 50;
        const vb = {
            x: bbox.x - padding,
            y: bbox.y - padding,
            w: bbox.width + padding * 2,
            h: bbox.height + padding * 2
        };
        // This is a simplified viewBox setting. Pan/Zoom logic handles the transform directly.
        // A full viewBox implementation would be more complex.
    }


    // --- 3D Rendering ---
    function init3D() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(getComputedStyle(document.body).getPropertyValue('--background-color').trim());

        camera = new THREE.PerspectiveCamera(75, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 1000);
        camera.position.set(state.groundWidth * 1.5, state.groundLength * 1.5, state.groundWidth * 1.5);
        camera.lookAt(state.groundWidth / 2, 0, state.groundLength / 2);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
        renderer.shadowMap.enabled = true;
        threeContainer.appendChild(renderer.domElement);

        // Basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 50, 50);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Orbit controls would be added here if we had them
        // For now, we use the same pan/zoom as SVG
    }

    function render3D() {
        if (!scene) init3D();

        // Clear previous objects
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
        // Re-add lights
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

        // Slabs (Floors)
        for (let i = 0; i < state.floors; i++) {
            const slabGeom = new THREE.BoxGeometry(state.groundWidth, slabThickness, state.groundLength);
            const slab = new THREE.Mesh(slabGeom, slabMaterial);
            slab.position.set(state.groundWidth / 2, i * wallHeight, state.groundLength / 2);
            scene.add(slab);
        }

        // Walls
        for (let i = 0; i < state.floors; i++) {
             // Only draw walls if it's not the last floor (roof) OR there's only one floor
            if (i < state.floors - 1 || state.floors === 1) {
                state.walls.forEach(wall => {
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
