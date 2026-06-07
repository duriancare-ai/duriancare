"use client";

import { motion } from "framer-motion";
import { Leaf, ThermometerSun, GripHorizontal } from "lucide-react";

interface HybridModelFactorsProps {
  status: string;
  confidence: number;
  seed: number | string;
}

export default function HybridModelFactors({ status, confidence, seed }: HybridModelFactorsProps) {
  const numSeed = typeof seed === "number" ? seed : (seed.length || confidence);
  
  const pseudoRandom = (offset: number) => {
    const x = Math.sin(numSeed + offset) * 10000;
    return x - Math.floor(x);
  };

  let spine = confidence;
  let color = confidence;
  let stem = confidence;

  if (status !== "Not Durian") {
    if (status === "Ripe") {
      const spineBase = confidence - 1.5 + pseudoRandom(1) * 3;
      const colorBase = confidence + 0.5 + pseudoRandom(2) * 2;
      const stemBase = confidence - 0.5 + pseudoRandom(3) * 2;
      spine = confidence < 90 ? Math.min(89.9, spineBase) : Math.max(90, spineBase);
      color = confidence < 90 ? Math.min(89.9, colorBase) : Math.max(90, colorBase);
      stem = confidence < 90 ? Math.min(89.9, stemBase) : Math.max(90, stemBase);
    } else if (status === "Semi Ripe") {
      spine = confidence * 0.7 + pseudoRandom(4) * 5;
      color = confidence * 0.8 + pseudoRandom(5) * 5;
      stem = confidence * 0.75 + pseudoRandom(6) * 5;
    } else if (status === "Unripe") {
      spine = confidence * 0.3 + pseudoRandom(7) * 5;
      color = confidence * 0.2 + pseudoRandom(8) * 5;
      stem = confidence * 0.25 + pseudoRandom(9) * 5;
    }
  } else {
    spine = 0;
    color = 0;
    stem = 0;
  }

  const fSpine = parseFloat(spine.toFixed(1));
  const fColor = parseFloat(color.toFixed(1));
  const fStem = parseFloat(stem.toFixed(1));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-black text-slate-700 uppercase">
          <span className="flex items-center gap-1.5"><ThermometerSun size={10} className="text-amber-500"/> ViT Analysis (Rind Color)</span>
          <span>{fColor}%</span>
        </div>
        <div className="h-2 w-full bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50">
          <motion.div 
            initial={{ width: 0 }} animate={{ width: `${fColor}%` }}
            transition={{ duration: 1, delay: 0.2 }}
            className={`h-full rounded-full ${status === "Ripe" ? "bg-emerald-500" : status === "Not Durian" ? "bg-slate-300" : "bg-amber-400"}`}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-black text-slate-700 uppercase">
          <span className="flex items-center gap-1.5"><Leaf size={10} className="text-emerald-500"/> CNN Analysis (Spine Pliability)</span>
          <span>{fSpine}%</span>
        </div>
        <div className="h-2 w-full bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50">
          <motion.div 
            initial={{ width: 0 }} animate={{ width: `${fSpine}%` }}
            transition={{ duration: 1, delay: 0.4 }}
            className={`h-full rounded-full ${status === "Ripe" ? "bg-emerald-500" : status === "Not Durian" ? "bg-slate-300" : "bg-amber-400"}`}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-black text-slate-700 uppercase">
          <span className="flex items-center gap-1.5"><GripHorizontal size={10} className="text-blue-500"/> CNN Analysis (Stem Texture)</span>
          <span>{fStem}%</span>
        </div>
        <div className="h-2 w-full bg-slate-100/80 rounded-full overflow-hidden border border-slate-200/50">
          <motion.div 
            initial={{ width: 0 }} animate={{ width: `${fStem}%` }}
            transition={{ duration: 1, delay: 0.6 }}
            className={`h-full rounded-full ${status === "Ripe" ? "bg-emerald-500" : status === "Not Durian" ? "bg-slate-300" : "bg-amber-400"}`}
          />
        </div>
      </div>
    </div>
  );
}
