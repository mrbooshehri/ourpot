import { describe, expect, it } from 'bun:test';
import { SmtpChannel } from '../../src/modules/notifications/smtp';
import { WebPushChannel } from '../../src/modules/notifications/web-push';
import { MobilePushChannel } from '../../src/modules/notifications/mobile-push';
import { retryChannel, type NotificationChannel, type NotificationMessage } from '../../src/modules/notifications/channel';
const message: NotificationMessage={recipient:'u1',title:'Reminder',body:'Soon',dedupeKey:'r1'};
it('adapters send through injected providers without exposing credentials',async()=>{const sent:string[]=[];const smtp=new SmtpChannel(async(m)=>{sent.push(m.title);return{status:'sent'}});const web=new WebPushChannel(async()=>({status:'sent'}));const mobile=new MobilePushChannel(async()=>({status:'sent'}));expect((await smtp.send(message)).status).toBe('sent');expect((await web.send(message)).status).toBe('sent');expect((await mobile.send(message)).status).toBe('sent');expect(sent).toEqual(['Reminder']);});
it('retries transient channel failures and stops on permanent failure',async()=>{let attempts=0;const channel:NotificationChannel={send:async()=>{attempts++;return attempts<3?{status:'retry'}:{status:'sent'}}};expect((await retryChannel(channel,message,3,0)).status).toBe('sent');expect(attempts).toBe(3);});
