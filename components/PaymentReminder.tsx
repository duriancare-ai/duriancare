"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, CreditCard } from "lucide-react";
import { RESTRICTION_DATE, REMINDER_START_DAYS } from "@/lib/constants";

export default function PaymentReminder() {
  const [showReminder, setShowReminder] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    const checkReminder = () => {
      const now = new Date();
      const deadline = new Date(RESTRICTION_DATE);
      const diffTime = deadline.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      setDaysLeft(diffDays);

      // 1. Check if we are past 8:00 AM today
      const currentHour = now.getHours();
      const isPastEightAM = currentHour >= 8;

      // 2. Show reminder if we are past 8 AM today, OR within the 7-day window
      if (isPastEightAM || diffDays <= REMINDER_START_DAYS) {
        if (diffDays > 0) {
          // Use a daily key to ensure it can be dismissed but comes back the next day
          const todayKey = `reminder_closed_${now.toDateString()}`;
          const isClosedToday = localStorage.getItem(todayKey);
          
          if (!isClosedToday) {
            setShowReminder(true);
          }
        }
      }
    };

    checkReminder();
  }, []);

  const handleClose = () => {
    setShowReminder(false);
    const todayKey = `reminder_closed_${new Date().toDateString()}`;
    localStorage.setItem(todayKey, "true");
  };

  return (
    <AnimatePresence>
      {showReminder && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] w-[90%] max-w-sm"
        >
          <div className="bg-amber-600 text-white p-4 rounded-[24px] shadow-2xl flex items-center gap-4 relative border border-amber-500/50">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
              <AlertTriangle size={24} />
            </div>
            
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Payment Reminder</p>
              <p className="text-sm font-black leading-tight">
                License expires in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}. 
                <span className="block text-[11px] font-bold opacity-90 mt-0.5">Please settle your balance soon.</span>
              </p>
            </div>

            <button 
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
