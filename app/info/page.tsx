"use client";

import { useState, useEffect } from "react";
import { Cpu, Settings, Trash2, ShieldCheck, Info, Leaf, X, Wifi, WifiOff, Brain, Layers, Zap, Camera, Database, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PWAInstall from "@/components/PWAInstall";
import { RESTRICTION_DATE, SUPPORT_CONTACT, SYSTEM_ID } from "@/lib/constants";

function CountdownDisplay({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(targetDate).getTime() - now;

      if (distance < 0) {
        clearInterval(timer);
        return;
      }

      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        { label: "Days", value: timeLeft.days },
        { label: "Hrs", value: timeLeft.hours },
        { label: "Min", value: timeLeft.minutes },
        { label: "Sec", value: timeLeft.seconds },
      ].map((item) => (
        <div key={item.label} className="flex flex-col items-center">
          <span className="text-lg font-black tabular-nums">{item.value.toString().padStart(2, '0')}</span>
          <span className="text-[7px] font-black uppercase text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function InfoPage() {
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleResetApp = () => {
    if (confirm("This will delete all your scan history. Continue?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const features = [
    {
      icon: <Camera size={16} className="text-emerald-600" />,
      bg: "bg-emerald-100",
      title: "Live Camera Scan",
      desc: "Real-time AI classification using the device camera with auto-focus and torch support.",
    },
    {
      icon: <Layers size={16} className="text-blue-600" />,
      bg: "bg-blue-100",
      title: "Multi-Angle Batch Mode",
      desc: "Captures 3 angles of the durian and averages predictions for improved accuracy.",
    },
    {
      icon: <Database size={16} className="text-violet-600" />,
      bg: "bg-violet-100",
      title: "Offline Scan History",
      desc: "Last 15 scan records are cached locally. Results sync to the cloud when online.",
    },
    {
      icon: <RefreshCw size={16} className="text-amber-600" />,
      bg: "bg-amber-100",
      title: "Background Sync",
      desc: "Scans taken offline are queued and automatically uploaded once connectivity is restored.",
    },
    {
      icon: <Brain size={16} className="text-rose-600" />,
      bg: "bg-rose-100",
      title: "3 Selectable AI Models",
      desc: "Switch between MobileNetV2, DenseNet121, and NASNetMobile hybrid models in Settings.",
    },
    {
      icon: <Zap size={16} className="text-orange-600" />,
      bg: "bg-orange-100",
      title: "On-Device Inference",
      desc: "All AI inference runs in the browser via TFLite WASM — no server round-trip required.",
    },
  ];

  const models = [
    {
      name: "MobileNetV2",
      badge: "Default · Best Overall",
      badgeColor: "bg-emerald-100 text-emerald-700",
      color: "bg-emerald-600",
      cnnRole: "Uses depthwise separable convolutions to extract lightweight spatial features — ideal for real-time mobile inference.",
      vitRole: "TinyViT-5m adds multi-head self-attention to correlate global skin texture and ripeness gradients across the image.",
      file: "durian_mobilenetv2_tinyvit.tflite",
    },
    {
      name: "DenseNet121",
      badge: "High Accuracy",
      badgeColor: "bg-blue-100 text-blue-700",
      color: "bg-blue-600",
      cnnRole: "Dense block connections reuse all prior feature maps, enabling the model to detect fine-grained thorn and color cues.",
      vitRole: "TinyViT-5m attends to the full fruit silhouette, combining dense local features with long-range spatial context.",
      file: "durian_densenet121_tinyvit_test2.tflite",
    },
    {
      name: "NASNetMobile",
      badge: "Balanced",
      badgeColor: "bg-violet-100 text-violet-700",
      color: "bg-violet-600",
      cnnRole: "Neural Architecture Search-optimized cells discover the most efficient convolutional patterns for visual recognition.",
      vitRole: "TinyViT-5m enriches NASNet's compact features with attention-based global context for holistic ripeness assessment.",
      file: "durian_nasnetmobile_tinyvit_test5.tflite",
    },
  ];

  return (
    <div className="flex flex-col gap-8 p-6 bg-white">
      
      {/* ── Header ── */}
      <section className="space-y-3">
        <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 shadow-sm shadow-emerald-100">
          <Info size={24} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">System Information</h2>
        <p className="text-slate-600 leading-relaxed text-sm">
          DurianCare is a specialized mobile assessment tool designed specifically for the
          <span className="font-bold text-emerald-600"> Puyat Durian</span> variety in the Davao Region.
        </p>

        {/* Live Status Pill */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest mt-1 ${isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {isOnline ? <><Wifi size={11} /> Online — Cloud Sync Active</> : <><WifiOff size={11} /> Offline — Local Mode</>}
        </div>
      </section>

      {/* ── Key Features ── */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
          <Zap size={14} />
          Key Features
        </h3>

        <div className="grid grid-cols-1 gap-3">
          {features.map((f) => (
            <div key={f.title} className="flex items-start gap-4 bg-slate-50 rounded-[20px] p-4 border border-slate-100">
              <div className={`p-2 ${f.bg} rounded-xl shrink-0`}>
                {f.icon}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{f.title}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── App Preferences ── */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
          <Settings size={14} />
          App Preferences
        </h3>
        
        <PWAInstall variant="button" />

        <div className="bg-slate-50 rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
          <button 
            onClick={handleResetApp}
            className="w-full flex items-center gap-4 p-5 text-rose-500 active:bg-rose-50 transition-all"
          >
            <div className="p-2.5 bg-white rounded-2xl border border-rose-100 text-rose-500 shadow-sm">
              <Trash2 size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">Factory Reset</p>
              <p className="text-[11px] opacity-70 font-medium">Wipe all local records</p>
            </div>
          </button>
        </div>
      </section>

      {/* ── Model Architecture ── */}
      <section className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
          <Cpu size={14} />
          Model Architecture
        </h3>

        {/* Hybrid Concept Banner */}
        <div className="bg-slate-900 rounded-[28px] p-5 text-white space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Brain size={16} className="text-emerald-400" />
            <p className="text-xs font-black uppercase tracking-widest text-emerald-400">Hybrid CNN + ViT Design</p>
          </div>
          <p className="text-[12px] text-slate-300 leading-relaxed">
            Each model fuses a <span className="text-white font-bold">CNN backbone</span> for extracting local texture and thorn-density features 
            with a <span className="text-white font-bold">TinyViT-5m transformer</span> for long-range global context — giving the best of both spatial precision and semantic understanding.
          </p>
          {/* Architecture Flow */}
          <div className="flex items-center gap-1.5 pt-1 flex-wrap">
            {["Image Input", "→", "CNN Backbone", "→", "TinyViT-5m", "→", "Classifier Head", "→", "Ripeness Label"].map((step, i) => (
              <span
                key={i}
                className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                  step === "→"
                    ? "text-slate-500 px-0"
                    : i === 4
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : i === 2
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : i === 8
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-white/10 text-slate-400"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>

        {/* TinyViT-5m role */}
        <div className="flex gap-4 bg-blue-50 rounded-[24px] p-4 border border-blue-100">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-[9px] shrink-0 shadow-lg shadow-blue-100 leading-tight text-center">
            Tiny<br/>ViT
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold text-slate-900">TinyViT-5m — Shared Transformer</p>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              A lightweight 5-million parameter Vision Transformer used across all three hybrid models. It applies multi-head self-attention 
              to establish global spatial relationships — understanding ripeness at the whole-fruit level rather than patch-by-patch.
            </p>
          </div>
        </div>

        {/* Per-model cards */}
        <div className="space-y-3">
          {models.map((m) => (
            <div key={m.name} className="bg-slate-50 rounded-[24px] p-4 border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${m.color} rounded-xl flex items-center justify-center font-black text-white text-[8px] shrink-0 shadow-md leading-tight text-center`}>
                    CNN
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{m.name}</p>
                    <p className="text-[9px] font-mono text-slate-400 mt-0.5">{m.file}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${m.badgeColor}`}>
                  {m.badge}
                </span>
              </div>

              <div className="h-px bg-slate-200" />

              <div className="space-y-2 text-[11px] text-slate-500 leading-relaxed">
                <div className="flex gap-2">
                  <span className="font-black text-emerald-600 shrink-0 w-10">CNN</span>
                  <span>{m.cnnRole}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-black text-blue-600 shrink-0 w-10">ViT</span>
                  <span>{m.vitRole}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Offline First Banner ── */}
      <section className="bg-emerald-50 border border-emerald-100 rounded-[32px] p-6 text-emerald-800">
        <div className="flex items-center gap-3 mb-2">
          <Leaf size={18} className="text-emerald-600" />
          <p className="font-bold text-sm">Offline First Architecture</p>
        </div>
        <p className="text-emerald-700/70 text-xs leading-relaxed">
          To protect farmer data and ensure speed in remote Davao orchards, all AI inference happens locally on-device via TFLite WASM.
          Your privacy is our priority — no images are sent to any server during scanning.
        </p>
      </section>

      {/* Hidden License Modal (kept for internal use) */}
      <AnimatePresence>
        {showLicenseModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setShowLicenseModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 w-full max-w-sm rounded-[32px] p-6 text-white shadow-xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowLicenseModal(false)}
                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <ShieldCheck size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">System Active</p>
                    <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">ID: {SYSTEM_ID}</p>
                  </div>
                </div>

                <div className="h-px bg-white/10 w-full" />

                <div className="hidden bg-white/5 rounded-2xl p-4 border border-white/5 mt-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 text-center">Remaining Access Time</p>
                  <CountdownDisplay targetDate={RESTRICTION_DATE} />
                </div>

                <div className="pt-2">
                  <p className="text-slate-400 text-[10px] leading-relaxed italic text-center">
                    For renewals or balance inquiries, please contact: <span className="text-white font-bold">{SUPPORT_CONTACT}</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="pt-8 pb-4">
        <p className="text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">
          Durian Care • v1.0
        </p>
      </footer>
    </div>
  );
}