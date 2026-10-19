import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
      <p className="text-muted-foreground text-sm">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Button nativeButton={false} render={<Link to="/" />}>
        Back to dashboard
      </Button>
    </div>
  );
}
