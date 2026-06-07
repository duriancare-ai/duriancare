"use client";

import { useEffect, useState } from "react";
import { syncOfflineScans } from "@/lib/sync";
import { motion, AnimatePresence } from "framer-motion";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineScans((msg) => {
        setSyncStatus(msg);
        if (msg === "All scans synced successfully!") {
          setTimeout(() => setSyncStatus(null), 3000);
        }
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    if (navigator.onLine) {
      syncOfflineScans((msg) => {
        setSyncStatus(msg);
        if (msg === "All scans synced successfully!") {
          setTimeout(() => setSyncStatus(null), 3000);
        }
      });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {syncStatus && (
          <motion.div 
            initial={{ y: -100 }} animate={{ y: 0 }} exit={{ y: -100 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-xs"
          >
            <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
              <RefreshCw className="animate-spin text-emerald-400" size={20} />
              <p className="text-xs font-black uppercase tracking-tight">{syncStatus}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
