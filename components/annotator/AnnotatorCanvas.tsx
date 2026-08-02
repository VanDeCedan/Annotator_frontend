import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Point { x: number; y: number; }

interface Label {
    class_code: number;
    coordinates: string; // x1 y1 x2 y2 ...
}

interface AnnotatorCanvasProps {
    imageUrl: string;
    projectType: string;
    labels: Label[];
    onLabelsChange: (labels: Label[]) => void;
    activeClassCode: number | null;
    classes: {code: number, color: string}[];
    selectedLabelIndex?: number | null;
    setSelectedLabelIndex?: (index: number | null) => void;
    rotationStep?: number;
    autoAdaptBox?: boolean;
    doubleClickRotationEnabled?: boolean;
    inheritFirstBoxAngle?: boolean;
    zoomToAreaEnabled?: boolean;
    setZoomToAreaEnabled?: (enabled: boolean) => void;
    onImageLoad?: (width: number, height: number) => void;
    /** Called each time a new annotation box is successfully drawn. */
    onAnnotationAdded?: () => void;
}

// Helper removed

function getOBBCorners(box: {cx: number, cy: number, w: number, h: number, angle: number}) {
    const cosA = Math.cos(box.angle);
    const sinA = Math.sin(box.angle);
    const hw = box.w / 2;
    const hh = box.h / 2;

    const corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh }
    ];

    return corners.map(pt => ({
        x: box.cx + pt.x * cosA - pt.y * sinA,
        y: box.cy + pt.x * sinA + pt.y * cosA
    }));
}

