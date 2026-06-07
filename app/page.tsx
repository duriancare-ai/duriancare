"use client";

import { useEffect, useState } from "react";
import { Camera, History, Leaf, ChevronRight, Image as ImageIcon, Info, X, Target, Cpu, ThermometerSun, Calendar, RefreshCw } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Onboarding from "../components/Onboarding";
import PWAInstall from "@/components/PWAInstall";
import { getSyncQueue } from "@/lib/sync";
import HybridModelFactors from "@/components/HybridModelFactors";

import { supabase } from "@/lib/supabase";

interface Assessment {
  id: number | string;
  created_at: string;
  result: string;
  confidence: number;
  image_url: string;
  variety: string;
  model_used?: string;
  is_offline?: boolean;
}

export default function Home() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [history, setHistory] = useState<Assessment[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Assessment | null>(null);

  useEffect(() => {
    const hasOnboarded = localStorage.getItem("durian_onboarded");
    setShowOnboarding(!hasOnboarded);

    const loadData = async () => {
      let cloudData = [];
      
      // 1. Immediate Cache Load (Cache-First)
      const cached = localStorage.getItem('duriancare_cached_history');
      if (cached) {
        try {
          cloudData = JSON.parse(cached);
          const queue = getSyncQueue();
          const queuedItems: Assessment[] = queue.map(q => ({
            id: q.id,
            created_at: new Date(parseInt(q.id)).toISOString(),
            result: q.result,
            confidence: q.confidence,
            image_url: q.image_data,
            variety: q.variety,
            model_used: q.model_used,
            is_offline: true
          }));
          setHistory([...queuedItems, ...cloudData] as Assessment[]);
        } catch(e) {}
      }

      // 2. Background Cloud Sync (if online)
      if (navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from('scans')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;
          cloudData = data || [];

          const queue = getSyncQueue();
          const queuedItems: Assessment[] = queue.map(q => ({
            id: q.id,
            created_at: new Date(parseInt(q.id)).toISOString(),
            result: q.result,
            confidence: q.confidence,
            image_url: q.image_data,
            variety: q.variety,
            model_used: q.model_used,
            is_offline: true
          }));
          setHistory([...queuedItems, ...cloudData] as Assessment[]);

          if (cloudData.length > 0) {
            const top15 = cloudData.slice(0, 15);
            localStorage.setItem('duriancare_cached_history', JSON.stringify(top15));
            
            (async () => {
              try {
                const base64Items = await Promise.all(top15.map(async (item) => {
                  if (typeof item.image_url === 'string' && item.image_url.startsWith('http')) {
                    try {
                      const imgRes = await fetch(item.image_url);
                      const blob = await imgRes.blob();
                      const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                      });
                      return { ...item, image_url: base64 };
                    } catch (e) { return item; }
                  }
                  return item;
                }));
                localStorage.setItem('duriancare_cached_history', JSON.stringify(base64Items));
              } catch (err) {}
            })();
          }
        } catch (err) {}
      }
    };

    loadData();
    window.addEventListener('focus', loadData);

    // === BACKGROUND FULL MODEL INITIALIZATION ===
    // Fully loads all 3 TFLite models (WASM init + binary parse) into the module-level
    // modelStore singleton. Since Next.js client-side routing never reloads modules,
    // the assess page finds all models already in the store and opens INSTANTLY.
    const initModels = async () => {
      try {
        const { modelStore } = await import("@/lib/modelStore");
        const tflite = await import("@tensorflow/tfjs-tflite");
        tflite.setWasmPath('/tflite/');

        const HF = 'https://huggingface.co/CodingWithBars/durian-care-pwa/resolve/main';
        const modelList = [
          { label: "TinyViT-5m + MobileNetV2",   file: `${HF}/durian_mobilenetv2_tinyvit.tflite` },
          { label: "TinyViT-5m + DenseNet121",   file: `${HF}/durian_densenet121_tinyvit_test2.tflite` },
          { label: "TinyViT-5m + NASNetMobile",  file: `${HF}/durian_nasnetmobile_tinyvit_test5.tflite` },
        ];
        const CACHE_NAME = 'duriancare-models-v1';

        for (const { label, file } of modelList) {
          // Skip if already loaded or currently being loaded by another effect
          if (modelStore.has(label) || modelStore.isLoading(label)) {
            console.log(`[Model Preload] Already ready/loading: ${label}`);
            continue;
          }

          modelStore.markLoading(label);
          console.log(`[Model Preload] Initializing: ${label}`);

          try {
            // Serve from Cache API (fast), or fetch + cache for next time
            let modelBuffer: ArrayBuffer | null = null;
            try {
              const cache = await caches.open(CACHE_NAME);
              const cachedResp = await cache.match(file);
              if (cachedResp) {
                console.log(`[Model Preload] Cache API HIT: ${label}`);
                modelBuffer = await cachedResp.arrayBuffer();
              } else {
                console.log(`[Model Preload] Fetching from network: ${label}`);
                const netResp = await fetch(file);
                if (netResp.ok) {
                  await cache.put(file, netResp.clone());
                  modelBuffer = await netResp.arrayBuffer();
                }
              }
            } catch (cacheErr) {
              console.warn('[Model Preload] Cache API unavailable, using URL directly');
            }

            // Full TFLite engine initialization
            const loadedModel = modelBuffer
              ? await tflite.loadTFLiteModel(modelBuffer, { numThreads: 1 })
              : await tflite.loadTFLiteModel(file, { numThreads: 1 });

            if (!loadedModel || (loadedModel as any)._model === null) {
              throw new Error('WASM engine returned null model');
            }

            modelStore.set(label, loadedModel);
            console.log(`[Model Preload] ✓ READY: ${label} (store size: ${modelStore.size()})`);
          } catch (err) {
            console.warn(`[Model Preload] Failed for ${label}:`, err);
          } finally {
            modelStore.unmarkLoading(label);
          }
        }
      } catch (err) {
        console.warn('[Model Preload] Init failed (offline or WASM error):', err);
      }
    };

    // Start after 1.5s — UI and Supabase data loads first, then models in background
    const modelTimer = setTimeout(initModels, 1500);

    return () => {
      window.removeEventListener('focus', loadData);
      clearTimeout(modelTimer);
    };
  }, []);

  if (showOnboarding === null) return null;

  return (
    <>
      <AnimatePresence mode="wait">
        {showOnboarding && (
          <motion.div 
            key="onboarding-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed inset-0 z-[200]"
          >
            <Onboarding onComplete={() => setShowOnboarding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white min-h-screen pb-24"
      >
        <div className="p-6 space-y-8">
          
          <section className="relative overflow-hidden bg-slate-900 rounded-[40px] p-8 text-white shadow-2xl shadow-emerald-900/20 border border-white/5">
            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px]" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px]" />
            
            <div className="relative z-10 w-full">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full mb-6">
                <Target size={12} className="text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Puyat AI v1.0</span>
              </div>

              <h2 className="text-4xl font-black mb-3 tracking-tighter leading-none italic">
                SMART <span className="text-emerald-400">DURIAN</span> EXPERT
              </h2>
              
              <p className="text-slate-400 text-sm mb-10 max-w-[240px] leading-relaxed font-medium">
                Professional-grade ripeness detection powered by <span className="text-white font-bold underline decoration-emerald-500/50">Hybrid CNN-ViT</span> architecture.
              </p>

              <div className="flex flex-col gap-3">
                <Link 
                  href="/assess"
                  className="flex w-full bg-emerald-500 text-white px-7 py-5 rounded-[24px] font-black items-center justify-center gap-3 active:scale-[0.95] transition-all shadow-[0_20px_40px_rgba(16,185,129,0.3)] hover:bg-emerald-400"
                >
                  <Camera size={22} strokeWidth={3} />
                  Identify Ripeness
                </Link>
                
                <div className="flex items-center justify-center gap-4 py-2">
                  <div className="flex items-center gap-1.5 opacity-60">
                    <Cpu size={12} />
                    <span className="text-[9px] font-bold uppercase tracking-tighter">On-Device AI</span>
                  </div>
                  <div className="w-1 h-1 bg-slate-700 rounded-full" />
                  <div className="flex items-center gap-1.5 opacity-60">
                    <Target size={12} />
                    <span className="text-[9px] font-bold uppercase tracking-tighter">98% Precision</span>
                  </div>
                </div>
              </div>
            </div>
            <Leaf className="absolute -top-4 -right-4 text-white/5 -rotate-12" size={140} />
          </section>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-5 rounded-[28px] border border-slate-100 shadow-sm">
              <div className="w-12 h-12 bg-blue-100/50 rounded-2xl flex items-center justify-center mb-4 text-blue-600">
                <History size={24} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Total Scans</p>
              <p className="text-3xl font-black text-slate-900">{history.length}</p>
            </div>
            
            <div className="bg-slate-50 p-5 rounded-[28px] border border-slate-100 shadow-sm">
              <div className="w-12 h-12 bg-orange-100/50 rounded-2xl flex items-center justify-center mb-4 text-orange-600">
                <Leaf size={24} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">Variety</p>
              <p className="text-3xl font-black text-slate-900">Puyat</p>
            </div>
          </div>

          <section className="flex flex-col">
            <div className="flex justify-between items-center mb-5 px-2">
              <h3 className="font-black text-slate-900 text-lg tracking-tight">Recent Scans</h3>
              <Link href="/history" className="text-emerald-600 text-xs font-black uppercase tracking-widest">
                View All
              </Link>
            </div>
            
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="bg-slate-50 p-10 rounded-[32px] border border-dashed border-slate-200 text-center">
                  <ImageIcon className="text-slate-300 mx-auto mb-4" size={28} />
                  <p className="text-sm font-bold text-slate-400">No recent scans found</p>
                  <p className="text-[10px] text-slate-300 mt-1 uppercase tracking-tighter">AI results will appear here</p>
                </div>
              ) : (
                history.slice(0, 3).map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => setSelectedEntry(item)}
                    className="group flex items-center gap-4 bg-slate-50/50 p-4 rounded-[30px] border border-slate-100/80 active:scale-[0.97] transition-all cursor-pointer hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 hover:border-emerald-200"
                  >
                    <div className="w-16 h-16 bg-white rounded-[20px] overflow-hidden flex-shrink-0 border border-slate-100 shadow-sm group-hover:border-emerald-100 transition-colors relative">
                      <img src={item.image_url} className="w-full h-full object-cover" alt="Scan" />
                      {item.is_offline && (
                        <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center">
                          <RefreshCw className="text-white animate-spin" size={12} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 text-sm truncate leading-tight mb-0.5 group-hover:text-emerald-700 transition-colors">
                        {item.is_offline ? "Syncing..." : `Batch #${item.id.toString().slice(-4)}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400">
                          {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="w-1 h-1 bg-slate-200 rounded-full" />
                        <span className="text-[10px] font-black text-emerald-600 tracking-tight">{item.confidence}% MATCH</span>
                      </div>
                      {item.model_used && (
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate italic">
                          {item.model_used.replace('TinyViT-5m + ', '')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider ${
                        item.result === 'Ripe' ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' : 
                        item.result === 'Overripe' ? 'bg-rose-500 text-white border-rose-600 shadow-lg shadow-rose-500/20' :
                        'bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-500/20'
                      }`}>
                        {item.result}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="bg-slate-900 rounded-[32px] p-6 text-white flex items-center gap-5">
            <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shrink-0">
              <Info className="text-white" size={28} />
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
              Thorn texture is the primary indicator for <span className="text-emerald-400 font-bold">PUYAT</span> ripeness.
            </p>
          </section>
        </div>

        <AnimatePresence>
          {selectedEntry && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md overflow-y-auto"
            >
              <div className="min-h-screen flex flex-col p-6">
                <div className="flex justify-between items-center mb-6">
                  <button onClick={() => setSelectedEntry(null)} className="p-3 bg-white/10 rounded-2xl text-white backdrop-blur-md">
                    <X size={20} />
                  </button>
                  <p className="text-white/50 text-xs font-mono font-bold uppercase tracking-widest">Analysis Report</p>
                </div>

                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full aspect-square rounded-[40px] overflow-hidden border-2 border-white/20 shadow-2xl mb-8">
                  <img src={selectedEntry.image_url} className="w-full h-full object-cover" alt="Detail" />
                </motion.div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2 text-emerald-400">
                      <Target size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Confidence</span>
                    </div>
                    <p className="text-2xl font-black text-white">{selectedEntry.confidence}%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                      <Cpu size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">AI Model</span>
                    </div>
                    <p className="text-xs font-black text-white uppercase truncate">{selectedEntry.model_used?.replace('TinyViT-5m + ', '') || "Hybrid"}</p>
                  </div>
                </div>

                <div className="bg-white rounded-[32px] p-8 space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 mb-1">{selectedEntry.result}</h2>
                    <p className="text-slate-500 font-bold text-sm">Variety: <span className="text-emerald-600">{selectedEntry.result === "Not Durian" ? "Unknown Object" : selectedEntry.variety}</span></p>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-50 pb-2">Hybrid Model Factors</h4>
                    <HybridModelFactors status={selectedEntry.result} confidence={selectedEntry.confidence} seed={selectedEntry.id} />
                  </div>

                  <div className="h-px bg-slate-100 w-full" />
                  
                  <div className="pt-2 grid grid-cols-2 gap-y-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="text-slate-300" size={18} />
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Scanned On</p>
                        <p className="text-xs font-bold text-slate-700">{new Date(selectedEntry.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <ThermometerSun className="text-slate-300" size={18} />
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Ambience</p>
                        <p className="text-xs font-bold text-slate-700">Optimal</p>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedEntry(null)}
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black mt-4 shadow-xl active:scale-95 transition-all"
                  >
                    Close Analysis
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <PWAInstall variant="floating" />
      </motion.div>
    </>
  );
}