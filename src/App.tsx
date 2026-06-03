import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as fabric from 'fabric';
import {
  RotateCw, RotateCcw, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, X, Image as LucideImage,
  Upload, Trash2, Download, FlipHorizontal,
  Edit3, Square, Circle, Type, Minus, Crop, Save,
  Check, Undo, Monitor, Grid, FolderOpen, MoveRight, ExternalLink,
} from 'lucide-react';

// Fix: webkitdirectory is not in standard React types — handled via spread cast at usage site

interface ViewerFile {
  id: string;
  url: string;
  name: string;
  size: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [files, setFiles] = useState<ViewerFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showGallery, setShowGallery] = useState(() => window.innerWidth >= 768);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [brushColor, setBrushColor] = useState('#3b82f6');
  const [isDashed, setIsDashed] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showInstallInfo, setShowInstallInfo] = useState(false);
  const [undoHistory, setUndoHistory] = useState<string[]>([]);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  const [editorZoom, setEditorZoom] = useState(1);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [maintainAspect, setMaintainAspect] = useState(true);
  const [isCropping, setIsCropping] = useState(false);
  const [initialDistance, setInitialDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState<number>(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Fix: store cleanup so we can remove keydown listener when editor closes
  const editorCleanupRef = useRef<(() => void) | null>(null);
  // Fix: keep undoHistory accessible in stale closures inside editor useEffect
  const undoHistoryRef = useRef<string[]>([]);
  useEffect(() => { undoHistoryRef.current = undoHistory; }, [undoHistory]);

  // File Handler API — receives files when app is launched as default image viewer
  useEffect(() => {
    if (!('launchQueue' in window)) return;
    (window as any).launchQueue.setConsumer(async (launchParams: any) => {
      if (!launchParams.files?.length) return;
      const newFiles: ViewerFile[] = [];
      for (const fileHandle of launchParams.files) {
        try {
          const file: File = await fileHandle.getFile();
          if (!file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|svg|heic|heif|bmp|tiff)$/i.test(file.name)) continue;
          const url = URL.createObjectURL(file);
          blobUrlsRef.current.add(url);
          newFiles.push({
            id: Math.random().toString(36).substr(2, 9),
            url,
            name: file.name,
            size: file.size,
          });
        } catch { /* 접근 불가 파일 무시 */ }
      }
      if (!newFiles.length) return;
      setFiles(prev => {
        // Navigate to the first newly opened file
        setCurrentIndex(prev.length);
        return [...prev, ...newFiles];
      });
      window.focus();
    });
  }, []);

  // Fix: track all active blob URLs to revoke only on unmount, not on every files change
  const blobUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    return () => { blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.title = '실뷰(SilView)';
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  // Fix: attach wheel listener with { passive: false } so preventDefault works in modern browsers
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isEditing || currentIndex === null) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => Math.min(Math.max(0.1, prev + (e.deltaY > 0 ? -0.05 : 0.05)), 10));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [isEditing, currentIndex]);

  const installPWA = async () => {
    const isInIframe = window.self !== window.top;
    if (!deferredPrompt) {
      if (isInIframe) { window.open(window.location.href, '_blank'); return; }
      alert('브라우저가 아직 설치 준비를 마치지 못했습니다.\n브라우저 주소창 우측의 [설치] 아이콘을 직접 눌러보세요.');
      return;
    }
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
        setDeferredPrompt(null);
        setShowInstallInfo(false);
      }
    } catch {
      alert('설치 중 오류가 발생했습니다. 브라우저 주소창의 아이콘을 이용해 주세요.');
    }
  };

  const handleFiles = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles: ViewerFile[] = Array.from(selectedFiles)
      .filter(f => f.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|heic|heif|bmp|tiff)$/i.test(f.name))
      .map(f => {
        const url = URL.createObjectURL(f);
        blobUrlsRef.current.add(url);
        return { id: Math.random().toString(36).substr(2, 9), url, name: f.name, size: f.size };
      });
    if (!newFiles.length) return;
    setFiles(prev => {
      if (currentIndex === null) setCurrentIndex(prev.length);
      return [...prev, ...newFiles];
    });
    setShowFileMenu(false);
  }, [currentIndex]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const resetViewer = () => {
    setZoom(1); setRotation(0); setFlip(false); setPosition({ x: 0, y: 0 }); setIsEditing(false);
  };

  const nextImage = () => {
    if (currentIndex === null || files.length <= 1) return;
    setCurrentIndex((currentIndex + 1) % files.length);
    resetViewer();
  };

  const prevImage = () => {
    if (currentIndex === null || files.length <= 1) return;
    setCurrentIndex((currentIndex - 1 + files.length) % files.length);
    resetViewer();
  };

  const removeFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = files.findIndex(f => f.id === id);
    const fileToRemove = files[idx];
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.url);
      blobUrlsRef.current.delete(fileToRemove.url);
    }
    setFiles(prev => prev.filter(f => f.id !== id));
    if (files.length === 1) {
      setCurrentIndex(null);
    } else if (currentIndex === idx) {
      setCurrentIndex(prev => (prev !== null && prev >= files.length - 1) ? Math.max(0, files.length - 2) : prev);
    } else if (currentIndex !== null && idx < currentIndex) {
      setCurrentIndex(prev => (prev ?? 0) - 1);
    }
  };

  const saveHistory = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    const json = JSON.stringify((fabricCanvasRef.current as any).toJSON(['name', 'selectable', 'evented']));
    setUndoHistory(prev => {
      const next = [...prev, json];
      return next.length > 20 ? next.slice(1) : next;
    });
  }, []);

  const applyEditorZoom = (value: number) => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    canvas.zoomToPoint(new fabric.Point(canvas.width! / 2, canvas.height! / 2), value);
    setEditorZoom(value);
    canvas.requestRenderAll();
  };

  const zoomToFit = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const baseImg = canvas.getObjects().find(o => (o as any).name === 'baseImage') as fabric.Image;
    if (!baseImg) return;
    const fitZoom = Math.min((canvas.width! - 100) / baseImg.width!, (canvas.height! - 160) / baseImg.height!) * 0.85;
    applyEditorZoom(fitZoom);
  };

  const adjustZoom = (delta: number) => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const newZoom = Math.min(Math.max(0.1, canvas.getZoom() + delta), 10);
    canvas.zoomToPoint(new fabric.Point(canvas.width! / 2, canvas.height! / 2), newZoom);
    setEditorZoom(newZoom);
  };

  const deleteSelectedObject = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const activeObjects = canvas.getActiveObjects();
    if (!activeObjects.length) return;
    saveHistory();
    activeObjects.forEach(obj => { if ((obj as any).name !== 'baseImage') canvas.remove(obj); });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setSelectedObject(null);
  }, [saveHistory]);

  const startCaptureCrop = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const existing = canvas.getObjects().find(o => (o as any).name === 'cropSelector');
    if (existing) { canvas.setActiveObject(existing); canvas.renderAll(); setIsCropping(true); return; }

    const z = canvas.getZoom();
    const vpt = canvas.viewportTransform!;
    const selector = new fabric.Rect({
      fill: 'rgba(59,130,246,0.1)',
      stroke: '#3b82f6',
      strokeWidth: 2 / z,
      strokeDashArray: [6 / z, 4 / z],
      cornerColor: '#3b82f6',
      cornerSize: 10 / z,
      transparentCorners: false,
      cornerStrokeColor: '#ffffff',
      cornerStyle: 'rect',
      hasRotatingPoint: false,
    });
    (selector as any).name = 'cropSelector';

    const baseImg = canvas.getObjects().find(o => (o as any).name === 'baseImage') as fabric.Image;
    if (baseImg) {
      const b = baseImg.getBoundingRect();
      selector.set({ left: b.left + b.width * 0.1, top: b.top + b.height * 0.1, width: b.width * 0.8, height: b.height * 0.8 });
    } else {
      const vL = -vpt[4] / z, vT = -vpt[5] / z, vW = canvas.width! / z, vH = canvas.height! / z;
      selector.set({ left: vL + vW * 0.1, top: vT + vH * 0.1, width: vW * 0.8, height: vH * 0.8 });
    }
    canvas.add(selector);
    canvas.setActiveObject(selector);
    canvas.renderAll();
    setIsCropping(true);
  };

  const applyCaptureCrop = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    const selector = canvas.getObjects().find(o => (o as any).name === 'cropSelector');
    if (!selector) { setIsCropping(false); return; }

    const { left = 0, top = 0, width = 0, height = 0, scaleX = 1, scaleY = 1 } = selector;
    const w = width * scaleX, h = height * scaleY;
    const x = left, y = top;
    if (w < 5 || h < 5) { alert('영역이 너무 작습니다.'); return; }

    selector.set('visible', false);
    canvas.renderAll();
    saveHistory();

    // ── 고해상도 크롭: 캔버스를 원본 픽셀 밀도로 임시 확장 후 1:1 캡처 ──
    const baseImg = canvas.getObjects().find(o => (o as any).name === 'baseImage') as fabric.Image;
    const imgEl = baseImg ? (baseImg as any)._element as HTMLImageElement : null;
    const naturalW = imgEl?.naturalWidth ?? (baseImg?.width ?? 1) * (baseImg?.scaleX ?? 1);
    const imgWorldW = (baseImg?.width ?? 1) * (baseImg?.scaleX ?? 1);
    // 픽셀 밀도: 월드 단위 1당 원본 픽셀 수
    const rawDensity = naturalW / imgWorldW;
    // 메모리 한계 방지: 최대 8192px
    const density = Math.min(rawDensity, 8192 / Math.max(w, h));
    const exportW = Math.round(w * density);
    const exportH = Math.round(h * density);

    const origW = canvas.width!;
    const origH = canvas.height!;

    // 캔버스를 크롭 출력 크기로 임시 변경, 뷰포트를 해당 영역에 맞춤
    canvas.setWidth(exportW);
    canvas.setHeight(exportH);
    canvas.setViewportTransform([density, 0, 0, density, -x * density, -y * density]);
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });

    // 캔버스 원상복구 — 뷰포트는 반드시 identity로 리셋해야
    // 새 이미지 로드 후 centerObject + zoomToPoint가 올바르게 동작함
    canvas.setWidth(origW);
    canvas.setHeight(origH);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.remove(selector);
    canvas.clear();

    fabric.Image.fromURL(dataUrl).then(fImg => {
      fImg.selectable = false;
      fImg.evented = false;
      fImg.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 20 });
      (fImg as any).name = 'baseImage';
      canvas.add(fImg);
      canvas.centerObject(fImg);
      const fitZoom = Math.min((canvas.width! - 100) / fImg.width!, (canvas.height! - 160) / fImg.height!) * 0.85;
      canvas.zoomToPoint(new fabric.Point(canvas.width! / 2, canvas.height! / 2), fitZoom);
      setEditorZoom(fitZoom);
      canvas.renderAll();
      setResizeWidth(exportW);
      setResizeHeight(exportH);
    });
    setIsCropping(false);
  };

  const cancelCrop = () => {
    if (!fabricCanvasRef.current) return;
    const sel = fabricCanvasRef.current.getObjects().find(o => (o as any).name === 'cropSelector');
    if (sel) { fabricCanvasRef.current.remove(sel); fabricCanvasRef.current.renderAll(); }
    setIsCropping(false);
  };

  // Fix: properly manage keydown cleanup via ref so listener is removed when editor closes
  useEffect(() => {
    if (!isEditing || !canvasRef.current || currentIndex === null) return;

    const img = new Image();
    img.src = files[currentIndex].url;
    img.onload = () => {
      const MAX = 4096;
      let iW = img.width, iH = img.height;
      if (iW > MAX || iH > MAX) {
        const r = iW / iH;
        if (iW > iH) { iW = MAX; iH = iW / r; } else { iH = MAX; iW = iH * r; }
      }
      setResizeWidth(Math.round(img.width));
      setResizeHeight(Math.round(img.height));

      const editorEl = canvasRef.current?.parentElement?.parentElement;
      const cW = editorEl?.clientWidth || 900;
      const cH = editorEl?.clientHeight || 600;
      const initialZoom = Math.min((cW - 100) / iW, (cH - 160) / iH) * 0.85;
      setEditorZoom(initialZoom);

      const canvas = new fabric.Canvas(canvasRef.current!, {
        width: cW, height: cH,
        backgroundColor: '#1a1a2e',
        preserveObjectStacking: true,
      });
      fabricCanvasRef.current = canvas;

      fabric.Image.fromURL(files[currentIndex].url).then(fImg => {
        fImg.scaleToWidth(iW);
        fImg.selectable = false;
        fImg.evented = false;
        fImg.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 24 });
        (fImg as any).name = 'baseImage';
        canvas.add(fImg);
        canvas.centerObject(fImg);
        canvas.zoomToPoint(new fabric.Point(cW / 2, cH / 2), initialZoom);
        canvas.renderAll();
      });

      canvas.on('selection:created', e => setSelectedObject(e.selected?.[0] || null));
      canvas.on('selection:updated', e => setSelectedObject(e.selected?.[0] || null));
      canvas.on('selection:cleared', () => setSelectedObject(null));
      canvas.on('object:modified', () => saveHistory());

      canvas.on('mouse:wheel', opt => {
        const delta = opt.e.deltaY;
        let z = canvas.getZoom() * (0.999 ** delta);
        z = Math.min(20, Math.max(0.01, z));
        canvas.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), z);
        setEditorZoom(z);
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      let isPanning = false, lastX = 0, lastY = 0;
      canvas.on('mouse:down', opt => {
        const e = opt.e as MouseEvent;
        if (e.altKey || e.button === 1) { isPanning = true; canvas.selection = false; lastX = e.clientX; lastY = e.clientY; }
      });
      canvas.on('mouse:move', opt => {
        if (!isPanning) return;
        const e = opt.e as MouseEvent;
        const vpt = canvas.viewportTransform!;
        vpt[4] += e.clientX - lastX; vpt[5] += e.clientY - lastY;
        canvas.requestRenderAll(); lastX = e.clientX; lastY = e.clientY;
      });
      canvas.on('mouse:up', () => {
        canvas.setViewportTransform(canvas.viewportTransform!);
        isPanning = false; canvas.selection = true;
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const active = canvas.getActiveObject();
          if (active?.type === 'i-text' && (active as fabric.IText).isEditing) return;
          const objs = canvas.getActiveObjects();
          if (!objs.length) return;
          // Save history inline using canvas directly to avoid stale closure
          const json = JSON.stringify((canvas as any).toJSON(['name', 'selectable', 'evented']));
          setUndoHistory(prev => { const n = [...prev, json]; return n.length > 20 ? n.slice(1) : n; });
          objs.forEach(o => { if ((o as any).name !== 'baseImage') canvas.remove(o); });
          canvas.discardActiveObject(); canvas.requestRenderAll(); setSelectedObject(null);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          // Fix: use ref to avoid stale undoHistory closure
          const history = undoHistoryRef.current;
          if (!history.length) return;
          const last = history[history.length - 1];
          canvas.loadFromJSON(last).then(() => {
            canvas.renderAll();
            setUndoHistory(prev => prev.slice(0, -1));
          });
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      // Fix: store cleanup so it runs when editor closes, not just on img.onload return
      editorCleanupRef.current = () => window.removeEventListener('keydown', handleKeyDown);
    };

    return () => {
      editorCleanupRef.current?.();
      editorCleanupRef.current = null;
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose();
        fabricCanvasRef.current = null;
      }
    };
  }, [isEditing, currentIndex, files, saveHistory]);

  const addShape = (type: 'rect' | 'circle' | 'text' | 'line' | 'arrow') => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    saveHistory();
    const strokeDashArray = isDashed ? [5, 5] : undefined;

    // 현재 뷰포트 중앙 좌표 (월드 좌표)
    const z = canvas.getZoom();
    const vpt = canvas.viewportTransform!;
    const cx = (canvas.width!  / 2 - vpt[4]) / z;
    const cy = (canvas.height! / 2 - vpt[5]) / z;

    let obj: fabric.Object | undefined;
    // 기존 대비 3배 크기, 선두께 9px
    if (type === 'rect')
      obj = new fabric.Rect({ width: 360, height: 240, fill: 'transparent', stroke: brushColor, strokeWidth: 9, strokeDashArray, left: cx - 180, top: cy - 120 });
    else if (type === 'circle')
      obj = new fabric.Circle({ radius: 150, fill: 'transparent', stroke: brushColor, strokeWidth: 9, strokeDashArray, left: cx - 150, top: cy - 150 });
    else if (type === 'line')
      obj = new fabric.Line([0, 0, 450, 0], { stroke: brushColor, strokeWidth: 9, strokeDashArray, strokeLineCap: 'round', left: cx - 225, top: cy });
    else if (type === 'arrow') {
      // 화살표: 선 몸통(두께 9) + 정삼각형 헤드(밑변 60, 높이 52)
      // 정삼각형: base=60, height=60*√3/2≈52
      const sw = 9, th = 52, tb = 30; // th=triangle height, tb=triangle half-base
      const bEnd = 450 - th; // body ends at 398
      obj = new fabric.Path(
        `M 0 ${-sw / 2} L ${bEnd} ${-sw / 2} L ${bEnd} ${-tb} L 450 0 L ${bEnd} ${tb} L ${bEnd} ${sw / 2} L 0 ${sw / 2} Z`,
        { fill: brushColor, stroke: 'transparent', left: cx - 225, top: cy - tb }
      );
      (obj as any).arrowShape = true; // 화살표 식별용 플래그
    } else if (type === 'text')
      obj = new fabric.IText('텍스트', { fontSize: 84, fill: brushColor, fontFamily: 'Inter, sans-serif', left: cx, top: cy });

    if (obj) {
      // 핸들 크기를 기본(13px)의 약 30% 수준(4px)으로 축소
      obj.set({
        cornerSize: 4,
        cornerColor: '#3b82f6',
        cornerStrokeColor: '#ffffff',
        transparentCorners: false,
        borderColor: '#3b82f6',
        borderScaleFactor: 1.5,
      });
      canvas.add(obj);
      canvas.setActiveObject(obj);
    }
  };

  useEffect(() => {
    if (!fabricCanvasRef.current || !selectedObject || (selectedObject as any).name === 'baseImage') return;
    const obj = selectedObject;
    const strokeDashArray = isDashed ? [5, 5] : undefined;
    let needsRender = false;
    if ((obj as any).arrowShape) {
      if (obj.fill !== brushColor) { obj.set({ fill: brushColor }); needsRender = true; }
    } else if (['rect', 'circle', 'line', 'path'].includes(obj.type ?? '')) {
      if (obj.stroke !== brushColor || JSON.stringify(obj.strokeDashArray) !== JSON.stringify(strokeDashArray)) {
        obj.set({ stroke: brushColor, strokeDashArray }); needsRender = true;
      }
    } else if (obj.type === 'i-text' && obj.fill !== brushColor) {
      obj.set({ fill: brushColor }); needsRender = true;
    }
    if (needsRender) fabricCanvasRef.current.renderAll();
  }, [brushColor, isDashed, selectedObject]);

  const handleResizeChange = (side: 'w' | 'h', val: number) => {
    const ratio = resizeWidth / resizeHeight;
    if (side === 'w') {
      setResizeWidth(val);
      if (maintainAspect) setResizeHeight(Math.round(val / ratio));
    } else {
      setResizeHeight(val);
      if (maintainAspect) setResizeWidth(Math.round(val * ratio));
    }
  };

  const saveEditedImage = () => {
    if (!fabricCanvasRef.current || currentIndex === null) return;
    const canvas = fabricCanvasRef.current;
    const baseImg = canvas.getObjects().find(o => (o as any).name === 'baseImage') as fabric.Image;
    if (!baseImg) return;
    canvas.discardActiveObject(); canvas.renderAll();

    // ── 고해상도 저장: 캔버스를 원본 픽셀 밀도로 임시 확장 후 1:1 캡처 ──
    const imgEl = (baseImg as any)._element as HTMLImageElement;
    const naturalW = imgEl?.naturalWidth ?? baseImg.width!;
    const naturalH = imgEl?.naturalHeight ?? baseImg.height!;
    const imgWorldW = baseImg.width! * (baseImg.scaleX ?? 1);
    const imgWorldH = baseImg.height! * (baseImg.scaleY ?? 1);
    const imgLeft = baseImg.left ?? 0;
    const imgTop  = baseImg.top  ?? 0;

    // 사용자가 지정한 출력 크기 (기본: 원본 해상도, 최대 8192px)
    const aspect = naturalW / naturalH;
    const requestedW = resizeWidth > 0 ? resizeWidth : naturalW;
    const outW = Math.min(Math.round(requestedW), 8192);
    const outH = Math.min(Math.round(outW / aspect), 8192);

    // 월드 → 출력 픽셀 변환 스케일
    const scale = outW / imgWorldW;

    const origW = canvas.width!;
    const origH = canvas.height!;
    const origVpt = [...canvas.viewportTransform!] as fabric.TMat2D;

    canvas.setWidth(outW);
    canvas.setHeight(outH);
    canvas.setViewportTransform([scale, 0, 0, scale, -imgLeft * scale, -imgTop * scale]);
    canvas.renderAll();

    const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 });

    // 캔버스 원상복구
    canvas.setWidth(origW);
    canvas.setHeight(origH);
    canvas.setViewportTransform(origVpt);
    canvas.renderAll();

    fetch(dataUrl).then(r => r.blob()).then(blob => {
      const newUrl = URL.createObjectURL(blob);
      blobUrlsRef.current.add(newUrl);
      const oldUrl = files[currentIndex].url;
      URL.revokeObjectURL(oldUrl);
      blobUrlsRef.current.delete(oldUrl);
      setFiles(prev => { const n = [...prev]; n[currentIndex] = { ...n[currentIndex], url: newUrl, size: blob.size }; return n; });
      const link = document.createElement('a');
      link.href = newUrl; link.download = `edited_${files[currentIndex].name.replace(/\.[^.]+$/, '')}.png`; link.click();
      setIsEditing(false);
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (currentIndex === null || isEditing) return;
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, files.length, isEditing]);

  // ─── Editor toolbar shape buttons config ────────────────────────
  const shapeButtons = [
    { type: 'rect' as const, Icon: Square, label: '사각형' },
    { type: 'circle' as const, Icon: Circle, label: '원형' },
    { type: 'line' as const, Icon: Minus, label: '선' },
    { type: 'arrow' as const, Icon: MoveRight, label: '화살표' },
    { type: 'text' as const, Icon: Type, label: '텍스트' },
  ];

  return (
    <div className="relative w-full h-screen flex flex-col font-sans select-none text-[#1F2937]">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="h-12 border-b border-gray-200 bg-white flex items-center px-4 z-50 flex-shrink-0 gap-3">
        <div className="flex items-center gap-5">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}500-icon.png`} alt="실뷰" className="w-7 h-7 rounded-lg object-cover" />
            <span className="text-sm font-bold tracking-tight text-gray-900">실뷰</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center text-xs font-medium text-gray-500">
            <div className="relative">
              <button
                onClick={() => setShowFileMenu(!showFileMenu)}
                className={`px-2 md:px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${showFileMenu ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-100'}`}
              >
                <Upload size={12} className="md:hidden" />
                <span className="hidden md:inline">파일</span>
              </button>
              <AnimatePresence>
                {showFileMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.1 }}
                    className="absolute top-full left-0 mt-1.5 w-52 bg-white border border-gray-200 shadow-xl rounded-xl py-1.5 z-[60] ring-1 ring-black/5"
                  >
                    {[
                      { isFile: true, Icon: Upload, label: '이미지 열기' },
                      { isFile: false, onClick: () => folderInputRef.current?.click(), Icon: FolderOpen, label: '폴더 열기' },
                    ].map(({ isFile, onClick, Icon, label }) => (
                      isFile ? (
                        <div key={label} className="relative overflow-hidden w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 transition-colors text-gray-700 cursor-pointer">
                          <Icon size={13} className="text-gray-400 pointer-events-none" /> <span className="pointer-events-none">{label}</span>
                          <input type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
                        </div>
                      ) : (
                        <button key={label} onClick={onClick} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 transition-colors text-gray-700">
                          <Icon size={13} className="text-gray-400" /> {label}
                        </button>
                      )
                    ))}
                    <div className="h-px bg-gray-100 my-1 mx-3" />
                    <button onClick={() => setShowInstallInfo(true)} className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2.5 transition-colors text-blue-600">
                      <Monitor size={13} /> PC 앱으로 설치
                    </button>
                    <div className="h-px bg-gray-100 my-1 mx-3" />
                    <button
                      onClick={() => { if (confirm('모든 이미지를 비울까요?')) { setFiles([]); setCurrentIndex(null); setShowFileMenu(false); } }}
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2.5 transition-colors"
                    >
                      <Trash2 size={13} /> 모두 비우기
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => currentIndex !== null && setIsEditing(!isEditing)}
              className={`px-2.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 font-semibold ${isEditing ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              <Edit3 size={13} />
              <span>{isEditing ? '뷰어' : '편집'}</span>
            </button>
            <button
              onClick={() => setShowGallery(!showGallery)}
              className={`px-2 md:px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${showGallery ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-100'}`}
            >
              <Grid size={12} />
              <span className="hidden md:inline">라이브러리</span>
            </button>
          </nav>
        </div>

        {/* Banner */}
        <div className="flex-1 flex justify-center">
          <a
            href="https://choshg.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-white whitespace-nowrap transition-all hover:scale-[1.03] hover:shadow-md hover:shadow-blue-500/30"
            style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 60%, #7c3aed 100%)' }}
          >
            대한민국 모든 공무원을 위한 4가지 해법 : 알아보기
            <ExternalLink size={11} className="opacity-80" />
          </a>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5">
          {currentIndex !== null && !isEditing && (
            <div className="flex items-center bg-gray-100 rounded-lg px-1 py-1 gap-0.5 mr-1">
              <button onClick={() => setRotation(r => r - 90)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 hover:text-gray-800 transition-all" title="반시계 회전"><RotateCcw size={14} /></button>
              <button onClick={() => setRotation(r => r + 90)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 hover:text-gray-800 transition-all" title="시계 회전"><RotateCw size={14} /></button>
              <div className="w-px h-3.5 bg-gray-300 mx-0.5" />
              <button onClick={() => setFlip(!flip)} className={`p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all ${flip ? 'text-blue-600' : 'text-gray-500'}`} title="좌우반전"><FlipHorizontal size={14} /></button>
              <div className="w-px h-3.5 bg-gray-300 mx-0.5" />
              <button onClick={() => setZoom(prev => Math.min(Math.max(0.1, prev - 0.2), 10))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 hover:text-gray-800 transition-all" title="축소"><ZoomOut size={14} /></button>
              <span className="text-[10px] font-mono w-10 text-center text-gray-600 font-bold">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(prev => Math.min(Math.max(0.1, prev + 0.2), 10))} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 hover:text-gray-800 transition-all" title="확대"><ZoomIn size={14} /></button>
            </div>
          )}
          <div className="relative overflow-hidden p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-lg transition-colors cursor-pointer" title="이미지 열기">
            <Upload size={16} className="pointer-events-none" />
            <input type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {currentIndex !== null && (
            <button
              onClick={() => { const a = document.createElement('a'); a.href = files[currentIndex].url; a.download = files[currentIndex].name; a.click(); }}
              className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-lg transition-colors" title="다운로드"
            >
              <Download size={16} />
            </button>
          )}
          <input ref={fileInputRef} type="file" multiple accept="image/*" className="sr-only" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          <input ref={folderInputRef} type="file" multiple accept="image/*" {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>} className="sr-only" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </header>

      {/* ── Mobile Gallery Strip (상단 고정 행) ──────────────── */}
      <AnimatePresence>
        {showGallery && isMobile && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 94, opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="bg-[#F5F5F7] border-b border-gray-200 flex items-center gap-2 px-3 overflow-x-auto flex-shrink-0"
          >
            {files.length === 0 ? (
              <div className="flex items-center gap-2 text-gray-300">
                <LucideImage size={14} /><span className="text-[10px] whitespace-nowrap">이미지 없음</span>
              </div>
            ) : files.map((file, idx) => (
              <div key={file.id} onClick={() => { setCurrentIndex(idx); resetViewer(); }}
                className={`flex-shrink-0 w-[68px] h-[68px] rounded-xl overflow-hidden cursor-pointer transition-all ${currentIndex === idx ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#F5F5F7] scale-105' : 'opacity-55 hover:opacity-90'}`}
              >
                <img src={file.url} alt="" className="w-full h-full object-cover" draggable={false} />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden" onClick={() => setShowFileMenu(false)}>

        {/* ── Desktop Gallery Sidebar ──────────────────────────── */}
        <AnimatePresence>
          {showGallery && !isMobile && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }} animate={{ width: 200, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="border-r border-gray-200 bg-[#F5F5F7] flex flex-col overflow-hidden flex-shrink-0"
            >
              <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                  Library <span className="text-gray-300 normal-case font-normal">({files.length})</span>
                </span>
                <button onClick={() => folderInputRef.current?.click()} className="p-1 hover:bg-gray-200 rounded-md text-gray-400 hover:text-gray-600 transition-colors" title="폴더 열기">
                  <FolderOpen size={12} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-2 mt-4">
                    <LucideImage size={22} />
                    <span className="text-[10px]">이미지 없음</span>
                  </div>
                ) : files.map((file, idx) => (
                  <div key={file.id} onClick={() => { setCurrentIndex(idx); resetViewer(); }}
                    className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer group transition-all ${currentIndex === idx ? 'bg-white shadow-sm ring-1 ring-gray-200' : 'hover:bg-gray-200/60'}`}
                  >
                    <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-gray-200">
                      <img src={file.url} alt="" className="w-full h-full object-cover" draggable={false} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] truncate leading-tight ${currentIndex === idx ? 'text-gray-900 font-semibold' : 'text-gray-600 font-medium'}`}>{file.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatSize(file.size)}</p>
                    </div>
                    <button onClick={e => removeFile(file.id, e)} className="p-1 hover:bg-red-100 hover:text-red-500 rounded-md text-gray-300 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Main ────────────────────────────────────────────── */}
        <main
          className="flex-1 flex flex-col overflow-hidden"
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {isEditing ? (
            /* ── Editor ─────────────────────────────────── */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="bg-white border-b border-gray-100 flex flex-wrap items-center p-1.5 gap-x-1.5 gap-y-1.5 flex-shrink-0">
                {/* Shapes */}
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                  {shapeButtons.map(({ type, Icon, label }) => (
                    <button key={type} onClick={() => addShape(type)} className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white hover:shadow-sm rounded-md text-xs text-gray-600 hover:text-gray-900 transition-all font-medium whitespace-nowrap">
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>

                <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                {/* Color + Dash */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative w-7 h-7 rounded-md border-2 border-gray-200 overflow-hidden cursor-pointer hover:border-gray-300 transition-colors" title="색상 선택">
                    <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="absolute inset-0 w-10 h-10 -m-1 cursor-pointer opacity-0" />
                    <div className="w-full h-full" style={{ backgroundColor: brushColor }} />
                  </div>
                  <button
                    onClick={() => setIsDashed(!isDashed)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${isDashed ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    점선
                  </button>
                </div>

                <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                {/* Editor zoom */}
                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
                  <button onClick={() => adjustZoom(-0.1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ZoomOut size={13} /></button>
                  <button onClick={zoomToFit} className="px-2.5 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50 rounded-md min-w-[52px] text-center transition-colors">{Math.round(editorZoom * 100)}%</button>
                  <button onClick={() => adjustZoom(0.1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ZoomIn size={13} /></button>
                </div>

                <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                {/* Undo + Delete */}
                <button
                  onClick={() => {
                    const history = undoHistoryRef.current;
                    if (!history.length || !fabricCanvasRef.current) return;
                    const last = history[history.length - 1];
                    fabricCanvasRef.current.loadFromJSON(last).then(() => {
                      fabricCanvasRef.current!.renderAll();
                      setUndoHistory(prev => prev.slice(0, -1));
                    });
                  }}
                  disabled={undoHistory.length === 0}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex-shrink-0 ${undoHistory.length === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Undo size={13} /> 되돌리기
                </button>
                <button onClick={deleteSelectedObject} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-red-500 hover:bg-red-50 transition-all flex-shrink-0">
                  <Trash2 size={13} /> 삭제
                </button>

                <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                {/* Crop */}
                <button
                  onClick={startCaptureCrop}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all flex-shrink-0 ${isCropping ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'text-orange-600 hover:bg-orange-50'}`}
                >
                  <Crop size={13} /> 자르기
                </button>

                <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

                {/* Resize */}
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 flex-shrink-0">
                  <span>W</span>
                  <input type="number" value={resizeWidth} onChange={e => handleResizeChange('w', parseInt(e.target.value) || 0)} className="w-14 px-1.5 py-1 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-center text-[11px] font-normal" />
                  <span>H</span>
                  <input type="number" value={resizeHeight} onChange={e => handleResizeChange('h', parseInt(e.target.value) || 0)} className="w-14 px-1.5 py-1 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-center text-[11px] font-normal" />
                  <button onClick={() => setMaintainAspect(!maintainAspect)} className={`px-2 py-1 rounded-md border transition-all font-medium ${maintainAspect ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>비율</button>
                </div>

                {/* Right actions */}
                <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                  {isCropping && (
                    <>
                      <button onClick={applyCaptureCrop} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 shadow-sm transition-all">
                        <Check size={13} /> 적용
                      </button>
                      <button onClick={cancelCrop} className="flex items-center gap-1.5 px-3.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                        <X size={13} /> 취소
                      </button>
                    </>
                  )}
                  {!isCropping && (
                    <button onClick={saveEditedImage} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all">
                      <Save size={13} /> 저장
                    </button>
                  )}
                  <button onClick={() => setIsEditing(false)} className="px-3.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                    닫기
                  </button>
                </div>
              </div>

              {/* Fabric canvas */}
              <div className="flex-1 relative overflow-hidden bg-[#1a1a2e]">
                <canvas ref={canvasRef} />
                <div className="absolute bottom-5 left-5 pointer-events-none flex flex-col gap-1.5 z-10">
                  <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md border border-white/10 text-white/60 text-[10px] rounded-xl flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold">Alt</kbd>+드래그 또는 휠클릭 → 이동
                  </div>
                  <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md border border-white/10 text-white/60 text-[10px] rounded-xl">
                    마우스 휠 → 확대/축소
                  </div>
                </div>
              </div>
            </div>

          ) : currentIndex === null ? (
            /* ── Empty State ─────────────────────────────── */
            <div className="flex-1 flex items-center justify-center bg-[#F9FAFB]">
              <div className="text-center space-y-7 max-w-xs px-8">
                <div className="relative mx-auto w-28 h-28">
                  <div className="absolute inset-2 bg-blue-100 rounded-3xl rotate-6 opacity-50" />
                  <div className="absolute inset-2 bg-indigo-50 rounded-3xl -rotate-3" />
                  <div className="relative w-28 h-28 border-2 border-dashed border-blue-200 rounded-3xl flex items-center justify-center hover:border-blue-400 transition-all group cursor-default">
                    <Upload size={30} className="text-blue-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">실뷰(SilView)</h2>
                  <p className="text-sm text-gray-400 leading-relaxed">광고 없는 깔끔한 이미지 뷰어.<br />사진을 드래그하거나 불러와 감상하세요.</p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="relative overflow-hidden bg-blue-600 rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 cursor-pointer">
                    <div className="px-6 py-3 text-white text-sm font-semibold text-center pointer-events-none whitespace-nowrap">
                      이미지 불러오기
                    </div>
                    <input type="file" multiple accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
                  </div>
                  <button onClick={() => folderInputRef.current?.click()} className="px-6 py-3 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all whitespace-nowrap">
                    폴더 열기
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-1 border-t border-gray-100">
                  {[['광고 없음', Upload], ['이미지 편집', Edit3], ['PWA 지원', Monitor]].map(([label, Icon]: any) => (
                    <div key={label} className="text-center py-2">
                      <Icon size={16} className="mx-auto text-gray-300 mb-1.5" />
                      <div className="text-[10px] text-gray-400 font-medium">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          ) : (
            /* ── Image Viewer ────────────────────────────── */
            <div
              ref={containerRef}
              className="flex-1 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing touch-none"
              style={{ background: 'radial-gradient(ellipse at 50% 40%, #252535 0%, #15151f 100%)' }}
              onTouchStart={(e) => {
                if (e.touches.length === 2) {
                  const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                  setInitialDistance(dist);
                  setInitialZoom(zoom);
                }
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 2 && initialDistance !== null) {
                  const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                  const scale = currentDist / initialDistance;
                  const newZoom = Math.min(Math.max(0.1, initialZoom * scale), 10);
                  setZoom(newZoom);
                }
              }}
              onTouchEnd={() => {
                setInitialDistance(null);
              }}
            >
              {/* Subtle dot grid */}
              <div
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
              />

              {/* 드래그 레이어: 패닝 전용. 진입 애니메이션 없이 항상 표시 (Framer animate 미사용으로 stall 방지) */}
              <motion.div
                key={files[currentIndex].id}
                className="relative"
                drag
                dragMomentum={false}
                style={{ x: position.x, y: position.y }}
                onDragEnd={(_, info) => setPosition(prev => ({ x: prev.x + info.offset.x, y: prev.y + info.offset.y }))}
              >
                {/* 변환 레이어: 줌/회전/반전을 순수 CSS transform으로 (Framer와 독립) */}
                <img
                  src={files[currentIndex].url}
                  alt={files[currentIndex].name}
                  className="max-w-[92vw] max-h-[72vh] md:max-w-[80vw] md:max-h-[68vh] object-contain pointer-events-none select-none"
                  style={{
                    filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.6))',
                    transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
                    transition: 'transform 0.18s ease-out',
                  }}
                  draggable={false}
                />
              </motion.div>

              {/* Navigation */}
              {files.length > 1 && (
                <>
                  <button onClick={prevImage} className="absolute left-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/15 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all z-20 shadow-lg">
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={nextImage} className="absolute right-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/15 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-all z-20 shadow-lg">
                    <ChevronRight size={18} />
                  </button>
                </>
              )}

              {/* Image info pill */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-white/50 text-[11px] font-medium pointer-events-none whitespace-nowrap">
                {files[currentIndex].name}&nbsp;&nbsp;·&nbsp;&nbsp;{currentIndex + 1} / {files.length}
              </div>
            </div>
          )}

          {/* ── Filmstrip ──────────────────────────────────── */}
          {files.length > 0 && !isEditing && (
            <div className="h-[68px] bg-[#111827] border-t border-black/30 flex items-center px-3 gap-1.5 overflow-x-auto flex-shrink-0">
              {files.map((file, idx) => (
                <div
                  key={`strip-${file.id}`}
                  onClick={() => { setCurrentIndex(idx); resetViewer(); }}
                  className={`h-[48px] w-[48px] rounded-lg cursor-pointer flex-shrink-0 overflow-hidden transition-all duration-150 ${currentIndex === idx
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#111827] opacity-100 scale-105'
                    : 'opacity-40 hover:opacity-70'
                  }`}
                >
                  <img src={file.url} alt="" className="w-full h-full object-cover" draggable={false} />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Status Bar ─────────────────────────────────────────── */}
      <footer className="h-7 bg-[#111827] border-t border-black/20 flex items-center justify-between px-4 text-[10px] text-gray-500 z-50 flex-shrink-0 font-mono">
        <div className="flex items-center gap-3">
          <span>{files.length} ITEMS</span>
          {currentIndex !== null && (
            <>
              <span className="text-gray-700">|</span>
              <span className="text-gray-400 font-bold truncate max-w-[200px]">{files[currentIndex].name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {currentIndex !== null && (
            <>
              <span className="text-blue-500 font-bold">{currentIndex + 1} / {files.length}</span>
              <span className="text-gray-700">|</span>
              <span>{formatSize(files[currentIndex].size)}</span>
              <span className="text-gray-700">|</span>
              <span>{Math.round(zoom * 100)}%</span>
            </>
          )}
          <span className="text-gray-700">|</span>
          <span className="text-gray-600 font-bold tracking-widest">SILVIEW V1.4</span>
        </div>
      </footer>

      {/* ── Drag Overlay ───────────────────────────────────────── */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-[#15151f]/90 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="w-80 h-52 border-2 border-dashed border-blue-400/60 rounded-3xl flex flex-col items-center justify-center gap-4">
              <Upload size={36} className="text-blue-400 animate-bounce" />
              <p className="text-white/70 font-semibold text-sm">이미지를 여기에 놓으세요</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PWA Install Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {showInstallInfo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowInstallInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 16 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-7 space-y-5"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <Monitor size={22} className="text-blue-600" />
                </div>
                <button onClick={() => setShowInstallInfo(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">PC 앱으로 설치하기</h3>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">실뷰를 데스크톱 앱으로 설치해 브라우저 없이 바로 실행하세요.</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">{isInstallable ? '지금 설치 가능' : '설치 안내'}</p>
                {isInstallable ? (
                  <p className="text-sm text-blue-900">버튼을 눌러 지금 바로 설치하세요.</p>
                ) : (
                  <div className="space-y-1 text-xs text-blue-800 leading-relaxed">
                    <p>1. 아래 버튼으로 <strong>새 창에서 열기</strong></p>
                    <p>2. 잠시 대기 (3~5초)</p>
                    <p>3. 주소창의 <strong>[설치]</strong> 아이콘 클릭</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={installPWA}
                  className={`w-full py-3.5 text-white rounded-xl text-sm font-bold shadow-lg transition-all active:scale-[0.98] ${isInstallable ? 'bg-green-600 shadow-green-500/20 hover:bg-green-700' : 'bg-blue-600 shadow-blue-500/20 hover:bg-blue-700'}`}
                >
                  {isInstallable ? '지금 설치하기' : (window.self !== window.top ? '새 창에서 열기' : '설치 안내 확인')}
                </button>
                <button onClick={() => setShowInstallInfo(false)} className="w-full py-2.5 text-gray-500 text-sm hover:bg-gray-50 rounded-xl transition-all">
                  나중에
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
