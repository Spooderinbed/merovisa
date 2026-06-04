import { redirect } from "next/navigation";

export default function ChecklistPage() {
  // Phase 5 shipped as a documents vault at /documents. The per-program
  // checklist view is deferred — until it lands, send users to the vault.
  redirect("/documents");
}
