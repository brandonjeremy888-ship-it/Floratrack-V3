import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Leaf, Sprout, MapPin, Search, Plus, TrendingUp, Map, LayoutDashboard, ListTree, CircleCheck as CheckCircle2, CircleAlert as AlertCircle, X, Truck, RefreshCw, Thermometer, Droplets, Sun, Wind, FlaskConical, CloudRain, Printer, Camera, ScanLine, GitBranch, TriangleAlert as AlertTriangle, Loader as Loader2, LogOut, UserPlus } from 'lucide-react';
import {
  supabase,
  type Batch,
  type BatchRow,
  type Treatment,
  type Outplanting,
  type Flag,
} from './lib/supabase';
import { useAuth } from './lib/useAuth';
import { Html5Qrcode } from 'html5-qrcode';
import SignIn from './components/SignIn';
import AdminPanel from './components/AdminPanel';

const STATUS_COLORS = {
  'Collected/Stored': 'bg-stone-100 text-stone-800 border-stone-300',
  'Propagating': 'bg-sky-100 text-sky-800 border-sky-300',
  'Growing': 'bg-amber-100 text-amber-800 border-amber-300',
  'Ready': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Outplanted': 'bg-purple-100 text-purple-800 border-purple-300',
  'Failed': 'bg-red-100 text-red-800 border-red-300'
};

