
import React, { useState } from 'react';
import { AnalysisRow, CellLogic } from '../types';
import { HeaderWithInfo } from './ui';

export const CalendarView = ({ rows, onCellClick, sortConfig, onSort }: {
    rows: AnalysisRow[],
    onCellClick: (row: AnalysisRow, cell: CellLogic) => void,
    sortConfig: { sortBy: string, sortDir: 'asc' | 'desc' },
    onSort: (field: string) => void
}) => {
    const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

    // Toggle month selection
    const handleMonthClick = (monthIndex: number) => {
        setSelectedMonths(prev =>
            prev.includes(monthIndex) ? prev.filter(m => m !== monthIndex) : [...prev, monthIndex]
        );
    };

    const getMonthTotal = (monthIndex: number) => {
        return rows.reduce((sum, row) => sum + row.calendarSchedule[monthIndex].restockQty, 0);
    };

    const getMonthCost = (monthIndex: number) => {
        return rows.reduce((sum, row) => sum + row.calendarSchedule[monthIndex].restockCost, 0);
    };

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;
    const totalPages = Math.ceil(rows.length / itemsPerPage);
    const paginatedRows = rows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (rows.length === 0) return <div className="p-8 text-center text-slate-500">No forecast data generated. Click "Run Forecast" on the Dashboard.</div>

    const monthLabels = rows[0].calendarSchedule.map(c => c.monthLabel);

    return (
        <div className="flex flex-col h-full">
            <div className="overflow-auto pb-12 flex-1">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[var(--sidebar-bg)] sticky top-0 z-10 shadow-sm text-xs uppercase font-semibold text-[var(--text-muted)]">
                        <tr>
                            <HeaderWithInfo label="Product" className="sticky left-0 bg-[var(--sidebar-bg)] z-20 w-64 border-r border-[var(--border-color)]" infoQuery="Product Name"
                                sortable onSort={() => onSort('name')} currentSort={sortConfig.sortBy === 'name'} currentDir={sortConfig.sortDir}
                            />
                            <HeaderWithInfo label="On Hand" className="text-right w-24 border-r border-[var(--border-color)]" infoQuery="Current Stock Level" />
                            {monthLabels.map((m, i) => (
                                <th key={i} className={`px-2 py-3 text-center min-w-[80px] cursor-pointer hover:text-white transition-colors border-r border-[var(--border-color)] ${selectedMonths.includes(i) ? 'bg-[var(--primary-color)]/20 text-[var(--primary-color)]' : ''}`} onClick={() => handleMonthClick(i)}>
                                    <div>{m}</div>
                                    {selectedMonths.includes(i) && <div className="text-[9px] mt-1 font-mono">Selected</div>}
                                </th>
                            ))}
                        </tr>
                        {/* Totals Row */}
                        <tr className="bg-[var(--app-bg)] border-b border-[var(--border-color)]">
                            <th className="sticky left-0 bg-[var(--app-bg)] z-20 border-r border-[var(--border-color)] px-4 py-2 text-xs italic text-[var(--text-muted)]">Monthly Totals</th>
                            <th className="border-r border-[var(--border-color)]"></th>
                            {monthLabels.map((_, i) => (
                                <th key={i} className="text-center py-2 border-r border-[var(--border-color)]">
                                    <div className="text-[10px] text-emerald-400 font-mono">+{getMonthTotal(i).toLocaleString()}</div>
                                    <div className="text-[9px] text-slate-500">${(getMonthCost(i) / 1000).toFixed(1)}k</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)] bg-[var(--card-bg)]">
                        {paginatedRows.map(row => (
                            <tr key={row.id} className="hover:bg-[var(--app-bg)]/50 transition-colors group">
                                <td className="px-4 py-2 sticky left-0 bg-[var(--card-bg)] group-hover:bg-[var(--app-bg)]/50 border-r border-[var(--border-color)] z-10">
                                    <div className="font-medium text-sm text-[var(--text-color)] truncate max-w-[200px]">{row.name}</div>
                                    <div className="text-[10px] text-[var(--text-muted)]">{row.skus.join(', ')}</div>
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-xs border-r border-[var(--border-color)] text-slate-300 bg-[var(--app-bg)]/20">{row.qtyOnHand}</td>
                                {row.calendarSchedule.map((cell, i) => (
                                    <td
                                        key={i}
                                        onClick={() => onCellClick(row, cell)}
                                        className={`px-1 py-1 text-center border-r border-[var(--border-color)] cursor-pointer hover:bg-[var(--primary-color)]/10 transition-colors relative ${selectedMonths.includes(i) ? 'bg-[var(--primary-color)]/5' : ''}`}
                                    >
                                        {/* Cell Content: Top = Order Qty, Bottom = Stock Status */}
                                        <div className="flex flex-col h-full justify-between gap-1">
                                            {cell.restockQty > 0 ? (
                                                <div className="bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded px-1">{cell.restockQty}</div>
                                            ) : (
                                                <div className="h-4"></div>
                                            )}
                                            <div className={`text-[10px] font-mono ${cell.closingStock < cell.targetStock ? 'text-red-400' : 'text-slate-600'}`}>
                                                {cell.closingStock}
                                            </div>
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer / Pagination */}
            <div className="bg-[var(--sidebar-bg)] border-t border-[var(--border-color)] p-3 flex justify-between items-center text-xs sticky bottom-0 z-30">
                <div className="flex gap-4">
                    {selectedMonths.length > 0 ? (
                        <div className="flex gap-4 text-emerald-400 font-mono">
                            <span>Selected Buy: <span className="font-bold">{selectedMonths.reduce((sum, m) => sum + getMonthTotal(m), 0).toLocaleString()} units</span></span>
                            <span>Est Cost: <span className="font-bold">${selectedMonths.reduce((sum, m) => sum + getMonthCost(m), 0).toLocaleString()}</span></span>
                        </div>
                    ) : <span className="text-[var(--text-muted)]">Select months to calculate purchase orders.</span>}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded border border-[var(--border-color)] disabled:opacity-50">Prev</button>
                    <span className="text-[var(--text-muted)]">Page {currentPage} of {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded border border-[var(--border-color)] disabled:opacity-50">Next</button>
                </div>
            </div>
        </div>
    );
};
