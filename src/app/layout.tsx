import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { loadConfig } from '@/backend/utils/load-config';
import { Footer } from '@/frontend/components/layout/Footer';
import { SiteHeader } from '@/frontend/components/layout/SiteHeader';
import { SessionProvider } from '@/frontend/contexts/SessionContext';
import { ToastProvider } from '@/frontend/contexts/ToastContext';
import { homeTitle } from '@/frontend/copy';
import './globals.css';

export const metadata: Metadata = {
  title: homeTitle,
};

/**
 * Root document shell with session, toasts, header, and footer.
 * @param props - Layout props.
 * @param props.children - The active page.
 * @returns The HTML document.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const { footer } = loadConfig();

  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <ToastProvider>
            <SiteHeader />
            {children}
            <Footer fullName={footer.fullName} githubUrl={footer.githubUrl} linkedinUrl={footer.linkedinUrl} />
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
