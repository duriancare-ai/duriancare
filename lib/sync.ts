import { supabase } from "./supabase";

export interface QueuedScan {
  id: string;
  result: string;
  confidence: number;
  image_data: string; // Base64 data to be uploaded later
  variety: string;
  model_used: string;
}

const SYNC_QUEUE_KEY = "durian_sync_queue";

export const addToSyncQueue = (scan: Omit<QueuedScan, "id">) => {
  const queue = getSyncQueue();
  const newScan = { ...scan, id: Date.now().toString() };
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify([...queue, newScan]));
  return newScan;
};

export const getSyncQueue = (): QueuedScan[] => {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem(SYNC_QUEUE_KEY);
  return saved ? JSON.parse(saved) : [];
};

export const clearSyncQueue = () => {
  localStorage.removeItem(SYNC_QUEUE_KEY);
};

export const syncOfflineScans = async (onProgress?: (msg: string) => void) => {
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  onProgress?.(`Syncing ${queue.length} offline scans...`);
  
  const remaining: QueuedScan[] = [];

  for (const scan of queue) {
    try {
      // 1. Convert base64 to Blob
      const response = await fetch(scan.image_data);
      const blob = await response.blob();
      
      // 2. Upload to Supabase Storage
      const fileName = `scan_${Date.now()}_sync.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('scans')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('scans')
        .getPublicUrl(fileName);

      // 4. Save to Database
      const { error: dbError } = await supabase
        .from('scans')
        .insert([{
          result: scan.result,
          confidence: scan.confidence,
          image_url: publicUrl,
          variety: scan.variety,
          model_used: scan.model_used
        }]);

      if (dbError) throw dbError;
      
    } catch (err) {
      console.error("Failed to sync item:", scan.id, err);
      remaining.push(scan);
    }
  }

  if (remaining.length > 0) {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
    onProgress?.(`Sync failed for ${remaining.length} items. Will retry later.`);
  } else {
    clearSyncQueue();
    onProgress?.("All scans synced successfully!");
  }
};
