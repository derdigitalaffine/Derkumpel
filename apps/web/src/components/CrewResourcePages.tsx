import {Alert,Badge,Button,Group,Modal,NumberInput,Paper,Select,SimpleGrid,Stack,Text,TextInput} from '@mantine/core';
import {useEffect,useState} from 'react';
import {UIIcon} from './UIIcon';
import {EquipmentPicker} from './EquipmentPicker';
import {MachineDurationField} from './MachineDurationField';
import {suggestMachineDuration,isMachineDuration} from '../machineDuration';
import type {MaterialRows,MaterialUsage} from '../green';
import type {Catalog} from '../rapportBook';
import {formatDuration} from '../rapport';
import {api} from '../api';
type Kind='machine'|'material';
const kindOf=(m:MaterialUsage):Kind=>m.kind??'material';
const label=(k:Kind)=>k==='machine'?'Maschinen':'Verbrauchsmaterial';
const valid=(m:MaterialUsage)=>!!m.name.trim()&&!!m.unit.trim()&&Number.isFinite(m.quantity)&&m.quantity>0&&(m.kind!=='machine'||isMachineDuration(m.quantity));
export function CrewResourcePages({items,onChange,duration,disabled=false,rows,catalog,warning}:{items:MaterialUsage[];onChange:(items:MaterialUsage[])=>void;duration:number;disabled?:boolean;rows?:MaterialRows|null;catalog?:Catalog;warning?:string}){
 const [page,setPage]=useState<Kind|null>(null),[loadedRows,setRows]=useState<MaterialRows|null>(null),[loadedCatalog,setCatalog]=useState<Catalog>({machines:[],materials:[]}),[loadWarning,setWarning]=useState('');
 useEffect(()=>{if(!page||rows!==undefined||!navigator.onLine)return;let active=true;void Promise.all([api.materialRows(),api.rapportCatalog()]).then(([r,c])=>{if(active){setRows(r);setCatalog(c);setWarning('');}}).catch(()=>{if(active)setWarning('Katalog nicht erreichbar. Freitext bleibt möglich.');});return()=>{active=false;};},[page,rows]);
 const data=rows??loadedRows,equipment=catalog??loadedCatalog;
 const update=(i:number,patch:Partial<MaterialUsage>)=>onChange(items.map((m,j)=>j===i?{...m,...patch}:m));
 const add=(kind:Kind)=>onChange([...items,kind==='machine'?{kind,name:'',unit:'min',quantity:suggestMachineDuration(duration),note:''}:{name:'',unit:'',quantity:1,note:''}]);
 const close=()=>setPage(null);
 return <><SimpleGrid cols={2} spacing="xs">{(['machine','material'] as const).map(kind=>{const list=items.filter(m=>kindOf(m)===kind),invalid=list.some(m=>!valid(m));return <Button key={kind} h={76} px={8} variant={list.length?'light':'default'} color={invalid?'orange':undefined} disabled={disabled} onClick={()=>setPage(kind)}><Stack gap={3} align="center"><Group gap={5} wrap="nowrap"><UIIcon name={kind==='machine'?'wrench':'package'} size={19}/><Text size="sm" fw={700}>{label(kind)}</Text></Group><Text size="xs" c="dimmed">{list.length?invalid?list.length+' · unvollständig':list.length+' erfasst':'Optional · nichts erfasst'}</Text></Stack></Button>;})}</SimpleGrid>
 <Modal fullScreen opened={page!==null} onClose={close} title={page?label(page)+' erfassen':''} closeOnClickOutside={false}><Stack maw={640} mx="auto" gap="md">
 {page&&<><Text size="sm" c="dimmed">Gemeinsam für den Einsatz, nur einmal erfasst. {page==='machine'?'Einsatzdauer in 30-Minuten-Schritten.':'Menge und Einheit je Position.'}</Text>
 {(warning||loadWarning)&&<Alert color="orange">{warning||loadWarning}</Alert>}{data?.warnings.map(w=><Text key={w} size="xs" c="orange">{w}</Text>)}
 {!items.some(m=>kindOf(m)===page)&&<Paper withBorder p="lg" ta="center"><UIIcon name={page==='machine'?'wrench':'package'} size={32}/><Text fw={700} mt="xs">Noch nichts erfasst</Text><Text size="sm" c="dimmed">Nur hinzufügen, wenn tatsächlich verwendet.</Text></Paper>}
 {items.map((m,i)=>kindOf(m)!==page?null:<Paper key={i} withBorder p="md" radius="lg"><Stack gap="sm"><Group justify="space-between"><Text fw={700}>{m.name||'Neue Position'}</Text>{!valid(m)&&<Badge color="orange" variant="light">Unvollständig</Badge>}</Group>
 <Select searchable clearable label="Aus Katalog auswählen" value={m.code??null} disabled={disabled} data={(data?.items??[]).filter(x=>(x.kind??'material')===page).map(x=>({value:x.code,label:x.name+(page==='material'?' · '+x.unit:'')+(x.category?' · '+x.category:'')}))} onChange={code=>{const item=data?.items.find(x=>x.code===code&&(x.kind??'material')===page);if(item)update(i,{code:item.code,name:item.name,unit:page==='machine'?'min':item.unit});else update(i,{code:undefined});}}/>
 {page==='machine'?<><EquipmentPicker catalog={{...equipment,materialRows:data?.items??equipment.materialRows}} value={m.name} disabled={disabled} onChange={name=>update(i,{name,code:undefined})}/><MachineDurationField value={m.quantity} disabled={disabled} onChange={quantity=>update(i,{quantity,unit:'min'})}/></>:<><TextInput label="Verbrauchsmaterial" value={m.name} disabled={disabled} onChange={e=>update(i,{name:e.currentTarget.value,code:undefined})}/><SimpleGrid cols={2}><NumberInput label="Menge" min={0.001} decimalSeparator="," value={m.quantity} disabled={disabled} onChange={v=>update(i,{quantity:Number(v)})}/><TextInput label="Einheit" value={m.unit} disabled={disabled} onChange={e=>update(i,{unit:e.currentTarget.value,code:undefined})}/></SimpleGrid></>}
 <TextInput label="Bemerkung (optional)" value={m.note} disabled={disabled} onChange={e=>update(i,{note:e.currentTarget.value})}/><Button h={48} variant="subtle" color="red" disabled={disabled} onClick={()=>onChange(items.filter((_,j)=>i!==j))}>Position entfernen</Button></Stack></Paper>)}
 <Button h={54} variant="light" leftSection={<UIIcon name="plus"/>} disabled={disabled||items.length>=50} onClick={()=>add(page)}>{page==='machine'?'Maschine hinzufügen':'Verbrauchsmaterial hinzufügen'}</Button>
 <Button h={54} leftSection={<UIIcon name="check"/>} onClick={close}>Zurück zum Abschluss</Button></>}
 </Stack></Modal></>;
}
