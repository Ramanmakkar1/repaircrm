"use client";

import * as React from "react";
import { Bluetooth, Cable, Keyboard, Loader2, Network, Usb } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type UsbDeviceLike = { productName?: string; manufacturerName?: string; serialNumber?: string };
type SerialPortLike = { getInfo?: () => { usbVendorId?: number; usbProductId?: number } };
type BluetoothDeviceLike = { id: string; name?: string | null };
type HidDeviceLike = { productName?: string; vendorId?: number; productId?: number };
type HardwareEventTarget = {
  addEventListener?(type: "connect" | "disconnect", listener: () => void): void;
  removeEventListener?(type: "connect" | "disconnect", listener: () => void): void;
};
type HardwareNavigator = Navigator & {
  usb?: HardwareEventTarget & {
    getDevices(): Promise<UsbDeviceLike[]>;
    requestDevice(options: { filters: Array<Record<string, unknown>> }): Promise<UsbDeviceLike>;
  };
  serial?: HardwareEventTarget & {
    getPorts(): Promise<SerialPortLike[]>;
    requestPort(): Promise<SerialPortLike>;
  };
  bluetooth?: {
    getDevices?(): Promise<BluetoothDeviceLike[]>;
    requestDevice(options: { acceptAllDevices: true }): Promise<BluetoothDeviceLike>;
  };
  hid?: {
    getDevices(): Promise<HidDeviceLike[]>;
    requestDevice(options: { filters: Array<Record<string, unknown>> }): Promise<HidDeviceLike[]>;
  };
};

type DeviceState = {
  usb: string[];
  serial: string[];
  bluetooth: string[];
  hid: string[];
};

function usbName(device: UsbDeviceLike): string {
  return [device.manufacturerName, device.productName].filter(Boolean).join(" ") || "Authorized USB device";
}

function serialName(port: SerialPortLike): string {
  const info = port.getInfo?.() ?? {};
  const ids = [info.usbVendorId, info.usbProductId]
    .filter((value): value is number => typeof value === "number")
    .map((value) => value.toString(16).padStart(4, "0"));
  return ids.length ? `Serial device · ${ids.join(":")}` : "Authorized serial device";
}

