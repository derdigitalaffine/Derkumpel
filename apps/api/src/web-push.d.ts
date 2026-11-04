declare module 'web-push' {
  export type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(subscription: Subscription, payload: string, options?: { TTL?: number; urgency?: 'normal' | 'low' | 'high'; timeout?: number }): Promise<unknown>;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
  };
  export default webpush;
}
