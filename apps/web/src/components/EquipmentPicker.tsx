import {Autocomplete,Text} from '@mantine/core';
import {equipmentOptions,type Catalog} from '../rapportBook';
const fold=(s:string)=>s.toLocaleLowerCase('de').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').normalize('NFD').replace(/\p{Diacritic}/gu,'');
export function EquipmentPicker({value,onChange,catalog,recent=[],disabled=false}:{value:string;onChange:(name:string)=>void;catalog:Catalog;recent?:string[];disabled?:boolean}){
 const options=equipmentOptions(catalog,recent);
 const known=options.some(n=>fold(n.trim())===fold(value.trim()));
 return <><Autocomplete label="Arbeitsgerät / Maschine" placeholder="Suchen oder neu eingeben" data={options} value={value} onChange={onChange} disabled={disabled} maxLength={200} limit={12} filter={({options,search,limit})=>{const words=fold(search.trim()).split(/\s+/);return options.filter(o=>'label' in o&&words.every(w=>fold(o.label).includes(w))).slice(0,limit);}}/><Text size="xs" c="dimmed">{!disabled&&value.trim()&&!known?'Neues Gerät – wird beim Speichern in Redmine ergänzt.':'Katalog durchsuchen oder eigene Bezeichnung eingeben.'}</Text></>;
}