export function DeviceAccessCard() {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [devices, setDevices] = React.useState<DeviceState>({ usb: [], serial: [], bluetooth: [], hid: [] });
  const [secure, setSecure] = React.useState(false);
  const [support, setSupport] = React.useState({ usb: false, serial: false, bluetooth: false, hid: false });

  const refresh = React.useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const hardware = navigator as HardwareNavigator;
    setSecure(window.isSecureContext);
    setSupport({ usb: Boolean(hardware.usb), serial: Boolean(hardware.serial), bluetooth: Boolean(hardware.bluetooth), hid: Boolean(hardware.hid) });
    const [usb, serial, bluetooth, hid] = await Promise.all([
      hardware.usb?.getDevices().catch(() => []) ?? Promise.resolve([]),
      hardware.serial?.getPorts().catch(() => []) ?? Promise.resolve([]),
      hardware.bluetooth?.getDevices?.().catch(() => []) ?? Promise.resolve([]),
      hardware.hid?.getDevices().catch(() => []) ?? Promise.resolve([]),
    ]);
    setDevices({
      usb: usb.map(usbName),
      serial: serial.map(serialName),
      bluetooth: bluetooth.map((device) => device.name || "Authorized Bluetooth device"),
      hid: hid.map((device) => device.productName || `HID device · ${device.vendorId ?? "?"}:${device.productId ?? "?"}`),
    });
  }, []);

  React.useEffect(() => {
    const initialRefresh = window.setTimeout(() => { void refresh(); }, 0);
    const hardware = navigator as HardwareNavigator;
    const onHardwareChange = () => { void refresh(); };
    hardware.usb?.addEventListener?.("connect", onHardwareChange);
    hardware.usb?.addEventListener?.("disconnect", onHardwareChange);
    hardware.serial?.addEventListener?.("connect", onHardwareChange);
    hardware.serial?.addEventListener?.("disconnect", onHardwareChange);
    return () => {
      window.clearTimeout(initialRefresh);
      hardware.usb?.removeEventListener?.("connect", onHardwareChange);
      hardware.usb?.removeEventListener?.("disconnect", onHardwareChange);
      hardware.serial?.removeEventListener?.("connect", onHardwareChange);
      hardware.serial?.removeEventListener?.("disconnect", onHardwareChange);
    };
  }, [refresh]);

  const request = async (kind: "usb" | "serial" | "bluetooth" | "hid") => {
    const hardware = navigator as HardwareNavigator;
    setBusy(kind);
    try {
      if (kind === "usb") {
        const device = await hardware.usb?.requestDevice({ filters: [] });
        if (!device) throw new Error("USB device access is unavailable in this browser.");
        toast.success(`${usbName(device)} authorized.`);
      } else if (kind === "serial") {
        const port = await hardware.serial?.requestPort();
        if (!port) throw new Error("Serial device access is unavailable in this browser.");
        toast.success(`${serialName(port)} authorized.`);
      } else if (kind === "bluetooth") {
        const device = await hardware.bluetooth?.requestDevice({ acceptAllDevices: true });
        if (!device) throw new Error("Bluetooth device access is unavailable in this browser.");
        setDevices((current) => ({
          ...current,
          bluetooth: Array.from(new Set([...current.bluetooth, device.name || "Authorized Bluetooth device"])),
        }));
        toast.success(`${device.name || "Bluetooth device"} authorized.`);
      } else {
        const selected = await hardware.hid?.requestDevice({ filters: [] });
        if (!selected?.length) throw new Error("HID device access is unavailable in this browser.");
        toast.success(`${selected[0]?.productName || "HID device"} authorized.`);
      }
      await refresh();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        toast.info("No device selected — nothing changed.");
      } else {
        toast.error(error instanceof Error ? error.message : "Device permission could not be granted.");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={Cable}
        title="Connect equipment"
        description="Find compatible hardware attached to this computer. Your browser asks which device to share."
      />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            tone={secure ? "success" : "waiting"}
            label={secure ? "Secure browser connection" : "HTTPS required"}
          />
          <span className="text-xs text-muted-foreground">
            {devices.usb.length + devices.serial.length + devices.bluetooth.length + devices.hid.length} authorized device{devices.usb.length + devices.serial.length + devices.bluetooth.length + devices.hid.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <DevicePermission
            icon={Usb}
            title="USB"
            supported={support.usb}
            busy={busy === "usb"}
            devices={devices.usb}
            onRequest={() => void request("usb")}
          />
          <DevicePermission
            icon={Cable}
            title="Serial"
            supported={support.serial}
            busy={busy === "serial"}
            devices={devices.serial}
            onRequest={() => void request("serial")}
          />
          <DevicePermission
            icon={Bluetooth}
            title="Bluetooth"
            supported={support.bluetooth}
            busy={busy === "bluetooth"}
            devices={devices.bluetooth}
            onRequest={() => void request("bluetooth")}
          />
          <DevicePermission
            icon={Keyboard}
            title="HID / scanner"
            supported={support.hid}
            busy={busy === "hid"}
            devices={devices.hid}
            onRequest={() => void request("hid")}
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-hover px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          <Network className="mt-0.5 size-4 shrink-0" />
          <p>
            These permissions let RepairPilot identify hardware you approve. Keyboard-mode barcode scanners work in the POS scanner box. Printers and scales may need model-specific setup. Card terminals pair through Stripe or Square, keeping card data with the payment provider.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DevicePermission({
  icon: Icon,
  title,
  supported,
  busy,
  devices,
  onRequest,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  supported: boolean;
  busy: boolean;
  devices: string[];
  onRequest: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="min-h-10 text-xs leading-5 text-muted-foreground">
        {devices.length ? devices.join(", ") : supported ? "No authorized device yet." : "Unavailable in this browser."}
      </p>
      <Button type="button" variant="outline" size="sm" disabled={!supported || busy} onClick={onRequest}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        {devices.length ? "Connect another" : "Connect device"}
      </Button>
    </div>
  );
}
