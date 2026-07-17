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
                    setLabels(data.labels || []);
                    if (data.prelabels && data.prelabels.length > 0 && data.labels.length === 0) {
                        setLabels(data.prelabels);
                        setPrelabelStatus('Loaded from prelabels');
                    } else {
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
        } else {
             showToast('Reached end of images', 'success');
        }
    };
    
    const prevImage = async () => {
        await saveCurrent();
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setSelectedLabelIndex(null);
        }
    };

    const skipImage = () => {
        if (currentIndex < imageNames.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedLabelIndex(null);
        } else {
             showToast('Reached end of images', 'success');
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
        canNext: currentIndex < imageNames.length - 1,
        canPrev: currentIndex > 0
    };
}
