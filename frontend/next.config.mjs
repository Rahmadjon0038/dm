/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    // Instagram profil rasmlari va attachmentlar CDN domenlari ozgaruvchan,
    // shuning uchun oddiy <img> ishlatiladi; next/image optimizatsiyasi shart emas.
    unoptimized: true,
  },
};

export default nextConfig;
