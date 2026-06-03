import { notFound } from "next/navigation";
import { DestinationDetail } from "@/components/destinations/destination-detail";
import { getMarketingDestination, MARKETING_DESTINATIONS } from "@/lib/marketing/destinations";

export function generateStaticParams() {
  return MARKETING_DESTINATIONS.map((c) => ({ id: c.id }));
}

export default async function DestinationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const destination = getMarketingDestination(id);
  if (!destination) notFound();
  return <DestinationDetail destination={destination} />;
}
