import { useState } from "react";
import { motion } from "motion/react";
import { Star, Cpu, Smartphone, Camera, Battery, ClipboardCheck, Info } from "lucide-react";
import { cn } from "./utils";

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: string;
  rating: number;
  reviewsCount: number;
  specs: {
    screen: string;
    processor: string;
    camera: string;
    battery: string;
  };
  tags: string[];
  image: string;
  colors: { name: string; hex: string }[];
  link?: string;
}

interface ProductCardProps {
  product: Product;
  mode: "agent" | "assistant";
  onAction?: (action: "check_stock" | "view_specs" | "booking", product: Product) => void;
}

export default function ProductCard({
  product,
  mode,
  onAction
}: ProductCardProps) {
  const [selectedColor, setSelectedColor] = useState(0);
  const isAgent = mode === "agent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "relative flex flex-col w-[260px] sm:w-[290px] shrink-0 rounded-2xl border overflow-hidden backdrop-blur-md transition-all duration-500 shadow-lg",
        isAgent
          ? "bg-white/70 border-indigo-100 hover:border-indigo-300 hover:shadow-indigo-100/40"
          : "bg-slate-900/70 border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-emerald-950/50"
      )}
    >
      {/* Top badges / Tags */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1">
        <span className={cn(
          "px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold tracking-wider uppercase shadow-sm",
          isAgent
            ? "bg-indigo-600 text-white"
            : "bg-emerald-600 text-white"
        )}>
          {product.brand}
        </span>
        {product.tags.slice(0, 1).map((tag, idx) => (
          <span key={idx} className={cn(
            "px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium backdrop-blur-md shadow-sm border",
            isAgent
              ? "bg-slate-100/80 text-slate-700 border-slate-200"
              : "bg-black/40 text-slate-300 border-white/10"
          )}>
            {tag}
          </span>
        ))}
      </div>

      {/* Product Image Area */}
      <div className={cn(
        "relative w-full h-[130px] sm:h-[160px] flex items-center justify-center overflow-hidden border-b",
        isAgent ? "bg-slate-50/50 border-slate-100" : "bg-black/20 border-white/[0.05]"
      )}>
        {/* Glow behind image on hover */}
        <div className={cn(
          "absolute w-28 h-28 sm:w-36 sm:h-36 rounded-full blur-3xl opacity-20 -z-10 transition-transform duration-500 scale-100 group-hover:scale-125",
          isAgent ? "bg-indigo-400" : "bg-emerald-400"
        )} />
        
        <motion.img
          whileHover={{ scale: 1.08 }}
          transition={{ duration: 0.3 }}
          src={product.image}
          alt={product.name}
          className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.15)] filter"
        />

        {/* Color selectors overlay */}
        <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex items-center gap-1 bg-black/30 backdrop-blur-md px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-white/10 z-10">
          {product.colors.map((color, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedColor(idx)}
              className={cn(
                "w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full border border-white/40 transition-all duration-200 hover:scale-110",
                selectedColor === idx ? "ring-1 sm:ring-2 ring-white scale-105" : "opacity-75"
              )}
              style={{ backgroundColor: color.hex }}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* Product Info */}
      <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Rating */}
          <div className="flex items-center gap-1 mb-1">
            <div className="flex items-center text-amber-500">
              <Star className="w-3 sm:w-3.5 h-3 sm:h-3.5 fill-current" />
            </div>
            <span className={cn(
              "text-[11px] sm:text-xs font-semibold",
              isAgent ? "text-slate-800" : "text-slate-200"
            )}>
              {product.rating}
            </span>
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">
              ({product.reviewsCount} review)
            </span>
          </div>

          {/* Product Name */}
          <h3 className={cn(
            "text-sm sm:text-base font-bold tracking-tight line-clamp-1 mb-1 sm:mb-1.5",
            isAgent ? "text-slate-800" : "text-white"
          )}>
            {product.name}
          </h3>

          {/* Price */}
          <div className={cn(
            "text-base sm:text-lg font-extrabold tracking-tight mb-2.5 sm:mb-3.5",
            isAgent ? "text-indigo-600" : "text-emerald-400"
          )}>
            {product.price}
          </div>

          {/* Specifications mini-grid */}
          <div className={cn(
            "grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-medium py-2 sm:py-3 border-y mb-3 sm:mb-4",
            isAgent ? "border-slate-100 text-slate-600" : "border-white/[0.05] text-slate-400"
          )}>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Smartphone className="w-3 sm:w-3.5 h-3 sm:h-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-1" title={product.specs.screen}>{product.specs.screen}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Cpu className="w-3 sm:w-3.5 h-3 sm:h-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-1" title={product.specs.processor}>{product.specs.processor}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Camera className="w-3 sm:w-3.5 h-3 sm:h-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-1" title={product.specs.camera}>{product.specs.camera}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Battery className="w-3 sm:w-3.5 h-3 sm:h-3.5 shrink-0 text-slate-400" />
              <span className="line-clamp-1" title={product.specs.battery}>{product.specs.battery}</span>
            </div>
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex gap-1.5 sm:gap-2">
            <button
              onClick={() => onAction?.("check_stock", product)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold border transition-all duration-300 bg-white border-slate-200 text-slate-700",
                isAgent
                  ? "hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-400"
              )}
            >
              <ClipboardCheck className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Tanya Stok</span>
            </button>

            <button
              onClick={() => onAction?.("view_specs", product)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold border transition-all duration-300 bg-white border-slate-200 text-slate-700",
                isAgent
                  ? "hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600"
                  : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-400"
              )}
            >
              <Info className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
              <span>Detail</span>
            </button>
          </div>

          <button
            onClick={() => onAction?.("booking", product)}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold text-white transition-all duration-300 shadow-md",
              isAgent
                ? "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200/50 hover:shadow-indigo-300/50"
                : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50 hover:shadow-emerald-900/50"
            )}
          >
            <span>🛍️ Booking Sekarang</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
