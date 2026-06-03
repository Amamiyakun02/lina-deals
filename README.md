# 🤖 Lina Deals - AI Smartphone Consultant (Aimer Future)

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-12.x-FFCA28?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Lina Deals** is an interactive, AI-driven smartphone consultation and sales platform for **Aimer Future**. Powered by an intelligent virtual assistant named **Lina**, the application acts as a smart guide for users looking to find, compare, and reserve smartphones.

---

## 🌟 Key Features

### 1. 💬 Intelligent AI Consultation
*   Interact with **Lina**, a friendly and smart smartphone consultant.
*   Get tailored recommendations based on user budget, brand preferences, camera quality, gaming needs, and more.

### 2. 📊 Interactive Product Cards
*   Lina dynamically renders rich, interactive spec cards in the chat.
*   Users can directly click buttons to **Tanya Stok (Check Stock)**, **Detail (View Specs)**, or **Booking Sekarang (Book Now)** directly inside the conversation.

### 3. 🔍 Real-Time Web Search & Benchmarks
*   Lina can perform external web searches in real-time.
*   Get up-to-date benchmarks (AnTuTu, Geekbench), expert reviews, and real-time market data with citation sources.

### 4. 🛒 Automated WhatsApp Booking System
*   Seamlessly reserve devices by saying *"Tolong booking [Nama HP]"*.
*   Once contact information (Full Name & WhatsApp number) is provided, a reservation receipt and booking code are sent automatically to the user's WhatsApp.

### 5. 🔐 Member Authentication
*   Secure registration and login system.
*   Integrates Name, Email, and WhatsApp number for personalized booking and history.

### 6. 🌐 Bilingual Support
*   Full translation support between **Indonesian (ID)** and **English (EN)** at the click of a button.

---

## 🛠️ Tech Stack

*   **Frontend Framework**: React 18 with TypeScript
*   **Build Tool**: Vite 6
*   **Styling**: Tailwind CSS v4 + Radix UI components (Shadcn/ui) + Motion (Framer Motion)
*   **Database & Auth**: Firebase
*   **Icons**: Lucide React + Material-UI Icons

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18 or higher recommended)
*   `npm` or `pnpm`

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Amamiyakun02/lina-deals.git
   cd lina-deals
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Set up environment variables (if any) in a `.env` file at the root.

### Development

To start the local development server:
```bash
npm run dev
# or
pnpm dev
```
Open `http://localhost:5173` in your browser.

### Production Build

To build the project for production deployment:
```bash
npm run build
# or
pnpm build
```
The output will be generated in the `/dist` folder, ready for deployment on platforms like Vercel or Firebase Hosting.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
Attributions for UI library and stock images are listed in [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
