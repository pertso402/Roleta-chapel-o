import './globals.css';

export const metadata = {
  title: 'Chapelão — Gira e descobre teu prêmio',
  description: 'Clube do Chapelão: gire a roleta e resgate seu prêmio no WhatsApp.',
  robots: { index: false, follow: false },
};

// viewportFit=cover pro mosaico do rodapé encostar na borda em iPhone.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FBF3E4',
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
