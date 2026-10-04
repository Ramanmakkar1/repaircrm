import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG } from "@/lib/catalog/entries";
import { bestCatalogMatch, bestDeviceEntry, catalogEntryByKey, catalogSearch, CATALOG_GROUPS, matchCatalog, normalize } from "@/lib/catalog/match";

const pick = (name: string, category?: string | null) => bestCatalogMatch({ name, category })?.key ?? null;

// ---------------------------------------------------------------------------------------------
// What shops really call each picture: slang, typos, brand and model noise, plurals, reordering.
// Every picture needs at least two names here (checked below), so adding a picture without
// teaching the matcher its words fails the suite.
// ---------------------------------------------------------------------------------------------
const NAMES: Record<string, string[]> = {
  // Devices
  phone: ["iPhone 14 Pro Max 256GB", "Samsung Galaxy S23 Ultra", "Google Pixel 7", "Android smartphone 6.1 inch", "Second hand mobile"],
  tablet: ["iPad Air 5th Gen", "Samsung Galaxy Tab A8", "Lenovo Tab M10", "Android tablet 10 inch"],
  laptop: ["Dell Inspiron 15 laptop", "MacBook Pro 14", "Lenovo ThinkPad T480", "HP Notebook 250 G8", "Gaming laptop RTX"],
  "desktop-computer": ["Gaming PC Ryzen 5 RTX 3060", "Dell OptiPlex desktop computer", "Apple iMac 24 inch", "Branded PC Core i5 8GB RAM 256GB SSD", "CPU cabinet"],
  television: ["Samsung 43 inch Smart TV", "LG OLED TV 55", "Sony Bravia 4K television", "Mi LED TV 32"],
  "game-console": ["PlayStation 5 Digital Edition", "Xbox Series X", "PS4 Slim 1TB", "Sony PS5 console"],
  "handheld-console": ["Nintendo Switch OLED", "Steam Deck 512GB", "Asus ROG Ally", "Switch Lite"],
  drone: ["DJI Mavic 3 Pro", "FPV drone 5 inch", "DJI Mini 3 quadcopter"],
  smartwatch: ["Apple Watch Series 9 45mm", "Samsung Galaxy Watch 6", "Garmin Forerunner 255", "Fitbit Versa 4", "Smart watch"],
  headphones: ["Sony WH-1000XM5 headphones", "Wireless over ear headphone", "Beats Studio headphones", "Bluetooth headset"],
  earbuds: ["Apple AirPods Pro 2", "Samsung Galaxy Buds2", "TWS earbuds Bluetooth 5.3", "Boat Airdopes 141"],
  camera: ["Canon EOS 1500D DSLR", "GoPro Hero 11 Black", "Nikon D3500", "Sony Alpha mirrorless camera"],

  // Screen & body protection
  "screen-protector": ["Tempered glass for Samsung A54", "Screen Guard iPhone 13", "9H glass protector", "Glassguard", "TEMPERED GLASS 9D", "Temper glass Vivo Y21", "Glass guards", "Glass gard Redmi 9", "Tampered glass A12"],
  "privacy-screen-protector": ["Privacy tempered glass iPhone 14", "Anti spy screen protector", "Privacy screen guard Samsung S23"],
  "camera-lens-protector": ["Camera lens protector iPhone 15 Pro", "Lens guard Redmi Note 12", "iPhone 14 camera ring protector"],
  "hydrogel-film": ["Hydrogel film for cutting machine", "Hydrogel screen protector matte", "TPU screen film Samsung"],
  "back-skin-film": ["Back skin film carbon fiber", "Mobile skin sticker iPhone 13", "Back sticker 3M skin"],
  "silicone-case": ["Silicone case iPhone 13", "Samsung A14 silicone back cover", "Liquid silicone cover Redmi"],
  "wallet-case": ["Wallet flip case Samsung S22", "Flip cover Redmi Note 11", "Leather book cover iPhone 12", "Diary cover Vivo Y20"],
  "rugged-case": ["Rugged armor case iPhone 14", "Shockproof armor cover Samsung A52", "Heavy duty case Pixel 7", "Defender case"],
  "magnetic-case": ["MagSafe case iPhone 15", "Magnetic clear case iPhone 14 Pro", "Mag safe cover"],
  "tablet-case": ["iPad 10th gen folio case", "Galaxy Tab A8 flip cover", "Tablet cover with stand", "Kindle case"],
  "laptop-sleeve": ["Laptop sleeve 15.6 inch", "MacBook Air 13 case", "Neoprene laptop pouch"],
  "phone-grip": ["Pop socket phone grip", "Finger ring holder", "Popsocket"],
  "phone-lanyard": ["Phone lanyard strap", "Neck strap for mobile", "Crossbody phone strap"],
  "clear-case": ["Clear case for iPhone 14", "Transparent back cover Redmi 10", "TPU cover Oppo A57", "Bumper case", "Mobile back cover Vivo V23", "Pouch"],

  // Chargers, cables & power
  charger: ["Mobile charjar", "Original travel charger Nokia", "Charger head only", "Plug adapter", "Chargers"],
  "usb-c-cable": ["USB-C cable 1m", "Type C data cable", "Charging cable fast", "USB cable", "Samsung original type-c cable"],
  "wall-charger": ["20W USB-C wall charger", "Apple 20W Power Adapter USB-C", "PD charger 65W GaN", "Samsung 25W Type C charger", "USB C 20W"],
  "car-charger": ["Car charger dual USB", "12V car adapter", "Vehicle charger 30W"],
  "wireless-charger": ["Wireless charger 15W", "Qi charging pad", "MagSafe charger"],
  "power-bank": ["Power bank 10000mAh", "Powerbank 20000 mAh Mi", "Portable charger fast charging"],
  "lightning-cable": ["Lightning cable 1m", "iPhone charging cable", "USB-C to Lightning cable", "MFi certified cable 8 pin"],
  "micro-usb-cable": ["Micro USB cable", "V8 cable 1.5m", "Micro-USB data cable"],
  "braided-cable": ["Braided charging cable", "Nylon USB-C cable", "C to C cable 60W"],
  "aux-cable": ["Aux cable 3.5mm", "AUX cord for car", "Audio cable male to male"],
  "hdmi-cable": ["HDMI cable 1.5m", "HDMI 4K cable 3 meter", "HDMI to HDMI"],
  "ethernet-cable": ["Ethernet cable Cat6 5m", "LAN cable 10 meter", "RJ45 patch cord"],
  "usb-hub": ["USB-C hub 7 in 1", "4 port USB hub", "Multiport adapter type C", "Docking station"],
  "charging-station": ["Charging station 6 port", "Multi device charging station", "5 port USB charger station"],
  "laptop-charger": ["Laptop charger 65W Dell", "HP laptop adapter", "MacBook charger 61W USB-C"],
  "universal-adapter": ["Universal laptop adapter 90W", "Universal charger multi tip", "Adjustable laptop adapter"],
  "surge-protector": ["Surge protector 6 socket", "Extension board 4 socket", "Spike guard with switch"],
  "ac-power-cable": ["Power cord 3 pin", "AC power cable for desktop", "Figure 8 power cable", "SMPS cable"],
  "controller-dock": ["PS5 controller charging dock", "Xbox controller charger dual", "DualSense charging station"],
  "otg-adapter": ["OTG adapter type C", "USB OTG cable", "OTG connector"],
  "aux-adapter": ["USB-C to 3.5mm headphone jack adapter", "Lightning to 3.5mm adapter", "Audio dongle"],
  "smart-plug": ["WiFi smart plug 16A", "Smart socket Alexa", "Tuya smart plug"],

  // Audio
  "wired-earphones": ["Wired earphones with mic", "Handsfree Samsung", "Type C earphone", "Handfree"],
  "bluetooth-speaker": ["Bluetooth speaker JBL Go 3", "Portable wireless speaker", "Party speaker with mic"],
  "gaming-headset": ["Gaming headset RGB", "PS5 headset with mic", "Wired gaming headphone"],
  microphone: ["USB condenser microphone", "Collar mic wireless", "Podcast microphone"],
  soundbar: ["Soundbar 2.1 with subwoofer", "Home theatre 5.1", "Samsung sound bar"],
  "earbuds-case": ["AirPods Pro case cover", "Silicone case for AirPods", "Galaxy Buds case"],

  // Phone & tablet parts
  "display-assembly": ["iPhone 11 LCD combo", "Redmi Note 10 folder", "Samsung A52 OLED display", "Display folder Vivo Y12", "iPhone 14 screen"],
  "phone-battery": ["Samsung A12 battery", "iPhone 11 battery", "Redmi Note 9 Pro mobile battery", "Batteries", "Redmi 9 battri"],
  "charging-port": ["iPhone 12 charging port", "Type C port flex Samsung", "Charge board Redmi Note 8"],
  "back-glass": ["iPhone 13 back glass", "Rear glass Samsung S21", "Battery door Redmi", "Back panel Oppo F19"],
  "camera-module": ["iPhone 11 rear camera", "Samsung A50 back camera module", "Redmi Note 10 Pro rear camera", "Galaxy camera module"],
  "earpiece-speaker": ["iPhone 11 earpiece speaker", "Ear speaker Samsung", "Receiver Vivo"],
  "circuit-board": ["iPhone 12 logic board", "Vivo Y21 motherboard", "Mobile logic board"],
  "touch-digitizer": ["iPhone 8 touch digitizer", "Samsung J7 touch glass", "OGS glass Redmi", "Digitizer"],
  loudspeaker: ["iPhone 11 loudspeaker", "Buzzer ringer Samsung", "Loud speaker module"],
  "mic-flex": ["iPhone 11 mic flex", "Samsung A50 microphone flex", "Bottom mic flex cable"],
  "vibration-motor": ["iPhone 11 vibration motor", "Vibrator motor Samsung", "Taptic engine"],
  "power-volume-flex": ["Power volume flex Redmi", "Volume button flex iPhone 11", "Power button flex Samsung A50"],
  "home-button": ["iPhone 8 home button", "Fingerprint sensor flex Samsung", "Touch ID button"],
  "sim-tray": ["iPhone 12 SIM tray", "SIM card holder Samsung A51", "Dual sim tray"],
  "sim-ejector": ["SIM ejector pin", "Sim eject tool", "Ejector pin"],
  "back-housing": ["iPhone 11 back housing", "Samsung S20 mid frame", "Full body housing Redmi"],
  "front-camera": ["iPhone 11 front camera", "Selfie camera Samsung A32", "Front camera module Vivo"],
  "battery-adhesive": ["Battery adhesive strips iPhone", "Double sided tape 3M", "Battery pull tab adhesive"],
  "repair-glue": ["B7000 glue 50ml", "Repair adhesive glue", "T7000 black glue", "UV glue for LCD"],
  "screw-set": ["Phone screw set", "Pentalobe screws iPhone", "Laptop screw assortment"],
  "tablet-screen": ["iPad Air 2 screen", "Samsung Tab A7 display", "Tablet LCD touch screen"],
  "tablet-battery": ["iPad Pro 11 battery", "Galaxy Tab A8 battery", "Tablet battery 6000mAh"],
  "phone-cooler": ["Phone cooling fan clip", "PUBG mobile cooler", "Magnetic phone cooler"],
  "clip-on-lens": ["Clip on phone lens kit", "Macro lens for mobile", "Fisheye lens"],

  // Storage & memory
  "microsd-card": ["SanDisk 64GB microSD card", "Memory card 128GB class 10", "Micro SD 32GB"],
  "sd-card": ["SD card 32GB for camera", "SDHC card 64GB", "Kingston SDXC 128GB"],
  "usb-flash-drive": ["Pen drive 64GB", "SanDisk Cruzer USB flash drive 32GB", "Pendrive 16GB"],
  "external-hard-drive": ["WD 1TB external hard disk", "Seagate portable hard drive 2TB", "Portable SSD external 500GB"],
  "card-reader": ["USB card reader", "Multi card reader OTG", "SD card reader type C"],
  "sim-card": ["Jio SIM", "Airtel SIM card", "Nano SIM"],

  // Laptop & computer parts
  "laptop-lcd": ["Laptop screen 15.6 LED", "Dell laptop display panel", "MacBook Air screen replacement", "HP 14 inch laptop LCD"],
  "laptop-keyboard": ["Laptop keyboard Dell Inspiron", "HP notebook keyboard", "Lenovo ThinkPad keyboard replacement"],
  "laptop-battery": ["Laptop battery Dell 6 cell", "HP notebook battery", "MacBook Pro battery"],
  "ssd-drive": ["SSD 256GB SATA", "Kingston 480GB SSD", "Solid state drive 1TB"],
  "m2-ssd": ["M.2 NVMe SSD 512GB", "NVMe 1TB", "M2 SSD"],
  "hard-drive": ["Laptop hard disk 500GB", "Seagate 1TB HDD", "Internal hard drive 2.5"],
  "ram-module": ["DDR4 8GB laptop RAM", "16GB DDR4 SODIMM", "Desktop RAM DDR3 4GB"],
  "laptop-fan": ["Laptop cooling fan Dell", "Laptop fan HP Pavilion", "Notebook CPU fan"],
  "thermal-paste": ["Thermal paste 4g", "CPU thermal grease", "Thermal compound syringe"],
  "dc-jack": ["Laptop DC jack", "DC power jack Dell", "Charging jack laptop"],
  webcam: ["HD Webcam 1080p", "USB web camera", "Webcam with mic"],
  mouse: ["Wireless mouse Logitech", "USB optical mouse", "Mouse for laptop"],
  keyboard: ["Wireless keyboard and mouse combo", "USB keyboard", "Mechanical keyboard RGB"],
  monitor: ["24 inch LED monitor", "Dell 27 inch IPS monitor", "Gaming monitor 144Hz"],
  motherboard: ["H61 motherboard", "ATX motherboard Gigabyte", "Desktop mobo"],
  "graphics-card": ["NVIDIA GTX 1650 graphics card", "Graphic card 4GB", "RTX 3060 graphics card"],
  "pc-power-supply": ["450W SMPS", "PC power supply 650W", "Gaming PSU 750W"],
  "cpu-processor": ["Intel i5 processor", "AMD Ryzen 5 CPU", "CPU Intel 10th gen"],
  "wifi-router": ["TP-Link WiFi router", "4G wifi router", "Jio router"],
  printer: ["HP DeskJet printer", "Canon inkjet printer", "Epson L3250 ink tank printer"],
  "ink-cartridges": ["HP 802 ink cartridge", "Epson ink bottle", "Toner cartridge"],
  "laptop-stand": ["Aluminium laptop stand", "Foldable laptop riser", "Laptop table stand"],
  "cooling-pad": ["Laptop cooling pad", "Gaming laptop cooler", "Cooling pad 2 fan"],
  "laptop-bag": ["Laptop backpack 15.6", "Laptop bag Dell", "Office laptop sling bag"],
  "mouse-pad": ["Gaming mouse pad XL", "Mouse mat", "Desk mat large"],
  "bluetooth-dongle": ["USB Bluetooth dongle 5.0", "Bluetooth adapter for PC", "BT dongle"],
  "wifi-dongle": ["WiFi dongle USB", "Wireless USB adapter 150Mbps", "USB wifi adapter"],

  // Game consoles & gaming
  "game-controller": ["PS5 DualSense controller", "Xbox One wireless controller", "Game controller wired", "Gamepad"],
  "analog-stick": ["PS4 analog stick", "Controller thumbstick replacement", "Xbox analog module", "Joystick module"],
  "joycon-pair": ["Joy-Con pair neon", "Nintendo Switch Joy Con controllers", "Joycon L R"],
  "thumbstick-caps": ["Thumbstick caps set", "PS5 thumb grips", "Analog stick cover silicone"],
  "disc-drive": ["PS5 disc drive", "Blu-ray drive Xbox One", "Console disc drive module"],
  "gaming-mouse": ["Gaming mouse RGB", "Redragon gaming mouse", "7200 DPI gaming mice"],
  "vr-headset": ["VR headset", "Oculus Quest 2", "VR box for mobile"],
  "capture-card": ["HDMI capture card 4K", "Elgato game capture", "USB video capture"],
  "game-disc": ["PS4 game disc", "Xbox One game", "FIFA 23 game CD"],
  "mobile-controller": ["Mobile gamepad", "PUBG controller for phone", "Phone game controller clip on"],
  "console-cooling-fan": ["PS5 cooling fan", "Xbox One fan", "PS4 Pro fan replacement"],
  "hdmi-port": ["PS5 HDMI port", "HDMI socket replacement", "HDMI port"],

  // TV & video
  "tv-tcon-board": ["TV T-con board", "Tcon board 55 inch", "LED TV tcon"],
  "tv-panel": ["TV panel 43 inch", "LED TV screen replacement", "Open cell panel"],
  "tv-wall-mount": ["TV wall mount 32 to 55", "Wall mount bracket TV", "Swivel TV bracket"],
  "tv-stand-legs": ["TV stand legs", "Samsung TV legs", "LED TV foot stand"],
  "streaming-stick": ["Fire TV stick", "Chromecast", "Android TV stick Mi"],
  projector: ["Mini projector", "Portable LED projector", "Full HD projector"],
  "led-strip": ["RGB LED strip 5m", "LED strip light with remote", "USB LED strip"],
  "tv-remote": ["TV remote", "Samsung Smart TV remote", "Universal remote control", "LG magic remote"],
  "tv-main-board": ["TV main board LG", "LED TV motherboard", "Mainboard TV Samsung"],
  "tv-power-board": ["TV power supply board", "LED TV SMPS", "Sony TV power board"],
  "tv-backlight-strips": ["TV backlight strips 43 inch", "LED TV backlight", "Backlight bar 55"],

  // Drones
  "drone-case": ["Drone carrying case", "DJI Mavic bag", "Drone backpack"],
  "drone-battery": ["DJI Mavic battery", "Drone LiPo battery 3S", "Quadcopter battery"],
  "drone-camera-gimbal": ["DJI gimbal camera", "Drone gimbal ribbon", "Mavic camera gimbal assembly"],
  "drone-controller": ["DJI drone remote controller", "Drone controller", "FPV transmitter"],
  "drone-motor": ["Drone motor 2207", "Brushless motor for quadcopter", "DJI Mavic motor"],
  "drone-propellers": ["Drone propellers set", "DJI Mini props", "Propeller guard"],

  // Watches & wearables
  "watch-band": ["Apple Watch band 45mm", "Silicone watch strap 22mm", "Smartwatch strap leather"],
  "watch-charger": ["Apple Watch magnetic charger", "Smartwatch charging cable", "Galaxy Watch charger"],
  "fitness-band": ["Mi Band 7", "Fitness tracker band", "Fitbit Charge 5"],

  // Tools & supplies
  "repair-tools": ["Precision screwdriver set", "Mobile repair tool kit", "Repair tools", "Tools"],
  "pry-tools": ["Plastic pry tools", "Spudger set", "Phone opening tool kit"],
  "suction-cup": ["Suction cup LCD opener", "Screen suction cup tool", "Double suction cup"],
  tweezers: ["ESD tweezers", "Curved tip tweezers set", "Precision tweezer"],
  "heat-gun": ["Hot air gun 858D", "Heat gun 2000W", "Rework station hot air"],
  "soldering-iron": ["Soldering iron 60W", "Solder wire roll", "Soldering station 936", "Solder flux"],
  multimeter: ["Digital multimeter DT830", "Multimeter", "Clamp meter"],
  microscope: ["Binocular repair microscope", "Digital USB microscope", "LED magnifier lamp"],
  "repair-mat": ["Magnetic repair mat", "Anti static mat", "Silicone soldering mat"],
  "screen-separator": ["LCD separator machine", "Screen separator 946", "Glass separator"],
  "ultrasonic-cleaner": ["Ultrasonic cleaner 6L", "Ultrasonic cleaning machine", "Ultrasonic bath"],
  "cleaning-spray": ["Screen cleaner spray", "Isopropyl alcohol 500ml", "Contact cleaner", "Electronics cleaning spray"],
  "microfiber-cloth": ["Microfibre cloth", "Cleaning cloth for screen", "Microfiber towel"],
  "compressed-air": ["Compressed air can", "Air duster", "Dust blower spray"],
  "wrist-strap": ["Anti static wrist strap", "ESD wrist band", "Grounding strap"],
  "cleaning-kit": ["Screen cleaning kit", "Laptop cleaning kit", "Cleaning brush set"],

  // Accessories & extras
  "phone-stand": ["Desk phone stand", "Mobile holder", "Foldable phone stand", "Tablet stand"],
  "car-mount": ["Car phone holder", "Dashboard phone mount", "Bike mobile holder", "Air vent mount"],
  tripod: ["Mobile tripod 3110", "Selfie stick tripod", "Tripod with remote"],
  "ring-light": ["Ring light 10 inch with stand", "Selfie ring light", "LED ring light"],
  stylus: ["Stylus pen for iPad", "Apple Pencil 2nd gen", "S Pen"],
  "tracker-tag": ["Apple AirTag", "Bluetooth tracker key finder", "Galaxy SmartTag"],
  "usb-fan": ["USB mini fan", "Portable handheld fan rechargeable", "Desk fan USB"],

  // Repair services
  "water-damage": ["Water damage repair", "Liquid damage cleaning", "iPhone water damage treatment"],
  "unlock-service": ["FRP unlock", "iCloud bypass", "Network unlock Samsung", "Pattern unlock"],
};

