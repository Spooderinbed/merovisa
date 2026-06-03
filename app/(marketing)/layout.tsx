import { AppBar } from "@/components/layout/app-bar";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppBar variant="marketing" />
      <main>{children}</main>
      <Footer />
    </>
  );
}
