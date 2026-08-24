import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/lib/store';

interface NERAnnotatorProps {
  fileUrl: string;
  labels: any[];
  onLabelsChange: (labels: any[]) => void;
  activeClassCode: number | null;
  classes: any[];
  selectedLabelIndices: number[];
  setSelectedLabelIndices: (indices: number[]) => void;
  setActiveClassCode?: (code: number) => void;
  onAnnotationAdded?: () => void;
}

export function NERAnnotator({
  fileUrl,
  labels,
  onLabelsChange,
  activeClassCode,
  classes,
  selectedLabelIndices,
  setSelectedLabelIndices,
  setActiveClassCode,
  onAnnotationAdded,
}: NERAnnotatorProps) {
  const [text, setText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { showToast } = useAppStore();

  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, labelIndex: number | null }>({ visible: false, x: 0, y: 0, labelIndex: null });

  const mergeSelected = () => {
    if (selectedLabelIndices.length < 2) return;
    const allSelected = selectedLabelIndices;
    
    let minStart = Infinity;
    let maxEnd = -Infinity;
    
    allSelected.forEach(idx => {
      const lbl = labels[idx];
      if (lbl.start_char < minStart) minStart = lbl.start_char;
      if (lbl.end_char > maxEnd) maxEnd = lbl.end_char;
    });
    
    const mainClass = labels[selectedLabelIndices[0]].class_code;
    
    const newLabels = labels.filter((_, idx) => !allSelected.includes(idx));
    const mergedLabel = {
      class_code: mainClass,
      start_char: minStart,
      end_char: maxEnd,
      text_value: text.slice(minStart, maxEnd)
    };
    newLabels.push(mergedLabel);
    
    onLabelsChange(newLabels);
    setSelectedLabelIndices([newLabels.length - 1]);
  };
  useEffect(() => {
    const fetchText = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error('Network response was not ok');
        const textData = await res.text();
        setText(textData);
      } catch (err) {
        showToast('Failed to load text file', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    if (fileUrl) {
      fetchText();
    }
  }, [fileUrl, showToast]);

  const isSelectingRef = useRef<boolean>(false);

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu({ ...contextMenu, visible: false });
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  const handleMouseUp = () => {
    if (activeClassCode === null) {
      showToast('Please select a class first', 'error');
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) return;

    // Find the start and end offsets relative to the entire text
    const range = selection.getRangeAt(0);
    
    let startChar = 0;
    let endChar = 0;
    
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(containerRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    startChar = preSelectionRange.toString().length;
    
    const selectedText = range.toString();
    endChar = startChar + selectedText.length;
    
    if (startChar === endChar) return;

    const newLabel = {
      class_code: activeClassCode,
      start_char: startChar,
      end_char: endChar,
      text_value: selectedText
    };

    onLabelsChange([...labels, newLabel]);
    setSelectedLabelIndices([labels.length]);
    isSelectingRef.current = true;
    setTimeout(() => {
      isSelectingRef.current = false;
    }, 100);
    
    selection.removeAllRanges();
    if (onAnnotationAdded) onAnnotationAdded();
  };

  const adjustBoundary = (index: number, side: 'start' | 'end', delta: number) => {
    const newLabels = [...labels];
    const label = { ...newLabels[index] };
    let changed = false;
    
    if (side === 'start') {
      const newStart = label.start_char + delta;
      if (newStart >= 0 && newStart < label.end_char) {
        const hasOverlap = newLabels.some((l, i) => i !== index && newStart >= l.start_char && newStart < l.end_char);
        if (!hasOverlap) {
          label.start_char = newStart;
          changed = true;
        }
      }
    } else {
      const newEnd = label.end_char + delta;
      if (newEnd <= text.length && newEnd > label.start_char) {
        const hasOverlap = newLabels.some((l, i) => i !== index && newEnd > l.start_char && newEnd <= l.end_char);
        if (!hasOverlap) {
          label.end_char = newEnd;
          changed = true;
        }
      }
    }
    
    if (changed) {
      label.text_value = text.slice(label.start_char, label.end_char);
      newLabels[index] = label;
      onLabelsChange(newLabels);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input field somewhere else
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (selectedLabelIndices.length === 1) {
        if (e.key === 'ArrowLeft' && !e.shiftKey) {
          e.preventDefault();
          adjustBoundary(selectedLabelIndices[0], 'start', -1);
        } else if (e.key === 'ArrowRight' && !e.shiftKey) {
          e.preventDefault();
          adjustBoundary(selectedLabelIndices[0], 'end', 1);
        } else if (e.key === 'ArrowLeft' && e.shiftKey) {
          e.preventDefault();
          adjustBoundary(selectedLabelIndices[0], 'end', -1);
        } else if (e.key === 'ArrowRight' && e.shiftKey) {
          e.preventDefault();
          adjustBoundary(selectedLabelIndices[0], 'start', 1);
        }
      }
      
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedLabelIndices.length > 0) {
          e.preventDefault();
          const toDelete = new Set(selectedLabelIndices);
          const newLabels = labels.filter((_, idx) => !toDelete.has(idx));
          onLabelsChange(newLabels);
          setSelectedLabelIndices([]);
        }
      } else if (e.code === 'Space') {
        if (selectedLabelIndices.length > 1) {
          e.preventDefault();
          mergeSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLabelIndices, labels, text]);

  // Render text with highlights
  const renderText = () => {
    if (!text) return null;

    // Sort labels by start_char
    const sortedLabels = [...labels].sort((a, b) => a.start_char - b.start_char);
    
    const nodes: React.ReactNode[] = [];
    let currentPos = 0;

    sortedLabels.forEach((lbl, idx) => {
      // Find the original index of this label for selection/deletion
      const originalIndex = labels.indexOf(lbl);
      
      if (lbl.start_char > currentPos) {
        nodes.push(<span key={`text-${currentPos}`}>{text.slice(currentPos, lbl.start_char)}</span>);
      }
      
      const cls = classes.find(c => c.code === lbl.class_code);
      const color = cls ? cls.color : '#ff0000';
      
      const isSelected = selectedLabelIndices.includes(originalIndex);
      const isPrimary = selectedLabelIndices[0] === originalIndex;
      
      nodes.push(
        <mark
          key={`mark-${idx}`}
          style={{ 
            backgroundColor: color + '80', // add transparency
            padding: '2px 0',
            borderRadius: '2px',
            cursor: 'pointer',
            border: isPrimary ? '2px solid black' : isSelected ? '2px dashed black' : 'none'
          }}
          onClick={(e) => { 
            e.stopPropagation(); 
            if (setActiveClassCode) {
              setActiveClassCode(lbl.class_code);
            }
            if (e.ctrlKey || e.metaKey) {
              if (selectedLabelIndices.includes(originalIndex)) {
                setSelectedLabelIndices(selectedLabelIndices.filter(i => i !== originalIndex));
              } else {
                setSelectedLabelIndices([...selectedLabelIndices, originalIndex]);
              }
            } else {
              setSelectedLabelIndices([originalIndex]); 
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!selectedLabelIndices.includes(originalIndex)) {
              setSelectedLabelIndices([originalIndex]);
            }
            setContextMenu({
              visible: true,
              x: e.clientX,
              y: e.clientY,
              labelIndex: originalIndex
            });
          }}
        >
          {text.slice(Math.max(currentPos, lbl.start_char), lbl.end_char)}
        </mark>
      );
      
      currentPos = Math.max(currentPos, lbl.end_char);
    });

    if (currentPos < text.length) {
      nodes.push(<span key={`text-${currentPos}`}>{text.slice(currentPos)}</span>);
    }

    return nodes;
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-black">Loading text...</div>;
  }

  return (
    <div className="flex-1 overflow-auto bg-white p-8 relative" onClick={() => {
      if (!isSelectingRef.current) {
        setSelectedLabelIndices([]);
      }
    }}>
      <div 
        ref={containerRef}
        onMouseUp={handleMouseUp}
        className="max-w-4xl mx-auto text-lg leading-loose whitespace-pre-wrap font-sans text-gray-800 selection:bg-blue-200"
      >
        {renderText()}
      </div>

      {contextMenu.visible && contextMenu.labelIndex !== null && (
        <div 
          className="fixed z-50 bg-white border border-gray-200 shadow-xl rounded-md py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 mb-1">
            Change Class
          </div>
          <div className="max-h-64 overflow-y-auto">
            {classes.map(cls => (
              <button
                key={cls.code}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 flex items-center gap-2 text-black"
                onClick={() => {
                  if (setActiveClassCode) {
                    setActiveClassCode(cls.code);
                  }
                  const newLabels = [...labels];
                  const toChange = new Set(selectedLabelIndices);
                  if (toChange.has(contextMenu.labelIndex)) {
                    toChange.forEach(idx => {
                      if (idx !== null) {
                        newLabels[idx] = { ...newLabels[idx], class_code: cls.code };
                      }
                    });
                  } else {
                    newLabels[contextMenu.labelIndex as number] = {
                      ...newLabels[contextMenu.labelIndex as number],
                      class_code: cls.code
                    };
                  }
                  onLabelsChange(newLabels);
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                <span className="truncate">{cls.label}</span>
              </button>
            ))}
          </div>
          {selectedLabelIndices.length > 1 && (
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 text-black font-medium"
                onClick={() => {
                  mergeSelected();
                  setContextMenu({ ...contextMenu, visible: false });
                }}
              >
                Merge Selected
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
