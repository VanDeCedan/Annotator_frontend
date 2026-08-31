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
    const [exportMode, setExportMode] = useState<'full' | 'crop'>('full');
    const [resize, setResize] = useState('');
    const [grayscale, setGrayscale] = useState(false);
    const [yoloVersion, setYoloVersion] = useState('v8');
    
    // Splits
    const [splitEnabled, setSplitEnabled] = useState(true);
    const [trainPct, setTrainPct] = useState(70);
    const [valPct, setValPct] = useState(20);
    const [testPct, setTestPct] = useState(10);
    
    // Augmentations
    const [augmentationEnabled, setAugmentationEnabled] = useState(false);
    const [numAugs, setNumAugs] = useState(3);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [flipHV, setFlipHV] = useState(false);
    const [grain, setGrain] = useState(false);
    const [noise, setNoise] = useState(false);
    const [noiseIntensity, setNoiseIntensity] = useState(5);
    const [blur, setBlur] = useState(false);
    const [blurIntensity, setBlurIntensity] = useState(5);
    const [maxRotation, setMaxRotation] = useState(0);
    const [includeAugInVal, setIncludeAugInVal] = useState(false);
    
    // OCR Specific Augmentations
    const [ocrDistortionIntensity, setOcrDistortionIntensity] = useState(0);
    const [ocrNoiseIntensity, setOcrNoiseIntensity] = useState(0);
    const [ocrBlurIntensity, setOcrBlurIntensity] = useState(0);

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
                export_mode: ['Yolo', 'Yolo OBB'].includes(projectType) ? exportMode : 'full',
                resize: resize || null,
                grayscale: grayscale,
                split_enabled: splitEnabled,
                train_pct: trainPct,
                val_pct: valPct,
                test_pct: testPct,
                yolo_version: yoloVersion,
                augmentation: augmentationEnabled ? {
                    num_augs: numAugs,
                    flip_h: flipH,
                    flip_v: flipV,
                    flip_hv: flipHV,
                    grain,
                    noise,
                    noise_intensity: noiseIntensity,
                    blur,
                    blur_intensity: blurIntensity,
                    max_rotation: maxRotation,
                    ocr_distortion_intensity: ocrDistortionIntensity,
                    ocr_noise_intensity: ocrNoiseIntensity,
                    ocr_blur_intensity: ocrBlurIntensity,
                    include_aug_in_val: includeAugInVal
                } : null
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
                    
                    {/* Export Mode (YOLO & YOLO OBB) */}
                    {['Yolo', 'Yolo OBB'].includes(projectType) && (
                        <div className="mb-6 bg-white border border-gray-200 rounded p-4">
                            <label className="block text-sm font-bold text-black mb-2">Export Output Specification</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setExportMode('full')}
                                    className={`p-3 rounded border text-left transition flex flex-col justify-between ${
                                        exportMode === 'full'
                                            ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium ring-1 ring-blue-600'
                                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-bold">🖼️ Full Images & Labels</span>
                                        {exportMode === 'full' && <span className="text-blue-600 text-xs">✓ Active</span>}
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        Full images + bounding box YOLO label files (.txt) & data.yaml
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setExportMode('crop')}
                                    className={`p-3 rounded border text-left transition flex flex-col justify-between ${
                                        exportMode === 'crop'
                                            ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium ring-1 ring-blue-600'
                                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-bold">✂️ Sliced Box Crops</span>
                                        {exportMode === 'crop' && <span className="text-blue-600 text-xs">✓ Active</span>}
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        Uses boxes as a slicer to output cropped sub-images per class
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Format Settings */}
                    <div className="mb-6">
                        <div className="grid grid-cols-2 gap-4">
                            {['Yolo', 'Yolo OBB'].includes(projectType) && exportMode === 'full' && (
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
                            <div className={['Yolo', 'Yolo OBB'].includes(projectType) && exportMode === 'crop' ? 'col-span-2' : ''}>
                                <Input 
                                    label="Resize (e.g. 640x640) - Optional" 
                                    value={resize} 
                                    onChange={e => setResize(e.target.value)}
                                    placeholder="WxH"
                                />
                            </div>
                            <div className="col-span-2 mt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={grayscale} 
                                        onChange={e => setGrayscale(e.target.checked)}
                                        className="rounded bg-white border-gray-300 text-blue-500 cursor-pointer"
                                    />
                                    <span className="text-sm font-semibold text-black">Convert to Black & White (Grayscale)</span>
                                </label>
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
                    {/* Augmentations */}
                    <div className="border-t border-gray-200 pt-6 mt-6">
                        <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                            <div className="bg-blue-500 text-white p-1 rounded">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Data Augmentation</h3>
                        </div>

                        <label className="flex items-center gap-4 cursor-pointer mb-6">
                            <div className={`relative w-14 h-7 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${augmentationEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}>
                                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${augmentationEnabled ? 'translate-x-7' : ''}`}></div>
                            </div>
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={augmentationEnabled} 
                                onChange={(e) => setAugmentationEnabled(e.target.checked)} 
                            />
                            <span className="text-base font-medium text-gray-800">Augmentation enabled</span>
                        </label>

                        {augmentationEnabled && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">Augmented copies per original image</label>
                                    <input 
                                        type="number" 
                                        min="1" max="10"
                                        value={numAugs} 
                                        onChange={e => setNumAugs(Number(e.target.value))}
                                        className="w-32 border border-gray-300 rounded px-3 py-2 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <p className="text-sm text-gray-500 mt-2">Each original image will produce this many additional augmented variants.</p>
                                </div>
                                
                                {projectType === 'Ocr' ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-gray-900">Distorsion forte (Distortion)</span>
                                                <span className="text-xs text-gray-500">De 0 (désactivé) à 10</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="range" 
                                                    min="0" max="10" step="0.5" 
                                                    value={ocrDistortionIntensity} 
                                                    onChange={e => setOcrDistortionIntensity(parseFloat(e.target.value))} 
                                                    className="w-32 accent-blue-600 cursor-pointer" 
                                                />
                                                <span className="text-sm font-bold text-gray-700 w-8 text-right">{ocrDistortionIntensity}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-gray-900">Bruit (Noise)</span>
                                                <span className="text-xs text-gray-500">De 0 (désactivé) à 10</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="range" 
                                                    min="0" max="10" step="0.5" 
                                                    value={ocrNoiseIntensity} 
                                                    onChange={e => setOcrNoiseIntensity(parseFloat(e.target.value))} 
                                                    className="w-32 accent-blue-600 cursor-pointer" 
                                                />
                                                <span className="text-sm font-bold text-gray-700 w-8 text-right">{ocrNoiseIntensity}</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-gray-900">Flou (Blur)</span>
                                                <span className="text-xs text-gray-500">De 0 (désactivé) à 10</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="range" 
                                                    min="0" max="10" step="0.5" 
                                                    value={ocrBlurIntensity} 
                                                    onChange={e => setOcrBlurIntensity(parseFloat(e.target.value))} 
                                                    className="w-32 accent-blue-600 cursor-pointer" 
                                                />
                                                <span className="text-sm font-bold text-gray-700 w-8 text-right">{ocrBlurIntensity}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input type="checkbox" checked={flipH} onChange={e => setFlipH(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 bg-white" />
                                            <div className="-mt-0.5">
                                                <div className="text-sm font-semibold text-gray-900">Horizontal Flip</div>
                                                <div className="text-sm text-gray-500 mt-0.5">Mirror image left-right</div>
                                            </div>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input type="checkbox" checked={flipV} onChange={e => setFlipV(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 bg-white" />
                                            <div className="-mt-0.5">
                                                <div className="text-sm font-semibold text-gray-900">Vertical Flip</div>
                                                <div className="text-sm text-gray-500 mt-0.5">Mirror image top-bottom</div>
                                            </div>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input type="checkbox" checked={flipHV} onChange={e => setFlipHV(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 bg-white" />
                                            <div className="-mt-0.5">
                                                <div className="text-sm font-semibold text-gray-900">Both Flips (180&deg;)</div>
                                                <div className="text-sm text-gray-500 mt-0.5">Rotate 180 degrees</div>
                                            </div>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input type="checkbox" checked={grain} onChange={e => setGrain(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 bg-white" />
                                            <div className="-mt-0.5">
                                                <div className="text-sm font-semibold text-gray-900">Camera Grain</div>
                                                <div className="text-sm text-gray-500 mt-0.5">Add subtle photographic grain</div>
                                            </div>
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input type="checkbox" checked={noise} onChange={e => setNoise(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 bg-white" />
                                                <div className="-mt-0.5">
                                                    <div className="text-sm font-semibold text-gray-900">Salt & Pepper / Gaussian Noise</div>
                                                    <div className="text-sm text-gray-500 mt-0.5">Add random pixel noise</div>
                                                </div>
                                            </label>
                                            {noise && (
                                                <div className="flex items-center gap-3 ml-7">
                                                    <span className="text-sm text-gray-600">Intensity:</span>
                                                    <input 
                                                        type="range" 
                                                        min="1" max="10" step="1" 
                                                        value={noiseIntensity} 
                                                        onChange={e => setNoiseIntensity(parseFloat(e.target.value))} 
                                                        className="w-32 accent-blue-600 cursor-pointer" 
                                                    />
                                                    <span className="text-sm font-bold text-gray-700 w-8">{noiseIntensity}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input type="checkbox" checked={blur} onChange={e => setBlur(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 bg-white" />
                                                <div className="-mt-0.5">
                                                    <div className="text-sm font-semibold text-gray-900">Gaussian Blur</div>
                                                    <div className="text-sm text-gray-500 mt-0.5">Slightly blur the image</div>
                                                </div>
                                            </label>
                                            {blur && (
                                                <div className="flex items-center gap-3 ml-7">
                                                    <span className="text-sm text-gray-600">Intensity:</span>
                                                    <input 
                                                        type="range" 
                                                        min="1" max="10" step="1" 
                                                        value={blurIntensity} 
                                                        onChange={e => setBlurIntensity(parseFloat(e.target.value))} 
                                                        className="w-32 accent-blue-600 cursor-pointer" 
                                                    />
                                                    <span className="text-sm font-bold text-gray-700 w-8">{blurIntensity}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 w-4 h-4 flex items-center justify-center">
                                                <span className="text-gray-400">⟳</span>
                                            </div>
                                            <div className="-mt-0.5 flex-1">
                                                <div className="text-sm font-semibold text-gray-900">Random Rotation</div>
                                                <div className="text-sm text-gray-500 mt-0.5 mb-2">Rotate images randomly between -max and +max degrees</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-600">Max angle:</span>
                                                    <input 
                                                        type="number" 
                                                        min="0" 
                                                        max="180" 
                                                        value={maxRotation}
                                                        onChange={e => setMaxRotation(parseInt(e.target.value) || 0)}
                                                        className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                    <span className="text-sm text-gray-600">degrees</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="mt-6 border border-blue-200 bg-blue-50/50 rounded-lg overflow-hidden">
                                    <label className="flex items-center space-x-3 text-sm text-gray-700 p-4 cursor-pointer hover:bg-blue-50 transition-colors border-b border-blue-100">
                                        <input type="checkbox" checked={includeAugInVal} onChange={e => setIncludeAugInVal(e.target.checked)} className="rounded bg-white border-blue-300 text-blue-600 w-4 h-4 focus:ring-blue-500" />
                                        <span className="font-semibold text-blue-900">Include Augmented Data in Validation & Test Sets</span>
                                    </label>

                                    {!includeAugInVal && (
                                        <div className="p-4 bg-blue-50/80 text-sm text-blue-800 flex items-start gap-3">
                                            <span className="text-blue-500 font-bold">ℹ Note:</span>
                                            <p>Data augmentation applies strictly to the <strong>Training</strong> set. Validation and Test sets will receive only original un-augmented images.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-300">
                <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
                <Button onClick={handleGenerate} isLoading={isLoading} disabled={matchedFiles.length === 0 || isLoading}>
                    3. Generate &amp; Download
                </Button>
            </div>
        </Modal>
    );
}
