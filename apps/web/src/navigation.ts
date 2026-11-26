import type { IconName } from './components/UIIcon';
export type NavItem={to:string;label:string;fullLabel:string;description:string;icon:IconName;group:'work'|'dispatch'|'system';quick?:boolean;dispatcher?:boolean};
export const navigation:readonly NavItem[]=[
 {to:'/',label:'Arbeit',fullLabel:'Meine Arbeit',description:'Eigene und zugewiesene Aufträge',icon:'work',group:'work',quick:true},
 {to:'/tickets',label:'Tickets',fullLabel:'Ticket-Browser',description:'Aufträge suchen und bearbeiten',icon:'tickets',group:'work',quick:true},
 {to:'/green',label:'Grünpflege',fullLabel:'Grünpflege',description:'Kolonne und Einsatz erfassen',icon:'leaf',group:'work',quick:true},
 {to:'/green/mine',label:'Meine Kolonne',fullLabel:'Meine Kolonne',description:'Laufende Einsätze und neue Aufträge',icon:'users',group:'work'},
 {to:'/rapport/book',label:'Rapporte',fullLabel:'Tagesrapporte',description:'Arbeitszeiten und Leistungen',icon:'clock',group:'work',quick:true},
 {to:'/map',label:'Karte',fullLabel:'Auftragskarte',description:'Aufträge auf der Karte',icon:'map',group:'work'},
 {to:'/green/crews',label:'Kolonnen',fullLabel:'Kolonnenübersicht',description:'Einsätze koordinieren und abschließen',icon:'users',group:'dispatch',dispatcher:true},
 {to:'/rapport/review',label:'Abnahme',fullLabel:'Rapportabnahme',description:'Rapporte prüfen und bearbeiten',icon:'check-circle',group:'dispatch',dispatcher:true},
 {to:'/sync',label:'Sync',fullLabel:'Synchronisation',description:'Lokale Änderungen und Konflikte',icon:'sync',group:'system'},
 {to:'/settings',label:'Einstellungen',fullLabel:'Einstellungen',description:'Konto und Anwendung',icon:'settings',group:'system'},
];
export function visibleNavigation(dispatcher:boolean){return navigation.filter(item=>!item.dispatcher||dispatcher);}
export function activeNavigation(path:string,items:readonly NavItem[]):NavItem|undefined{
 const matches=items.filter(item=>item.to==='/'?path==='/'||path.startsWith('/issues/'):item.to==='/rapport/book'?path==='/rapport'||path===item.to||path.startsWith(item.to+'/'):item.to==='/green'?path===item.to:path===item.to||path.startsWith(item.to+'/'));
 return matches.sort((a,b)=>b.to.length-a.to.length)[0];
}
export const navigationGroups=[{id:'work',title:'Arbeit & Einsätze'},{id:'dispatch',title:'Disposition'},{id:'system',title:'Anwendung'}] as const;
