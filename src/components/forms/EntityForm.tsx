"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, MoneyInput, SelectInput, TagsInput, TextArea, TextInput } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";

export type Values = Record<string, unknown>;

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "money" | "number" | "date" | "select" | "checkbox" | "color" | "textarea" | "tags";
  required?: boolean;
  /** Para money: aceita zero. */
  allowZero?: boolean;
  options?: { value: string; label: string }[] | ((v: Values) => { value: string; label: string }[]);
  /** select: valor vazio vira null. */
  nullable?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  span?: 1 | 2;
  show?: (v: Values) => boolean;
}

function validate(fields: FieldDef[], v: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.show && !f.show(v)) continue;
    const val = v[f.name];
    const empty = val == null || val === "" || (Array.isArray(val) && false);
    if (f.required && empty) { errors[f.name] = "Campo obrigatório"; continue; }
    if (f.type === "money" && val != null) {
      if (typeof val !== "number" || Number.isNaN(val)) errors[f.name] = "Valor inválido";
      else if (val < 0) errors[f.name] = "Não pode ser negativo";
      else if (f.required && !f.allowZero && val === 0) errors[f.name] = "Informe um valor maior que zero";
    }
    if (f.type === "number" && !empty) {
      const n = Number(val);
      if (Number.isNaN(n)) errors[f.name] = "Número inválido";
      else if (f.min != null && n < f.min) errors[f.name] = `Mínimo: ${f.min}`;
      else if (f.max != null && n > f.max) errors[f.name] = `Máximo: ${f.max}`;
    }
    if (f.type === "date" && !empty && !/^\d{4}-\d{2}-\d{2}$/.test(String(val))) errors[f.name] = "Data inválida";
  }
  return errors;
}

export function EntityForm({
  fields, initial, onSubmit, onCancel, submitLabel = "Salvar", extra,
}: {
  fields: FieldDef[]; initial: Values; onSubmit: (v: Values) => void; onCancel: () => void; submitLabel?: string; extra?: ReactNode;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (name: string, v: unknown) => setValues((cur) => ({ ...cur, [name]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(fields, values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const out: Values = { ...values };
    for (const f of fields) {
      if (f.show && !f.show(values)) continue;
      if (f.type === "number" && out[f.name] !== "" && out[f.name] != null) out[f.name] = Number(out[f.name]);
      if (f.type === "select" && f.nullable && out[f.name] === "") out[f.name] = null;
      if (f.type === "text" && typeof out[f.name] === "string") out[f.name] = (out[f.name] as string).trim();
    }
    onSubmit(out);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          if (f.show && !f.show(values)) return null;
          const val = values[f.name];
          const err = errors[f.name];
          const span = f.span === 2 || f.type === "textarea" || f.type === "tags" ? "sm:col-span-2" : "";
          const id = `f-${f.name}`;
          let control: ReactNode;
          switch (f.type) {
            case "money":
              control = <MoneyInput id={id} value={(val as number | null) ?? null} onChange={(c) => set(f.name, c)} />;
              break;
            case "select": {
              const opts = typeof f.options === "function" ? f.options(values) : f.options ?? [];
              control = (
                <SelectInput id={id} value={(val as string) ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                  {(f.nullable || !f.required) && <option value="">{f.placeholder ?? "—"}</option>}
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectInput>
              );
              break;
            }
            case "checkbox":
              control = <Checkbox checked={!!val} onChange={(c) => set(f.name, c)} label={f.label} />;
              break;
            case "color":
              control = <input id={id} type="color" value={(val as string) || "#6366f1"} onChange={(e) => set(f.name, e.target.value)} className="h-9 w-16 cursor-pointer rounded-lg border border-line bg-surface p-1" />;
              break;
            case "textarea":
              control = <TextArea id={id} value={(val as string) ?? ""} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} />;
              break;
            case "tags":
              control = <TagsInput value={(val as string[]) ?? []} onChange={(t) => set(f.name, t)} />;
              break;
            default:
              control = (
                <TextInput
                  id={id} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={(val as string | number | null | undefined) ?? ""}
                  min={f.min} max={f.max} step={f.step} placeholder={f.placeholder} inputMode={f.type === "number" ? "decimal" : undefined}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              );
          }
          return (
            <Field key={f.name} label={f.type === "checkbox" ? undefined : f.label} error={err} hint={f.hint} className={span}>
              {control}
            </Field>
          );
        })}
      </div>
      {extra}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

export function FormModal({
  open, onClose, title, description, fields, initial, onSubmit, submitLabel,
}: {
  open: boolean; onClose: () => void; title: string; description?: string; fields: FieldDef[]; initial: Values;
  onSubmit: (v: Values) => void; submitLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      {/* key força reinício do estado do formulário a cada abertura */}
      {open && <EntityForm key={JSON.stringify(initial)} fields={fields} initial={initial} onSubmit={onSubmit} onCancel={onClose} submitLabel={submitLabel} />}
    </Modal>
  );
}
