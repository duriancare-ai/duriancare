"use client";

import { useEffect, useState } from "react";
import { 
  Calendar, Search, Trash2, X, Check, 
  ListChecks, Target, Cpu, ThermometerSun,
  Activity, Leaf, Wind, RefreshCw
} from "lucide-react";
import { syncOfflineScans, getSyncQueue } from "@/lib/sync";
import { motion, AnimatePresence } from "framer-motion";
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
  is_correct?: boolean;
  is_offline?: boolean;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<Assessment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<Assessment | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<(number | string)[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

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

  const handleSync = async () => {
    if (syncing || !navigator.onLine) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    setSyncing(true);
    await syncOfflineScans((msg) => setSyncStatus(msg));
    await loadData();
    setSyncing(false);
    setTimeout(() => setSyncStatus(""), 3000);
  };

  useEffect(() => {
    loadData();

    // Auto sync when back online
    const handleOnline = () => {
      console.log("App back online, starting sync...");
      handleSync();
    };

    window.addEventListener('online', handleOnline);
    
    // Initial sync check
    if (navigator.onLine && getSyncQueue().length > 0) {
      handleSync();
    }

    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const toggleSelection = (id: number | string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const deleteSingle = async (id: number | string) => {
    if (confirm("Permanently delete this assessment from the cloud?")) {
      // If it's a cloud ID (number)
      if (typeof id === 'number') {
        const { error } = await supabase
          .from('scans')
          .delete()
          .eq('id', id);

        if (error) {
          alert("Failed to delete record.");
          return;
        }
      } else {
        // If it's an offline ID (string), we should ideally remove it from the sync queue
        // For now, we'll just refresh, but in a real app you'd filter the localStorage queue.
        const queue = getSyncQueue();
        const filtered = queue.filter(q => q.id !== id);
        localStorage.setItem("durian_sync_queue", JSON.stringify(filtered));
      }
      
      loadData();
      setSelectedEntry(null);
    }
  };

  const deleteSelected = async () => {
    if (confirm(`Delete ${selectedIds.length} selected scans?`)) {
      const cloudIds = selectedIds.filter(id => typeof id === 'number') as number[];
      const offlineIds = selectedIds.filter(id => typeof id === 'string') as string[];

      if (cloudIds.length > 0) {
        const { error } = await supabase
          .from('scans')
          .delete()
          .in('id', cloudIds);
        
        if (error) alert("Failed to delete some cloud records.");
      }

      if (offlineIds.length > 0) {
        const queue = getSyncQueue();
        const filtered = queue.filter(q => !offlineIds.includes(q.id));
        localStorage.setItem("durian_sync_queue", JSON.stringify(filtered));
      }

      loadData();
      setSelectedIds([]);
      setIsSelectionMode(false);
    }
  };

  const toggleCorrectness = async (item: Assessment) => {
    const newValue = item.is_correct === false ? true : false;
    const { error } = await supabase
      .from('scans')
      .update({ is_correct: newValue })
      .eq('id', item.id);

    if (error) {
      alert("Failed to update status.");
      return;
    }
    
    loadData();
    setSelectedEntry({ ...item, is_correct: newValue });
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case "Ripe": return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "Unripe": return "bg-amber-50 text-amber-700 border-amber-100";
      case "Overripe": return "bg-rose-50 text-rose-700 border-rose-100";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const filteredHistory = history.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const dateStr = new Date(item.created_at).toLocaleDateString();
    return (
      item.result.toLowerCase().includes(searchLower) ||
      dateStr.toLowerCase().includes(searchLower) ||
      item.variety.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="bg-white min-h-screen pb-32 select-none">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
         <div className="px-6 py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search records..." 
              className="w-full pl-11 pr-11 py-3 bg-slate-100/50 border border-slate-200 rounded-2xl text-sm text-slate-900 focus:bg-white transition-all outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <h3 className="font-black text-slate-900 text-lg tracking-tight">
                {isSelectionMode ? `${selectedIds.length} Selected` : 'History'}
              </h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredHistory.length} Total Records</span>
            </div>
            
            <button 
              onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                isSelectionMode ? 'bg-slate-900 text-white' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}
            >
              {isSelectionMode ? <><X size={14}/> Cancel</> : <><ListChecks size={16}/> Edit</>}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* Sync Status Banner */}
        <AnimatePresence>
          {syncStatus && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-6 mb-6"
            >
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <RefreshCw size={18} className={syncing ? "animate-spin text-emerald-400" : "text-emerald-400"} />
                    {syncing && (
                      <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full"
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-widest">{syncStatus}</span>
                </div>
                {!syncing && (
                   <button onClick={() => setSyncStatus("")} className="p-1">
                     <X size={16} className="text-white/40" />
                   </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-6 space-y-4">
          {filteredHistory.length === 0 && (
            <div className="text-center py-20">
              <p className="text-slate-400 font-bold text-sm italic">No records found.</p>
            </div>
          )}
          {filteredHistory.map((item) => (
            <motion.div 
              layout
              key={item.id} 
              onClick={() => isSelectionMode ? toggleSelection(item.id) : setSelectedEntry(item)}
              className={`relative bg-white rounded-[28px] border p-4 transition-all active:scale-[0.98] ${
                selectedIds.includes(item.id) ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 shadow-sm'
              }`}
            >
              <div className="flex items-center gap-4">
                {isSelectionMode && (
                   <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedIds.includes(item.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                  }`}>
                    {selectedIds.includes(item.id) && <Check size={14} className="text-white" />}
                  </div>
                )}
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 shrink-0 border border-slate-50 relative">
                  <img src={item.image_url} alt="Scan" className="w-full h-full object-cover" />
                  {item.is_offline && (
                    <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                      <RefreshCw size={14} className="text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-black text-slate-900 text-sm truncate">
                      {item.result === "Not Durian" ? "Unknown" : item.variety}
                    </p>
                    {item.is_offline ? (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-400 border border-slate-200">
                        Syncing...
                      </span>
                    ) : (
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${getResultColor(item.result)}`}>
                        {item.result}
                      </span>
                    )}
                    {item.is_correct === false && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-500 text-white border-rose-500">
                        Mislabeled
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold mt-1">
                    <Calendar size={12} /> {new Date(item.created_at).toLocaleDateString()} • {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <div className="w-1 h-1 bg-slate-200 rounded-full mx-1" />
                    <span className="text-emerald-600 font-black">{item.confidence}% MATCH</span>
                  </div>
                  {item.model_used && (
                    <p className="text-[10px] font-bold text-slate-400 mt-1 italic">
                      {item.model_used.replace('TinyViT-5m + ', '')}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {isSelectionMode && selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-xs"
          >
            <button 
              onClick={deleteSelected}
              className="w-full bg-rose-500 text-white py-4 rounded-3xl font-black shadow-2xl shadow-rose-200 flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              <Trash2 size={20} />
              Delete {selectedIds.length} Record{selectedIds.length > 1 ? 's' : ''}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEntry && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md overflow-y-auto">
            <div className="min-h-screen flex flex-col p-6 max-w-lg mx-auto">
              
              <div className="flex justify-between items-center mb-6">
                <button onClick={() => setSelectedEntry(null)} className="p-3 bg-white/10 rounded-2xl text-white backdrop-blur-md active:scale-90 transition-all">
                  <X size={20} />
                </button>
                <div className="text-white text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Analysis Detail</p>
                  <p className="text-xs font-bold">{new Date(selectedEntry.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => deleteSingle(selectedEntry.id)} className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl border border-rose-500/30 active:scale-90 transition-all">
                  <Trash2 size={20} />
                </button>
              </div>

              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full aspect-square rounded-[40px] overflow-hidden border-2 border-white/20 shadow-2xl mb-6 relative">
                <img src={selectedEntry.image_url} className="w-full h-full object-cover" alt="Detail" />
                <div className="absolute bottom-4 left-4 right-4 bg-black/40 backdrop-blur-md border border-white/20 p-4 rounded-2xl">
                   <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-black text-white/60 uppercase">Predicted State</p>
                        <h2 className="text-2xl font-black text-white italic">{selectedEntry.result.toUpperCase()}</h2>
                        {selectedEntry.confidence < 60 && selectedEntry.result !== "Not Durian" && (
                          <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest animate-pulse mt-1">⚠️ Uncertain Match</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-white/60 uppercase">Confidence</p>
                        <p className="text-xl font-black text-emerald-400">{selectedEntry.confidence}%</p>
                      </div>
                   </div>
                </div>
              </motion.div>

              <div className="bg-white rounded-[36px] p-8 space-y-8 flex-1 shadow-2xl mb-10">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <Target className="text-emerald-500" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Classification</p>
                      <p className="text-xs font-bold text-slate-700">{selectedEntry.model_used || "CNN-ViT Hybrid"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <Cpu className="text-blue-500" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Object Path</p>
                      <p className="text-xs font-bold text-slate-700">{selectedEntry.result === "Not Durian" ? "N/A" : selectedEntry.variety}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-black uppercase text-slate-900 tracking-widest flex items-center gap-2">
                      <Activity size={14} className="text-emerald-500" />
                      Inference Factors
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Validated</span>
                  </div>

                  {/* The actual progress bars */}
                  <HybridModelFactors status={selectedEntry.result} confidence={selectedEntry.confidence} seed={selectedEntry.id} />
                </div>

                <div className="p-6 rounded-[28px] bg-slate-900 text-white shadow-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400">AI Analysis Insight</h4>
                  </div>
                  <p className="text-xs font-medium leading-relaxed text-slate-300">
                    {selectedEntry.result === "Not Durian" 
                      ? "The object scanned did not exhibit the characteristic spine density or shell geometry typical of a durian fruit."
                      : selectedEntry.confidence >= 90
                      ? `Highly confident classification. The shell's visual patterns strongly aligned with typical ${selectedEntry.result.toLowerCase()} characteristics.`
                      : selectedEntry.confidence >= 70
                      ? `Consistent markers for ${selectedEntry.result.toLowerCase()} were detected, though minor visual noise or capture angle may have affected peak precision.`
                      : `Mixed indicators were found. The AI detected overlapping features, suggesting a transitional state or suboptimal lighting during capture.`
                    }
                  </p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => toggleCorrectness(selectedEntry)} 
                    className={`flex-1 py-5 rounded-[24px] font-black text-lg transition-all active:scale-95 border-2 ${
                      selectedEntry.is_correct === false 
                        ? "bg-emerald-500 text-white border-emerald-500 shadow-xl shadow-emerald-200" 
                        : "bg-white text-rose-500 border-rose-100 shadow-sm"
                    }`}
                  >
                    {selectedEntry.is_correct === false ? "Mark as Correct" : "Mark as Wrong"}
                  </button>
                  <button 
                    onClick={() => setSelectedEntry(null)} 
                    className="flex-1 bg-slate-900 text-white py-5 rounded-[24px] font-black text-lg shadow-xl active:scale-95 transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}