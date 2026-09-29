"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Form";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
});

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse({ email, password });
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({}); setBusy(true); setMsg(null);
    const sb = getSupabase();
    const { error, data } = mode === "in" ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) return setMsg("Conta criada. Confirme o e-mail para entrar.");
    router.replace("/");
    router.refresh();
    location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-bold text-white">$</span>
          <div><h1 className="text-lg font-semibold leading-tight">Meu Caixa</h1><p className="text-xs text-muted">Gestão financeira pessoal e profissional</p></div>
        </div>
        {!isSupabaseConfigured ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted">Supabase não configurado: o sistema roda em <b className="text-fg">modo demonstração</b>, com dados fictícios salvos apenas neste navegador.</p>
            <Button variant="primary" className="w-full" onClick={() => router.replace("/")}>Entrar na demonstração</Button>
            <p className="text-xs text-muted">Para ativar login e banco de dados reais, preencha as variáveis do arquivo <code>.env.example</code>.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label="E-mail" error={errors.email}><TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Senha" error={errors.password}><TextInput type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {msg && <p role="alert" className="text-sm text-expense">{msg}</p>}
            <Button variant="primary" type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Entrar" : "Criar conta"}</Button>
            <button type="button" className="w-full text-center text-xs text-brand hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
              {mode === "in" ? "Ainda não tenho conta" : "Já tenho conta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
