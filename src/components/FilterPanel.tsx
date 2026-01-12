
import React, { useState } from 'react';
import { FilterState } from '../types';

interface FilterPanelProps {
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    availableCategories: string[];
    availableDepartments: string[];
    availableVendors: string[];
    availableProperties: string[];
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ filters, setFilters, availableCategories, availableDepartments, availableVendors, availableProperties }) => {
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const toggleFilter = (type: 'categories' | 'departments' | 'vendors' | 'selectedProperty', value: string) => {
        setFilters(prev => {
            const current = prev[type];
            const newValues = current.includes(value)
                ? current.filter(item => item !== value)
                : [...current, value];
            return { ...prev, [type]: newValues };
        });
    };

    const clearFilter = (type: 'categories' | 'departments' | 'vendors' | 'selectedProperty') => {
        setFilters(prev => ({ ...prev, [type]: [] }));
    };

    const renderMultiSelect = (title: string, type: 'categories' | 'departments' | 'vendors' | 'selectedProperty', options: string[]) => {
        const selected = filters[type];
        const isExpanded = expandedSection === type;
        const [searchTerm, setSearchTerm] = useState('');

        const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

        return (
            <div className="border-b border-[var(--border-color)] last:border-0">
                <button
                    onClick={() => toggleSection(type)}
                    className="w-full flex justify-between items-center py-3 text-xs font-semibold text-[var(--text-muted)] uppercase hover:text-[var(--text-color)] transition-colors"
                >
                    <span>{title} {selected.length > 0 && <span className="ml-1 bg-[var(--primary-color)] text-white text-[10px] px-1.5 rounded-full">{selected.length}</span>}</span>
                    <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} transition-transform`}></i>
                </button>

                {isExpanded && (
                    <div className="pb-3 animate-in slide-in-from-top-2 duration-200">
                        <input
                            type="text"
                            placeholder={`Search ${title}...`}
                            className="w-full bg-[var(--card-bg)] text-xs border border-[var(--border-color)] rounded p-1.5 mb-2 outline-none focus:border-[var(--primary-color)]"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />

                        <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer hover:bg-[var(--app-bg)] p-1 rounded text-xs">
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(opt)}
                                        onChange={() => toggleFilter(type, opt)}
                                        className="rounded border-[var(--border-color)] text-[var(--primary-color)] focus:ring-0"
                                    />
                                    <span className="truncate" title={opt}>{opt}</span>
                                </label>
                            )) : (
                                <div className="text-[10px] text-[var(--text-muted)] italic p-1">No matches found</div>
                            )}
                        </div>

                        {selected.length > 0 && (
                            <button
                                onClick={() => clearFilter(type)}
                                className="text-[10px] text-[var(--primary-color)] hover:underline mt-2 w-full text-left"
                            >
                                Clear {title} Filters
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-1">
            {renderMultiSelect('Stores', 'selectedProperty', availableProperties)}
            {renderMultiSelect('Departments', 'departments', availableDepartments)}
            {renderMultiSelect('Categories', 'categories', availableCategories)}
            {renderMultiSelect('Vendors', 'vendors', availableVendors)}
        </div>
    );
};