const POSITIVE = Object.entries(NAMES).flatMap(([key, names]) => names.map((name) => [key, name] as const));

describe("every picture is found by the names shops really use", () => {
  it.each(POSITIVE)("%s <- %s", (key, name) => {
    expect(pick(name)).toBe(key);
  });

  it("has at least two realistic names for every picture in the catalog", () => {
    for (const entry of CATALOG) expect(NAMES[entry.key]?.length ?? 0, entry.key).toBeGreaterThanOrEqual(2);
    for (const key of Object.keys(NAMES)) expect(catalogEntryByKey(key), key).not.toBeNull();
  });
});

// Spelling, spacing, case, plurals, hyphens, word order: the same words, typed differently.
const VARIANTS: [string, string | null][] = [
  ["glass guard", "screen-protector"],
  ["GLASSGUARD", "screen-protector"],
  ["guard glass", "screen-protector"],
  ["Glass-Guard", "screen-protector"],
  ["glass_guard", "screen-protector"],
  ["Tempered Glasses", "screen-protector"],
  ["TEMPERED GLASS", "screen-protector"],
  ["tempered-glass 9H", "screen-protector"],
  ["tempered    glass", "screen-protector"],
  ["Tampered glass", "screen-protector"],
  ["Tempard glass Redmi 9", "screen-protector"],
  ["Scren gaurd", "screen-protector"],
  ["Tempered glas", "screen-protector"],
  ["screen protecter", "screen-protector"],
  ["Screen Protectors", "screen-protector"],
  ["Chargar", "charger"],
  ["Mobile chager", "charger"],
  ["Charjer", "charger"],
  ["usbc cable", "usb-c-cable"],
  ["USB-C Cable", "usb-c-cable"],
  ["type-c cable", "usb-c-cable"],
  ["Typec cable", "usb-c-cable"],
  ["TYPE C DATA CABLE", "usb-c-cable"],
  ["Cabel", "usb-c-cable"],
  ["data cables", "usb-c-cable"],
  ["Labtop", "laptop"],
  ["Laptop Dell", "laptop"],
  ["LAPTOPS", "laptop"],
  ["Hedphones", "headphones"],
  ["Blutooth speaker", "bluetooth-speaker"],
  ["bluetooth-speakers", "bluetooth-speaker"],
  ["Powerbank", "power-bank"],
  ["Power-bank 20000mAh", "power-bank"],
  ["Moniter 24", "monitor"],
  ["Mouce wireless", "mouse"],
  ["Wireless mice", "mouse"],
  ["Wi-Fi router", "wifi-router"],
  ["wifi routers", "wifi-router"],
  ["Pendrive 32GB", "usb-flash-drive"],
  ["pen-drive", "usb-flash-drive"],
  ["Memorycard 64GB", "microsd-card"],
  ["Bak cover", "clear-case"],
  ["back-cover", "clear-case"],
  ["Backcover Redmi", "clear-case"],
  ["Mobile covers", "clear-case"],
  ["Phone Cases", "clear-case"],
  ["Flip covers", "wallet-case"],
  ["Earphones", "wired-earphones"],
  ["Hands free", "wired-earphones"],
  ["Handsfree", "wired-earphones"],
  ["Ear phone", "wired-earphones"],
  ["Iphone14 case", "clear-case"],
  ["iPhone15promax tempered glass", "screen-protector"],
  ["Smart plugs", "smart-plug"],
  ["Ring lights", "ring-light"],
  ["Tripods", "tripod"],
  ["Selfie sticks", "tripod"],
  ["Microscopes", "microscope"],
  ["Multimeters", "multimeter"],
  ["Tweezers", "tweezers"],
  ["Screws", "screw-set"],
  ["Batteries", "phone-battery"],
  ["Camra lens protector", "camera-lens-protector"],
  ["Wireles charger", "wireless-charger"],
  ["SoundBar", "soundbar"],
  ["sound-bar", "soundbar"],
  ["Xbox", "game-console"],
  ["X-box 360", "game-console"],
  ["PS 5", "game-console"],
  ["ps5", "game-console"],
  ["PlayStation5", "game-console"],
  ["Nintendo Swich", "handheld-console"],
  ["Hdmi cabel 5m", "hdmi-cable"],
  ["lan cabel", "ethernet-cable"],
  ["CAT6", "ethernet-cable"],
  ["cat 6 cable", "ethernet-cable"],
];

