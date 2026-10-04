"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function ShopLogo({url}: {url?: string | null}) {
 const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [preview, setPreview] = useState(url); const router = useRouter();
 async function save(data?: FormData) {
  setPending(true); setMessage("");
  try {const response = await fetch("/api/settings/logo", {method: data ? "POST" : "DELETE", body: data}); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save the logo."); setPreview(data ? `${result.url}?v=${Date.now()}` : null); setMessage(data ? "Logo saved." : "Logo removed."); router.refresh();} catch(e) {setMessage(e instanceof Error ? e.message : "Could not save the logo.");} finally {setPending(false);}
 }
 return <Card><CardHeader title="Shop logo" description="Shown on customer pages, check-in, bills and receipts. Saves separately." /><CardContent className="flex flex-col gap-4">{preview ? <Image src={preview} unoptimized width={96} height={96} alt="Your shop logo" className="size-24 rounded-xl object-contain" /> : <p>Your shop initials are shown until you add a logo.</p>}<form onSubmit={e => {e.preventDefault(); void save(new FormData(e.currentTarget));}} className="flex flex-col gap-3"><Label htmlFor="shop-logo">PNG, JPEG or WebP · up to 2 MB</Label><Input id="shop-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="min-h-12" /><div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending} className="min-h-12">{pending ? "Saving…" : "Upload logo"}</Button>{preview ? <Button type="button" variant="outline" onClick={() => void save()} disabled={pending} className="min-h-12">Remove logo</Button> : null}</div></form>{message ? <p role="status">{message}</p> : null}</CardContent></Card>;
}
