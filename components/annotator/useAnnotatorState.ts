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
    
    const [isSaving, setIsSaving] = useState(false);
    
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
    }, [projectId]);

    useEffect(() => {
        if (!currentImageName) return;
        
        const loadLabels = async () => {
            try {
                const res = await api.get(`/projects/${projectId}/labels/${currentImageName}`);
                const data = res.data;
                
                if (data.type === 'Yolo' || data.type === 'Yolo OBB') {
                    if (data.prelabels && data.prelabels.length > 0 && data.labels.length === 0) {
                        setOriginalPrelabels(data.prelabels);
                        setLabels(data.prelabels);
                        setPrelabelStatus('Loaded from prelabels');
                    } else {
                        setLabels(data.labels || []);
                        setOriginalPrelabels([]);
                        setPrelabelStatus(null);
                    }
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

    // Apply rotation when toggled, offset changed, or image loads
    useEffect(() => {
        if (projectType === 'Yolo OBB' && prelabelStatus === 'Loaded from prelabels' && imageDimensions && originalPrelabels.length > 0) {
            if (prelabelRotationEnabled) {
                const angleRad = (prelabelRotationOffset * Math.PI) / 180;
                const newLabels = originalPrelabels.map(lbl => {
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
                setLabels(newLabels);
            } else {
                // Revert to original prelabels if unchecked
                setLabels([...originalPrelabels]);
            }
        }
    }, [prelabelRotationEnabled, prelabelRotationOffset, imageDimensions, originalPrelabels, prelabelStatus, projectType, parseOBBCoords, getOBBCorners]);

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
        onImageLoaded,
        markEmptyAndNext
    };
}