describe("spelling, spacing, case, plurals and word order", () => {
  it.each(VARIANTS)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it("treats 'glass guard', 'glassguard' and 'guard glass' as the same thing", () => {
    const keys = ["glass guard", "glassguard", "guard glass", "Glass-Guard", "GLASS GUARD", "glass  guard"].map((name) => pick(name));
    expect(new Set(keys)).toEqual(new Set(["screen-protector"]));
  });
});

// A brand, a model number or a size on the end must not change the picture.
const NOISE: [string, string | null][] = [
  ["iPhone 14 Pro Max tempered glass 6.7 inch", "screen-protector"],
  ["Samsung Galaxy A54 5G back cover", "clear-case"],
  ["Redmi Note 12 Pro+ silicone case", "silicone-case"],
  ["Apple USB-C 20W Power Adapter", "wall-charger"],
  ["USB-C 20W charger", "wall-charger"],
  ["Anker 65W GaN charger", "wall-charger"],
  ["Baseus 100W USB C to C cable", "braided-cable"],
  ["Samsung 55 inch QLED TV", "television"],
  ["Sony PS5 DualSense Edge controller", "game-controller"],
  ["iPhone 13 Pro 128GB battery", "phone-battery"],
  ["OnePlus Nord CE 3 Lite tempered glass", "screen-protector"],
  ["Vivo Y20 mobile battery 5000mAh", "phone-battery"],
  ["Realme C21Y back glass", "back-glass"],
  ["Oppo A57 LCD combo", "display-assembly"],
  ["Poco X3 Pro charging port", "charging-port"],
  ["Moto G60 earpiece", "earpiece-speaker"],
  ["Infinix Hot 11 display folder", "display-assembly"],
  ["Galaxy S23 tempered glass for iPhone", "screen-protector"],
  ["Dell XPS 13 9310 battery", "laptop-battery"],
  ["HP Pavilion 15 laptop screen 15.6", "laptop-lcd"],
  ["Lenovo IdeaPad 3 keyboard", "laptop-keyboard"],
  ["Asus ROG Strix gaming mouse", "gaming-mouse"],
  ["Logitech MX Master 3 wireless mouse", "mouse"],
  ["Kingston A400 240GB SSD", "ssd-drive"],
  ["Samsung 970 EVO Plus M.2 NVMe 1TB", "m2-ssd"],
  ["Crucial 8GB DDR4 3200MHz laptop RAM", "ram-module"],
  ["Corsair RM750x power supply", "pc-power-supply"],
  ["Dell Latitude 5420 i5 8GB 256GB SSD laptop", "laptop"],
  ["Gaming PC Ryzen 5 5600 16GB RAM 512GB SSD RTX 3060", "desktop-computer"],
  ["Intel Core i5 12400 processor", "cpu-processor"],
  ["DJI Mavic Air 2 battery", "drone-battery"],
  ["DJI Mini 2 propellers", "drone-propellers"],
  ["iPad Pro 12.9 5th gen screen", "tablet-screen"],
  ["iPad 9th generation case", "tablet-case"],
  ["Galaxy Watch 4 band", "watch-band"],
  ["Apple Watch Series 7 charger", "watch-charger"],
];

describe("brand names, model numbers and sizes", () => {
  it.each(NOISE)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it("reads a phone brand with a model, and nothing else, as a phone", () => {
    expect(pick("Samsung A54")).toBe("phone");
    expect(pick("Samsung Galaxy A54 5G 8GB 256GB")).toBe("phone");
    expect(pick("Redmi Note 12")).toBe("phone");
    expect(pick("Poco X5 Pro (8GB/256GB)")).toBe("phone");
    expect(matchCatalog({ name: "Redmi Note 12" })[0].reason).toBe("brand");
    // ...but not a brand that makes other things, a model-less brand, or a phone part.
    expect(pick("Samsung")).toBeNull();
    expect(pick("Samsung 55 inch")).toBeNull();
    expect(pick("Redmi Note 12 hinge")).toBeNull();
    expect(pick("Realme Watch 2")).toBe("smartwatch");
    expect(pick("Realme Buds Air 3")).toBe("earbuds");
    expect(pick("Redmi Note 12 battery")).toBe("phone-battery");
    expect(pick("Redmi Note 12 repair")).toBe("phone");
  });
});

// Vague or unknown names must get the normal placeholder, never a wrong picture.
const VAGUE = [
  "Misc item",
  "Gift",
  "Service charge",
  "Delivery",
  "Discount",
  "Shipping",
  "Gift card",
  "Advance payment",
  "Item 1",
  "Test product",
  "Warranty",
  "Bundle offer",
  "Extra",
  "Other",
  "Accessories",
  "Spare parts",
  "xyz",
  "12345",
  "Miscellaneous",
  "Custom order",
  "Cash",
  "Cooling fan",
  "Film",
  "Stand",
  "Dongle",
  "Lens",
  "Strap",
  "Table",
  "House",
  "Magic",
  "Class 10",
];

