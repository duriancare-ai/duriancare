"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ShieldCheck, Zap, ChevronRight, Leaf } from "lucide-react";

const slides = [
  {
    title: "Hybrid AI Engine",
    description: "Powered by Puyat-calibrated CNN and Vision Transformers to analyze durian structure with 98% accuracy.",
    icon: <Zap className="text-amber-400" size={40} />,
    color: "bg-amber-500",
  },
  {
    title: "Offline Intelligence",
    description: "Scan durians anywhere, even in remote orchards with no signal. Your results are processed entirely on-device.",
    icon: <Leaf className="text-emerald-400" size={40} />,
    color: "bg-emerald-500",
  },
  {
    title: "Secure Cloud Sync",
    description: "All your records are automatically synced to our secure cloud database the moment you get back online.",
    icon: <Zap className="text-blue-400" size={40} />,
    color: "bg-blue-500",
  },
  {
    title: "Training Feedback",
    description: "Help the AI improve by labeling inconsistent results. Your feedback directly trains the next generation of Puyat models.",
    icon: <ShieldCheck className="text-purple-400" size={40} />,
    color: "bg-purple-500",
  },
];

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [current, setCurrent] = useState(0);

  const next = () => {
    if (current === slides.length - 1) {
      localStorage.setItem("durian_onboarded", "true");
      onComplete();
    } else {
      setCurrent(current + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col justify-between p-8">
      {/* Background Glow */}
      <div className={`absolute top-0 left-0 w-full h-full opacity-20 transition-colors duration-700 ${slides[current].color} blur-[120px]`} />

      <div className="relative z-10 pt-20 flex flex-col items-center text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center"
          >
            <div className="w-24 h-24 rounded-[32px] bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center mb-8 shadow-2xl">
              {slides[current].icon}
            </div>
            <h2 className="text-3xl font-black text-white mb-4 tracking-tight">
              {slides[current].title}
            </h2>
            <p className="text-slate-400 leading-relaxed max-w-[280px]">
              {slides[current].description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 space-y-8">
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? 'w-8 bg-emerald-500' : 'w-2 bg-slate-700'}`} 
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full bg-white text-slate-900 h-16 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl"
        >
          {current === slides.length - 1 ? "Get Started" : "Continue"}
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}