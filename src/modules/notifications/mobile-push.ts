import type { NotificationChannel, NotificationMessage, DeliveryResult } from './channel';
export class MobilePushChannel implements NotificationChannel { constructor(private readonly provider:(message:NotificationMessage)=>Promise<DeliveryResult>){ } send(message:NotificationMessage){return this.provider(message)} }