describe("vague or unknown names get no picture", () => {
  it.each(VAGUE)("%s", (name) => {
    expect(pick(name)).toBeNull();
    expect(matchCatalog({ name })).toEqual([]);
  });

  it("copes with empty and strange input", () => {
    for (const name of ["", "   ", "---", "???", "💥", "الكل", "x".repeat(2000), "a ".repeat(500)]) {
      expect(() => pick(name)).not.toThrow();
      expect(pick(name)).toBeNull();
    }
    expect(pick(undefined as unknown as string)).toBeNull();
    expect(bestCatalogMatch({ name: "tempered glass", category: undefined })?.key).toBe("screen-protector");
  });
});

// Look-alikes: the words overlap with another picture, the name decides. [name, category, expected]
const LOOKALIKES: [string, string | null, string | null][] = [
  ["Lightning charging port", null, "charging-port"],
  ["iPhone 12 Lightning Charging Port", "Cables & Connectors", "charging-port"],
  ["iPhone 14 screen", null, "display-assembly"],
  ["iPhone 14", null, "phone"],
  ["iPhone 14 screen protector", null, "screen-protector"],
  ["laptop battery", null, "laptop-battery"],
  ["Samsung A12 battery", null, "phone-battery"],
  ["Tablet battery", null, "tablet-battery"],
  ["Drone battery", null, "drone-battery"],
  ["Watch battery", null, null],
  ["Camera battery", null, null],
  ["USB-C hub", null, "usb-hub"],
  ["Samsung TV remote", null, "tv-remote"],
  ["PS5 controller charging dock", null, "controller-dock"],
  ["PS5 controller", null, "game-controller"],
  ["Drone controller", null, "drone-controller"],
  ["Mobile gamepad", null, "mobile-controller"],
  ["Laptop screen", null, "laptop-lcd"],
  ["Laptop screen protector", null, "screen-protector"],
  ["Tablet screen", null, "tablet-screen"],
  ["TV screen", null, "tv-panel"],
  ["HDMI port", null, "hdmi-port"],
  ["HDMI cable", null, "hdmi-cable"],
  ["Camera lens protector", null, "camera-lens-protector"],
  ["Camera module", null, "camera-module"],
  ["Camera", null, "camera"],
  ["Watch band", null, "watch-band"],
  ["Apple Watch", null, "smartwatch"],
  ["Gaming mouse", null, "gaming-mouse"],
  ["Mouse pad", null, "mouse-pad"],
  ["Laptop keyboard", null, "laptop-keyboard"],
  ["Keyboard", null, "keyboard"],
  ["SD card", null, "sd-card"],
  ["Micro SD card", null, "microsd-card"],
  ["Earbuds case", null, "earbuds-case"],
  ["AirPods", null, "earbuds"],
  ["Wireless charger", null, "wireless-charger"],
  ["Wireless mouse", null, "mouse"],
  ["Phone stand", null, "phone-stand"],
  ["Laptop stand", null, "laptop-stand"],
  ["TV motherboard", null, "tv-main-board"],
  ["iPhone 13 motherboard", null, "circuit-board"],
  ["Motherboard", null, null],
  ["PC motherboard", null, "motherboard"],
  ["PS5 motherboard", null, null],
  ["MacBook logic board", null, null],
  ["Laptop charging port", null, null],
  ["Laptop charger", null, "laptop-charger"],
  ["USB-C cable", null, "usb-c-cable"],
  ["Lightning cable", null, "lightning-cable"],
  ["HDMI flex cable", null, null],
  ["Lightning connector", null, null],
  ["Lightning Audio Jack", null, null],
  ["Charging Cable Flex", null, "charging-port"],
  ["Phone charger", null, "charger"],
  ["Car charger", null, "car-charger"],
  ["Wall mount", null, "tv-wall-mount"],
  ["TV stand", null, "tv-stand-legs"],
  ["TV backlight", null, "tv-backlight-strips"],
  ["LED strip", null, "led-strip"],
  ["Printer ink", null, "ink-cartridges"],
  ["Canon printer", null, "printer"],
  ["Canon ink", null, "ink-cartridges"],
  ["Heat gun", null, "heat-gun"],
  ["Hot air blower", null, "heat-gun"],
  ["Screen cleaning kit", null, "cleaning-kit"],
  ["Screen cleaner", null, "cleaning-spray"],
  ["Screen separator", null, "screen-separator"],
  ["Screwdriver set", null, "repair-tools"],
  ["Precision tweezers", null, "tweezers"],
];

describe("look-alikes", () => {
  it.each(LOOKALIKES)("%s [%s] -> %s", (name, category, key) => {
    expect(pick(name, category)).toBe(key);
  });
});

// A service word with a device gives the DEVICE picture; with no device, the toolbox for repair work.
const SERVICES: [string, string | null, string | null][] = [
  ["TV repair", null, "television"],
  ["iPhone screen repair", null, "phone"],
  ["Laptop repair", null, "laptop"],
  ["Computer repair", null, "desktop-computer"],
  ["Drone motor repair", null, "drone"],
  ["PS5 HDMI port repair", null, "game-console"],
  ["Game repair", null, "game-console"],
  ["Tablet battery replacement service", null, "tablet"],
  ["Xbox fix", null, "game-console"],
  ["iPad repair", null, "tablet"],
  ["Apple Watch repair", null, "smartwatch"],
  ["Phone repair labour", null, "phone"],
  ["TV installation", null, "television"],
  ["Screen repair", null, "repair-tools"],
  ["Diagnostic", null, "repair-tools"],
  ["Labour", null, "repair-tools"],
  ["Water damage repair", null, "water-damage"],
  ["iPhone water damage repair", null, "water-damage"],
  ["Repair glue", null, "repair-glue"],
  ["Repair mat", null, "repair-mat"],
  ["Repair tools", null, "repair-tools"],
  ["Phone repair kit", null, "repair-tools"],
  ["Screen repair", "Services", "repair-tools"],
  ["TV repair", "Services", "television"],
  ["Battery replacement", null, "phone-battery"],
  ["iPhone 6S Screen Replacement", "Screens", "display-assembly"],
];

describe("service words", () => {
  it.each(SERVICES)("%s [%s] -> %s", (name, category, key) => {
    expect(pick(name, category)).toBe(key);
  });

  it("says why: the match reason is 'service' for repair work on a device", () => {
    expect(matchCatalog({ name: "TV repair" })[0]).toMatchObject({ reason: "service", entry: { key: "television" } });
    expect(matchCatalog({ name: "Screen repair" })[0]).toMatchObject({ reason: "service", entry: { key: "repair-tools" } });
  });
});

// The category counts for very little and NEVER overrides the name. [name, category, expected]
const CATEGORIES: [string, string | null, string | null][] = [
  ["Wireless mouse", "Computers", "mouse"],
  ["USB hub", "Computers", "usb-hub"],
  ["Podcast microphone", "Audio", "microphone"],
  ["Mouse", "Computers", "mouse"],
  ["Samsung A54", "Phones", "phone"],
  ["Samsung 55 inch", "Televisions", "television"],
  ["Samsung", "Televisions", "television"],
  ["ThinkPad T420", "Computers", "laptop"],
  ["Dell 3520", "Laptops", null],
  ["Anything", "Laptops", null],
  ["Unknown thing", "Computers", null],
  ["Dell Latitude 5420", "Computers", "laptop"],
  ["Sony WH-1000XM4", "Headphones", null],
  ["Nikon D3500", "Cameras", "camera"],
  ["Samsung A54", "Screen guards", "screen-protector"],
  ["Samsung A54", "Tempered glass", "screen-protector"],
  ["Spare", "Phones", null],
  ["Battery", "Laptops", null],
  ["Battery", "Phones", "phone-battery"],
  ["Battery", "Parts", "phone-battery"],
  ["Mouse", "Phones", "mouse"],
  ["Phone case", "Computers", "clear-case"],
  // A bare "Case" filed under Computers is a PC case: the protective-case picture is a phone case, so no picture.
  ["Case", "Computers", null],
  ["Redmi Note 10", "Mobile phones", "phone"],
  ["Charger", "Phones", "charger"],
  ["iPad", "Computers", "tablet"],
  ["Hub", "Phones", "usb-hub"],
  ["USB-C cable", "Cables & Connectors", "usb-c-cable"],
  ["Lightning cable", "Ports & Connectors", "lightning-cable"],
  ["Lightning connector", "Cables", null],
];

describe("the category", () => {
  it.each(CATEGORIES)("%s [%s] -> %s", (name, category, key) => {
    expect(pick(name, category)).toBe(key);
  });

  // A category that names a kind of thing can give a nameless product that thing's picture, but "parts" and "accessories" never make it the device.
  it.each([
    ["Zxqv 100", "Phones", "phone"],
    ["Zxqv 100", "Mobile phones", "phone"],
    ["Mystery gadget", "Phones", null],
    ["Mystery gadget", "Phone parts", null],
    ["Mystery gadget", "Mobile accessories", null],
    ["Mystery gadget", "TV accessories", null],
    ["Mystery gadget", "Drone parts", null],
    ["Mystery gadget", "Chargers", "charger"],
    ["Mystery gadget", "Cables & Connectors", "usb-c-cable"],
    ["Mystery gadget", "Screen guards", "screen-protector"],
    ["Mystery gadget", "Computers", null],
    ["Mystery gadget", "Laptops", null],
    ["Screen repair", "Phones", "phone"],
    ["Battery", "Phone parts", "phone-battery"],
  ] as [string, string, string | null][])("%s [%s] -> %s", (name, category, key) => {
    expect(pick(name, category)).toBe(key);
  });

  it("is only a tie-break next to a name that already matches", () => {
    const withCategory = matchCatalog({ name: "Tempered glass", category: "Screen guards" })[0];
    const without = matchCatalog({ name: "Tempered glass" })[0];
    expect(withCategory.entry.key).toBe("screen-protector");
    expect(withCategory.score - without.score).toBeGreaterThan(0);
    expect(withCategory.score - without.score).toBeLessThan(100);
  });

  it("never outranks any match found in the name", () => {
    const [top, second] = matchCatalog({ name: "iPhone 14", category: "Screen guards" }, 3);
    expect(top.entry.key).toBe("phone");
    expect(second.reason).toBe("category");
    expect(second.score).toBeLessThan(top.score);
  });
});

