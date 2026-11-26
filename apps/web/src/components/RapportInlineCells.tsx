import {Button,Group,NumberInput,Popover,Select,Stack,Text,TextInput,Textarea,UnstyledButton} from '@mantine/core';
import {useState,useRef,type ReactNode,type KeyboardEvent} from 'react';
import {EquipmentPicker} from './EquipmentPicker';
import {formatDuration} from '../rapport';
import {fromInputTime,inputTime,quarterOptions,lineMinutes,displayDate,type RapportLine,type Catalog} from '../rapportBook';
function Trigger({label,children,disabled,onClick}:{label:string;children:ReactNode;disabled:boolean;onClick:()=>void}){
  return disabled?<span>{children}</span>:<UnstyledButton type="button" className="rapport-inline-trigger" aria-label={label} onClick={onClick}>{children}</UnstyledButton>;
}
export function InlineText({value,label,disabled,onChange,multiline=false}:{value:string;label:string;disabled:boolean;onChange:(v:string)=>void;multiline?:boolean}){
  const [active,setActive]=useState(false),[raw,setRaw]=useState(value);
  const cancelled=useRef(false);
  const commit=()=>{setActive(false);if(!cancelled.current&&raw!==value)onChange(raw);};
  if(!active||disabled)return <Trigger label={label+' bearbeiten'} disabled={disabled} onClick={()=>{cancelled.current=false;setRaw(value);setActive(true);}}>{value||'–'}</Trigger>;
  const key=(e:KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>)=>{if(e.key==='Escape'){e.preventDefault();cancelled.current=true;setActive(false);}else if(e.key==='Enter'&&(!multiline||!e.shiftKey)){e.preventDefault();e.currentTarget.blur();}};
  return multiline?<Textarea autoFocus autosize minRows={2} aria-label={label} value={raw} onChange={e=>setRaw(e.currentTarget.value)} onBlur={commit} onKeyDown={key}/>:<TextInput autoFocus aria-label={label} value={raw} onChange={e=>setRaw(e.currentTarget.value)} onBlur={commit} onKeyDown={key}/>;
}
export function InlineTime({value,label,disabled,onChange,onError}:{value:string;label:string;disabled:boolean;onChange:(v:string)=>void;onError:(s:string)=>void}){
  const [active,setActive]=useState(false);const local=inputTime(value),clock=local.slice(11);
  if(!active||disabled)return <Trigger label={label+' bearbeiten'} disabled={disabled} onClick={()=>setActive(true)}>{clock||'–'}</Trigger>;
  return <Select autoFocus searchable defaultDropdownOpened aria-label={label} value={clock||null} data={quarterOptions(clock)} allowDeselect={false} onDropdownClose={()=>setActive(false)} onChange={v=>{if(v){const next=fromInputTime(local.slice(0,10)+'T'+v,value);if(next)onChange(next);else onError('Ungültige oder mehrdeutige Uhrzeit am '+displayDate(local.slice(0,10)));}setActive(false);}}/>;
}
export function InlineDuration({line,disabled,onChange}:{line:RapportLine;disabled:boolean;onChange:(v:string)=>void}){
  const [active,setActive]=useState(false);const mins=lineMinutes(line),value=String(mins),data=Array.from({length:96},(_,i)=>({value:String((i+1)*15),label:formatDuration((i+1)*15)+' h'}));
  if(!data.some(x=>x.value===value))data.unshift({value,label:formatDuration(Math.max(0,mins||0))+' h (Altbestand)'});
  if(!active||disabled)return <Trigger label="Dauer bearbeiten" disabled={disabled} onClick={()=>setActive(true)}>{formatDuration(Math.max(0,mins||0))} h</Trigger>;
  return <Select autoFocus searchable defaultDropdownOpened aria-label="Dauer" value={value} data={data} allowDeselect={false} onDropdownClose={()=>setActive(false)} onChange={v=>{if(v&&Number(v)%15===0&&Number(v)>0&&Number.isFinite(Date.parse(line.start)))onChange(new Date(Date.parse(line.start)+Number(v)*60000).toISOString());setActive(false);}}/>;
}
export function InlineMachines({line,catalog,disabled,field,onChange}:{line:RapportLine;catalog:Catalog;disabled:boolean;field:'name'|'minutes';onChange:(machines:RapportLine['machines'])=>void}){
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(line.machines);
  const value=line.machines.map(m=>field==='name'?m.name:formatDuration(m.minutes)).join('; ')||'–';
  if(disabled)return <span>{value}</span>;
  return <Popover opened={open} onChange={setOpen} width={320} position="bottom" withArrow shadow="md" withinPortal><Popover.Target><UnstyledButton className="rapport-inline-trigger" aria-label={field==='name'?'Maschinen bearbeiten':'Maschinenstunden bearbeiten'} onClick={()=>{setDraft(line.machines.map(m=>({...m})));setOpen(true);}}>{value}</UnstyledButton></Popover.Target><Popover.Dropdown><Stack gap="xs"><Text fw={700}>Maschineneinsatz</Text>{draft.map((m,i)=><Stack key={i} gap={4}><EquipmentPicker catalog={catalog} recent={draft.filter((_,j)=>i!==j).map(x=>x.name)} value={m.name} onChange={name=>setDraft(old=>old.map((x,j)=>i===j?{...x,name}:x))}/><NumberInput label="Minuten" min={1} max={1440} value={m.minutes} onChange={v=>setDraft(old=>old.map((x,j)=>i===j?{...x,minutes:Number(v)}:x))}/><Button variant="subtle" color="red" size="xs" onClick={()=>setDraft(old=>old.filter((_,j)=>j!==i))}>Entfernen</Button></Stack>)}<Button variant="light" onClick={()=>setDraft(old=>[...old,{name:'',minutes:15}])}>+ Maschine</Button><Group grow><Button variant="default" onClick={()=>setOpen(false)}>Abbrechen</Button><Button disabled={draft.some(m=>!m.name.trim()||!Number.isInteger(m.minutes)||m.minutes<1||m.minutes>1440)} onClick={()=>{onChange(draft);setOpen(false);}}>Übernehmen</Button></Group></Stack></Popover.Dropdown></Popover>;
}
