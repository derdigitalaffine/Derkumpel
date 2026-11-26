import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pushPayload} from './push.js';
const origin='https://app.example.test';
const script=readFileSync(new URL('../../web/public/push-sw.js',import.meta.url),'utf8');
const event={event_id:'green-assignment-123',issue_id:123,kind:'assignment' as const,user_ids:[7]};
type Handler=(event:any)=>void;
function worker(windows:any[]=[],opened:any=null){
 const listeners:Record<string,Handler>={},showNotification=vi.fn(async()=>{}),openWindow=vi.fn(async(_url:string)=>opened);
 runInNewContext(script,{URL,self:{location:{origin},registration:{showNotification},clients:{matchAll:async()=>windows,openWindow},addEventListener:(name:string,fn:Handler)=>{listeners[name]=fn;}}});
 const click=async(data:any,body='',tag='')=>{let task:Promise<unknown>|undefined;const close=vi.fn();listeners.notificationclick!({notification:{data,body,tag,close},waitUntil:(p:Promise<unknown>)=>{task=p;}});await task;expect(close).toHaveBeenCalledOnce();};
 const push=async(payload:any)=>{let task:Promise<unknown>|undefined;listeners.push!({data:{json:()=>payload},waitUntil:(p:Promise<unknown>)=>{task=p;}});await task;return showNotification.mock.calls[0] as unknown as [string,{data:any;body:string;tag:string}];};
 return {click,push,openWindow};
}
describe('notification click routing',()=>{
 it('opens the explicit order on cold launch',async()=>{const w=worker(),[,notification]=await w.push(pushPayload(event,true));expect(notification.data.url).toBe('/green/mine?order=123');await w.click(notification.data,notification.body,notification.tag);expect(w.openWindow).toHaveBeenCalledWith(origin+'/green/mine?order=123');});
 it('recovers an old worker fallback URL using the existing notification text and tag',async()=>{const w=worker();await w.click({url:'/'},'Neuer Auftrag für die Kolonne','issue-123');expect(w.openWindow).toHaveBeenCalledWith(origin+'/green/mine?order=123');});
 it('focuses the returned navigated client rather than the stale original',async()=>{const destination=origin+'/green/mine?order=123',focus=vi.fn(async()=>{}),oldFocus=vi.fn(async()=>{}),navigate=vi.fn(async()=>({url:destination,focus}));const w=worker([{url:origin+'/',navigate,focus:oldFocus}]);await w.click({url:'/green/mine?order=123'});expect(navigate).toHaveBeenCalledWith(destination);expect(focus).toHaveBeenCalledOnce();expect(oldFocus).not.toHaveBeenCalled();expect(w.openWindow).not.toHaveBeenCalled();});
 it('opens a fresh window if an existing window throws or returns null',async()=>{const w=worker([{url:origin+'/',navigate:vi.fn(async()=>{throw Error('closed');})},{url:origin+'/green',navigate:vi.fn(async()=>null)}]);await w.click({url:'/green/mine?order=123'});expect(w.openWindow).toHaveBeenCalledWith(origin+'/green/mine?order=123');});
 it('preserves normal tickets and rejects arbitrary routes',async()=>{const a=worker();await a.click({url:'/issues/123'});expect(a.openWindow).toHaveBeenCalledWith(origin+'/issues/123');const b=worker();await b.click({url:'https://evil.example/green/mine?order=123'});expect(b.openWindow).toHaveBeenCalledWith(origin+'/');});
});