// Real stock-list names from phone, computer and console repair shops.
const REAL_WORLD: [string, string | null][] = [
  ["Samsung Galaxy A32 Original Display With Frame", "display-assembly"],
  ["iPhone XR Battery Original", "phone-battery"],
  ["Redmi 9A Charging Port Board", "charging-port"],
  ["Vivo V20 LCD Folder Combo", "display-assembly"],
  ["Oppo F11 Pro Tempered 9D", "screen-protector"],
  ["Realme 5 Back Panel", "back-glass"],
  ["Samsung J2 Battery EB-BJ200", "phone-battery"],
  ["Tecno Spark 7 Mobile Back Cover", "clear-case"],
  ["Type-C Fast Charger 33W Mi", "wall-charger"],
  ["Mi 20000mAh Power Bank 3i", "power-bank"],
  ["Boat Rockerz 255 Neckband", "earbuds"],
  ["Realme Buds Air 3", "earbuds"],
  ["JBL Flip 6", "bluetooth-speaker"],
  ["Logitech G102 Gaming Mouse", "gaming-mouse"],
  ["HP 15s Laptop Charger 65W", "laptop-charger"],
  ["Samsung 970 Evo Plus NVMe", "m2-ssd"],
  ["WD Blue 1TB HDD", "hard-drive"],
  ["Sandisk Ultra 128GB Pendrive", "usb-flash-drive"],
  ["TP-Link Archer C6 Router", "wifi-router"],
  ["Epson L3210 Printer", "printer"],
  ["Canon PG-47 Ink", "ink-cartridges"],
  ["PS4 Controller Charging Cable", "usb-c-cable"],
  ["Macbook Pro A1502 Battery", "laptop-battery"],
  ["iPad Mini 4 LCD", "tablet-screen"],
  ["Apple Pencil 2", "stylus"],
  ["Tempered Glass for Redmi Note 11 (Pack of 10)", "screen-protector"],
  ["Mobile Screen Guard 9H (Redmi)", "screen-protector"],
  ["Airpods Pro Silicone Cover", "earbuds-case"],
  ["Selfie Stick Bluetooth Tripod 3 in 1", "tripod"],
  ["iPhone 11 Pro Max Camera Glass", "camera-lens-protector"],
  ["Samsung A51 Back Cover Transparent", "clear-case"],
  ["iPhone 12 mini FaceID Flex", null],
  ["iPhone X Speaker", "earpiece-speaker"],
  ["Samsung J7 Vibrator", "vibration-motor"],
  ["Honor 9 Lite SIM Tray", "sim-tray"],
  ["AA Batteries 4 pack Duracell", null],
  ["Laptop Cooling Pad 5 Fan", "cooling-pad"],
  ["OnePlus 9 Pro Case", "clear-case"],
  ["Soldering Iron 60W Goot", "soldering-iron"],
  ["Flux Paste 559", "soldering-iron"],
  ["BGA Stencil", null],
  ["Mobile Repair Charges", "phone"],
  ["Laptop Service", "laptop"],
  ["Software Installation", null],
  ["Windows Installation", null],
  ["Data Recovery", null],
  ["Diagnostic Fee", "repair-tools"],
  ["iPhone 13 Screen Replacement Charges", "display-assembly"],
  ["Express Delivery", null],
  ["Nokia 105 Mobile", "phone"],
  ["Samsung Guru Phone", "phone"],
  ["Lava Z1", "phone"],
  ["Jio Phone", "phone"],
  ["Poco M4 Pro Back Cover", "clear-case"],
  ["Mi Band 4 Strap", "watch-band"],
  ["Fitbit Charge 4 Band", "fitness-band"],
  ["Noise ColorFit Pulse", null],
  ["Dell Monitor 22 inch", "monitor"],
  ["HP Wireless Keyboard Mouse Combo", "keyboard"],
  ["Zebronics Webcam", "webcam"],
  ["Multi Plug Extension 4 Socket", "surge-protector"],
  ["Samsung Original Type C Data Cable 1m", "usb-c-cable"],
  ["Apple Original Lightning to USB Cable", "lightning-cable"],
  ["Aux Cable 1.5 meter", "aux-cable"],
  ["Ethernet Patch Cord 2m", "ethernet-cable"],
  ["USB 3.0 Hub 4 Port", "usb-hub"],
  ["Mi TV Stick", "streaming-stick"],
  ["Amazon Fire TV Stick 4K", "streaming-stick"],
  ["LG 43 inch LED TV Panel", "tv-panel"],
  ["TV Wall Mount 43 Inch", "tv-wall-mount"],
  ["Samsung TV Main Board BN41", "tv-main-board"],
  ["Sony LED TV Backlight Strip Set", "tv-backlight-strips"],
  ["DJI Mini 3 Pro Gimbal", "drone-camera-gimbal"],
  ["DJI Mavic Air 2 Propellers", "drone-propellers"],
  ["Drone Battery 3S 2200mAh", "drone-battery"],
  ["FPV Drone Motor 2306", "drone-motor"],
  ["PS5 Slim Disc Drive", "disc-drive"],
  ["PS5 DualSense Thumbstick", "analog-stick"],
  ["Xbox Series X Controller", "game-controller"],
  ["Nintendo Switch Joy-Con Pair", "joycon-pair"],
  ["Switch Lite Analog Stick", "analog-stick"],
  ["Steam Deck Case", null],
  ["Meta Quest 2", "vr-headset"],
  ["Gaming Chair", null],
  ["Mouse Pad Large", "mouse-pad"],
  ["Laptop Bag 15.6 Inch", "laptop-bag"],
  ["USB Fan", "usb-fan"],
  ["Mini Fan Rechargeable", "usb-fan"],
  ["Key Finder Tracker", "tracker-tag"],
  ["Phone Tripod Stand", "tripod"],
  ["Ring Light 12 inch", "ring-light"],
  ["Car Mobile Holder", "car-mount"],
  ["Mobile Stand Foldable", "phone-stand"],
  ["Tweezer Set", "tweezers"],
  ["Hot Air Gun", "heat-gun"],
  ["IPA 99% Isopropyl Alcohol", "cleaning-spray"],
  ["Screen Cleaning Cloth", "microfiber-cloth"],
  ["Compressed Air Duster", "compressed-air"],
  ["Phone Repair Tool Kit 115 in 1", "repair-tools"],
  ["Water Damage Treatment", "water-damage"],
  ["FRP Bypass", "unlock-service"],
  ["iCloud Unlock", "unlock-service"],
  ["Samsung FRP Remove Service", "unlock-service"],
  ["USB-C to HDMI Cable", "hdmi-cable"],
  ["Lightning to HDMI Adapter", null],
  ["Car AUX Bluetooth Receiver", "bluetooth-dongle"],
  ["Bluetooth Receiver Audio", "bluetooth-dongle"],
  ["Wifi Adapter USB 600Mbps", "wifi-dongle"],
  ["Mini Projector Android", "projector"],
  ["LED Strip Light RGB 5m", "led-strip"],
  ["Samsung Soundbar HW-T450", "soundbar"],
  ["Home Theatre 5.1", "soundbar"],
  ["Wired Earphone With Mic", "wired-earphones"],
  ["Gaming Headset Wireless", "gaming-headset"],
  ["Blue Yeti Microphone", "microphone"],
  ["Lapel Mic For Phone", "microphone"],
];

describe("real stock-list names", () => {
  it.each(REAL_WORLD)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });
});

// ---------------------------------------------------------------------------------------------
// Repair pass: names a reviewer found that got a confident wrong picture.
// ---------------------------------------------------------------------------------------------

// A phone listing's spec sheet (RAM, ROM, SIM, mAh, MP, "with charger") never turns the phone into a part.
const PHONE_LISTINGS: [string, string | null][] = [
  ["Redmi 12 (Jade Black, 4GB RAM, 128GB Storage)", "phone"],
  ["Poco C55 4GB RAM 64GB ROM", "phone"],
  ["Vivo Y16 3GB RAM 32GB", "phone"],
  ["Lenovo Tab M10 4GB RAM", "tablet"],
  ["Samsung Galaxy A14 (Dual SIM)", "phone"],
  ["iPhone 14 Dual SIM 128GB", "phone"],
  ["Nokia 105 Dual SIM", "phone"],
  ["Redmi 12 5G (6000mAh Battery, 50MP Camera)", "phone"],
  ["Samsung Galaxy M14 5G (6000mAh Battery)", "phone"],
  ["iPhone 14 with cable", "phone"],
  ["Samsung Galaxy S23 with charger", "phone"],
  // the long marketplace titles distributors paste in
  ["Samsung Galaxy M14 5G (ICY Silver, 4GB, 128GB Storage) | 50MP Triple Cam | 6000 mAh Battery | 5nm Octa-Core Processor", "phone"],
  ["Redmi 12 5G (Jade Black, 4GB RAM, 128GB Storage) | Superfast 5G | Triple Camera | Android 13", "phone"],
  ["Realme Narzo 60X 5G (Stellar Green, 6GB RAM, 128GB Storage) 33W Charger Included", "phone"],
  ["Samsung Guru Music 2 Dual SIM Keypad Phone", "phone"],
  ["Apple iPhone 14 Pro Max 256GB Deep Purple with Charger and Box", "phone"],
  ["Apple iPhone 15 (128 GB) - Black", "phone"],
  ["iPhone 13 128GB Midnight (Refurbished) with 1 year warranty", "phone"],
  ["Samsung Galaxy A54 5G 8GB 128GB Awesome Violet Used Good Condition", "phone"],
  ["iPhone 14 Pro Max with free tempered glass and cover", "phone"],
  ["Samsung Galaxy Tab A8 10.5 inch 4GB RAM 64GB Wi-Fi + 4G Tablet with S Pen", "tablet"],
  ["iPad 10th Generation 64GB Wi-Fi Blue", "tablet"],
  // ...and a real battery, SIM tray, RAM or memory card for sale is still that item
  ["Vivo Y20 mobile battery 5000mAh", "phone-battery"],
  ["5000mAh battery for Vivo Y20", "phone-battery"],
  ["Samsung Galaxy M14 6000mAh Battery", "phone-battery"],
  ["Samsung Galaxy A54 5000mAh battery replacement", "phone-battery"],
  ["iPhone 14 Pro Max 256GB battery", "phone-battery"],
  ["Redmi Note 11 4GB RAM 64GB ROM motherboard", "circuit-board"],
  ["Samsung A14 dual sim tray", "sim-tray"],
  ["iPhone 14 nano sim tray", "sim-tray"],
  ["Jio nano sim for iPhone", "sim-card"],
  ["Samsung A50 camera module 25MP", "camera-module"],
  ["Samsung 8GB DDR4 RAM laptop", "ram-module"],
  ["Samsung EVO 128GB micro SD card", "microsd-card"],
  ["iPhone 14 Pro Max 256GB 5G charging port", "charging-port"],
];

