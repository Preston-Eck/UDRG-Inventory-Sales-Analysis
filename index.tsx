
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

// --- Types ---

// Add global declaration for Google Apps Script
declare global {
  interface Window {
    google?: {
      script: {
        run: {
          withSuccessHandler: (callback: (data: any, userObject?: any) => void) => {
             withFailureHandler: (callback: (error: Error, userObject?: any) => void) => {
                getData: () => void;
                callGeminiAPI: (prompt: string, model: string) => void;
             }
          }
        }
      }
    }
  }
}

interface Product {
  sku: string;
  name: string;
  department: string;
  category: string;
  vendor: string;
  cost: number;
  price: number;
}

interface Transaction {
  id: string;
  date: string;
  sku: string;
  qtySold: number;
  discount?: number;
  property: string;
}

interface InventoryState {
  sku: string;
  qtyOnHand: number;
}

interface CellLogic {
  monthIndex: number;
  monthLabel: string;
  forecastedDemand: number;
  openingStock: number;
  targetStock: number;
  restockQty: number;
  restockCost: number;
  closingStock: number;
  historicalAverage: number;
}

interface AnalysisRow {
  id: string;
  name: string;
  department: string;
  category: string;
  vendor: string;
  isGroup: boolean;
  skus: string[];
  productCost: number;
  qtySold: number;
  grossRevenue: number;
  discounts: number;
  revenue: number;
  profit: number;
  qtyOnHand: number;
  avgMonthlyDemand: number;
  monthsOfSupply: number;
  suggestedReorder: number;
  calendarSchedule: CellLogic[];
  hasHistory: boolean;
}

interface FilterState {
  search: string;
  categories: string[];
  departments: string[];
  vendors: string[];
  dateStart: string;
  dateEnd: string;
  groupBy: 'sku' | 'category' | 'custom';
  selectedProperty: string;
  sortBy: keyof AnalysisRow | 'name' | 'revenue' | 'profit' | 'suggestedReorder';
  sortDir: 'asc' | 'desc';
  showColumns: {
    sold: boolean;
    revenue: boolean;
    profit: boolean;
    onHand: boolean;
    demand: boolean;
    reorder: boolean;
  };
}

interface CustomGroup {
  id: string;
  name: string;
  skus: string[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isError?: boolean;
}

// --- Settings Types ---

interface AppSettings {
  fontSize: 'text-xs' | 'text-sm' | 'text-base' | 'text-lg';
  colors: {
    background: string;
    sidebar: string;
    card: string;
    primary: string;
    text: string;
    border: string;
  };
  charts: {
    showNetRevenue: boolean;
    showGrossRevenue: boolean;
    showProfit: boolean;
    colorNetRevenue: string;
    colorGrossRevenue: string;
    colorProfit: string;
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 'text-sm',
  colors: {
    background: '#0f172a', // slate-900
    sidebar: '#020617', // slate-950
    card: '#1e293b', // slate-800
    primary: '#10b981', // emerald-500
    text: '#e2e8f0', // slate-200
    border: '#334155', // slate-700
  },
  charts: {
    showNetRevenue: true,
    showGrossRevenue: false,
    showProfit: true,
    colorNetRevenue: '#3b82f6',
    colorGrossRevenue: '#60a5fa',
    colorProfit: '#10b981'
  }
};

// --- Mock Data ---

const MOCK_PROPERTIES = ['Downtown Store', 'North Mall Kiosk', 'Online Store', 'Westside Warehouse'];

const MOCK_PRODUCTS: Product[] = [
  { sku: 'EL001', name: 'Wireless Mouse', department: 'Peripherals', category: 'Electronics', vendor: 'LogiTechs', cost: 12, price: 29 },
  { sku: 'EL002', name: 'Mechanical Keyboard', department: 'Peripherals', category: 'Electronics', vendor: 'LogiTechs', cost: 45, price: 120 },
  { sku: 'EL003', name: 'USB-C Monitor', department: 'Displays', category: 'Electronics', vendor: 'DisplayPro', cost: 150, price: 350 },
  { sku: 'FU001', name: 'Ergo Office Chair', department: 'Seating', category: 'Furniture', vendor: 'FurniCo', cost: 180, price: 450 },
  { sku: 'FU002', name: 'Standing Desk', department: 'Desks', category: 'Furniture', vendor: 'FurniCo', cost: 250, price: 600 },
  { sku: 'OF001', name: 'Notebook Pack', department: 'Supplies', category: 'Office', vendor: 'OfficeDepot', cost: 5, price: 15 },
  { sku: 'OF002', name: 'Gel Pen Set', department: 'Supplies', category: 'Office', vendor: 'OfficeDepot', cost: 3, price: 12 },
];

const generateMockData = () => {
  const transactions: Transaction[] = [];
  const inventory: InventoryState[] = [];
  const now = new Date();
  
  MOCK_PRODUCTS.forEach((p, index) => {
    inventory.push({ sku: p.sku, qtyOnHand: Math.floor(Math.random() * 50) }); 
    
    // Simulate property exclusivity: Some items are NOT sold at certain locations
    // This ensures "No Sales History" logic can be tested
    const allowedProperties = MOCK_PROPERTIES.filter((_, idx) => (index + idx) % 2 === 0 || idx === 2); // Everyone sells online (idx 2)

    for (let i = 0; i < 1460; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const month = date.getMonth();
      const isSeason = month === 10 || month === 11; 
      const chance = isSeason ? 0.7 : 0.4;

      if (Math.random() < chance) {
         const qty = Math.floor(Math.random() * 5) + 1;
         const isDiscounted = Math.random() < 0.2;
         const discount = isDiscounted ? Math.floor((p.price * qty) * 0.1) : 0;
         
         const property = allowedProperties[Math.floor(Math.random() * allowedProperties.length)];

         transactions.push({
           id: Math.random().toString(36).substring(2, 9),
           date: date.toISOString().split('T')[0],
           sku: p.sku,
           qtySold: qty,
           discount: discount,
           property: property
         });
      }
    }
  });
  return { products: MOCK_PRODUCTS, transactions, inventory };
};

// --- Helper Components ---

const Card = ({ children, className = '' }: { children?: React.ReactNode, className?: string }) => (
  <div className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 shadow-sm ${className}`}>
    {children}
  </div>
);

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false }: any) => {
  const baseStyle = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--sidebar-bg)] disabled:opacity-50 disabled:cursor-not-allowed";
  
  const style = variant === 'primary' 
    ? { backgroundColor: 'var(--primary-color)', color: '#fff' } 
    : variant === 'success' ? { backgroundColor: '#10b981', color: '#fff' }
    : {};

  const variantClass = variant === 'secondary' ? "bg-[var(--card-bg)] hover:bg-[var(--border-color)] text-[var(--text-color)] border border-[var(--border-color)]" : "";

  return (
    <button onClick={onClick} disabled={disabled} style={style} className={`${baseStyle} ${variantClass} ${className}`}>
      {children}
    </button>
  );
};

const HeaderWithInfo = ({ label, infoQuery, onExplain, className = '', align = 'left', sortable = false, onSort, currentSort, currentDir }: any) => (
  <th className={`px-4 py-3 ${className}`}>
    <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'} group`}>
      <span 
        className={sortable ? "cursor-pointer hover:text-white select-none" : ""} 
        onClick={sortable && onSort ? onSort : undefined}
      >
        {label}
        {sortable && currentSort && (
           <span className="ml-1 text-[10px] text-[var(--primary-color)]">
             {currentSort ? (currentDir === 'asc' ? '▲' : '▼') : ''}
           </span>
        )}
      </span>
      <i className="fa-regular fa-circle-question text-slate-600 group-hover:text-[var(--primary-color)] text-[10px] transition-colors cursor-pointer" onClick={() => onExplain(infoQuery)} title="Click for AI Explanation"></i>
    </div>
  </th>
);

// --- Settings Modal ---

const SettingsModal = ({ settings, onSave, onClose }: { settings: AppSettings, onSave: (s: AppSettings) => void, onClose: () => void }) => {
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
                     onChange={e => setLocalSettings(p => ({...p, fontSize: e.target.value as any}))}
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
                   <input type="checkbox" checked={localSettings.charts.showNetRevenue} onChange={e => updateChartVisibility('showNetRevenue', e.target.checked)} className="rounded border-slate-600 bg-[var(--app-bg)]"/>
                   <span>Show Net Revenue</span>
                 </div>
                 <input type="color" value={localSettings.charts.colorNetRevenue} onChange={e => updateColor('charts', 'colorNetRevenue', e.target.value)} className="h-6 w-10 bg-transparent rounded cursor-pointer" />
               </div>
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <input type="checkbox" checked={localSettings.charts.showGrossRevenue} onChange={e => updateChartVisibility('showGrossRevenue', e.target.checked)} className="rounded border-slate-600 bg-[var(--app-bg)]"/>
                   <span>Show Gross Revenue</span>
                 </div>
                 <input type="color" value={localSettings.charts.colorGrossRevenue} onChange={e => updateColor('charts', 'colorGrossRevenue', e.target.value)} className="h-6 w-10 bg-transparent rounded cursor-pointer" />
               </div>
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <input type="checkbox" checked={localSettings.charts.showProfit} onChange={e => updateChartVisibility('showProfit', e.target.checked)} className="rounded border-slate-600 bg-[var(--app-bg)]"/>
                   <span>Show Profit</span>
                 </div>
                 <input type="color" value={localSettings.charts.colorProfit} onChange={e => updateColor('charts', 'colorProfit', e.target.value)} className="h-6 w-10 bg-transparent rounded cursor-pointer" />
               </div>
             </div>
           </section>
        </div>

        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--sidebar-bg)] rounded-b-lg flex justify-end gap-2">
           <Button variant="secondary" onClick={onClose}>Cancel</Button>
           <Button variant="primary" onClick={() => onSave(localSettings)}>Apply Changes</Button>
        </div>
      </div>
    </div>
  );
};

