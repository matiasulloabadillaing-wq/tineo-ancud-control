import "./globals.css";

export const metadata = {
  title: "Software control de Proyectos",
  description: "LT2x500kVA Tineo-Ancud"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