// "with charger and bag" after a device is what comes in the box, not what is for sale.
const BUNDLES: [string, string | null][] = [
  ["Samsung 43 inch Crystal 4K Smart TV with Wall Mount", "television"],
  ["LG 32 inch HD Ready Smart LED TV with Stand and Remote", "television"],
  ["HP 15s Laptop AMD Ryzen 5 8GB RAM 512GB SSD with Charger and Bag", "laptop"],
  ["Sony PS5 Console with 2 Controllers and Games", "game-console"],
  ["DJI Mini 3 Fly More Combo with RC Controller", "drone"],
  ["Canon EOS 1500D DSLR Camera with 18-55mm Lens and Bag", "camera"],
  ["GoPro Hero 11 Black with Battery and SD Card", "camera"],
  ["Apple Watch Series 9 GPS 45mm with Charger", "smartwatch"],
  ["boAt Airdopes 141 with Charging Case", "earbuds"],
  ["Sony WH-CH520 Wireless Headphones with Mic", "headphones"],
  ["iPad Pro 11 with Apple Pencil", "tablet"],
  // a name that says "with" itself, or has a real item after it, is left whole
  ["Headset with mic", "gaming-headset"],
  ["Earphone with mic", "wired-earphones"],
  ["Power bank with cable 10000mAh", "power-bank"],
  ["Wireless charger with stand for iPhone", "wireless-charger"],
  ["iPhone 14 with screen replacement", "display-assembly"],
  ["iPhone 12 Pro Max Back Glass with Camera Lens", "back-glass"],
];

describe("phone listings and boxed extras", () => {
  it.each(PHONE_LISTINGS)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it.each(BUNDLES)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });
});

// Samsung's flagship colours are not a drone.
const PHANTOMS: [string, string | null][] = [
  ["Samsung S23 Ultra Phantom Black", "phone"],
  ["Samsung S22 Phantom Black 128GB", "phone"],
  ["Samsung Galaxy S23 Ultra 5G (Phantom Black, 12GB, 256GB)", "phone"],
  ["Samsung Galaxy S22 Phantom White", "phone"],
  ["Galaxy S21 Phantom Violet", "phone"],
  ["DJI Phantom 4 Pro", "drone"],
  ["Phantom 3 drone", "drone"],
  ["Phantom drone", "drone"],
  ["Phantom 4 battery", "drone-battery"],
];

// A whole-device picture is no picture for that device's parts, accessories or typos of them.
const NOT_THE_DEVICE_ITEMS: [string, string | null][] = [
  ["iPhone 12 wifi antenna", null],
  ["iPhone 12 face id", null],
  ["iPhone 13 nfc coil", null],
  ["iPhone 11 dust mesh", null],
  ["iPhone X taptic", "vibration-motor"],
  ["iPhone 14 wallet", null],
  ["iPhone 12 strap", null],
  ["iPhone 13 box", null],
  ["Spigen Tough Armor iPhone 14", "rugged-case"],
  ["batry iphone 7", "phone-battery"],
  ["baterry iPhone 11", "phone-battery"],
  ["backglas iphone 12", "back-glass"],
  ["iPhone 12 antena", null],
  ["iPhone 12 fingerprnt", null],
  ["DJI Mini 3 arm", null],
  ["DJI Mini 3 shell", null],
  ["DJI Mini 3 ND filter", null],
  ["drone esc", null],
  ["drone landing gear", null],
  ["MacBook Air palm rest", null],
  ["MacBook Pro 14 touchbar", null],
  ["MacBook skin", null],
  ["headphone cushion", null],
  ["headphone ear pad", null],
  ["Beats Studio headband", null],
  ["GoPro mount", null],
  ["Canon EOS lens", null],
  ["DSLR strap", null],
  ["camera strap", null],
  ["Nikon lens cap", null],
  ["Camera flash", null],
  ["DSLR camera bag", null],
  ["PS5 faceplate", null],
  ["PS5 stand", null],
  ["PS5 liquid metal", "thermal-paste"],
  ["Steam Deck dock", null],
  ["Nintendo Switch dock", null],
  // the device itself, with words that only look like a part
  ["Samsung Gear S3 Frontier smartwatch", "smartwatch"],
  ["Redmi Pad", "tablet"],
  ["Samsung Galaxy Book3 Pro 360", "laptop"],
];

describe("a model, a colour or a device does not hide what is really being sold", () => {
  it.each(PHANTOMS)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it.each(NOT_THE_DEVICE_ITEMS)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });
});

// "case" and "cover" are the phone's: other things' cases get no phone-case picture.
const CASES: [string, string | null][] = [
  ["PC case", "desktop-computer"],
  ["Computer case", "desktop-computer"],
  ["ATX gaming case", "desktop-computer"],
  ["Apple Watch case", null],
  ["Apple Watch cover", null],
  ["Watch case", null],
  ["Nintendo Switch case", null],
  ["PS5 console case", null],
  ["Camera case", null],
  ["Camera cover", null],
  ["GoPro case", null],
  ["headphone case", null],
  ["SSD case", null],
  ["HDD case", null],
  ["Key case", null],
  ["Dust cover", null],
  ["keyboard cover", null],
  ["tv cover", null],
  ["AC cover", null],
  ["power bank case", null],
  ["Kindle cover", "tablet-case"],
  ["laptop bottom cover", null],
  ["MacBook Air bottom case", null],
  // a case is a case, even when the word before it is "glass" (the plural folds, so "glasses case" is the same)
  ["Glass case", "clear-case"],
  ["glasses case", "clear-case"],
  // the phone ones are untouched
  ["back cover", "clear-case"],
  ["iPhone 14 case", "clear-case"],
  ["Redmi Note 12 back cover", "clear-case"],
  ["Mobile pouch", "clear-case"],
  ["Laptop cover", "laptop-sleeve"],
];

// "in cell" lost its stop word and became the bare word "cell", so any cell was a display.
const CELLS: [string, string | null][] = [
  ["Lithium cell", null],
  ["18650 cell", null],
  ["Solar cell", null],
  ["button cell", null],
  ["cell", null],
  ["incell display", "display-assembly"],
  ["iPhone 11 in cell lcd", "display-assembly"],
  ["Redmi Note 10 incell", "display-assembly"],
];

describe("cases for other devices, and cells", () => {
  it.each(CASES)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it.each(CELLS)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it("does not read a bare battery cell as a display", () => {
    expect(pick("Battery cell")).not.toBe("display-assembly");
  });
});

// A brand is not a product: JBL makes headphones and earbuds as well as speakers, and Mi bands have accessories.
const BRANDS_AND_ACCESSORIES: [string, string | null][] = [
  ["JBL Tune 510BT Headphones", "headphones"],
  ["JBL headphones", "headphones"],
  ["JBL earbuds", "earbuds"],
  ["JBL Wave Beam TWS", "earbuds"],
  ["JBL T110BT", null],
  ["JBL", null],
  ["JBL Flip 6", "bluetooth-speaker"],
  ["JBL Go 3", "bluetooth-speaker"],
  ["JBL Charge 5", "bluetooth-speaker"],
  ["JBL Xtreme 3", "bluetooth-speaker"],
  ["Mi Band 7 charger", "watch-charger"],
  ["Mi Band 6 strap", "watch-band"],
  ["Mi Band 7 screen guard", "screen-protector"],
  ["Mi Band 5 protector", null],
  ["Fitbit Charge 5 charger", "watch-charger"],
  ["Mi Band 7", "fitness-band"],
  ["Fitbit Charge 5", "fitness-band"],
  ["Galaxy Fit 3", "fitness-band"],
];

// "extension" and a bare "cable" are not every extension or every cable.
const EXTENSIONS_AND_CABLES: [string, string | null][] = [
  ["USB extension cable", null],
  ["extension cable", null],
  ["HDMI extension cable", "hdmi-cable"],
  ["Extension board 4 socket", "surge-protector"],
  ["Extension cord 5 meter", "surge-protector"],
  ["extension", "surge-protector"],
  ["cable tie", null],
  ["cable organizer", null],
  ["cable clip", null],
  ["cable protector", null],
  ["VGA cable", null],
  ["SATA cable", null],
  ["printer cable", null],
  ["RCA cable", null],
  ["speaker wire", null],
  ["CCTV cable", null],
  ["DisplayPort cable", null],
  ["USB-C to DisplayPort cable", null],
  ["USB cable", "usb-c-cable"],
  ["cable", "usb-c-cable"],
  ["Type C cable", "usb-c-cable"],
];

describe("brands, bands, extensions and cables", () => {
  it.each(BRANDS_AND_ACCESSORIES)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });

  it.each(EXTENSIONS_AND_CABLES)("%s -> %s", (name, key) => {
    expect(pick(name)).toBe(key);
  });
});


// ---------------------------------------------------------------------------------------------
// The functions around the matcher
// ---------------------------------------------------------------------------------------------

describe("normalize", () => {
  it.each([
    ["  Screen-Guards  ", "screen guard"],
    ["Batteries", "battery"],
    ["Glasses", "glass"],
    ["Watches", "watch"],
    ["Boxes", "box"],
    ["Cases", "case"],
    ["Lenses", "lens"],
    ["Mice", "mouse"],
    ["Wireless", "wireless"],
    ["Glass", "glass"],
    ["Plus", "plus"],
    ["USB-C (20W)", "usb c 20w"],
    ["Café  Ünïcode", "cafe unicode"],
    ["TEMPERED_GLASS", "tempered glass"],
    ["iPhone's", "iphone"],
    ["Cable & Connectors", "cable and connector"],
    ["", ""],
    ["   ", ""],
  ])("%j -> %j", (input, output) => {
    expect(normalize(input)).toBe(output);
  });
});

