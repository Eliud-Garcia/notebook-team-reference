import './globals.css'

export const metadata = {
  title: 'PDF notebook desde tu repositorio',
  description:
    'Pega la URL de un repositorio de GitHub y genera un notebook en PDF de 3 columnas, o copia el código LaTeX para Overleaf.'
}

export default function RootLayout ({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
