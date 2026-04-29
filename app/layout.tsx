import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/ui/bottom-nav";
import { GlobalProfileAvatar } from "@/components/global-profile-avatar";
import { SessionProvider } from "@/components/providers/session-provider";
import { CompaniesProvider } from "@/components/providers/companies-provider";
import { PaymentsProvider } from "@/components/providers/payments-provider";
import { SuppliersProvider } from "@/components/providers/suppliers-provider";
import { DebtsProvider } from "@/components/providers/debts-provider";
import AIAssistantWrapper from "@/components/ai-assistant-wrapper";
import { UIProvider } from "@/components/providers/ui-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard Media",
  description: "Gestion financière simplifiée",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dash Media",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <div className="min-h-dvh bg-gray-50 pb-24 dark:bg-black font-sans">
          <SessionProvider>
          <CompaniesProvider>
            <SuppliersProvider>
              <DebtsProvider>
                <PaymentsProvider>
                  <UIProvider>
                    <GlobalProfileAvatar />
                    {children}
                    <BottomNav />
                    <AIAssistantWrapper />
                  </UIProvider>
                </PaymentsProvider>
              </DebtsProvider>
            </SuppliersProvider>
          </CompaniesProvider>
          </SessionProvider>
        </div>
      </body>
    </html>
  );
}
