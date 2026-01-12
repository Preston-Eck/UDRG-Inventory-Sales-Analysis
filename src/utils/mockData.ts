
import { Product, Transaction, InventoryState } from '../types';

export const MOCK_PROPERTIES = ['Downtown Store', 'North Mall Kiosk', 'Online Store', 'Westside Warehouse'];

export const MOCK_PRODUCTS: Product[] = [
    { sku: 'EL001', name: 'Wireless Mouse', department: 'Peripherals', category: 'Electronics', vendor: 'LogiTechs', cost: 12, price: 29 },
    { sku: 'EL002', name: 'Mechanical Keyboard', department: 'Peripherals', category: 'Electronics', vendor: 'LogiTechs', cost: 45, price: 120 },
    { sku: 'EL003', name: 'USB-C Monitor', department: 'Displays', category: 'Electronics', vendor: 'DisplayPro', cost: 150, price: 350 },
    { sku: 'FU001', name: 'Ergo Office Chair', department: 'Seating', category: 'Furniture', vendor: 'FurniCo', cost: 180, price: 450 },
    { sku: 'FU002', name: 'Standing Desk', department: 'Desks', category: 'Furniture', vendor: 'FurniCo', cost: 250, price: 600 },
    { sku: 'OF001', name: 'Notebook Pack', department: 'Supplies', category: 'Office', vendor: 'OfficeDepot', cost: 5, price: 15 },
    { sku: 'OF002', name: 'Gel Pen Set', department: 'Supplies', category: 'Office', vendor: 'OfficeDepot', cost: 3, price: 12 },
];

export const generateMockData = () => {
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
