import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10 bg-[#f6fefe]">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 10% 0%, #2AB9D012 0%, transparent 60%), radial-gradient(ellipse 70% 50% at 90% 100%, #2AB9D00d 0%, transparent 60%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <LoginForm />
      </div>
      <p className="relative mt-12 text-[11px] tracking-widest text-muted-foreground/40 uppercase">
        Members · Events · Small Groups · Ministries
      </p>
    </div>
  )
}