function parseOBBCoords(coords: number[], imgW: number, imgH: number) {
    if (coords.length !== 8) return null;
    const x1 = coords[0] * imgW, y1 = coords[1] * imgH;
    const x2 = coords[2] * imgW, y2 = coords[3] * imgH;
    const x3 = coords[4] * imgW, y3 = coords[5] * imgH;
    const x4 = coords[6] * imgW, y4 = coords[7] * imgH;

    const cx = (x1 + x2 + x3 + x4) / 4;
    const cy = (y1 + y2 + y3 + y4) / 4;

    const w = Math.hypot(x2 - x1, y2 - y1);
    const h = Math.hypot(x3 - x2, y3 - y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    return { cx, cy, w, h, angle };
}

function isPointInRotatedRect(px: number, py: number, box: {cx: number, cy: number, w: number, h: number, angle: number}) {
    const cosA = Math.cos(-box.angle);
    const sinA = Math.sin(-box.angle);
    const dx = px - box.cx;
    const dy = py - box.cy;

    const localX = dx * cosA - dy * sinA;
    const localY = dx * sinA + dy * cosA;

    const hw = box.w / 2;
    const hh = box.h / 2;

    return (localX >= -hw && localX <= hw && localY >= -hh && localY <= hh);
}

export function AnnotatorCanvas({
    imageUrl,
    projectType,
    labels,
    onLabelsChange,
    activeClassCode,
    classes,
    selectedLabelIndex = null,
    setSelectedLabelIndex,
    rotationStep = 5,
    autoAdaptBox = true,
    doubleClickRotationEnabled = false,
    inheritFirstBoxAngle = false,
    zoomToAreaEnabled = false,
    setZoomToAreaEnabled,
    onImageLoad,
    onAnnotationAdded,
}: AnnotatorCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    
    // Viewport dragging
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    
    // Interaction mode
    type Mode = 'idle' | 'drawing_yolo' | 'drawing_obb' | 'drawing_zoom' | 'dragging_box' | 'resizing_yolo' | 'resizing_obb' | 'rotating_obb';
    const [mode, setMode] = useState<Mode>('idle');
    
    // Drawing state
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    
    // Drag/Resize state
    const [dragOffset, setDragOffset] = useState<Point>({x:0, y:0}); 
    const [resizeHandle, setResizeHandle] = useState<string | null>(null); // 'tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'
    const [originalBox, setOriginalBox] = useState<{cx: number, cy: number, w: number, h: number, angle: number} | null>(null);

    const resetZoom = useCallback(() => {
        if (!image || !containerRef.current) return;
        const cRatio = containerRef.current.clientWidth / containerRef.current.clientHeight;
        const iRatio = image.width / image.height;
        let newScale = 1;
        if (iRatio > cRatio) {
            newScale = (containerRef.current.clientWidth - 40) / image.width;
        } else {
            newScale = (containerRef.current.clientHeight - 40) / image.height;
        }
        setScale(newScale);
        setOffset({
            x: (containerRef.current.clientWidth - image.width * newScale) / 2,
            y: (containerRef.current.clientHeight - image.height * newScale) / 2
        });
    }, [image]);

    // Keyboard delete and rotation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedLabelIndex === null) return;
            
            // Do not handle key events if user is typing in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const newLabels = [...labels];
                newLabels.splice(selectedLabelIndex, 1);
                onLabelsChange(newLabels);
                if (setSelectedLabelIndex) setSelectedLabelIndex(null);
            }
            else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && projectType === 'Yolo OBB') {
                e.preventDefault();
                if (!image) return;
                
                const newLabels = [...labels];
                const lbl = newLabels[selectedLabelIndex];
                const coords = lbl.coordinates.split(' ').map(Number);
                
                if (coords.length === 8) {
                    const parsed = parseOBBCoords(coords, image.width, image.height);
                    if (parsed) {
                        const angleDelta = rotationStep * (Math.PI / 180);
                        const newAngle = e.key === 'ArrowRight' ? parsed.angle + angleDelta : parsed.angle - angleDelta;
                        
                        let newW = parsed.w;
                        let newH = parsed.h;
                        
                        // Auto-adapt box size for 90-degree increments
                        if (autoAdaptBox && rotationStep % 90 === 0 && (Math.abs(rotationStep) / 90) % 2 === 1) {
                            newW = parsed.h;
                            newH = parsed.w;
                        }
                        
                        const nbox = { ...parsed, angle: newAngle, w: newW, h: newH };
                        const corners = getOBBCorners(nbox);
                        const norm = corners.map(pt => `${pt.x / image.width} ${pt.y / image.height}`);
                        lbl.coordinates = norm.join(' ');
                        onLabelsChange(newLabels);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedLabelIndex, labels, onLabelsChange, setSelectedLabelIndex, projectType, image, rotationStep, autoAdaptBox]);

    useEffect(() => {
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            setImage(img);
            if (onImageLoad) onImageLoad(img.width, img.height);
            if (containerRef.current) {
                const cRatio = containerRef.current.clientWidth / containerRef.current.clientHeight;
                const iRatio = img.width / img.height;
                let newScale = 1;
                if (iRatio > cRatio) {
                    newScale = (containerRef.current.clientWidth - 40) / img.width;
                } else {
                    newScale = (containerRef.current.clientHeight - 40) / img.height;
                }
                setScale(newScale);
                setOffset({
                    x: (containerRef.current.clientWidth - img.width * newScale) / 2,
                    y: (containerRef.current.clientHeight - img.height * newScale) / 2
                });
            }
        };
    }, [imageUrl]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (containerRef.current) {
            canvas.width = containerRef.current.clientWidth;
            canvas.height = containerRef.current.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(offset.x, offset.y);
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0);

        // Draw Labels
        labels.forEach((lbl, idx) => {
            const isSelected = idx === selectedLabelIndex;
            const cls = classes.find(c => c.code === lbl.class_code);
            const color = cls ? cls.color : '#ff0000';
            
            const coords = lbl.coordinates.split(' ').map(Number);
            if (coords.length < 4) return;

            ctx.strokeStyle = color;
            ctx.fillStyle = color + '40'; // 25% opacity
            ctx.lineWidth = (isSelected ? 3 : 2) / scale;

            if (isSelected) {
                ctx.setLineDash([5 / scale, 5 / scale]);
            } else {
                ctx.setLineDash([]);
            }

            if (projectType === 'Yolo OBB' && coords.length === 8) {
                const parsed = parseOBBCoords(coords, image.width, image.height);
                if (!parsed) return;
                
                ctx.save();
                ctx.translate(parsed.cx, parsed.cy);
                ctx.rotate(parsed.angle);

                ctx.beginPath();
                ctx.rect(-parsed.w / 2, -parsed.h / 2, parsed.w, parsed.h);
                ctx.fill();
                ctx.stroke();

                // Always draw rotation indicator (wheel) so orientation is instantly visible
                const rotDist = 30 / scale;
                const wheelSize = 5 / scale;
                
                ctx.save();
                ctx.setLineDash([]);
                ctx.strokeStyle = color;
                ctx.fillStyle = isSelected ? '#ffffff' : color;
                ctx.lineWidth = 1.5 / scale;

                ctx.beginPath();
                ctx.moveTo(0, -parsed.h / 2);
                ctx.lineTo(0, -parsed.h / 2 - rotDist);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, -parsed.h / 2 - rotDist, wheelSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();

                // Draw resize handles for selected OBB
                if (isSelected) {
                    ctx.setLineDash([]);
                    const handleSize = 6 / scale;
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5 / scale;
                    
                    const drawHandle = (hx: number, hy: number) => {
                        ctx.fillRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
                        ctx.strokeRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
                    };

                    const hw = parsed.w / 2;
                    const hh = parsed.h / 2;
                    
                    drawHandle(-hw, -hh); // tl
                    drawHandle(hw, -hh); // tr
                    drawHandle(hw, hh); // br
                    drawHandle(-hw, hh); // bl
                    drawHandle(0, -hh); // t
                    drawHandle(0, hh); // b
                    drawHandle(-hw, 0); // l
                    drawHandle(hw, 0); // r
                }
                ctx.restore();
                
            } else if (projectType === 'Yolo' && coords.length === 4) {
                const [cx, cy, w, h] = coords;
                const x1 = (cx - w/2) * image.width;
                const y1 = (cy - h/2) * image.height;
                const w_px = w * image.width;
                const h_px = h * image.height;
                
                ctx.beginPath();
                ctx.rect(x1, y1, w_px, h_px);
                ctx.fill();
                ctx.stroke();

                // Draw handles for selected YOLO
                if (isSelected) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5 / scale;
                    const s = 6 / scale; // Handle size
                    
                    const drawHandle = (hx: number, hy: number) => {
                        ctx.fillRect(hx - s/2, hy - s/2, s, s);
                        ctx.strokeRect(hx - s/2, hy - s/2, s, s);
                    };

                    drawHandle(x1, y1); // tl
                    drawHandle(x1 + w_px/2, y1); // t
                    drawHandle(x1 + w_px, y1); // tr
                    drawHandle(x1, y1 + h_px/2); // l
                    drawHandle(x1 + w_px, y1 + h_px/2); // r
                    drawHandle(x1, y1 + h_px); // bl
                    drawHandle(x1 + w_px/2, y1 + h_px); // b
                    drawHandle(x1 + w_px, y1 + h_px); // br
                }
            }
        });

        // Draw current drawing or zoom box
        if (mode === 'drawing_yolo' || mode === 'drawing_obb') {
            const cls = classes.find(c => c.code === activeClassCode);
            const color = cls ? cls.color : '#ffffff';
            ctx.setLineDash([]);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / scale;

            if (currentPoints.length === 2) {
                 const p1 = currentPoints[0];
                 const p2 = currentPoints[1];
                 ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            }
        } else if (mode === 'drawing_zoom') {
            ctx.save();
            ctx.strokeStyle = '#2563eb';
            ctx.fillStyle = 'rgba(37, 99, 235, 0.25)';
            ctx.lineWidth = 2 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);

            if (currentPoints.length === 2) {
                 const p1 = currentPoints[0];
                 const p2 = currentPoints[1];
                 const x = Math.min(p1.x, p2.x);
                 const y = Math.min(p1.y, p2.y);
                 const w = Math.abs(p2.x - p1.x);
                 const h = Math.abs(p2.y - p1.y);
                 ctx.fillRect(x, y, w, h);
                 ctx.strokeRect(x, y, w, h);
            }
            ctx.restore();
        }

        ctx.restore();
    }, [image, scale, offset, labels, currentPoints, classes, projectType, selectedLabelIndex, activeClassCode, mode]);

    useEffect(() => {
        draw();
    }, [draw]);

    const getMousePos = (e: React.MouseEvent | React.WheelEvent) => {
        if (!canvasRef.current || !image) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - offset.x) / scale,
            y: (e.clientY - rect.top - offset.y) / scale
        };
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleNativeWheel = (e: WheelEvent) => {
            e.preventDefault();
            
            if (!e.ctrlKey) {
                // Pan
                setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
                return;
            }

            // Zoom
            if (!canvasRef.current || !image) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const posX = (e.clientX - rect.left - offset.x) / scale;
            const posY = (e.clientY - rect.top - offset.y) / scale;

            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const newScale = scale * delta;

            setOffset({
                x: offset.x - posX * (newScale - scale),
                y: offset.y - posY * (newScale - scale)
            });
            setScale(newScale);
        };

        container.addEventListener('wheel', handleNativeWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleNativeWheel);
    }, [scale, offset, image]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 || e.button === 2 || e.shiftKey) { 
            setIsPanning(true);
            setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
            return;
        }

        if (!image) return;
        const pos = getMousePos(e);

        if (zoomToAreaEnabled) {
            if (setSelectedLabelIndex) setSelectedLabelIndex(null);
            setMode('drawing_zoom');
            setCurrentPoints([pos, pos]);
            return;
        }

        // 1. Check if clicking on an active selection's handles
        if (selectedLabelIndex !== null) {
            const lbl = labels[selectedLabelIndex];
            const coords = lbl.coordinates.split(' ').map(Number);
            const r = 8 / scale; // Hit radius

            if (projectType === 'Yolo OBB' && coords.length === 8) {
                const parsed = parseOBBCoords(coords, image.width, image.height);
                if (parsed) {
                    const dx = pos.x - parsed.cx;
                    const dy = pos.y - parsed.cy;
                    const lx = dx * Math.cos(-parsed.angle) - dy * Math.sin(-parsed.angle);
                    const ly = dx * Math.sin(-parsed.angle) + dy * Math.cos(-parsed.angle);

                    const hw = parsed.w / 2;
                    const hh = parsed.h / 2;
                    const rotDist = 30 / scale;

                    // Hit test rotation handle
                    if (Math.hypot(lx - 0, ly - (-hh - rotDist)) <= r * 1.5) {
                        setMode('rotating_obb');
                        setOriginalBox(parsed);
                        return;
                    }

                    // Hit test resize corners
                    if (Math.abs(lx - (-hw)) <= r && Math.abs(ly - (-hh)) <= r) { setMode('resizing_obb'); setResizeHandle('tl'); setOriginalBox(parsed); return; }
                    if (Math.abs(lx - (hw)) <= r && Math.abs(ly - (-hh)) <= r) { setMode('resizing_obb'); setResizeHandle('tr'); setOriginalBox(parsed); return; }
                    if (Math.abs(lx - (hw)) <= r && Math.abs(ly - (hh)) <= r) { setMode('resizing_obb'); setResizeHandle('br'); setOriginalBox(parsed); return; }
                    if (Math.abs(lx - (-hw)) <= r && Math.abs(ly - (hh)) <= r) { setMode('resizing_obb'); setResizeHandle('bl'); setOriginalBox(parsed); return; }

                    // Hit test resize edges
                    const edgeHitSize = r * 1.5;
                    if (Math.abs(ly - (-hh)) <= edgeHitSize && lx >= -hw && lx <= hw) { setMode('resizing_obb'); setResizeHandle('t'); setOriginalBox(parsed); return; }
                    if (Math.abs(ly - (hh)) <= edgeHitSize && lx >= -hw && lx <= hw) { setMode('resizing_obb'); setResizeHandle('b'); setOriginalBox(parsed); return; }
                    if (Math.abs(lx - (-hw)) <= edgeHitSize && ly >= -hh && ly <= hh) { setMode('resizing_obb'); setResizeHandle('l'); setOriginalBox(parsed); return; }
                    if (Math.abs(lx - (hw)) <= edgeHitSize && ly >= -hh && ly <= hh) { setMode('resizing_obb'); setResizeHandle('r'); setOriginalBox(parsed); return; }
                }

            } else if (projectType === 'Yolo' && coords.length === 4) {
                const [cx, cy, w, h] = coords;
                const x1 = (cx - w/2) * image.width;
                const y1 = (cy - h/2) * image.height;
                const x2 = x1 + w * image.width;
                const y2 = y1 + h * image.height;
                const mx = cx * image.width;
                const my = cy * image.height;

                const handles = [
                    { id: 'tl', x: x1, y: y1 }, { id: 'tr', x: x2, y: y1 },
                    { id: 'bl', x: x1, y: y2 }, { id: 'br', x: x2, y: y2 },
                    { id: 't', x: mx, y: y1 }, { id: 'b', x: mx, y: y2 },
                    { id: 'l', x: x1, y: my }, { id: 'r', x: x2, y: my }
                ];

                for (const handle of handles) {
                    if (Math.abs(pos.x - handle.x) <= r * 2 && Math.abs(pos.y - handle.y) <= r * 2) {
                        setMode('resizing_yolo');
                        setResizeHandle(handle.id);
                        setOriginalBox({cx, cy, w, h, angle: 0});
                        return;
                    }
                }
            }
        }

        // 2. Check if clicking inside any box (prioritize selected, then others)
        let clickedIndex: number | null = null;
        let clickedDragOffset = { x: 0, y: 0 };

        // Test from top (last drawn) to bottom (first drawn)
        for (let i = labels.length - 1; i >= 0; i--) {
            const lbl = labels[i];
            const coords = lbl.coordinates.split(' ').map(Number);
            
            if (projectType === 'Yolo OBB' && coords.length === 8) {
                const parsed = parseOBBCoords(coords, image.width, image.height);
                if (parsed && isPointInRotatedRect(pos.x, pos.y, parsed)) {
                    clickedIndex = i;
                    clickedDragOffset = { x: pos.x - parsed.cx, y: pos.y - parsed.cy };
                    setOriginalBox(parsed);
                    break;
                }
            } else if (projectType === 'Yolo' && coords.length === 4) {
                const [cx, cy, w, h] = coords;
                const px = cx * image.width;
                const py = cy * image.height;
                const pw = w * image.width;
                const ph = h * image.height;
                
                if (pos.x >= px - pw/2 && pos.x <= px + pw/2 && pos.y >= py - ph/2 && pos.y <= py + ph/2) {
                    clickedIndex = i;
                    clickedDragOffset = { x: pos.x - px, y: pos.y - py };
                    break;
                }
            }
        }

        if (clickedIndex !== null) {
            if (setSelectedLabelIndex) setSelectedLabelIndex(clickedIndex);
            setMode('dragging_box');
            setDragOffset(clickedDragOffset);
            return;
        }

        // 3. Start drawing
        if (activeClassCode === null && projectType !== 'Classification' && projectType !== 'Ocr') {
            if (setSelectedLabelIndex) setSelectedLabelIndex(null);
            return;
        }

        if (setSelectedLabelIndex) setSelectedLabelIndex(null);
        
        if (projectType === 'Yolo OBB') {
            setMode('drawing_obb');
            setCurrentPoints([pos, pos]);
        } else if (projectType === 'Yolo') {
            setMode('drawing_yolo');
            setCurrentPoints([pos, pos]);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
            return;
        }

        if (!image) return;
        const pos = getMousePos(e);

        if (mode === 'drawing_yolo' || mode === 'drawing_obb' || mode === 'drawing_zoom') {
            setCurrentPoints([currentPoints[0], pos]);
        } 
        else if (mode === 'dragging_box' && selectedLabelIndex !== null) {
            const newLabels = [...labels];
            const lbl = newLabels[selectedLabelIndex];
            const coords = lbl.coordinates.split(' ').map(Number);
            
            if (projectType === 'Yolo') {
                const newCx = (pos.x - dragOffset.x) / image.width;
                const newCy = (pos.y - dragOffset.y) / image.height;
                coords[0] = newCx;
                coords[1] = newCy;
                lbl.coordinates = coords.join(' ');
            } else if (projectType === 'Yolo OBB' && originalBox) {
                const ncx = pos.x - dragOffset.x;
                const ncy = pos.y - dragOffset.y;
                const nbox = { ...originalBox, cx: ncx, cy: ncy };
                const corners = getOBBCorners(nbox);
                const norm = corners.map(pt => `${pt.x / image.width} ${pt.y / image.height}`);
                lbl.coordinates = norm.join(' ');
            }
            onLabelsChange(newLabels);
        }
        else if (mode === 'rotating_obb' && selectedLabelIndex !== null && originalBox) {
            const newLabels = [...labels];
            const lbl = newLabels[selectedLabelIndex];
            
            const angle = Math.atan2(pos.y - originalBox.cy, pos.x - originalBox.cx);
            const nbox = { ...originalBox, angle: angle + Math.PI / 2 };
            const corners = getOBBCorners(nbox);
            const norm = corners.map(pt => `${pt.x / image.width} ${pt.y / image.height}`);
            lbl.coordinates = norm.join(' ');
            onLabelsChange(newLabels);
        }
        else if (mode === 'resizing_obb' && selectedLabelIndex !== null && originalBox) {
            const newLabels = [...labels];
            const lbl = newLabels[selectedLabelIndex];
            
            const dx = pos.x - originalBox.cx;
            const dy = pos.y - originalBox.cy;
            const cosA = Math.cos(-originalBox.angle);
            const sinA = Math.sin(-originalBox.angle);
            const lx = dx * cosA - dy * sinA;
            const ly = dx * sinA + dy * cosA;

            let left = -originalBox.w / 2;
            let right = originalBox.w / 2;
            let top = -originalBox.h / 2;
            let bottom = originalBox.h / 2;

            if (resizeHandle?.includes('l')) left = Math.min(lx, right - 10);
            if (resizeHandle?.includes('r')) right = Math.max(lx, left + 10);
            if (resizeHandle?.includes('t')) top = Math.min(ly, bottom - 10);
            if (resizeHandle?.includes('b')) bottom = Math.max(ly, top + 10);

            const nw = right - left;
            const nh = bottom - top;
            const lcx = (left + right) / 2;
            const lcy = (top + bottom) / 2;

            const cosB = Math.cos(originalBox.angle);
            const sinB = Math.sin(originalBox.angle);
            
            const ncx = originalBox.cx + lcx * cosB - lcy * sinB;
            const ncy = originalBox.cy + lcx * sinB + lcy * cosB;

            const nbox = { cx: ncx, cy: ncy, w: nw, h: nh, angle: originalBox.angle };
            const corners = getOBBCorners(nbox);
            const norm = corners.map(pt => `${pt.x / image.width} ${pt.y / image.height}`);
            lbl.coordinates = norm.join(' ');
            onLabelsChange(newLabels);
        }
        else if (mode === 'resizing_yolo' && selectedLabelIndex !== null && originalBox) {
            const newLabels = [...labels];
            const lbl = newLabels[selectedLabelIndex];
            
            const {cx, cy, w, h} = originalBox;
            let x1 = (cx - w/2) * image.width;
            let y1 = (cy - h/2) * image.height;
            let x2 = x1 + w * image.width;
            let y2 = y1 + h * image.height;
            
            // Adjust coordinates based on handle
            if (resizeHandle?.includes('l')) x1 = pos.x;
            if (resizeHandle?.includes('r')) x2 = pos.x;
            if (resizeHandle?.includes('t')) y1 = pos.y;
            if (resizeHandle?.includes('b')) y2 = pos.y;
            
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2);
            const maxY = Math.max(y1, y2);
            
            const nw = (maxX - minX) / image.width;
            const nh = (maxY - minY) / image.height;
            const ncx = (minX + (maxX - minX)/2) / image.width;
            const ncy = (minY + (maxY - minY)/2) / image.height;
            
            lbl.coordinates = `${ncx} ${ncy} ${nw} ${nh}`;
            onLabelsChange(newLabels);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isPanning) {
            setIsPanning(false);
            return;
        }

        if (mode === 'drawing_zoom' && image && containerRef.current) {
            setMode('idle');
            const p1 = currentPoints[0];
            const p2 = currentPoints[1];
            if (p1 && p2) {
                const minX = Math.min(p1.x, p2.x);
                const maxX = Math.max(p1.x, p2.x);
                const minY = Math.min(p1.y, p2.y);
                const maxY = Math.max(p1.y, p2.y);

                const w = maxX - minX;
                const h = maxY - minY;

                if (w > 5 && h > 5) {
                    const cw = containerRef.current.clientWidth;
                    const ch = containerRef.current.clientHeight;

                    const cx = minX + w / 2;
                    const cy = minY + h / 2;

                    const newScale = Math.min((cw - 40) / w, (ch - 40) / h);
                    const clampedScale = Math.max(0.1, Math.min(newScale, 50));

                    const newOffsetX = cw / 2 - cx * clampedScale;
                    const newOffsetY = ch / 2 - cy * clampedScale;

                    setScale(clampedScale);
                    setOffset({ x: newOffsetX, y: newOffsetY });
                }
            }
            setCurrentPoints([]);
        }
        else if ((mode === 'drawing_yolo' || mode === 'drawing_obb') && image) {
            setMode('idle');
            const p1 = currentPoints[0];
            const p2 = currentPoints[1];
            
            const minX = Math.min(p1.x, p2.x);
            const maxX = Math.max(p1.x, p2.x);
            const minY = Math.min(p1.y, p2.y);
            const maxY = Math.max(p1.y, p2.y);
            
            const w = maxX - minX;
            const h = maxY - minY;
            
            if (w > 5 && h > 5) {
                const cx = minX + w/2;
                const cy = minY + h/2;
                
                let coords = '';
                if (mode === 'drawing_obb') {
                    // Start with 0 angle, or inherit from first box
                    let initialAngle = 0;
                    if (inheritFirstBoxAngle && labels.length > 0) {
                        const firstBoxCoords = labels[0].coordinates.split(' ').map(Number);
                        const parsed = parseOBBCoords(firstBoxCoords, image.width, image.height);
                        if (parsed) {
                            initialAngle = parsed.angle;
                        }
                    }
                    const corners = getOBBCorners({cx, cy, w, h, angle: initialAngle});
                    const norm = corners.map(pt => `${pt.x / image.width} ${pt.y / image.height}`);
                    coords = norm.join(' ');
                } else {
                    coords = `${cx / image.width} ${cy / image.height} ${w / image.width} ${h / image.height}`;
                }
                
                const newLbls = [...labels, { class_code: activeClassCode!, coordinates: coords }];
                onLabelsChange(newLbls);
                if (setSelectedLabelIndex) setSelectedLabelIndex(newLbls.length - 1);
                if (onAnnotationAdded) onAnnotationAdded();
            }
            setCurrentPoints([]);
        } else if (mode === 'dragging_box' || mode === 'resizing_yolo' || mode === 'resizing_obb' || mode === 'rotating_obb') {
            setMode('idle');
            setResizeHandle(null);
            setOriginalBox(null);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        if (mode === 'drawing_yolo' || mode === 'drawing_obb' || mode === 'drawing_zoom') {
            setCurrentPoints([]);
            setMode('idle');
        } else {
             // Quick delete selected or last if nothing selected
             if (selectedLabelIndex !== null) {
                 const newLabels = [...labels];
                 newLabels.splice(selectedLabelIndex, 1);
                 onLabelsChange(newLabels);
                 if (setSelectedLabelIndex) setSelectedLabelIndex(null);
             } else if (labels.length > 0 && !isPanning) {
                 onLabelsChange(labels.slice(0, -1));
             }
        }
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (!image || !containerRef.current) return;

        const pos = getMousePos(e);

        // Check if double click was on an OBB box when rotation is enabled
        if (doubleClickRotationEnabled && projectType === 'Yolo OBB') {
            let clickedIndex: number | null = null;
            let originalBox = null;

            for (let i = labels.length - 1; i >= 0; i--) {
                const lbl = labels[i];
                const coords = lbl.coordinates.split(' ').map(Number);
                if (coords.length === 8) {
                    const parsed = parseOBBCoords(coords, image.width, image.height);
                    if (parsed && isPointInRotatedRect(pos.x, pos.y, parsed)) {
                        clickedIndex = i;
                        originalBox = parsed;
                        break;
                    }
                }
            }

            if (clickedIndex !== null && originalBox) {
                const newLabels = [...labels];
                const lbl = newLabels[clickedIndex];
                
                let newAngle = originalBox.angle + (rotationStep * Math.PI / 180);
                newAngle = newAngle % (2 * Math.PI);
                if (newAngle < 0) newAngle += 2 * Math.PI;

                let nw = originalBox.w;
                let nh = originalBox.h;

                if (autoAdaptBox) {
                    const stepCount = Math.round(Math.abs(rotationStep) / 90) % 2;
                    if (stepCount !== 0) {
                        nw = originalBox.h;
                        nh = originalBox.w;
                    }
                }

                const nbox = { cx: originalBox.cx, cy: originalBox.cy, w: nw, h: nh, angle: newAngle };
                const corners = getOBBCorners(nbox);
                const norm = corners.map(pt => `${pt.x / image.width} ${pt.y / image.height}`);
                lbl.coordinates = norm.join(' ');
                onLabelsChange(newLabels);
                return;
            }
        }

        // Double-click Zoom on Area: Zoom into the clicked point
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const cRatio = cw / ch;
        const iRatio = image.width / image.height;
        const fitScale = iRatio > cRatio ? (cw - 40) / image.width : (ch - 40) / image.height;

        let targetScale: number;
        if (scale < fitScale * 1.8) {
            targetScale = fitScale * 3; // Step 1: Zoom in 3x
        } else if (scale < fitScale * 4.5) {
            targetScale = fitScale * 6; // Step 2: Zoom in 6x
        } else {
            targetScale = fitScale; // Step 3: Reset back to fit image
        }

        const newOffsetX = cw / 2 - pos.x * targetScale;
        const newOffsetY = ch / 2 - pos.y * targetScale;

        setScale(targetScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
    };

    return (
        <div ref={containerRef} className={`flex-1 bg-[#EAEEF5] overflow-hidden relative ${zoomToAreaEnabled ? 'cursor-zoom-in' : 'cursor-crosshair'}`}>
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleContextMenu}
                className="absolute top-0 left-0"
            />

            {/* Top Floating Toolbar for Quick Controls */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur border border-gray-300 p-1.5 rounded-lg shadow-md">
                <button
                    onClick={() => setZoomToAreaEnabled && setZoomToAreaEnabled(!zoomToAreaEnabled)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        zoomToAreaEnabled
                            ? 'bg-blue-600 text-white shadow-inner ring-2 ring-blue-400'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                    }`}
                    title="Toggle Area Zoom mode (Drag on image to zoom to area)"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                    <span>Area Zoom</span>
                    {zoomToAreaEnabled && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-white/30 text-white rounded font-bold uppercase">ON</span>
                    )}
                </button>

                <button
                    onClick={resetZoom}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-medium border border-gray-300 transition-colors"
                    title="Reset zoom to fit image"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-2V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    Fit Image
                </button>
            </div>
            
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur text-white text-xs px-3 py-2 rounded-lg pointer-events-none shadow z-10">
                <p className="font-semibold text-blue-300">Zoom: {Math.round(scale * 100)}%</p>
                {zoomToAreaEnabled ? (
                    <p className="text-yellow-300 font-semibold animate-pulse">🔍 Drag rectangle on image to zoom</p>
                ) : (
                    <p>Select: Click Box | Draw: Drag Box | <span className="text-yellow-300 font-semibold">Double-Click: Zoom Area</span></p>
                )}
                {projectType === 'Yolo OBB' && selectedLabelIndex !== null && (
                    <p className="text-yellow-300 font-bold">Drag top handle to rotate</p>
                )}
                <p>Delete: Select & Del / Right Click | Pan: Middle Click / Shift</p>
            </div>
        </div>
    );
}
