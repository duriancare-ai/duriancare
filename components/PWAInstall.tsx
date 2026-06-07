"use client";

import { useEffect, useState } from "react";
import { Download, PlusCircle, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  variant?: "floating" | "button";
}

export default function PWAInstall({ variant = "button" }: Props) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log("PWA Install prompt captured");
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (isInstalled) return null;
  if (!deferredPrompt && variant === "floating") return null;

  if (variant === "floating") {
    return (
      <AnimatePresence>
        {deferredPrompt && (
          <motion.div 
            initial={{ scale: 0, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 50 }}
            className="fixed bottom-28 right-6 z-[150]"
          >
            <button 
              onClick={handleInstall}
              className="bg-emerald-500 text-white p-4 rounded-full shadow-2xl shadow-emerald-200 flex items-center gap-2 active:scale-90 transition-all border-4 border-white"
            >
              <Download size={20} />
              <span className="text-xs font-black uppercase tracking-tighter pr-2">Install App</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <div className="bg-emerald-50 border border-emerald-100 rounded-[32px] p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500 rounded-2xl text-white shadow-lg shadow-emerald-100">
          <Smartphone size={20} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Install Mobile App</p>
          <p className="text-[11px] text-emerald-600 font-medium">Native experience & offline use</p>
        </div>
      </div>
      <button 
        onClick={handleInstall}
        disabled={!deferredPrompt}
        className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase transition-all active:scale-95 ${
          deferredPrompt 
          ? "bg-slate-900 text-white shadow-xl shadow-slate-200" 
          : "bg-slate-200 text-slate-400 cursor-not-allowed"
        }`}
      >
        {deferredPrompt ? "Install" : "Installed"}
      </button>
    </div>
  );
}
