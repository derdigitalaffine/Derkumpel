import {Alert,Button,Group,Select,Stack,Text} from '@mantine/core';
import {UIIcon} from './UIIcon';
import {formatDuration} from '../rapport';
import {isMachineDuration,machineDurationOptions,suggestMachineDuration} from '../machineDuration';
export function MachineDurationField({value,onChange,disabled=false}:{value:number;onChange:(minutes:number)=>void;disabled?:boolean}){
 const valid=isMachineDuration(value),suggested=suggestMachineDuration(value),label=(n:number)=>formatDuration(n)+' h';
 if(disabled)return <Group gap={6}><UIIcon name="clock" size={17}/><Text size="sm">Einsatzdauer: {label(value)}</Text></Group>;
 return <Stack gap={5}><Select label="Einsatzdauer (Std:Min)" description="30-Minuten-Schritte" leftSection={<UIIcon name="clock" size={18}/>} searchable allowDeselect={false} value={valid?String(value):null} placeholder="Dauer wählen" data={machineDurationOptions.map(n=>({value:String(n),label:label(n)}))} onChange={v=>{if(v&&isMachineDuration(Number(v)))onChange(Number(v));}}/>
 {!valid&&value>0&&<Alert color="orange" p="xs"><Text size="xs">Altwert: {label(value)}. Bei einer Änderung gilt das Halbstundenraster.</Text><Button mt={4} variant="light" size="sm" h={44} onClick={()=>onChange(suggested)}>{label(suggested)} übernehmen</Button></Alert>}
 <Group grow gap={5}><Button h={44} px={4} variant="light" disabled={valid&&value<=30} onClick={()=>onChange(valid?Math.max(30,value-30):suggested)}>− 0:30</Button><Button h={44} px={4} variant="light" disabled={valid&&value>=1440} onClick={()=>onChange(valid?Math.min(1440,value+30):suggested)}>+ 0:30</Button></Group></Stack>;
}
