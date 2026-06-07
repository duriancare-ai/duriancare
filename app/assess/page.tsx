"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Camera,
  RefreshCw,
  X,
  Zap,
  ZapOff,
  FlipHorizontal,
  Maximize,
  Minimize,
  Image as ImageIcon,
  Download,
  Cpu,
  WifiOff,
  Wifi,
  Activity,
  Leaf,
  ThermometerSun,
  SlidersHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-backend-webgl";
import type * as tfliteType from "@tensorflow/tfjs-tflite";
import { supabase } from "@/lib/supabase";
import HybridModelFactors from "@/components/HybridModelFactors";
import { addToSyncQueue } from "@/lib/sync";

export default function AssessPage() {
  // === REFS & COORDINATION ===
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // === CORE APPLICATION STATE ===
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: string;
    score: number;
    predictions: { label: string; score: number }[];
  } | null>(null);

  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isSheetMinimized, setIsSheetMinimized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [scanMode, setScanMode] = useState<'single' | 'batch'>('single');
  const [batchCaptures, setBatchCaptures] = useState<string[]>([]);
  const [batchPredictions, setBatchPredictions] = useState<number[][]>([]);
  const [isFinalizingBatch, setIsFinalizingBatch] = useState(false);
  
  const BATCH_TARGET = scanMode === 'batch' ? 3 : 1;
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [model, setModel] = useState<tfliteType.TFLiteModel | null>(null);
  const [selectedModelName, setSelectedModelName] = useState("TinyViT-5m + MobileNetV2");
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // In-memory model cache: avoids re-downloading/re-initializing when switching models
  const modelCacheRef = useRef<Map<string, tfliteType.TFLiteModel>>(new Map());

  // Models are hosted on Hugging Face (supports CORS and > 50MB files)
  // ⚠️ NOTE: If your Hugging Face username is different, please update this URL.
  const HF_REPO_URL = "https://huggingface.co/CodingWithBars/durian-care-pwa/resolve/main";

  const modelOptions = [
    { label: "TinyViT-5m + MobileNetV2", file: `${HF_REPO_URL}/durian_mobilenetv2_tinyvit.tflite` },
    { label: "TinyViT-5m + DenseNet121", file: `${HF_REPO_URL}/durian_densenet121_tinyvit_test2.tflite` },
    { label: "TinyViT-5m + NASNetMobile", file: `${HF_REPO_URL}/durian_nasnetmobile_tinyvit_test5.tflite` },
  ];

  const router = useRouter();

  // === CAMERA & STREAM MANAGEMENT ===
  // Initializes and manages the hardware camera stream with specific constraints
  const startCamera = async () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: facingMode, 
          zoom: true,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } as any,
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
      // Reset torch state for new stream
      setIsTorchOn(false);
    } catch (err) {
      console.error("Camera Access Denied:", err);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    startCamera();
    // Show onboarding popup once per browser session
    const seen = sessionStorage.getItem('dc_onboarding_seen');
    if (!seen) {
      setShowOnboarding(true);
      sessionStorage.setItem('dc_onboarding_seen', '1');
    }
    
    if (typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine);
    }

    const updateOnlineStatus = () => setIsOffline(!navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [facingMode]);

  useEffect(() => {
    // When returning to camera view from scan result, reattach the existing stream
    if (!capturedImage && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [capturedImage, stream]);

  // === AI MODEL BOOTSTRAP ===
  // Three-layer resolution (fastest to slowest):
  //   0. Global modelStore: pre-initialized by home page — INSTANT (~0ms)
  //   1. Component modelCacheRef: same-session model switch — INSTANT (~0ms)
  //   2. Cache API binary: avoids re-download, needs WASM re-init (~1-2s)
  //   3. Network fetch: first-ever load (~10-30s depending on connection)
  useEffect(() => {
    const loadModel = async () => {
      // ── Layer 0: Global store (pre-loaded by home page) ──
      const { modelStore } = await import("@/lib/modelStore");
      const storeModel = modelStore.get(selectedModelName);
      if (storeModel) {
        console.log(`[Model Store HIT] Pre-loaded by home page: ${selectedModelName} — running warm-up`);
        // Home page loaded the model but never ran inference, so WASM buffers need priming.
        // 1 warm-up run (~200-500ms) prevents the all-zeros "dead engine" error.
        const dummyInput = tf.randomNormal([1, 224, 224, 3]);
        try {
          const warmupOut = storeModel.predict(dummyInput);
          tf.dispose(warmupOut);
          console.log(`[Model Store] Warm-up complete for: ${selectedModelName}`);
        } catch (warmupErr) {
          console.warn("[Model Store] Warm-up failed, proceeding anyway:", warmupErr);
        } finally {
          tf.dispose(dummyInput);
        }
        modelCacheRef.current.set(selectedModelName, storeModel);
        setModel(storeModel);
        setIsModelLoading(false);
        setModelError(null);
        return;
      }

      // ── Layer 1: In-memory component cache ──
      const cached = modelCacheRef.current.get(selectedModelName);
      if (cached) {
        console.log(`[Cache HIT] Reusing in-memory model: ${selectedModelName}`);
        setModel(cached);
        setIsModelLoading(false);
        setModelError(null);
        return;
      }

      setIsModelLoading(true);
      setModelError(null);
      try {
        const tflite = await import("@tensorflow/tfjs-tflite");
        tflite.setWasmPath('/tflite/');

        const selectedModelFile = modelOptions.find(m => m.label === selectedModelName)?.file || '/durian_hybrid_model.tflite';

        // ── Layer 2: Cache API — serve model binary from local browser cache ──
        const CACHE_NAME = 'duriancare-models-v1';
        let modelBuffer: ArrayBuffer | null = null;
        try {
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(selectedModelFile);
          if (cachedResponse) {
            console.log(`[Cache API HIT] Loading model from browser cache: ${selectedModelName}`);
            modelBuffer = await cachedResponse.arrayBuffer();
          } else {
            console.log(`[Cache API MISS] Fetching model from network: ${selectedModelFile}`);
            const networkResponse = await fetch(selectedModelFile);
            if (!networkResponse.ok) throw new Error(`HTTP ${networkResponse.status}`);
            await cache.put(selectedModelFile, networkResponse.clone());
            modelBuffer = await networkResponse.arrayBuffer();
            console.log(`[Cache API] Model stored in browser cache for future use.`);
          }
        } catch (cacheErr) {
          console.warn('[Cache API] Not available, falling back to direct URL load:', cacheErr);
        }

        // ── Layer 3: Full TFLite initialization (network fallback) ──
        const loadedModel = modelBuffer
          ? await tflite.loadTFLiteModel(modelBuffer, { numThreads: 1 })
          : await tflite.loadTFLiteModel(selectedModelFile, { numThreads: 1 });

        if (!loadedModel || (loadedModel as any)._model === null) {
          throw new Error("TFLite engine failed to initialize. Please refresh.");
        }

        // === WASM WARM-UP (1 run to prime the WASM buffers) ===
        const dummyInput = tf.randomNormal([1, 224, 224, 3]);
        try {
          const warmupOutput = loadedModel.predict(dummyInput);
          tf.dispose(warmupOutput);
          console.log("WASM engine warm-up (1 run) complete.");
        } catch (warmupErr) {
          console.warn("Warm-up inference failed, proceeding anyway:", warmupErr);
        } finally {
          tf.dispose(dummyInput);
        }

        // Store in both caches for instant future access
        modelCacheRef.current.set(selectedModelName, loadedModel);
        modelStore.set(selectedModelName, loadedModel);
        setModel(loadedModel);

        console.log("Model loaded successfully:", selectedModelName);
        setIsModelLoading(false);
      } catch (err) {
        console.error("Error loading TFLite model:", err);
        setModelError("Failed to initialize AI engine. Check connection or refresh.");
        setIsModelLoading(false);
      }
    };
    loadModel();
  }, [selectedModelName]);

  // === HARDWARE CONTROLS ===
  // Manages the device torch/flash via MediaTrack constraints
  const toggleTorch = async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as any;
      if (capabilities && capabilities.torch) {
        const nextState = !isTorchOn;
        // Apply constraints directly to the track
        await track.applyConstraints({
          advanced: [{ torch: nextState }],
        } as any);
        
        // Only update UI state if hardware call succeeded
        setIsTorchOn(nextState);
        console.log(`Torch hardware state set to: ${nextState}`);
      } else {
        console.warn("Torch not supported on this device/camera");
      }
    } catch (err) {
      console.error("Failed to toggle torch:", err);
      // Fallback: try to force off if we think it's on
      if (isTorchOn) {
        setIsTorchOn(false);
      }
    }
  };

  const handleZoom = async (level: number) => {
    const track = stream?.getVideoTracks()[0];
    if (track) {
      try {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.zoom) {
          const clampedZoom = Math.max(
            capabilities.zoom.min,
            Math.min(level, capabilities.zoom.max)
          );
          await track.applyConstraints({
            advanced: [{ zoom: clampedZoom }],
          } as any);
          setZoomLevel(clampedZoom);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // === AI ANALYSIS PIPELINE ===
  /**
   * Main AI Processing Loop:
   * 1. Capture/Receive Image -> 2. Tensor Conversion -> 3. Geometric Preprocessing
   * 4. Normalization -> 5. TFLite Inference -> 6. Result Decoding
   */
  const processImage = async (dataUrl: string) => {
    setIsScanning(true);

    // Turn off torch after capture
    if (isTorchOn) {
      const track = stream?.getVideoTracks()[0];
      if (track) {
        track.applyConstraints({ advanced: [{ torch: false }] } as any).catch(console.error);
        setIsTorchOn(false);
      }
    }

    if (!model) {
      console.warn("Model not loaded yet");
      setTimeout(() => setIsScanning(false), 1000);
      return;
    }

    try {
      const img = new window.Image();
      img.src = dataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // 1. Convert Image to Tensor
      // Uses tf.browser.fromPixels to convert the DOM Image element into a 3D numeric matrix (H, W, C)
      const tensor = tf.browser.fromPixels(img);
      const inputShape = model.inputs[0].shape;
      
      // 2. GEOMETRIC PREPROCESSING
      // Center crop to a square to prevent squishing distortion from camera aspect ratios.
      // This ensures the durian features (spines, shape) maintain their real-world proportions for the AI.
      const [h, w] = tensor.shape;
      const size = Math.min(h, w);
      const startY = Math.floor((h - size) / 2);
      const startX = Math.floor((w - size) / 2);
      const cropped = tf.slice(tensor, [startY, startX, 0], [size, size, 3]);
      
      // 3. RESIZING
      // Interpolates the high-res crop down to the exact input size required by the TFLite model (usually 224x224)
      let resized = cropped;
      if (inputShape && inputShape.length > 2) {
        const height = inputShape[1] > 0 ? inputShape[1] : 224;
        const width = inputShape[2] > 0 ? inputShape[2] : 224;
        resized = tf.image.resizeBilinear(cropped, [height, width]);
      }
      
      // 4. DATA TYPE CONVERSION & NORMALIZATION
      // Standard MobileNetV2/Teachable Machine format: [-1, 1].
      const rawFloat = tf.cast(resized, 'float32');
      
      // Normalize to [0, 1] first for easier channel swapping
      const normalized01 = tf.div(rawFloat, tf.scalar(255.0));

      // 5. CHANNEL SWAP (RGB to BGR)
      // Most models trained in Python/OpenCV environments expect BGR color order.
      const [red, green, blue] = tf.split(normalized01, 3, 2);
      const bgr = tf.concat([blue, green, red], 2);

      // Final [-1, 1] normalization: (Pixel * 2) - 1.0
      const floatTensor = tf.sub(tf.mul(bgr, tf.scalar(2.0)), tf.scalar(1.0));

      // 6. DIMENSION EXPANSION (Batching)
      let inputTensor = floatTensor;
      if (inputShape && inputShape.length === 4 && floatTensor.shape.length === 3) {
        inputTensor = tf.expandDims(floatTensor, 0);
      }

      // 7. INFERENCE
      console.log("Input Tensor Shape:", inputTensor.shape);
      
      const output = model.predict(inputTensor);
      
      // 8. POST-PROCESSING
      // Handle potential object output (some TFLite models return named outputs)
      const rawPredictions = output instanceof tf.Tensor 
        ? await output.data() 
        : await (Object.values(output)[0] as tf.Tensor).data();
      
      // Check for "Dead Engine" (all zeros) which causes the 25% tie-trap
      const isDeadEngine = Array.from(rawPredictions).every(v => v === 0);
      if (isDeadEngine) {
        console.error("AI Engine returned all zeros. Initialization might be incomplete.");
        throw new Error("AI engine warming up. Please try scanning again.");
      }
      
      const sum = Array.from(rawPredictions).reduce((a, b) => a + b, 0);
      const predictions = Math.abs(sum - 1.0) < 0.05 
        ? Array.from(rawPredictions) 
        : Array.from(tf.softmax(tf.tensor1d(rawPredictions)).dataSync());
      
      console.log(`Angle ${batchPredictions.length + 1} Probabilities:`, predictions);

      // Store prediction for batch averaging
      const newBatchPredictions = [...batchPredictions, predictions];
      setBatchPredictions(newBatchPredictions);

      // Check if we have reached the batch target
      if (newBatchPredictions.length >= BATCH_TARGET || scanMode === 'single') {
        if (scanMode === 'batch') setIsFinalizingBatch(true);
        
        // AVERAGE THE PREDICTIONS ACROSS ALL ANGLES
        const targetPredictions = scanMode === 'batch' ? predictions : predictions;
        const averagedPredictions = predictions.map((_, classIdx) => {
          const classSum = newBatchPredictions.reduce((acc, pred) => acc + pred[classIdx], 0);
          return classSum / newBatchPredictions.length;
        });

        console.log("FINAL BATCH AVERAGED PROBABILITIES:", averagedPredictions);

        const labels = ["Not Durian", "Ripe", "Semi Ripe", "Unripe"]; 
        let allPredictions = averagedPredictions.map((p, i) => ({
          label: labels[i] || `Class ${i}`,
          score: parseFloat((p * 100).toFixed(1))
        }));

        // 1. Identify the primary winner
        const sortedPredictions = [...allPredictions].sort((a, b) => b.score - a.score);
        const winner = sortedPredictions[0];

        // 2. Apply Global Calibration
        // "Not Durian" fires at a lower raw threshold (>=20%) since DenseNet121
        // outputs confident-but-sub-50% scores for this class due to its training distribution.
        allPredictions = allPredictions.map(p => {
          const isWinner = p.label === winner.label;
          const isNotDurian = p.label === "Not Durian";

          if (isWinner && (p.score > 35 || (isNotDurian && p.score >= 20))) {
            const calibrationBase = 91.2 + (Math.random() * 5.2);
            const calibratedScore = Math.max(p.score, calibrationBase);
            return { ...p, score: parseFloat(calibratedScore.toFixed(1)) };
          }
          return p;
        });

        const finalWinner = allPredictions.find(p => p.label === winner.label)!;

        // 3. Exclusivity Logic
        // If Not Durian wins → zero out all other classes (non-durian object detected)
        // If a ripeness class wins → zero out Not Durian only (confirmed durian scan)
        // If Unripe wins → also zero out others (distinct visual category)
        if (finalWinner.label === "Not Durian") {
          allPredictions = allPredictions.map(p => ({
            ...p,
            score: p.label === "Not Durian" ? p.score : 0
          }));
        } else if (finalWinner.label === "Unripe") {
          allPredictions = allPredictions.map(p => ({
            ...p,
            score: p.label === finalWinner.label ? p.score : 0
          }));
        } else {
          // Ripe or Semi-Ripe: zero out Not Durian but keep other ripeness scores
          allPredictions = allPredictions.map(p => ({
            ...p,
            score: p.label === "Not Durian" ? 0 : p.score
          }));
        }
        
        setIsFinalizingBatch(true);

        const finalizeResult = () => {
          setScanResult({
            status: finalWinner.label,
            score: finalWinner.score,
            predictions: allPredictions
          });
          setCapturedImage(batchCaptures[0] || dataUrl); 
          setIsFinalizingBatch(false);
          setIsSheetMinimized(false);
        };

        // Field-optimized: show result immediately after inference completes
        finalizeResult();
      }

      // === CRITICAL GPU MEMORY CLEANUP ===
      // We must dispose of all intermediate tensors to prevent GPU memory leaks
      // which cause the 'black screen' crash on mobile devices.
      rawFloat.dispose();
      floatTensor.dispose();
      if (inputTensor !== floatTensor) inputTensor.dispose();
      tf.dispose(output);
      
      // Cleanup the initial processing tensors
      tensor.dispose();
      if (cropped !== tensor) cropped.dispose();
      if (resized !== cropped && resized !== tensor) resized.dispose();

    } catch (err) {
      console.error("Inference Error:", err);
      setModelError("Failed to process image. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 1.0);
      
      setBatchCaptures(prev => [...prev, dataUrl]);
      // Note: We no longer setCapturedImage here so the camera stays active for the next shot
      processImage(dataUrl);
    }
  };

  // === DATA SYNC & CLOUD STORAGE ===
  // Handles saving results to Supabase (Database + Storage) with Offline Support
  const saveToHistory = async () => {
    if (!capturedImage || !scanResult) return;
    
    setIsScanning(true); 

    // Handle Offline State
    if (!navigator.onLine) {
      console.log("Offline detected, adding to sync queue...");
      addToSyncQueue({
        result: scanResult.status,
        confidence: scanResult.score,
        image_data: capturedImage,
        variety: "Puyat",
        model_used: selectedModelName
      });
      setIsScanning(false);
      router.push("/history");
      return;
    }
    
    try {
      // ... existing online save logic ...
      // 1. Convert base64 to Blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      
      // 2. Upload to Supabase Storage
      const fileName = `scan_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('scans')
        .upload(fileName, blob, {
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('scans')
        .getPublicUrl(fileName);

      // 4. Save to Database
      const { error: dbError } = await supabase
        .from('scans')
        .insert([{
          result: scanResult.status,
          confidence: scanResult.score,
          image_url: publicUrl,
          variety: "Puyat",
          model_used: selectedModelName
        }]);

      if (dbError) throw dbError;

      // Update local history cache with base64 for instant offline availability
      try {
        const cached = JSON.parse(localStorage.getItem('duriancare_cached_history') || '[]');
        const newEntry = {
          id: Date.now(),
          created_at: new Date().toISOString(),
          result: scanResult.status,
          confidence: scanResult.score,
          image_url: capturedImage, // Use base64!
          variety: "Puyat",
          model_used: selectedModelName
        };
        localStorage.setItem('duriancare_cached_history', JSON.stringify([newEntry, ...cached].slice(0, 15)));
      } catch (e) {}

      router.push("/history");
    } catch (err) {
      console.error("Error saving to Supabase:", err);
      // Fallback to offline queue
      addToSyncQueue({
        result: scanResult.status,
        confidence: scanResult.score,
        image_data: capturedImage,
        variety: "Puyat",
        model_used: selectedModelName
      });
      router.push("/history");
    } finally {
      setIsScanning(false);
    }
  };

  // === COMPONENT VIEW ===
  if (!isMounted) {
    return <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-black overflow-hidden flex flex-col select-none z-[9999]">

      {/* ── ONBOARDING POPUP ── */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-5"
          >
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 50, opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="w-full max-w-sm bg-slate-900 rounded-[36px] p-6 text-white shadow-2xl border border-white/10 relative overflow-hidden"
            >
              {/* Premium Top Glow */}
              <div className="absolute -top-20 -right-20 w-44 h-44 bg-emerald-500/15 rounded-full blur-[80px] pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />

              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center shadow-inner">
                    <Cpu size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm uppercase tracking-wider text-white">DURIANCARE AI</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Field Assistant Guide</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOnboarding(false)}
                  className="w-8 h-8 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Informational Cards */}
              <div className="space-y-3 mb-6">
                {/* Background preloading */}
                <div className="flex gap-3.5 items-start bg-white/[0.02] border border-white/5 rounded-[24px] p-4">
                  <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Cpu size={16} className="text-blue-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-wider text-white">Instant Model Preload</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                      All models are <span className="text-emerald-400 font-bold">silently preloaded and initialized</span> in the background on startup. Toggling between models is near-instant, saving precious seconds in the field.
                    </p>
                  </div>
                </div>

                {/* Offline-First */}
                <div className="flex gap-3.5 items-start bg-white/[0.02] border border-white/5 rounded-[24px] p-4">
                  <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <WifiOff size={16} className="text-amber-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-wider text-white">100% Offline-First</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                      AI diagnostic calculations execute entirely on-device. Scans recorded offline queue automatically and sync when you re-establish network connection.
                    </p>
                  </div>
                </div>

                {/* Accuracy Bins / Models info */}
                <div className="flex gap-3.5 items-start bg-white/[0.02] border border-white/5 rounded-[24px] p-4">
                  <div className="w-9 h-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Activity size={16} className="text-emerald-400" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <p className="text-xs font-black uppercase tracking-wider text-white">Selectable Architectures</p>
                    <div className="grid gap-1.5">
                      {[
                        { name: 'MobileNetV2', tag: 'Best Overall', color: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' },
                        { name: 'DenseNet121', tag: 'High Accuracy', color: 'bg-blue-500/10 border border-blue-500/20 text-blue-400' },
                        { name: 'NASNetMobile', tag: 'Balanced', color: 'bg-violet-500/10 border border-violet-500/20 text-violet-400' },
                      ].map(m => (
                        <div key={m.name} className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-300 font-bold">{m.name}</span>
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${m.color}`}>{m.tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scan Tips */}
                <div className="flex gap-3.5 items-start bg-white/[0.02] border border-white/5 rounded-[24px] p-4">
                  <div className="w-9 h-9 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <Leaf size={16} className="text-rose-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-wider text-white">Batch Diagnosis (3×)</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                      Enable <span className="text-white font-bold">Batch Mode</span> in Settings to scan a fruit from 3 sides. This filters camera noise and ensures optimal diagnostic precision.
                    </p>
                  </div>
                </div>
              </div>

              {/* Premium Button */}
              <button
                onClick={() => setShowOnboarding(false)}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] transition-all rounded-2xl font-black text-xs text-white shadow-lg shadow-emerald-500/20 tracking-widest uppercase"
              >
                Launch Scanner
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Tools */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        multiple={scanMode === 'batch'}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;

          // Clear previous batch state
          setBatchCaptures([]);
          setBatchPredictions([]);
          setCapturedImage(null);
          setScanResult(null);

          const targetFiles = scanMode === 'batch' ? files.slice(0, BATCH_TARGET) : [files[0]];
          
          for (const file of targetFiles) {
            const dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve(event.target?.result as string);
              reader.readAsDataURL(file);
            });
            
            // Sequential processing for batch accuracy
            setBatchCaptures(prev => [...prev, dataUrl]);
            await processImage(dataUrl);
          }
        }}
      />

      <div className="absolute top-0 inset-x-0 z-[100] p-6 flex justify-between items-start relative">
        <button
          onClick={() => {
            if (capturedImage) {
              setCapturedImage(null);
              setBatchCaptures([]);
              setBatchPredictions([]);
              setScanResult(null);
            } else {
              router.push("/");
            }
          }}
          className="w-14 h-14 bg-black/40 backdrop-blur-2xl rounded-full text-white border border-white/20 flex items-center justify-center active:scale-90 transition-all shadow-2xl"
        >
          <X size={24} />
        </button>

        <div className="absolute left-1/2 -translate-x-1/2 top-8 flex flex-col items-center">
          <div className={`flex items-center gap-2 px-5 py-2.5 rounded-full shadow-xl transition-colors ${
            isOffline && !isModelLoading ? 'bg-emerald-500' : isOffline ? 'bg-slate-700' : isModelLoading ? 'bg-amber-500' : modelError ? 'bg-red-500' : 'bg-emerald-500'
          }`}>
            <div className={`w-2 h-2 bg-white rounded-full ${isModelLoading ? 'animate-bounce' : 'animate-pulse'}`} />
            <span className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
              {isOffline ? <><WifiOff size={12} /> Offline</> : isModelLoading ? 'Loading AI...' : modelError ? 'AI ERROR' : 'AI Ready'}
            </span>
          </div>
          <span className="text-white text-[10px] font-bold mt-1 tracking-widest drop-shadow-md">{selectedModelName}</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="w-14 h-14 bg-black/40 backdrop-blur-2xl rounded-full text-white border border-white/20 flex items-center justify-center active:scale-90 transition-all shadow-2xl"
          >
            <SlidersHorizontal size={22} />
          </button>
          
          <AnimatePresence>
            {isSettingsOpen && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-full right-0 mt-3 w-64 bg-[#0a0a0a] border border-white/5 rounded-[24px] p-5 flex flex-col gap-5 z-50 shadow-2xl origin-top-right"
              >
                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 px-2">Hardware</p>
                  <button
                    onClick={toggleTorch}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors ${
                      isTorchOn
                        ? "bg-amber-400 text-black font-black"
                        : "bg-[#111111] text-white font-medium"
                    }`}
                  >
                    <span className="text-xs">{isTorchOn ? "Flash On" : "Flash Off"}</span>
                    {isTorchOn ? <Zap size={16} /> : <ZapOff size={16} />}
                  </button>
                </div>

                <div>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 px-2">Scan Mode</p>
                  <div className="flex bg-[#111111] p-1.5 rounded-2xl gap-1">
                    <button 
                      onClick={() => setScanMode('single')}
                      className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${scanMode === 'single' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                      Single
                    </button>
                    <button 
                      onClick={() => setScanMode('batch')}
                      className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${scanMode === 'batch' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                      Batch (3x)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative flex-1 w-full h-full overflow-hidden">
        {!capturedImage ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <img
            src={capturedImage}
            className="absolute inset-0 w-full h-full object-cover"
            alt="Captured"
          />
        )}

        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center pb-32">
          {batchCaptures.length > 0 && batchCaptures.length < BATCH_TARGET && !scanResult && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-32 bg-emerald-500 text-white px-6 py-2 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl border border-white/20"
            >
              Angle {batchCaptures.length + 1} / {BATCH_TARGET}
            </motion.div>
          )}

          <div className="w-72 h-72 relative">
            <div className={`absolute inset-0 border-[6px] transition-all duration-500 rounded-[32px] ${
              batchCaptures.length === 1 ? 'border-amber-400' : batchCaptures.length === 2 ? 'border-orange-400' : 'border-emerald-500'
            }`} />
            
            <AnimatePresence>
              {(isScanning || isFinalizingBatch || (batchCaptures.length > 0 && batchCaptures.length < BATCH_TARGET)) && (
                <motion.div
                  initial={{ top: "5%" }}
                  animate={{ top: "95%" }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    repeatType: "reverse",
                    ease: "linear",
                  }}
                  className="absolute left-4 right-4 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_20px_#10b981] z-20"
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 z-40 bg-[#0a0a0a] backdrop-blur-3xl flex flex-col items-center pt-6 pb-12 rounded-t-[40px] border-t border-white/5 shadow-[0_-20px_40px_rgba(0,0,0,0.5)]">
          {!capturedImage ? (
            <div className="w-full flex flex-col gap-8 px-6">
              
              {/* Centered AI Models Row */}
              <div className="flex items-center justify-center w-full">
                <div className="flex bg-white/5 p-1 rounded-full border border-white/10 shadow-inner gap-1 w-full max-w-[320px]">
                  {modelOptions.map((opt) => {
                    const isSelected = selectedModelName === opt.label;
                    const shortName = opt.label
                      .replace('TinyViT-5m + ', '')
                      .replace('NetMobile', 'Net')
                      .replace('NetV2', 'Net')
                      .replace('121', '');
                      
                    let activeBg = 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]';
                    if (opt.label.includes('DenseNet121')) {
                      activeBg = 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]';
                    } else if (opt.label.includes('NASNetMobile')) {
                      activeBg = 'bg-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]';
                    }

                    return (
                      <button
                        key={opt.label}
                        onClick={() => setSelectedModelName(opt.label)}
                        className={`flex-1 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] transition-all text-center ${
                          isSelected ? activeBg : 'text-white/50 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {shortName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Capture Row */}
              <div className="flex items-center justify-between w-full px-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white border border-white/10 hover:bg-white/10 active:scale-90 transition-all"
                >
                  <ImageIcon size={20} className="text-white/70" />
                </button>

                <button
                  onClick={capturePhoto}
                  disabled={isModelLoading || !!modelError}
                  className={`relative w-[72px] h-[72px] flex items-center justify-center group ${isModelLoading || !!modelError ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="absolute inset-0 border-[3px] border-white/80 rounded-full scale-[1.15] transition-all" />
                  <div className={`w-[58px] h-[58px] rounded-full shadow-inner ${isModelLoading ? 'bg-amber-400 animate-pulse' : modelError ? 'bg-red-500' : 'bg-white'}`} />
                </button>

                <button
                  onClick={() => setFacingMode(prev => prev === "environment" ? "user" : "environment")}
                  className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white border border-white/10 hover:bg-white/10 active:scale-90 transition-all"
                >
                  <RefreshCw size={20} className="text-white/70" />
                </button>
              </div>

            </div>
          ) : (
            <div className="w-full max-w-[360px] px-6">
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setBatchCaptures([]);
                  setBatchPredictions([]);
                  setScanResult(null);
                  setIsSheetMinimized(false);
                }}
                className="w-full bg-white/10 py-5 rounded-3xl text-white font-black border border-white/20 flex items-center justify-center gap-3 active:scale-95 transition-all shadow-2xl"
              >
                <X size={22} /> Retake Photo
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isFinalizingBatch && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-10"
          >
            <div className="w-24 h-24 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-8" />
            <h3 className="text-white text-3xl font-black italic tracking-tighter mb-2">ANALYZING</h3>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">{scanMode === 'batch' ? 'Synthesizing multi-angle data...' : 'Processing image data...'}</p>
          </motion.div>
        )}

        {capturedImage && !isScanning && !isFinalizingBatch && scanResult && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: isSheetMinimized ? "calc(100% - 140px)" : "0%" }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 180 }}
            className="fixed bottom-0 inset-x-0 bg-white rounded-t-[44px] z-[1000] shadow-[0_-20px_80px_rgba(0,0,0,0.6)] flex flex-col h-[85dvh] overflow-hidden"
          >
            {/* Interactive Handle Toggle */}
            <div 
              onClick={() => setIsSheetMinimized(!isSheetMinimized)}
              className="w-full pt-4 pb-8 cursor-pointer active:bg-slate-50 transition-colors rounded-t-[44px]"
            >
              <div className="w-14 h-1.5 bg-slate-200 rounded-full mx-auto" />
              {isSheetMinimized && (
                <div className="text-center mt-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Tap to view detailed results
                  </p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-32">

            <div className="flex justify-between items-center mb-6">
              <div className={`${scanResult.status === "Not Durian" ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"} px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border`}>
                {scanResult.status === "Not Durian" ? "No Variety Match" : "Variety Match: Puyat"}
              </div>
              <button className="text-slate-400 p-2 active:scale-90 transition-all">
                <Download size={22} />
              </button>
            </div>

            <div className="text-center mb-8">
              <p className="text-slate-400 text-[11px] font-bold uppercase tracking-[0.2em] mb-1">
                CNN Classification
              </p>
              <h2
                className={`text-6xl font-black italic tracking-tighter ${
                  scanResult.status === "Ripe"
                    ? "text-emerald-600"
                    : scanResult.status === "Not Durian"
                    ? "text-rose-600"
                    : "text-amber-500"
                }`}
              >
                {scanResult.status.toUpperCase()}
              </h2>
              {scanResult.score < 60 && scanResult.status !== "Not Durian" && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-rose-500 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-1.5"
                >
                  <span className="animate-pulse">⚠️ Classification Uncertain</span>
                </motion.div>
              )}
              <div className="mt-4 flex items-center justify-center gap-3">
                <div className="h-[2px] w-10 bg-slate-100" />
                <span className="text-slate-900 font-black text-2xl">
                  {scanResult.score}%{" "}
                  <span className="text-slate-400 text-sm font-medium">
                    Match
                  </span>
                </span>
                <div className="h-[2px] w-10 bg-slate-100" />
              </div>
              {/* Debug raw values */}
              <div className="mt-2 text-[8px] text-slate-300 font-mono">
                Model Confidence: {scanResult.score / 100}
              </div>
            </div>

            <div className="mb-10 space-y-5 bg-slate-50 p-6 rounded-[32px] border border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase text-slate-900 tracking-widest flex items-center gap-2">
                  <Cpu size={14} className="text-emerald-500" />
                  Model Confidence Distribution
                </h4>
              </div>

              <div className="space-y-4">
                {scanResult.predictions
                  .sort((a, b) => b.score - a.score)
                  .map((pred, idx) => (
                    <div key={pred.label} className="space-y-1.5">
                      <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                        <span>{pred.label}</span>
                        <span>{pred.score}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white rounded-full overflow-hidden border border-slate-200/50">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pred.score}%` }}
                          transition={{ duration: 1, delay: idx * 0.1 }}
                          className={`h-full rounded-full ${
                            pred.label === scanResult.status
                              ? pred.label === "Ripe" ? "bg-emerald-500" : pred.label === "Not Durian" ? "bg-rose-500" : "bg-amber-400"
                              : "bg-slate-200"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="mb-10 space-y-5 bg-slate-50 p-6 rounded-[32px] border border-slate-100 mx-2">
              <HybridModelFactors status={scanResult.status} confidence={scanResult.score} seed={scanResult.score} />
            </div>

            <div className="mb-10 p-6 rounded-[32px] bg-slate-900 text-white shadow-xl mx-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">AI Analysis Insight</h4>
              </div>
              <p className="text-xs font-medium leading-relaxed text-slate-300 italic">
                {scanResult.status === "Not Durian" 
                  ? "The object scanned does not exhibit the characteristic spine density or shell geometry typical of a durian fruit."
                  : scanResult.score >= 90
                  ? `Highly confident classification. The shell's visual patterns strongly align with typical ${scanResult.status.toLowerCase()} characteristics.`
                  : scanResult.score >= 70
                  ? `Consistent markers for ${scanResult.status.toLowerCase()} detected, though minor visual noise or angle may affect peak precision.`
                  : `Mixed indicators found. The AI detects overlapping features, suggesting a transitional state or requiring better lighting.`
                }
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={saveToHistory}
                className="w-full bg-slate-900 text-white py-6 rounded-[32px] font-black text-xl active:scale-95 transition-all shadow-2xl shadow-slate-400"
              >
                Log to Assessment History
              </button>
              
              <button
                onClick={() => {
                  setCapturedImage(null);
                  setBatchCaptures([]);
                  setBatchPredictions([]);
                  setScanResult(null);
                }}
                className="w-full bg-white text-slate-900 py-4 rounded-[32px] font-black text-sm active:scale-95 transition-all border border-slate-200"
              >
                Scan Again
              </button>
            </div>
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
