"use client";

import { inputClass, labelClass } from "@/components/ui";

type Props = {
  taxpayers: { id: string; label: string }[];
  selectedId: string;
  months?: { value: string; label: string }[];
  selectedMonth?: string;
  action: string;
};

/** Selector de contribuyente y período. Es un formulario GET: funciona también sin JavaScript. */
export function TaxpayerPicker({ taxpayers, selectedId, months, selectedMonth, action }: Props) {
  return (
    <form
      action={action}
      method="get"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      <div className="sm:w-64">
        <label htmlFor="c" className={labelClass}>
          Contribuyente
        </label>
        <select id="c" name="c" defaultValue={selectedId} className={inputClass}>
          {taxpayers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      {months && (
        <div className="sm:w-48">
          <label htmlFor="mes" className={labelClass}>
            Período
          </label>
          <select id="mes" name="mes" defaultValue={selectedMonth} className={inputClass}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <noscript>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white">
          Ver
        </button>
      </noscript>
    </form>
  );
}
