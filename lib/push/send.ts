import webpush from "web-push";
export async function sendPush(subscription: {endpoint: string; p256dh: string; auth: string}, keys: {publicKey: string; privateKey: string}, payload: {title: string; body: string; url: string}) {
 return webpush.sendNotification({endpoint: subscription.endpoint, keys: {p256dh: subscription.p256dh, auth: subscription.auth}}, JSON.stringify(payload), {TTL: 3600, timeout: 10_000, vapidDetails: {subject: "https://repairshelper.com", publicKey: keys.publicKey, privateKey: keys.privateKey}});
}
