export type MaterialItem={code:string;name:string;unit:string;category:string;price?:number;kind?:'machine'|'material'};
export const materialSubject='DK Materialkatalog';
export const materialTemplate='# DERKUMPEL-MATERIAL/1\n# Kennung | Bezeichnung | Einheit | Kategorie | Einzelpreis EUR (optional) | Typ (Material/Maschine)\n# MUSTER | Streusalz | kg | Winterdienst | 0,25 | Material\n# MUSTER | Freischneider | min | Grünpflege | | Maschine\n# Musterzeile kopieren, führendes # entfernen und Werte anpassen.\n';
export function parseMaterials(text:string):{items:MaterialItem[];warnings:string[]}{
  const items:MaterialItem[]=[],warnings:string[]=[],seen=new Set<string>();
  for(const [index,raw] of text.split(/\r\n|\r|\n/).entries()){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const cols=line.split('|').map(v=>v.trim());const [code,name,unit,category='',price='',type='']=cols;const kind=type.toLocaleLowerCase('de');
    if(code?.toUpperCase()==='MUSTER')continue;
    if(cols.length<3||cols.length>6||!['','material','maschine','machine'].includes(kind)||!code||!name||!unit||!/^[a-zA-Z0-9_-]{1,60}$/.test(code)||name.length>200||unit.length>40||category.length>100||seen.has(code.toLowerCase())||(price!==''&&(!/^\d+(?:[.,]\d{1,4})?$/.test(price)||!Number.isFinite(Number(price.replace(',','.')))))){warnings.push('Zeile '+(index+1)+': ungültig oder doppelte Kennung');continue;}
    seen.add(code.toLowerCase());items.push({code,name,unit,category,...(price?{price:Number(price.replace(',','.'))}:{}),...(['maschine','machine'].includes(kind)?{kind:'machine' as const}:{})});
  }return {items,warnings};
}
export function materialRow(item:MaterialItem):string{return [item.code,item.name,item.unit,item.category,item.price===undefined?'':String(item.price),...(item.kind==='machine'?['Maschine']:[])].join(' | ');}

/** Change only the selected row, preserving comments and unrelated data. */
export function classifyMaterial(description:string,code:string,kind:'machine'|'material'):string{
 return description.split(/(\r\n|\r|\n)/).map(line=>{
   if(line.trim().startsWith('#')||line.split('|')[0]?.trim().toLowerCase()!==code.toLowerCase())return line;
   const cols=line.split('|').map(v=>v.trim());while(cols.length<5)cols.push('');
   cols[5]=kind==='machine'?'Maschine':'Material';return cols.join(' | ');
 }).join('');
}
