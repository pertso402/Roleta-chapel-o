import { Montserrat } from 'next/font/google';
import './globals.css';

// next/font hospeda a fonte no próprio domínio e injeta o @font-face no CSS
// inicial: sem requisição a fonts.googleapis.com, sem DNS extra e sem o
// pisca-pisca de texto trocando de fonte. Importa porque a meta é first
// paint abaixo de 1,5s — a pessoa está com a comida esfriando na frente.
//
// Montserrat é a mesma família do logo do Chapelão e do painel de pedidos:
// a landing não parece de outra empresa.
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--fonte',
});

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
    <html lang="pt-BR" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
