"use client";
import { useEffect, useState } from "react";
import { pushDeviceStatusAction, pushPublicKeyAction, subscribePushAction, unsubscribePushAction, testPushAction } from "@/app/(app)/settings/push-actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
function keyBytes(value: string): Uint8Array<ArrayBuffer> {
 const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/")); const bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes;
}
export function PushSettings() {
 const [ready, setReady] = useState(false); const [on, setOn] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
 useEffect(() => {let active = true; if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return; navigator.serviceWorker.getRegistration().then(r => {if (active) setReady(true); return r?.pushManager.getSubscription();}).then(async s => {const enabled = s ? await pushDeviceStatusAction() : false; if (active) setOn(enabled);}).catch(() => {}); return () => {active = false;};}, []);
 async function toggle() {
  setPending(true); setMessage("");
  try {
   if (on) {await unsubscribePushAction(); const r = await navigator.serviceWorker.getRegistration(); await (await r?.pushManager.getSubscription())?.unsubscribe(); setOn(false); setMessage("Notifications off on this device.");}
   else {
    const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error("Allow notifications in your browser settings, then try again.");
    const publicKey = await pushPublicKeyAction(); const registration = await navigator.serviceWorker.register("/sw.js", {scope: "/"}); await navigator.serviceWorker.ready;
    const expectedKey = keyBytes(publicKey); let existing = await registration.pushManager.getSubscription();
    if (existing) {const currentKey = new Uint8Array(existing.options.applicationServerKey ?? new ArrayBuffer(0)); if (currentKey.length !== expectedKey.length || currentKey.some((byte, i) => byte !== expectedKey[i])) {await existing.unsubscribe(); existing = null;}}
    const subscription = existing ?? await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: expectedKey});
    const result = await subscribePushAction(subscription.toJSON()); if (!result.ok) {if (!existing) await subscription.unsubscribe(); throw new Error(result.error);} setOn(true); setMessage("Notifications on. New items needing attention arrive even when the app is closed.");
   }
  } catch(e) {setMessage(e instanceof Error ? e.message : "Could not change notifications.");} finally {setPending(false);}
 }
 async function test() {setPending(true); try {const result = await testPushAction(); setMessage(result.ok ? "Test sent. Check your phone’s notifications." : result.error ?? "Could not send the test.");} catch {setMessage("Could not send the test.");} finally {setPending(false);}}
 return <Card><CardHeader title="Phone notifications" description="Get an alert when more work needs you. Turn on separately on each personal device. Signing out or switching staff stops delivery to the previous person." /><CardContent className="flex flex-col gap-4"><p>{ready ? on ? "On on this device" : "Off on this device" : "Use a browser that supports push notifications. On iPhone, add this app to your Home Screen first."}</p><div className="flex flex-wrap gap-3"><Button disabled={!ready || pending} onClick={() => void toggle()} className="min-h-12">{pending ? "Working…" : on ? "Turn off notifications" : "Turn on notifications"}</Button>{on ? <Button variant="outline" onClick={() => void test()} disabled={pending} className="min-h-12">Send a test</Button> : null}</div>{message ? <p role="status">{message}</p> : null}</CardContent></Card>;
}
