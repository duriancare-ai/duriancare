"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, History } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path;
  
  const isAssessPage = pathname === "/assess";

  return (
    <div className="relative w-full h-20 bg-white border-t border-gray-100 pb-safe shrink-0 z-50">
      
      <div className={`grid h-full mx-auto relative ${isAssessPage ? 'grid-cols-2' : 'grid-cols-3'}`}>
        
        <Link href="/" className={`inline-flex flex-col items-center justify-center group ${isActive('/') ? 'text-emerald-600' : 'text-slate-400'}`}>
          <Home className={`w-6 h-6 mb-1 transition-transform ${isActive('/') ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-black uppercase tracking-wider">Home</span>
        </Link>

        {!isAssessPage && (
          <div className="flex justify-center -mt-8">
            <Link href="/assess" className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200 bg-slate-900 text-white transition-all active:scale-90">
                <Camera className="w-7 h-7" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider mt-2 text-slate-400">Scan</span>
            </Link>
          </div>
        )}

        <Link href="/history" className={`inline-flex flex-col items-center justify-center group ${isActive('/history') ? 'text-emerald-600' : 'text-slate-400'}`}>
          <History className={`w-6 h-6 mb-1 transition-transform ${isActive('/history') ? 'scale-110' : ''}`} />
          <span className="text-[10px] font-black uppercase tracking-wider">History</span>
        </Link>

      </div>
    </div>
  );
}