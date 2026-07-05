import { useState, useMemo, useEffect, useRef } from "react";
import { Search, SlidersHorizontal, ArrowUpDown, ShoppingBag } from "lucide-react";
import { motion } from "motion/react";
import ProductCard, { Product } from "./ui/ProductCard";
import { translations, type Lang } from "../../i18n/translations";
import { cn } from "./ui/utils";

interface ProductCatalogProps {
  lang: Lang;
  onProductAction: (action: "check_stock" | "view_specs" | "booking", product: Product) => void;
  isActive?: boolean;
}

const STATIC_PRODUCTS: Product[] = [];
const parsePriceToNumber = (priceStr: string): number => {
  return parseInt(priceStr.replace(/[^0-9]/g, ""), 10) || 0;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04
    }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring" as const, stiffness: 350, damping: 26 } 
  }
} as const;

export default function ProductCatalog({ lang, onProductAction, isActive = true }: ProductCatalogProps) {
  const t = translations[lang];

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "smartphone" | "accessories">("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc">("featured");

  // API and Fallback State
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination (Batching) State
  const [visibleCount, setVisibleCount] = useState(12);

  // Debounced search query to limit API calls
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);

  const [availableBrands, setAvailableBrands] = useState<string[]>([]);

  // Track previous filters to determine if we should show skeleton loading
  const prevFiltersRef = useRef({ debouncedSearch, selectedCategory, selectedBrand, sortBy });

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load products from API with local fallback
  useEffect(() => {
    // Only fetch if the tab is active
    if (!isActive) return;

    const filterChanged = 
      prevFiltersRef.current.debouncedSearch !== debouncedSearch ||
      prevFiltersRef.current.selectedCategory !== selectedCategory ||
      prevFiltersRef.current.selectedBrand !== selectedBrand ||
      prevFiltersRef.current.sortBy !== sortBy;

    prevFiltersRef.current = { debouncedSearch, selectedCategory, selectedBrand, sortBy };

    let active = true;
    const loadProducts = async () => {
      // If a filter changed OR we have no products, do a full reload (isLoading = true)
      // Otherwise (just tab switching), do a silent background reload (isRefetching)
      setProducts(prev => {
        if (filterChanged || prev.length === 0) {
          setIsLoading(true);
        } else {
          setIsRefetching(true);
        }
        return prev;
      });
      setError(null);
      setVisibleCount(12); // Reset batch to 12 when filters change

      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const baseUrl = isLocal ? "http://localhost:8000" : "https://linaagent.fastapicloud.dev";

      const params = new URLSearchParams();
      params.append("limit", "200");
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());
      if (selectedCategory !== "all") params.append("category", selectedCategory);
      if (selectedBrand !== "all") params.append("brand", selectedBrand);
      if (sortBy !== "featured") params.append("sort_by", sortBy);

      try {
        const response = await fetch(`${baseUrl}/v1/products?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (active) {
          if (data.items && Array.isArray(data.items)) {
            setProducts(data.items);
            if (selectedBrand === "all") {
              const bSet = new Set<string>();
              data.items.forEach((p: Product) => {
                if (p.brand && p.brand.trim()) {
                  bSet.add(p.brand);
                }
              });
              setAvailableBrands(Array.from(bSet).sort());
            }
          } else {
            setProducts([]);
          }
        }
      } catch (err: any) {
        console.warn("Backend API unavailable, falling back to local filtering:", err);
        if (active) {
          // Local filter of STATIC_PRODUCTS as robust fallback
          let fallback = [...STATIC_PRODUCTS];
          if (debouncedSearch.trim()) {
            const q = debouncedSearch.toLowerCase();
            fallback = fallback.filter(p => 
              p.name.toLowerCase().includes(q) || 
              p.brand.toLowerCase().includes(q) || 
              p.tags.some(tag => tag.toLowerCase().includes(q)) ||
              Object.values(p.specs).some(val => val.toLowerCase().includes(q))
            );
          }
          if (selectedCategory !== "all") {
            fallback = fallback.filter(p => {
              if (selectedCategory === "smartphone") {
                return p.tags.includes("Smartphone");
              } else if (selectedCategory === "accessories") {
                return p.tags.includes("Aksesoris") || p.tags.includes("Hard Case") || p.tags.includes("Soft Case");
              }
              return true;
            });
          }
          if (selectedBrand !== "all") {
            fallback = fallback.filter(p => p.brand.toLowerCase() === selectedBrand.toLowerCase());
          }
          if (sortBy === "price-asc") {
            fallback.sort((a, b) => parsePriceToNumber(a.price) - parsePriceToNumber(b.price));
          } else if (sortBy === "price-desc") {
            fallback.sort((a, b) => parsePriceToNumber(b.price) - parsePriceToNumber(a.price));
          }
          setProducts(fallback);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadProducts();
    return () => {
      active = false;
    };
  }, [debouncedSearch, selectedCategory, selectedBrand, sortBy]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/30">
      {/* Search & Filter Header (Premium Minimalist panel) */}
      <div className="p-2 sm:p-6 bg-white/70 border-b border-slate-200/60 backdrop-blur-md shrink-0 space-y-2 sm:space-y-4">
        {/* Row 1: Search & Sort */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Search bar */}
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 sm:pl-10 sm:pr-4 sm:py-2.5 rounded-xl border border-slate-200 bg-white/80 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100/50 focus:outline-none text-sm transition-all duration-300 text-slate-800 placeholder:text-slate-400 shadow-sm"
            />
          </div>

          {/* Sorter */}
          <div className="flex gap-1.5 sm:gap-2 shrink-0 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            {/* Brand Dropdown */}
            <div className="relative flex items-center border border-slate-200 rounded-xl bg-white/80 px-2 py-1.5 sm:px-3 sm:py-2 text-slate-700 shadow-sm hover:border-slate-350 transition-colors shrink-0">
              <span className="text-[11px] sm:text-xs font-bold text-slate-450 mr-1 sm:mr-2">{t.filterBrand}:</span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="bg-transparent border-none outline-none text-[11px] sm:text-sm font-bold text-slate-800 cursor-pointer pr-1"
              >
                <option value="all">{t.brandAll}</option>
                {availableBrands.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            {/* Price Sort */}
            <div className="relative flex items-center border border-slate-200 rounded-xl bg-white/80 px-2 py-1.5 sm:px-3 sm:py-2 text-slate-700 shadow-sm hover:border-slate-350 transition-colors shrink-0">
              <ArrowUpDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-2 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-none outline-none text-[11px] sm:text-sm font-bold text-slate-800 cursor-pointer pr-1"
              >
                <option value="featured">Pilihan Utama</option>
                <option value="price-asc">{t.priceLowHigh}</option>
                <option value="price-desc">{t.priceHighLow}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Row 2: Category Pills */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 no-scrollbar">
          <SlidersHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0 mr-0.5 sm:mr-1" />
          <button
            onClick={() => setSelectedCategory("all")}
            className={cn(
              "px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 cursor-pointer border active:scale-95 hover:scale-105",
              selectedCategory === "all"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/50"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100/50 hover:text-slate-850 hover:border-slate-305"
            )}
          >
            {t.filterAll}
          </button>
          <button
            onClick={() => setSelectedCategory("smartphone")}
            className={cn(
              "px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 cursor-pointer border active:scale-95 hover:scale-105",
              selectedCategory === "smartphone"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/50"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100/50 hover:text-slate-855 hover:border-slate-305"
            )}
          >
            {t.filterSmartphones}
          </button>
          <button
            onClick={() => setSelectedCategory("accessories")}
            className={cn(
              "px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold transition-all duration-300 shrink-0 cursor-pointer border active:scale-95 hover:scale-105",
              selectedCategory === "accessories"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/50"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100/50 hover:text-slate-855 hover:border-slate-305"
            )}
          >
            {t.filterAccessories}
          </button>
        </div>
      </div>

      {/* Grid Content Area */}
      <div className="flex-1 overflow-y-auto px-2 py-2 sm:px-6 sm:py-6">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-6 justify-items-center">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div
                key={item}
                className="w-full max-w-[280px] sm:max-w-[290px] h-[340px] sm:h-[380px] shrink-0 rounded-2xl border p-4 flex flex-col justify-between backdrop-blur-md animate-pulse bg-white/40 border-slate-200/50"
              >
                <div className="flex flex-col gap-3">
                  <div className="w-16 h-4 rounded-full bg-slate-200" />
                  <div className="w-full h-[120px] sm:h-[140px] rounded-xl flex items-center justify-center bg-slate-100/50">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-200/50" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-200" />
                    <div className="w-12 h-3 rounded bg-slate-200" />
                  </div>
                  <div className="w-3/4 h-5 rounded bg-slate-200" />
                  <div className="w-1/2 h-6 rounded bg-indigo-100/50" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-8 sm:h-9 rounded-xl bg-slate-200/60" />
                  <div className="flex-1 h-8 sm:h-9 rounded-xl bg-indigo-150/40" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-6 justify-items-center"
            >
              {products.slice(0, visibleCount).map(product => (
                <motion.div key={product.id} variants={itemVariants} className="w-full flex justify-center h-auto">
                  <ProductCard
                    product={product}
                    mode="agent"
                    lang={lang}
                    onAction={(action) => onProductAction(action, product)}
                  />
                </motion.div>
              ))}
            </motion.div>

            {/* Load More Button */}
            {visibleCount < products.length && (
              <div className="flex justify-center mt-10 mb-6">
                <button
                  onClick={() => setVisibleCount(prev => prev + 12)}
                  className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-indigo-300 transition-all shadow-sm active:scale-95"
                >
                  Muat Lebih Banyak
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-500">{t.noProductsFound}</p>
          </div>
        )}
      </div>
    </div>
  );
}
