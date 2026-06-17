import { motion, AnimatePresence } from "motion/react";
import { X, Scale, Star, ArrowRight } from "lucide-react";
import { Product, getSpecIcon, getSpecLabel } from "./ProductCard";
import { cn } from "./utils";
import { type Lang } from "../../../i18n/translations";

interface ProductComparisonProps {
  products: Product[];
  onRemove: (product: Product) => void;
  onClear: () => void;
  mode: "agent" | "assistant";
  lang?: Lang;
}

export default function ProductComparison({
  products,
  onRemove,
  onClear,
  mode,
  lang = "id"
}: ProductComparisonProps) {
  const isOpen = products.length > 0;
  const isAgent = mode === "agent";

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[32px] border-t backdrop-blur-2xl shadow-[0_-15px_40px_rgba(0,0,0,0.15)] px-6 py-6 pb-8 transition-colors duration-500",
          isAgent
            ? "bg-white/95 border-indigo-100 text-slate-800"
            : "bg-[#0b0d16]/95 border-emerald-500/20 text-slate-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl",
              isAgent ? "bg-indigo-50 text-indigo-600" : "bg-emerald-500/10 text-emerald-400"
            )}>
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className={cn("text-lg font-bold", isAgent ? "text-slate-800" : "text-white")}>
                Bandingkan Gadget
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                {products.length === 1
                  ? "Pilih satu gadget lagi untuk mulai membandingkan"
                  : "Perbandingan spesifikasi teknis lengkap secara berdampingan"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {products.length > 0 && (
              <button
                onClick={onClear}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-lg hover:underline transition",
                  isAgent ? "text-slate-500" : "text-slate-400"
                )}
              >
                Reset
              </button>
            )}
            <button
              onClick={onClear}
              className={cn(
                "p-2 rounded-xl transition",
                isAgent ? "bg-slate-100 hover:bg-slate-200 text-slate-500" : "bg-white/5 hover:bg-white/10 text-slate-400"
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left panel / Helper */}
          <div className="md:col-span-3 space-y-4">
            <div className={cn(
              "p-5 rounded-2xl border",
              isAgent ? "bg-slate-50/50 border-slate-100" : "bg-white/[0.02] border-white/5"
            )}>
              <div className="text-2xl font-bold tracking-tight mb-2">
                {products.length} <span className="text-sm font-medium text-slate-400">/ 2 Gadget</span>
              </div>
              {products.length === 1 ? (
                <div className="space-y-3">
                  <div className="text-xs leading-relaxed text-slate-400">
                    Klik tombol <strong>Bandingkan</strong> di smartphone lain untuk menampilkan perbandingan komparatif di sini.
                  </div>
                  <div className="w-full h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className={cn("w-1/2 h-full rounded-full", isAgent ? "bg-indigo-500" : "bg-emerald-500")}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs leading-relaxed text-slate-400">
                  Kedua smartphone telah siap dibandingkan! Geser ke bawah untuk melihat tabel spesifikasi dan temukan pilihan terbaik Anda.
                </div>
              )}
            </div>
          </div>

          {/* Right panel / Products Table */}
          <div className="md:col-span-9">
            <div className="grid grid-cols-2 gap-4">
              {/* Product 1 Slot */}
              <div className="relative">
                {products[0] ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "p-4 rounded-2xl border flex flex-col items-center text-center",
                      isAgent ? "bg-slate-50/50 border-slate-100" : "bg-white/[0.02] border-white/5"
                    )}
                  >
                    <button
                      onClick={() => onRemove(products[0])}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 transition"
                      title="Hapus"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <img src={products[0].image} alt={products[0].name} className="w-16 h-16 object-contain mb-3 drop-shadow-md" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{products[0].brand}</span>
                    <h4 className={cn("text-sm font-bold line-clamp-1 mt-0.5", isAgent ? "text-slate-800" : "text-white")}>{products[0].name}</h4>
                    <span className={cn("text-sm font-extrabold mt-1.5", isAgent ? "text-indigo-600" : "text-emerald-400")}>{products[0].price}</span>
                  </motion.div>
                ) : (
                  <div className="h-32 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 text-xs">
                    Belum dipilih
                  </div>
                )}
              </div>

              {/* Product 2 Slot */}
              <div className="relative">
                {products[1] ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "p-4 rounded-2xl border flex flex-col items-center text-center",
                      isAgent ? "bg-slate-50/50 border-slate-100" : "bg-white/[0.02] border-white/5"
                    )}
                  >
                    <button
                      onClick={() => onRemove(products[1])}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 transition"
                      title="Hapus"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <img src={products[1].image} alt={products[1].name} className="w-16 h-16 object-contain mb-3 drop-shadow-md" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{products[1].brand}</span>
                    <h4 className={cn("text-sm font-bold line-clamp-1 mt-0.5", isAgent ? "text-slate-800" : "text-white")}>{products[1].name}</h4>
                    <span className={cn("text-sm font-extrabold mt-1.5", isAgent ? "text-indigo-600" : "text-emerald-400")}>{products[1].price}</span>
                  </motion.div>
                ) : (
                  <div className="h-[126px] rounded-2xl border border-dashed border-slate-200 dark:border-white/15 flex flex-col items-center justify-center text-slate-400/80 text-xs p-4 text-center">
                    <Scale className="w-6 h-6 mb-1 opacity-40 animate-pulse text-indigo-400" />
                    <span>Pilih smartphone kedua...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Spec Comparison Table (only shown when 2 products are selected) */}
            {products.length === 2 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-3.5 border-t border-slate-100 dark:border-white/5 pt-5"
              >
                {/* Row: Rating */}
                <div className="grid grid-cols-12 text-xs items-center py-1">
                  <div className="col-span-4 text-slate-400 font-semibold flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Rating
                  </div>
                  <div className="col-span-4 font-bold">{products[0].rating} <span className="text-[10px] font-medium text-slate-400">({products[0].reviewsCount})</span></div>
                  <div className="col-span-4 font-bold">{products[1].rating} <span className="text-[10px] font-medium text-slate-400">({products[1].reviewsCount})</span></div>
                </div>

                {/* Dynamic Spec Rows */}
                {(() => {
                  const keys = Array.from(new Set([
                    ...Object.keys(products[0]?.specs || {}),
                    ...Object.keys(products[1]?.specs || {})
                  ]));
                  
                  return keys.map((key) => {
                    const Icon = getSpecIcon(key);
                    return (
                      <div key={key} className="grid grid-cols-12 text-xs items-center py-2 border-t border-slate-50 dark:border-white/[0.02]">
                        <div className="col-span-4 text-slate-400 font-semibold flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" /> {getSpecLabel(key, lang)}
                        </div>
                        <div className="col-span-4 font-medium pr-2 line-clamp-2">{products[0].specs[key] || "-"}</div>
                        <div className="col-span-4 font-medium pr-2 line-clamp-2">{products[1].specs[key] || "-"}</div>
                      </div>
                    );
                  });
                })()}

                {/* Row: Fitur Unggulan */}
                <div className="grid grid-cols-12 text-xs items-center py-2.5 border-t border-slate-50 dark:border-white/[0.02]">
                  <div className="col-span-4 text-slate-400 font-semibold flex items-center gap-1.5">
                    💡 Fitur Utama
                  </div>
                  <div className="col-span-4 flex flex-wrap gap-1">
                    {products[0].tags.map((tag, idx) => (
                      <span key={idx} className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold", isAgent ? "bg-indigo-50 text-indigo-600" : "bg-emerald-500/10 text-emerald-400")}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="col-span-4 flex flex-wrap gap-1">
                    {products[1].tags.map((tag, idx) => (
                      <span key={idx} className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold", isAgent ? "bg-indigo-50 text-indigo-600" : "bg-emerald-500/10 text-emerald-400")}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