describe("matchCatalog", () => {
  it("returns {entry, score, reason} best first", () => {
    const matches = matchCatalog({ name: "Tempered glass for iPhone 14" }, 10);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches[0].entry.key).toBe("screen-protector");
    expect(matches[0].reason).toBe("phrase");
    for (let i = 1; i < matches.length; i++) expect(matches[i].score).toBeLessThanOrEqual(matches[i - 1].score);
    expect(matches.map((match) => match.entry.key)).toContain("phone");
  });

  it("honours the limit", () => {
    expect(matchCatalog({ name: "Tempered glass for iPhone 14" }, 1)).toHaveLength(1);
    expect(matchCatalog({ name: "Tempered glass for iPhone 14" }, 0)).toEqual([]);
    expect(matchCatalog({ name: "iPhone" }, 50).length).toBeLessThanOrEqual(50);
  });

  it("says how it matched: exactly, in any order, spaced differently, or with a typo", () => {
    expect(matchCatalog({ name: "glass guard" })[0].reason).toBe("phrase");
    expect(matchCatalog({ name: "guard glass" })[0].reason).toBe("tokens");
    expect(matchCatalog({ name: "glassguard" })[0].reason).toBe("compact");
    expect(matchCatalog({ name: "Cahrger" })[0]).toMatchObject({ reason: "fuzzy", entry: { key: "charger" } });
    expect(matchCatalog({ name: "Samsung A54", category: "Phones" })[0]).toMatchObject({ reason: "category", entry: { key: "phone" } });
  });

  it("ranks a specific item above a broad category above a whole device", () => {
    const keys = (name: string) => matchCatalog({ name }, 10).map((match) => match.entry.key);
    expect(keys("iPhone 14 screen assembly").slice(0, 2)).toEqual(["display-assembly", "phone"]);
    expect(keys("iPhone case").slice(0, 2)).toEqual(["clear-case", "phone"]);
    expect(keys("iPhone silicone case").slice(0, 3)).toEqual(["silicone-case", "clear-case", "phone"]);
    expect(keys("Wireless charger").indexOf("wireless-charger")).toBeLessThan(keys("Wireless charger").indexOf("charger"));
    expect(keys("Laptop charger").slice(0, 3)).toEqual(["laptop-charger", "charger", "laptop"]);
  });

  it("prefers the longer phrase between two items of the same kind", () => {
    expect(matchCatalog({ name: "Privacy screen protector" })[0].entry.key).toBe("privacy-screen-protector");
    expect(matchCatalog({ name: "Tablet screen" })[0].entry.key).toBe("tablet-screen");
    expect(matchCatalog({ name: "Gaming mouse pad" })[0].entry.key).toBe("mouse-pad");
  });

  it("prefers the thing for sale (the last word) over a device or model in front of it", () => {
    expect(pick("PS4 controller charging cable")).toBe("usb-c-cable");
    expect(pick("PS5 DualSense thumbstick")).toBe("analog-stick");
  });

  it("subtracts excluded words: a port, flex or board is never a cable", () => {
    const cables = ["usb-c-cable", "lightning-cable", "micro-usb-cable", "braided-cable", "hdmi-cable", "aux-cable", "ethernet-cable", "ac-power-cable"];
    for (const name of ["Lightning charging port", "Micro USB charging port", "Lightning connector", "HDMI flex cable", "USB-C cable connector", "Charging cable flex"]) {
      const keys = matchCatalog({ name }, 20).map((match) => match.entry.key);
      for (const cable of cables) expect(keys, `${name} / ${cable}`).not.toContain(cable);
    }
  });

  it("keeps a device word that belongs to a part from refusing that part", () => {
    expect(pick("Samsung A50 back camera module")).toBe("camera-module");
    expect(pick("iPad folio case")).toBe("tablet-case");
    expect(pick("DJI gimbal camera")).toBe("drone-camera-gimbal");
    expect(pick("Nintendo Switch OLED")).toBe("handheld-console");
    expect(pick("LCD TV")).toBe("television");
  });

  it("does not read 'accessories' or 'other items' of a device as the device", () => {
    for (const name of ["Mobile accessories", "Phone accessories", "TV accessories", "Laptop accessories", "Other phones", "Phone items"]) expect(pick(name), name).toBeNull();
    expect(pick("Mobile phones")).toBe("phone");
    expect(pick("Phone case")).toBe("clear-case");
  });

  it("does not let a whole-device picture stand in for that device's parts", () => {
    for (const name of ["Watch battery", "Camera battery", "PS5 motherboard", "MacBook logic board", "Laptop charging port", "Laptop hinge", "TV bezel", "iPhone 12 mini FaceID flex"]) {
      expect(pick(name), name).toBeNull();
    }
  });

  it("reads 'combo' as a display, unless something else is being sold with it", () => {
    expect(pick("Combo")).toBe("display-assembly");
    expect(pick("Redmi Note 10 combo")).toBe("display-assembly");
    expect(pick("Charger cable combo")).toBe("usb-c-cable");
    expect(pick("Keyboard mouse combo")).toBe("keyboard");
    expect(pick("Earphone combo offer")).toBe("wired-earphones");
  });

  it("reads a laptop model as a laptop, and a phone-only brand as a phone context", () => {
    expect(pick("Lenovo IdeaPad 3 keyboard")).toBe("laptop-keyboard");
    expect(pick("Dell Inspiron 15")).toBe("laptop");
    expect(pick("Vivo Y21 motherboard")).toBe("circuit-board");
  });

  it("treats the spec list of a whole computer as the computer, not its parts", () => {
    expect(pick("Dell Latitude 5420 i5 8GB RAM 256GB SSD laptop")).toBe("laptop");
    expect(pick("Gaming PC Ryzen 5 5600 16GB RAM 512GB SSD RTX 3060")).toBe("desktop-computer");
    expect(pick("8GB DDR4 laptop RAM")).toBe("ram-module");
    expect(pick("256GB SSD")).toBe("ssd-drive");
  });

  it("does not turn ordinary words into a typo of a catalog word", () => {
    for (const name of ["Printed", "Charged", "Magic", "House", "Table", "Class 10", "Stock", "Tracked", "Mouth"]) expect(pick(name), name).toBeNull();
  });

  it("calls a tie between two equally good pictures not sure", () => {
    // A bare "Motherboard" is a phone's or a PC's: neither has the edge, so neither gets the picture.
    const [first, second] = matchCatalog({ name: "Motherboard" });
    expect(first.score).toBe(second.score);
    expect(pick("Motherboard")).toBeNull();
    expect(pick("PC motherboard")).toBe("motherboard");
    expect(pick("Mobile motherboard")).toBe("circuit-board");
  });

  it("lets a plain accessory win a word it shares with a part made for one device, until a device is named", () => {
    expect(pick("Speaker")).toBe("bluetooth-speaker");
    expect(pick("Speakers", "Speakers")).toBe("bluetooth-speaker");
    expect(pick("Mic")).toBe("microphone");
    expect(pick("iPhone 11 speaker")).toBe("earpiece-speaker");
    expect(pick("Galaxy Tab speaker")).toBe("earpiece-speaker");
    expect(pick("iPhone 11 mic")).toBe("mic-flex");
    expect(pick("Laptop speaker")).toBeNull();
    expect(pick("TV speaker")).toBeNull();
  });
});

describe("catalogEntryByKey", () => {
  it("finds an entry by its key and nothing else", () => {
    expect(catalogEntryByKey("screen-protector")?.label).toBe("Screen protector");
    expect(catalogEntryByKey(" wall-charger ")?.key).toBe("wall-charger");
    for (const key of ["", "nope", "Screen-Protector", "__proto__", "constructor", "/images/catalog/mouse.webp", null, undefined]) expect(catalogEntryByKey(key as string)).toBeNull();
  });
});

describe("bestDeviceEntry (the repair card's asset type and model)", () => {
  it.each([
    ["Laptop Dell XPS 13 9310", "laptop"],
    ["Galaxy Watch 6", "smartwatch"],
    ["Galaxy S23", "phone"],
    ["Galaxy Tab S8", "tablet"],
    ["Computer Custom Build Ryzen 5600 / RTX 3060", "desktop-computer"],
    ["Drone DJI Mavic", "drone"],
    ["Nintendo Switch", "handheld-console"],
    ["Steam Deck", "handheld-console"],
    ["Gaming PC", "desktop-computer"],
    ["Game console PlayStation 5", "game-console"],
    ["TV Samsung 55 inch", "television"],
    ["Phone iPhone 14 Pro", "phone"],
    ["Tablet iPad Air", "tablet"],
    ["Watch Apple Watch SE", "smartwatch"],
    ["Dell Inspiron 15", "laptop"],
    ["AirPods Pro", "earbuds"],
    ["Sony headphones", "headphones"],
    ["Nikon DSLR", "camera"],
  ])("%s -> %s", (text, key) => {
    expect(bestDeviceEntry(text)?.key).toBe(key);
  });

  it("never returns a part or an accessory, and nothing for an unknown device", () => {
    expect(bestDeviceEntry("Other")).toBeNull();
    expect(bestDeviceEntry("")).toBeNull();
    expect(bestDeviceEntry("Tempered glass")).toBeNull();
    for (const text of ["iPhone battery", "Laptop charger", "Samsung TV remote"]) expect(bestDeviceEntry(text)?.group).toBe("Devices");
  });
});

describe("catalogSearch (the picker's search box)", () => {
  const keys = (query: string, limit?: number) => catalogSearch(query, limit).map((entry) => entry.key);

  it("returns nothing for an empty box", () => {
    expect(catalogSearch("")).toEqual([]);
    expect(catalogSearch("   ")).toEqual([]);
    expect(catalogSearch("---")).toEqual([]);
  });

  it("finds by the first letters of a word, label hits first", () => {
    const found = keys("protec", 8);
    expect(found[0]).toBe("clear-case"); // "Protective case" starts with it
    expect(found.slice(1, 5).sort()).toEqual(["camera-lens-protector", "privacy-screen-protector", "screen-protector", "surge-protector"]);
    expect(keys("lapt")[0]).toBe("laptop");
    expect(keys("wall ch")[0]).toBe("wall-charger");
  });

  it("finds by any keyword, not only the label", () => {
    expect(keys("tempered")[0]).toBe("screen-protector");
    expect(keys("glass guard")[0]).toBe("screen-protector");
    expect(keys("folder")).toContain("display-assembly");
    expect(keys("spike guard")[0]).toBe("surge-protector");
    expect(keys("pendrive")[0]).toBe("usb-flash-drive");
  });

  it("finds in the middle of a word and with plurals", () => {
    expect(keys("scopes")).toContain("microscope");
    expect(keys("chargers")).toContain("charger");
    expect(keys("batteries")).toContain("phone-battery");
  });

  it("puts a label hit above a keyword-only hit", () => {
    const found = catalogSearch("charging station");
    expect(found[0].key).toBe("charging-station");
    const labelHits = found.filter((entry) => entry.label.toLowerCase().includes("charging station")).length;
    expect(found.slice(0, labelHits).every((entry) => entry.label.toLowerCase().includes("charging station"))).toBe(true);
  });

  it("still helps with a typo", () => {
    expect(keys("chargar")).toContain("charger");
    expect(keys("scren gaurd")).toContain("screen-protector");
  });

  it("honours the limit and never repeats an entry", () => {
    expect(keys("cable", 3)).toHaveLength(3);
    const all = keys("a", 500);
    expect(new Set(all).size).toBe(all.length);
    expect(catalogSearch("zzzzzzzz")).toEqual([]);
  });
});

