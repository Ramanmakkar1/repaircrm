"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { DEVICE_BOXES, deviceIntakeProfile, deviceModelOptions } from "@/lib/device-intake";
import { promisedIso, quickPromisedLocal } from "@/lib/intake";
import { Smartphone, Tablet, Laptop, Tv, Gamepad2, Wrench } from "lucide-react";

export function NewDeviceFields({ onIdentityChange }: { onIdentityChange?: (device: { type: string; make: string; model: string }) => void }) {
  const [make, setMake] = useState("");
  const [type, setType] = useState("Phone");
  const [model, setModel] = useState("");
  const profile = deviceIntakeProfile(type);
  const models = deviceModelOptions(type, make);
  const customType = type === "Other" || !DEVICE_BOXES.some(device => device.type === type);
  const deviceIcons = [Smartphone, Tablet, Laptop, Tv, Gamepad2, Gamepad2, Gamepad2, Wrench];
  // Photos make the device boxes recognisable at a glance; Laptop keeps its icon (no photo yet).
  const devicePhotos = ["phone", "tablet", null, "television", "game-console", "game-console", "handheld-console", "repair-tools"];
  return <fieldset onChange={(event) => {
    const form = event.currentTarget.closest("form");
    if (!form || !onIdentityChange) return;
    const data = new FormData(form);
    onIdentityChange({ type: String(data.get("newDeviceType") ?? ""), make: String(data.get("newDeviceMake") ?? ""), model: String(data.get("newDeviceModel") ?? "") });
  }} className="grid gap-3 rounded-md border p-4 sm:grid-cols-2"><legend className="px-1 font-medium">New device</legend>
    {customType ? <label className="space-y-1 sm:col-span-2">Device type<Input name="newDeviceType" required list="intake-device-types" value={type} onChange={event => setType(event.target.value)} placeholder="Any device" maxLength={80} /></label> : <input type="hidden" name="newDeviceType" value={type} />}
    <datalist id="intake-device-types">{["Phone", "Tablet", "Laptop", "Desktop", "Television", "PlayStation", "Xbox", "Nintendo Switch", "Console", "Smartwatch", "Printer", "Camera", "Audio equipment", "Appliance", "Other"].map(v => <option key={v} value={v} />)}</datalist>
    <div role="group" aria-label="Choose device" className="order-first grid grid-cols-4 gap-2 sm:col-span-2">{DEVICE_BOXES.map((device, index) => {
      const Icon = deviceIcons[index];
      const photo = devicePhotos[index];
      const selected = device.type === type;
      return <button key={device.label} type="button" className={"flex min-w-0 flex-col items-center gap-2 rounded-2xl border bg-surface p-2 pb-3 text-base font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (selected ? "border-2 border-foreground" : "border-border")} aria-pressed={selected} onClick={() => {
        setType(device.type); setMake(device.make); setModel(device.model);
        onIdentityChange?.({ type: device.type, make: device.make, model: device.model });
      }}><span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-surface-hover">{photo ? <Image src={`/images/products/${photo}.webp`} alt="" fill sizes="120px" className="object-contain p-2" /> : <Icon className="size-8" aria-hidden />}</span>{device.label}</button>;
    })}</div>
    <details key={type} open={!DEVICE_BOXES.some(device => device.type === type && Boolean(device.model))} className="sm:col-span-2">
    <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">{make && model ? `${make} · ${model} — Change details` : "Brand & model · optional"}</summary>
    <div className="grid gap-3 pt-2 sm:grid-cols-2">
    <label className="space-y-1">Make (optional)<Input name="newDeviceMake" value={make} onChange={e => setMake(e.target.value)} list="intake-makes" maxLength={80} /></label>
    <datalist id="intake-makes">{profile.makes.map(v => <option key={v} value={v} />)}</datalist>
    <label className="space-y-1">{type === "Television" ? "TV model (optional)" : "Model (optional)"}<Input name="newDeviceModel" value={model} onChange={event => setModel(event.target.value)} list="intake-models" maxLength={120} /></label>
    <datalist id="intake-models">{models.map(v => <option key={v} value={v} />)}</datalist>
    <div role="group" aria-label="Suggested brands" className="flex flex-wrap gap-2 sm:col-span-2">{profile.makes.slice(0, 6).map(value => <Button key={value} type="button" variant={make === value ? "soft" : "outline"} className="min-h-12" onClick={() => { setMake(value); setModel(""); onIdentityChange?.({ type, make: value, model: "" }); }}>{value}</Button>)}</div>
    {models.length ? <div role="group" aria-label="Suggested models" className="flex flex-wrap gap-2 sm:col-span-2">{models.slice(0, 6).map(value => <Button key={value} type="button" variant={model === value ? "soft" : "outline"} className="min-h-12" onClick={() => { setModel(value); onIdentityChange?.({ type, make, model: value }); }}>{value}</Button>)}</div> : null}
    <p className="text-xs text-muted-foreground sm:col-span-2">Any device is welcome. Type a device, make or model if it isn&apos;t listed.</p>
    </div></details>
    <details className="sm:col-span-2">
      <summary className="flex min-h-12 cursor-pointer items-center text-sm font-medium">Serial / IMEI and unlock code · optional</summary>
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        <label className="space-y-1">Serial / IMEI (optional)<Input name="newDeviceSerial" maxLength={120} /></label>
        <label className="space-y-1">Unlock code (optional)<Input name="newDevicePassword" type="password" autoComplete="new-password" maxLength={80} /></label>
        <p className="text-xs text-muted-foreground sm:col-span-2">Leave these blank if unknown or the customer prefers not to share. Unlock codes are cleared when the device is collected and no other repair is open for it.</p>
      </div>
    </details>
  </fieldset>;
}

export function PromisedTimeField({ hint, timeZone }: { hint?: string; timeZone?: string }) {
  const [value, setValue] = useState("");
  function quick(days: number) {
    setValue(quickPromisedLocal(days, new Date(), timeZone));
  }
  return <div className="space-y-2"><Label htmlFor="promised-time">Promised pickup</Label>
    <Input id="promised-time" type="datetime-local" value={value} onChange={e => setValue(e.target.value)} />
    <input type="hidden" name="promisedAt" value={promisedIso(value, timeZone)} />
    <div className="flex flex-wrap gap-1">{[["Today", 0], ["Tomorrow", 1], ["+3 days", 3], ["+1 week", 7]].map(([label, days]) => <Button type="button" key={label} size="sm" variant="outline" onClick={() => quick(Number(days))}>{label}</Button>)}</div>
    <p className="text-xs text-muted-foreground">Times use the shop&apos;s clock. {hint}</p>
  </div>;
}
