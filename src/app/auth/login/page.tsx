import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BookOpen } from "lucide-react";
import { AUTH_PROVIDERS } from "@/lib/auth/providers";
import { signInWithProvider } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <BookOpen className="text-primary" size={20} />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              말씀곳간
            </h1>
          </div>
          <p className="text-xs text-muted-foreground tracking-widest">
            로그인하고 사용 기록을 동기화하세요
          </p>
        </header>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-6 space-y-3">
            {params.error && (
              <p className="text-xs text-red-400 text-center">{params.error}</p>
            )}
            {params.info && (
              <p className="text-xs text-primary/80 text-center">{params.info}</p>
            )}

            {AUTH_PROVIDERS.map((provider) => (
              <form key={provider.id} action={signInWithProvider}>
                <input type="hidden" name="provider_id" value={provider.id} />
                {provider.kind === "magiclink" && (
                  <Input
                    type="email"
                    name="email"
                    required
                    placeholder="이메일 주소"
                    className="bg-input border-border mb-2"
                  />
                )}
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {provider.label}
                </Button>
              </form>
            ))}

            <Separator className="bg-border/40" />

            <Link
              href="/"
              className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              로그인 없이 둘러보기
            </Link>
          </CardContent>
        </Card>

        <p className="text-[0.7rem] text-muted-foreground text-center mt-4 leading-relaxed">
          로그인하지 않아도 랜덤 추천을 사용할 수 있습니다.
          <br />
          로그인하면 사용 기록이 디바이스 간에 동기화됩니다.
        </p>
      </div>
    </div>
  );
}
