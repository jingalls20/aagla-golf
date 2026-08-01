import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AAGLA Golf',
  description: 'Scores, handicaps and season standings for the AAGLA golf leagues',
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