// --- Chart Component ---

const InventoryCharts = ({ data, settings }: { data: AnalysisRow[], settings: AppSettings }) => {
  const barChartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !barChartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const sorted = [...data].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const datasets = [];
    if (settings.charts.showNetRevenue) {
       datasets.push({
          label: 'Net Revenue ($)',
          data: sorted.map(d => d.revenue),
          backgroundColor: settings.charts.colorNetRevenue,
          yAxisID: 'y',
       });
    }
    if (settings.charts.showGrossRevenue) {
       datasets.push({
          label: 'Gross Revenue ($)',
          data: sorted.map(d => d.grossRevenue),
          backgroundColor: settings.charts.colorGrossRevenue,
          yAxisID: 'y',
       });
    }
    if (settings.charts.showProfit) {
       datasets.push({
          label: 'Profit ($)',
          data: sorted.map(d => d.profit),
          backgroundColor: settings.charts.colorProfit,
          yAxisID: 'y',
       });
    }

    // @ts-ignore
    chartInstance.current = new Chart(barChartRef.current, {
      type: 'bar',
      data: {
        labels: sorted.map(d => d.name),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { 
          legend: { position: 'top', labels: { color: settings.colors.text } }, 
          title: { display: false } 
        },
        scales: {
          x: { ticks: { color: settings.colors.text }, grid: { display: false } },
          y: { type: 'linear', display: true, position: 'left', grid: { color: settings.colors.border }, ticks: { color: settings.colors.text } },
        }
      }
    });

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [data, settings.charts]);

  return <div className="h-64"><canvas ref={barChartRef} /></div>;
};

// --- Calendar View Component ---

