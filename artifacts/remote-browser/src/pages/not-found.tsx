import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0b0d0f] text-[#e8ecef]">
      <Card className="w-full max-w-md mx-4 border-[#292e32] bg-[#111416]">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-[#f08b83]" />
            <h1 className="text-2xl font-medium text-[#e8ecef]">
              404 Page Not Found
            </h1>
          </div>

          <p className="mt-4 text-sm text-[#9ba4aa]">
            This page does not exist.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
