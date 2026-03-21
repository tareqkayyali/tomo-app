import { Toaster } from "@/components/ui/sonner";

export const metadata = {
  title: "Tomo Admin",
  description: "Content management for the Tomo athlete platform",
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