const CalendarView = ({ rows, onCellClick, sortConfig, onSort }: { 
  rows: AnalysisRow[], 
  onCellClick: (row: AnalysisRow, cell: CellLogic) => void,
  sortConfig: { sortBy: string, sortDir: string },
  onSort: (key: string) => void
}) => {
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
  const [isInactiveCollapsed, setIsInactiveCollapsed] = useState(true);

  // Split rows into active vs no history
  const activeRows = rows.filter(r => r.hasHistory);
  const inactiveRows = rows.filter(r => !r.hasHistory);

  const months = useMemo(() => {
    const m = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      d.setMonth(d.getMonth() + 1);
      m.push(new Date(d));
    }
    return m;
  }, []);

  const toggleMonth = (idx: number) => {
    const newSet = new Set(selectedMonths);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelectedMonths(newSet);
  };

  const maxSelectedIndex = useMemo(() => {
    if (selectedMonths.size <= 1) return -1;
    return Math.max(...(Array.from(selectedMonths) as number[]));
  }, [selectedMonths]);

  const selectionTotals = useMemo(() => {
     let totalQty = 0;
     let totalCost = 0;
     if (selectedMonths.size === 0) return null;
     activeRows.forEach(row => {
        row.calendarSchedule.forEach(cell => {
           if (selectedMonths.has(cell.monthIndex)) {
              totalQty += cell.restockQty;
              totalCost += cell.restockCost;
           }
        });
     });
     return { totalQty, totalCost };
  }, [activeRows, selectedMonths]);

  return (
    <div className="flex flex-col h-full">
       <div className="overflow-auto pb-12 flex-1">
        <table className="w-full text-left text-[var(--text-muted)] border-collapse">
          <thead className="bg-[var(--sidebar-bg)] text-[var(--text-color)] uppercase font-bold text-xs sticky top-0 z-10 shadow-lg">
            <tr>
              <th 
                className="px-4 py-4 min-w-[200px] border-b border-[var(--border-color)] bg-[var(--sidebar-bg)] sticky left-0 z-20 cursor-pointer hover:text-white"
                onClick={() => onSort('name')}
              >
                Item {sortConfig.sortBy === 'name' && (sortConfig.sortDir === 'asc' ? '▲' : '▼')}
              </th>
              {months.map((m, idx) => (
                <React.Fragment key={m.toISOString()}>
                  <th className={`px-2 py-4 text-center min-w-[110px] border-b border-[var(--border-color)] ${selectedMonths.has(idx) ? 'bg-emerald-900/30 text-emerald-300' : ''}`}>
                    <div className="flex flex-col items-center gap-1 cursor-pointer hover:text-white" onClick={() => toggleMonth(idx)}>
                      <div className="flex items-center gap-1">
                        <input type="checkbox" checked={selectedMonths.has(idx)} onChange={() => {}} className="rounded border-slate-600 bg-[var(--card-bg)] pointer-events-none"/>
                        <span>{m.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</span>
                      </div>
                    </div>
                  </th>
                  {idx === maxSelectedIndex && (
                    <th className="px-2 py-4 text-center min-w-[100px] border-b border-[var(--border-color)] bg-purple-900/30 text-purple-300 border-l border-[var(--border-color)]">Selected<br/>Total</th>
                  )}
                </React.Fragment>
              ))}
              <th className="px-4 py-4 text-center min-w-[100px] border-b border-[var(--border-color)] bg-[var(--sidebar-bg)] border-l-2 border-[var(--border-color)] text-[var(--text-color)] font-bold sticky right-0 z-20 shadow-[-5px_0_5px_-2px_rgba(0,0,0,0.5)]">12 Mo<br/>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)] bg-[var(--app-bg)]">
            {activeRows.map(row => (
              <tr key={row.id} className="hover:bg-[var(--card-bg)] transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--text-color)] border-r border-[var(--card-bg)] bg-[var(--app-bg)] sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">{row.name}</span>
                    <div className="flex flex-wrap gap-2 text-[10px] text-[var(--text-muted)]">
                       <span className="bg-[var(--card-bg)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">{row.department}</span>
                       <span className="bg-[var(--card-bg)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">{row.vendor}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-muted)] font-normal mt-0.5">Unit Cost: ${row.productCost.toFixed(2)}</span>
                  </div>
                </td>
                {row.calendarSchedule.map((cell) => {
                  const isSelected = selectedMonths.has(cell.monthIndex);
                  return (
                    <React.Fragment key={cell.monthIndex}>
                      <td onClick={() => onCellClick(row, cell)} className={`px-2 py-3 text-center border-r border-[var(--card-bg)] cursor-pointer transition-colors ${isSelected ? 'bg-emerald-900/10' : 'hover:bg-[var(--card-bg)]'}`}>
                        {cell.restockQty > 0 ? (
                           <div className="flex flex-col items-center">
                              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold text-xs shadow-sm">{cell.restockQty}</span>
                              <span className="text-[10px] text-[var(--text-muted)] mt-1">${cell.restockCost.toLocaleString()}</span>
                           </div>
                        ) : (
                           <div className="flex flex-col items-center opacity-50"><span className="text-slate-600 text-xs">-</span></div>
                        )}
                      </td>
                      {cell.monthIndex === maxSelectedIndex && (
                        <td className="px-2 py-3 text-center border-b border-r border-[var(--border-color)] bg-purple-900/10 border-l border-[var(--border-color)] font-bold text-purple-300">
                           {(() => {
                              const total = row.calendarSchedule.filter(c => selectedMonths.has(c.monthIndex)).reduce((sum, c) => sum + c.restockQty, 0);
                              const cost = row.calendarSchedule.filter(c => selectedMonths.has(c.monthIndex)).reduce((sum, c) => sum + c.restockCost, 0);
                              return (<div className="flex flex-col items-center"><span>{total}</span><span className="text-[10px] text-purple-400/70">${cost.toLocaleString()}</span></div>)
                           })()}
                        </td>
                      )}
                    </React.Fragment>
                  );
                })}
                <td className="px-4 py-3 text-center border-b border-[var(--card-bg)] bg-[var(--app-bg)] border-l-2 border-[var(--border-color)] font-bold text-[var(--text-color)] sticky right-0 z-10 shadow-[-5px_0_5px_-2px_rgba(0,0,0,0.5)]">
                   {(() => {
                       const total = row.calendarSchedule.reduce((sum, c) => sum + c.restockQty, 0);
                       const cost = row.calendarSchedule.reduce((sum, c) => sum + c.restockCost, 0);
                       return (<div className="flex flex-col items-center"><span>{total}</span><span className="text-[10px] text-[var(--text-muted)] font-normal">${cost.toLocaleString()}</span></div>)
                   })()}
                </td>
              </tr>
            ))}
            
            {inactiveRows.length > 0 && (
              <>
                <tr className="bg-[var(--sidebar-bg)] border-y border-[var(--border-color)] cursor-pointer hover:bg-[var(--app-bg)] transition-colors" onClick={() => setIsInactiveCollapsed(!isInactiveCollapsed)}>
                   <td colSpan={100} className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-widest sticky left-0 z-10">
                      <div className="flex items-center justify-center gap-2">
                        <i className={`fa-solid fa-chevron-${isInactiveCollapsed ? 'right' : 'down'}`}></i>
                        Items with No Sales History at this Location ({inactiveRows.length})
                      </div>
                   </td>
                </tr>
                {!isInactiveCollapsed && inactiveRows.map(row => (
                  <tr key={row.id} className="bg-[var(--app-bg)] opacity-60">
                     <td className="px-4 py-3 font-medium text-[var(--text-muted)] border-r border-[var(--border-color)] bg-[var(--app-bg)] sticky left-0 z-10">
                        <div className="flex flex-col gap-1">
                           <span className="text-sm">{row.name}</span>
                           <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                             <span className="border border-[var(--border-color)] px-1 rounded">{row.department}</span>
                             <span className="border border-[var(--border-color)] px-1 rounded">{row.vendor}</span>
                           </div>
                        </div>
                     </td>
                     <td colSpan={months.length + (maxSelectedIndex > -1 ? months.length : 0) + 1} className="px-4 py-3 text-center text-xs italic text-[var(--text-muted)] bg-[var(--card-bg)]">
                        No sales history available for this location. Re-stock projection disabled.
                     </td>
                     <td className="sticky right-0 bg-[var(--app-bg)] border-l-2 border-[var(--border-color)]"></td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      
      {selectionTotals && (
        <div className="bg-[var(--sidebar-bg)] border-t border-[var(--border-color)] p-4 flex justify-between items-center text-sm sticky bottom-0 z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
           <div className="text-[var(--text-muted)]">
             Selected: <span className="text-[var(--text-color)] font-bold">{selectedMonths.size}</span> months
           </div>
           <div className="flex gap-8">
             <div><span className="block text-[10px] uppercase text-[var(--text-muted)]">Selected Qty</span><span className="text-lg font-bold text-blue-400">{selectionTotals.totalQty.toLocaleString()}</span></div>
             <div><span className="block text-[10px] uppercase text-[var(--text-muted)]">Selected Cost</span><span className="text-lg font-bold text-emerald-400">${selectionTotals.totalCost.toLocaleString()}</span></div>
           </div>
        </div>
      )}
    </div>
  );
};

// --- Modal Component ---

const CellDetailModal = ({ row, cell, onClose, onAiExplain, isThinking }: { row: AnalysisRow, cell: CellLogic, onClose: () => void, onAiExplain: () => void, isThinking: boolean }) => {
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

// --- Main Application ---

const App = () => {
  const [view, setView] = useState<'dashboard' | 'calendar'>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryState[]>([]);
  const [customGroups, setCustomGroups] = useState<CustomGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [newGroupName, setNewGroupName] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [detailModal, setDetailModal] = useState<{row: AnalysisRow, cell: CellLogic} | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    categories: [],
    departments: [],
    vendors: [],
    dateStart: '',
    dateEnd: '',
    groupBy: 'sku',
    selectedProperty: 'All',
    sortBy: 'revenue',
    sortDir: 'desc',
    showColumns: { sold: true, revenue: true, profit: false, onHand: true, demand: true, reorder: true }
  });

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'model', text: 'How can I help with your inventory planning today?', timestamp: new Date() }]);
  const [inputMessage, setInputMessage] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    setFilters(prev => ({
      ...prev,
      dateStart: ninetyDaysAgo.toISOString().split('T')[0],
      dateEnd: today.toISOString().split('T')[0]
    }));

    loadServerData();
  }, []);

  const loadServerData = () => {
    setLoading(true);
    setDebugInfo(null);
    if (window.google && window.google.script) {
        window.google.script.run
            .withSuccessHandler((data: any) => {
                if (data && data.products && data.products.length > 0) {
                    setProducts(data.products);
                    setTransactions(data.transactions || []);
                    setInventory(data.inventory || []);
                } else if (data && data.debug) {
                    // Handle server-side debug/error reporting for missing data
                    setDebugInfo(data.debug);
                    setProducts([]);
                }
                setLoading(false);
            })
            .withFailureHandler((error: any) => {
                console.error('GAS Error:', error);
                setDebugInfo({ error: error.message, details: "Failed to connect to backend." });
                setLoading(false);
            })
            .getData();
    } else {
        console.log("No GAS environment detected. Using mock data.");
        const mock = generateMockData();
        setProducts(mock.products);
        setTransactions(mock.transactions);
        setInventory(mock.inventory);
        setLoading(false);
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

  const analyzedData: AnalysisRow[] = useMemo(() => {
    if (products.length === 0) return [];
    
    const propertyFilteredTx = transactions.filter(t => 
       filters.selectedProperty === 'All' || t.property === filters.selectedProperty
    );

    const filteredTx = propertyFilteredTx.filter(t => t.date >= filters.dateStart && t.date <= filters.dateEnd);
    const allTx = propertyFilteredTx;

    const calculateMetrics = (skus: string[], id: string, name: string, category: string, isGroup: boolean): AnalysisRow => {
      let qtySold = 0;
      let revenue = 0; 
      let grossRevenue = 0; 
      let profit = 0;
      let discounts = 0;
      let qtyOnHand = 0;
      let totalCost = 0;
      let departments = new Set<string>();
      let vendors = new Set<string>();
      
      skus.forEach(sku => {
        const prod = products.find(p => p.sku === sku);
        if (!prod) return;
        
        departments.add(prod.department);
        vendors.add(prod.vendor);

        totalCost += prod.cost;

        const skuTx = filteredTx.filter(t => t.sku === sku);
        const skuSold = skuTx.reduce((sum, t) => sum + t.qtySold, 0);
        const skuDiscount = skuTx.reduce((sum, t) => sum + (t.discount || 0), 0);
        
        qtySold += skuSold;
        discounts += skuDiscount;

        const skuGrossRevenue = skuSold * prod.price;
        const skuNetRevenue = skuGrossRevenue - skuDiscount;
        
        grossRevenue += skuGrossRevenue;
        revenue += skuNetRevenue;
        
        const cogs = skuSold * prod.cost;
        profit += (skuNetRevenue - cogs);

        const inv = inventory.find(i => i.sku === sku);
        qtyOnHand += inv ? inv.qtyOnHand : 0;
      });

      const productCost = totalCost / (skus.length || 1);
      const departmentLabel = Array.from(departments).join(', ');
      const vendorLabel = Array.from(vendors).join(', ');

      const calendarSchedule: CellLogic[] = [];
      let simulatedStock = qtyOnHand;
      const today = new Date();
      let hasHistory = false;

      for (let i = 1; i <= 12; i++) {
         const targetDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
         const targetMonth = targetDate.getMonth();
         const monthLabel = targetDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

         let totalHistoricalQty = 0;
         let yearsFound = 0;
         const targetYear = targetDate.getFullYear();

         for (let y = 1; y <= 3; y++) {
             const lookbackYear = targetYear - y;
             let monthlySum = 0;
             let hasSales = false;

             skus.forEach(sku => {
                const sales = allTx.filter(t => {
                   const d = new Date(t.date);
                   return t.sku === sku && d.getMonth() === targetMonth && d.getFullYear() === lookbackYear;
                }).reduce((sum, t) => sum + t.qtySold, 0);
                monthlySum += sales;
                if(sales > 0) hasSales = true;
             });

             if (hasSales) { 
                 totalHistoricalQty += monthlySum;
                 yearsFound++;
             }
         }
         
         if (yearsFound > 0) hasHistory = true;

         const historicalAverage = yearsFound > 0 ? totalHistoricalQty / yearsFound : 0;
         const forecastedDemand = historicalAverage > 0 ? Math.ceil(historicalAverage * 1.05) : Math.ceil(qtySold / 3);

         const nextMonthDemand = forecastedDemand; 
         const targetStock = nextMonthDemand; 
         const openingStock = simulatedStock;
         const requiredParams = (forecastedDemand + targetStock) - openingStock;
         const restockQty = Math.max(0, requiredParams);
         const restockCost = restockQty * productCost;
         const closingStock = openingStock + restockQty - forecastedDemand;
         simulatedStock = Math.max(0, closingStock);

         calendarSchedule.push({
            monthIndex: i - 1,
            monthLabel,
            forecastedDemand,
            openingStock,
            targetStock,
            restockQty,
            restockCost,
            closingStock,
            historicalAverage
         });
      }

      if (qtySold > 0) hasHistory = true;

      const d1 = new Date(filters.dateStart);
      const d2 = new Date(filters.dateEnd);
      const monthsDiff = Math.max(1, (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const avgMonthlyDemand = qtySold / monthsDiff;
      const monthsOfSupply = avgMonthlyDemand > 0 ? qtyOnHand / avgMonthlyDemand : 999;
      const suggestedReorder = Math.max(0, (avgMonthlyDemand * 2) - qtyOnHand);

      return {
        id, name, category, isGroup, skus, productCost, department: departmentLabel, vendor: vendorLabel,
        qtySold, grossRevenue, revenue, profit, discounts, qtyOnHand,
        avgMonthlyDemand, monthsOfSupply, suggestedReorder,
        calendarSchedule, hasHistory
      };
    };

    let rows: AnalysisRow[] = [];
    if (filters.groupBy === 'sku') {
      rows = products.map(p => calculateMetrics([p.sku], p.sku, p.name, p.category, false));
    } else if (filters.groupBy === 'category') {
      const cats = Array.from(new Set(products.map(p => p.category)));
      rows = cats.map(c => calculateMetrics(products.filter(p => p.category === c).map(p => p.sku), c, `Category: ${c}`, c, true));
    } else if (filters.groupBy === 'custom') {
      rows = customGroups.map(g => calculateMetrics(g.skus, g.id, g.name, 'Custom Group', true));
      const groupedSkus = new Set(customGroups.flatMap(g => g.skus));
      const ungroupedProducts = products.filter(p => !groupedSkus.has(p.sku));
      rows = [...rows, ...ungroupedProducts.map(p => calculateMetrics([p.sku], p.sku, p.name, p.category, false))];
    }

    let result = rows.filter(r => {
      const matchSearch = r.name.toLowerCase().includes(filters.search.toLowerCase());
      const matchCat = filters.categories.length === 0 || filters.categories.includes(r.category);
      const matchDept = filters.departments.length === 0 || filters.departments.some(d => r.department.includes(d));
      const matchVendor = filters.vendors.length === 0 || filters.vendors.some(v => r.vendor.includes(v));
      return matchSearch && matchCat && matchDept && matchVendor;
    });

    result.sort((a, b) => {
       const field = filters.sortBy;
       const dir = filters.sortDir === 'asc' ? 1 : -1;
       let valA = a[field as keyof AnalysisRow];
       let valB = b[field as keyof AnalysisRow];
       if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
       // @ts-ignore
       return (valA - valB) * dir;
    });

    return result;
  }, [products, transactions, inventory, customGroups, filters]);

  const handleSort = (field: string) => {
     setFilters(prev => ({
       ...prev,
       sortBy: field as any,
       sortDir: prev.sortBy === field && prev.sortDir === 'desc' ? 'asc' : 'desc'
     }));
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const text = (typeof customPrompt === 'string' ? customPrompt : inputMessage);
    if (!text || !text.trim()) return;
    
    setIsChatOpen(true);
    setMessages(prev => [...prev, { role: 'user', text, timestamp: new Date() }]);
    if (!customPrompt) setInputMessage('');
    setIsThinking(true);

    let finalPrompt = text;
    if (detailModal && text.includes("EXPLAIN_CELL")) {
         const dm = detailModal;
         finalPrompt = `
           You are an inventory expert. Explain why the system recommends buying ${dm.cell.restockQty} units of "${dm.row.name}" for ${dm.cell.monthLabel}.
           DATA CONTEXT:
           - Projected Opening Stock: ${dm.cell.openingStock}
           - Forecasted Sales: ${dm.cell.forecastedDemand} (Based on 3-year average of ${dm.cell.historicalAverage})
           - Target Safety Stock (1 Month Cover): ${dm.cell.targetStock}
           - Unit Cost: $${dm.row.productCost}
           The formula used is: Buy = (Forecast + Target Stock) - Opening Stock.
           Explain this simply to a store manager. Mention if the purchase is driven by high seasonal demand or simply maintaining safety stock.
         `;
    } else {
         const contextDescription = view === 'calendar' ? "USER IS VIEWING RE-STOCK CALENDAR" : "USER IS VIEWING DASHBOARD";
         finalPrompt = `User Question: "${text}". Context: ${contextDescription}. Answer as an inventory expert.`;
    }

    if (window.google && window.google.script) {
      window.google.script.run
        .withSuccessHandler((responseText: string) => {
           setMessages(prev => [...prev, { role: 'model', text: responseText, timestamp: new Date() }]);
           setIsThinking(false);
        })
        .withFailureHandler((error: any) => {
           let errorMsg = "Error: " + error.message;
           if (errorMsg.includes("API Key Missing") || errorMsg.includes("API key not valid")) {
               errorMsg = "⚠️ Configuration Error: The Gemini API Key is missing or invalid. Please check the Apps Script 'Script Properties'.";
           }
           setMessages(prev => [...prev, { role: 'model', text: errorMsg, timestamp: new Date(), isError: true }]);
           setIsThinking(false);
        })
        .callGeminiAPI(finalPrompt, model);
    } else {
       setTimeout(() => {
         setMessages(prev => [...prev, { role: 'model', text: "[Local Dev] This would be a Gemini response.", timestamp: new Date() }]);
         setIsThinking(false);
       }, 1000);
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleCreateGroup = () => {
    if (!newGroupName || selectedSkus.size === 0) return;
    setCustomGroups([...customGroups, { id: Math.random().toString(36).substring(2, 5), name: newGroupName, skus: Array.from(selectedSkus) }]);
    setSelectedSkus(new Set());
    setNewGroupName('');
    setIsGroupModalOpen(false);
    setFilters(prev => ({ ...prev, groupBy: 'custom' }));
  };

  const onCellExplain = () => { handleSendMessage("EXPLAIN_CELL_LOGIC"); };

  const handleExplainHeader = (metricName: string, desc: string) => {
    handleSendMessage(`Explain the inventory metric '${metricName}'. ${desc} Keep it brief and relevant to a store manager.`);
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row bg-[var(--app-bg)] text-[var(--text-color)] font-sans ${settings.fontSize}`}>
      <style>{`
        :root {
          --app-bg: ${settings.colors.background};
          --sidebar-bg: ${settings.colors.sidebar};
          --card-bg: ${settings.colors.card};
          --primary-color: ${settings.colors.primary};
          --text-color: ${settings.colors.text};
          --text-muted: ${settings.colors.text}80; /* 50% opacity approximation */
          --border-color: ${settings.colors.border};
        }
      `}</style>
      
      <aside className="w-full md:w-64 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col h-screen flex-shrink-0 z-20 transition-colors">
        <div className="p-4">
           <h1 className="text-xl font-bold text-[var(--primary-color)] flex items-center gap-2">
             <i className="fa-solid fa-boxes-stacked"></i> UDRG Reports
           </h1>
        </div>

        <div className="px-4 mb-6 space-y-1">
           <button onClick={() => setView('dashboard')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'dashboard' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--app-bg)] hover:text-white'}`}>
             <i className="fa-solid fa-chart-pie w-6"></i> Dashboard
           </button>
           <button onClick={() => setView('calendar')} className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-[var(--primary-color)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--app-bg)] hover:text-white'}`}>
             <i className="fa-solid fa-calendar-days w-6"></i> Restock Calendar
           </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-6">
          <div className="bg-[var(--app-bg)] p-3 rounded border border-[var(--border-color)]">
             <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Data Sync</label>
                <div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : debugInfo ? 'bg-red-500' : 'bg-green-500'}`}></div>
             </div>
             <p className="text-[10px] text-[var(--text-muted)] mb-2">
               {loading ? 'Fetching live data...' : debugInfo ? 'Error loading data' : 'Data synchronized.'}
             </p>
             <button onClick={loadServerData} className="w-full bg-[var(--card-bg)] hover:bg-[var(--border-color)] text-xs py-1.5 rounded border border-[var(--border-color)] transition-colors text-[var(--text-color)]">
               <i className="fa-solid fa-sync mr-1"></i> Refresh Data
             </button>
          </div>

          <div>
             <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Store Location</label>
             <select 
               value={filters.selectedProperty} 
               onChange={e => setFilters(p => ({...p, selectedProperty: e.target.value}))} 
               className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-2 outline-none text-[var(--text-color)] focus:border-[var(--primary-color)]"
             >
               <option value="All">All Locations (Company Total)</option>
               {availableProperties.map(prop => (
                 <option key={prop} value={prop}>{prop}</option>
               ))}
             </select>
          </div>
          
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Search</label>
            <input 
              type="text" 
              className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-2 outline-none text-[var(--text-color)] focus:border-[var(--primary-color)]"
              placeholder="Search items..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Department</label>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto bg-[var(--app-bg)] p-2 rounded border border-[var(--border-color)]">
               {availableDepartments.length === 0 && <span className="text-[10px] text-[var(--text-muted)] italic">No departments found</span>}
               {availableDepartments.map(dept => (
                  <button 
                     key={dept} 
                     onClick={() => {
                        const next = filters.departments.includes(dept) 
                           ? filters.departments.filter(d => d !== dept)
                           : [...filters.departments, dept];
                        setFilters(p => ({...p, departments: next}));
                     }}
                     className={`text-[10px] px-2 py-1 rounded border ${filters.departments.includes(dept) ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white' : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-muted)]'}`}
                  >
                     {dept}
                  </button>
               ))}
            </div>
          </div>
          
          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Vendor / Brand</label>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto bg-[var(--app-bg)] p-2 rounded border border-[var(--border-color)]">
               {availableVendors.length === 0 && <span className="text-[10px] text-[var(--text-muted)] italic">No vendors found</span>}
               {availableVendors.map(v => (
                  <button 
                     key={v} 
                     onClick={() => {
                        const next = filters.vendors.includes(v) 
                           ? filters.vendors.filter(i => i !== v)
                           : [...filters.vendors, v];
                        setFilters(p => ({...p, vendors: next}));
                     }}
                     className={`text-[10px] px-2 py-1 rounded border ${filters.vendors.includes(v) ? 'bg-purple-600 border-purple-500 text-white' : 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-muted)]'}`}
                  >
                     {v}
                  </button>
               ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Group By</label>
            <div className="flex bg-[var(--card-bg)] p-1 rounded border border-[var(--border-color)]">
              {['sku', 'category', 'custom'].map((mode) => (
                <button key={mode} onClick={() => setFilters(prev => ({ ...prev, groupBy: mode as any }))} className={`flex-1 text-xs py-1.5 rounded capitalize transition-all ${filters.groupBy === mode ? 'bg-[var(--primary-color)] text-white shadow' : 'text-[var(--text-muted)] hover:text-white'}`}>
                  {mode}
                </button>
              ))}
            </div>
            {filters.groupBy === 'custom' && (
              <button onClick={() => setIsGroupModalOpen(true)} className="w-full mt-2 text-xs border border-dashed border-[var(--border-color)] text-[var(--text-muted)] py-1.5 rounded hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-colors">
                + Create Group
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-[var(--border-color)]">
             <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 block">Gemini Model</label>
             <select value={model} onChange={e => setModel(e.target.value)} className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-2 outline-none text-[var(--text-color)]">
               <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast)</option>
               <option value="gemini-3-pro-preview">Gemini 3 Pro (Deep)</option>
             </select>
          </div>

          <div className="pt-2 border-t border-[var(--border-color)]">
            <button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-[var(--text-muted)] hover:bg-[var(--app-bg)] hover:text-white transition-colors">
               <i className="fa-solid fa-gear"></i> Settings
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col relative h-screen">
        <header className="bg-[var(--sidebar-bg)] border-b border-[var(--border-color)] p-6 flex-shrink-0 transition-colors">
           <div className="flex justify-between items-center">
             <div>
               <h2 className="text-2xl font-bold text-[var(--text-color)]">{view === 'dashboard' ? 'Performance Dashboard' : 'Dynamic Re-Stock Calendar'}</h2>
               <p className="text-[var(--text-muted)] text-sm">
                 {view === 'dashboard' 
                   ? `Analyzing metrics from ${filters.dateStart} to ${filters.dateEnd} for ${filters.selectedProperty === 'All' ? 'All Locations' : filters.selectedProperty}` 
                   : 'Projection based on Seasonality (Last Year Data) + 1 Month Forward Cover'
                 }
               </p>
             </div>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {debugInfo && (
            <Card className="bg-red-900/20 border-red-500/50">
               <div className="flex items-start gap-4">
                 <i className="fa-solid fa-circle-exclamation text-red-400 text-xl mt-1"></i>
                 <div>
                    <h3 className="text-lg font-bold text-red-200">Data Connection Issue</h3>
                    <p className="text-red-300 text-sm mb-2">{debugInfo.error || "Backend returned no data."}</p>
                    {debugInfo.details && (
                       <pre className="text-xs bg-black/30 p-2 rounded text-red-200/80 overflow-x-auto">
                          {debugInfo.details}
                       </pre>
                    )}
                    {debugInfo.tabsAvailable && (
                       <p className="text-xs text-red-400 mt-2">Available Tabs in Sheet: {debugInfo.tabsAvailable.join(', ')}</p>
                    )}
                 </div>
               </div>
            </Card>
          )}

          {!debugInfo && products.length === 0 && !loading && (
             <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
                <i className="fa-solid fa-clipboard-list text-4xl mb-4 opacity-50"></i>
                <p>No inventory items found. Please check date filters or source sheet.</p>
             </div>
          )}
          
          {!debugInfo && products.length > 0 && view === 'dashboard' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="bg-[var(--card-bg)]">
                    <span className="text-[var(--text-muted)] text-xs uppercase">Net Revenue</span>
                    <div className="text-xl font-bold text-[var(--text-color)]">${analyzedData.reduce((a,b) => a + b.revenue, 0).toLocaleString()}</div>
                  </Card>
                  <Card className="bg-[var(--card-bg)]">
                    <span className="text-[var(--text-muted)] text-xs uppercase">Est. Profit</span>
                    <div className="text-xl font-bold text-emerald-400">${analyzedData.reduce((a,b) => a + b.profit, 0).toLocaleString()}</div>
                  </Card>
                  <Card className="bg-[var(--card-bg)]">
                    <span className="text-[var(--text-muted)] text-xs uppercase">Discounts Given</span>
                    <div className="text-xl font-bold text-amber-400">${analyzedData.reduce((a,b) => a + b.discounts, 0).toLocaleString()}</div>
                  </Card>
                  <Card className="bg-[var(--card-bg)]">
                    <span className="text-[var(--text-muted)] text-xs uppercase">Immediate Alerts</span>
                    <div className="text-xl font-bold text-red-400">{analyzedData.filter(r => r.suggestedReorder > 0).length} Items</div>
                  </Card>
              </div>

              <Card className="p-4">
                <InventoryCharts data={analyzedData} settings={settings} />
              </Card>

              <Card className="p-0 overflow-hidden border-0 shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[var(--text-muted)]">
                    <thead className="bg-[var(--sidebar-bg)] text-[var(--text-color)] uppercase font-bold text-xs sticky top-0">
                      <tr>
                        {filters.groupBy === 'custom' && <th className="px-4 py-3 w-10">Select</th>}
                        <HeaderWithInfo label="Item / Group" infoQuery="Item name" onExplain={() => {}} sortable onSort={() => handleSort('name')} currentSort={filters.sortBy === 'name'} currentDir={filters.sortDir} />
                        <HeaderWithInfo label="Category" infoQuery="Product Category" onExplain={() => {}} />
                        <HeaderWithInfo 
                           label="Qty Sold" 
                           align="right"
                           infoQuery="Qty Sold"
                           onExplain={() => handleExplainHeader('Qty Sold', 'Total units sold within the selected date range.')} 
                           className="text-right text-blue-300"
                           sortable onSort={() => handleSort('qtySold')} currentSort={filters.sortBy === 'qtySold'} currentDir={filters.sortDir}
                        />
                        <HeaderWithInfo 
                           label="Gross Revenue" 
                           align="right"
                           infoQuery="Gross Revenue"
                           onExplain={() => handleExplainHeader('Gross Revenue', 'Total sales value before discounts are applied (Qty * Unit Price).')} 
                           className="text-right text-blue-400 bg-[var(--app-bg)]/30"
                           sortable onSort={() => handleSort('grossRevenue')} currentSort={filters.sortBy === 'grossRevenue'} currentDir={filters.sortDir}
                        />
                        <HeaderWithInfo 
                           label="Net Revenue" 
                           align="right"
                           infoQuery="Net Revenue"
                           onExplain={() => handleExplainHeader('Net Revenue', 'Gross Sales minus Discounts.')} 
                           className="text-right text-blue-300"
                           sortable onSort={() => handleSort('revenue')} currentSort={filters.sortBy === 'revenue'} currentDir={filters.sortDir}
                        />
                        <HeaderWithInfo 
                           label="Discounts" 
                           align="right"
                           infoQuery="Discounts"
                           onExplain={() => handleExplainHeader('Discounts', 'Total value of price reductions given on sales.')} 
                           className="text-right text-amber-300"
                           sortable onSort={() => handleSort('discounts')} currentSort={filters.sortBy === 'discounts'} currentDir={filters.sortDir}
                        />
                         <HeaderWithInfo 
                           label="Est. Profit" 
                           align="right"
                           infoQuery="Profit"
                           onExplain={() => handleExplainHeader('Estimated Profit', 'Net Revenue minus Cost of Goods Sold (COGS).')} 
                           className="text-right text-emerald-300"
                           sortable onSort={() => handleSort('profit')} currentSort={filters.sortBy === 'profit'} currentDir={filters.sortDir}
                        />
                        <HeaderWithInfo 
                           label="On Hand" 
                           align="right"
                           infoQuery="On Hand"
                           onExplain={() => handleExplainHeader('On Hand', 'Current inventory quantity available in stock.')} 
                           className="text-right text-emerald-300"
                        />
                        <HeaderWithInfo 
                           label="Avg Demand/Mo" 
                           align="right"
                           infoQuery="Avg Monthly Demand"
                           onExplain={() => handleExplainHeader('Average Monthly Demand', 'Total sales divided by the number of months in the selected period.')} 
                           className="text-right border-l border-[var(--border-color)] bg-[var(--app-bg)]/50"
                        />
                        <HeaderWithInfo 
                           label="Months Supply" 
                           align="right"
                           infoQuery="Months of Supply"
                           onExplain={() => handleExplainHeader('Months of Supply', 'Current stock divided by average monthly demand. Indicates how long stock will last.')} 
                           className="text-right bg-[var(--app-bg)]/50"
                        />
                        <HeaderWithInfo 
                           label="Suggest Order" 
                           align="right"
                           infoQuery="Suggested Order"
                           onExplain={() => handleExplainHeader('Suggested Order', 'Recommended reorder quantity to maintain safety stock based on demand velocity.')} 
                           className="text-right bg-[var(--app-bg)]/50 text-red-300"
                           sortable onSort={() => handleSort('suggestedReorder')} currentSort={filters.sortBy === 'suggestedReorder'} currentDir={filters.sortDir}
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)] bg-[var(--card-bg)]">
                      {analyzedData.map((row) => (
                        <tr key={row.id} className="hover:bg-[var(--app-bg)]/50 transition-colors group">
                          {filters.groupBy === 'custom' && (
                            <td className="px-4 py-3">
                               {!row.isGroup && (
                                 <input type="checkbox" checked={selectedSkus.has(row.id)}
                                   onChange={() => {
                                     const next = new Set(selectedSkus);
                                     if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                                     setSelectedSkus(next);
                                   }}
                                   className="rounded border-[var(--border-color)] bg-[var(--card-bg)] checked:bg-[var(--primary-color)]"
                                 />
                               )}
                            </td>
                          )}
                          <td className="px-4 py-3 font-medium text-[var(--text-color)] flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              {row.isGroup && <i className="fa-solid fa-layer-group text-purple-400 text-xs"></i>}
                              {row.name}
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)]">{row.vendor}</span>
                          </td>
                          <td className="px-4 py-3"><span className="bg-[var(--app-bg)] px-2 py-0.5 rounded text-xs">{row.category}</span></td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--text-color)]">{row.qtySold}</td>
                          <td className="px-4 py-3 text-right font-mono text-blue-400 bg-[var(--app-bg)]/30">${row.grossRevenue.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                          <td className="px-4 py-3 text-right font-mono text-blue-300">${row.revenue.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                          <td className="px-4 py-3 text-right font-mono text-amber-300">
                             {row.discounts > 0 ? `-$${row.discounts.toLocaleString(undefined, {maximumFractionDigits:0})}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">${row.profit.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
                          <td className="px-4 py-3 text-right font-mono text-[var(--text-color)]">{row.qtyOnHand}</td>
                          <td className="px-4 py-3 text-right font-mono border-l border-[var(--border-color)] bg-[var(--app-bg)]/30">{row.avgMonthlyDemand.toFixed(1)}</td>
                          <td className={`px-4 py-3 text-right font-mono bg-[var(--app-bg)]/30 ${row.monthsOfSupply < 1 ? 'text-red-500 font-bold' : row.monthsOfSupply < 2 ? 'text-amber-500' : 'text-green-500'}`}>
                            {row.monthsOfSupply > 100 ? '>12' : row.monthsOfSupply.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-right bg-[var(--app-bg)]/30">
                             {row.suggestedReorder > 0 ? <span className="bg-red-900/30 text-red-400 border border-red-900/50 px-2 py-0.5 rounded text-xs font-bold">+{Math.ceil(row.suggestedReorder)}</span> : <span className="text-slate-600 text-xs">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : !debugInfo && products.length > 0 && (
            <Card className="p-0 border-0 shadow-xl overflow-hidden bg-[var(--app-bg)] h-full flex flex-col relative">
               <CalendarView 
                 rows={analyzedData} 
                 onCellClick={(row, cell) => setDetailModal({row, cell})} 
                 sortConfig={{sortBy: filters.sortBy, sortDir: filters.sortDir}}
                 onSort={handleSort}
               />
               <div className="absolute top-2 right-4 bg-[var(--card-bg)]/90 p-2 rounded text-[10px] text-[var(--text-muted)] border border-[var(--border-color)] pointer-events-none">
                 Tip: Select months in header to see period totals. Click cells for detail.
               </div>
            </Card>
          )}

        </div>
      </main>

      {!isChatOpen && (
        <button onClick={() => setIsChatOpen(true)} className="fixed bottom-6 right-6 bg-[var(--primary-color)] text-white rounded-full p-4 shadow-xl z-50 transition-transform hover:scale-105">
          <i className="fa-solid fa-robot text-xl"></i>
        </button>
      )}

      <div className={`fixed inset-y-0 right-0 w-96 bg-[var(--card-bg)] border-l border-[var(--border-color)] shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--sidebar-bg)]">
            <h3 className="font-bold text-[var(--text-color)] flex items-center gap-2"><i className="fa-solid fa-sparkles text-[var(--primary-color)]"></i> Gemini Expert</h3>
            <button onClick={() => setIsChatOpen(false)} className="text-[var(--text-muted)] hover:text-white"><i className="fa-solid fa-times"></i></button>
         </div>
         <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap shadow-sm ${msg.role === 'user' ? 'bg-[var(--primary-color)] text-white' : msg.isError ? 'bg-red-900/50 text-red-200 border border-red-500' : 'bg-[var(--app-bg)] text-[var(--text-color)] border border-[var(--border-color)]'}`}>
                    {msg.text}
                 </div>
              </div>
            ))}
            {isThinking && <div className="text-[var(--text-muted)] text-xs animate-pulse pl-2">Analyzing...</div>}
            <div ref={chatEndRef} />
         </div>
         <div className="p-4 border-t border-[var(--border-color)] bg-[var(--sidebar-bg)] flex gap-2">
            <input className="flex-1 bg-[var(--app-bg)] border border-[var(--border-color)] rounded px-3 py-2 text-sm text-[var(--text-color)] focus:border-[var(--primary-color)] outline-none" placeholder="Ask AI..." value={inputMessage} onChange={e => setInputMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} />
            <button onClick={() => handleSendMessage()} disabled={isThinking} className="bg-[var(--primary-color)] text-white px-3 rounded hover:opacity-90"><i className="fa-solid fa-paper-plane"></i></button>
         </div>
      </div>

      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
           <div className="bg-[var(--card-bg)] rounded-lg p-6 w-96 border border-[var(--border-color)] shadow-xl text-[var(--text-color)]">
              <h3 className="text-lg font-bold text-[var(--text-color)] mb-4">Create Item Group</h3>
              <p className="text-sm text-[var(--text-muted)] mb-4">Selected {selectedSkus.size} items to group.</p>
              <input className="w-full bg-[var(--app-bg)] border border-[var(--border-color)] rounded px-3 py-2 text-[var(--text-color)] mb-4 focus:border-[var(--primary-color)] outline-none" placeholder="Group Name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
              <div className="flex justify-end gap-2">
                 <Button variant="secondary" onClick={() => setIsGroupModalOpen(false)}>Cancel</Button>
                 <Button variant="primary" onClick={handleCreateGroup}>Create Group</Button>
              </div>
           </div>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsModal 
          settings={settings} 
          onSave={(newSettings) => { setSettings(newSettings); setIsSettingsOpen(false); }} 
          onClose={() => setIsSettingsOpen(false)} 
        />
      )}

      {detailModal && (
        <CellDetailModal 
           row={detailModal.row} 
           cell={detailModal.cell} 
           onClose={() => setDetailModal(null)} 
           onAiExplain={onCellExplain}
           isThinking={isThinking}
        />
      )}

    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
