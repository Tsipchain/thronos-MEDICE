import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ThronomedICE',
  description: 'Σύστημα παρακολούθησης ζωτικών σημείων',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body className="bg-slate-50 min-h-screen text-slate-800">{children}</body>
    </html>
  );
}
