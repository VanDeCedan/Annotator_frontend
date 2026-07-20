import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import api from '@/lib/api';
import { useAppStore } from '@/lib/store';

interface DatasetExportPanelProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: number;
    projectType: string;
}

export function DatasetExportPanel({ isOpen, onClose, projectId, projectType }: DatasetExportPanelProps) {
    const showToast = useAppStore(s => s.showToast);
    const [isLoading, setIsLoading] = useState(false);
    
    // Step 1: Data fetching
    const [labeledImages, setLabeledImages] = useState<string[]>([]);
    const [isFetchingLabels, setIsFetchingLabels] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLabeledImages();
            setMatchedFiles([]);
            setTotalSelected(0);
        }
    }, [isOpen]);

    const fetchLabeledImages = async () => {
        setIsFetchingLabels(true);
        try {
            const res = await api.get(`/projects/${projectId}/labels/progress/`);
            setLabeledImages(res.data.labeled_images || []);
        } catch (err) {
            showToast('Failed to fetch labeled images count', 'error');
        } finally {
            setIsFetchingLabels(false);
        }
    };

    // Step 2: File selection
    const [matchedFiles, setMatchedFiles] = useState<File[]>([]);
    const [totalSelected, setTotalSelected] = useState(0);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        setTotalSelected(files.length);
        
        const matched = files.filter(f => labeledImages.includes(f.name));
        setMatchedFiles(matched);
    };

    // Step 3: Settings
    const [resize, setResize] = useState('');
    const [yoloVersion, setYoloVersion] = useState('v8');
    
    // Splits
    const [splitEnabled, setSplitEnabled] = useState(true);
    const [trainPct, setTrainPct] = useState(70);
    const [valPct, setValPct] = useState(20);
    const [testPct, setTestPct] = useState(10);
    
    // Augmentations
    const [numAugs, setNumAugs] = useState(3);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [flipHV, setFlipHV] = useState(false);
    const [grain, setGrain] = useState(false);
    const [noise, setNoise] = useState(false);
    const [blur, setBlur] = useState(false);

    const handleGenerate = async () => {
        if (matchedFiles.length === 0) {
            showToast('No matched images to upload.', 'error');
            return;
        }

        setIsLoading(true);
        try {
            // Upload in batches
            const sessionId = 'generate_' + Date.now();
            const BATCH_SIZE = 50;
            
            showToast(`Uploading ${matchedFiles.length} images for generation...`, 'warning');
            
            for (let i = 0; i < matchedFiles.length; i += BATCH_SIZE) {
                const batch = matchedFiles.slice(i, i + BATCH_SIZE);
                const formData = new FormData();
                batch.forEach(f => formData.append('files', f));
                
                await api.post(`/projects/${projectId}/images/upload?session_id=${sessionId}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            showToast('Images uploaded. Generating dataset (this may take a while)...', 'warning');

            // Generate and Download
            const payload = {
                session_id: sessionId,
                resize: resize || null,
                split_enabled: splitEnabled,
                train_pct: trainPct,
                val_pct: valPct,
                test_pct: testPct,
                yolo_version: yoloVersion,
                augmentation: {
                    num_augs: numAugs,
                    flip_h: flipH,
                    flip_v: flipV,
                    flip_hv: flipHV,
                    grain,
                    noise,
                    blur
                }
            };
            
            const res = await api.post(`/projects/${projectId}/dataset/generate`, payload, {
                responseType: 'blob'
            });
            
            // Trigger download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `dataset_${projectId}_${Date.now()}.zip`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            
            showToast('Dataset exported successfully', 'success');
            onClose();
        } catch (err: any) {
             showToast(err.response?.data?.detail || err.message || 'Failed to generate dataset', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Dataset" width="max-w-3xl">
            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2">
                
                {/* Step 1: Upload Images */}
                <div className="bg-gray-50 border border-gray-200 rounded p-4">
                    <h3 className="text-base font-bold text-black mb-2">1. Upload Original Images</h3>
                    <p className="text-sm text-gray-600 mb-4">
                        {isFetchingLabels 
                            ? 'Checking database for labeled images...' 
                            : `The database contains labels for ${labeledImages.length} images. Please select the folder containing your original images.`}
                    </p>
                    
                    <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded cursor-pointer bg-white hover:bg-gray-50">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <svg className="w-8 h-8 mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="mb-2 text-sm text-gray-500"><span className="font-bold">Click to select files</span> (or select a folder)</p>
                            </div>
                            {/* @ts-ignore - webkitdirectory is non-standard but works in most browsers */}
                            <input type="file" className="hidden" multiple accept="image/*" onChange={handleFileSelect} webkitdirectory="true" directory="true" />
                        </label>
                    </div>

                    {totalSelected > 0 && (
                        <div className="mt-4 p-3 bg-white border border-gray-200 rounded">
                            <p className="text-sm">
                                Selected <span className="font-bold text-black">{totalSelected}</span> images.
                            </p>
                            <p className={`text-sm font-medium ${matchedFiles.length > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Found labels for {matchedFiles.length} images. 
                                {totalSelected - matchedFiles.length > 0 && ` (${totalSelected - matchedFiles.length} unlabelled images will be ignored).`}
                            </p>
                            {matchedFiles.length > 0 && matchedFiles.length < labeledImages.length && (
                                <p className="text-sm text-amber-600 mt-1">
                                    Warning: {labeledImages.length - matchedFiles.length} labeled images are missing from your selection.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Step 2: Configuration (Only shown if matched files exist) */}
                <div className={`transition-opacity duration-300 ${matchedFiles.length > 0 ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <h3 className="text-base font-bold text-black mb-4">2. Configure Generation Options</h3>
                    
                    {/* Format Settings */}
                    <div className="mb-6">
                        <div className="grid grid-cols-2 gap-4">
                            {['Yolo', 'Yolo OBB'].includes(projectType) && (
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">YOLO Format</label>
                                    <select 
                                        value={yoloVersion} 
                                        onChange={e => setYoloVersion(e.target.value)}
                                        className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-black outline-none"
                                    >
                                        <option value="v5">YOLO v5 PyTorch</option>
                                        <option value="v8">YOLO v8 / v11 PyTorch</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <Input 
                                    label="Resize (e.g. 640x640) - Optional" 
                                    value={resize} 
                                    onChange={e => setResize(e.target.value)}
                                    placeholder="WxH"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Train/Test Split */}
                    <div className="border-t border-gray-300 pt-4 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-bold text-black">Train/Test Split</h4>
                            <label className="flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={splitEnabled}
                                    onChange={e => setSplitEnabled(e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>
                        
                        {splitEnabled && (
                            <div className="grid grid-cols-3 gap-4">
                                <Input label="Train %" type="number" value={trainPct} onChange={e => setTrainPct(Number(e.target.value))} />
                                <Input label="Valid %" type="number" value={valPct} onChange={e => setValPct(Number(e.target.value))} />
                                <Input label="Test %" type="number" value={testPct} onChange={e => setTestPct(Number(e.target.value))} />
                            </div>
                        )}
                    </div>

                    {/* Augmentations */}
                    <div className="border-t border-gray-300 pt-4">
                        <h4 className="text-sm font-bold text-black mb-3">Augmentations</h4>
                        <div className="mb-4">
                            <Input 
                                label="Augmented Images per Original" 
                                type="number" 
                                min="1" max="10"
                                value={numAugs} 
                                onChange={e => setNumAugs(Number(e.target.value))} 
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-3">
                            <label className="flex items-center space-x-2 text-sm text-gray-700">
                                <input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} className="rounded bg-white border-gray-300 text-blue-500" />
                                <span>Horizontal Flip</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700">
                                <input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} className="rounded bg-white border-gray-300 text-blue-500" />
                                <span>Vertical Flip</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700">
                                <input type="checkbox" checked={flipHV} onChange={e => setFlipHV(e.target.checked)} className="rounded bg-white border-gray-300 text-blue-500" />
                                <span>Both Flips (180&deg;)</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700">
                                <input type="checkbox" checked={grain} onChange={e => setGrain(e.target.checked)} className="rounded bg-white border-gray-300 text-blue-500" />
                                <span>Camera Grain</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700">
                                <input type="checkbox" checked={noise} onChange={e => setNoise(e.target.checked)} className="rounded bg-white border-gray-300 text-blue-500" />
                                <span>Salt & Pepper / Gauss Noise</span>
                            </label>
                            <label className="flex items-center space-x-2 text-sm text-gray-700">
                                <input type="checkbox" checked={blur} onChange={e => setBlur(e.target.checked)} className="rounded bg-white border-gray-300 text-blue-500" />
                                <span>Gaussian Blur</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-300">
                <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
                <Button onClick={handleGenerate} isLoading={isLoading} disabled={matchedFiles.length === 0 || isLoading}>
                    3. Generate & Download
                </Button>
            </div>
        </Modal>
    );
}
