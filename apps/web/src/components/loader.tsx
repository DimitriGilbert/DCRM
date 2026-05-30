import { Loader2 } from "lucide-react";

export default function Loader() {
  return (
    <div role="status" aria-label="Loading" className="flex h-full items-center justify-center pt-8">
      <Loader2 className="animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
