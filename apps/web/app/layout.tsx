import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Multiship - Shipping API',
  description: 'Provider-agnostic shipping API with EasyPost, Shippo, and Veeqo adapters',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}