import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CarolinaTaxSale.com',
    short_name: 'CarolinaTaxSale',
    description: 'Find and analyze delinquent tax parcels before they hit the auction block.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#038289',
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