const generateSemanticId = (dateStr: string, species: string, source: string) => {
  const yyyyMm = dateStr.substring(0, 7);
  const words = species.split(' ');
  const spCode = words.length > 1
    ? (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase()
    : species.substring(0, 4).toUpperCase();
  const srcCode = source.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
  return `${yyyyMm}-${spCode}-${srcCode}`;
};

const todayIso = () => new Date().toISOString().split('T')[0];

// Hydrate a flat batch row + child rows into the shape the UI expects.
const hydrate = (
  row: BatchRow,
  treatments: Treatment[],
  outplantings: Outplanting[],
  flags: Flag[]
): Batch => ({
  ...row,
  treatments,
  outplantings,
  flags,
});

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('inventory');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateTab, setUpdateTab] = useState('status');

  // QR & Split States
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'found' | 'not_found'>('idle');
  const [scanInput, setScanInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const qrScannerRef = React.useRef<Html5Qrcode | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [batchToPrint, setBatchToPrint] = useState<Batch | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [batchToSplit, setBatchToSplit] = useState<Batch | null>(null);

  // Sync State (mock ArcGIS sync — kept as UI affordance for later edge function)
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingOutplants, setIsSyncingOutplants] = useState(false);

  // --- LOAD ---
  const loadBatches = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [bRes, tRes, oRes, fRes] = await Promise.all([
        supabase.from('batches').select('*').order('created_at', { ascending: false }),
        supabase.from('treatments').select('*'),
        supabase.from('outplantings').select('*'),
        supabase.from('flags').select('*'),
      ]);
      if (bRes.error) throw bRes.error;
      if (tRes.error) throw tRes.error;
      if (oRes.error) throw oRes.error;
      if (fRes.error) throw fRes.error;

      const rows = (bRes.data || []) as BatchRow[];
      const treatments = (tRes.data || []) as Treatment[];
      const outplantings = (oRes.data || []) as Outplanting[];
      const flags = (fRes.data || []) as Flag[];

      const hydrated = rows.map((row) =>
        hydrate(
          row,
          treatments.filter((t) => t.batch_id === row.id),
          outplantings.filter((o) => o.batch_id === row.id),
          flags.filter((f) => f.batch_id === row.id)
        )
      );
      setBatches(hydrated);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadBatches();
    else { setBatches([]); setLoading(false); }
  }, [user, loadBatches]);

  // --- DERIVED STATE ---
  const filteredBatches = useMemo(() => {
    return batches.filter(b =>
      b.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.common_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [batches, searchQuery]);

  const stats = useMemo(() => {
    const active = batches.filter(b => b.status !== 'Outplanted' && b.status !== 'Failed');

    // Seed lots: batches that are seed type and still measured by weight (not yet sown)
    const seedLots = batches.filter(
      b => b.collection_type === 'Seed' && (b.seed_weight_oz ?? 0) > 0
    );
    const totalSeedOz = seedLots.reduce((sum, b) => sum + (b.seed_weight_oz ?? 0), 0);

    return {
      totalActiveBatches: active.length,
      // Guard: don't count seed lots as plants; treat missing qty as 0
      totalActivePlants: active.reduce((sum, b) => {
        if (b.collection_type === 'Seed' && !b.current_qty) return sum;
        return sum + (b.current_qty || 0);
      }, 0),
      readyToPlant: batches.filter(b => b.status === 'Ready').reduce((sum, b) => sum + (b.current_qty || 0), 0),
      totalOutplanted: batches.reduce((sum, b) => sum + b.outplantings.reduce((sub, out) => sub + out.qty, 0), 0),
      activeAlerts: batches.filter(b => b.flags && b.flags.length > 0).length,
      seedLotCount: seedLots.length,
      totalSeedOz: totalSeedOz
    };
  }, [batches]);

  // --- HANDLERS ---
  const handleAddBatch = async (newBatch: {
    species: string;
    commonName: string;
    collectionType: string;
    collectionDate: string;
    sourceLocation: string;
    initialQty: number;
  }) => {
    setSaving(true);
    setSaveError(null);
    try {
      let newId = generateSemanticId(newBatch.collectionDate, newBatch.species, newBatch.sourceLocation);
      const existing = batches.filter(b => b.id.startsWith(newId));
      if (existing.length > 0) newId = `${newId}-${existing.length + 1}`;

      const row: BatchRow = {
        id: newId,
        parent_id: null,
        species: newBatch.species,
        common_name: newBatch.commonName,
        collection_type: newBatch.collectionType,
        collection_date: newBatch.collectionDate,
        source_location: newBatch.sourceLocation,
        initial_qty: newBatch.initialQty,
        current_qty: newBatch.initialQty,
        status: 'Collected/Stored',
        nursery_location: 'Intake Area',
        stratification: { method: '', status: 'Pending', startDate: '' },
        planting: { method: '', soilMix: '', potType: '' },
      };
      const { error } = await supabase.from('batches').insert(row);
      if (error) throw error;
      setIsAddModalOpen(false);
      await loadBatches();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save batch');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateBatch = async (updated: Batch, patch: {
    status?: string;
    nurseryLocation?: string;
    currentQty?: number;
    stratification?: any;
    planting?: any;
    newTreatment?: { type: string; notes: string } | null;
    newOutplanting?: { qty: number; destination: string } | null;
  }) => {
    setSaving(true);
    setSaveError(null);
    try {
      const { error: bErr } = await supabase.from('batches').update({
        status: patch.status ?? updated.status,
        nursery_location: patch.nurseryLocation ?? updated.nursery_location,
        current_qty: patch.currentQty ?? updated.current_qty,
        stratification: patch.stratification ?? updated.stratification,
        planting: patch.planting ?? updated.planting,
      }).eq('id', updated.id);
      if (bErr) throw bErr;

      if (patch.newTreatment && patch.newTreatment.type) {
        const { error: tErr } = await supabase.from('treatments').insert({
          batch_id: updated.id,
          date: todayIso(),
          type: patch.newTreatment.type,
          notes: patch.newTreatment.notes || '',
        });
        if (tErr) throw tErr;
      }

      if (patch.newOutplanting && patch.newOutplanting.qty > 0) {
        const { error: oErr } = await supabase.from('outplantings').insert({
          batch_id: updated.id,
          date: todayIso(),
          destination: patch.newOutplanting.destination,
          qty: patch.newOutplanting.qty,
        });
        if (oErr) throw oErr;
      }

      setIsUpdateModalOpen(false);
      setSelectedBatch(null);
      await loadBatches();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to update batch');
    } finally {
      setSaving(false);
    }
  };

  const openUpdateModal = (batch: Batch) => {
    setSelectedBatch(batch);
    setUpdateTab('status');
    setSaveError(null);
    setIsUpdateModalOpen(true);
  };

  const handleSplitBatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!batchToSplit) return;
    const fd = new FormData(e.currentTarget);
    const splitQty = parseInt(String(fd.get('splitQty') || ''), 10);
    const newLocation = String(fd.get('nurseryLocation') || '');
    const newStatus = String(fd.get('status') || batchToSplit.status);

    if (!splitQty || splitQty <= 0 || splitQty >= batchToSplit.current_qty) return;

    setSaving(true);
    setSaveError(null);
    try {
      const baseId = batchToSplit.id.split('-').length > 4
        ? batchToSplit.id.split('-').slice(0, 4).join('-')
        : batchToSplit.id;
      const children = batches.filter(b => b.parent_id === batchToSplit.id || b.id.startsWith(`${baseId}-`));
      const suffixCode = 65 + children.length;
      const childId = `${baseId}-${String.fromCharCode(suffixCode)}`;

      const childRow: BatchRow = {
        id: childId,
        parent_id: batchToSplit.id,
        species: batchToSplit.species,
        common_name: batchToSplit.common_name,
        collection_type: batchToSplit.collection_type,
        collection_date: batchToSplit.collection_date,
        source_location: batchToSplit.source_location,
        initial_qty: splitQty,
        current_qty: splitQty,
        status: newStatus || batchToSplit.status,
        nursery_location: newLocation || batchToSplit.nursery_location,
        stratification: batchToSplit.stratification,
        planting: batchToSplit.planting,
      };

      const { error: cErr } = await supabase.from('batches').insert(childRow);
      if (cErr) throw cErr;

      const { error: pErr } = await supabase.from('batches')
        .update({ current_qty: batchToSplit.current_qty - splitQty })
        .eq('id', batchToSplit.id);
      if (pErr) throw pErr;

      setIsSplitModalOpen(false);
      setBatchToSplit(null);
      await loadBatches();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to split batch');
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateScan = () => {
    setIsScanModalOpen(true);
    setScanStatus('idle');
    setScanInput('');
  };
  const startCameraScan = async () => {
    setCameraError(null);
    setScanStatus('scanning');
    try {
      const scanner = new Html5Qrcode('qr-reader');
      qrScannerRef.current = scanner;
      setIsCameraActive(true);
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          // A QR code was read — decodedText is the batch ID
          stopCameraScan();
          handleManualScanLookup(decodedText.trim());
        },
        () => {
          // ignore per-frame scan misses (fires constantly, harmless)
        }
      );
    } catch (err: any) {
      setCameraError(err?.message || 'Could not access camera');
      setIsCameraActive(false);
      setScanStatus('idle');
    }
  };

  const stopCameraScan = async () => {
    const scanner = qrScannerRef.current;
    if (scanner) {
      try {
        await scanner.stop();
        await scanner.clear();
      } catch {
        // scanner may already be stopped — safe to ignore
      }
      qrScannerRef.current = null;
    }
    setIsCameraActive(false);
  };
  const handleManualScanLookup = async (id: string) => {
    const found = batches.find(b => b.id === id);
    if (found) {
      setScanStatus('found');
      setTimeout(() => {
        setIsScanModalOpen(false);
        openUpdateModal(found);
        setScanStatus('idle');
      }, 800);
    } else {
      setScanStatus('not_found');
    }
  };

  // Mock ArcGIS syncs — these will become real edge function calls later.
  // Left in place so the UI affordance is preserved; they currently just
  // reload from the database (no-op) so nothing destructive happens.
  const handleSyncSurvey123 = async () => {
    setIsSyncing(true);
    await loadBatches();
    setIsSyncing(false);
  };

  const handleSyncFieldMaps = async () => {
    setIsSyncingOutplants(true);
    await loadBatches();
    setIsSyncingOutplants(false);
  };

  // --- COMPONENTS ---
  const dashboardContent = (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-stone-800">Nursery Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-lg">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">Active Link4 Alerts</p>
            <p className="text-2xl font-bold text-stone-800">{stats.activeAlerts}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
            <Sprout size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">Plants in Nursery</p>
            <p className="text-2xl font-bold text-stone-800">{stats.totalActivePlants.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <ListTree size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">Active Batches</p>
            <p className="text-2xl font-bold text-stone-800">{stats.totalActiveBatches}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
            <Map size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">Total Outplanted</p>
            <p className="text-2xl font-bold text-stone-800">{stats.totalOutplanted.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-yellow-100 text-yellow-700 rounded-lg">
            <Sprout size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">Seed in Storage</p>
            <p className="text-2xl font-bold text-stone-800">
              {stats.totalSeedOz.toLocaleString()} <span className="text-lg font-medium">oz</span>
            </p>
            <p className="text-xs text-stone-400">{stats.seedLotCount} seed {stats.seedLotCount === 1 ? 'lot' : 'lots'}</p>
          </div>
        </div>
      </div>
    </div>
  );
  const climateContent = (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Environmental Controls</h2>
          <p className="text-stone-500 text-sm">Live feed from Link4 Greenhouse System & Weather Station</p>
        </div>
        <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-sm font-medium border border-emerald-200">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse mr-2"></span>
          Link4 Online
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Thermometer size={64} /></div>
          <p className="text-sm font-medium text-stone-500 mb-1">Zone 1 Temperature</p>
          <p className="text-3xl font-bold text-stone-800">72.4°F</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center"><TrendingUp size={12} className="mr-1" /> Optimal Range</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Droplets size={64} /></div>
          <p className="text-sm font-medium text-stone-500 mb-1">Relative Humidity</p>
          <p className="text-3xl font-bold text-stone-800">65%</p>
          <p className="text-xs text-emerald-600 mt-2 flex items-center"><TrendingUp size={12} className="mr-1" /> Optimal Range</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Sun size={64} /></div>
          <p className="text-sm font-medium text-stone-500 mb-1">PAR Light Levels</p>
          <p className="text-3xl font-bold text-stone-800">420 <span className="text-lg">µmol</span></p>
          <p className="text-xs text-amber-500 mt-2 flex items-center"><AlertCircle size={12} className="mr-1" /> Shade cloth active</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Wind size={64} /></div>
          <p className="text-sm font-medium text-stone-500 mb-1">Outside Weather</p>
          <p className="text-3xl font-bold text-stone-800">48°F</p>
          <p className="text-xs text-sky-600 mt-2 flex items-center"><CloudRain size={12} className="mr-1" /> Light Rain, Wind 5mph</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-6">
        <h3 className="font-semibold text-stone-800 mb-4 flex items-center"><FlaskConical className="mr-2 text-sky-600" size={20} /> VPD (Vapor Pressure Deficit) History</h3>
        <div className="h-48 flex items-end justify-between space-x-2">
          {[0.6, 0.7, 0.8, 1.0, 1.2, 0.9, 0.8, 0.7, 0.8, 0.9, 1.0, 0.8].map((val, i) => (
            <div key={i} className="w-full relative group flex justify-center">
              <div
                className={`w-full rounded-t-sm transition-all ${val > 1.0 ? 'bg-amber-400' : val < 0.6 ? 'bg-sky-400' : 'bg-emerald-400'}`}
                style={{ height: `${(val / 1.5) * 100}%` }}
              ></div>
              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 bg-stone-800 text-white text-xs py-1 px-2 rounded whitespace-nowrap transition-opacity pointer-events-none">
                {val} kPa
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-stone-400 mt-2">
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
        </div>
      </div>
    </div>
  );

  const inventoryContent = (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-stone-800">Plant Inventory</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSimulateScan}
            className="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg flex items-center transition-colors shadow-sm"
          >
            <Camera size={18} className="mr-2" /> Scan Tag
          </button>
          <button
            onClick={handleSyncFieldMaps}
            disabled={isSyncingOutplants}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-2 rounded-lg flex items-center transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={`mr-2 ${isSyncingOutplants ? 'animate-spin' : ''}`} />
            {isSyncingOutplants ? 'Syncing...' : 'Sync Field Maps'}
          </button>
          <button
            onClick={handleSyncSurvey123}
            disabled={isSyncing}
            className="bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white px-4 py-2 rounded-lg flex items-center transition-colors shadow-sm"
          >
            <RefreshCw size={18} className={`mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Survey123'}
          </button>
          <button
            onClick={() => { setSaveError(null); setIsAddModalOpen(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors shadow-sm"
          >
            <Plus size={18} className="mr-2" /> New Collection
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-stone-200 bg-stone-50 flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search by species, common name, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-stone-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={loadBatches}
            className="text-stone-500 hover:text-stone-800 p-2 rounded-lg hover:bg-stone-100"
            title="Reload from database"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 text-stone-600 text-sm border-b border-stone-200">
                <th className="p-4 font-semibold">Semantic ID / Species</th>
                <th className="p-4 font-semibold">Origin & Lineage</th>
                <th className="p-4 font-semibold">Location</th>
                <th className="p-4 font-semibold text-right">Qty</th>
                <th className="p-4 font-semibold text-center">Status</th>
                <th className="p-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-500">
                    <Loader2 className="inline animate-spin mr-2" size={18} /> Loading batches...
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-red-600">
                    {loadError}
                  </td>
                </tr>
              ) : filteredBatches.length > 0 ? filteredBatches.map(batch => (
                <tr key={batch.id} className="hover:bg-stone-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <p className="font-mono font-bold text-stone-800 text-sm">{batch.id}</p>
                      {batch.flags && batch.flags.length > 0 && (
                        <AlertTriangle size={16} className="text-red-500 animate-pulse" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-stone-600 mt-1">{batch.common_name}</p>
                    <p className="text-xs text-stone-500 italic">{batch.species}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center text-sm text-stone-600">
                      <MapPin size={14} className="mr-1 text-stone-400" />
                      <span className="truncate max-w-[150px]" title={batch.source_location}>
                        {batch.source_location}
                      </span>
                    </div>
                    {batch.parent_id && (
                      <div className="flex items-center text-xs text-sky-600 mt-1 font-mono bg-sky-50 inline-block px-1 rounded">
                        ↳ Child of: {batch.parent_id}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-sm text-stone-700">{batch.nursery_location}</td>
                  <td className="p-4 text-right">
                    {batch.collection_type === 'Seed' && (batch.seed_weight_oz ?? 0) > 0 ? (
                      <p className="font-medium text-yellow-700">
                        {batch.seed_weight_oz} <span className="text-xs font-normal">oz</span>
                      </p>
                    ) : (
                      <p className="font-medium text-stone-800">{batch.current_qty}</p>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full border inline-block ${STATUS_COLORS[batch.status as keyof typeof STATUS_COLORS] || 'bg-stone-100 text-stone-800 border-stone-300'}`}>
                      {batch.status}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center space-x-3">
                      <button onClick={() => { setBatchToPrint(batch); setIsPrintModalOpen(true); }} className="text-stone-400 hover:text-stone-700"><Printer size={18} /></button>
                      <button onClick={() => { setBatchToSplit(batch); setSaveError(null); setIsSplitModalOpen(true); }} className="text-stone-400 hover:text-sky-600"><GitBranch size={18} /></button>
                      <button onClick={() => openUpdateModal(batch)} className="text-emerald-600 font-medium hover:underline text-sm">Update</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-stone-500">No batches found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div className="h-screen bg-stone-100 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }
  if (!user) return <SignIn />;

  return (
    <div className="h-screen bg-stone-100 flex font-sans overflow-hidden">
      <aside className="w-64 bg-emerald-900 text-emerald-50 flex-shrink-0 flex flex-col hidden md:flex">
        <div className="p-6 flex items-center space-x-3 border-b border-emerald-800">
          <Leaf className="text-emerald-400" size={28} />
          <h1 className="text-xl font-bold tracking-tight">FloraTrack</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${activeTab === 'dashboard' ? 'bg-emerald-800 text-white' : 'hover:bg-emerald-800/50'}`}><LayoutDashboard size={20} /><span>Dashboard</span></button>
          <button onClick={() => setActiveTab('inventory')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${activeTab === 'inventory' ? 'bg-emerald-800 text-white' : 'hover:bg-emerald-800/50'}`}><ListTree size={20} /><span>Inventory</span></button>
          <button onClick={() => setActiveTab('climate')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg ${activeTab === 'climate' ? 'bg-emerald-800 text-white' : 'hover:bg-emerald-800/50'}`}><CloudRain size={20} /><span>Climate & Link4</span></button>
        </nav>
        <div className="p-4 border-t border-emerald-800 space-y-2">
          <button onClick={() => setIsAdminPanelOpen(true)} className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-emerald-800/50 text-emerald-100 text-sm">
            <UserPlus size={18} /><span>Add User</span>
          </button>
          <div className="px-4 py-2 text-xs text-emerald-300 truncate" title={user?.email || ''}>
            {user?.email}
          </div>
          <button onClick={() => signOut()} className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg hover:bg-emerald-800/50 text-emerald-100 text-sm">
            <LogOut size={18} /><span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-emerald-900 text-white p-4 flex justify-between">
          <Leaf size={24} />
          <div className="flex space-x-2">
            <button onClick={() => setActiveTab('dashboard')} className={`p-2 rounded ${activeTab === 'dashboard' ? 'bg-emerald-800' : ''}`}><LayoutDashboard /></button>
            <button onClick={() => setActiveTab('inventory')} className={`p-2 rounded ${activeTab === 'inventory' ? 'bg-emerald-800' : ''}`}><ListTree /></button>
            <button onClick={() => setActiveTab('climate')} className={`p-2 rounded ${activeTab === 'climate' ? 'bg-emerald-800' : ''}`}><CloudRain /></button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' ? dashboardContent : activeTab === 'inventory' ? inventoryContent : climateContent}
          </div>
        </div>
      </main>

      {/* MODALS */}
      {/* Update Batch Modal (Full Tabbed Version) */}
      {isUpdateModalOpen && selectedBatch && (
        <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-stone-200 flex justify-between items-start flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold text-stone-800 flex items-center">
                  Update Batch <span className="ml-3 text-sm font-mono px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">{selectedBatch.id}</span>
                </h3>
                {selectedBatch.flags && selectedBatch.flags.length > 0 && (
                  <div className="mt-2 text-sm bg-red-50 text-red-700 p-2 rounded flex items-start border border-red-200">
                    <AlertTriangle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                    <p><strong>System Flag:</strong> {selectedBatch.flags[0].message}</p>
                  </div>
                )}
              </div>
              <button onClick={() => setIsUpdateModalOpen(false)} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-stone-200 px-6 bg-stone-50 flex-shrink-0 overflow-x-auto">
              {[
                { id: 'status', label: 'Status & Location', icon: <MapPin size={16} className="mr-2" /> },
                { id: 'growing', label: 'Propagation & Soil', icon: <Sprout size={16} className="mr-2" /> },
                { id: 'treatments', label: 'Fertilizer & Care', icon: <FlaskConical size={16} className="mr-2" /> },
                { id: 'outplant', label: 'Outplanting', icon: <Truck size={16} className="mr-2" /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setUpdateTab(tab.id)}
                  className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    updateTab === tab.id
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <form
              className="p-6 overflow-y-auto"
              id="update-form"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);

                const stratification = {
                  method: fd.get('stratMethod') || selectedBatch.stratification?.method || '',
                  startDate: fd.get('stratDate') || selectedBatch.stratification?.startDate || '',
                  status: fd.get('stratStatus') || selectedBatch.stratification?.status || 'Pending'
                };
                const planting = {
                  method: fd.get('plantMethod') || selectedBatch.planting?.method || '',
                  soilMix: fd.get('soilMix') || selectedBatch.planting?.soilMix || '',
                  potType: fd.get('potType') || selectedBatch.planting?.potType || ''
                };

                const statusField = String(fd.get('status') || selectedBatch.status);
                const nurseryLocation = String(fd.get('nurseryLocation') || selectedBatch.nursery_location || '');
                const currentQtyRaw = fd.get('currentQty');
                const currentQty = currentQtyRaw ? parseInt(String(currentQtyRaw), 10) : selectedBatch.current_qty;

                const treatType = String(fd.get('newTreatmentType') || '');
                const newTreatment = treatType && treatType !== ''
                  ? { type: treatType, notes: String(fd.get('newTreatmentNotes') || '') }
                  : null;

                const outplantQty = parseInt(String(fd.get('outplantQty') || '0'), 10);
                const destination = String(fd.get('destination') || '');
                let newOutplanting: { qty: number; destination: string } | null = null;
                let finalStatus = statusField;
                let finalQty = currentQty;
                let finalLocation = nurseryLocation;

                if (statusField === 'Outplanted' && outplantQty > 0) {
                  newOutplanting = { qty: outplantQty, destination };
                  finalQty = currentQty - outplantQty;
                  if (finalQty <= 0) {
                    finalLocation = 'N/A';
                  } else {
                    // partial outplant: keep prior status if user chose Outplanted but qty remains
                    finalStatus = selectedBatch.status;
                  }
                }

                handleUpdateBatch(selectedBatch, {
                  status: finalStatus,
                  nurseryLocation: finalLocation,
                  currentQty: finalQty,
                  stratification,
                  planting,
                  newTreatment,
                  newOutplanting,
                });
              }}
            >
              {saveError && (
                <div className="mb-4 text-sm bg-red-50 text-red-700 p-3 rounded border border-red-200 flex items-start">
                  <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {updateTab === 'status' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Current Phase/Status</label>
                    <select name="status" defaultValue={selectedBatch.status} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none">
                      <option value="Collected/Stored">Collected / Stored</option>
                      <option value="Propagating">Propagating / Germinating</option>
                      <option value="Growing">Growing / Potted Up</option>
                      <option value="Ready">Ready for Outplanting</option>
                      <option value="Outplanted">Outplant (Deploy to Field)</option>
                      <option value="Failed">Failed / Discarded</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Nursery Location</label>
                    <input name="nurseryLocation" type="text" defaultValue={selectedBatch.nursery_location} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Current Surviving Quantity</label>
                    <div className="flex items-center space-x-2">
                      <input name="currentQty" type="number" min="0" max={selectedBatch.initial_qty} defaultValue={selectedBatch.current_qty} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" />
                      <span className="text-sm text-stone-500 whitespace-nowrap">/ {selectedBatch.initial_qty} origin</span>
                    </div>
                  </div>
                </div>
              )}

              {updateTab === 'growing' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-stone-800 border-b border-stone-200 pb-2">Seed Stratification</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-stone-700 mb-1">Method</label>
                        <select name="stratMethod" defaultValue={selectedBatch.stratification?.method} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                          <option value="">Select...</option>
                          <option value="N/A">Not Required</option>
                          <option value="Cold Moist">Cold Moist</option>
                          <option value="Warm then Cold">Warm then Cold</option>
                          <option value="Scarification">Scarification (Mechanical/Acid)</option>
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-stone-700 mb-1">Start Date</label>
                        <input name="stratDate" type="date" defaultValue={selectedBatch.stratification?.startDate} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-stone-700 mb-1">Status</label>
                        <select name="stratStatus" defaultValue={selectedBatch.stratification?.status} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold text-stone-800 border-b border-stone-200 pb-2">Planting Specs</h4>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Planting Method</label>
                        <input name="plantMethod" type="text" placeholder="e.g. Direct Sow, Plugs" defaultValue={selectedBatch.planting?.method} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Soil Mix</label>
                        <input name="soilMix" type="text" placeholder="e.g. Native Woody Blend" defaultValue={selectedBatch.planting?.soilMix} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-stone-700 mb-1">Pot Type / Container</label>
                        <input name="potType" type="text" placeholder="e.g. D40 Cell, 1 Gallon" defaultValue={selectedBatch.planting?.potType} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {updateTab === 'treatments' && (
                <div className="space-y-6">
                  {selectedBatch.treatments && selectedBatch.treatments.length > 0 ? (
                    <div className="bg-stone-50 rounded-lg border border-stone-200 overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-stone-100 text-stone-600 border-b border-stone-200">
                          <tr><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Type</th><th className="px-3 py-2 font-semibold">Notes</th></tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200">
                          {selectedBatch.treatments.map((t) => (
                            <tr key={t.id}><td className="px-3 py-2 text-stone-500">{t.date}</td><td className="px-3 py-2 font-medium text-stone-700">{t.type}</td><td className="px-3 py-2 text-stone-600">{t.notes}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-stone-500 italic text-center py-4 bg-stone-50 rounded-lg border border-stone-200 border-dashed">No treatments logged yet.</p>
                  )}

                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                    <h4 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center"><Plus size={16} className="mr-1" /> Log New Treatment</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-medium text-stone-700 mb-1">Type</label>
                        <select name="newTreatmentType" className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                          <option value="">-- Skip --</option>
                          <option value="Fertilizer">Fertilizer</option>
                          <option value="Fungicide">Fungicide</option>
                          <option value="Pesticide">Pesticide</option>
                          <option value="Hormone">Rooting Hormone</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs font-medium text-stone-700 mb-1">Notes / Product</label>
                        <input name="newTreatmentNotes" type="text" placeholder="e.g. Fish Emulsion 5-1-1" className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {updateTab === 'outplant' && (
                <div className="space-y-4">
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                    <h4 className="text-sm font-semibold text-purple-800 mb-3 flex items-center">
                      <Truck size={16} className="mr-2" /> Record Field Deployment
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Change Status To</label>
                        <select name="status" className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                          <option value="Outplanted">Outplanted (Deploy to Field)</option>
                          <option value="Ready">Keep as 'Ready' (Partial outplant)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Quantity to Plant Out</label>
                        <input name="outplantQty" type="number" min="0" max={selectedBatch.current_qty} placeholder="0" className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">Destination Site</label>
                        <input name="destination" type="text" placeholder="e.g. River Bend Restoration Zone 1" className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </form>
            <div className="p-4 flex justify-end space-x-3 border-t bg-stone-50 rounded-b-xl">
              <button type="button" onClick={() => setIsUpdateModalOpen(false)} className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg">Cancel</button>
              <button type="submit" form="update-form" disabled={saving} className="px-4 py-2 bg-emerald-600 disabled:bg-emerald-400 text-white rounded-lg flex items-center">
                {saving && <Loader2 size={16} className="mr-2 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print QR Tag Modal */}
      {isPrintModalOpen && batchToPrint && (
        <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-stone-200 flex justify-between items-center bg-stone-50"><h3 className="font-bold text-stone-800">Print Pot Tag</h3><button onClick={() => setIsPrintModalOpen(false)}><X size={20} /></button></div>
            <div className="p-8 flex justify-center bg-stone-200">
              <div className="bg-white w-64 h-96 rounded-lg shadow-md border-2 border-stone-300 flex flex-col items-center justify-between p-4 relative">
                <div className="w-4 h-4 rounded-full bg-stone-200 border border-stone-300 absolute top-4"></div>
                <div className="mt-8 text-center w-full border-b border-stone-200 pb-4">
                  <h4 className="font-black text-xl text-stone-800">{batchToPrint.common_name}</h4>
                  <p className="text-sm font-serif italic text-stone-600">{batchToPrint.species}</p>
                </div>
                <div className="flex-1 flex items-center justify-center w-full">
                  <div className="p-2 border-4 border-stone-800 rounded bg-white">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(batchToPrint.id)}`}
                      alt={`QR Code for ${batchToPrint.id}`}
                      className="w-[120px] h-[120px]"
                    />
                  </div>
                </div>
                <div className="w-full text-center space-y-1">
                  <p className="font-mono font-bold text-sm text-stone-800 bg-stone-100 p-1 rounded">{batchToPrint.id}</p>
                </div>
              </div>
            </div>
            <div className="p-4 flex justify-between bg-white border-t border-stone-200">
              <button onClick={() => setIsPrintModalOpen(false)} className="px-4 py-2 text-stone-600">Cancel</button>
              <button onClick={() => window.print()} className="px-4 py-2 bg-stone-800 text-white rounded-lg"><Printer size={18} className="inline mr-2" /> Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {isSplitModalOpen && batchToSplit && (
        <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-stone-200 flex justify-between"><h3 className="text-xl font-bold flex"><GitBranch className="mr-2 text-sky-600" /> Split Batch</h3><button onClick={() => setIsSplitModalOpen(false)}><X size={24} /></button></div>
            <form id="split-form" onSubmit={handleSplitBatch} className="p-6 space-y-4">
              {saveError && (
                <div className="text-sm bg-red-50 text-red-700 p-3 rounded border border-red-200 flex items-start">
                  <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
              <p className="text-sm text-stone-600">Create a relational child from <strong>{batchToSplit.id}</strong>. The new batch will have a `parent_id` linking it back to this original source data.</p>
              <div><label className="block text-sm font-medium">Quantity to Move/Split</label><input name="splitQty" type="number" min="1" max={batchToSplit.current_qty - 1} required className="w-full px-3 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium">New Nursery Location</label><input name="nurseryLocation" type="text" className="w-full px-3 py-2 border rounded-lg" /></div>
              <div>
                <label className="block text-sm font-medium">Status of Split Batch</label>
                <select name="status" defaultValue={batchToSplit.status} className="w-full px-3 py-2 border rounded-lg">
                  <option value="Propagating">Propagating / Germinating</option>
                  <option value="Growing">Growing / Potted Up</option>
                  <option value="Ready">Ready for Outplanting</option>
                </select>
              </div>
            </form>
            <div className="p-4 flex justify-end space-x-3 border-t bg-stone-50 rounded-b-xl">
              <button type="button" onClick={() => setIsSplitModalOpen(false)} className="px-4 py-2">Cancel</button>
              <button type="submit" form="split-form" disabled={saving} className="px-4 py-2 bg-sky-600 disabled:bg-sky-400 text-white rounded-lg flex items-center">
                {saving && <Loader2 size={16} className="mr-2 animate-spin" />} Confirm Split
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Form */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-bold">Log New Collection</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
            </div>
            <form className="p-6 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleAddBatch({
                species: String(fd.get('sp') || ''),
                commonName: String(fd.get('cn') || ''),
                collectionType: String(fd.get('ct') || 'Seed'),
                collectionDate: String(fd.get('date') || ''),
                sourceLocation: String(fd.get('loc') || ''),
                initialQty: parseInt(String(fd.get('qty') || '0'), 10),
              });
            }}>
              {saveError && (
                <div className="text-sm bg-red-50 text-red-700 p-3 rounded border border-red-200 flex items-start">
                  <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
              <p className="text-sm text-stone-600 mb-4 border-l-4 border-sky-500 pl-3 bg-sky-50 p-2">The system will automatically generate a semantic ID (e.g., YYYY-MM-SPECIES-SOURCE) to match the relational database architecture.</p>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium">Species</label><input required name="sp" placeholder="e.g. Acer macrophyllum" className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium">Common Name</label><input required name="cn" placeholder="e.g. Bigleaf Maple" className="w-full px-3 py-2 border rounded-lg" /></div>
                <div>
                  <label className="block text-sm font-medium">Collection Type</label>
                  <select name="ct" className="w-full px-3 py-2 border rounded-lg">
                    <option value="Seed">Seed</option>
                    <option value="Cutting">Cutting</option>
                    <option value="Transplant">Transplant</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium">Collection Date</label><input required name="date" type="date" className="w-full px-3 py-2 border rounded-lg" defaultValue={todayIso()} /></div>
                <div><label className="block text-sm font-medium">Source Location</label><input required name="loc" placeholder="e.g. Discovery Park" className="w-full px-3 py-2 border rounded-lg" /></div>
                <div><label className="block text-sm font-medium">Initial Qty</label><input required name="qty" type="number" min="1" className="w-full px-3 py-2 border rounded-lg" /></div>
              </div>
              <div className="pt-4 flex justify-end space-x-3 border-t">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 disabled:bg-emerald-400 text-white rounded-lg flex items-center">
                  {saving && <Loader2 size={16} className="mr-2 animate-spin" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Panel */}
      {isAdminPanelOpen && <AdminPanel onClose={() => setIsAdminPanelOpen(false)} />}

      {/* Scan Modal */}
      {isScanModalOpen && (
        <div className="fixed inset-0 bg-stone-900/90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="w-full max-w-md flex flex-col items-center">
            <div className="relative w-72 h-72 border-2 border-emerald-500 rounded-3xl overflow-hidden bg-black flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)]">
              <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEEweiIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjIiIGZpbGw9IiNmZmYiLz48L3N2Zz4=')]"></div>
              {scanStatus === 'scanning' && (
                <div className="absolute w-full h-1 bg-emerald-400 shadow-[0_0_15px_#34d399] animate-[scan_2s_ease-in-out_infinite]"></div>
              )}
              {scanStatus === 'found' ? (
                <div className="z-10 bg-emerald-500 text-white p-4 rounded-full flex flex-col items-center animate-bounce"><CheckCircle2 size={48} /></div>
              ) : scanStatus === 'not_found' ? (
                <div className="z-10 bg-red-500 text-white p-4 rounded-full flex flex-col items-center"><AlertCircle size={48} /></div>
              ) : (
                <ScanLine size={100} className="text-emerald-500/50 z-10" strokeWidth={1} />
              )}
            </div>
            <p className="text-white mt-8 text-lg font-medium tracking-wide">
              {scanStatus === 'scanning' ? 'Align QR code within frame...' : scanStatus === 'found' ? 'Batch Found! Loading data...' : scanStatus === 'not_found' ? 'No batch found for that ID' : 'Camera ready'}
            </p>

            {/* Manual lookup fallback (works without camera permissions) */}
            {/* Camera scanner area */}
            <div id="qr-reader" className={`w-full ${isCameraActive ? 'block' : 'hidden'} rounded-lg overflow-hidden mt-4`}></div>

            {cameraError && (
              <p className="text-red-400 text-sm mt-3 text-center max-w-xs">{cameraError}</p>
            )}

            <div className="mt-4 w-full flex justify-center">
              {!isCameraActive ? (
                <button
                  onClick={startCameraScan}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center"
                >
                  <Camera size={18} className="mr-2" /> Start Camera
                </button>
              ) : (
                <button
                  onClick={stopCameraScan}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center"
                >
                  <X size={18} className="mr-2" /> Stop Camera
                </button>
              )}
            </div>
            <div className="mt-6 w-full">
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Start typing a batch ID or species..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-stone-800 text-white border border-stone-600 placeholder-stone-500 outline-none"
                />
                <button
                  onClick={() => scanInput && handleManualScanLookup(scanInput.trim())}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  Lookup
                </button>
              </div>

              {scanInput.trim() !== '' && (
                <div className="mt-2 bg-stone-800 border border-stone-600 rounded-lg max-h-48 overflow-y-auto">
                  {batches
                    .filter(b =>
                      b.id.toLowerCase().includes(scanInput.toLowerCase()) ||
                      b.species.toLowerCase().includes(scanInput.toLowerCase()) ||
                      b.common_name.toLowerCase().includes(scanInput.toLowerCase())
                    )
                    .slice(0, 8)
                    .map(b => (
                      <button
                        key={b.id}
                        onClick={() => handleManualScanLookup(b.id)}
                        className="w-full text-left px-3 py-2 hover:bg-stone-700 border-b border-stone-700 last:border-b-0"
                      >
                        <span className="font-mono text-emerald-400 text-sm">{b.id}</span>
                        <span className="text-stone-300 text-sm ml-2">{b.common_name}</span>
                      </button>
                    ))}
                  {batches.filter(b =>
                    b.id.toLowerCase().includes(scanInput.toLowerCase()) ||
                    b.species.toLowerCase().includes(scanInput.toLowerCase()) ||
                    b.common_name.toLowerCase().includes(scanInput.toLowerCase())
                  ).length === 0 && (
                    <p className="px-3 py-2 text-stone-500 text-sm">No matches found</p>
                  )}
                </div>
              )}
            </div>

            <button onClick={() => setIsScanModalOpen(false)} className="mt-8 px-6 py-2 bg-stone-800 text-white rounded-full hover:bg-stone-700 border border-stone-600">Cancel Scan</button>
          </div>
        </div>
      )}
    </div>
  );
}
