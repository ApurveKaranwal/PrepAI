// Custom assessment pages are fully client-rendered and need no server layout
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function CustomAssessmentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
