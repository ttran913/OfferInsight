import '@/app/ui/global.css';
import { inter } from '@/app/ui/fonts';
import { Navbar } from '@/components/navbar';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="min-h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script dangerouslySetInnerHTML={{
          __html: `window.FontAwesomeConfig = { autoReplaceSvg: 'nest'};`
        }} />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js" crossOrigin="anonymous" referrerPolicy="no-referrer" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{
          __html: `
            ::-webkit-scrollbar { display: none; }
            .show-scrollbar { scrollbar-width: thin; scrollbar-color: #6b7280 #1f2937; }
            .show-scrollbar::-webkit-scrollbar { display: block; width: 8px; }
            .show-scrollbar::-webkit-scrollbar-track { background: #1f2937; border-radius: 4px; }
            .show-scrollbar::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 4px; }
            .show-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
            html, body { font-family: 'Inter', sans-serif; width: 100%; margin: 0; padding: 0; overflow-x: hidden; }
          `
        }} />
      </head>
      <body className={`${inter.className} antialiased bg-gradient-to-br from-midnight-blue to-gray-900 min-h-full w-full`} suppressHydrationWarning={true}>
        <Navbar />
        <main className="w-full bg-gradient-to-br from-midnight-blue to-gray-900 pt-[var(--navbar-height)]">{children}</main>
      </body>
    </html>
  );
}
