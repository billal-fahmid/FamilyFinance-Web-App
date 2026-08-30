import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-6 text-center">
        <h2 className="font-medium">Verify your email</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a confirmation link to your inbox. Click it to activate your account, then sign in.
        </p>
        <Link href="/login" className="inline-block text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
