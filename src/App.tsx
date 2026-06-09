import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as fabric from 'fabric';
import {
  RotateCw, RotateCcw, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, X, Image as LucideImage,
  Upload, Trash2, Download, FlipHorizontal,
  Edit3, Square, Circle, Type, Minus, Crop, Save,
  Check, Undo, Monitor, Grid, FolderOpen, MoveRight, ExternalLink, Droplet, Settings
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

// ── 초실행관 배너 컴포넌트 ────────────────────────────────────
function ChoshgBanner() {
  const [posts, setPosts] = useState<{ title: string; link: string }[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetch('https://us-central1-quick-prompt-kjj.cloudfunctions.net/getRss')
      .then(r => r.text())
      .then(text => {
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        const items = Array.from(xml.querySelectorAll('item')).slice(0, 20).map(e => ({
          title: e.querySelector('title')?.textContent?.trim() || '게시물',
          link: e.querySelector('link')?.textContent?.trim() || 'https://choshg.com',
        }));
        setPosts(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (posts.length <= 4) return;
    const t = setInterval(() => setIdx(p => (p + 4) % posts.length), 5000);
    return () => clearInterval(t);
  }, [posts.length]);

  const visible = posts.length ? [0, 1].map(i => posts[(idx + i) % posts.length]) : [];

  return (
    <div className="flex-shrink-0 bg-white border-t border-gray-100 flex items-center px-4" style={{ height: 76 }}>
      {!posts.length ? (
        <span className="text-[11px] text-gray-400">게시물 로딩 중…</span>
      ) : (
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="text-[11px] font-bold text-indigo-500">초실행관의 업무 치트키</span>
          {visible.map((p, i) => (
            <a key={i} href={p.link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 min-w-0 group" style={{ textDecoration: 'none' }}>
              <span className="text-[11px] text-gray-400 flex-shrink-0">▸</span>
              <span className="text-[13px] font-medium text-gray-700 truncate group-hover:text-indigo-500 transition-colors">
                {p.title}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [files, setFiles] = useState<ViewerFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showGallery, setShowGallery] = useState(true);
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
  const isCroppingRef = useRef(false);           // 패닝 핸들러가 참조하는 동기 ref
  const cropHandlersRef = useRef<any>(null);     // 드래그 핸들러 cleanup용
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // 생성한 blob URL 추적 (언마운트 시 정리)
  const blobUrlsRef = useRef<Set<string>>(new Set());
  // Fix: store cleanup so we can remove keydown listener when editor closes
  const editorCleanupRef = useRef<(() => void) | null>(null);
  // Fix: keep undoHistory accessible in stale closures inside editor useEffect
  const undoHistoryRef = useRef<string[]>([]);
  useEffect(() => { undoHistoryRef.current = undoHistory; }, [undoHistory]);
  useEffect(() => { isCroppingRef.current = isCropping; }, [isCropping]);

  // 크롬 확장프로그램 연동 (패널 iframe + 새 탭 모두 window.postMessage로 통일)
  useEffect(() => {
    const fromExt = new URLSearchParams(window.location.search).get('from_ext');

    // 이미지 수신 — ts로 중복 방지하며 여러 장 누적
    const processedTs = new Set<number>();
    const onExtMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'SILVIEW_EXT_IMAGE') return;
      const data = event.data.payload as { dataUrl?: string; url?: string; name: string; ts?: number };
      if (!data || (!data.dataUrl && !data.url)) return;
      if (data.ts && processedTs.has(data.ts)) return; // 같은 이미지 중복 전송 무시
      if (data.ts) processedTs.add(data.ts);
      try {
        const res = await fetch(data.dataUrl || data.url!);
        const blob = await res.blob();
        const file = new File([blob], data.name || 'image.jpg', { type: blob.type || 'image/jpeg' });
        const url = URL.createObjectURL(file);
        blobUrlsRef.current.add(url);
        // 새로 담은 이미지로 자동 이동 (차례로 보기)
        setFiles(prev => { setCurrentIndex(prev.length); return [...prev, { id: Math.random().toString(36).substr(2, 9), url, name: file.name, size: file.size }]; });
      } catch { if (data.ts) processedTs.delete(data.ts); }
    };
    window.addEventListener('message', onExtMessage);

    // 준비 신호 전송 → content script(새 탭) / panel.js(iframe)가 이를 받고 이미지 전송
    const sendReady = () => {
      if (window.parent !== window) window.parent.postMessage({ type: 'SILVIEW_READY' }, '*'); // iframe → 패널
      if (fromExt) window.postMessage({ type: 'SILVIEW_READY' }, '*');                          // 새 탭 → content script
    };
    sendReady();
    const t1 = setTimeout(sendReady, 400);
    const t2 = setTimeout(sendReady, 1200);

    return () => {
      window.removeEventListener('message', onExtMessage);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, []);

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
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          newFiles.push({
            id: Math.random().toString(36).substr(2, 9),
            url: dataUrl,
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

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.title = '실뷰 - 광고 없는 간편 편집 기능 이미지 뷰어';
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

  useEffect(() => {
    if (files.length > 0 && currentIndex === null) {
      setCurrentIndex(0);
    }
  }, [files.length, currentIndex]);

  const handleFiles = useCallback(async (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const filesArray = Array.from(selectedFiles)
      .filter(f => f.type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|heic|heif|bmp|tiff)$/i.test(f.name) || f.type === '');
    if (!filesArray.length) return;

    const newFiles: ViewerFile[] = await Promise.all(
      filesArray.map(f => {
        return new Promise<ViewerFile>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve({
            id: Math.random().toString(36).substr(2, 9),
            url: e.target?.result as string,
            name: f.name,
            size: f.size
          });
          reader.readAsDataURL(f);
        });
      })
    );
    
    setFiles(prev => [...prev, ...newFiles]);
    setShowFileMenu(false);
  }, []);

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
    setFiles(prev => prev.filter(f => f.id !== id));
    if (files.length === 1) {
      setCurrentIndex(null);
    } else if (currentIndex === idx) {
      setCurrentIndex(prev => (prev !== null && prev >= files.length - 1) ? Math.max(0, files.length - 2) : prev);
    } else if (currentIndex !== null && idx < currentIndex) {
      setCurrentIndex(prev => (prev ?? 0) - 1);
    }
  };

  // 담긴 이미지 전체를 순차 다운로드
  const downloadAll = async () => {
    if (files.length === 0) return;
    setShowFileMenu(false);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const a = document.createElement('a');
      a.href = f.url;
      a.download = f.name || `image_${i + 1}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise(r => setTimeout(r, 350)); // 브라우저 연속 다운로드 처리 간격
    }
  };

  const updateBlurRegions = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // 기존 블러 패치 제거
    canvas.getObjects()
      .filter(o => (o as any).name === 'blurPatch')
      .forEach(o => canvas.remove(o));

    const blurRects = canvas.getObjects().filter(o => (o as any).name === 'blurControl');
    if (blurRects.length === 0) { canvas.requestRenderAll(); return; }

    const baseImg = canvas.getObjects().find(o => (o as any).name === 'baseImage') as fabric.Image | undefined;
    if (!baseImg) return;

    const imgEl = (baseImg as any)._element as HTMLImageElement;
    if (!imgEl) return;

    const scaleX = baseImg.scaleX || 1;
    const scaleY = baseImg.scaleY || 1;
    const iW = (baseImg.width || 0) * scaleX;
    const iH = (baseImg.height || 0) * scaleY;
    const iLeft = baseImg.left || 0;
    const iTop  = baseImg.top  || 0;

    const promises = blurRects.map(async (blurRect) => {
      const b = blurRect.getBoundingRect();
      const rl = b.left, rt = b.top, rw = b.width, rh = b.height;

      // 패딩 추가로 블러 경계 번짐 방지
      const pad = 28;
      const srcX = Math.max(0, rl - iLeft - pad);
      const srcY = Math.max(0, rt - iTop  - pad);
      const srcW = Math.min(iW - srcX, rw + pad * 2);
      const srcH = Math.min(iH - srcY, rh + pad * 2);

      // 픽셀화(모자이크): 작게 축소 후 nearest-neighbor로 확대 → 큰 사각형 블록
      const BLOCK = 22; // 모자이크 블록 크기 (픽셀 단위)
      const smallW = Math.max(1, Math.round(srcW / BLOCK));
      const smallH = Math.max(1, Math.round(srcH / BLOCK));

      // 1단계: 원본 영역을 작은 캔버스에 그림 (평균 색상)
      const tmp = document.createElement('canvas');
      tmp.width = smallW; tmp.height = smallH;
      tmp.getContext('2d')!.drawImage(imgEl,
        srcX / scaleX, srcY / scaleY, srcW / scaleX, srcH / scaleY,
        0, 0, smallW, smallH);

      // 2단계: 스무딩 OFF로 확대 → 큰 블록 픽셀화
      const off = document.createElement('canvas');
      off.width  = Math.ceil(srcW);
      off.height = Math.ceil(srcH);
      const ctx = off.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, smallW, smallH, 0, 0, srcW, srcH);

      // 실제 rect 크기로 크롭
      const crop = document.createElement('canvas');
      crop.width  = Math.ceil(rw);
      crop.height = Math.ceil(rh);
      crop.getContext('2d')!.drawImage(off,
        rl - iLeft - srcX, rt - iTop - srcY, rw, rh,
        0, 0, rw, rh);

      const patch = await fabric.Image.fromURL(crop.toDataURL());
      patch.set({ left: rl, top: rt, originX: 'left', originY: 'top',
                  selectable: false, evented: false });
      (patch as any).name = 'blurPatch';
      canvas.add(patch);

      // blurPatch를 baseImage 바로 위(blurControl 아래)로 이동
      const objs = (canvas as any)._objects as fabric.Object[];
      const pi = objs.indexOf(patch);
      const bi = objs.indexOf(baseImg);
      if (pi > bi + 1) { objs.splice(pi, 1); objs.splice(bi + 1, 0, patch); }
    });

    Promise.all(promises).then(() => canvas.requestRenderAll());
  }, []);

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
    activeObjects.forEach(obj => { if ((obj as any).name !== 'baseImage' && (obj as any).name !== 'blurredImage') canvas.remove(obj); });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    setSelectedObject(null);
    updateBlurRegions();
  }, [saveHistory, updateBlurRegions]);

  const cleanupCropHandlers = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !cropHandlersRef.current) return;
    const { down, move, up } = cropHandlersRef.current;
    canvas.off('mouse:down', down);
    canvas.off('mouse:move', move);
    canvas.off('mouse:up', up);
    cropHandlersRef.current = null;
    canvas.defaultCursor = 'grab';
    canvas.selection = true;
  };

  const startCaptureCrop = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // 기존 선택 영역 제거
    const prev = canvas.getObjects().find(o => (o as any).name === 'cropSelector');
    if (prev) canvas.remove(prev);

    canvas.defaultCursor = 'crosshair';
    canvas.setCursor('crosshair');
    canvas.selection = false;
    canvas.discardActiveObject();
    canvas.renderAll();

    const z = canvas.getZoom();
    let drawing = false;
    let startX = 0, startY = 0;
    let selRect: fabric.Rect | null = null;

    const down = (opt: any) => {
      const ptr = canvas.getPointer(opt.e);
      drawing = true;
      startX = ptr.x; startY = ptr.y;
      // 이전 선택 제거
      const old = canvas.getObjects().find(o => (o as any).name === 'cropSelector');
      if (old) canvas.remove(old);
      selRect = new fabric.Rect({
        left: startX, top: startY, width: 0, height: 0,
        fill: 'rgba(59,130,246,0.12)',
        stroke: '#3b82f6', strokeWidth: 2 / z,
        strokeDashArray: [6 / z, 4 / z],
        selectable: false, evented: false,
      });
      (selRect as any).name = 'cropSelector';
      canvas.add(selRect);
      canvas.renderAll();
    };

    const move = (opt: any) => {
      if (!drawing || !selRect) return;
      const ptr = canvas.getPointer(opt.e);
      selRect.set({
        left:   Math.min(ptr.x, startX),
        top:    Math.min(ptr.y, startY),
        width:  Math.abs(ptr.x - startX),
        height: Math.abs(ptr.y - startY),
      });
      canvas.renderAll();
    };

    const up = () => {
      if (!drawing || !selRect) return;
      drawing = false;
      const { width = 0, height = 0 } = selRect;
      if (width < 5 || height < 5) return; // 너무 작으면 무시
      // 드래그 완료 → 즉시 자르기 적용
      setTimeout(() => applyCaptureCrop(), 0);
    };

    canvas.on('mouse:down', down);
    canvas.on('mouse:move', move);
    canvas.on('mouse:up',   up);
    cropHandlersRef.current = { down, move, up };

    setIsCropping(true);
  };

  const applyCaptureCrop = () => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    cleanupCropHandlers();
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

    // 다운로드 즉시 실행 (캔버스 복구 전 dataUrl 사용)
    const fileName = currentIndex !== null ? files[currentIndex].name : 'crop.png';
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName.replace(/\.[^.]+$/, '') + '_crop.png';
    a.click();

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
    cleanupCropHandlers();
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
        defaultCursor: 'grab',
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

      const showBlurBorder = (obj: fabric.Object) => {
        const z = canvas.getZoom();
        // fill 투명 + 점선 테두리만 표시 (블러 효과가 아래로 비침)
        obj.set({ fill: 'transparent', stroke: '#3b82f6', strokeWidth: 2 / z, strokeDashArray: [8 / z, 4 / z], opacity: 0.5 });
        canvas.requestRenderAll();
      };
      const hideBlurBorders = () => {
        canvas.getObjects()
          .filter(o => (o as any).name === 'blurControl')
          .forEach(o => o.set({ stroke: 'transparent', strokeWidth: 0, opacity: 0 }));
        canvas.requestRenderAll();
      };

      canvas.on('selection:created', e => {
        const obj = e.selected?.[0];
        setSelectedObject(obj || null);
        if ((obj as any)?.name === 'blurControl') showBlurBorder(obj!);
      });
      canvas.on('selection:updated', e => {
        const obj = e.selected?.[0];
        setSelectedObject(obj || null);
        if ((obj as any)?.name === 'blurControl') showBlurBorder(obj!);
      });
      canvas.on('selection:cleared', () => { setSelectedObject(null); hideBlurBorders(); });
      canvas.on('object:moving', (e) => { if ((e.target as any)?.name === 'blurControl') updateBlurRegions(); });
      canvas.on('object:scaling', (e) => { if ((e.target as any)?.name === 'blurControl') updateBlurRegions(); });
      canvas.on('object:rotating', (e) => { if ((e.target as any)?.name === 'blurControl') updateBlurRegions(); });
      canvas.on('object:modified', () => { saveHistory(); updateBlurRegions(); });

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
      let initDist = 0, initZoom = canvas.getZoom();

      canvas.on('mouse:down', opt => {
        const e = opt.e as any;
        const isBg = !opt.target || (opt.target as any).name === 'baseImage';
        const isTouch1 = e.touches && e.touches.length === 1;
        const isTouch2 = e.touches && e.touches.length === 2;
        const isLeftMouse = !e.touches && (e.button === 0 || e.button === undefined);

        // 자르기 모드에서는 패닝 비활성화
        if (isCroppingRef.current) return;
        // 빈 배경/이미지를 그냥 드래그하면 손모양으로 이동 (객체 위는 객체 이동)
        if ((isTouch1 && isBg) || isTouch2 || (isLeftMouse && isBg) || e.altKey || e.button === 1) {
          isPanning = true;
          canvas.selection = false;
          canvas.defaultCursor = 'grabbing';
          canvas.setCursor('grabbing');
          if (isTouch2) {
            lastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            lastY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            initDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            initZoom = canvas.getZoom();
          } else if (isTouch1) {
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
          } else {
            lastX = e.clientX;
            lastY = e.clientY;
          }
        }
      });
      
      canvas.on('mouse:move', opt => {
        if (!isPanning) return;
        const e = opt.e as any;
        const isTouch1 = e.touches && e.touches.length === 1;
        const isTouch2 = e.touches && e.touches.length === 2;
        let cX = 0, cY = 0;

        if (isTouch2) {
          cX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          cY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          if (initDist > 0) {
            const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            let z = initZoom * (dist / initDist);
            z = Math.min(20, Math.max(0.01, z));
            canvas.zoomToPoint(new fabric.Point(cX, cY), z);
            setEditorZoom(z);
          }
        } else if (isTouch1) {
          cX = e.touches[0].clientX;
          cY = e.touches[0].clientY;
        } else if (!e.touches) {
          cX = e.clientX;
          cY = e.clientY;
        } else {
          return;
        }

        const vpt = canvas.viewportTransform!;
        vpt[4] += cX - lastX;
        vpt[5] += cY - lastY;
        canvas.requestRenderAll();
        lastX = cX;
        lastY = cY;
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      });
      
      canvas.on('mouse:up', () => {
        if (isPanning) {
          canvas.setViewportTransform(canvas.viewportTransform!);
          isPanning = false;
          canvas.selection = true;
          canvas.defaultCursor = 'grab';
          canvas.setCursor('grab');
          initDist = 0;
        }
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const active = canvas.getActiveObject();
          if (active?.type === 'i-text' && (active as fabric.IText).isEditing) return;
          const objs = canvas.getActiveObjects();
          if (!objs.length) return;
          const json = JSON.stringify((canvas as any).toJSON(['name', 'selectable', 'evented']));
          setUndoHistory(prev => { const n = [...prev, json]; return n.length > 20 ? n.slice(1) : n; });
          objs.forEach(o => { if ((o as any).name !== 'baseImage' && (o as any).name !== 'blurredImage') canvas.remove(o); });
          canvas.discardActiveObject(); canvas.requestRenderAll(); setSelectedObject(null);
          updateBlurRegions();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          const history = undoHistoryRef.current;
          if (!history.length) return;
          const last = history[history.length - 1];
          canvas.loadFromJSON(last).then(() => {
            canvas.renderAll();
            setUndoHistory(prev => prev.slice(0, -1));
            updateBlurRegions();
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

  const addShape = (type: 'rect' | 'circle' | 'text' | 'line' | 'arrow' | 'blur') => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    saveHistory();
    const strokeDashArray = isDashed ? [5, 5] : undefined;

    const z = canvas.getZoom();
    const vpt = canvas.viewportTransform!;
    const cx = (canvas.width!  / 2 - vpt[4]) / z;
    const cy = (canvas.height! / 2 - vpt[5]) / z;

    let obj: fabric.Object | undefined;
    if (type === 'rect')
      obj = new fabric.Rect({ width: 360, height: 240, fill: 'transparent', stroke: brushColor, strokeWidth: 9, strokeDashArray, left: cx - 180, top: cy - 120 });
    else if (type === 'circle')
      obj = new fabric.Circle({ radius: 150, fill: 'transparent', stroke: brushColor, strokeWidth: 9, strokeDashArray, left: cx - 150, top: cy - 150 });
    else if (type === 'line')
      obj = new fabric.Line([0, 0, 450, 0], { stroke: brushColor, strokeWidth: 9, strokeDashArray, strokeLineCap: 'round', left: cx - 225, top: cy });
    else if (type === 'arrow') {
      const sw = 9, th = 52, tb = 30;
      const bEnd = 450 - th;
      obj = new fabric.Path(
        `M 0 ${-sw / 2} L ${bEnd} ${-sw / 2} L ${bEnd} ${-tb} L 450 0 L ${bEnd} ${tb} L ${bEnd} ${sw / 2} L 0 ${sw / 2} Z`,
        { fill: brushColor, stroke: 'transparent', left: cx - 225, top: cy - tb }
      );
      (obj as any).arrowShape = true;
    } else if (type === 'text')
      obj = new fabric.IText('텍스트', { fontSize: 84, fill: brushColor, fontFamily: 'Inter, sans-serif', left: cx, top: cy });
    else if (type === 'blur') {
      const z = canvas.getZoom();
      // fill 투명 + 점선 테두리(선택 시에만), 해제 시 opacity:0
      obj = new fabric.Rect({
        width: 360, height: 240,
        fill: 'transparent',
        stroke: '#3b82f6', strokeWidth: 2 / z, strokeDashArray: [8 / z, 4 / z],
        opacity: 0.5, left: cx - 180, top: cy - 120,
      });
      (obj as any).name = 'blurControl';
    }

    if (obj) {
      const isBlur = (obj as any).name === 'blurControl';
      obj.set({
        cornerSize: isBlur ? 10 : 4,
        cornerColor: '#3b82f6',
        cornerStrokeColor: '#ffffff',
        transparentCorners: false,
        borderColor: isBlur ? '#3b82f6' : '#3b82f6',
        borderScaleFactor: 1.5,
        hasBorders: true,
      });
      canvas.add(obj);
      canvas.setActiveObject(obj);
      if (type === 'blur') updateBlurRegions();
    }
  };

  useEffect(() => {
    if (!fabricCanvasRef.current || !selectedObject || (selectedObject as any).name === 'baseImage') return;
    const obj = selectedObject;
    if ((obj as any).name === 'blurControl') return; // Prevent color picker from coloring blur regions
    
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
    
    // Hide blur control outlines before export
    const blurRects = canvas.getObjects().filter(o => (o as any).name === 'blurControl');
    blurRects.forEach(r => r.set('visible', false));
    canvas.discardActiveObject();
    canvas.renderAll();

    const baseImg = canvas.getObjects().find(o => (o as any).name === 'baseImage') as fabric.Image;
    if (!baseImg) {
      blurRects.forEach(r => r.set('visible', true));
      return;
    }

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

    canvas.setWidth(origW);
    canvas.setHeight(origH);
    canvas.setViewportTransform(origVpt);
    blurRects.forEach(r => r.set('visible', true));
    canvas.renderAll();

    fetch(dataUrl).then(r => r.blob()).then(blob => {
      setFiles(prev => { const n = [...prev]; n[currentIndex] = { ...n[currentIndex], url: dataUrl, size: blob.size }; return n; });
      const link = document.createElement('a');
      link.href = dataUrl; link.download = `edited_${files[currentIndex].name.replace(/\.[^.]+$/, '')}.png`; link.click();
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
    { type: 'blur' as const, Icon: Droplet, label: '블러' },
  ];

  return (
    <div className="relative w-full h-screen flex flex-col font-sans select-none text-[#1F2937]">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="h-12 border-b border-gray-200 bg-white flex items-center px-4 z-50 flex-shrink-0 gap-3">
        <div className="flex items-center gap-5">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}new-icon.png`} alt="실뷰" className="w-7 h-7 rounded-lg object-cover" />
            <span className="text-sm font-bold tracking-tight text-gray-900">실뷰</span>
          </div>

          {/* Nav */}
          <nav className="flex items-center text-xs font-medium text-gray-500">
            <div className="relative">
              <button
                onClick={() => setShowFileMenu(!showFileMenu)}
                className={`px-2 md:px-3 py-1.5 rounded-md transition-colors flex items-center gap-1 ${showFileMenu ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-100'}`}
              >
                <Settings size={13} className="md:hidden" />
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
                          <input type="file" multiple accept="image/jpeg, image/png, image/webp, image/gif, image/bmp, image/svg+xml" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
                        </div>
                      ) : (
                        <button key={label} onClick={onClick} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 transition-colors text-gray-700">
                          <Icon size={13} className="text-gray-400" /> {label}
                        </button>
                      )
                    ))}
                    {files.length > 0 && (
                      <>
                        <div className="h-px bg-gray-100 my-1 mx-3" />
                        <button onClick={downloadAll} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 transition-colors text-gray-700">
                          <Download size={13} className="text-gray-400" /> 전체 다운로드 ({files.length}장)
                        </button>
                      </>
                    )}
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
            className="hidden md:flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all hover:scale-[1.03] hover:shadow-md"
            style={{ background: '#0d1266', color: '#ffd700', border: '1px solid rgba(255,215,0,0.4)', boxShadow: '0 2px 12px rgba(13,18,102,0.3)' }}
          >
            대한민국 모든 공무원을 위한 4가지 해법 : 알아보기
            <ExternalLink size={11} style={{ opacity: 0.8 }} />
          </a>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          {currentIndex !== null && !isEditing && (
            <div className="hidden lg:flex items-center bg-gray-100 rounded-lg px-1 py-1 gap-0.5 mr-1">
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
            <input type="file" multiple accept="image/jpeg, image/png, image/webp, image/gif, image/bmp, image/svg+xml" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {currentIndex !== null && (
            <button
              onClick={() => { const a = document.createElement('a'); a.href = files[currentIndex].url; a.download = files[currentIndex].name; a.click(); }}
              className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-700 rounded-lg transition-colors" title="다운로드"
            >
              <Download size={16} />
            </button>
          )}
          {currentIndex !== null && !isEditing && (
            <button
              onClick={(e) => { removeFile(files[currentIndex].id, e); resetViewer(); }}
              className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors" title="닫기"
            >
              <X size={16} />
            </button>
          )}
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg, image/png, image/webp, image/gif, image/bmp, image/svg+xml" className="sr-only" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          <input ref={folderInputRef} type="file" multiple accept="image/jpeg, image/png, image/webp, image/gif, image/bmp, image/svg+xml" {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>} className="sr-only" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
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
              {/* Toolbar - 2 Rows for mobile optimization */}
              <div className="bg-white border-b border-gray-100 flex flex-col flex-shrink-0">
                
                {/* Row 1: Shapes + Color */}
                <div className="flex items-center px-1.5 py-1.5 gap-1 w-full overflow-x-auto no-scrollbar">
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                    {shapeButtons.filter(b => b.type !== 'blur').map(({ type, Icon, label }) => (
                      <button key={type} onClick={() => addShape(type)} className="flex items-center gap-1 px-2 py-1 hover:bg-white hover:shadow-sm rounded-md text-[11px] text-gray-600 hover:text-gray-900 transition-all font-medium whitespace-nowrap">
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-4 bg-gray-200 flex-shrink-0 mx-0.5" />

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="relative w-6 h-6 rounded-md border border-gray-200 overflow-hidden cursor-pointer hover:border-gray-300 transition-colors" title="색상 선택">
                      <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="absolute inset-0 w-10 h-10 -m-1 cursor-pointer opacity-0" />
                      <div className="w-full h-full" style={{ backgroundColor: brushColor }} />
                    </div>
                    <button
                      onClick={() => setIsDashed(!isDashed)}
                      className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-all ${isDashed ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      점선
                    </button>
                  </div>
                </div>

                {/* Row 2: Blur + Tools + Actions */}
                <div className="flex flex-wrap items-center px-1.5 pb-1.5 gap-x-1.5 gap-y-1.5 w-full">
                  
                  {/* Blur (Prominent) */}
                  <button onClick={() => addShape('blur')} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 hover:border-blue-200 rounded-lg text-[11px] font-bold transition-all shadow-sm flex-shrink-0">
                    <Droplet size={13} fill="currentColor" /> 블러
                  </button>

                  <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

                  {/* Editor zoom */}
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
                    <button onClick={() => adjustZoom(-0.1)} className="p-1 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ZoomOut size={12} /></button>
                    <button onClick={zoomToFit} className="px-1.5 py-0.5 text-[10px] font-bold text-blue-600 hover:bg-blue-50 rounded-md min-w-[42px] text-center transition-colors">{Math.round(editorZoom * 100)}%</button>
                    <button onClick={() => adjustZoom(0.1)} className="p-1 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ZoomIn size={12} /></button>
                  </div>

                  <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

                  {/* Undo + Delete */}
                  <button
                    onClick={() => {
                      const history = undoHistoryRef.current;
                      if (!history.length || !fabricCanvasRef.current) return;
                      const last = history[history.length - 1];
                      fabricCanvasRef.current.loadFromJSON(last).then(() => {
                        fabricCanvasRef.current!.renderAll();
                        setUndoHistory(prev => prev.slice(0, -1));
                        updateBlurRegions();
                      });
                    }}
                    disabled={undoHistory.length === 0}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 ${undoHistory.length === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Undo size={12} /> 복구
                  </button>
                  <button onClick={deleteSelectedObject} className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium text-red-500 hover:bg-red-50 transition-all flex-shrink-0">
                    <Trash2 size={12} /> 삭제
                  </button>

                  <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

                  {/* Crop */}
                  <button
                    onClick={startCaptureCrop}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all flex-shrink-0 ${isCropping ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'text-orange-600 hover:bg-orange-50'}`}
                  >
                    <Crop size={12} /> 자르기
                  </button>

                  <div className="w-px h-4 bg-gray-200 flex-shrink-0" />

                  {/* Resize */}
                  <div className="flex items-center gap-1 text-[9px] font-bold text-gray-400 flex-shrink-0">
                    <span>W</span>
                    <input type="number" value={resizeWidth} onChange={e => handleResizeChange('w', parseInt(e.target.value) || 0)} className="w-12 px-1 py-1 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-center text-[10px] font-normal" />
                    <span>H</span>
                    <input type="number" value={resizeHeight} onChange={e => handleResizeChange('h', parseInt(e.target.value) || 0)} className="w-12 px-1 py-1 border border-gray-200 rounded-md bg-gray-50 text-gray-700 text-center text-[10px] font-normal" />
                    <button onClick={() => setMaintainAspect(!maintainAspect)} className={`px-1.5 py-1 rounded-md border transition-all font-medium ${maintainAspect ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>비율</button>
                  </div>

                  {/* Right actions */}
                  <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                    {isCropping && (
                      <>
                        <span className="text-[11px] text-orange-500 font-medium">드래그로 영역 선택 → 자동 적용</span>
                        <button onClick={cancelCrop} className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-all">
                          <X size={12} /> 취소
                        </button>
                      </>
                    )}
                    {!isCropping && (
                      <button onClick={saveEditedImage} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold hover:bg-blue-700 shadow-sm shadow-blue-500/20 transition-all">
                        <Save size={12} /> 저장
                      </button>
                    )}
                    <button onClick={() => setIsEditing(false)} className="px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-all">
                      닫기
                    </button>
                  </div>
                </div>
              </div>

              {/* Fabric canvas */}
              <div className="flex-1 relative overflow-hidden bg-[#1a1a2e]">
                <canvas ref={canvasRef} />
              </div>
            </div>

          ) : currentIndex === null ? (
            /* ── Empty State ─────────────────────────────── */
            <div className="flex-1 flex items-center justify-center bg-[#F9FAFB]">
              <div className="text-center space-y-7 max-w-xs px-8">
                <div className="space-y-2">
                  <p className="text-sm text-gray-400 leading-relaxed">광고 없는 심플한 이미지 뷰어.<br />도형 및 텍스트 삽입, 블러 처리<br />크기 조절 등 간편 편집 기능</p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="relative overflow-hidden rounded-xl cursor-pointer transition-all hover:opacity-90" style={{ background: '#0d1266', boxShadow: '0 8px 24px rgba(13,18,102,0.35)' }}>
                    <div className="px-6 py-3 text-sm font-bold text-center pointer-events-none whitespace-nowrap" style={{ color: '#ffd700' }}>
                      이미지 불러오기
                    </div>
                    <input type="file" multiple accept="image/jpeg, image/png, image/webp, image/gif, image/bmp, image/svg+xml" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
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
              className="flex-1 relative flex items-center justify-center overflow-hidden touch-none p-4"
              style={{ background: 'radial-gradient(ellipse at 50% 40%, #252535 0%, #15151f 100%)', cursor: 'grab' }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                (e.currentTarget as any)._panStart = { x: e.clientX, y: e.clientY };
                (e.currentTarget as any)._panning = true;
                (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
              }}
              onPointerMove={(e) => {
                const el = e.currentTarget as any;
                if (!el._panning || !el._panStart) return;
                const dx = e.clientX - el._panStart.x;
                const dy = e.clientY - el._panStart.y;
                el._panStart = { x: e.clientX, y: e.clientY };
                setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
              }}
              onPointerUp={(e) => {
                const el = e.currentTarget as any;
                el._panning = false;
                (e.currentTarget as HTMLElement).style.cursor = 'grab';
              }}
              onPointerLeave={(e) => {
                const el = e.currentTarget as any;
                el._panning = false;
                (e.currentTarget as HTMLElement).style.cursor = 'grab';
              }}
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

              {/* 드래그 레이어: 네이티브 포인터 이벤트로 패닝 (Framer drag 제거 — 확대 시 범위 제한 문제 해결) */}
              <div
                key={files[currentIndex].id}
                className="relative flex items-center justify-center"
                style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
              >
                <img
                  src={files[currentIndex].url}
                  alt={files[currentIndex].name}
                  className="max-w-full max-h-full object-contain select-none"
                  style={{
                    filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.6))',
                    transform: `scale(${zoom}) rotate(${rotation}deg) scaleX(${flip ? -1 : 1})`,
                    transition: 'transform 0.18s ease-out',
                    pointerEvents: 'none',
                  }}
                  draggable={false}
                />
              </div>

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

            </div>
          )}

        </main>
      </div>

      {/* ── 초실행관 배너 (사진 안 열렸을 때만 표시) ──────────────── */}
      {currentIndex === null && <ChoshgBanner />}

      {/* ── Status Bar ─────────────────────────────────────────── */}
      <footer className="h-7 bg-[#111827] border-t border-black/20 flex items-center justify-between px-4 text-[10px] text-gray-500 z-50 flex-shrink-0 font-mono">
        <div className="flex items-center gap-3">
          <span>{files.length} ITEMS</span>
        </div>
        {/* 파일명 중앙 표시 */}
        {currentIndex !== null && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] font-mono">
            <span className="text-gray-400 font-bold truncate max-w-[280px]">{files[currentIndex].name}</span>
            <span className="text-gray-700">·</span>
            <span className="text-blue-400 font-bold">{currentIndex + 1} / {files.length}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          {currentIndex !== null && (
            <>
              <span>{formatSize(files[currentIndex].size)}</span>
              <span className="text-gray-700">|</span>
              <span>{Math.round(zoom * 100)}%</span>
              <span className="text-gray-700">|</span>
            </>
          )}
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
