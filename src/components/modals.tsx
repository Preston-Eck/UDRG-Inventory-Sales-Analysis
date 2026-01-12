
import React, { useState } from 'react';
import { supabase, checkSupabaseConnection } from '../lib/supabaseClient';
import { Button } from './ui';
import { AppSettings, AnalysisRow, CellLogic, Product, Transaction, InventoryState } from '../types';

// --- Settings Modal ---

export const SettingsModal = ({ settings, onSave, onClose, onMigrate }: { settings: AppSettings, onSave: (s: AppSettings) => void, onClose: () => void, onMigrate: () => void }) => {
    const [localSettings, setLocalSettings] = useState(settings);

    const updateColor = (category: 'colors' | 'charts', key: string, val: string) => {
        setLocalSettings(prev => ({
            ...prev,
            [category]: { ...prev[category], [key]: val }
        }));
    };

    const updateChartVisibility = (key: string, val: boolean) => {
        setLocalSettings(prev => ({
            ...prev,
            charts: { ...prev.charts, [key]: val }
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4 font-sans text-sm">
            <div className="bg-[var(--card-bg)] rounded-lg w-full max-w-2xl border border-[var(--border-color)] shadow-2xl flex flex-col max-h-[90vh] text-[var(--text-color)]">
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--sidebar-bg)] rounded-t-lg">
                    <h3 className="text-lg font-bold">Application Settings</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8">
                    {/* Appearance */}
                    <section>
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-4 border-b border-[var(--border-color)] pb-1">Appearance</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs mb-1">Text Size</label>
                                <select
                                    value={localSettings.fontSize}
                                    onChange={e => setLocalSettings(p => ({ ...p, fontSize: e.target.value as any }))}
                                    className="w-full bg-[var(--app-bg)] border border-[var(--border-color)] rounded p-2 text-[var(--text-color)]"
                                >
                                    <option value="text-xs">Compact (XS)</option>
                                    <option value="text-sm">Normal (SM)</option>
                                    <option value="text-base">Large (Base)</option>
                                    <option value="text-lg">Extra Large (LG)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs mb-1">Primary Color</label>
                                <div className="flex gap-2">
                                    <input type="color" value={localSettings.colors.primary} onChange={e => updateColor('colors', 'primary', e.target.value)} className="h-8 w-16 rounded cursor-pointer bg-transparent" />
                                    <span className="text-xs self-center font-mono">{localSettings.colors.primary}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs mb-1">Background</label>
                                <input type="color" value={localSettings.colors.background} onChange={e => updateColor('colors', 'background', e.target.value)} className="w-full h-8 rounded cursor-pointer bg-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs mb-1">Sidebar</label>
                                <input type="color" value={localSettings.colors.sidebar} onChange={e => updateColor('colors', 'sidebar', e.target.value)} className="w-full h-8 rounded cursor-pointer bg-transparent" />
                            </div>
                            <div>
                                <label className="block text-xs mb-1">Cards / Panels</label>
                                <input type="color" value={localSettings.colors.card} onChange={e => updateColor('colors', 'card', e.target.value)} className="w-full h-8 rounded cursor-pointer bg-transparent" />
                            </div>
                        </div>
                    </section>

                    {/* Dashboard Charts */}
                    <section>
                        <h4 className="text-xs uppercase font-bold text-slate-500 mb-4 border-b border-[var(--border-color)] pb-1">Dashboard Chart</h4>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={localSettings.charts.showNetRevenue} onChange={e => updateChartVisibility('showNetRevenue', e.target.checked)} className="rounded border-slate-600 bg-[var(--app-bg)]" />
                                    <span>Show Net Revenue</span>
                                </div>
                                <input type="color" value={localSettings.charts.colorNetRevenue} onChange={e => updateColor('charts', 'colorNetRevenue', e.target.value)} className="h-6 w-10 bg-transparent rounded cursor-pointer" />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={localSettings.charts.showGrossRevenue} onChange={e => updateChartVisibility('showGrossRevenue', e.target.checked)} className="rounded border-slate-600 bg-[var(--app-bg)]" />
                                    <span>Show Gross Revenue</span>
                                </div>
                                <input type="color" value={localSettings.charts.colorGrossRevenue} onChange={e => updateColor('charts', 'colorGrossRevenue', e.target.value)} className="h-6 w-10 bg-transparent rounded cursor-pointer" />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={localSettings.charts.showProfit} onChange={e => updateChartVisibility('showProfit', e.target.checked)} className="rounded border-slate-600 bg-[var(--app-bg)]" />
                                    <span>Show Profit</span>
                                </div>
                                <input type="color" value={localSettings.charts.colorProfit} onChange={e => updateColor('charts', 'colorProfit', e.target.value)} className="h-6 w-10 bg-transparent rounded cursor-pointer" />
                            </div>
                        </div>
                    </section>
                </div>

                <div className="p-4 border-t border-[var(--border-color)] bg-[var(--sidebar-bg)] rounded-b-lg flex justify-between gap-2">
                    <Button variant="secondary" onClick={onMigrate} className="text-amber-400 border-amber-900/30 hover:bg-amber-900/20">
                        <i className="fa-solid fa-cloud-upload mr-2"></i> Migrate to Supabase
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="primary" onClick={() => onSave(localSettings)}>Apply Changes</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- Modal Component ---

export const CellDetailModal = ({ row, cell, onClose, onAiExplain, isThinking }: { row: AnalysisRow, cell: CellLogic, onClose: () => void, onAiExplain: () => void, isThinking: boolean }) => {
    if (!row || !cell) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
            <div className="bg-[var(--card-bg)] rounded-lg w-full max-w-lg border border-[var(--border-color)] shadow-2xl flex flex-col max-h-[90vh] text-[var(--text-color)]">
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--app-bg)] rounded-t-lg">
                    <div>
                        <h3 className="text-lg font-bold text-[var(--text-color)]">{row.name}</h3>
                        <p className="text-sm text-[var(--text-muted)]">Restock Analysis for <span className="text-[var(--primary-color)]">{cell.monthLabel}</span></p>
                    </div>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white"><i className="fa-solid fa-xmark text-lg"></i></button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="bg-[var(--app-bg)] p-4 rounded-lg border border-[var(--border-color)] flex justify-between items-center">
                        <div>
                            <p className="text-xs text-[var(--text-muted)] uppercase">Recommended Buy</p>
                            <p className="text-3xl font-bold text-emerald-400">{cell.restockQty}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-[var(--text-muted)] uppercase">Est. Cost</p>
                            <p className="text-xl font-bold text-[var(--text-color)]">${cell.restockCost.toLocaleString()}</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold text-[var(--text-color)] mb-3 flex items-center gap-2">
                            <i className="fa-solid fa-calculator text-blue-400"></i> Logic Breakdown
                        </h4>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                                <span className="text-[var(--text-muted)]">Projected Opening Stock</span>
                                <span className="font-mono text-[var(--text-color)]">{cell.openingStock}</span>
                            </div>
                            <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                                <span className="text-[var(--text-muted)]">Forecasted Sales ({cell.monthLabel})</span>
                                <span className="font-mono text-red-300">-{cell.forecastedDemand}</span>
                            </div>
                            <div className="flex justify-between border-b border-[var(--border-color)] pb-2">
                                <span className="text-[var(--text-muted)]">Target Safety Stock (1 Mo Cover)</span>
                                <span className="font-mono text-blue-300">{cell.targetStock}</span>
                            </div>
                            <div className="flex justify-between pt-2">
                                <span className="text-slate-300 font-medium">Calculation</span>
                                <span className="font-mono text-[var(--text-muted)] text-xs">Target ({cell.targetStock}) + Sales ({cell.forecastedDemand}) - Opening ({cell.openingStock})</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[var(--card-bg)] p-3 rounded border border-[var(--border-color)]">
                        <p className="text-xs text-[var(--text-muted)] mb-1">Historical Context</p>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-300">Avg Sales ({cell.monthLabel.split(' ')[0]}) prev 3 yrs:</span>
                            <span className="text-sm font-bold text-[var(--text-color)]">{Math.round(cell.historicalAverage)}</span>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-[var(--border-color)] bg-[var(--app-bg)] rounded-b-lg flex justify-between items-center">
                    <span className="text-xs text-[var(--text-muted)]">Why this amount?</span>
                    <Button variant="secondary" onClick={onAiExplain} disabled={isThinking} className="flex items-center gap-2">
                        {isThinking ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles text-purple-400"></i>}
                        Explain with Gemini
                    </Button>
                </div>
            </div>
        </div>
    );
};

// --- Migration Modal ---

export const MigrationModal = ({
    data,
    onClose
}: {
    data: { products: Product[], transactions: Transaction[], inventory: InventoryState[] },
    onClose: () => void
}) => {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [log, setLog] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);

    const startMigration = async () => {
        setStatus('uploading');
        setLog(['Starting migration...', 'Checking connection...']);

        const conn = await checkSupabaseConnection();
        if (!conn.success) {
            setLog(p => [...p, `❌ Connection Failed: ${conn.error.message}`]);
            setStatus('error');
            return;
        }
        setLog(p => [...p, '✅ Connected to Supabase.', 'Preparing data...']);

        try {
            // 1. Upload Products
            setLog(p => [...p, `Uploading ${data.products.length} products...`]);
            for (let i = 0; i < data.products.length; i += 100) {
                const chunk = data.products.slice(i, i + 100).map(p => ({
                    sku: p.sku,
                    name: p.name,
                    department: p.department,
                    category: p.category,
                    vendor: p.vendor,
                    cost: p.cost,
                    price: p.price
                }));
                const { error } = await supabase.from('products').upsert(chunk);
                if (error) throw error;
                setProgress(((i + 100) / data.products.length) * 33);
            }
            setLog(p => [...p, '✅ Products uploaded.']);

            // 2. Upload Inventory
            setLog(p => [...p, `Uploading ${data.inventory.length} inventory records...`]);
            const invChunk = data.inventory.map(i => ({
                sku: i.sku,
                qty_on_hand: i.qtyOnHand
            }));
            for (let i = 0; i < invChunk.length; i += 500) {
                const chunk = invChunk.slice(i, i + 500);
                const { error } = await supabase.from('inventory').upsert(chunk, { onConflict: 'sku' });
                if (error) throw error;
            }
            setProgress(66);
            setLog(p => [...p, '✅ Inventory uploaded.']);

            // 3. Upload Transactions
            setLog(p => [...p, `Uploading ${data.transactions.length} transactions...`]);
            for (let i = 0; i < data.transactions.length; i += 200) {
                const chunk = data.transactions.slice(i, i + 200).map(t => ({
                    id: t.id,
                    date: t.date,
                    sku: t.sku,
                    qty_sold: t.qtySold,
                    discount: t.discount,
                    property: t.property
                }));
                const { error } = await supabase.from('transactions').upsert(chunk);
                if (error) throw error;

                const percent = 66 + (((i + 200) / data.transactions.length) * 34);
                setProgress(Math.min(99, percent));
            }

            setLog(p => [...p, '✅ Transactions uploaded.', '🎉 MIGRATION COMPLETE!']);
            setStatus('success');
            setProgress(100);

        } catch (e: any) {
            console.error(e);
            setLog(p => [...p, `❌ Error: ${e.message || e.toString()}`]);
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-4 font-mono">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-lg shadow-2xl p-6 text-slate-300">
                <h3 className="text-xl font-bold text-white mb-4">Migrate to Supabase</h3>
                <div className="bg-black/50 p-4 rounded h-64 overflow-y-auto mb-4 text-xs font-mono border border-slate-800">
                    {log.map((l, i) => <div key={i} className="mb-1">{l}</div>)}
                    {status === 'idle' && <div className="text-slate-500">Ready to upload local data to cloud database...</div>}
                </div>
                {status === 'idle' && (
                    <p className="text-xs text-amber-400 mb-4 bg-amber-900/20 p-2 rounded border border-amber-900/50">
                        ⚠️ Warning: This will overwrite data in the connected Supabase database with the data currently loaded in this dashboard.
                    </p>
                )}
                <div className="w-full bg-slate-800 rounded-full h-2 mb-6">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded border border-slate-600 hover:bg-slate-800 transition-colors">Close</button>
                    {status === 'idle' && (
                        <button onClick={startMigration} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-500 font-bold shadow-lg shadow-indigo-900/20">
                            Start Migration
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
