import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Input } from "./components/ui/input";
import { Send, Paperclip, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import ProductCard, { Product } from "./components/ui/ProductCard";
import ProductComparison from "./components/ui/ProductComparison";
import { cn } from "./components/ui/utils";

// ─── Parse [PRODUCTS:{...}] dari response agent ─────────────────────────────

/**
 * Ekstrak data produk dari blok [PRODUCTS:{"items":[...]}] yang disisipkan agent.
 * Mengembalikan array Product[] atau [] jika tidak ada / parse gagal.
 */
export function parseProductsFromResponse(text: string): Product[] {
  if (!text) return [];
  // Regex: cari [PRODUCTS:{...}] — gunakan greedy matching agar tidak terpotong oleh nested brackets (misal colors)
  const match = text.match(/\[PRODUCTS:(\{[\s\S]*\})\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    const items: unknown[] = Array.isArray(parsed.items) ? parsed.items : [];
    return items.filter(Boolean).map((item: unknown) => {
      const p = item as Record<string, unknown>;
      return {
        id: String(p.id ?? Math.random()),
        name: String(p.name ?? "Produk"),
        brand: String(p.brand ?? ""),
        price: String(p.price ?? "Rp 0"),
        rating: Number(p.rating ?? 0),
        reviewsCount: Number(p.reviewsCount ?? 0),
        specs: {
          screen: String((p.specs as Record<string, unknown>)?.screen ?? "-"),
          processor: String((p.specs as Record<string, unknown>)?.processor ?? "-"),
          camera: String((p.specs as Record<string, unknown>)?.camera ?? "-"),
          battery: String((p.specs as Record<string, unknown>)?.battery ?? "-"),
        },
        tags: Array.isArray(p.tags) ? (p.tags as string[]) : ["Toko Aimer"],
        image: String(p.image ?? `https://placehold.co/300x300/e2e8f0/475569?text=${encodeURIComponent(String(p.name ?? "Produk")).slice(0, 15)}`),
        colors: Array.isArray(p.colors) ? (p.colors as { name: string; hex: string }[]) : [{ name: "Default", hex: "#8E8E93" }],
      } satisfies Product;
    });
  } catch {
    return [];
  }
}

/**
 * Ekstrak daftar ID produk dari blok [PRODUCTS:id1,id2,id3] jika ada.
 * Mengembalikan array string ID atau [] jika tidak ada.
 */
export function extractProductIdsFromResponse(text: string): string[] {
  if (!text) return [];
  // Cocokkan [PRODUCTS: diikuti oleh daftar ID, bisa diakhiri oleh ] atau sampai akhir string (jika terpotong)
  const match = text.match(/\[PRODUCTS:([\s\S]*?)(?:\]|$)/);
  if (!match) return [];
  const content = match[1].trim();
  if (content.startsWith("{")) return []; // Ini format JSON lama
  
  // Pecah berdasarkan koma dan ambil hanya ID yang valid (24 karakter heksadesimal yang lengkap)
  return content
    .split(",")
    .map(id => id.trim())
    .filter(id => /^[a-fA-F0-9]{24}$/i.test(id));
}

/**
 * Hapus blok [PRODUCTS:{...}] atau [PRODUCTS:id1,id2,id3] dari teks agar tidak muncul mentah di chat bubble.
 */
export function cleanTextFromProducts(text: string): string {
  // Hapus format JSON lama: [PRODUCTS:{...}]
  let cleaned = text.replace(/\[PRODUCTS:\{[\s\S]*?(\}\]|$)/g, "");
  // Hapus format ID baru: [PRODUCTS:...] (bisa diakhiri oleh ] atau sampai akhir teks jika terpotong)
  cleaned = cleaned.replace(/\[PRODUCTS:[\s\S]*?(?:\]|$)/g, "");
  // Hapus format PENELUSURAN: [PENELUSURAN:...] (bisa diakhiri oleh ] atau sampai akhir teks jika terpotong)
  cleaned = cleaned.replace(/\[PENELUSURAN:[\s\S]*?(?:\]|$)/g, "");
  return cleaned.trimEnd();
}

export const parseProductsFromText = parseProductsFromResponse; // backward compat alias

interface Message {
  id: number;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  image?: string;
  products?: Product[];
  productsLoading?: boolean; // ✨ NEW: skeleton loader status
  rawText?: string; // ✨ NEW: raw response text before cleaning
}


// ─── Tipe untuk Quick Prompt dari API ─────────────────────────────────────────
interface QuickPrompt {
  id: string;
  icon: string;
  title: string;
  description: string;
  prompt: string;
  color: string;
}

// Map color name → Tailwind gradient classes (agent & assistant mode)
const PROMPT_COLORS: Record<string, { agent: string; assistant: string; icon: string }> = {
  indigo:  { agent: "from-indigo-50 to-indigo-100/50 hover:from-indigo-100 hover:to-indigo-200/50 border-indigo-200 hover:border-indigo-300",   assistant: "from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border-indigo-500/20 hover:border-indigo-500/40",   icon: "agent:bg-indigo-200/50 agent:text-indigo-700 assistant:bg-indigo-500/20 assistant:text-indigo-300" },
  emerald: { agent: "from-emerald-50 to-emerald-100/50 hover:from-emerald-100 hover:to-emerald-200/50 border-emerald-200 hover:border-emerald-300", assistant: "from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border-emerald-500/20 hover:border-emerald-500/40", icon: "agent:bg-emerald-200/50 agent:text-emerald-700 assistant:bg-emerald-500/20 assistant:text-emerald-300" },
  violet:  { agent: "from-violet-50 to-violet-100/50 hover:from-violet-100 hover:to-violet-200/50 border-violet-200 hover:border-violet-300",   assistant: "from-violet-500/10 to-purple-500/10 hover:from-violet-500/20 hover:to-purple-500/20 border-violet-500/20 hover:border-violet-500/40",   icon: "agent:bg-violet-200/50 agent:text-violet-700 assistant:bg-violet-500/20 assistant:text-violet-300" },
  rose:    { agent: "from-rose-50 to-rose-100/50 hover:from-rose-100 hover:to-rose-200/50 border-rose-200 hover:border-rose-300",             assistant: "from-rose-500/10 to-pink-500/10 hover:from-rose-500/20 hover:to-pink-500/20 border-rose-500/20 hover:border-rose-500/40",         icon: "agent:bg-rose-200/50 agent:text-rose-700 assistant:bg-rose-500/20 assistant:text-rose-300" },
  blue:    { agent: "from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border-blue-200 hover:border-blue-300",             assistant: "from-blue-500/10 to-sky-500/10 hover:from-blue-500/20 hover:to-sky-500/20 border-blue-500/20 hover:border-blue-500/40",         icon: "agent:bg-blue-200/50 agent:text-blue-700 assistant:bg-blue-500/20 assistant:text-blue-300" },
  amber:   { agent: "from-amber-50 to-amber-100/50 hover:from-amber-100 hover:to-amber-200/50 border-amber-200 hover:border-amber-300",       assistant: "from-amber-500/10 to-yellow-500/10 hover:from-amber-500/20 hover:to-yellow-500/20 border-amber-500/20 hover:border-amber-500/40",  icon: "agent:bg-amber-200/50 agent:text-amber-700 assistant:bg-amber-500/20 assistant:text-amber-300" },
};

const FALLBACK_PROMPTS: QuickPrompt[] = [
  {
    id: "gaming",
    icon: "🎮",
    title: "Rekomendasi HP Gaming",
    description: "Cari smartphone performa tinggi untuk gaming budget di bawah 5 juta.",
    prompt: "Bisa rekomendasikan smartphone untuk gaming dengan budget di bawah 5 juta?",
    color: "indigo",
  },
  {
    id: "flagship",
    icon: "⚖️",
    title: "Bandingkan Flagship",
    description: "Perbandingan spesifikasi antara iPhone 15 Pro dan Samsung Galaxy S24 Ultra.",
    prompt: "Apa perbedaan spesifikasi dan keunggulan antara iPhone 15 Pro dengan Samsung Galaxy S24 Ultra?",
    color: "emerald",
  },
];

export default function App() {
  const [mode, setMode] = useState<"agent" | "assistant">("agent");
  const [sessionId] = useState(() => "session-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now());

  // ─── Quick Prompts: fetch dari API ──────────────────────────────────────────
  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>(FALLBACK_PROMPTS);

  useEffect(() => {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const baseUrl = isLocal ? "http://localhost:8000" : "https://myagentic-apps.fastapicloud.dev";
    fetch(`${baseUrl}/v1/agent/quick-prompts`)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (Array.isArray(data?.prompts) && data.prompts.length > 0) {
          setQuickPrompts(data.prompts);
        }
      })
      .catch(() => {
        // Jika gagal, tetap pakai fallback
      });
  }, []);

  const [agentMessages, setAgentMessages] = useState<Message[]>([
    {
      id: 1,
      sender: "ai",
      text: "Halo! Saya Luna, konsultan smartphone toko Aimer. 👋\n\nSaya siap bantu kamu cari gadget terbaik sesuai kebutuhan dan budgetmu! Semua rekomendasi saya selalu berdasarkan produk yang tersedia di toko kita, jadi gak perlu khawatir soal keakuratan datanya ya 😊\n\nMau cari HP apa hari ini?",
      timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    }
  ]);
  const [assistantMessages, setAssistantMessages] = useState<Message[]>([]);

  const messages = mode === "agent" ? agentMessages : assistantMessages;

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Action handler for Product Card buttons
  const handleProductAction = (action: "check_stock" | "view_specs" | "booking", product: Product) => {
    if (action === "check_stock") {
      handleSendMessage(`Apakah unit **${product.name}** saat ini ready stock di toko Anda?`);
    } else if (action === "view_specs") {
      handleSendMessage(`Bisa tolong berikan rincian spesifikasi lengkap dan kelebihan dari **${product.name}**?`);
    } else if (action === "booking") {
      handleSendMessage(`Bisa tolong booking produk **${product.name}** untuk saya?`);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      console.log("File selected:", files[0]);
    }
  };

  const handleSendMessage = async (textOverride?: string | React.MouseEvent) => {
    const textToSend = typeof textOverride === 'string' ? textOverride : inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userText = textToSend;
    const newMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const targetMode = mode;
    const modeSetMessages = (updater: React.SetStateAction<Message[]>) => {
      if (targetMode === "agent") setAgentMessages(updater);
      else setAssistantMessages(updater);
    };

    modeSetMessages((prev) => [...prev, newMessage]);
    setInputMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setIsLoading(true);

    // Keep focus on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    try {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const baseUrl = isLocal ? "http://localhost:8000" : "https://myagentic-apps.fastapicloud.dev";
      const endpoint = targetMode === "agent"
        ? `${baseUrl}/v1/agent/chat`
        : `${baseUrl}/v1/assistant/chat`; // Endpoint untuk assistant

      // Menghubungi API
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          user_id: "user-aimer-1",
          session_id: sessionId, // Use persistent session ID to maintain chat memory
          messages: [
            {
              role: "user",
              content: userText
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      const aiResponseId = Date.now() + 1;
      let aiText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkStr = decoder.decode(value, { stream: true });

          // Parsing SSE dan raw chunks
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const dataStr = line.slice(5).trim();
              if (dataStr === '[DONE]') continue;

              try {
                const data = JSON.parse(dataStr);
                if (data.text) {
                  aiText += data.text;
                } else if (data.error) {
                  console.error("Stream Error:", data.error);
                } else if (typeof data === 'string') {
                  aiText += data;
                }
              } catch {
                // Jika JSON.parse gagal, anggap sebagai raw text
                aiText += dataStr;
              }
            } else if (line.trim() !== '') {
              // Non-SSE text
              aiText += line;
            }
          }

          if (aiText.trim() !== "") {
            setIsLoading(false); // Sembunyikan loading dots setelah teks pertama diterima

            // Parse produk dari blok [PRODUCTS:...] secara real-time
            const parsedProducts = parseProductsFromResponse(aiText);
            const isStreamingProducts = aiText.includes("[PRODUCTS:");
            // Bersihkan teks dari blok [PRODUCTS:...] agar tidak muncul mentah
            const cleanText = cleanTextFromProducts(aiText);

            modeSetMessages((prev) => {
              const exists = prev.some(msg => msg.id === aiResponseId);
              const isOldFormatFinished = parsedProducts.length > 0;
              const isLoading = isStreamingProducts && !isOldFormatFinished;

              if (!exists) {
                return [...prev, {
                  id: aiResponseId,
                  sender: "ai",
                  text: cleanText,
                  rawText: aiText,
                  products: isOldFormatFinished ? parsedProducts : undefined,
                  productsLoading: isLoading ? true : undefined,
                  timestamp: new Date().toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }];
              } else {
                return prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      text: cleanText,
                      rawText: aiText,
                      products: isOldFormatFinished ? parsedProducts : msg.products,
                      productsLoading: isOldFormatFinished ? false : (isLoading ? true : msg.productsLoading),
                    }
                    : msg
                );
              }
            });
          }
        }
      }

      // Jika proses stream selesai namun tidak ada teks yang berhasil diterima
      if (aiText.trim() === "") {
        setIsLoading(false);
      } else {
        // ─── STREAM SELESAI: Pemicu Fetch Batch jika format ID-Only ─────────────────
        const productIds = extractProductIdsFromResponse(aiText);
        if (productIds.length > 0) {
          // Tunjukkan skeleton loader terlebih dahulu
          modeSetMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiResponseId
                ? { ...msg, productsLoading: true }
                : msg
            )
          );

          try {
            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            const baseUrl = isLocal ? "http://localhost:8000" : "https://myagentic-apps.fastapicloud.dev";
            
            const response = await fetch(`${baseUrl}/v1/products/batch?ids=${productIds.join(",")}`);
            if (response.ok) {
              const data = await response.json();
              if (data.items && Array.isArray(data.items)) {
                modeSetMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiResponseId
                      ? { ...msg, products: data.items, productsLoading: false }
                      : msg
                  )
                );
              } else {
                modeSetMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiResponseId
                      ? { ...msg, productsLoading: false }
                      : msg
                  )
                );
              }
            } else {
              throw new Error("Failed to fetch batch products");
            }
          } catch (err) {
            console.error("Batch fetch error:", err);
            modeSetMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiResponseId
                  ? { ...msg, productsLoading: false }
                  : msg
              )
            );
          }
        }
      }

    } catch (error) {
      setIsLoading(false);
      console.error("Error communicating with AI:", error);
      const errorMsg: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: `Koneksi ke sistem **Aimer ${targetMode === 'agent' ? 'Agent' : 'Assistant'}** gagal. Coba lagi dalam beberapa saat.`,
        timestamp: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      modeSetMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="relative w-screen h-screen flex justify-center overflow-hidden">
      {/* ============================================================
          Aurora Animated Background
          FIX: overflow-hidden pada container mencegah motion.div
          yang ber-animasi meluap keluar dan menyebabkan seluruh
          halaman ikut bergerak / scroll.
          Animasi y-axis dihapus — hanya opacity yang berubah,
          pergerakan lateral (x) masih aman karena root punya
          overflow-hidden.
      ============================================================ */}
      {/* Background: transisi berdasarkan mode */}
      <div className={`absolute inset-0 overflow-hidden transition-colors duration-700 ${mode === 'agent' ? 'bg-gradient-to-b from-slate-50 via-slate-100/80 to-slate-200/60' : 'bg-gradient-to-b from-[#0d1117] via-[#0f1923] to-[#0a0f1a]'}`}>
        <div className={`absolute inset-0 transition-opacity duration-700 opacity-100`}>
          {/* Aurora Layer 1 — Soft Mint/Teal */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent 0px,
                transparent 10px,
                ${mode === 'agent' ? 'rgba(99, 102, 241, 0.05)' : 'rgba(110, 231, 183, 0.08)'} 10px,
                ${mode === 'agent' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(110, 231, 183, 0.2)'} 12px,
                ${mode === 'agent' ? 'rgba(79, 70, 229, 0.2)' : 'rgba(94, 234, 212, 0.28)'} 15px,
                ${mode === 'agent' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(110, 231, 183, 0.2)'} 18px,
                ${mode === 'agent' ? 'rgba(99, 102, 241, 0.05)' : 'rgba(110, 231, 183, 0.08)'} 20px,
                transparent 20px,
                transparent 50px
              )
            `,
              filter: mode === 'agent' ? "blur(3px)" : "blur(4px)",
              transform: "skewY(-10deg)",
              willChange: "opacity, transform",
            }}
            animate={{
              x: [-80, 80, -80],
              opacity: [0.5, 0.75, 0.5],
            }}
            transition={{
              duration: 28,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Aurora Layer 2 — Soft Sky Blue */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                95deg,
                transparent 0px,
                transparent 14px,
                ${mode === 'agent' ? 'rgba(168, 85, 247, 0.05)' : 'rgba(147, 197, 253, 0.1)'} 14px,
                ${mode === 'agent' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(147, 197, 253, 0.25)'} 16px,
                ${mode === 'agent' ? 'rgba(147, 51, 234, 0.2)' : 'rgba(96, 165, 250, 0.32)'} 19px,
                ${mode === 'agent' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(147, 197, 253, 0.25)'} 22px,
                ${mode === 'agent' ? 'rgba(168, 85, 247, 0.05)' : 'rgba(147, 197, 253, 0.1)'} 24px,
                transparent 24px,
                transparent 60px
              )
            `,
              filter: mode === 'agent' ? "blur(4px)" : "blur(5px)",
              transform: "skewY(8deg)",
              willChange: "opacity, transform",
            }}
            animate={{
              x: [100, -120, 100],
              opacity: [0.4, 0.65, 0.4],
            }}
            transition={{
              duration: 34,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Aurora Layer 3 — Soft Lavender */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                88deg,
                transparent 0px,
                transparent 12px,
                ${mode === 'agent' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(196, 181, 253, 0.1)'} 12px,
                ${mode === 'agent' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(196, 181, 253, 0.22)'} 14px,
                ${mode === 'agent' ? 'rgba(2, 132, 199, 0.2)' : 'rgba(167, 139, 250, 0.3)'} 17px,
                ${mode === 'agent' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(196, 181, 253, 0.22)'} 20px,
                ${mode === 'agent' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(196, 181, 253, 0.1)'} 22px,
                transparent 22px,
                transparent 55px
              )
            `,
              filter: mode === 'agent' ? "blur(3px)" : "blur(6px)",
              transform: "skewY(-5deg)",
              willChange: "opacity, transform",
            }}
            animate={{
              x: [-60, 110, -60],
              opacity: [0.45, 0.65, 0.45],
            }}
            transition={{
              duration: 26,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Aurora Layer 4 — Soft Sage Green */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                92deg,
                transparent 0px,
                transparent 16px,
                ${mode === 'agent' ? 'rgba(244, 114, 182, 0.05)' : 'rgba(134, 239, 172, 0.08)'} 16px,
                ${mode === 'agent' ? 'rgba(244, 114, 182, 0.15)' : 'rgba(134, 239, 172, 0.18)'} 18px,
                ${mode === 'agent' ? 'rgba(219, 39, 119, 0.2)' : 'rgba(74, 222, 128, 0.24)'} 21px,
                ${mode === 'agent' ? 'rgba(244, 114, 182, 0.15)' : 'rgba(134, 239, 172, 0.18)'} 24px,
                ${mode === 'agent' ? 'rgba(244, 114, 182, 0.05)' : 'rgba(134, 239, 172, 0.08)'} 26px,
                transparent 26px,
                transparent 65px
              )
            `,
              filter: mode === 'agent' ? "blur(4px)" : "blur(7px)",
              transform: "skewY(12deg)",
              willChange: "opacity, transform",
            }}
            animate={{
              x: [70, -90, 70],
              opacity: [0.4, 0.6, 0.4],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Soft Glow — Top Mint */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 15%, rgba(94, 234, 212, 0.12) 0%, transparent 55%)",
              filter: "blur(90px)",
            }}
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Soft Glow — Bottom Lavender */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 85%, rgba(167, 139, 250, 0.14) 0%, transparent 55%)",
              filter: "blur(100px)",
            }}
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Main Chat App Container */}
      <div className={`relative z-10 w-full max-w-4xl h-screen flex flex-col backdrop-blur-3xl border-x shadow-2xl transition-colors duration-700 ${mode === 'agent' ? 'bg-white/60 border-slate-200/50 shadow-[0_0_40px_rgba(0,0,0,0.05)]' : 'bg-[#0f111a]/80 border-white/[0.05]'}`}>

        {/* Header - Aimer Consultant Brand */}
        <header className={`px-4 py-3 sm:px-6 sm:py-5 border-b flex items-center justify-between shrink-0 transition-colors duration-700 ${mode === 'agent' ? 'bg-white/50 border-slate-200' : 'bg-black/20 border-white/[0.05]'}`}>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className={`relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br ${mode === 'agent' ? 'from-indigo-100 to-purple-50 border-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]'} border overflow-hidden transition-colors duration-500`}>
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src="/images/Luna.png" className="object-cover" />
                <AvatarFallback className="bg-transparent rounded-none">
                  <Sparkles className={`w-5 h-5 sm:w-6 sm:h-6 ${mode === 'agent' ? 'text-indigo-600' : 'text-emerald-400'}`} />
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h1 className={`text-sm sm:text-xl font-bold tracking-wide bg-clip-text text-transparent ${mode === 'agent' ? 'bg-gradient-to-r from-slate-800 to-slate-600' : 'bg-gradient-to-r from-white to-white/70'}`}>AIMER FUTURE</h1>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${mode === 'agent' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'} animate-pulse`} />
                <span className={`text-[10px] sm:text-xs font-semibold tracking-wide uppercase ${mode === 'agent' ? 'text-indigo-600' : 'text-emerald-300/80'}`}>{mode === 'agent' ? 'Agent Online' : 'Assistant Online'}</span>
              </div>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className={`flex items-center p-1 sm:p-1.5 rounded-xl border shadow-inner transition-colors duration-700 ${mode === 'agent' ? 'bg-slate-100/80 border-slate-200' : 'bg-black/40 border-white/10'}`}>
            <button
              onClick={() => setMode('assistant')}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[11px] sm:text-sm font-medium transition-all duration-300 ${mode === 'assistant' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : (mode === 'agent' ? 'text-slate-500 hover:text-slate-700 border border-transparent' : 'text-slate-400 hover:text-slate-200 border border-transparent')}`}
            >
              Assistant
            </button>
            <button
              onClick={() => setMode('agent')}
              className={`flex items-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[11px] sm:text-sm font-medium transition-all duration-300 ${mode === 'agent' ? 'bg-white text-indigo-600 border border-indigo-200 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
            >
              Agent
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              mode={mode}
              onAction={handleProductAction}
            />
          ))}

          {mode === 'agent' && messages.length === 1 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2"
            >
              {quickPrompts.slice(0, 4).map((qp, idx) => {
                const colorKey = qp.color in PROMPT_COLORS ? qp.color : "indigo";
                const colorCls = PROMPT_COLORS[colorKey];
                // Pilih beberapa warna icon berdasarkan color name + mode
                const iconBg: Record<string, { agent: string; assistant: string }> = {
                  indigo:  { agent: "bg-indigo-200/50 text-indigo-700",  assistant: "bg-indigo-500/20 text-indigo-300" },
                  emerald: { agent: "bg-emerald-200/50 text-emerald-700", assistant: "bg-emerald-500/20 text-emerald-300" },
                  violet:  { agent: "bg-violet-200/50 text-violet-700",  assistant: "bg-violet-500/20 text-violet-300" },
                  rose:    { agent: "bg-rose-200/50 text-rose-700",      assistant: "bg-rose-500/20 text-rose-300" },
                  blue:    { agent: "bg-blue-200/50 text-blue-700",      assistant: "bg-blue-500/20 text-blue-300" },
                  amber:   { agent: "bg-amber-200/50 text-amber-700",    assistant: "bg-amber-500/20 text-amber-300" },
                };
                const iconCls = (iconBg[colorKey] ?? iconBg.indigo)[mode];
                const cardCls = colorCls[mode];
                return (
                  <motion.button
                    key={qp.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + idx * 0.08 }}
                    onClick={() => handleSendMessage(qp.prompt)}
                    className={`text-left px-5 py-4 rounded-2xl bg-gradient-to-br transition-all duration-300 group border ${cardCls}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg group-hover:scale-110 transition-transform ${iconCls}`}>
                        {qp.icon}
                      </div>
                      <span className={`font-semibold text-sm ${mode === 'agent' ? 'text-slate-800' : 'text-slate-200'}`}>
                        {qp.title}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed ${mode === 'agent' ? 'text-slate-600' : 'text-slate-400'}`}>
                      {qp.description}
                    </p>
                  </motion.button>
                );
              })}
            </motion.div>
          )}

          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4 max-w-[80%]"
            >
              <div className="flex-shrink-0 mt-1">
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${mode === 'agent' ? 'from-indigo-100 border-indigo-200 to-slate-50' : 'from-emerald-900/80 border-emerald-500/30 to-slate-900/80'} border flex items-center justify-center shadow-lg overflow-hidden`}>
                  <Avatar className="w-full h-full rounded-none">
                    <AvatarImage src="/images/Luna.png" className="object-cover" />
                    <AvatarFallback className="bg-transparent rounded-none">
                      <Sparkles className={`w-5 h-5 ${mode === 'agent' ? 'text-indigo-600' : 'text-emerald-400'}`} />
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className={`px-5 py-4 rounded-2xl rounded-tl-none border shadow-xl backdrop-blur-md flex items-center gap-3 h-[52px] ${mode === 'agent' ? 'bg-white border-indigo-100 shadow-sm' : 'bg-slate-900/50 border-emerald-500/20'}`}>
                <div className="flex items-center gap-1.5 px-1 py-1">
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className={`w-2 h-2 ${mode === 'agent' ? 'bg-indigo-400' : 'bg-emerald-400'} rounded-full`} />
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className={`w-2 h-2 ${mode === 'agent' ? 'bg-indigo-400' : 'bg-emerald-400'} rounded-full`} />
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className={`w-2 h-2 ${mode === 'agent' ? 'bg-indigo-400' : 'bg-emerald-400'} rounded-full`} />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className={`px-3 sm:px-6 pb-2 pt-1 sm:pb-3 sm:pt-2 shrink-0 bg-gradient-to-t transition-colors duration-700 ${mode === 'agent' ? 'from-white/80 to-transparent' : 'from-[#0a0b10] to-transparent'}`}>
          <div className="relative group">
            {/* Glow effect behind input */}
            <div className={`absolute -inset-1 bg-gradient-to-r ${mode === 'agent' ? 'from-indigo-200/50 via-purple-200/50 to-indigo-200/50' : 'from-emerald-500/20 via-teal-500/20 to-emerald-500/20'} rounded-[24px] blur-md opacity-70 group-focus-within:opacity-100 transition duration-500`}></div>

            <div className={`relative flex items-center gap-1.5 sm:gap-3 backdrop-blur-xl border rounded-[20px] p-1.5 sm:p-2 shadow-2xl transition-all duration-300 ${mode === 'agent' ? 'bg-white/90 border-slate-200 focus-within:border-indigo-400 focus-within:bg-white' : 'bg-[#11131a]/90 border-white/10 focus-within:border-emerald-500/50 focus-within:bg-[#151822]'}`}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                className="hidden"
              />
              <button
                onClick={handleFileClick}
                className={`p-2 sm:p-3 rounded-xl transition-colors ${mode === 'agent' ? 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100' : 'text-slate-400 hover:text-emerald-300 hover:bg-white/5'}`}
                title="Lampirkan File"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  // Auto grow/shrink
                  if (inputRef.current) {
                    inputRef.current.style.height = "auto";
                    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'agent' ? "Tanyakan seputar smartphone..." : "Ketik pesan Anda..."}
                rows={1}
                className={`flex-1 bg-transparent border-none shadow-none focus-visible:outline-none focus:outline-none focus:ring-0 text-[14px] sm:text-[15px] px-2 py-2 sm:py-3.5 resize-none h-10 sm:h-12 overflow-y-auto no-scrollbar ${mode === 'agent' ? 'text-slate-800 placeholder:text-slate-400' : 'text-white placeholder:text-slate-500/80'}`}
              />

              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className={`p-2.5 sm:p-3.5 rounded-xl flex items-center justify-center transition-all duration-300 ${inputMessage.trim() && !isLoading
                  ? (mode === 'agent'
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)]") + " hover:scale-105 active:scale-95"
                  : (mode === 'agent' ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-white/5 text-slate-500 cursor-not-allowed")
                  }`}
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            </div>

            <div className="text-center mt-4">
              <span className="text-[11px] text-slate-500/70 font-medium tracking-wide">
                Sistem AI dapat melakukan kesalahan. Harap verifikasi informasi penting secara mandiri.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Comparison Drawer Removed (Not online store context) */}
    </div>
  );
}

