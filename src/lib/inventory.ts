import type { FinanceRecord } from "@/lib/api";

export type TrackedProduct = { id: string; name: string; quantity: number; unit_cost_minor: number; unit_price_minor: number };

export function getInventoryProducts(records: FinanceRecord[]): TrackedProduct[] {
  const entries = records.filter((record) => record.kind === "inventory_item").slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const latest = new Map<string, FinanceRecord>();
  for (const item of entries) latest.set(item.name.trim().toLocaleLowerCase(), item);
  return [...latest.values()].map((item) => {
    const key = item.name.trim().toLocaleLowerCase();
    const movements = records.filter((record) => record.name.trim().toLocaleLowerCase() === key && record.occurred_at > item.occurred_at && ["inventory_adjustment", "inventory_sale", "inventory_return", "customer_purchase"].includes(record.kind) && (record.kind !== "customer_purchase" || record.related_record_id === item.id));
    let quantity = item.quantity ?? 0;
    let inventoryCost = quantity * (item.unit_cost_minor ?? 0);
    for (const movement of movements) {
      if (movement.kind === "inventory_adjustment") { const delta = movement.quantity_delta ?? 0; quantity += delta; inventoryCost += delta * (movement.unit_cost_minor ?? item.unit_cost_minor ?? 0); }
      if (movement.kind === "inventory_sale" || movement.kind === "customer_purchase") { const units = movement.quantity ?? 0; quantity -= units; inventoryCost -= units * (movement.unit_cost_minor ?? item.unit_cost_minor ?? 0); }
      if (movement.kind === "inventory_return") { const units = movement.quantity ?? 0; quantity += units; inventoryCost += units * (movement.unit_cost_minor ?? item.unit_cost_minor ?? 0); }
    }
    return { id: item.id, name: item.name, quantity: Math.max(0, quantity), unit_cost_minor: quantity > 0 ? Math.max(0, Math.round(inventoryCost / quantity)) : item.unit_cost_minor ?? 0, unit_price_minor: item.unit_price_minor ?? 0 };
  });
}
