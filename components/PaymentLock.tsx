"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, AlertCircle, Phone, CreditCard } from "lucide-react";

import { RESTRICTION_DATE, SUPPORT_CONTACT, SYSTEM_ID } from "@/lib/constants";

export default function PaymentLock({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const checkLock = () => {
      const now = new Date();
      const deadline = new Date(RESTRICTION_DATE);
      
      if (now >= deadline) {
        setIsLocked(true);
      } else {
        setIsLocked(false);
      }
    };

    checkLock();
    const interval = setInterval(checkLock, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <AnimatePresence>
        {isLocked && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1000] bg-slate-900 flex items-center justify-center p-6 text-center select-none"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[40px] p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="w-20 h-20 bg-rose-100 rounded-3xl flex items-center justify-center text-rose-500 mx-auto mb-6">
                <Lock size={40} />
              </div>
              
              <h2 className="text-2xl font-black text-slate-900 mb-2 italic">Access Restricted</h2>
              <p className="text-slate-500 text-sm font-bold leading-relaxed mb-8">
                System access has been paused due to an outstanding balance. Please settle the remaining amount to continue using DurianCare.
              </p>

              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                  <CreditCard className="text-slate-400" size={18} />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Status</p>
                    <p className="text-xs font-bold text-rose-600">Payment Overdue</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                  <Phone className="text-emerald-500" size={18} />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Support Contact</p>
                    <p className="text-xs font-bold text-slate-700">{SUPPORT_CONTACT}</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <AlertCircle size={18} />
                Refresh System
              </button>
              
              <p className="mt-6 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                System ID: {SYSTEM_ID}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isLocked && children}
    </>
  );
}
