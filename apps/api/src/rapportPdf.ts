// A4 landscape, native PDF syntax, standard WinAnsi font; no extra service.
type Row={sharedResources?:import('./resourceNotes.js').ResourceUsage[];greenEventId?:number;sources?:{id:number;subject:string;municipalities?:string[]}[];start:string;end:string;kind:string;activity:string;order:string;machines:{name:string;minutes:number}[];materials:{name:string;quantity:number;unit:string}[]};
type Input={correction?:{reportId:number;reason:string};date:string;owner:{name:string};state:string;lines:Row[];material:string;submitted?:{by:{name:string};at:string};reviewed?:{by:{name:string};at:string}};
const fmt=(n:number)=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
const fullStamp=(s:string|undefined)=>s?new Date(s).toLocaleString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const local=(s:string)=>new Date(s).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'});
const escape=(s:string)=>Array.from(s).map(c=>{const n=c.charCodeAt(0);return n>=32&&n<=255?'\\'+n.toString(8).padStart(3,'0'):'?';}).join('');
const wrap=(s:string,n:number)=>{const text=s.replace(/\s+/g,' ');const result:string[]=[];for(let i=0;i<text.length;i+=n)result.push(text.slice(i,i+n));return result.length?result:[''];};
function reportPages(d:Input):string[] {
  const rows=d.lines.flatMap(l=>{const cells=[d.date.split('-').reverse().join('.'),local(l.start),local(l.end),fmt(Math.round((Date.parse(l.end)-Date.parse(l.start))/60000)),l.kind==='pause'?'Pause':l.activity+(l.greenEventId?' · Einsatz #'+l.greenEventId:'')+(l.sources?.length?' — '+l.sources.map(s=>s.subject+(s.municipalities?.length?' ('+s.municipalities.join(', ')+')':'')).join('; '):''),[...l.machines.map(m=>m.name),...(l.sharedResources??[]).filter(m=>m.kind==='machine').map(m=>m.name+' (gemeinsam)')].join('; '),[...l.machines.map(m=>fmt(m.minutes)),...(l.sharedResources??[]).filter(m=>m.kind==='machine').map(m=>fmt(m.quantity))].join('; '),[l.order,...(l.sources??[]).map(s=>'#'+s.id)].filter(Boolean).join(', ')];const wrapped=cells.map((c,i)=>wrap(c,[12,8,8,8,48,14,9,12][i]!));const count=Math.max(...wrapped.map(c=>c.length));return Array.from({length:Math.ceil(count/4)},(_,p)=>wrapped.map(c=>c.slice(p*4,p*4+4)));});
  const material=[d.material,...d.lines.flatMap(l=>[...l.materials.map(m=>m.name+' '+m.quantity+' '+m.unit),...(l.sharedResources??[]).filter(m=>m.kind!=='machine').map(m=>m.name+' '+m.quantity+' '+m.unit+' (gemeinsam, Einsatz #'+l.greenEventId+')')])].filter(Boolean).join('; ');
  const materialLines=wrap(material,125);const pages:string[]=[];
  const total=Math.max(1,Math.ceil(rows.length/7),Math.ceil(materialLines.length/3));
  for(let p=0;p<total;p++){
    let stream='';const text=(x:number,y:number,s:string,size=10,bold=false)=>{stream+='BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+y+' Tm ('+escape(s)+') Tj ET\n';};const line=(x:number,y:number,x2:number,y2:number)=>{stream+=x+' '+y+' m '+x2+' '+y2+' l S\n';};
    text(35,560,'Verbandsgemeinde Otterbach-Otterberg',13,true);text(35,534,'Rapportzettel',18,true);text(420,535,'Arbeitnehmer bzw. Leistender: '+d.owner.name,11,true);text(35,516,d.state==='closed'?'Abgeschlossen'+(d.correction?' · Korrektur zu #'+d.correction.reportId:''):'ENTWURF / '+({draft:'Entwurf',submitted:'Eingereicht',review:'In Prüfung',returned:'Zurückgegeben'} as Record<string,string>)[d.state],10,true);
    const xs=[35,105,153,201,253,550,650,710,807];const top=505,head=475,bottom=153;
    for(const x of xs)line(x,x===153||x===201?491:top,x,bottom);line(xs[0]!,top,xs[8]!,top);line(xs[0]!,head,xs[8]!,head);
    text(155,496,'Arbeitszeit',9,true);['Datum','von','bis','Stunden','Art der Leistung','Maschinen','Stunden','Auftrag Nr.'].forEach((v,i)=>text(xs[i]!+4,482,v,9,true));text(554,496,'Einsatz',9,true);
    for(let i=0;i<7;i++){const y=head-i*46;line(35,y-46,807,y-46);const row=rows[p*7+i];if(row)row.forEach((cell,j)=>cell.forEach((v,k)=>text(xs[j]!+4,y-12-k*10,v,8)));}
    text(35,136,'Materialverbrauch:',10,true);materialLines.slice(p*3,p*3+3).forEach((s,i)=>text(135,136-i*11,s,9));
    const sum=d.lines.filter(l=>l.kind==='work').reduce((n,l)=>n+Math.round((Date.parse(l.end)-Date.parse(l.start))/60000),0);
    text(35,92,'Gesamtarbeitszeit: '+fmt(sum)+' h',11,true);text(35,62,'Datum: '+d.date.split('-').reverse().join('.'),10);text(300,62,'Geprüft: '+(d.reviewed?.by.name??'—'),10);text(555,62,'Eingereicht: '+(d.submitted?.by.name??'—'),10);text(300,47,fullStamp(d.reviewed?.at),8);text(555,47,fullStamp(d.submitted?.at),8);line(295,43,525,43);line(550,43,807,43);text(295,32,'(Prüfer / Disponent)',8);text(550,32,'(Ausführender / Arbeitnehmer)',8);text(35,25,'DerKumpel · Seite '+(p+1)+' / '+total,8);pages.push(stream);
  }
  return pages;
}
export function rapportPdf(d:Input):Buffer{return rapportPdfMany([d]);}
export function rapportPdfMany(reports:Input[]):Buffer {
  const pages=reports.flatMap(reportPages);
  const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const ids:number[]=[];for(const stream of pages){const id=objects.length+1;ids.push(id);objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(id+1)+' 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream');}objects[1]='<< /Type /Pages /Kids ['+ids.map(i=>i+' 0 R').join(' ')+'] /Count '+ids.length+' >>';
  let out='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const xref=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return Buffer.from(out);
}
