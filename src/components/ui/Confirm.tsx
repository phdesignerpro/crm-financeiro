"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

interface ConfirmOptions { title: string; message: string; confirmLabel?: string; danger?: boolean }
type Ask = (o: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Ask>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback<Ask>((o) => new Promise((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal
        open={!!state} onClose={() => close(false)} title={state?.title ?? ""} size="sm"
        footer={<>
          <Button onClick={() => close(false)}>Cancelar</Button>
          <Button variant={state?.danger ? "danger" : "primary"} data-autofocus onClick={() => close(true)}>{state?.confirmLabel ?? "Confirmar"}</Button>
        </>}
      >
        <p className="text-sm text-muted">{state?.message}</p>
      </Modal>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
