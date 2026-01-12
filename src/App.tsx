
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, checkSupabaseConnection } from './lib/supabaseClient';
import { generateMockData, MOCK_PRODUCTS } from './utils/mockData';
import { Button, Card, HeaderWithInfo } from './components/ui';
import { SettingsModal, MigrationModal, CellDetailModal } from './components/modals';
import { CalendarView } from './components/CalendarView';
import { AppSettings, DEFAULT_SETTINGS, FilterState, AnalysisRow, Product, Transaction, InventoryState, CellLogic, ChatMessage } from './types';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const App = () => {
    const [view, setView] = useState<'dashboard' | 'calendar'>('dashboard');
    const [products, setProducts] = useState<Product[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [inventory, setInventory] = useState<InventoryState[]>([]);
    const [loading, setLoading] = useState(true);
    const [debugInfo, setDebugInfo] = useState<any>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isMigrationOpen, setIsMigrationOpen] = useState(false);

    // Filter State
    const [filters, setFilters] = useState<FilterState>({
        search: '',
        searchFields: ['name'],
        categories: [],
        departments: [],
        vendors: [],
        dateStart: '2023-01-01',
        dateEnd: new Date().toISOString().split('T')[0],
        groupBy: 'sku',
        selectedProperty: 'All',
        sortBy: 'revenue',
        sortDir: 'desc',
        showColumns: { sold: true, revenue: false, profit: true, onHand: true, demand: true, reorder: true }
    });

    const [draftFilters, setDraftFilters] = useState(filters);
    const [customGroups, setCustomGroups] = useState<{ id: string, name: string, skus: string[] }[]>([]);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [newGroupName, setNewGroupName] = useState('');

    // Detail Modal State
    const [detailModal, setDetailModal] = useState<{ row: AnalysisRow, cell: CellLogic } | null>(null);

    // Forecast State
    const [forecastData, setForecastData] = useState<AnalysisRow[]>([]);
    const [isForecasting, setIsForecasting] = useState(false);

    // Chat AI State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'model', text: 'How can I help with your inventory planning today?', timestamp: new Date() }]);
    const [inputMessage, setInputMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const [model, setModel] = useState('gemini-3-flash-preview');

    // Pagination for Dashboard Table
    const [dashboardPage, setDashboardPage] = useState(1);
    const dashboardItemsPerPage = 50;

    useEffect(() => {
        const today = new Date();
        // Default to a wide range to ensure 2025 data is visible
        // const ninetyDaysAgo = new Date();
        // ninetyDaysAgo.setDate(today.getDate() - 90);
        // const start = ninetyDaysAgo.toISOString().split('T')[0];
        const start = '2025-01-01'; // Fixed start date to capture historical CSV data
        const end = today.toISOString().split('T')[0];

        setFilters(prev => ({ ...prev, dateStart: start, dateEnd: end }));
        setDraftFilters(prev => ({ ...prev, dateStart: start, dateEnd: end }));
        loadServerData();
    }, []);

    const loadServerData = async () => {
        setLoading(true);
        setDebugInfo(null);
        console.log("Attempting to fetch from Supabase...");
        try {
            const conn = await checkSupabaseConnection();
            if (conn.success && (conn.count || 0) > 0) {
                console.log("Supabase has data. Fetching full dataset...");
                const [resProducts, resInventory, resTransactions] = await Promise.all([
                    supabase.from('products').select('*'),
                    supabase.from('inventory').select('*'),
                    supabase.from('transactions').select('*')
                ]);
                if (resProducts.error) throw resProducts.error;
                if (resInventory.error) throw resInventory.error;
                if (resTransactions.error) throw resTransactions.error;

                const sbProducts: Product[] = resProducts.data.map(p => ({
                    sku: p.sku, name: p.name, department: p.department || '', category: p.category, vendor: p.vendor || '', cost: Number(p.cost) || 0, price: Number(p.price) || 0
                }));
                const sbInventory: InventoryState[] = resInventory.data.map(i => ({ sku: i.sku, qtyOnHand: Number(i.qty_on_hand) || 0 }));
                const sbTransactions: Transaction[] = resTransactions.data.map(t => ({
                    id: t.id || Math.random().toString(), date: t.date, sku: t.sku, qtySold: Number(t.qty_sold) || 0, discount: Number(t.discount) || 0, property: t.property || 'Default'
                }));

                setProducts(sbProducts); setInventory(sbInventory); setTransactions(sbTransactions);
                setLoading(false); return;
            }
        } catch (e) { console.warn("Supabase Fetch Failed, falling back", e); }

        if (window.google && window.google.script) {
            window.google.script.run.withSuccessHandler((data: any) => {
                // Check if ANY data returned, or if explicit debug info exists
                if (data && (data.products?.length > 0 || data.transactions?.length > 0 || data.inventory?.length > 0)) {
                    console.log("GAS Data Received:", data);
                    setProducts(data.products || []);
                    setTransactions(data.transactions || []);
                    setInventory(data.inventory || []);
                } else {
                    // Force debug display if we got here (empty data)
                    const errorMsg = data?.debug ? null : "Received empty data structure from GAS.";
                    setDebugInfo(data?.debug || { error: errorMsg, logs: ["Full Data Object is empty or missing arrays."] });
                    setProducts([]);
                }
                setLoading(false);
            }).withFailureHandler((error: any) => {
                console.error('GAS Error:', error); setDebugInfo({ error: error.message, details: "Failed to connect." }); setLoading(false);
            }).getData();
        } else {
            console.log("Using Mock Data");
            const mock = generateMockData();
            setProducts(mock.products); setTransactions(mock.transactions); setInventory(mock.inventory); setLoading(false);
        }
    };

    const { availableProperties, availableDepartments, availableVendors } = useMemo(() => {
        const props = new Set(transactions.map(t => t.property).filter(Boolean));
        const depts = new Set(products.map(p => p.department).filter(Boolean));
        const vendors = new Set(products.map(p => p.vendor).filter(Boolean));
        return {
            availableProperties: Array.from(props).sort(),
            availableDepartments: Array.from(depts).sort(),
            availableVendors: Array.from(vendors).sort()
        };
    }, [transactions, products]);

    // Data Analysis Logic
    const analyzedData: AnalysisRow[] = useMemo(() => {
        // Pre-filter transactions
        const filteredTx = transactions.filter(t => {
            const d = t.date;
            return d >= filters.dateStart && d <= filters.dateEnd && (filters.selectedProperty === 'All' || t.property === filters.selectedProperty);
        });

        // Grouping Maps
        const txBySku = new Map<string, Transaction[]>();
        filteredTx.forEach(t => { if (!txBySku.has(t.sku)) txBySku.set(t.sku, []); txBySku.get(t.sku)!.push(t); });
        const invBySku = new Map<string, number>();
        inventory.forEach(i => invBySku.set(i.sku, i.qtyOnHand));

        const calculateMetrics = (skus: string[], id: string, name: string, category: string, isGroup: boolean): AnalysisRow => {
            let qtySold = 0, revenue = 0, profit = 0, discounts = 0, productCost = 0, qtyOnHand = 0;
            const vendorSet = new Set<string>(); const deptSet = new Set<string>();

            skus.forEach(sku => {
                const p = products.find(p => p.sku === sku);
                if (!p) return;
                vendorSet.add(p.vendor); deptSet.add(p.department);
                productCost += p.cost;
                qtyOnHand += (invBySku.get(sku) || 0);

                const txs = txBySku.get(sku) || [];
                txs.forEach(t => {
                    qtySold += t.qtySold;
                    const gross = t.qtySold * p.price;
                    const disc = t.discount || 0;
                    revenue += (gross - disc);
                    discounts += disc;
                    profit += ((gross - disc) - (t.qtySold * p.cost));
                });
            });

            if (isGroup && skus.length > 0) productCost = productCost / skus.length; // Avg cost for group

            const departmentLabel = Array.from(deptSet).join(', ');
            const vendorLabel = Array.from(vendorSet).join(', ');

            const d1 = new Date(filters.dateStart); const d2 = new Date(filters.dateEnd);
            const monthsDiff = Math.max(1, (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30));
            const avgMonthlyDemand = qtySold / monthsDiff;
            const monthsOfSupply = avgMonthlyDemand > 0 ? qtyOnHand / avgMonthlyDemand : 999;
            const suggestedReorder = Math.max(0, (avgMonthlyDemand * 2) - qtyOnHand);

            return {
                id, name, category, isGroup, skus, productCost, department: departmentLabel, vendor: vendorLabel,
                qtySold, grossRevenue: revenue + discounts, revenue, profit, discounts, qtyOnHand,
                avgMonthlyDemand, monthsOfSupply, suggestedReorder, calendarSchedule: [], hasHistory: false
            };
        };

        let rows: AnalysisRow[] = [];
        if (filters.groupBy === 'sku') {
            rows = products.map(p => calculateMetrics([p.sku], p.sku, p.name, p.category, false));
        } else if (filters.groupBy === 'category') {
            const cats = Array.from(new Set(products.map(p => p.category)));
            rows = cats.map((c: string) => {
                const catProducts = products.filter(p => p.category === c);
                const catSkus = catProducts.map(p => p.sku);
                return calculateMetrics(catSkus, c, `Category: ${c}`, c, true);
            });
        } else if (filters.groupBy === 'custom') {
            rows = customGroups.map(g => calculateMetrics(g.skus, g.id, g.name, 'Custom Group', true));
            const groupedSkus = new Set(customGroups.flatMap(g => g.skus));
            const ungrouped = products.filter(p => !groupedSkus.has(p.sku));
            rows = [...rows, ...ungrouped.map(p => calculateMetrics([p.sku], p.sku, p.name, p.category, false))];
        }

        return rows.filter(r => {
            const matchSearch = r.name.toLowerCase().includes(filters.search.toLowerCase());
            const matchCat = filters.categories.length === 0 || filters.categories.includes(r.category);
            const matchDept = filters.departments.length === 0 || filters.departments.some(d => r.department.includes(d));
            const matchVendor = filters.vendors.length === 0 || filters.vendors.some(v => r.vendor.includes(v));
            return matchSearch && matchCat && matchDept && matchVendor;
        }).sort((a, b) => {
            const field = filters.sortBy; const dir = filters.sortDir === 'asc' ? 1 : -1;
            const valA = a[field as keyof AnalysisRow]; const valB = b[field as keyof AnalysisRow];
            if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
            // @ts-ignore
            return (valA - valB) * dir;
        });
    }, [products, transactions, inventory, customGroups, filters]);

    const handleApplyFilters = () => setFilters(draftFilters);
    const handleSort = (field: string) => setFilters(p => ({ ...p, sortBy: field as any, sortDir: p.sortBy === field && p.sortDir === 'desc' ? 'asc' : 'desc' }));
    const handleSearchFieldChange = (f: string) => setDraftFilters(p => ({ ...p, searchFields: p.searchFields.includes(f) ? p.searchFields.filter(x => x !== f) : [...p.searchFields, f] }));

    // Manual Forecast
    const handleRunForecast = () => {
        setIsForecasting(true);
        setTimeout(() => {
            const today = new Date();
            const pTx = transactions.filter(t => filters.selectedProperty === 'All' || t.property === filters.selectedProperty);

            const newRows = analyzedData.map(row => {
                const schedule: CellLogic[] = [];
                let currentStock = row.qtyOnHand;
                let hasHistory = false;

                for (let i = 1; i <= 12; i++) {
                    const tDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
                    const tMonth = tDate.getMonth();
                    const tYear = tDate.getFullYear();

                    let histSum = 0; let years = 0;
                    for (let y = 1; y <= 3; y++) {
                        const yTx = pTx.filter(t => {
                            const d = new Date(t.date);
                            return row.skus.includes(t.sku) && d.getMonth() === tMonth && d.getFullYear() === tYear - y;
                        });
                        const sum = yTx.reduce((acc, t) => acc + t.qtySold, 0);
                        if (sum > 0 || yTx.length > 0) { histSum += sum; years++; hasHistory = true; }
                    }
                    const avg = years > 0 ? histSum / years : 0;
                    const forecast = avg > 0 ? Math.ceil(avg * 1.05) : Math.ceil(row.qtySold / 3); // Fallback

                    const target = forecast;
                    const open = currentStock;
                    const need = (forecast + target) - open;
                    const buy = Math.max(0, need);
                    currentStock = Math.max(0, open + buy - forecast);

                    schedule.push({ monthIndex: i - 1, monthLabel: tDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), forecastedDemand: forecast, openingStock: open, targetStock: target, restockQty: buy, restockCost: buy * row.productCost, closingStock: currentStock, historicalAverage: avg });
                }
                return { ...row, calendarSchedule: schedule, hasHistory };
            });
            setForecastData(newRows); setIsForecasting(false); setView('calendar');
        }, 50);
    };

    const handleSendMessage = async (customPrompt?: string) => {
        const text = customPrompt || inputMessage;
        if (!text.trim()) return;
        setIsChatOpen(true); setMessages(p => [...p, { role: 'user', text, timestamp: new Date() }]);
        if (!customPrompt) setInputMessage(''); setIsThinking(true);

        let context = "";
        const matches = analyzedData.filter(r => text.toLowerCase().includes(r.name.toLowerCase()));
        if (matches.length > 0) {
            context += "RELEVANT ITEMS:\n" + matches.slice(0, 5).map(r => `- ${r.name}: OnHand=${r.qtyOnHand}, Sold=${r.qtySold}`).join('\n');
        } else {
            const top = analyzedData.slice(0, 5);
            context += "TOP ITEMS:\n" + top.map(r => `- ${r.name}: Revenue=$${r.revenue}`).join('\n');
        }
        const totalRev = analyzedData.reduce((a, b) => a + b.revenue, 0);
        context += `\nGLOBAL: Revenue=$${totalRev}`;

        const prompt = `User: "${text}"\nCONTEXT:\n${context}\nINSTRUCTION: Answer briefly based on data.`;

        if (window.google?.script) {
            window.google.script.run.withSuccessHandler((res: string) => {
                setMessages(p => [...p, { role: 'model', text: res, timestamp: new Date() }]); setIsThinking(false);
            }).withFailureHandler((e: any) => {
                setMessages(p => [...p, { role: 'model', text: "Error: " + e.message, isError: true, timestamp: new Date() }]); setIsThinking(false);
            }).callGeminiAPI(prompt, model);
        } else {
            setTimeout(() => {
                setMessages(p => [...p, { role: 'model', text: `[Local Dev] Received: ${text}\nContext Used: ${context.substring(0, 50)}...`, timestamp: new Date() }]); setIsThinking(false);
            }, 1000);
        }
    };

    // Pagination
    const paginatedDashboardRows = analyzedData.slice((dashboardPage - 1) * dashboardItemsPerPage, dashboardPage * dashboardItemsPerPage);
    const dashboardTotalPages = Math.ceil(analyzedData.length / dashboardItemsPerPage);

    // Render Side Effects
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    return (
        <div className={`min-h-screen flex flex-col md:flex-row bg-[var(--app-bg)] text-[var(--text-color)] font-sans ${settings.fontSize}`}>
            <style>{`:root { --app-bg: ${settings.colors.background}; --sidebar-bg: ${settings.colors.sidebar}; --card-bg: ${settings.colors.card}; --primary-color: ${settings.colors.primary}; --text-color: ${settings.colors.text}; --text-muted: ${settings.colors.text}80; --border-color: ${settings.colors.border}; }`}</style>

            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col h-screen flex-shrink-0 z-20">
                <div className="p-4"><h1 className="text-xl font-bold text-[var(--primary-color)]"><i className="fa-solid fa-boxes-stacked"></i> UDRG Reports</h1></div>
                <div className="px-4 mb-6 space-y-1">
                    <button onClick={() => setView('dashboard')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${view === 'dashboard' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--app-bg)]'}`}><i className="fa-solid fa-chart-pie w-6"></i> Dashboard</button>
                    <button onClick={() => setView('calendar')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${view === 'calendar' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--app-bg)]'}`}><i className="fa-solid fa-calendar-days w-6"></i> Forecast</button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-6">
                    <div className="bg-[var(--app-bg)] p-3 rounded border border-[var(--border-color)]">
                        <div className="flex justify-between items-center mb-2"><label className="text-xs font-semibold text-[var(--text-muted)] uppercase">Data Sync</label><div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div></div>
                        <button onClick={loadServerData} className="w-full bg-[var(--card-bg)] hover:bg-[var(--border-color)] text-xs py-1.5 rounded border border-[var(--border-color)] transition-colors"><i className="fa-solid fa-sync mr-1"></i> Refresh</button>
                    </div>

                    {/* Filters */}
                    <div>
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 block">Store</label>
                        <select value={filters.selectedProperty} onChange={e => setFilters(p => ({ ...p, selectedProperty: e.target.value }))} className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-2 outline-none">
                            <option value="All">All Locations</option>
                            {availableProperties.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 block">Search</label>
                        <input type="text" className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-2 outline-none" placeholder="Search..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 block">Period</label>
                        <div className="flex items-center gap-2">
                            <input type="date" value={filters.dateStart} onChange={e => setFilters(p => ({ ...p, dateStart: e.target.value }))} className="w-full bg-[var(--card-bg)] text-[10px] border border-[var(--border-color)] rounded p-1" />
                            <span className="text-[var(--text-muted)] text-[10px]">to</span>
                            <input type="date" value={filters.dateEnd} onChange={e => setFilters(p => ({ ...p, dateEnd: e.target.value }))} className="w-full bg-[var(--card-bg)] text-[10px] border border-[var(--border-color)] rounded p-1" />
                        </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--border-color)]">
                        <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-[var(--text-muted)] hover:bg-[var(--app-bg)]"><i className="fa-solid fa-gear"></i> Settings</button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden flex flex-col relative h-screen">
                <header className="bg-[var(--sidebar-bg)] border-b border-[var(--border-color)] p-6 flex-shrink-0 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold">{view === 'dashboard' ? 'Performance Dashboard' : 'Restock Forecast'}</h2>
                        <p className="text-[var(--text-muted)] text-sm">{view === 'dashboard' ? `${filters.dateStart} to ${filters.dateEnd} • ${filters.selectedProperty}` : 'Projection based on Seasonality'}</p>
                    </div>
                    <div className="flex gap-3">
                        {view === 'dashboard' && <Button onClick={handleRunForecast} variant="primary"><i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Run Forecast</Button>}
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-6">
                    {view === 'dashboard' ? (
                        <Card className="h-full overflow-hidden flex flex-col p-0 bg-[var(--app-bg)]">
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[var(--sidebar-bg)] sticky top-0 z-10 text-xs uppercase font-semibold text-[var(--text-muted)]">
                                        <tr>
                                            <HeaderWithInfo label="Item Name" sortable onSort={() => handleSort('name')} currentSort={filters.sortBy === 'name'} currentDir={filters.sortDir} infoQuery="Product Name" />
                                            <HeaderWithInfo label="Category" infoQuery="Product Category" />
                                            <HeaderWithInfo label="Sold" className="text-right" sortable onSort={() => handleSort('qtySold')} currentSort={filters.sortBy === 'productCost'} currentDir={filters.sortDir} infoQuery="Units Sold" />
                                            <HeaderWithInfo label="Revenue" className="text-right" sortable onSort={() => handleSort('revenue')} currentSort={filters.sortBy === 'revenue'} currentDir={filters.sortDir} infoQuery="Net Revenue" />
                                            <HeaderWithInfo label="Profit" className="text-right" sortable onSort={() => handleSort('profit')} currentSort={filters.sortBy === 'profit'} currentDir={filters.sortDir} infoQuery="Gross Profit" />
                                            <HeaderWithInfo label="On Hand" className="text-right" infoQuery="Current Inventory" />
                                            <HeaderWithInfo label="Restock?" className="text-right" sortable onSort={() => handleSort('suggestedReorder')} currentSort={filters.sortBy === 'suggestedReorder'} currentDir={filters.sortDir} infoQuery="Suggested Order" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-color)] bg-[var(--card-bg)]">
                                        {paginatedDashboardRows.map(row => (
                                            <tr key={row.id} className="hover:bg-[var(--app-bg)]/50 transition-colors">
                                                <td className="px-4 py-3 font-medium">{row.name}<div className="text-[10px] text-[var(--text-muted)]">{row.vendor}</div></td>
                                                <td className="px-4 py-3"><span className="bg-[var(--app-bg)] px-2 py-0.5 rounded text-xs">{row.category}</span></td>
                                                <td className="px-4 py-3 text-right font-mono">{row.qtySold}</td>
                                                <td className="px-4 py-3 text-right font-mono text-blue-300">${row.revenue.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">${row.profit.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-right font-mono">{row.qtyOnHand}</td>
                                                <td className="px-4 py-3 text-right">{row.suggestedReorder > 0 ? <span className="bg-red-900/30 text-red-400 border border-red-900/50 px-2 py-0.5 rounded text-xs font-bold">+{Math.ceil(row.suggestedReorder)}</span> : <span className="text-slate-600">-</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="bg-[var(--sidebar-bg)] border-t border-[var(--border-color)] p-4 flex justify-between items-center text-sm sticky bottom-0 z-30">
                                <div className="flex items-center gap-4">
                                    <Button variant="secondary" onClick={() => setDashboardPage(p => Math.max(1, p - 1))} disabled={dashboardPage === 1}>Previous</Button>
                                    <span className="text-[var(--text-muted)]">Page {dashboardPage} of {dashboardTotalPages}</span>
                                    <Button variant="secondary" onClick={() => setDashboardPage(p => Math.min(dashboardTotalPages, p + 1))} disabled={dashboardPage === dashboardTotalPages}>Next</Button>
                                </div>
                                <div className="text-[var(--text-muted)] text-xs">Showing {paginatedDashboardRows.length} items</div>
                            </div>
                        </Card>
                    ) : (
                        <Card className="p-0 border-0 shadow-xl overflow-hidden bg-[var(--app-bg)] h-full flex flex-col relative">
                            <CalendarView rows={view === 'calendar' ? forecastData : analyzedData} onCellClick={(r, c) => setDetailModal({ row: r, cell: c })} sortConfig={{ sortBy: filters.sortBy, sortDir: filters.sortDir }} onSort={handleSort} />
                        </Card>
                    )}
                </div>
            </main>

            {/* Chat Interface */}
            {!isChatOpen && <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 bg-[var(--primary-color)] text-white rounded-full p-4 shadow-xl z-50 hover:scale-105 transition-transform"><i className="fa-solid fa-robot text-xl"></i></button>}

            <div className={`fixed inset-y-0 right-0 w-96 bg-[var(--card-bg)] border-l border-[var(--border-color)] shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--sidebar-bg)]"><h3 className="font-bold flex items-center gap-2"><i className="fa-solid fa-sparkles text-[var(--primary-color)]"></i> Gemini Expert</h3><button onClick={() => setIsChatOpen(false)} className="text-[var(--text-muted)] hover:text-white"><i className="fa-solid fa-times"></i></button></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((m, i) => <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap shadow-sm ${m.role === 'user' ? 'bg-[var(--primary-color)] text-white' : 'bg-[var(--app-bg)] text-[var(--text-color)] border border-[var(--border-color)]'}`}>{m.text}</div></div>)}
                    {isThinking && <div className="text-[var(--text-muted)] text-xs animate-pulse pl-2">Analyzing...</div>}
                    <div ref={chatEndRef} />
                </div>
                <div className="p-4 border-t border-[var(--border-color)] bg-[var(--sidebar-bg)] flex gap-2">
                    <input className="flex-1 bg-[var(--app-bg)] border border-[var(--border-color)] rounded px-3 py-2 text-sm outline-none focus:border-[var(--primary-color)]" placeholder="Ask AI..." value={inputMessage} onChange={e => setInputMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
                    <button onClick={() => handleSendMessage()} disabled={isThinking} className="bg-[var(--primary-color)] text-white px-3 rounded hover:opacity-90"><i className="fa-solid fa-paper-plane"></i></button>
                </div>
            </div>

            {isSettingsOpen && <SettingsModal settings={settings} onSave={(s) => { setSettings(s); setIsSettingsOpen(false); }} onClose={() => setIsSettingsOpen(false)} onMigrate={() => setIsMigrationOpen(true)} />}
            {isMigrationOpen && <MigrationModal data={{ products, transactions, inventory }} onClose={() => setIsMigrationOpen(false)} />}
            {detailModal && <CellDetailModal row={detailModal.row} cell={detailModal.cell} onClose={() => setDetailModal(null)} onAiExplain={() => handleSendMessage("EXPLAIN_CELL")} isThinking={isThinking} />}

            {/* Debug Overlay */}
            {debugInfo && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-900/90 text-white p-4 rounded shadow-2xl z-[100] max-w-2xl border border-red-500 backdrop-blur-sm">
                    <h4 className="font-bold flex items-center gap-2 mb-2"><i className="fa-solid fa-triangle-exclamation"></i> Data Load Issue</h4>
                    <p className="text-sm mb-2">{debugInfo.error || "No data returned from Google Sheets."}</p>
                    {debugInfo.logs && (
                        <ul className="text-xs font-mono bg-black/30 p-2 rounded space-y-1">
                            {debugInfo.logs.map((l: string, i: number) => <li key={i}>{l}</li>)}
                        </ul>
                    )}
                    <button onClick={() => setDebugInfo(null)} className="mt-3 text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded">Dismiss</button>
                </div>
            )}
        </div>
    );
};

export default App;
