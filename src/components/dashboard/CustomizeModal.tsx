"use client";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox } from "@/components/ui/Form";
import { IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CARD_LABELS, DASHBOARD_CARDS } from "@/database/defaults";
import { useActions, useData } from "@/hooks/useStore";

export function normalizeOrder(order: string[]): string[] {
  const known = order.filter((k) => (DASHBOARD_CARDS as readonly string[]).includes(k));
  return [...known, ...DASHBOARD_CARDS.filter((k) => !known.includes(k))];
}

export function CustomizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useData();
  const { setSettings } = useActions();
  const order = normalizeOrder(settings.cardOrder);
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setSettings({ cardOrder: next });
  };
  const toggle = (k: string, show: boolean) =>
    setSettings({ hiddenCards: show ? settings.hiddenCards.filter((x) => x !== k) : [...settings.hiddenCards, k] });
  return (
    <Modal open={open} onClose={onClose} title="Personalizar dashboard" description="Escolha quais cards aparecem e em que ordem." size="sm">
      <ul className="divide-y divide-line">
        {order.map((k, i) => (
          <li key={k} className="flex items-center justify-between gap-2 py-2">
            <Checkbox checked={!settings.hiddenCards.includes(k)} onChange={(v) => toggle(k, v)} label={CARD_LABELS[k]} />
            <span className="flex">
              <IconButton label="Mover para cima" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></IconButton>
              <IconButton label="Mover para baixo" disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></IconButton>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
