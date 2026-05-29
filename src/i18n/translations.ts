export type Lang = "id" | "en";

export interface Translations {
  // Header
  agentOnline: string;
  brandName: string;

  // Welcome message (Luna)
  welcomeMessage: string;

  // Input
  inputPlaceholder: string;
  attachFile: string;

  // Disclaimer
  disclaimer: string;

  // Chat labels
  you: string;
  aiLabel: string;

  // Searching indicator
  searchingLabel: string;
  searchingText: (query: string) => string;

  // Quick Prompts (fallback)
  quickPrompts: {
    gaming: {
      title: string;
      description: string;
      prompt: string;
    };
    flagship: {
      title: string;
      description: string;
      prompt: string;
    };
  };

  // Error messages
  connectionError: string;

  // Language toggle
  langToggleLabel: string;
}

const id: Translations = {
  // Header
  agentOnline: "Agent Online",
  brandName: "AIMER FUTURE",

  // Welcome message
  welcomeMessage:
    "Halo! Saya Luna, konsultan smartphone toko Aimer. 👋\n\nSaya siap bantu kamu cari gadget terbaik sesuai kebutuhan dan budgetmu! Semua rekomendasi saya selalu berdasarkan produk yang tersedia di toko kita, jadi gak perlu khawatir soal keakuratan datanya ya 😊\n\nMau cari HP apa hari ini?",

  // Input
  inputPlaceholder: "Tanyakan seputar smartphone...",
  attachFile: "Lampirkan File",

  // Disclaimer
  disclaimer:
    "Sistem AI dapat melakukan kesalahan. Harap verifikasi informasi penting secara mandiri.",

  // Chat labels
  you: "Anda",
  aiLabel: "AIMER AGENT",

  // Searching indicator
  searchingLabel: "Penelusuran Web",
  searchingText: (query) => `Mencari "${query}" di internet...`,

  // Quick Prompts
  quickPrompts: {
    gaming: {
      title: "Rekomendasi HP Gaming",
      description:
        "Cari smartphone performa tinggi untuk gaming budget di bawah 5 juta.",
      prompt:
        "Bisa rekomendasikan smartphone untuk gaming dengan budget di bawah 5 juta?",
    },
    flagship: {
      title: "Bandingkan Flagship",
      description:
        "Perbandingan spesifikasi antara iPhone 15 Pro dan Samsung Galaxy S24 Ultra.",
      prompt:
        "Apa perbedaan spesifikasi dan keunggulan antara iPhone 15 Pro dengan Samsung Galaxy S24 Ultra?",
    },
  },

  // Error
  connectionError: "Koneksi ke sistem **Aimer Agent** gagal. Coba lagi dalam beberapa saat.",

  // Language toggle
  langToggleLabel: "EN",
};

const en: Translations = {
  // Header
  agentOnline: "Agent Online",
  brandName: "AIMER FUTURE",

  // Welcome message
  welcomeMessage:
    "Hello! I'm Luna, Aimer store's smartphone consultant. 👋\n\nI'm ready to help you find the best gadget that fits your needs and budget! All my recommendations are always based on products available in our store, so no need to worry about data accuracy 😊\n\nWhat phone are you looking for today?",

  // Input
  inputPlaceholder: "Ask about smartphones...",
  attachFile: "Attach File",

  // Disclaimer
  disclaimer:
    "AI systems can make mistakes. Please verify important information independently.",

  // Chat labels
  you: "You",
  aiLabel: "AIMER AGENT",

  // Searching indicator
  searchingLabel: "Web Search",
  searchingText: (query) => `Searching "${query}" on the internet...`,

  // Quick Prompts
  quickPrompts: {
    gaming: {
      title: "Gaming Phone Picks",
      description:
        "Find high-performance smartphones for gaming under 5 million IDR.",
      prompt:
        "Can you recommend a smartphone for gaming with a budget under 5 million IDR?",
    },
    flagship: {
      title: "Compare Flagships",
      description:
        "Compare specs between iPhone 15 Pro and Samsung Galaxy S24 Ultra.",
      prompt:
        "What are the spec differences and advantages between iPhone 15 Pro and Samsung Galaxy S24 Ultra?",
    },
  },

  // Error
  connectionError: "Connection to **Aimer Agent** failed. Please try again in a moment.",

  // Language toggle
  langToggleLabel: "ID",
};

export const translations: Record<Lang, Translations> = { id, en };
