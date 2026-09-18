import "./globals.css";

export const metadata = {
  title: "Doué Creative Portal",
  description: "Submit and track requests with Doué Creative",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
