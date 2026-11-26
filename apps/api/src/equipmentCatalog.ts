export const equipmentSubject='DK Arbeitsgerätekatalog';
export const equipmentTemplate='# DERKUMPEL-EQUIPMENT/1\n# Je Zeile ein Arbeitsgerät. Beispiel (wird ignoriert):\n# Freischneider\n';
export const equipmentKey=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('de');
export function equipmentNames(description:string):string[]{
 const seen=new Set<string>(),names:string[]=[];
 for(const raw of description.split(/\r\n|\r|\n/)){const name=raw.trim();if(!name||name.startsWith('#')||name.length>200)continue;const key=equipmentKey(name);if(!seen.has(key)){seen.add(key);names.push(name);}}
 return names;
}
export function equipmentAdditions(existing:string[],incoming:string[]):string[]{
 const seen=new Set(existing.map(equipmentKey));const added:string[]=[];
 for(const raw of incoming){const name=raw.trim().replace(/\s+/g,' ');const key=equipmentKey(name);if(name&&!seen.has(key)){seen.add(key);added.push(name);}}
 return added;
}