describe("CATALOG_GROUPS (the picker's tabs)", () => {
  it("lists every group once, in tab order, with its count", () => {
    expect(CATALOG_GROUPS.map((group) => group.name)).toEqual([
      "Devices", "Screen & body protection", "Chargers, cables & power", "Audio", "Phone & tablet parts", "Storage & memory", "Laptop & computer parts",
      "Game consoles & gaming", "TV & video", "Drones", "Watches & wearables", "Tools & supplies", "Accessories & extras", "Repair services",
    ]);
    for (const group of CATALOG_GROUPS) expect(group.count, group.name).toBe(CATALOG.filter((entry) => entry.group === group.name).length);
    expect(CATALOG_GROUPS.reduce((sum, group) => sum + group.count, 0)).toBe(CATALOG.length);
  });
});

// ---------------------------------------------------------------------------------------------
// The data itself
// ---------------------------------------------------------------------------------------------

/** The 37 pictures that were in public/images/products before the catalog. They keep their paths. */
const LEGACY_KEYS = [
  "analog-stick", "back-glass", "camera-module", "camera", "charger", "charging-port", "circuit-board", "clear-case", "console-cooling-fan", "desktop-computer", "display-assembly",
  "drone-battery", "drone-camera-gimbal", "drone-controller", "drone-motor", "drone-propellers", "drone", "earbuds", "earpiece-speaker", "game-console", "game-controller",
  "handheld-console", "hdmi-port", "headphones", "laptop", "phone-battery", "phone", "repair-tools", "screen-protector", "smartwatch", "tablet", "television",
  "tv-backlight-strips", "tv-main-board", "tv-power-board", "tv-remote", "usb-c-cable",
];

const DEVICE_KEYS = ["phone", "tablet", "laptop", "desktop-computer", "television", "game-console", "handheld-console", "drone", "smartwatch", "headphones", "earbuds", "camera"];

/** Words two pictures of the same tier share ON PURPOSE: the name is ambiguous, so it gets no picture unless a device says which. */
const SHARED_ON_PURPOSE: Record<string, string[]> = {
  speaker: ["bluetooth-speaker", "earpiece-speaker"],
  mic: ["mic-flex", "microphone"],
  motherboard: ["circuit-board", "motherboard"],
  "board mother": ["circuit-board", "motherboard"],
};

/**
 * Keywords that do not resolve to their own picture, on purpose: a plain accessory wins a word it shares with a part
 * made for one device ("speaker", "mic"), a bare "motherboard" is a phone's or a PC's, and "earphone" is a wired one.
 */
const NOT_SELF_RESOLVING = new Set([
  "earpiece-speaker:speaker", "mic-flex:mic",
  "circuit-board:motherboard", "circuit-board:mother board", "motherboard:motherboard", "motherboard:mother board",
  "earbuds:earphone", "earbuds:ear phone",
]);

const sortedWords = (text: string) => normalize(text).split(" ").sort().join(" ");

describe("catalog data", () => {
  it("has one entry for each of the 37 existing pictures and the 131 new ones", () => {
    const old = CATALOG.filter((entry) => entry.image.startsWith("/images/products/"));
    const added = CATALOG.filter((entry) => entry.image.startsWith("/images/catalog/"));
    expect(old.map((entry) => entry.key).sort()).toEqual([...LEGACY_KEYS].sort());
    expect(added.length).toBeGreaterThanOrEqual(131);
    expect(old.length + added.length).toBe(CATALOG.length);
  });

  it("has unique keys, and every image is /images/<folder>/<key>.webp", () => {
    expect(new Set(CATALOG.map((entry) => entry.key)).size).toBe(CATALOG.length);
    for (const entry of CATALOG) {
      expect(entry.key, entry.key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.image, entry.key).toBe(`${LEGACY_KEYS.includes(entry.key) ? "/images/products" : "/images/catalog"}/${entry.key}.webp`);
      expect(entry.label.trim(), entry.key).not.toBe("");
    }
  });

  it("gives every entry 6 or more clean keywords", () => {
    for (const entry of CATALOG) {
      expect(entry.keywords.length, entry.key).toBeGreaterThanOrEqual(6);
      const seen = new Set<string>();
      for (const keyword of entry.keywords) {
        expect(keyword, `${entry.key}: ${keyword}`).toBe(keyword.trim().toLowerCase());
        expect(normalize(keyword), `${entry.key}: ${keyword}`).not.toBe("");
        expect(seen.has(normalize(keyword)), `${entry.key}: duplicate ${keyword}`).toBe(false);
        seen.add(normalize(keyword));
      }
      for (const word of [...(entry.excludes ?? []), ...(entry.devices ?? [])]) expect(word, entry.key).toBe(word.trim().toLowerCase());
    }
  });

  it("puts the whole devices, and only those, in tier 1 and the Devices group", () => {
    expect(CATALOG.filter((entry) => entry.group === "Devices").map((entry) => entry.key)).toEqual(DEVICE_KEYS);
    for (const entry of CATALOG) expect(entry.tier === 1, entry.key).toBe(entry.group === "Devices");
    expect(CATALOG.filter((entry) => entry.tier === 2).map((entry) => entry.key).sort()).toEqual(["charger", "clear-case", "repair-tools"]);
    for (const entry of CATALOG) expect([1, 2, 3], entry.key).toContain(entry.tier);
  });

  it("has no empty group", () => {
    const groups = new Map<string, number>();
    for (const entry of CATALOG) groups.set(entry.group, (groups.get(entry.group) ?? 0) + 1);
    expect(groups.size).toBe(14);
    for (const [group, count] of groups) expect(count, group).toBeGreaterThan(0);
  });

  it("only names device families that exist", () => {
    const families = new Set(CATALOG.filter((entry) => entry.group === "Devices").flatMap((entry) => entry.devices ?? []));
    expect(families.size).toBe(DEVICE_KEYS.length);
    for (const entry of CATALOG) for (const family of entry.devices ?? []) expect(families.has(family), `${entry.key}: ${family}`).toBe(true);
  });

  it("shares no keyword between two entries of the same tier, except on purpose", () => {
    const owners = new Map<string, Set<string>>();
    for (const entry of CATALOG) for (const keyword of entry.keywords) {
      const id = `${entry.tier}|${sortedWords(keyword)}`;
      owners.set(id, (owners.get(id) ?? new Set()).add(entry.key));
    }
    const shared: Record<string, string[]> = {};
    for (const [id, keys] of owners) if (keys.size > 1) shared[id.slice(2)] = [...keys].sort();
    expect(shared).toEqual(SHARED_ON_PURPOSE);
  });

  it("keeps every word of a keyword that has more than one: little words may go, but not all the others", () => {
    // "in cell" once became the bare word "cell" and made every cell in the shop a display.
    const little = new Set(["a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on", "by", "at", "from"]);
    for (const entry of CATALOG) {
      for (const keyword of entry.keywords) {
        const words = normalize(keyword).split(" ");
        const kept = words.filter((word) => !little.has(word));
        if (words.length > 1) expect(kept.length, `${entry.key}: ${keyword}`).toBeGreaterThan(1);
      }
    }
  });

  it("finds each picture by its own label", () => {
    const ambiguous = new Set(["motherboard"]);
    for (const entry of CATALOG) if (!ambiguous.has(entry.key)) expect(pick(entry.label), entry.label).toBe(entry.key);
  });

  it("finds each picture by each of its own keywords (bar the ones shared on purpose)", () => {
    for (const entry of CATALOG) {
      for (const keyword of entry.keywords) {
        if (NOT_SELF_RESOLVING.has(`${entry.key}:${keyword}`)) continue;
        expect(pick(keyword), `${entry.key}: ${keyword}`).toBe(entry.key);
      }
    }
    // The list above stays honest: each of its words really goes elsewhere.
    for (const id of NOT_SELF_RESOLVING) {
      const [key, keyword] = id.split(":");
      expect(catalogEntryByKey(key)?.keywords, id).toContain(keyword);
      expect(pick(keyword), id).not.toBe(key);
    }
  });
});

describe("speed", () => {
  it("matches 5,000 products in well under 1.5 seconds", () => {
    const items = ["tempered glass", "back cover", "usb c cable", "battery", "charger", "laptop battery", "led tv remote", "screen assembly", "wireles mouse", "tmpered glas", "hdmi cabel", "mystery gadget", "gift card", "iphone", "playstation controller"];
    const brands = ["Samsung", "Apple", "Redmi", "Vivo", "Oppo", "Dell", "HP", "Lenovo", "Sony", "LG"];
    const names = Array.from({ length: 5000 }, (_, i) => `${brands[i % brands.length]} ${items[i % items.length]} model ${i} ${i % 7 ? "pro" : "max"}`);
    const started = performance.now();
    let found = 0;
    for (const [i, name] of names.entries()) if (bestCatalogMatch({ name, category: i % 3 ? "Accessories" : null })) found++;
    const elapsed = performance.now() - started;
    expect(found).toBeGreaterThan(3000);
    expect(elapsed).toBeLessThan(1500);
  });
});

describe("picture files", () => {
  const exists = (image: string) => existsSync(path.join(process.cwd(), "public", image));

  it("has the 37 existing pictures on disk", () => {
    for (const entry of CATALOG.filter((item) => item.image.startsWith("/images/products/"))) expect(exists(entry.image), entry.image).toBe(true);
  });

  // The new pictures are generated separately: run `CHECK_CATALOG_IMAGES=1 npx vitest run tests/catalog-match.test.ts` once they have landed.
  it.skipIf(!process.env.CHECK_CATALOG_IMAGES)("has every picture in the catalog on disk under public/", () => {
    expect(CATALOG.filter((entry) => !exists(entry.image)).map((entry) => entry.image)).toEqual([]);
  });
});
