import { Accordion, Alert, Badge, Box, Button, Card, Divider, Drawer, Group, Image, Modal, Paper, Progress, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '../db';
import { useDexieLive } from '../live';
import { dateLabel, issueAddress, navigationUrl, scalarField, statusColor } from '../issueUtils';
import { prepareUploadImage } from '../image';
import { queueAttachment, queueComment, queueIssueUpdate } from '../sync';
import { AttachmentTile } from '../components/AttachmentTile';
import type { RedmineIssue } from '../types';

const primaryStatusNames = ['in arbeit', 'unterbrochen', 'erledigt', 'auftrag erledigt'];

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return <Box><Text className="muted-label">{label}</Text><Text fw={650}>{value}</Text></Box>;
}

export function IssuePage() {
  const id = Number(useParams().id);
  const issueQuery = useCallback(() => db.issues.get(id), [id]);
  const pendingQuery = useCallback(() => db.outbox.where('issueId').equals(id).sortBy('createdAt'), [id]);
  const record = useDexieLive(issueQuery, undefined);
  const pending = useDexieLive(pendingQuery, []);
  const issue = record?.data;
  const [commentOpen, setCommentOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [privateNote, setPrivateNote] = useState(false);
  const [photo, setPhoto] = useState<{ file: File; url: string }>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  const allowedPrimary = useMemo(() => issue?.allowed_statuses?.filter((s) => primaryStatusNames.includes(s.name.toLocaleLowerCase('de-DE'))) ?? [], [issue]);
  if (!issue) return <Stack maw={900} mx="auto"><Button component={Link} to="/" variant="subtle">← Zurück</Button><Alert color="orange">Der Auftrag ist noch nicht im Offline-Cache.</Alert></Stack>;

  const setStatus = async (status: { id: number; name: string }) => {
    await queueIssueUpdate(issue, { status_id: status.id }, (current) => ({ ...current, status }));
    notifications.show({ message: navigator.onLine ? 'Status wird synchronisiert' : 'Status offline gespeichert', color: 'blue' });
  };
  const submitComment = async () => {
    if (!notes.trim()) return;
    await queueComment(issue, notes.trim(), privateNote); setNotes(''); setPrivateNote(false); setCommentOpen(false);
    notifications.show({ message: navigator.onLine ? 'Kommentar wird synchronisiert' : 'Kommentar offline gespeichert' });
  };
  const selectPhoto = async (file?: File) => {
    if (!file) return;
    const compressed = await prepareUploadImage(file);
    setPhoto({ file: compressed, url: URL.createObjectURL(compressed) });
  };
  const usePhoto = async () => {
    if (!photo) return;
    await queueAttachment(issue, photo.file, photo.file.name || `foto-${Date.now()}.jpg`);
    URL.revokeObjectURL(photo.url); setPhoto(undefined);
    notifications.show({ message: navigator.onLine ? 'Foto wird hochgeladen' : 'Foto sicher offline gespeichert' });
  };
  const nav = navigationUrl(issue);

  const relevantJournals = (issue.journals ?? []).filter((j) => Boolean(j.notes?.trim()) || j.details?.some((d) => d.name === 'status_id'));
  const technicalJournals = (issue.journals ?? []).filter((j) => !relevantJournals.includes(j));

  return <Stack gap="md" maw={900} mx="auto">
    <Group justify="space-between"><Button component={Link} to="/" variant="subtle" px={0}>← Meine Arbeit</Button>{pending.length > 0 && <Badge color="orange" variant="light">{pending.length} lokal</Badge>}</Group>
    <Paper withBorder radius="xl" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start"><Group gap="xs"><Badge color={statusColor(issue.status.name)}>{issue.status.name}</Badge><Badge color="gray" variant="light">#{issue.id}</Badge></Group><Text fw={700} c="dimmed">{issue.priority.name}</Text></Group>
        <Title order={1} size="h2" lh={1.15}>{issue.subject}</Title>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <Field label="Zugewiesen" value={issue.assigned_to?.name ?? '—'} />
          <Field label="Beginn" value={dateLabel(issue.start_date)} />
          <Field label="Fällig" value={dateLabel(issue.due_date)} />
          <Field label="Tracker" value={issue.tracker.name} />
        </SimpleGrid>
        <Box><Group justify="space-between"><Text className="muted-label">Erledigt</Text><Text size="sm" fw={700}>{issue.done_ratio ?? 0}%</Text></Group><Progress mt={4} value={issue.done_ratio ?? 0} size="md" radius="xl" /></Box>
        {issueAddress(issue) && <Card bg="blue.0" radius="lg" p="md"><Text className="muted-label">Ort</Text><Text fw={800} size="lg">{issueAddress(issue)}</Text></Card>}
      </Stack>
    </Paper>

    <Paper withBorder radius="xl" p="lg"><Text className="muted-label" mb="xs">Beschreibung</Text><Text style={{ whiteSpace: 'pre-wrap' }}>{issue.description || 'Keine Beschreibung.'}</Text></Paper>

    <Paper withBorder radius="xl" p="lg"><Stack gap="sm"><Text fw={800} size="lg">Aktionen</Text><div className="touch-grid">
      {allowedPrimary.map((status) => <Button key={status.id} color={status.name.toLowerCase().includes('unterbrochen') ? 'orange' : status.name.toLowerCase().includes('erledigt') ? 'green' : 'blue'} variant={issue.status.id === status.id ? 'light' : 'filled'} onClick={() => void setStatus(status)}>{status.name}</Button>)}
      <Button variant="light" onClick={() => setCommentOpen(true)}>Kommentar</Button>
      <Button variant="light" onClick={() => inputRef.current?.click()}>Foto</Button>
      <Button variant="light" disabled={!nav} component={nav ? 'a' : 'button'} href={nav} target="_blank">Navigation</Button>
      <Button variant="light" onClick={() => notifications.show({ title: 'Rapportzettel', message: 'Die elektronische Zeit-/Rapportfunktion ist als separates Modul vorbereitet und bewusst noch nicht aktiviert.' })}>Zeit buchen</Button>
    </div><input ref={inputRef} hidden type="file" accept="image/*" capture="environment" onChange={(e) => void selectPhoto(e.currentTarget.files?.[0])} /></Stack></Paper>

    {(issue.attachments?.length ?? 0) > 0 && <Paper withBorder radius="xl" p="lg"><Stack><Text fw={800} size="lg">Anhänge</Text><SimpleGrid cols={{ base: 1, sm: 2 }}>{issue.attachments?.map((a) => <AttachmentTile key={a.id} id={a.id} filename={a.filename} contentType={a.content_type} />)}</SimpleGrid></Stack></Paper>}

    <Paper withBorder radius="xl" p="lg"><Stack><Text fw={800} size="lg">Verlauf</Text>{pending.map((p) => <Alert key={p.id} color="orange" variant="light">Lokale Änderung · wartet auf Synchronisation</Alert>)}{relevantJournals.length === 0 && <Text c="dimmed">Noch keine relevanten Einträge.</Text>}{relevantJournals.slice().reverse().map((journal) => <Card key={journal.id} withBorder radius="md"><Group justify="space-between"><Text fw={700}>{journal.user?.name ?? 'System'}</Text><Text size="xs" c="dimmed">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(journal.created_on))}</Text></Group>{journal.private_notes && <Badge mt="xs" color="grape" variant="light">Privat</Badge>}{journal.notes && <Text mt="xs" style={{ whiteSpace: 'pre-wrap' }}>{journal.notes}</Text>}{journal.details?.filter((d) => d.name === 'status_id').map((d, i) => <Text key={i} mt="xs" size="sm" c="dimmed">Status geändert</Text>)}</Card>)}
      {technicalJournals.length > 0 && <Accordion variant="contained"><Accordion.Item value="technical"><Accordion.Control>Weitere Änderungen ({technicalJournals.length})</Accordion.Control><Accordion.Panel><Stack gap="xs">{technicalJournals.slice().reverse().map((j) => <Text size="sm" key={j.id}>{j.user?.name ?? 'System'} · {new Date(j.created_on).toLocaleString('de-DE')} · {j.details?.length ?? 0} Feldänderung(en)</Text>)}</Stack></Accordion.Panel></Accordion.Item></Accordion>}</Stack></Paper>

    <Accordion variant="separated" radius="lg"><Accordion.Item value="all"><Accordion.Control><Text fw={800}>Alle Angaben</Text></Accordion.Control><Accordion.Panel><Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }}><Field label="Projekt" value={issue.project.name} /><Field label="Tracker" value={issue.tracker.name} /><Field label="Autor" value={issue.author?.name} /><Field label="Erstellt" value={new Date(issue.created_on).toLocaleString('de-DE')} /><Field label="Zuletzt geändert" value={new Date(issue.updated_on).toLocaleString('de-DE')} /><Field label="Geschätzte Stunden" value={issue.estimated_hours} /><Field label="Gebuchte Stunden" value={issue.spent_hours} /></SimpleGrid>
      <Divider label="Benutzerdefinierte Felder" />{issue.custom_fields?.map((field) => <Field key={field.id} label={field.name} value={Array.isArray(field.value) ? field.value.join(', ') : field.value ?? '—'} />)}
      {(issue.children?.length ?? 0) > 0 && <><Divider label="Unteraufgaben" />{issue.children?.map((child) => <Button key={child.id} component={Link} to={`/issues/${child.id}`} variant="subtle" justify="flex-start">#{child.id} {child.subject}</Button>)}</>}
      {(issue.relations?.length ?? 0) > 0 && <><Divider label="Beziehungen" />{issue.relations?.map((r) => <Text key={r.id} size="sm">{r.relation_type}: #{r.issue_id === issue.id ? r.issue_to_id : r.issue_id}</Text>)}</>}
      <AdvancedEditor issue={issue} />
    </Stack></Accordion.Panel></Accordion.Item></Accordion>

    <Drawer opened={commentOpen} onClose={() => setCommentOpen(false)} title="Kommentar" position="bottom" size="auto" padding="lg"><Stack><Textarea label="Notiz" minRows={5} autosize value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autoFocus /><Switch label="Private Notiz" checked={privateNote} onChange={(e) => setPrivateNote(e.currentTarget.checked)} /><Button onClick={() => void submitComment()} disabled={!notes.trim()}>Speichern</Button></Stack></Drawer>
    <Modal opened={Boolean(photo)} onClose={() => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(undefined); }} title="Foto verwenden?" centered><Stack>{photo && <Image src={photo.url} mah="60dvh" fit="contain" radius="md" />}<Group grow><Button variant="default" onClick={() => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(undefined); }}>Verwerfen</Button><Button onClick={() => void usePhoto()}>Verwenden</Button></Group></Stack></Modal>
  </Stack>;
}

function AdvancedEditor({ issue }: { issue: RedmineIssue }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(issue.subject);
  const [description, setDescription] = useState(issue.description ?? '');
  const [startDate, setStartDate] = useState(issue.start_date ?? '');
  const [dueDate, setDueDate] = useState(issue.due_date ?? '');
  const [doneRatio, setDoneRatio] = useState(String(issue.done_ratio ?? 0));
  const [custom, setCustom] = useState<Record<number, string>>(() => Object.fromEntries((issue.custom_fields ?? []).map((f) => [f.id, Array.isArray(f.value) ? f.value.join(', ') : String(f.value ?? '')])));
  const save = async () => {
    const patch = { subject, description, start_date: startDate || null, due_date: dueDate || null, done_ratio: Number(doneRatio), custom_fields: (issue.custom_fields ?? []).map((f) => ({ id: f.id, value: custom[f.id] ?? '' })) };
    await queueIssueUpdate(issue, patch, (current) => ({ ...current, subject, description, start_date: startDate || undefined, due_date: dueDate || undefined, done_ratio: Number(doneRatio), custom_fields: current.custom_fields?.map((f) => ({ ...f, value: custom[f.id] ?? '' })) }));
    setOpen(false); notifications.show({ message: navigator.onLine ? 'Änderungen werden synchronisiert' : 'Änderungen offline gespeichert' });
  };
  return <><Button variant="light" onClick={() => setOpen(true)}>Angaben bearbeiten</Button><Drawer opened={open} onClose={() => setOpen(false)} title="Alle Angaben bearbeiten" position="right" size="md" padding="lg"><Stack>
    <TextInput label="Titel" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} />
    <Textarea label="Beschreibung" minRows={5} autosize value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
    <TextInput label="Beginn" type="date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} />
    <TextInput label="Fälligkeit" type="date" value={dueDate} onChange={(e) => setDueDate(e.currentTarget.value)} />
    <Select label="% erledigt" data={Array.from({ length: 11 }, (_, i) => ({ value: String(i * 10), label: `${i * 10}%` }))} value={doneRatio} onChange={(v) => setDoneRatio(v ?? '0')} />
    {(issue.custom_fields ?? []).map((field) => <TextInput key={field.id} label={field.name} value={custom[field.id] ?? ''} onChange={(e) => setCustom((current) => ({ ...current, [field.id]: e.currentTarget.value }))} />)}
    <Alert color="blue" variant="light">Redmine entscheidet beim Synchronisieren, welche Felder deine Rolle tatsächlich ändern darf.</Alert>
    <Button onClick={() => void save()}>Änderungen speichern</Button>
  </Stack></Drawer></>;
}
