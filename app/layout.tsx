import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AAGLA Golf',
  description: 'Scores, handicaps and season standings for the AAGLA golf leagues',
  // Named explicitly so a home-screen tile reads "AAGLA" rather than being
  // truncated from the full title, and so iOS opens it standalone.
  appleWebApp: { capable: true, title: 'AAGLA', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#12301f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
