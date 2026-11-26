import {Group,NumberInput,SimpleGrid,Stack,Text} from '@mantine/core';
import {UIIcon} from './UIIcon';
import {formatDuration} from '../rapport';
/** Machine utilization is a duration, never a time of day or material quantity. */
export function MachineDurationField({value,onChange,disabled=false}:{value:number;onChange:(minutes:number)=>void;disabled?:boolean}){
 const total=Number.isFinite(value)?Math.max(0,Math.min(1440,Math.trunc(value))):0;
 const hours=Math.floor(total/60),minutes=total%60;
 return <Stack gap={4}><Group gap={5}><UIIcon name="clock" size={17}/><Text size="sm" fw={650}>Einsatzdauer</Text></Group><SimpleGrid cols={2} spacing="xs"><NumberInput label="Stunden" min={0} max={24} allowDecimal={false} clampBehavior="strict" value={hours} disabled={disabled} onChange={v=>onChange(Math.min(1440,Math.max(0,Math.trunc(Number(v)||0))*60+minutes))}/><NumberInput label="Minuten" min={0} max={hours===24?0:59} allowDecimal={false} clampBehavior="strict" value={minutes} disabled={disabled||hours===24} onChange={v=>onChange(Math.min(1440,hours*60+Math.min(59,Math.max(0,Math.trunc(Number(v)||0)))))}/></SimpleGrid><Text size="xs" c="dimmed">Gesamt: {formatDuration(total)} h{!total&&!disabled?' · Dauer erforderlich':''}</Text></Stack>;
}
