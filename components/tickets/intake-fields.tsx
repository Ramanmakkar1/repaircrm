"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DEVICE_MAKES, DEVICE_MODELS } from "@/lib/intake";

export function NewCustomerFields() {
  return <fieldset className="grid gap-3 rounded-md border p-4 sm:grid-cols-2"><legend className="px-1 font-medium">New customer</legend>
    <label className="space-y-1 sm:col-span-2">Name<Input name="newCustomerName" required maxLength={160} autoComplete="name" /></label>
    <label className="space-y-1">Email<Input name="newCustomerEmail" type="email" maxLength={200} autoComplete="email" /></label>
    <label className="space-y-1">Phone<Input name="newCustomerPhone" type="tel" maxLength={40} autoComplete="tel" /></label>
    <p className="text-xs text-muted-foreground sm:col-span-2">Existing email or phone matches are checked before creating a customer. This does not subscribe them to marketing.</p>
  </fieldset>;
}

export function NewDeviceFields() {
  const [make, setMake] = useState("");
  return <fieldset className="grid gap-3 rounded-md border p-4 sm:grid-cols-2"><legend className="px-1 font-medium">New device</legend>
    <label className="space-y-1">Device type<Input name="newDeviceType" required list="intake-device-types" defaultValue="Phone" maxLength={80} /></label>
    <datalist id="intake-device-types">{["Phone", "Tablet", "Laptop", "Desktop", "Console", "Smartwatch", "Other"].map(v => <option key={v} value={v} />)}</datalist>
    <label className="space-y-1">Make<Input name="newDeviceMake" value={make} onChange={e => setMake(e.target.value)} list="intake-makes" maxLength={80} /></label>
    <datalist id="intake-makes">{DEVICE_MAKES.map(v => <option key={v} value={v} />)}</datalist>
    <label className="space-y-1">Model<Input name="newDeviceModel" list="intake-models" maxLength={120} /></label>
    <datalist id="intake-models">{(DEVICE_MODELS[make] ?? []).map(v => <option key={v} value={v} />)}</datalist>
    <label className="space-y-1">Serial / IMEI<Input name="newDeviceSerial" maxLength={120} /></label>
    <label className="space-y-1">Unlock code<Input name="newDevicePassword" type="password" autoComplete="new-password" maxLength={80} /></label>
    <p className="self-center text-xs text-muted-foreground">Cleared when the device is collected and no other repair is open for it. You can type a make or model not listed.</p>
  </fieldset>;
}

export function PromisedTimeField({ hint }: { hint?: string }) {
  const [value, setValue] = useState("");
  function quick(days: number) {
    const d = new Date(); d.setDate(d.getDate() + days); d.setHours(17, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setValue(local);
  }
  const parsed = value ? new Date(value) : null;
  return <div className="space-y-2"><Label htmlFor="promised-time">Promised pickup</Label>
    <Input id="promised-time" type="datetime-local" value={value} onChange={e => setValue(e.target.value)} />
    <input type="hidden" name="promisedAt" value={parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ""} />
    <div className="flex flex-wrap gap-1">{[["Today", 0], ["Tomorrow", 1], ["+3 days", 3], ["+1 week", 7]].map(([label, days]) => <Button type="button" key={label} size="sm" variant="outline" onClick={() => quick(Number(days))}>{label}</Button>)}</div>
    <p className="text-xs text-muted-foreground">Times use this device&apos;s timezone. {hint}</p>
  </div>;
}
