import { FocusBar } from "@/components/layout/focus-bar";

export default function FocusedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FocusBar />
      <main>{children}</main>
    </>
  );
}