function ChatMessage({
  message,
  mode,
  onAction
}: {
  message: Message;
  mode: "agent" | "assistant";
  onAction: (action: "check_stock" | "view_specs" | "booking", product: Product) => void;
}) {
  const isUser = message.sender === "user";
  const isAgent = mode === "agent";

  const renderSearchingIndicator = () => {
    if (isUser || !message.rawText) return null;
    const match = message.rawText.match(/\[PENELUSURAN:\s*(.*?)\]/i);
    if (!match) return null;
    const query = match[1].trim();
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-2xl border mb-3 backdrop-blur-md shadow-sm no-prose",
          isAgent 
            ? "bg-indigo-50/50 border-indigo-100/50 text-indigo-950" 
            : "bg-emerald-950/20 border-emerald-900/30 text-emerald-300"
        )}
      >
        <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", isAgent ? "bg-indigo-400" : "bg-emerald-400")} />
          <span className={cn("relative inline-flex rounded-full h-3.5 w-3.5", isAgent ? "bg-indigo-600" : "bg-emerald-500")} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Penelusuran Web</span>
          <span className="text-xs font-semibold truncate leading-tight">Mencari &ldquo;{query}&rdquo; di internet...</span>
        </div>
      </div>
    );
  };

  // Produk berasal dari field products yang di-parse saat streaming
  const displayProducts: Product[] = message.products ?? [];

  const renderMessageContent = (text: string): ReactNode => {
    // Parse bold text for simpler markdown support
    const processFormatting = (content: string) => {
      const parts = content.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          if (isUser) {
            return <strong key={i} className="font-extrabold text-white">{boldText}</strong>;
          }
          return (
            <strong 
              key={i} 
              className={cn(
                "font-bold tracking-normal px-1.5 py-0.5 rounded mx-0.5 inline-block border",
                isAgent 
                  ? "text-indigo-950 bg-indigo-50/30 border-indigo-100/20" 
                  : "text-emerald-300 bg-emerald-950/40 border-emerald-900/20"
              )}
            >
              {boldText}
            </strong>
          );
        }
        return part;
      });
    };

    const renderTextSegment = (segmentText: string) => {
      const lines = segmentText.split('\n');
      return lines.map((line, idx) => {
        // Cek header (###, ##, #)
        if (line.trim().startsWith('###') || line.trim().startsWith('##') || line.trim().startsWith('#')) {
          const title = line.replace(/^#+\s+/, '');
          return (
            <div key={idx} className={cn(
              "flex items-center gap-2 mt-2 mb-1 pb-0.5 border-b font-extrabold tracking-tight text-[15px] sm:text-base",
              isAgent && !isUser
                ? "text-indigo-700 dark:text-indigo-400 border-indigo-100/50" 
                : "text-emerald-400 border-white/5"
            )}>
              <span className={cn("w-1 h-3.5 rounded-full", isAgent && !isUser ? "bg-indigo-600 dark:bg-indigo-400" : "bg-emerald-400")} />
              {processFormatting(title)}
            </div>
          );
        }

        // Cek bullet list (- atau *)
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const content = line.trim().substring(2);
          const indent = line.search(/\S/);
          return (
            <div key={idx} className="flex items-start gap-2 my-0.5 pl-1" style={{ paddingLeft: `${indent * 4 + 4}px` }}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.1)]", 
                isAgent && !isUser ? "bg-indigo-500 dark:bg-indigo-400" : "bg-emerald-400"
              )} />
              <span className="leading-snug text-sm sm:text-[15px]">{processFormatting(content)}</span>
            </div>
          );
        }

        // Cek numbered list (1. 2. dll)
        const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          const num = numMatch[1];
          const content = numMatch[2];
          const indent = line.search(/\S/);
          return (
            <div key={idx} className="flex items-start gap-2 my-1 pl-1" style={{ paddingLeft: `${indent * 4 + 4}px` }}>
              <span className={cn(
                "flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-extrabold mt-0.5 shrink-0 shadow-sm",
                isAgent && !isUser 
                  ? "bg-indigo-50 text-indigo-600 border border-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/30" 
                  : "bg-emerald-950/40 text-emerald-300 border border-emerald-500/20"
              )}>
                {num}
              </span>
              <span className="leading-snug text-sm sm:text-[15px]">{processFormatting(content)}</span>
            </div>
          );
        }

        // Standard line
        if (line.trim() === "") {
          return <div key={idx} className="h-0.5" />;
        }
        return (
          <p key={idx} className="text-sm sm:text-[15px] leading-snug mb-1 whitespace-pre-wrap">
            {processFormatting(line)}
          </p>
        );
      });
    };

    // Parse code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = text.substring(lastIndex, match.index);
        parts.push(
          <div key={`text-${lastIndex}`}>
            {renderTextSegment(textBefore)}
          </div>
        );
      }

      const language = match[1] || "text";
      const code = match[2].trim();

      parts.push(
        <div key={`code-${match.index}`} className="my-4 rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#1e1e1e]">
          <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">{language}</span>
          </div>
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: "1rem",
              fontSize: "14px",
              background: "transparent",
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const textAfter = text.substring(lastIndex);
      parts.push(
        <div key={`text-${lastIndex}`}>
          {renderTextSegment(textAfter)}
        </div>
      );
    }

    return parts.length > 0 ? <>{parts}</> : <div className="w-full">{renderTextSegment(text)}</div>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 sm:gap-4 w-full ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br border flex items-center justify-center shadow-lg ${mode === 'agent' ? 'from-slate-100 to-slate-200 border-slate-300' : 'from-slate-700 to-slate-900 border-slate-600/50'}`}>
            <Avatar className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl">
              <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" />
              <AvatarFallback className={`bg-transparent font-medium text-xs sm:text-sm ${mode === 'agent' ? 'text-slate-600' : 'text-slate-200'}`}>U</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br border flex items-center justify-center overflow-hidden ${mode === 'agent' ? 'from-indigo-50 to-indigo-100/50 border-indigo-200 shadow-sm' : 'from-emerald-900/80 to-slate-900/80 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]'}`}>
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src="/images/Luna.png" className="object-cover" />
              <AvatarFallback className="bg-transparent rounded-none">
                <Sparkles className={`w-4 h-4 sm:w-5 sm:h-5 ${mode === 'agent' ? 'text-indigo-600' : 'text-emerald-400'}`} />
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col max-w-[88%] sm:max-w-[80%] ${isUser ? "items-end" : "items-start"} min-w-0 w-full`}>
        <div className="flex items-center gap-2 mb-1 px-1">
          {isUser ? (
            <>
              <span className={`text-[10px] sm:text-[11px] font-medium ${mode === 'agent' ? 'text-slate-400' : 'text-slate-500'}`}>{message.timestamp}</span>
              <span className={`text-xs sm:text-[13px] font-semibold tracking-wide ${mode === 'agent' ? 'text-slate-700' : 'text-slate-300'}`}>Anda</span>
            </>
          ) : (
            <>
              <span className={`text-xs sm:text-[13px] font-semibold tracking-wide ${mode === 'agent' ? 'text-indigo-600' : 'text-emerald-300'}`}>
                AIMER {mode === 'agent' ? 'AGENT' : 'ASSISTANT'}
              </span>
              <span className={`text-[10px] sm:text-[11px] font-medium ${mode === 'agent' ? 'text-slate-400' : 'text-slate-500'}`}>{message.timestamp}</span>
            </>
          )}
        </div>

        <div
          className={`px-3.5 sm:px-5 py-3 sm:py-4 rounded-[16px] sm:rounded-[20px] shadow-xl backdrop-blur-md ${isUser
            ? (mode === 'agent' ? 'rounded-tr-sm bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.15)]' : 'rounded-tr-sm bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 text-slate-100')
            : (mode === 'agent' ? 'rounded-tl-sm bg-white border border-indigo-100 text-slate-700 shadow-sm' : 'rounded-tl-sm bg-slate-900/60 border border-emerald-500/20 text-slate-200')
            }`}
        >
          {message.image && (
            <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
              <img src={message.image} alt="Attachment" className="w-full max-w-sm h-auto object-cover" />
            </div>
          )}
          <div className={`prose prose-p:leading-relaxed max-w-none text-sm sm:text-[15px] ${mode === 'agent' && !isUser ? 'prose-slate text-slate-700' : 'prose-invert text-white/95'}`}>
            {renderSearchingIndicator()}
            {renderMessageContent(message.text)}
          </div>
        </div>

        {/* Skeleton Loader Carousel (Rendered OUTSIDE bubble for clean full-width scroll) */}
        {message.productsLoading && (
          <div
            className="mt-4 flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 w-full max-w-full"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none"
            }}
          >
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className={`w-[260px] sm:w-[290px] h-[340px] sm:h-[380px] shrink-0 rounded-2xl border p-4 flex flex-col justify-between backdrop-blur-md animate-pulse ${
                  isAgent
                    ? "bg-white/40 border-indigo-50/50"
                    : "bg-slate-900/40 border-emerald-500/10"
                }`}
              >
                <div className="flex flex-col gap-3">
                  {/* Badge Skeleton */}
                  <div className={`w-16 h-4 rounded-full ${isAgent ? "bg-slate-200" : "bg-slate-800"}`} />
                  {/* Image Area Skeleton */}
                  <div className={`w-full h-[120px] sm:h-[140px] rounded-xl flex items-center justify-center ${isAgent ? "bg-slate-50" : "bg-black/10"}`}>
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${isAgent ? "bg-slate-100" : "bg-slate-800"}`} />
                  </div>
                  {/* Rating Skeleton */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`w-3.5 h-3.5 rounded-full ${isAgent ? "bg-slate-200" : "bg-slate-800"}`} />
                    <div className={`w-12 h-3 rounded ${isAgent ? "bg-slate-200" : "bg-slate-800"}`} />
                  </div>
                  {/* Name Skeleton */}
                  <div className={`w-3/4 h-5 rounded ${isAgent ? "bg-slate-200" : "bg-slate-800"}`} />
                  {/* Price Skeleton */}
                  <div className={`w-1/2 h-6 rounded ${isAgent ? "bg-indigo-100/50" : "bg-emerald-900/10"}`} />
                </div>
                {/* Buttons Skeleton */}
                <div className="flex gap-2">
                  <div className={`flex-1 h-8 sm:h-9 rounded-xl ${isAgent ? "bg-slate-100" : "bg-white/5"}`} />
                  <div className={`flex-1 h-8 sm:h-9 rounded-xl ${isAgent ? "bg-indigo-100" : "bg-emerald-900/30"}`} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Cards Carousel (Rendered OUTSIDE bubble for clean full-width scroll) */}
        {displayProducts.length > 0 && !message.productsLoading && (
          <div
            className="mt-4 flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 w-full max-w-full"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none"
            }}
          >
            {displayProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                mode={mode}
                onAction={onAction}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}