import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export function useAnnotatorState(projectId: number, imageNames: string[], initialIndex: number = 0) {
    const showToast = useAppStore(s => s.showToast);
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [classes, setClasses] = useState<any[]>([]);
    const [projectType, setProjectType] = useState('');
    const [activeClassCode, setActiveClassCode] = useState<number | null>(null);
    
    // Labels state for current image
    const [labels, setLabels] = useState<any[]>([]);
    const [ocrValue, setOcrValue] = useState('');
    const [prelabelStatus, setPrelabelStatus] = useState<string | null>(null);
    const [originalPrelabels, setOriginalPrelabels] = useState<any[]>([]);
    
    // Pre-label rotation state
    const [prelabelRotationEnabled, setPrelabelRotationEnabled] = useState(false);
    const [prelabelRotationOffset, setPrelabelRotationOffset] = useState(90);
    const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);

    // Pre-label width adjustment state
    const [prelabelWidthAdjustEnabled, setPrelabelWidthAdjustEnabled] = useState(false);
    const [prelabelWidthAdjustAction, setPrelabelWidthAdjustAction] = useState<'reduce' | 'increase'>('reduce');
    const [prelabelWidthAdjustAmount, setPrelabelWidthAdjustAmount] = useState(50); // integer max 90
    const [prelabelWidthAdjustSide, setPrelabelWidthAdjustSide] = useState<'both' | 'left' | 'right'>('both');
    const [prelabelWidthAdjustClasses, setPrelabelWidthAdjustClasses] = useState<number[]>([]);
    
    const [isSaving, setIsSaving] = useState(false);
    
    // Box Images state
    const [boxImageNames, setBoxImageNames] = useState<string[]>([]);
    const [autoAddBoxImageEnabled, setAutoAddBoxImageEnabled] = useState<boolean>(false);
    const [boxImageDefaultClass, setBoxImageDefaultClass] = useState<number | null>(null);
    const [boxImageDefaultWidth, setBoxImageDefaultWidth] = useState<number>(150);
    const [boxImageDefaultHeight, setBoxImageDefaultHeight] = useState<number>(150);

    const fetchBoxImages = useCallback(async () => {
        try {
            const res = await api.get(`/projects/${projectId}/box-images`);
            setBoxImageNames(res.data.image_names || []);
        } catch (err) {
            console.error('Failed to load box images', err);
        }
    }, [projectId]);

    const currentImageName = imageNames[currentIndex];
    
    useEffect(() => {
        // Fetch project and classes
        const init = async () => {
            try {
                const [pRes, cRes] = await Promise.all([
                    api.get(`/projects`),
                    api.get(`/projects/${projectId}/classes`)
                ]);
                const proj = pRes.data.find((p: any) => p.id === projectId);
                if (proj) setProjectType(proj.type);
                setClasses(cRes.data);
                if (cRes.data.length > 0) setActiveClassCode(cRes.data[0].code);
            } catch (err) {
                showToast('Failed to load project configuration', 'error');
            }
        };
        init();
        fetchBoxImages();
    }, [projectId, fetchBoxImages, showToast]);

    useEffect(() => {
        if (!currentImageName) return;
        
        const loadLabels = async () => {
            try {
                const res = await api.get(`/projects/${projectId}/labels/${currentImageName}`);
                const data = res.data;
                
                if (data.type === 'Yolo' || data.type === 'Yolo OBB') {
                    let initialLabels: any[] = [];
                    if (data.prelabels && data.prelabels.length > 0 && data.labels.length === 0) {
                        setOriginalPrelabels(data.prelabels);
                        initialLabels = data.prelabels;
                        setPrelabelStatus('Loaded from prelabels');
                    } else {
                        initialLabels = data.labels || [];
                        setOriginalPrelabels([]);
                        setPrelabelStatus(null);
                    }

                    // Auto-add random box image if enabled & no box image exists yet
                    if (autoAddBoxImageEnabled && boxImageNames.length > 0 && !initialLabels.some(l => l.box_image)) {
                        const randomImg = boxImageNames[Math.floor(Math.random() * boxImageNames.length)];
                        const cx = 0.2 + Math.random() * 0.6;
                        const cy = 0.2 + Math.random() * 0.6;
                        const imgW = imageDimensions?.width || 1000;
                        const imgH = imageDimensions?.height || 1000;
                        const w = Math.max(0.02, Math.min(0.9, boxImageDefaultWidth / imgW));
                        const h = Math.max(0.02, Math.min(0.9, boxImageDefaultHeight / imgH));
                        const targetClass = boxImageDefaultClass !== null ? boxImageDefaultClass : (activeClassCode !== null ? activeClassCode : (classes[0]?.code ?? 0));

                        let coordsStr = '';
                        if (data.type === 'Yolo OBB') {
                            const angle = Math.random() * Math.PI * 2;
                            const cosA = Math.cos(angle);
                            const sinA = Math.sin(angle);
                            const hw = (w * imgW) / 2;
                            const hh = (h * imgH) / 2;
                            const centerPxX = cx * imgW;
                            const centerPxY = cy * imgH;

                            const corners = [
                                { x: -hw, y: -hh },
                                { x: hw, y: -hh },
                                { x: hw, y: hh },
                                { x: -hw, y: hh }
                            ].map(pt => ({
                                x: (centerPxX + pt.x * cosA - pt.y * sinA) / imgW,
                                y: (centerPxY + pt.x * sinA + pt.y * cosA) / imgH
                            }));
                            coordsStr = corners.map(pt => `${pt.x} ${pt.y}`).join(' ');
                        } else {
                            coordsStr = `${cx} ${cy} ${w} ${h}`;
                        }

                        initialLabels = [...initialLabels, {
                            class_code: targetClass,
                            coordinates: coordsStr,
                            box_image: randomImg
                        }];
                    }

                    setLabels(initialLabels);
                } else if (data.type === 'Classification') {
                    if (data.label !== null) setActiveClassCode(data.label);
                    else if (data.prelabel !== null) {
                        setActiveClassCode(data.prelabel);
                        setPrelabelStatus('Loaded from prelabel');
                    } else setPrelabelStatus(null);
                } else if (data.type === 'Ocr') {
                    if (data.label !== null) setOcrValue(data.label);
                    else if (data.prelabel !== null) {
                        setOcrValue(data.prelabel);
                        setPrelabelStatus('Loaded from prelabel');
                    } else {
                        setOcrValue('');
                        setPrelabelStatus(null);
                    }
                }
            } catch (err) {
                console.error(err);
            }
        };
        
        loadLabels();
    }, [projectId, currentImageName]);

    // OBB Utility functions
    const parseOBBCoords = useCallback((coords: number[], imgW: number, imgH: number) => {
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
    }, []);

    const getOBBCorners = useCallback((box: {cx: number, cy: number, w: number, h: number, angle: number}) => {
        const cosA = Math.cos(box.angle);
        const sinA = Math.sin(box.angle);
        const hw = box.w / 2;
        const hh = box.h / 2;
        const corners = [
            { x: -hw, y: -hh }, { x: hw, y: -hh },
            { x: hw, y: hh }, { x: -hw, y: hh }
        ];
        return corners.map(pt => ({
            x: box.cx + pt.x * cosA - pt.y * sinA,
            y: box.cy + pt.x * sinA + pt.y * cosA
        }));
    }, []);

    // Apply rotation and width adjustments when prelabels are loaded
    useEffect(() => {
        if (prelabelStatus === 'Loaded from prelabels' && originalPrelabels.length > 0) {
            let updatedLabels = [...originalPrelabels];

            // 1. Apply angle rotation offset if YOLO OBB & rotation enabled
            if (projectType === 'Yolo OBB' && prelabelRotationEnabled && imageDimensions) {
                const angleRad = (prelabelRotationOffset * Math.PI) / 180;
                updatedLabels = updatedLabels.map(lbl => {
                    const coords = lbl.coordinates.split(' ').map(Number);
                    const parsed = parseOBBCoords(coords, imageDimensions.width, imageDimensions.height);
                    if (parsed) {
                        const newAngle = parsed.angle + angleRad;
                        let newW = parsed.w;
                        let newH = parsed.h;
                        
                        // Auto-adapt box size for 90-degree increments
                        if (Math.round(Math.abs(prelabelRotationOffset) / 90) % 2 !== 0) {
                            newW = parsed.h;
                            newH = parsed.w;
                        }
                        
                        const nbox = { ...parsed, angle: newAngle, w: newW, h: newH };
                        const corners = getOBBCorners(nbox);
                        const norm = corners.map(pt => `${pt.x / imageDimensions.width} ${pt.y / imageDimensions.height}`);
                        return { ...lbl, coordinates: norm.join(' ') };
                    }
                    return lbl;
                });
            }

            // 2. Apply width adjustment if enabled & target classes selected
            if (prelabelWidthAdjustEnabled && prelabelWidthAdjustClasses.length > 0) {
                const pct = Math.min(90, Math.max(1, prelabelWidthAdjustAmount)) / 100;
                const isReduce = prelabelWidthAdjustAction === 'reduce';

                updatedLabels = updatedLabels.map(lbl => {
                    if (!prelabelWidthAdjustClasses.includes(lbl.class_code)) {
                        return lbl;
                    }

                    const coords = lbl.coordinates.split(' ').map(Number);

                    if (coords.length === 4) {
                        let [cx, cy, w, h] = coords;
                        const deltaW = w * pct;
                        let newW = w;
                        let newCx = cx;

                        if (isReduce) {
                            newW = Math.max(0.001, w - deltaW);
                            if (prelabelWidthAdjustSide === 'both') {
                                newCx = cx;
                            } else if (prelabelWidthAdjustSide === 'left') {
                                newCx = cx + deltaW / 2;
                            } else if (prelabelWidthAdjustSide === 'right') {
                                newCx = cx - deltaW / 2;
                            }
                        } else { // increase
                            newW = Math.min(1.0, w + deltaW);
                            if (prelabelWidthAdjustSide === 'both') {
                                newCx = cx;
                            } else if (prelabelWidthAdjustSide === 'left') {
                                newCx = cx - deltaW / 2;
                            } else if (prelabelWidthAdjustSide === 'right') {
                                newCx = cx + deltaW / 2;
                            }
                        }

                        return { ...lbl, coordinates: `${newCx} ${cy} ${newW} ${h}` };
                    } else if (projectType === 'Yolo OBB' && coords.length === 8 && imageDimensions) {
                        const parsed = parseOBBCoords(coords, imageDimensions.width, imageDimensions.height);
                        if (parsed) {
                            const deltaW = parsed.w * pct;
                            let newW = parsed.w;
                            let shiftX = 0;

                            if (isReduce) {
                                newW = Math.max(1, parsed.w - deltaW);
                                if (prelabelWidthAdjustSide === 'left') {
                                    shiftX = deltaW / 2;
                                } else if (prelabelWidthAdjustSide === 'right') {
                                    shiftX = -deltaW / 2;
                                }
                            } else { // increase
                                newW = parsed.w + deltaW;
                                if (prelabelWidthAdjustSide === 'left') {
                                    shiftX = -deltaW / 2;
                                } else if (prelabelWidthAdjustSide === 'right') {
                                    shiftX = deltaW / 2;
                                }
                            }

                            const ncx = parsed.cx + shiftX * Math.cos(parsed.angle);
                            const ncy = parsed.cy + shiftX * Math.sin(parsed.angle);

                            const nbox = { cx: ncx, cy: ncy, w: newW, h: parsed.h, angle: parsed.angle };
                            const corners = getOBBCorners(nbox);
                            const norm = corners.map(pt => `${pt.x / imageDimensions.width} ${pt.y / imageDimensions.height}`);
                            return { ...lbl, coordinates: norm.join(' ') };
                        }
                    }
                    return lbl;
                });
            }

            setLabels(updatedLabels);
        }
    }, [
        prelabelStatus,
        originalPrelabels,
        projectType,
        prelabelRotationEnabled,
        prelabelRotationOffset,
        prelabelWidthAdjustEnabled,
        prelabelWidthAdjustAction,
        prelabelWidthAdjustAmount,
        prelabelWidthAdjustSide,
        prelabelWidthAdjustClasses,
        imageDimensions,
        parseOBBCoords,
        getOBBCorners
    ]);

    const onImageLoaded = (width: number, height: number) => {
        setImageDimensions({ width, height });
    };

    const saveCurrent = async () => {
        if (!currentImageName) return;
        setIsSaving(true);
        try {
            if (projectType === 'Yolo' || projectType === 'Yolo OBB') {
                await api.post(`/projects/${projectId}/labels/yolo`, {
                    img_name: currentImageName,
                    labels
                });
            } else if (projectType === 'Classification') {
                if (activeClassCode !== null) {
                    await api.post(`/projects/${projectId}/labels/classification`, {
                        img_name: currentImageName,
                        class_code: activeClassCode
                    });
                }
            } else if (projectType === 'Ocr') {
                await api.post(`/projects/${projectId}/labels/ocr`, {
                    img_name: currentImageName,
                    value: ocrValue
                });
            }
            showToast('Saved', 'success');
            setPrelabelStatus(null);
        } catch (err) {
            showToast('Failed to save', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const [selectedLabelIndex, setSelectedLabelIndex] = useState<number | null>(null);

    const nextImage = async () => {
        await saveCurrent();
        if (currentIndex < imageNames.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        } else {
             showToast('Reached end of images', 'success');
        }
    };
    
    const prevImage = async () => {
        await saveCurrent();
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        }
    };

    const skipImage = () => {
        if (currentIndex < imageNames.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        } else {
             showToast('Reached end of images', 'success');
        }
    };

    const jumpToImage = (targetIndex: number) => {
        if (targetIndex >= 0 && targetIndex < imageNames.length) {
            setCurrentIndex(targetIndex);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        } else {
            showToast('Invalid image index', 'error');
        }
    };

    const markEmptyAndNext = async () => {
        if (!currentImageName) return;
        setLabels([]);
        setSelectedLabelIndex(null);
        setIsSaving(true);
        try {
            if (projectType === 'Yolo' || projectType === 'Yolo OBB') {
                await api.post(`/projects/${projectId}/labels/yolo`, {
                    img_name: currentImageName,
                    labels: []
                });
            }
            showToast('Saved as Background', 'success');
            setPrelabelStatus(null);
        } catch (err) {
            showToast('Failed to save', 'error');
        } finally {
            setIsSaving(false);
            if (currentIndex < imageNames.length - 1) {
                setCurrentIndex(currentIndex + 1);
                setImageDimensions(null);
            } else {
                 showToast('Reached end of images', 'success');
            }
        }
    };

    const addRandomBoxImage = useCallback((customPos?: { cx: number; cy: number }) => {
        if (boxImageNames.length === 0) {
            showToast('No box images uploaded for this project', 'error');
            return;
        }
        const randomImg = boxImageNames[Math.floor(Math.random() * boxImageNames.length)];
        const imgW = imageDimensions?.width || 1000;
        const imgH = imageDimensions?.height || 1000;

        const w = Math.max(0.02, Math.min(0.9, boxImageDefaultWidth / imgW));
        const h = Math.max(0.02, Math.min(0.9, boxImageDefaultHeight / imgH));

        const cx = customPos ? customPos.cx : 0.5;
        const cy = customPos ? customPos.cy : 0.5;

        const targetClass = boxImageDefaultClass !== null ? boxImageDefaultClass : (activeClassCode !== null ? activeClassCode : (classes[0]?.code ?? 0));

        let coordsStr = '';
        if (projectType === 'Yolo OBB') {
            const angle = Math.random() * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const hw = (w * imgW) / 2;
            const hh = (h * imgH) / 2;
            const centerPxX = cx * imgW;
            const centerPxY = cy * imgH;

            const corners = [
                { x: -hw, y: -hh },
                { x: hw, y: -hh },
                { x: hw, y: hh },
                { x: -hw, y: hh }
            ].map(pt => ({
                x: (centerPxX + pt.x * cosA - pt.y * sinA) / imgW,
                y: (centerPxY + pt.x * sinA + pt.y * cosA) / imgH
            }));
            coordsStr = corners.map(pt => `${pt.x} ${pt.y}`).join(' ');
        } else {
            coordsStr = `${cx} ${cy} ${w} ${h}`;
        }

        const newLbl = {
            class_code: targetClass,
            coordinates: coordsStr,
            box_image: randomImg
        };

        setLabels(prev => [...prev, newLbl]);
        showToast(`Added box image (${randomImg})`, 'success');
    }, [boxImageNames, imageDimensions, boxImageDefaultWidth, boxImageDefaultHeight, boxImageDefaultClass, activeClassCode, classes, projectType, showToast]);

    return {
        currentIndex,
        currentImageName,
        projectType,
        classes,
        activeClassCode,
        setActiveClassCode,
        labels,
        setLabels,
        selectedLabelIndex,
        setSelectedLabelIndex,
        ocrValue,
        setOcrValue,
        prelabelStatus,
        isSaving,
        saveCurrent,
        nextImage,
        prevImage,
        skipImage,
        jumpToImage,
        canNext: currentIndex < imageNames.length - 1,
        canPrev: currentIndex > 0,
        prelabelRotationEnabled,
        setPrelabelRotationEnabled,
        prelabelRotationOffset,
        setPrelabelRotationOffset,
        prelabelWidthAdjustEnabled,
        setPrelabelWidthAdjustEnabled,
        prelabelWidthAdjustAction,
        setPrelabelWidthAdjustAction,
        prelabelWidthAdjustAmount,
        setPrelabelWidthAdjustAmount,
        prelabelWidthAdjustSide,
        setPrelabelWidthAdjustSide,
        prelabelWidthAdjustClasses,
        setPrelabelWidthAdjustClasses,
        onImageLoaded,
        markEmptyAndNext,
        // Box Images exports
        boxImageNames,
        fetchBoxImages,
        autoAddBoxImageEnabled,
        setAutoAddBoxImageEnabled,
        boxImageDefaultClass,
        setBoxImageDefaultClass,
        boxImageDefaultWidth,
        setBoxImageDefaultWidth,
        boxImageDefaultHeight,
        setBoxImageDefaultHeight,
        addRandomBoxImage
    };
}
