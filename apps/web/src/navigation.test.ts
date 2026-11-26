import {describe,it,expect} from 'vitest';
import {activeNavigation,visibleNavigation,navigationGroups} from './navigation';
describe('responsive navigation',()=>{
 it('limits the bottom dock to four stable destinations plus More',()=>{for(const dispatcher of [false,true])expect(visibleNavigation(dispatcher).filter(x=>x.quick).map(x=>x.to)).toEqual(['/','/tickets','/green','/rapport/book']);});
 it('exposes all destinations in grouped menu without duplicates',()=>{const all=visibleNavigation(true);expect(all).toHaveLength(10);expect(new Set(all.map(x=>x.to)).size).toBe(all.length);expect(navigationGroups.flatMap(g=>all.filter(x=>x.group===g.id))).toHaveLength(all.length);expect(visibleNavigation(false).some(x=>x.dispatcher)).toBe(false);});
 it('matches nested and legacy routes without activating multiple tabs',()=>{const all=visibleNavigation(true);for(const [path,to] of [['/green/mine','/green/mine'],['/green/crews','/green/crews'],['/green','/green'],['/rapport','/rapport/book'],['/rapport/review','/rapport/review'],['/issues/123','/'],['/tickets','/tickets'],['/settings','/settings']])expect(activeNavigation(path!,all)?.to).toBe(to);expect(activeNavigation('/green/mine',all)?.quick).toBeUndefined();expect(activeNavigation('/green/crews',visibleNavigation(false))).toBeUndefined();});
});
