import {Group,Select,TextInput} from '@mantine/core';
import {useEffect,useState} from 'react';
import {displayDate,parseDisplayDate,quarterOptions} from '../rapportBook';
export function GermanDateField({value,onChange,label='Datum',disabled=false}:{value:string;onChange:(iso:string)=>void;label?:string;disabled?:boolean}){
  const [raw,setRaw]=useState(displayDate(value)),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setRaw(displayDate(value));setInvalid(false);},[value]);
  const commit=()=>{const iso=parseDisplayDate(raw);if(!iso){setInvalid(true);return;}setInvalid(false);if(iso!==value)onChange(iso);};
  return <TextInput label={label} value={raw} disabled={disabled} placeholder="TT.MM.JJJJ" aria-label={label+' (TT.MM.JJJJ)'} size="md" maxLength={10} error={invalid?'Gültiges Datum als TT.MM.JJJJ eingeben':undefined} onChange={e=>{setRaw(e.currentTarget.value);setInvalid(false);}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>;
}
export function GermanDateTimeField({value,onChange,label,disabled=false}:{value:string;onChange:(local:string)=>void;label:string;disabled?:boolean}){
  const date=value.slice(0,10),time=value.slice(11);
  return <Group grow align="start" wrap="wrap"><GermanDateField value={date} label={label+' – Datum'} disabled={disabled} onChange={iso=>onChange(iso+'T'+(time||'07:00'))}/><QuarterTimeField label={label+' – Uhrzeit'} value={time} disabled={disabled} onChange={t=>onChange(date+'T'+t)}/></Group>;
}

export function QuarterTimeField({value,onChange,label='Uhrzeit',disabled=false,error}:{value:string;onChange:(time:string)=>void;label?:string;disabled?:boolean;error?:string}){
  return <Select size="md" label={label} value={value||null} data={quarterOptions(value)} searchable allowDeselect={false} disabled={disabled} error={error} onChange={v=>{if(v)onChange(v);}}/>;
}
