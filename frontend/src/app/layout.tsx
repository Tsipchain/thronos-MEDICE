import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ThronomedICE — Παρακολούθηση Ασθενών',
  description: 'Σύστημα παρακολούθησης ζωτικών σημείων',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body className="bg-slate-50 min-h-screen text-slate-800">{children}</body>
    </html>
  );
}
