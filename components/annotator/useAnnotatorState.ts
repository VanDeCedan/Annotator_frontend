import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

export function useAnnotatorState(projectId: number, imageNames: string[], initialIndex: number = 0, prefixEnabled: boolean = false, prefixValue: string = '') {
    const showToast = useAppStore(s => s.showToast);
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [classes, setClasses] = useState<any[]>([]);
    const [projectType, setProjectType] = useState('');
    const [activeClassCode, setActiveClassCode] = useState<number | null>(null);
    
    const [labels, setLabels] = useState<any[]>([]);
    const [ocrValue, setOcrValue] = useState('');
    const [deskewAngle, setDeskewAngle] = useState(0);
    const [deskewCrop, setDeskewCrop] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    const [prelabelStatus, setPrelabelStatus] = useState<string | null>(null);
    const [originalPrelabels, setOriginalPrelabels] = useState<any[]>([]);
    const [ocrCharset, setOcrCharset] = useState<string | null>(null);
    const [dbnetModelPath, setDbnetModelPath] = useState<string | null>(null);
    const [ocrEnableClass, setOcrEnableClass] = useState(false);
    const [autoPredictEnabled, setAutoPredictEnabled] = useState(false);
    const autoPredictEnabledRef = useRef(autoPredictEnabled);
    useEffect(() => { autoPredictEnabledRef.current = autoPredictEnabled; }, [autoPredictEnabled]);
    const [ocrConf, setOcrConf] = useState(0.25);
    const ocrConfRef = useRef(ocrConf);
    useEffect(() => { ocrConfRef.current = ocrConf; }, [ocrConf]);
    
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
    const [isAiLoading, setIsAiLoading] = useState(false);
    
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
                if (proj) {
                    setProjectType(proj.type);
                    setOcrCharset(proj.ocr_charset || null);
                    setDbnetModelPath(proj.dbnet_model_path || null);
                    setOcrEnableClass(!!proj.ocr_enable_class);
                }
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
            let shouldAutoPredict = false;
            try {
                const res = await api.get(`/projects/${projectId}/labels/${currentImageName}`);
                const data = res.data;
                
                if (data.type === 'Yolo' || data.type === 'Yolo OBB' || data.type === 'KIE') {
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

                    if (data.labels && data.labels.length === 0 && autoPredictEnabledRef.current) {
                        shouldAutoPredict = true;
                    }
                    
                    setLabels(initialLabels);
                } else if (data.type === 'Ocr') {
                    let val = '';
                    if (data.label !== null) {
                        val = data.label;
                        setPrelabelStatus(null);
                        if (data.class_code !== undefined && data.class_code !== -1) {
                            setActiveClassCode(data.class_code);
                        }
                    }
                    else if (data.prelabel !== null) {
                        val = data.prelabel;
                        setPrelabelStatus('Loaded from prelabel');
                        if (data.prelabel_class_code !== undefined && data.prelabel_class_code !== -1) {
                            setActiveClassCode(data.prelabel_class_code);
                        }
                        if (autoPredictEnabledRef.current) shouldAutoPredict = true;
                    } else {
                        val = '';
                        setPrelabelStatus(null);
                        if (classes.length > 0) {
                            setActiveClassCode(classes[0].code);
                        } else {
                            setActiveClassCode(null);
                        }
                        if (autoPredictEnabledRef.current) shouldAutoPredict = true;
                    }
                    if (data.label === null && prefixEnabled && prefixValue && !val.startsWith(prefixValue)) {
                        val = prefixValue + val;
                    }
                    setOcrValue(val);
                } else if (data.type === 'Classification') {
                    if (data.label !== null) setActiveClassCode(data.label);
                    else if (data.prelabel !== null) {
                        setActiveClassCode(data.prelabel);
                        setPrelabelStatus('Loaded from prelabel');
                    } else setPrelabelStatus(null);
                } else if (data.type === 'Deskewer') {
                    if (data.label !== null) {
                        setDeskewAngle(data.label);
                        if (data.crop_box) {
                            const [x, y, w, h] = data.crop_box.split(',').map(Number);
                            setDeskewCrop({ x, y, w, h });
                        } else {
                            setDeskewCrop(null);
                        }
                    }
                    else if (data.prelabel !== null) {
                        setDeskewAngle(data.prelabel);
                        if (data.crop_box) {
                            const [x, y, w, h] = data.crop_box.split(',').map(Number);
                            setDeskewCrop({ x, y, w, h });
                        } else {
                            setDeskewCrop(null);
                        }
                        setPrelabelStatus('Loaded from prelabel');
                    } else {
                        setDeskewAngle(0);
                        setDeskewCrop(null);
                        setPrelabelStatus(null);
                    }
                } else if (data.type === 'NER') {
                    let initialLabels: any[] = [];
                    if (data.prelabels && data.prelabels.length > 0 && data.labels.length === 0) {
                        initialLabels = data.prelabels;
                        setPrelabelStatus('Loaded from prelabels');
                    } else {
                        initialLabels = data.labels || [];
                        setPrelabelStatus(null);
                    }
                    setLabels(initialLabels);
                }
            } catch (err) {
                console.error(err);
            }

            if (shouldAutoPredict) {
                try {
                    setIsAiLoading(true);
                    const predictRes = await api.post(`/projects/${projectId}/predict-live`, {
                        img_name: currentImageName,
                        conf_thresh: ocrConfRef.current,
                    });
                    if (predictRes.data) {
                        if (predictRes.data.boxes) {
                            const newLabels = predictRes.data.boxes.map((b: any) => ({
                                class_code: b.class_code,
                                coordinates: b.coordinates,
                                box_image: null
                            }));
                            setLabels(newLabels);
                            setPrelabelStatus('AI predicted');
                        } else if (predictRes.data.text !== undefined) {
                            let predicted = predictRes.data.text as string;
                            if (prefixEnabled && prefixValue && !predicted.startsWith(prefixValue)) {
                                predicted = prefixValue + predicted;
                            }
                            setOcrValue(predicted);
                            setPrelabelStatus('AI predicted');
                        }
                    }
                } catch (err) {
                    console.error('Auto-predict failed', err);
                } finally {
                    setIsAiLoading(false);
                }
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
        if (!currentImageName) return true;
        
        // No check required for text_value as KIE BBOX and class projects do not transcribe OCR.

        setIsSaving(true);
        try {
            if (projectType === 'Yolo' || projectType === 'Yolo OBB') {
                await api.post(`/projects/${projectId}/labels/yolo`, {
                    img_name: currentImageName,
                    labels
                });
            } else if (projectType === 'KIE') {
                await api.post(`/projects/${projectId}/labels/kie`, {
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
                if (ocrCharset) {
                    const invalidChars = Array.from(ocrValue).filter(char => !ocrCharset.includes(char));
                    if (invalidChars.length > 0) {
                        const uniqueInvalids = Array.from(new Set(invalidChars)).join(' ');
                        showToast(`Invalid characters: ${uniqueInvalids}. Only characters in "${ocrCharset}" are allowed.`, 'error');
                        setIsSaving(false);
                        return;
                    }
                }
                await api.post(`/projects/${projectId}/labels/ocr`, {
                    img_name: currentImageName,
                    value: ocrValue,
                    class_code: activeClassCode !== null ? activeClassCode : -1
                });
            } else if (projectType === 'Deskewer') {
                const cropBoxStr = deskewCrop ? `${deskewCrop.x},${deskewCrop.y},${deskewCrop.w},${deskewCrop.h}` : null;
                await api.post(`/projects/${projectId}/labels/deskewer`, {
                    img_name: currentImageName,
                    angle: deskewAngle,
                    crop_box: cropBoxStr
                });
            } else if (projectType === 'NER') {
                await api.post(`/projects/${projectId}/labels/ner`, {
                    file_name: currentImageName,
                    labels
                });
            }
            showToast('Saved', 'success');
            setPrelabelStatus(null);
            return true;
        } catch (err) {
            showToast('Failed to save', 'error');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const [selectedLabelIndex, setSelectedLabelIndex] = useState<number | null>(null);

    const nextImage = async () => {
        const saved = await saveCurrent();
        if (!saved) return;
        if (currentIndex < imageNames.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        } else {
             showToast(`Reached end of ${projectType === 'NER' ? 'texts' : 'images'}`, 'success');
        }
    };
    
    const prevImage = async () => {
        const saved = await saveCurrent();
        if (!saved) return;
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        }
    };

    const skipImage = async () => {
        if (!currentImageName) return;
        try {
            await api.post(`/projects/${projectId}/labels/skip`, {
                img_name: currentImageName
            });
        } catch (err) {
            console.error(`Failed to mark ${projectType === 'NER' ? 'text' : 'image'} as skipped`, err);
        }
        
        if (currentIndex < imageNames.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        } else {
             showToast(`Reached end of ${projectType === 'NER' ? 'texts' : 'images'}`, 'success');
        }
    };

    const deleteImage = async () => {
        if (!currentImageName) return;
        if (!confirm(`Are you sure you want to permanently delete this ${projectType === 'NER' ? 'text file' : 'image'} from the workspace and dataset?`)) return;
        
        try {
            await api.delete(`/projects/${projectId}/images/local_workspace/${currentImageName}`);
            showToast(`${projectType === 'NER' ? 'Text file' : 'Image'} deleted`, 'success');
            
            // Advance to next image but keep imageNames updated? 
            // We shouldn't mutate imageNames directly as it's a prop, but for the UI to move on:
            if (currentIndex < imageNames.length - 1) {
                setCurrentIndex(currentIndex + 1);
                setSelectedLabelIndex(null);
                setImageDimensions(null);
            } else if (currentIndex > 0) {
                setCurrentIndex(currentIndex - 1);
                setSelectedLabelIndex(null);
                setImageDimensions(null);
            } else {
                showToast(`No more ${projectType === 'NER' ? 'texts' : 'images'}`, 'success');
            }
            
            // Ideally, the parent component should remove the image from the array, 
            // but for now, advancing the index works to get off the deleted image.
            // If the user goes back, it will 404, so we might want a callback.
            // But we don't have a callback prop for delete in useAnnotatorState right now.
        } catch (err) {
            showToast(`Failed to delete ${projectType === 'NER' ? 'text file' : 'image'}`, 'error');
        }
    };

    const jumpToImage = async (targetIndex: number) => {
        const saved = await saveCurrent();
        if (!saved) return;
        if (targetIndex >= 0 && targetIndex < imageNames.length) {
            setCurrentIndex(targetIndex);
            setSelectedLabelIndex(null);
            setImageDimensions(null);
        } else {
            showToast(`Invalid ${projectType === 'NER' ? 'text file' : 'image'} index`, 'error');
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
            } else if (projectType === 'KIE') {
                await api.post(`/projects/${projectId}/labels/kie`, {
                    img_name: currentImageName,
                    labels: []
                });
            } else if (projectType === 'NER') {
                await api.post(`/projects/${projectId}/labels/ner`, {
                    file_name: currentImageName,
                    labels: []
                });
            }
            showToast('Saved as Background', 'success');
            setPrelabelStatus(null);
        } catch (err) {
            showToast('Failed to save', 'error');
            return false;
        } finally {
            setIsSaving(false);
            if (currentIndex < imageNames.length - 1) {
                setCurrentIndex(currentIndex + 1);
                setImageDimensions(null);
            } else {
                 showToast(`Reached end of ${projectType === 'NER' ? 'texts' : 'images'}`, 'success');
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



    const runDbnetDetection = async (boxThresh: number = 0.7) => {
        if (!currentImageName || projectType !== 'KIE') return;
        setIsAiLoading(true);
        try {
            const res = await api.post(`/projects/${projectId}/kie/detect-boxes`, { img_name: currentImageName, box_thresh: boxThresh });
            if (res.data && res.data.boxes) {
                const newLabels = res.data.boxes.map((coords: string) => ({
                    class_code: classes.length > 0 ? classes[0].code : 0,
                    coordinates: coords,
                    text_value: ""
                }));
                setLabels(newLabels); // Écrase les anciennes prédictions / pre-labels
                showToast(`Detected ${newLabels.length} boxes (Replaced existing)`, 'success');
            }
        } catch (err) {
            showToast('Failed to run DBNet detection', 'error');
            console.error(err);
        } finally {
            setIsAiLoading(false);
        }
    };

    const runParseqOcr = async (minConfidence: number = 0.0) => {
        if (!currentImageName || projectType !== 'KIE' || labels.length === 0) return;
        setIsAiLoading(true);
        try {
            const boxes = labels.map(l => l.coordinates);
            const res = await api.post(`/projects/${projectId}/kie/read-text`, { 
                img_name: currentImageName,
                boxes,
                min_confidence: minConfidence
            });
            if (res.data && res.data.texts) {
                const texts = res.data.texts;
                const updatedLabels = labels.map((l, i) => ({
                    ...l,
                    text_value: texts[i] !== undefined && texts[i] !== "" ? texts[i] : l.text_value
                }));
                setLabels(updatedLabels);
                showToast('OCR applied to boxes', 'success');
            }
        } catch (err) {
            showToast('Failed to run Parseq OCR', 'error');
            console.error(err);
        } finally {
            setIsAiLoading(false);
        }
    };

    const runLivePrediction = async (confThresh?: number) => {
        if (!currentImageName || !dbnetModelPath) return;
        setIsAiLoading(true);
        try {
            const payload: any = { img_name: currentImageName };
            if (confThresh !== undefined) payload.conf_thresh = confThresh;
            const res = await api.post(`/projects/${projectId}/predict-live`, payload);
            if (res.data) {
                if (res.data.boxes) {
                    const newLabels = res.data.boxes.map((b: any) => ({
                        class_code: b.class_code,
                        coordinates: b.coordinates,
                        box_image: null
                    }));
                    setLabels(newLabels);
                    showToast(`Predicted ${newLabels.length} boxes (Replaced existing)`, 'success');
                } else if (res.data.text !== undefined) {
                    setOcrValue(res.data.text);
                    showToast('OCR Prediction completed', 'success');
                }
            }
        } catch (err: any) {
            showToast(err.response?.data?.detail || 'Failed to run prediction', 'error');
            console.error(err);
        } finally {
            setIsAiLoading(false);
        }
    };

    return {
        runDbnetDetection,
        runParseqOcr,
        runLivePrediction,
        isAiLoading,

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
        deskewAngle,
        setDeskewAngle,
        deskewCrop,
        setDeskewCrop,
        prelabelStatus,
        isSaving,
        saveCurrent,
        nextImage,
        prevImage,
        skipImage,
        deleteImage,
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
        addRandomBoxImage,
        ocrCharset,
        dbnetModelPath,
        ocrEnableClass,
        autoPredictEnabled,
        setAutoPredictEnabled,
        ocrConf,
        setOcrConf,
    };
}

