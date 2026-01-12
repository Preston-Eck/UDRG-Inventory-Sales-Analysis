
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, checkSupabaseConnection } from './lib/supabaseClient';
import { generateMockData, MOCK_PRODUCTS } from './utils/mockData';
import { Button, Card, HeaderWithInfo } from './components/ui';
import { SettingsModal, MigrationModal, CellDetailModal } from './components/modals';
import { FilterPanel } from './components/FilterPanel';
import { TransactionEditModal } from './components/TransactionEditModal';
import { OutlierReview } from './components/OutlierReview';
import { AppSettings, DEFAULT_SETTINGS, FilterState, AnalysisRow, Product, Transaction, InventoryState, CellLogic, ChatMessage } from './types';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const App = () => {
    const [view, setView] = useState<'dashboard'>('dashboard');
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
        selectedProperty: [],
        sortBy: 'revenue',
        sortDir: 'desc',
        showColumns: { sold: true, grossRevenue: false, discounts: false, revenue: true, profit: true, onHand: true, reorder: true },
        hideZeroSales: false,
        hideZeroOnHand: false
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
    const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);

    // Outlier Review State
    const [isOutlierReviewOpen, setIsOutlierReviewOpen] = useState(false);
    const [isMissingCostModalOpen, setIsMissingCostModalOpen] = useState(false);
    const [selectedRowDetail, setSelectedRowDetail] = useState<AnalysisRow | null>(null);
    const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

    const handleUpdateTransaction = (id: string, updates: Partial<Transaction>) => {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
        // Update in Supabase
        supabase.from('transactions').update(updates).eq('id', id).then(({ error }) => {
            if (error) console.error('Failed to update transaction:', error);
        });
    };

    const handleDeleteTransaction = async (id: string) => {
        if (!confirm('Are you sure you want to delete this transaction? This cannot be undone.')) return;

        setTransactions(prev => prev.filter(t => t.id !== id));
        // Delete from Supabase
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) {
            console.error('Failed to delete transaction:', error);
            alert('Failed to delete transaction from database');
        }
    };

    const outlierCount = useMemo(() => {
        return transactions.filter(t => {
            if (t.review_status === 'verified' || t.review_status === 'ignored') return false;
            const p = products.find(prod => prod.sku === t.sku);
            const cost = t.unit_cost_sold || p?.cost || 0;
            const revenue = (t.qtySold * (t.unit_price_sold || p?.price || 0)) - (t.discount || 0);
            return t.qtySold > 500 || (revenue < t.qtySold * cost && revenue > 0) || (cost === 0 && revenue > 10) || revenue > 5000;
        }).length;
    }, [transactions, products]);

    // Pagination for Dashboard Table
    const [dashboardPage, setDashboardPage] = useState(1);
    const dashboardItemsPerPage = 50;
    const [loadingProgress, setLoadingProgress] = useState<string>('');

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

    // Cache configuration
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
    const CACHE_KEYS = {
        products: 'udrg_products_cache',
        inventory: 'udrg_inventory_cache',
        transactions: 'udrg_transactions_cache',
        timestamp: 'udrg_cache_timestamp'
    };

    const getCachedData = (key: string) => {
        try {
            const timestamp = localStorage.getItem(CACHE_KEYS.timestamp);
            if (timestamp && Date.now() - parseInt(timestamp) < CACHE_DURATION) {
                const cached = localStorage.getItem(key);
                return cached ? JSON.parse(cached) : null;
            }
        } catch (e) {
            console.warn('Cache read error:', e);
        }
        return null;
    };

    const setCachedData = (key: string, data: any) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            localStorage.setItem(CACHE_KEYS.timestamp, Date.now().toString());
        } catch (e) {
            console.warn('Cache write error:', e);
        }
    };

    // Transaction Editing State
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleUpdateProduct = async (updatedProduct: Product) => {
        // Optimistic UI Update
        setProducts(prev => prev.map(p => p.sku === updatedProduct.sku ? updatedProduct : p));

        // Supabase Update
        try {
            const { error } = await supabase
                .from('products')
                .update({
                    name: updatedProduct.name,
                    department: updatedProduct.department,
                    category: updatedProduct.category,
                    vendor: updatedProduct.vendor,
                    price: updatedProduct.price
                })
                .eq('sku', updatedProduct.sku);

            if (error) throw error;
        } catch (e) {
            console.error("Failed to update product:", e);
            alert("Failed to update product database.");
        }
    };

    const handleSaveEdit = async (updatedTx: Transaction, updatedProd: Product) => {
        // 1. Update Product (if changed)
        // We always call this to ensure consistency if the user edited product fields
        await handleUpdateProduct(updatedProd);

        // 2. Update Transaction
        setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));

        try {
            const { error } = await supabase
                .from('transactions')
                .update({
                    date: updatedTx.date,
                    qty_sold: updatedTx.qtySold,
                    discount: updatedTx.discount,
                    property: updatedTx.property,
                    unit_price_sold: updatedTx.unit_price_sold
                })
                .eq('id', updatedTx.id);

            if (error) throw error;
        } catch (e) {
            console.error("Failed to update transaction:", e);
            alert("Failed to update transaction database.");
        }
    };

    const handleInitiateEdit = (tx: Transaction) => {
        const product = products.find(p => p.sku === tx.sku);
        if (product) {
            setEditingTransaction(tx);
            setEditingProduct(product);
        } else {
            alert("Could not infer product for this transaction.");
        }
    };

    const handleForceRefresh = () => {
        localStorage.removeItem(CACHE_KEYS.products);
        localStorage.removeItem(CACHE_KEYS.inventory);
        localStorage.removeItem(CACHE_KEYS.transactions);
        localStorage.removeItem(CACHE_KEYS.timestamp);
        window.location.reload();
    };

    const loadServerData = async () => {
        setLoading(true);
        setDebugInfo(null);
        console.log("Attempting to fetch from Supabase...");
        try {
            const conn = await checkSupabaseConnection();
            if (conn.success && (conn.count || 0) > 0) {
                // Check cache first
                const cachedProducts = getCachedData(CACHE_KEYS.products);
                const cachedInventory = getCachedData(CACHE_KEYS.inventory);
                const cachedTransactions = getCachedData(CACHE_KEYS.transactions);

                if (cachedProducts && cachedInventory && cachedTransactions) {
                    console.log("✓ Loading from cache...");
                    setProducts(cachedProducts);
                    setInventory(cachedInventory);
                    setTransactions(cachedTransactions);
                    setLoading(false);
                    return;
                }

                console.log("Cache miss. Fetching from Supabase...");

                const fetchAll = async (table: string, onProgress?: (current: number, total: number) => void) => {
                    let allData: any[] = [];
                    let page = 0;
                    const batchSize = 1000; // Match Supabase limit to ensure pagination works
                    let hasMore = true;

                    while (hasMore) {
                        const { data, error, count } = await supabase
                            .from(table)
                            .select('*', { count: 'exact' })
                            .range(page * batchSize, (page + 1) * batchSize - 1);

                        if (error) throw error;
                        if (!data || data.length === 0) {
                            hasMore = false;
                        } else {
                            allData = [...allData, ...data];
                            if (onProgress && count) {
                                onProgress(allData.length, count);
                            }
                            if (data.length < batchSize) hasMore = false;
                            page++;
                        }
                    }
                    return allData;
                };

                // Progressive loading: small datasets first
                setLoadingProgress('Loading products...');
                const resProducts = await fetchAll('products');
                const sbProducts: Product[] = resProducts.map(p => ({
                    sku: p.sku, name: p.name, department: p.department || '', category: p.category, vendor: p.vendor || '', cost: Number(p.cost) || 0, price: Number(p.price) || 0
                }));
                setProducts(sbProducts);
                setCachedData(CACHE_KEYS.products, sbProducts);

                setLoadingProgress('Loading inventory...');
                const resInventory = await fetchAll('inventory');
                const sbInventory: InventoryState[] = resInventory.map(i => ({
                    sku: i.sku,
                    qtyOnHand: Number(i.qty_on_hand) || 0,
                    property: i.property,
                    lastCounted: i.last_counted
                }));
                setInventory(sbInventory);
                setCachedData(CACHE_KEYS.inventory, sbInventory);

                // Load transactions last with progress
                setLoadingProgress('Loading transactions...');
                const resTransactions = await fetchAll('transactions', (current, total) => {
                    setLoadingProgress(`Loading transactions... ${current.toLocaleString()} / ${total.toLocaleString()}`);
                });
                const sbTransactions: Transaction[] = resTransactions.map(t => ({
                    id: t.id || Math.random().toString(),
                    date: t.date,
                    sku: t.sku,
                    qtySold: Number(t.qty_sold) || 0,
                    discount: Number(t.discount) || 0,
                    property: t.property || 'Default',
                    unit_price_sold: Number(t.unit_price_sold) || 0,
                    unit_cost_sold: Number(t.unit_cost_sold) || 0,
                    review_status: t.review_status || 'pending'
                }));
                setTransactions(sbTransactions);
                setCachedData(CACHE_KEYS.transactions, sbTransactions);

                setLoadingProgress('');
                console.log(`✓ Loaded ${sbProducts.length} products, ${sbInventory.length} inventory, ${sbTransactions.length} transactions`);
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

    const { availableProperties, availableDepartments, availableVendors, availableCategories, diagnostics } = useMemo(() => {
        // 1. Base Filter: Date Range (used to determine available Properties)
        // 1. Base Filter: Date Range (used to determine available Properties)
        const dateFilteredTx = transactions.filter(t => {
            const txDate = t.date.split('T')[0]; // Normalize to YYYY-MM-DD
            const match = txDate >= filters.dateStart && txDate <= filters.dateEnd;
            // if (!match) console.log(`Filtered out: ${txDate} not in ${filters.dateStart}-${filters.dateEnd}`);
            return match;
        });

        // 2. Secondary Filter: Selected Properties (used to determine Depts, Cats, Vendors)
        // If no property selected, use all date-filtered transactions
        console.log("Filtering by Properties:", filters.selectedProperty);
        const storeFilteredTx = dateFilteredTx.filter(t =>
            filters.selectedProperty.length === 0 || filters.selectedProperty.some(p => p.trim() === (t.property || '').trim())
        );

        // Get SKUs present in the store-filtered subset
        const activeSkus = new Set(storeFilteredTx.map(t => t.sku));

        // Get products matching those SKUs
        const activeProducts = products.filter(p => activeSkus.has(p.sku));

        // Available Properties are derived from the wider Date-Filtered set (so you can see other stores to switch to)
        const props = new Set(dateFilteredTx.map(t => t.property).filter(Boolean));

        // Other filters are derived from the narrower Store-Filtered set
        const depts = new Set(activeProducts.map(p => p.department).filter(Boolean));
        const cats = new Set(activeProducts.map(p => p.category).filter(Boolean));
        const vendors = new Set(activeProducts.map(p => p.vendor).filter(Boolean));

        // Data Health
        const missingCost = activeProducts.filter(p => !p.cost || p.cost === 0).length;
        const missingPrice = activeProducts.filter(p => !p.price || p.price === 0).length;

        console.log(`Cascading Filters: DateTx=${dateFilteredTx.length}, StoreTx=${storeFilteredTx.length}, Products=${activeProducts.length}`);

        return {
            availableProperties: Array.from(props).sort(),
            availableDepartments: Array.from(depts).sort(),
            availableCategories: Array.from(cats).sort(),
            availableVendors: Array.from(vendors).sort(),
            diagnostics: { missingCost, missingPrice }
        };
    }, [transactions, products, filters.dateStart, filters.dateEnd, filters.selectedProperty]);

    // Data Analysis Logic
    const analyzedData: AnalysisRow[] = useMemo(() => {
        // Pre-filter transactions
        const filteredTx = transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            const matchDate = txDate >= filters.dateStart && txDate <= filters.dateEnd;
            const matchProp = filters.selectedProperty.length === 0 || filters.selectedProperty.some(p => p.trim() === (t.property || '').trim());
            return matchDate && matchProp;
        });

        // Grouping Maps
        const txBySku = new Map<string, Transaction[]>();
        filteredTx.forEach(t => { if (!txBySku.has(t.sku)) txBySku.set(t.sku, []); txBySku.get(t.sku)!.push(t); });

        // Inventory Index: Map<SKU, Map<Property, qty>>
        const invIndex = new Map<string, Map<string, number>>();
        inventory.forEach(i => {
            if (!invIndex.has(i.sku)) invIndex.set(i.sku, new Map());
            if (i.property) invIndex.get(i.sku)!.set(i.property, i.qtyOnHand);
        });

        const calculateMetrics = (skus: string[], id: string, name: string, category: string, isGroup: boolean): AnalysisRow => {
            let qtySold = 0, revenue = 0, profit = 0, discounts = 0, productCost = 0, qtyOnHand = 0;
            const vendorSet = new Set<string>(); const deptSet = new Set<string>();

            skus.forEach(sku => {
                const p = products.find(p => p.sku === sku);
                if (!p) return;
                vendorSet.add(p.vendor); deptSet.add(p.department);
                productCost += p.cost;

                // Aggregate Inventory Based on Filter
                if (filters.selectedProperty.length === 0) {
                    const skuInv = invIndex.get(sku);
                    if (skuInv) {
                        skuInv.forEach(qty => qtyOnHand += qty);
                    }
                } else {
                    const skuInv = invIndex.get(sku);
                    if (skuInv) {
                        filters.selectedProperty.forEach(prop => {
                            qtyOnHand += (skuInv.get(prop) || 0);
                        });
                    }
                }

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
            const searchLower = filters.search.toLowerCase();
            const matchSearch = !searchLower ||
                r.name.toLowerCase().includes(searchLower) ||
                r.skus.some(s => s.toLowerCase().includes(searchLower)) ||
                r.vendor.toLowerCase().includes(searchLower) ||
                r.category.toLowerCase().includes(searchLower) ||
                r.department.toLowerCase().includes(searchLower);

            const matchCat = filters.categories.length === 0 || filters.categories.includes(r.category);
            const matchDept = filters.departments.length === 0 || filters.departments.some(d => r.department.includes(d));
            const matchVendor = filters.vendors.length === 0 || filters.vendors.some(v => r.vendor.includes(v));
            const matchZeroSales = !filters.hideZeroSales || r.qtySold > 0;
            const matchZeroOnHand = !filters.hideZeroOnHand || r.qtyOnHand > 0;

            return matchSearch && matchCat && matchDept && matchVendor && matchZeroSales && matchZeroOnHand;
        }).sort((a, b) => {
            const field = filters.sortBy; const dir = filters.sortDir === 'asc' ? 1 : -1;
            const valA = a[field as keyof AnalysisRow]; const valB = b[field as keyof AnalysisRow];
            if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
            // @ts-ignore
            return (valA - valB) * dir;
        });
    }, [products, transactions, inventory, customGroups, filters]);


    const missingCostSkus = useMemo(() => {
        const skusInView = new Set<string>();
        analyzedData.forEach(row => {
            if (row.skus) {
                row.skus.forEach(sku => skusInView.add(sku));
            } else {
                skusInView.add(row.id);
            }
        });

        return products
            .filter(p => skusInView.has(p.sku) && (!p.cost || p.cost === 0))
            .map(p => ({
                sku: p.sku,
                name: p.name,
                price: p.price,
                category: p.category,
                vendor: p.vendor
            }));
    }, [analyzedData, products]);

    const downloadMissingCostSkus = () => {
        const content = missingCostSkus.map(p => `${p.sku}\t${p.name}\t${p.category}\t${p.vendor}\t$${p.price}`).join('\n');
        const header = 'SKU\tProduct Name\tCategory\tVendor\tPrice\n';
        const blob = new Blob([header + content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `missing_cost_skus_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Get transactions for a specific row
    const getRowTransactions = (row: AnalysisRow) => {
        const skus = row.skus || [row.id];
        return transactions.filter(t => {
            const matchesSku = skus.includes(t.sku);
            const txDate = t.date.split('T')[0];
            const matchDate = txDate >= filters.dateStart && txDate <= filters.dateEnd;
            const matchProp = filters.selectedProperty.length === 0 || filters.selectedProperty.some(p => p.trim() === (t.property || '').trim());
            return matchesSku && matchDate && matchProp;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };


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

    // Saved Views State
    const [savedViews, setSavedViews] = useState<{ name: string, filters: FilterState }[]>(() => {
        const saved = localStorage.getItem('udrg_saved_views');
        return saved ? JSON.parse(saved) : [];
    });
    const [newViewName, setNewViewName] = useState('');

    const handleSaveView = () => {
        if (!newViewName.trim()) return;
        const newView = { name: newViewName, filters: draftFilters };
        const updated = [...savedViews, newView];
        setSavedViews(updated);
        localStorage.setItem('udrg_saved_views', JSON.stringify(updated));
        setNewViewName('');
    };

    const handleLoadView = (view: { name: string, filters: FilterState }) => {
        setFilters(view.filters);
        setDraftFilters(view.filters);
    };

    const handleDeleteView = (name: string) => {
        const updated = savedViews.filter(v => v.name !== name);
        setSavedViews(updated);
        localStorage.setItem('udrg_saved_views', JSON.stringify(updated));
    };

    return (
        <div className={`min-h-screen flex flex-col md:flex-row bg-[var(--app-bg)] text-[var(--text-color)] font-sans ${settings.fontSize}`}>
            <style>{`:root { --app-bg: ${settings.colors.background}; --sidebar-bg: ${settings.colors.sidebar}; --card-bg: ${settings.colors.card}; --primary-color: ${settings.colors.primary}; --text-color: ${settings.colors.text}; --text-muted: ${settings.colors.text}80; --border-color: ${settings.colors.border}; }`}</style>

            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col h-screen flex-shrink-0 z-20">
                <div className="p-4"><h1 className="text-xl font-bold text-[var(--primary-color)]"><i className="fa-solid fa-boxes-stacked"></i> UDRG Reports</h1></div>

                {/* View Selection */}
                <div className="px-4 mb-2 space-y-1">
                    <button onClick={() => setView('dashboard')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${view === 'dashboard' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--app-bg)]'}`}><i className="fa-solid fa-chart-pie w-6"></i> Dashboard</button>
                    <button onClick={() => setView('calendar')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${view === 'calendar' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--app-bg)]'}`}><i className="fa-solid fa-calendar-days w-6"></i> Forecast</button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-6 custom-scrollbar">

                    {/* Saved Views Section */}
                    <div className="border-b border-[var(--border-color)] pb-4">
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 block">Saved Views</label>
                        <div className="space-y-1 mb-2">
                            {savedViews.map(sv => (
                                <div key={sv.name} className="flex justify-between items-center group">
                                    <button onClick={() => handleLoadView(sv)} className="text-xs text-[var(--text-color)] hover:text-[#var(--primary-color)] truncate max-w-[120px]">{sv.name}</button>
                                    <button onClick={() => handleDeleteView(sv.name)} className="text-[10px] text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-400"><i className="fa-solid fa-trash"></i></button>
                                </div>
                            ))}
                            {savedViews.length === 0 && <div className="text-[10px] text-[var(--text-muted)] italic">No saved views</div>}
                        </div>
                        <div className="flex gap-1">
                            <input type="text" placeholder="View Name" value={newViewName} onChange={e => setNewViewName(e.target.value)} className="w-full text-[10px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded px-1" />
                            <button onClick={handleSaveView} disabled={!newViewName} className="text-[10px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded px-2 hover:bg-[var(--primary-color)] hover:text-white disabled:opacity-50"><i className="fa-solid fa-save"></i></button>
                        </div>
                    </div>

                    <div className="bg-[var(--app-bg)] p-3 rounded border border-[var(--border-color)]">
                        <div className="flex justify-between items-center mb-2"><label className="text-xs font-semibold text-[var(--text-muted)] uppercase">Data Sync</label><div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`}></div></div>
                        <button onClick={loadServerData} className="w-full bg-[var(--card-bg)] hover:bg-[var(--border-color)] text-xs py-1.5 rounded border border-[var(--border-color)] transition-colors"><i className="fa-solid fa-sync mr-1"></i> Refresh</button>
                    </div>


                    <div>
                        <button onClick={() => setIsOutlierReviewOpen(true)} className="w-full flex items-center justify-between px-3 py-2 text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded hover:bg-amber-500/20 transition-colors mb-4">
                            <span className="font-bold"><i className="fa-solid fa-stethoscope mr-2"></i> Data Health</span>
                            {outlierCount > 0 && <span className="bg-amber-500 text-black px-1.5 rounded-full text-[10px] font-bold">{outlierCount}</span>}
                        </button>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 block">Period</label>
                        <div className="flex items-center gap-2">
                            <input type="date" value={filters.dateStart} onChange={e => setFilters(p => ({ ...p, dateStart: e.target.value }))} className="w-full bg-[var(--card-bg)] text-[10px] border border-[var(--border-color)] rounded p-1" />
                            <span className="text-[var(--text-muted)] text-[10px]">to</span>
                            <input type="date" value={filters.dateEnd} onChange={e => setFilters(p => ({ ...p, dateEnd: e.target.value }))} className="w-full bg-[var(--card-bg)] text-[10px] border border-[var(--border-color)] rounded p-1" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-2 block">Search</label>
                        <input type="text" className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-2 outline-none" placeholder="Search SKU, Name, Vendor..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
                    </div>

                    <FilterPanel filters={filters} setFilters={setFilters} availableCategories={availableCategories} availableDepartments={availableDepartments} availableVendors={availableVendors} availableProperties={availableProperties} />



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
                        <p className="text-[var(--text-muted)] text-sm mb-1">{view === 'dashboard' ? `${filters.dateStart} to ${filters.dateEnd} • ${filters.selectedProperty}` : 'Projection based on Seasonality'}</p>

                        {loadingProgress && (
                            <div className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded inline-flex items-center gap-2 animate-pulse">
                                <i className="fa-solid fa-spinner fa-spin"></i>
                                <span>{loadingProgress}</span>
                            </div>
                        )}

                        {(diagnostics.missingCost > 0 || diagnostics.missingPrice > 0) && (
                            <div className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded inline-flex items-center gap-2">
                                <i className="fa-solid fa-triangle-exclamation"></i>
                                {diagnostics.missingCost > 0 && <span>{diagnostics.missingCost} items missing Cost.</span>}
                                {diagnostics.missingPrice > 0 && <span>{diagnostics.missingPrice} items missing Price.</span>}
                                <span>Profit/Revenue may be inaccurate.</span>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button onClick={handleForceRefresh} variant="secondary" title="Force Reload from Server">
                            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''} mr-2`}></i>
                            Refresh Data
                        </Button>
                        {view === 'dashboard' && <Button onClick={handleRunForecast} variant="primary"><i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Run Forecast</Button>}
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-6">
                    <Card className="h-full overflow-hidden flex flex-col p-0 bg-[var(--app-bg)]">
                        {/* Column Selector */}
                        <div className="p-2 border-b border-[var(--border-color)] flex justify-end">
                            <div className="relative">
                                <button
                                    onClick={() => setIsColumnSelectorOpen(!isColumnSelectorOpen)}
                                    className="text-xs bg-[var(--card-bg)] border border-[var(--border-color)] px-2 py-1 rounded hover:bg-[var(--primary-color)] hover:text-white transition-colors"
                                >
                                    <i className="fa-solid fa-table-columns mr-1"></i> Columns
                                </button>
                                {isColumnSelectorOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsColumnSelectorOpen(false)}></div>
                                        <div className="absolute right-0 top-full mt-1 w-40 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-xl rounded p-2 z-50">
                                            {Object.keys(filters.showColumns).map(col => (
                                                <label key={col} className="flex items-center gap-2 text-xs p-1 hover:bg-[var(--app-bg)] cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={filters.showColumns[col as keyof typeof filters.showColumns]}
                                                        onChange={() => setFilters(p => ({ ...p, showColumns: { ...p.showColumns, [col]: !p.showColumns[col as keyof typeof filters.showColumns] } }))}
                                                    />
                                                    <span className="capitalize">{col}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => setFilters(p => ({ ...p, hideZeroSales: !p.hideZeroSales }))}
                                className={`ml-2 text-xs border px-2 py-1 rounded transition-colors flex items-center gap-2 ${filters.hideZeroSales ? 'bg-[var(--primary-color)] text-white border-[var(--primary-color)]' : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:bg-[var(--primary-color)] hover:text-white'}`}
                            >
                                <i className={`fa-solid ${filters.hideZeroSales ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                                Hide Zero Sales
                            </button>
                            <button
                                onClick={() => setFilters(p => ({ ...p, hideZeroOnHand: !p.hideZeroOnHand }))}
                                className={`ml-2 text-xs border px-2 py-1 rounded transition-colors flex items-center gap-2 ${filters.hideZeroOnHand ? 'bg-[var(--primary-color)] text-white border-[var(--primary-color)]' : 'bg-[var(--card-bg)] border-[var(--border-color)] hover:bg-[var(--primary-color)] hover:text-white'}`}
                            >
                                <i className={`fa-solid ${filters.hideZeroOnHand ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                                Hide Zero On Hand
                            </button>
                        </div>

                        {/* Summary Bar */}
                        <div className="bg-[var(--app-bg)] border-b-2 border-[var(--primary-color)] p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="text-xs font-semibold text-[var(--text-muted)] uppercase">Filtered Totals:</div>
                                    {missingCostSkus.length > 0 && (
                                        <button
                                            onClick={() => setIsMissingCostModalOpen(true)}
                                            className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors"
                                        >
                                            <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                                            {missingCostSkus.length} Missing Cost
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-6 text-sm">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">Qty Sold</span>
                                        <span className="font-mono font-bold">{analyzedData.reduce((sum, row) => sum + row.qtySold, 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">Gross Revenue</span>
                                        <span className="font-mono font-bold text-sky-300">${analyzedData.reduce((sum, row) => sum + row.grossRevenue, 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">Discounts</span>
                                        <span className="font-mono font-bold text-orange-400">-${analyzedData.reduce((sum, row) => sum + row.discounts, 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">Net Revenue</span>
                                        <span className="font-mono font-bold text-blue-300">${analyzedData.reduce((sum, row) => sum + row.revenue, 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">Profit</span>
                                        <span className="font-mono font-bold text-emerald-400">${analyzedData.reduce((sum, row) => sum + row.profit, 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">On Hand</span>
                                        <span className="font-mono font-bold">{analyzedData.reduce((sum, row) => sum + row.qtyOnHand, 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-[var(--text-muted)] uppercase">Inventory Cost</span>
                                        <span className="font-mono font-bold text-purple-400">${analyzedData.reduce((sum, row) => {
                                            const skus = row.skus || [row.id];
                                            const inventoryCost = skus.reduce((skuSum, sku) => {
                                                const product = products.find(p => p.sku === sku);
                                                let qty = 0;
                                                if (filters.selectedProperty.length === 0) {
                                                    const skuInv = inventory.filter(i => i.sku === sku);
                                                    skuInv.forEach(i => qty += i.qtyOnHand);
                                                } else {
                                                    filters.selectedProperty.forEach(prop => {
                                                        const i = inventory.find(inv => inv.sku === sku && inv.property === prop);
                                                        if (i) qty += i.qtyOnHand;
                                                    });
                                                }
                                                return skuSum + (qty * (product?.cost || 0));
                                            }, 0);
                                            return sum + inventoryCost;
                                        }, 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-auto flex-1">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[var(--sidebar-bg)] sticky top-0 z-10 text-xs uppercase font-semibold text-[var(--text-muted)]">
                                    <tr>
                                        <HeaderWithInfo label="Item Name" sortable onSort={() => handleSort('name')} currentSort={filters.sortBy === 'name'} currentDir={filters.sortDir} infoQuery="Product Name" />
                                        <HeaderWithInfo label="Category" infoQuery="Product Category" />
                                        {filters.showColumns.sold && <HeaderWithInfo label="Sold" className="text-right" sortable onSort={() => handleSort('qtySold')} currentSort={filters.sortBy === 'qtySold'} currentDir={filters.sortDir} infoQuery="Units Sold" />}
                                        {filters.showColumns.grossRevenue && <HeaderWithInfo label="Gross Revenue" className="text-right" sortable onSort={() => handleSort('grossRevenue')} currentSort={filters.sortBy === 'grossRevenue'} currentDir={filters.sortDir} infoQuery="Total before discounts" />}
                                        {filters.showColumns.discounts && <HeaderWithInfo label="Discounts" className="text-right" sortable onSort={() => handleSort('discounts')} currentSort={filters.sortBy === 'discounts'} currentDir={filters.sortDir} infoQuery="Total discounts applied" />}
                                        {filters.showColumns.revenue && <HeaderWithInfo label="Net Revenue" className="text-right" sortable onSort={() => handleSort('revenue')} currentSort={filters.sortBy === 'revenue'} currentDir={filters.sortDir} infoQuery="Revenue after discounts" />}
                                        {filters.showColumns.profit && <HeaderWithInfo label="Profit" className="text-right" sortable onSort={() => handleSort('profit')} currentSort={filters.sortBy === 'profit'} currentDir={filters.sortDir} infoQuery="Gross Profit" />}
                                        {filters.showColumns.onHand && <HeaderWithInfo label="On Hand" className="text-right" infoQuery="Current Inventory" />}
                                        {filters.showColumns.reorder && <HeaderWithInfo label="Restock?" className="text-right" sortable onSort={() => handleSort('suggestedReorder')} currentSort={filters.sortBy === 'suggestedReorder'} currentDir={filters.sortDir} infoQuery="Suggested Order" />}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)] bg-[var(--card-bg)]">
                                    {paginatedDashboardRows.map(row => (
                                        <tr
                                            key={row.id}
                                            onClick={() => setSelectedRowDetail(row)}
                                            className="hover:bg-[var(--app-bg)]/50 transition-colors cursor-pointer"
                                        >
                                            <td className="px-4 py-3 font-medium">{row.name}<div className="text-[10px] text-[var(--text-muted)]">{row.vendor}</div></td>
                                            <td className="px-4 py-3"><span className="bg-[var(--app-bg)] px-2 py-0.5 rounded text-xs">{row.category}</span></td>
                                            {filters.showColumns.sold && <td className="px-4 py-3 text-right font-mono">{row.qtySold}</td>}
                                            {filters.showColumns.grossRevenue && <td className="px-4 py-3 text-right font-mono text-sky-300">${row.grossRevenue.toLocaleString()}</td>}
                                            {filters.showColumns.discounts && <td className="px-4 py-3 text-right font-mono text-orange-400">-${row.discounts.toLocaleString()}</td>}
                                            {filters.showColumns.revenue && <td className="px-4 py-3 text-right font-mono text-blue-300">${row.revenue.toLocaleString()}</td>}
                                            {filters.showColumns.profit && <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">${row.profit.toLocaleString()}</td>}
                                            {filters.showColumns.onHand && <td className="px-4 py-3 text-right font-mono">{row.qtyOnHand}</td>}
                                            {filters.showColumns.reorder && <td className="px-4 py-3 text-right">{row.suggestedReorder > 0 ? <span className="bg-red-900/30 text-red-400 border border-red-900/50 px-2 py-0.5 rounded text-xs font-bold">+{Math.ceil(row.suggestedReorder)}</span> : <span className="text-slate-600">-</span>}</td>}
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
            {isOutlierReviewOpen && <OutlierReview transactions={transactions} products={products} onClose={() => setIsOutlierReviewOpen(false)} onUpdateTransaction={handleUpdateTransaction} />}

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

            {/* Missing Cost SKU Modal */}
            {isMissingCostModalOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <i className="fa-solid fa-triangle-exclamation text-amber-400"></i>
                                Missing Cost SKUs ({missingCostSkus.length})
                            </h3>
                            <button onClick={() => setIsMissingCostModalOpen(false)} className="text-[var(--text-muted)] hover:text-white">
                                <i className="fa-solid fa-times"></i>
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-auto">
                            <p className="text-sm text-[var(--text-muted)] mb-4">
                                The following SKUs in your filtered view have a cost of $0. Update these in your POS to ensure accurate profit calculations.
                            </p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-[var(--sidebar-bg)] sticky top-0">
                                        <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                                            <th className="px-3 py-2">SKU</th>
                                            <th className="px-3 py-2">Product Name</th>
                                            <th className="px-3 py-2">Category</th>
                                            <th className="px-3 py-2">Vendor</th>
                                            <th className="px-3 py-2 text-right">Price</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-color)]">
                                        {missingCostSkus.map(p => (
                                            <tr key={p.sku} className="hover:bg-[var(--app-bg)]/50">
                                                <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                                                <td className="px-3 py-2">{p.name}</td>
                                                <td className="px-3 py-2 text-xs">{p.category}</td>
                                                <td className="px-3 py-2 text-xs">{p.vendor}</td>
                                                <td className="px-3 py-2 text-right font-mono">${p.price.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="p-4 border-t border-[var(--border-color)] flex justify-between items-center">
                            <span className="text-sm text-[var(--text-muted)]">{missingCostSkus.length} SKUs with missing cost</span>
                            <div className="flex gap-2">
                                <Button variant="secondary" onClick={() => setIsMissingCostModalOpen(false)}>Close</Button>
                                <Button variant="primary" onClick={downloadMissingCostSkus}>
                                    <i className="fa-solid fa-download mr-2"></i>
                                    Download .txt
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Row Detail Modal */}
            {selectedRowDetail && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
                        <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">{selectedRowDetail.name}</h3>
                                <p className="text-sm text-[var(--text-muted)]">{selectedRowDetail.vendor} • {selectedRowDetail.category}</p>
                            </div>
                            <button onClick={() => setSelectedRowDetail(null)} className="text-[var(--text-muted)] hover:text-white">
                                <i className="fa-solid fa-times text-xl"></i>
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-auto">
                            {/* Product Details & Metrics */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                {/* Product Info */}
                                <div className="bg-[var(--app-bg)] p-4 rounded border border-[var(--border-color)]">
                                    <h4 className="text-xs uppercase text-[var(--text-muted)] mb-3 font-semibold">Product Details</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">SKU(s):</span>
                                            <span className="font-mono text-xs">{selectedRowDetail.skus.join(', ')}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Department:</span>
                                            <span>{selectedRowDetail.department}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Cost:</span>
                                            <span className="font-mono">${(selectedRowDetail.profit / selectedRowDetail.qtySold || 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Sales Metrics */}
                                <div className="bg-[var(--app-bg)] p-4 rounded border border-[var(--border-color)]">
                                    <h4 className="text-xs uppercase text-[var(--text-muted)] mb-3 font-semibold">Sales Performance</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Qty Sold:</span>
                                            <span className="font-mono font-bold">{selectedRowDetail.qtySold}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Gross Revenue:</span>
                                            <span className="font-mono text-sky-300">${selectedRowDetail.grossRevenue.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Discounts:</span>
                                            <span className="font-mono text-orange-400">-${selectedRowDetail.discounts.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Net Revenue:</span>
                                            <span className="font-mono text-blue-300">${selectedRowDetail.revenue.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between border-t border-[var(--border-color)] pt-2">
                                            <span className="text-[var(--text-muted)] font-semibold">Profit:</span>
                                            <span className="font-mono text-emerald-400 font-bold">${selectedRowDetail.profit.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Inventory Status */}
                                <div className="bg-[var(--app-bg)] p-4 rounded border border-[var(--border-color)]">
                                    <h4 className="text-xs uppercase text-[var(--text-muted)] mb-3 font-semibold">Inventory Status</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">On Hand:</span>
                                            <span className="font-mono font-bold">{selectedRowDetail.qtyOnHand}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Avg Monthly Demand:</span>
                                            <span className="font-mono">{selectedRowDetail.avgMonthlyDemand.toFixed(1)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[var(--text-muted)]">Months of Supply:</span>
                                            <span className="font-mono">{selectedRowDetail.monthsOfSupply.toFixed(1)}</span>
                                        </div>
                                        {selectedRowDetail.suggestedReorder > 0 && (
                                            <div className="flex justify-between border-t border-[var(--border-color)] pt-2">
                                                <span className="text-[var(--text-muted)] font-semibold">Restock Needed:</span>
                                                <span className="font-mono text-red-400 font-bold">+{Math.ceil(selectedRowDetail.suggestedReorder)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Transaction History */}
                            <div className="bg-[var(--app-bg)] p-4 rounded border border-[var(--border-color)]">
                                <h4 className="text-xs uppercase text-[var(--text-muted)] mb-3 font-semibold">
                                    Transaction History ({getRowTransactions(selectedRowDetail).length} transactions)
                                </h4>
                                <div className="overflow-x-auto max-h-96">
                                    <table className="w-full text-sm">
                                        <thead className="bg-[var(--sidebar-bg)] sticky top-0 text-xs uppercase text-[var(--text-muted)]">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Date</th>
                                                <th className="px-3 py-2 text-left">Property</th>
                                                <th className="px-3 py-2 text-left">SKU</th>
                                                <th className="px-3 py-2 text-right">Qty</th>
                                                <th className="px-3 py-2 text-right">Unit Price</th>
                                                <th className="px-3 py-2 text-right">Discount</th>
                                                <th className="px-3 py-2 text-right">Revenue</th>
                                                <th className="px-3 py-2 text-right">Profit</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border-color)]">
                                            {getRowTransactions(selectedRowDetail).map((t, idx) => {
                                                const product = products.find(p => p.sku === t.sku);
                                                const unitCost = t.unit_cost_sold || product?.cost || 0;
                                                const unitPrice = t.unit_price_sold || product?.price || 0;
                                                const revenue = (t.qtySold * unitPrice) - t.discount;
                                                const profit = revenue - (t.qtySold * unitCost);

                                                return (
                                                    <tr key={t.id || idx} className="hover:bg-[var(--sidebar-bg)]/30 group">
                                                        <td className="px-3 py-2 font-mono text-xs">{t.date}</td>
                                                        <td className="px-3 py-2 text-xs">{t.property}</td>
                                                        <td className="px-3 py-2 font-mono text-xs">{t.sku}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-xs">{t.qtySold}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-xs">${unitPrice.toFixed(2)}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-xs text-orange-400">-${t.discount}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-xs font-bold text-blue-300">${revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td className="px-3 py-2 text-right font-mono text-xs font-bold text-emerald-400">${profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                        <td className="px-3 py-2 text-right">
                                                            <button
                                                                onClick={() => handleInitiateEdit(t)}
                                                                className="text-[var(--text-muted)] hover:text-[var(--primary-color)] transition-colors opacity-0 group-hover:opacity-100"
                                                                title="Edit Transaction & Product Details"
                                                            >
                                                                <i className="fa-solid fa-pen-to-square"></i>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--border-color)] flex justify-end">
                            <Button variant="secondary" onClick={() => setSelectedRowDetail(null)}>Close</Button>
                        </div>
                    </div >
                </div >
            )}
            {/* Transaction/Product Edit Modal */}
            {editingTransaction && editingProduct && (
                <TransactionEditModal
                    isOpen={true}
                    onClose={() => { setEditingTransaction(null); setEditingProduct(null); }}
                    transaction={editingTransaction}
                    product={editingProduct}
                    availableProperties={availableProperties}
                    availableDepartments={availableDepartments}
                    availableCategories={availableCategories}
                    availableVendors={availableVendors}
                    onSave={handleSaveEdit}
                    onDelete={handleDeleteTransaction}
                />
            )}
        </div>
    );
};

export default App;
