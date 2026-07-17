import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'CV Annotator',
  description: 'Computer Vision image annotation and dataset export tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#EAEEF5] text-black">
        {children}
      </body>
    </html>
  );
}
