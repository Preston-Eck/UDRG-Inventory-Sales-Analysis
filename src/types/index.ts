
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

export interface Product {
    sku: string;
    name: string;
    department: string;
    category: string;
    vendor: string;
    cost: number;
    price: number;
}

export interface Transaction {
    id: string;
    date: string;
    sku: string;
    qtySold: number;
    discount?: number;
    property: string;
    unit_price_sold?: number;
    unit_cost_sold?: number;
    review_status?: 'pending' | 'verified' | 'ignored' | 'modified';
}

export interface InventoryState {
    sku: string;
    qtyOnHand: number;
    property?: string;
    lastCounted?: string;
}

export interface CellLogic {
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

export interface AnalysisRow {
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

export interface FilterState {
    search: string;
    categories: string[];
    departments: string[];
    vendors: string[];
    dateStart: string;
    dateEnd: string;
    groupBy: 'sku' | 'category' | 'custom';
    selectedProperty: string[];
    sortBy: 'qtySold' | 'revenue' | 'profit' | 'qtyOnHand' | 'name';
    sortDir: 'asc' | 'desc';
    showColumns: {
        sold: boolean;
        grossRevenue: boolean;
        discounts: boolean;
        revenue: boolean;
        profit: boolean;
        onHand: boolean;
        reorder: boolean;
    };
}

export interface CustomGroup {
    id: string;
    name: string;
    skus: string[];
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
    isError?: boolean;
}

export interface AppSettings {
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

export const DEFAULT_SETTINGS: AppSettings = {
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
