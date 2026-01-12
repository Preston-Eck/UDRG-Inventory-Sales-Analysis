import React, { useState, useEffect } from 'react';
import { Transaction, Product } from '../types';

interface TransactionEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction;
    product: Product;
    availableProperties: string[];
    availableDepartments: string[];
    availableCategories: string[];
    availableVendors: string[];
    onSave: (updatedTx: Transaction, updatedProd: Product) => Promise<void>;
    onDelete: (txId: string) => Promise<void>;
}

export const TransactionEditModal: React.FC<TransactionEditModalProps> = ({
    isOpen,
    onClose,
    transaction,
    product,
    availableProperties,
    availableDepartments,
    availableCategories,
    availableVendors,
    onSave,
    onDelete
}) => {
    // Transaction State
    const [date, setDate] = useState(transaction.date.split('T')[0]);
    const [qty, setQty] = useState(transaction.qtySold);
    const [price, setPrice] = useState(product.price); // Default to product price, but we should use tx logic if available
    const [discount, setDiscount] = useState(transaction.discount || 0);
    const [property, setProperty] = useState(transaction.property);

    // Product State
    const [productName, setProductName] = useState(product.name);
    const [department, setDepartment] = useState(product.department);
    const [category, setCategory] = useState(product.category);
    const [vendor, setVendor] = useState(product.vendor);

    // Sync state when transaction/product changes
    useEffect(() => {
        if (isOpen) {
            setDate(transaction.date.split('T')[0]);
            setQty(transaction.qtySold);
            // Derive unit price from transaction if calculable, else product price
            // gross = qty * price. revenue = gross - discount.
            // We don't distinctly store unit_price_sold usually, but we can infer or use product default
            setPrice(product.price);
            setDiscount(transaction.discount || 0);
            setProperty(transaction.property);

            setProductName(product.name);
            setDepartment(product.department);
            setCategory(product.category);
            setVendor(product.vendor);
        }
    }, [isOpen, transaction, product]);

    const handleSave = async () => {
        const updatedTx: Transaction = {
            ...transaction,
            date: date,
            qtySold: Number(qty),
            // We don't store unit price on tx usually, but we might verify this. 
            // For now, we assume the user is updating the core metrics.
            // If the schema allows unit_price_sold, we'd update it. 
            // Based on types/index.ts: unit_price_sold IS optional.
            unit_price_sold: Number(price),
            discount: Number(discount),
            property: property
        };

        const updatedProd: Product = {
            ...product,
            name: productName,
            department: department,
            category: category,
            vendor: vendor,
            price: Number(price) // Update product price reference too? standard practice for fixing "default"
        };

        await onSave(updatedTx, updatedProd);
        onClose();
    };

    const handleDelete = async () => {
        if (confirm('Are you sure you want to delete this transaction completely?')) {
            await onDelete(transaction.id);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--app-bg)]">
                    <h3 className="font-bold text-lg"><i className="fa-solid fa-pen-to-square mr-2"></i> Edit Transaction Details</h3>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-color)]"><i className="fa-solid fa-xmark text-xl"></i></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">

                    {/* Transaction Section */}
                    <div className="bg-[var(--app-bg)]/50 p-4 rounded border border-[var(--border-color)]">
                        <label className="text-xs font-bold text-[var(--accent-color)] uppercase mb-3 block border-b border-[var(--border-color)] pb-1">
                            <i className="fa-solid fa-receipt mr-1"></i> Transaction Data (Single Event)
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Date</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Store</label>
                                <select value={property} onChange={e => setProperty(e.target.value)} className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm">
                                    {availableProperties.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Qty Sold</label>
                                <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Discount ($)</label>
                                <input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm" />
                            </div>
                        </div>
                    </div>

                    {/* Product Section */}
                    <div className="bg-amber-500/5 p-4 rounded border border-amber-500/20">
                        <label className="text-xs font-bold text-amber-500 uppercase mb-3 block border-b border-amber-500/20 pb-1 flex justify-between">
                            <span><i className="fa-solid fa-box mr-1"></i> Product Data (Global Update)</span>
                            <span className="text-[10px] font-normal bg-amber-500 text-black px-2 rounded-full">CAUTION: Updates All History</span>
                        </label>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Product Name</label>
                                <input type="text" value={productName} onChange={e => setProductName(e.target.value)} className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Department</label>
                                    <div className="relative">
                                        <input
                                            list="dept-options"
                                            value={department}
                                            onChange={e => setDepartment(e.target.value)}
                                            className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm"
                                            placeholder="Select or Type..."
                                        />
                                        <datalist id="dept-options">
                                            {availableDepartments.map(d => <option key={d} value={d} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Category</label>
                                    <div className="relative">
                                        <input
                                            list="cat-options"
                                            value={category}
                                            onChange={e => setCategory(e.target.value)}
                                            className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm"
                                            placeholder="Select or Type..."
                                        />
                                        <datalist id="cat-options">
                                            {availableCategories.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Vendor</label>
                                    <div className="relative">
                                        <input
                                            list="vendor-options"
                                            value={vendor}
                                            onChange={e => setVendor(e.target.value)}
                                            className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm"
                                            placeholder="Select or Type..."
                                        />
                                        <datalist id="vendor-options">
                                            {availableVendors.map(v => <option key={v} value={v} />)}
                                        </datalist>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">Base Price ($)</label>
                                    <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full bg-[var(--card-bg)] border border-[var(--border-color)] rounded p-2 text-sm" />
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border-color)] flex justify-between bg-[var(--app-bg)]">
                    <button onClick={handleDelete} className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded hover:bg-red-500/20 transition-colors text-sm font-semibold">
                        <i className="fa-solid fa-trash mr-2"></i> Delete Transaction
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-[var(--card-bg)] text-[var(--text-color)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors text-sm">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 bg-[var(--primary-color)] text-white rounded hover:opacity-90 transition-opacity text-sm font-semibold shadow-lg shadow-blue-500/20">
                            <i className="fa-solid fa-check mr-2"></i> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
