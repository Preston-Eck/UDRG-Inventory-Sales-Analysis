import React, { useState, useMemo } from 'react';
import { Transaction, Product } from '../types';
import { Button, Card } from './ui';
import { supabase } from '../lib/supabaseClient';

interface OutlierReviewProps {
    transactions: Transaction[];
    products: Product[];
    onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
    onClose: () => void;
}

export const OutlierReview = ({ transactions, products, onUpdateTransaction, onClose }: OutlierReviewProps) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [filterType, setFilterType] = useState<'All' | 'HighQty' | 'NegativeMargin' | 'ZeroCost'>('All');

    // 1. Identify Outliers
    const outliers = useMemo(() => {
        return transactions.filter(t => {
            if (t.review_status === 'verified' || t.review_status === 'ignored') return false;

            const p = products.find(prod => prod.sku === t.sku);
            const cost = t.unit_cost_sold || p?.cost || 0;
            const price = t.unit_price_sold || p?.price || 0;
            const revenue = (t.qtySold * price) - (t.discount || 0);

            // Rules
            const isHighQty = t.qtySold > 500; // Arbitrary threshold
            const isNegativeMargin = revenue < (t.qtySold * cost) && revenue > 0; // Lost money but made revenue?
            const isZeroCost = cost === 0 && revenue > 10; // Made money on "free" item?
            const isAbnormalRevenue = revenue > 5000;

            if (filterType === 'HighQty') return isHighQty;
            if (filterType === 'NegativeMargin') return isNegativeMargin;
            if (filterType === 'ZeroCost') return isZeroCost;

            return isHighQty || isNegativeMargin || isZeroCost || isAbnormalRevenue;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, products, filterType]);

    const handleAction = async (action: 'verified' | 'ignored') => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;

        // Optimistic Update
        ids.forEach(id => onUpdateTransaction(id, { review_status: action }));
        setSelectedIds(new Set());

        // Remote Update
        const { error } = await supabase.from('transactions').update({ review_status: action }).in('id', ids);
        if (error) {
            console.error("Failed to update status", error);
            // Revert? For now assume success.
        }
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === outliers.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(outliers.map(t => t.id)));
    };

    return (
        <div className="absolute inset-0 bg-[var(--app-bg)] z-50 flex flex-col">
            <header className="bg-[var(--sidebar-bg)] border-b border-[var(--border-color)] p-4 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <i className="fa-solid fa-stethoscope text-amber-500"></i> Data Health Review
                    </h2>
                    <p className="text-sm text-[var(--text-muted)]">Found {outliers.length} pending anomalies.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={onClose} variant="secondary">Close</Button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                {/* Sidebar Filter */}
                <div className="w-48 bg-[var(--card-bg)] border-r border-[var(--border-color)] p-4 space-y-2">
                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase">Filter Issues</label>
                    {['All', 'HighQty', 'NegativeMargin', 'ZeroCost'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilterType(f as any)}
                            className={`w-full text-left px-3 py-2 rounded text-xs ${filterType === f ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-color)] hover:bg-[var(--app-bg)]'}`}
                        >
                            {f === 'HighQty' ? 'High Quantity (>500)' : f === 'NegativeMargin' ? 'Negative Margin' : f === 'ZeroCost' ? 'Zero Cost' : 'All Issues'}
                        </button>
                    ))}
                </div>

                {/* Main Table */}
                <div className="flex-1 flex flex-col bg-[var(--app-bg)] p-4">
                    <div className="mb-4 flex gap-2 items-center bg-[var(--card-bg)] p-2 rounded border border-[var(--border-color)]">
                        <span className="text-xs text-[var(--text-muted)]">{selectedIds.size} selected</span>
                        <div className="h-4 w-px bg-[var(--border-color)]"></div>
                        <Button onClick={() => handleAction('verified')} disabled={selectedIds.size === 0} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"><i className="fa-solid fa-check mr-1"></i> Mark Verified</Button>
                        <Button onClick={() => handleAction('ignored')} disabled={selectedIds.size === 0} className="text-xs bg-red-600 hover:bg-red-500 text-white"><i className="fa-solid fa-eye-slash mr-1"></i> Ignore</Button>
                    </div>

                    <div className="flex-1 overflow-auto border border-[var(--border-color)] rounded bg-[var(--card-bg)]">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[var(--sidebar-bg)] sticky top-0 z-10 text-[var(--text-muted)] uppercase">
                                <tr>
                                    <th className="p-3 w-8"><input type="checkbox" checked={outliers.length > 0 && selectedIds.size === outliers.length} onChange={selectAll} /></th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">SKU / Product</th>
                                    <th className="p-3 text-right">Qty</th>
                                    <th className="p-3 text-right">Price Used</th>
                                    <th className="p-3 text-right">Cost Used</th>
                                    <th className="p-3 text-right">Net Revenue</th>
                                    <th className="p-3">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)]">
                                {outliers.map(t => {
                                    const p = products.find(prod => prod.sku === t.sku);
                                    const revenue = (t.qtySold * (t.unit_price_sold || p?.price || 0)) - (t.discount || 0);
                                    const cost = t.unit_cost_sold || p?.cost || 0;

                                    let reason = [];
                                    if (t.qtySold > 500) reason.push("High Qty");
                                    if (revenue < (t.qtySold * cost)) reason.push("Negative Margin");
                                    if (cost === 0) reason.push("Zero Cost");

                                    return (
                                        <tr key={t.id} className={`hover:bg-[var(--app-bg)] ${selectedIds.has(t.id) ? 'bg-blue-500/10' : ''}`}>
                                            <td className="p-3"><input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} /></td>
                                            <td className="p-3 text-[var(--text-muted)]">{t.date}</td>
                                            <td className="p-3">
                                                <div className="font-bold text-[var(--primary-color)]">{t.sku}</div>
                                                <div className="truncate max-w-[200px]">{p?.name || 'Unknown'}</div>
                                            </td>
                                            <td className="p-3 text-right font-mono">{t.qtySold}</td>
                                            <td className="p-3 text-right font-mono">${(t.unit_price_sold || p?.price || 0).toFixed(2)}</td>
                                            <td className="p-3 text-right font-mono text-red-400">${cost.toFixed(2)}</td>
                                            <td className="p-3 text-right font-mono text-emerald-400">${revenue.toLocaleString()}</td>
                                            <td className="p-3"><span className="bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded text-[10px]">{reason.join(', ')}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {outliers.length === 0 && <div className="p-8 text-center text-[var(--text-muted)]">No anomalies found with current filters! 🎉</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
