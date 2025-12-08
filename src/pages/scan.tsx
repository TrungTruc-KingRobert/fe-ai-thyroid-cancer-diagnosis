import DocumentScanner from "@/components/document-scanner";

export default function ScanPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Scan tài liệu</h1>
      <DocumentScanner />
    </div>
  );
}
