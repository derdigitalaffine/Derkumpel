import { Accordion, Alert, Badge, Box, Button, Card, Divider, Drawer, Group, Image, Modal, Paper, Progress, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { db, getSetting, setSetting } from '../db';
import { useDexieLive } from '../live';
import { dateLabel, issueAddress, navigationUrl, statusColor } from '../issueUtils';
import { prepareUploadImage } from '../image';
import { queueAttachment, queueComment, queueIssueUpdate } from '../sync';
import { AttachmentTile } from '../components/AttachmentTile';
import { UIIcon, type IconName } from '../components/UIIcon';
import { dueInfo } from '../components/IssueCard';
import type { NamedRef, RedmineIssue } from '../types';

const primaryStatusNames = ['in arbeit', 'unterbrochen', 'erledigt', 'auftrag erledigt'];
type Membership = { id: number; user?: NamedRef; group?: NamedRef; roles?: NamedRef[] };

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return <Box className="field-kpi"><Text className="muted-label">{label}</Text><Text fw={700} size="sm" mt={3}>{value}</Text></Box>;
}

function SectionTitle({ icon, children, meta }: { icon: IconName; children: React.ReactNode; meta?: React.ReactNode }) {
  return <Group justify="space-between" align="center" wrap="nowrap">
    <Group gap="sm" wrap="nowrap"><ThemeIcon size={36} radius="md" variant="light" color="brand"><UIIcon name={icon} size={19} /></ThemeIcon><Text fw={850} size="lg">{children}</Text></Group>
    {meta}
  </Group>;
}

export function IssuePage() {
  const id = Number(useParams().id);
  const issueQuery = useCallback(() => db.issues.get(id), [id]);
  const pendingQuery = useCallback(() => db.outbox.where('issueId').equals(id).sortBy('createdAt'), [id]);
  const record = useDexieLive(issueQuery, undefined);
  const pending = useDexieLive(pendingQuery, []);
  const issue = record?.data;
  const [commentOpen, setCommentOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState<number | null>(null);
  const [savingComment, setSavingComment] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [notes, setNotes] = useState('');
  const [privateNote, setPrivateNote] = useState(false);
  const [photo, setPhoto] = useState<{ file: File; url: string }>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);
  const allowedPrimary = useMemo(() => issue?.allowed_statuses?.filter((status) => primaryStatusNames.includes(status.name.toLocaleLowerCase('de-DE'))) ?? [], [issue]);
  if (!issue) return <Stack maw={900} mx="auto"><Button component={Link} to="/" variant="subtle">← Zurück</Button><Alert color="orange">Der Auftrag ist noch nicht im Offline-Cache.</Alert></Stack>;

  const setStatus = async (status: NamedRef) => {
    if (savingStatus !== null || issue.status.id === status.id) return;
    setSavingStatus(status.id);
    try {
      await queueIssueUpdate(issue, { status_id: status.id }, (current) => ({ ...current, status }));
      notifications.show({ message: navigator.onLine ? 'Statusänderung wird synchronisiert' : 'Status sicher offline gespeichert', color: 'green' });
    } catch {
      notifications.show({ message: 'Status konnte nicht lokal gespeichert werden. Bitte erneut versuchen.', color: 'red' });
    } finally {
      setSavingStatus(null);
    }
  };
  const submitComment = async () => {
    if (!notes.trim() || savingComment) return;
    setSavingComment(true);
    try {
      await queueComment(issue, notes.trim(), privateNote);
      setNotes(''); setPrivateNote(false); setCommentOpen(false);
      notifications.show({ message: navigator.onLine ? 'Kommentar wird synchronisiert' : 'Kommentar offline gespeichert', color: 'green' });
    } catch {
      notifications.show({ message: 'Kommentar konnte nicht gespeichert werden. Der Text bleibt erhalten.', color: 'red' });
    } finally {
      setSavingComment(false);
    }
  };
  const selectPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const compressed = await prepareUploadImage(file);
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { file: compressed, url: URL.createObjectURL(compressed) };
      });
    } catch {
      notifications.show({ message: 'Das Foto konnte nicht verarbeitet werden. Bitte erneut aufnehmen.', color: 'red' });
    }
  };
  const usePhoto = async () => {
    if (!photo || savingPhoto) return;
    setSavingPhoto(true);
    try {
      await queueAttachment(issue, photo.file, photo.file.name || `foto-${Date.now()}.jpg`);
      URL.revokeObjectURL(photo.url); setPhoto(undefined);
      notifications.show({ message: navigator.onLine ? 'Foto wird synchronisiert' : 'Foto sicher offline gespeichert', color: 'green' });
    } catch {
      notifications.show({ message: 'Foto konnte nicht gespeichert werden. Die Vorschau bleibt geöffnet.', color: 'red' });
    } finally {
      setSavingPhoto(false);
    }
  };
  const nav = navigationUrl(issue);
  const address = issueAddress(issue);
  const due = dueInfo(issue.due_date);
  const relevantJournals = (issue.journals ?? []).filter((journal) => Boolean(journal.notes?.trim()) || journal.details?.some((detail) => detail.name === 'status_id'));
  const technicalJournals = (issue.journals ?? []).filter((journal) => !relevantJournals.includes(journal));

  return <Stack gap="md" maw={940} mx="auto">
    <Group justify="space-between" className="page-heading">
      <Group gap={6}><Button component={Link} to="/" variant="subtle" color="gray" px="xs" leftSection={<UIIcon name="arrow-left" size={16} />}>Meine Arbeit</Button><Button component={Link} to="/tickets" variant="subtle" color="gray" px="xs">Tickets</Button></Group>
      {pending.length > 0 && <Badge color="orange" variant="light" size="lg">↻ {pending.length} lokal</Badge>}
    </Group>

    <Paper withBorder p={{ base: 'md', sm: 'lg' }} className="surface-card ticket-hero">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap={6} wrap="wrap">
            <Badge color={statusColor(issue.status.name)} variant="filled" size="lg">{issue.status.name}</Badge>
            <Badge color="gray" variant="outline">{issue.tracker.name}</Badge>
            <Badge color="gray" variant="light">#{issue.id}</Badge>
          </Group>
          <Badge color="blue" variant="light">{issue.priority.name}</Badge>
        </Group>

        <Box><Text className="page-kicker">Auftrag #{issue.id} · {issue.project.name}</Text><Title order={1} size="h2" lh={1.17} style={{ letterSpacing: '-0.025em', overflowWrap: 'anywhere' }}>{issue.subject}</Title></Box>

        {address && <Card p="md" radius="lg" className="ticket-address">
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="white" color="brand" radius="xl" size={40}><UIIcon name="pin" size={21} /></ThemeIcon>
              <Box><Text className="muted-label">Einsatzort</Text><Text fw={850} size="md" mt={3}>{address}</Text></Box>
            </Group>
            {nav && <Button component="a" href={nav} target="_blank" rel="noopener noreferrer" variant="white" size="sm" leftSection={<UIIcon name="route" size={17} />}>Route</Button>}
          </Group>
        </Card>}

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing={{ base: 'md', sm: 'lg' }}>
          <Field label="Zugewiesen" value={issue.assigned_to?.name ?? '—'} />
          <Field label="Beginn" value={dateLabel(issue.start_date) ?? '—'} />
          <Field label="Fällig" value={due.label ? <span style={{ color: due.urgent ? '#bb4b3d' : undefined, fontWeight: 800 }}>{dateLabel(issue.due_date)}</span> : '—'} />
          <Field label="Projekt" value={issue.project.name} />
        </SimpleGrid>

        <Box>
          <Group justify="space-between"><Text className="muted-label">Fortschritt</Text><Text size="sm" fw={800}>{issue.done_ratio ?? 0}%</Text></Group>
          <Progress mt={6} value={issue.done_ratio ?? 0} size="md" radius="xl" color={(issue.done_ratio ?? 0) >= 100 ? 'green' : 'blue'} />
        </Box>
      </Stack>
    </Paper>

    <Paper withBorder p={{ base: 'md', sm: 'lg' }} className="surface-card ticket-actions">
      <Stack gap="md">
        <SectionTitle icon="bolt">Schnellaktionen</SectionTitle>
        <Text className="ticket-action-hint">Direkt hier erledigen – auch ohne Netz. Änderungen werden sicher vorgemerkt.</Text>
        <div className="touch-grid">
          {allowedPrimary.map((status) => <Button
            key={status.id}
            color={status.name.toLowerCase().includes('unterbrochen') ? 'orange' : status.name.toLowerCase().includes('erledigt') ? 'green' : 'blue'}
            variant={issue.status.id === status.id ? 'light' : 'filled'}
            loading={savingStatus === status.id}
            disabled={savingStatus !== null || issue.status.id === status.id}
            leftSection={issue.status.id === status.id ? <UIIcon name="check" size={18} /> : <UIIcon name="check-circle" size={18} />}
            onClick={() => void setStatus(status)}
          >{status.name}</Button>)}
          <Button variant="light" leftSection={<UIIcon name="message" size={18} />} onClick={() => setCommentOpen(true)}>Kommentar</Button>
          <Button variant="light" leftSection={<UIIcon name="camera" size={18} />} onClick={() => inputRef.current?.click()}>Foto</Button>
          <Button variant="light" leftSection={<UIIcon name="route" size={18} />} disabled={!nav} component={nav ? 'a' : 'button'} href={nav} target="_blank" rel="noopener noreferrer">Navigation</Button>
          <Button variant="default" leftSection={<UIIcon name="clock" size={18} />} onClick={() => notifications.show({ title: 'Rapportzettel', message: 'Die elektronische Zeit-/Rapportfunktion ist als separates Modul vorbereitet und bewusst noch nicht aktiviert.' })}>Zeit buchen</Button>
        </div>
        <input ref={inputRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void selectPhoto(file); }} />
      </Stack>
    </Paper>

    <Paper withBorder p={{ base: 'md', sm: 'lg' }} className="surface-card">
      <Stack gap="sm">
        <SectionTitle icon="list">Beschreibung</SectionTitle>
        <Text style={{ whiteSpace: 'pre-wrap' }} lh={1.55} c={issue.description ? undefined : 'dimmed'}>{issue.description || 'Keine Beschreibung hinterlegt.'}</Text>
      </Stack>
    </Paper>

    {(issue.attachments?.length ?? 0) > 0 && <Paper withBorder p={{ base: 'md', sm: 'lg' }} className="surface-card">
      <Stack gap="md">
        <SectionTitle icon="file" meta={<Badge variant="light" color="gray">{issue.attachments?.length}</Badge>}>Anhänge</SectionTitle>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>{issue.attachments?.map((attachment) => <AttachmentTile key={attachment.id} id={attachment.id} filename={attachment.filename} contentType={attachment.content_type} />)}</SimpleGrid>
      </Stack>
    </Paper>}

    <Paper withBorder p={{ base: 'md', sm: 'lg' }} className="surface-card">
      <Stack gap="md">
        <SectionTitle icon="clock" meta={relevantJournals.length > 0 ? <Badge variant="light" color="gray">{relevantJournals.length}</Badge> : undefined}>Verlauf</SectionTitle>
        {pending.map((item) => <Alert key={item.id} color="orange" variant="light">Lokale Änderung · wartet auf Synchronisation</Alert>)}
        {relevantJournals.length === 0 && <Text c="dimmed" size="sm">Noch keine relevanten Einträge.</Text>}
        {relevantJournals.slice().reverse().map((journal) => <Group key={journal.id} align="flex-start" wrap="nowrap" gap="sm" className="timeline-entry">
          <ThemeIcon radius="xl" variant="light" color={journal.private_notes ? 'grape' : 'gray'} size={34}>{journal.private_notes ? 'P' : (journal.user?.name ?? 'S').slice(0, 1).toUpperCase()}</ThemeIcon>
          <Card withBorder p="sm" style={{ flex: 1 }}>
            <Group justify="space-between" align="flex-start" gap="xs">
              <Text fw={750} size="sm">{journal.user?.name ?? 'System'}</Text>
              <Text size="xs" c="dimmed">{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(journal.created_on))}</Text>
            </Group>
            {journal.private_notes && <Badge mt="xs" color="grape" variant="light">Privat</Badge>}
            {journal.notes && <Text mt="xs" size="sm" style={{ whiteSpace: 'pre-wrap' }} lh={1.5}>{journal.notes}</Text>}
            {journal.details?.filter((detail) => detail.name === 'status_id').map((_, index) => <Text key={index} mt="xs" size="xs" c="dimmed">Status geändert</Text>)}
          </Card>
        </Group>)}
        {technicalJournals.length > 0 && <Accordion variant="contained">
          <Accordion.Item value="technical"><Accordion.Control>Weitere Änderungen ({technicalJournals.length})</Accordion.Control><Accordion.Panel><Stack gap="xs">{technicalJournals.slice().reverse().map((journal) => <Text size="sm" key={journal.id}>{journal.user?.name ?? 'System'} · {new Date(journal.created_on).toLocaleString('de-DE')} · {journal.details?.length ?? 0} Feldänderung(en)</Text>)}</Stack></Accordion.Panel></Accordion.Item>
        </Accordion>}
      </Stack>
    </Paper>

    <Paper withBorder className="surface-card" style={{ overflow: 'hidden' }}>
      <Accordion variant="separated" radius="lg">
        <Accordion.Item value="all" style={{ border: 0 }}><Accordion.Control><Group gap="xs" wrap="nowrap"><UIIcon name="sliders" size={19} /><Text fw={850}>Alle Angaben & Bearbeiten</Text></Group></Accordion.Control><Accordion.Panel><Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }}><Field label="Projekt" value={issue.project.name} /><Field label="Tracker" value={issue.tracker.name} /><Field label="Autor" value={issue.author?.name} /><Field label="Erstellt" value={new Date(issue.created_on).toLocaleString('de-DE')} /><Field label="Zuletzt geändert" value={new Date(issue.updated_on).toLocaleString('de-DE')} /><Field label="Geschätzte Stunden" value={issue.estimated_hours} /><Field label="Gebuchte Stunden" value={issue.spent_hours} /></SimpleGrid>
          <Divider label="Benutzerdefinierte Felder" />
          {(issue.custom_fields?.length ?? 0) === 0 ? <Text size="sm" c="dimmed">Keine benutzerdefinierten Felder.</Text> : issue.custom_fields?.map((field) => <Field key={field.id} label={field.name} value={Array.isArray(field.value) ? field.value.join(', ') : field.value ?? '—'} />)}
          {(issue.children?.length ?? 0) > 0 && <><Divider label="Unteraufgaben" />{issue.children?.map((child) => <Button key={child.id} component={Link} to={`/issues/${child.id}`} variant="subtle" justify="flex-start">#{child.id} {child.subject}</Button>)}</>}
          {(issue.relations?.length ?? 0) > 0 && <><Divider label="Beziehungen" />{issue.relations?.map((relation) => <Text key={relation.id} size="sm">{relation.relation_type}: #{relation.issue_id === issue.id ? relation.issue_to_id : relation.issue_id}</Text>)}</>}
          <AdvancedEditor issue={issue} />
        </Stack></Accordion.Panel></Accordion.Item>
      </Accordion>
    </Paper>

    <Drawer opened={commentOpen} onClose={() => setCommentOpen(false)} title="Kommentar hinzufügen" position="bottom" size="auto" padding="lg">
      <Stack maw={700} mx="auto">
        <Textarea label="Notiz" placeholder="Kurze Rückmeldung zum Auftrag …" minRows={5} autosize value={notes} onChange={(event) => setNotes(event.currentTarget.value)} autoFocus />
        <Switch label="Private Notiz" description="Nur verwenden, wenn deine Redmine-Rolle private Notizen erlaubt." checked={privateNote} onChange={(event) => setPrivateNote(event.currentTarget.checked)} />
        <Button onClick={() => void submitComment()} loading={savingComment} disabled={!notes.trim() || savingComment} leftSection={<UIIcon name="save" size={18} />}>Kommentar speichern</Button>
      </Stack>
    </Drawer>

    <Modal opened={Boolean(photo)} onClose={() => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(undefined); }} title="Foto verwenden?" centered>
      <Stack>{photo && <Image src={photo.url} mah="60dvh" fit="contain" radius="md" />}<Group grow><Button variant="default" onClick={() => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(undefined); }}>Verwerfen</Button><Button onClick={() => void usePhoto()} loading={savingPhoto} disabled={savingPhoto}>Foto anhängen</Button></Group></Stack>
    </Modal>
  </Stack>;
}

function AdvancedEditor({ issue }: { issue: RedmineIssue }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState(issue.subject);
  const [description, setDescription] = useState(issue.description ?? '');
  const [startDate, setStartDate] = useState(issue.start_date ?? '');
  const [dueDate, setDueDate] = useState(issue.due_date ?? '');
  const [doneRatio, setDoneRatio] = useState(String(issue.done_ratio ?? 0));
  const [statusId, setStatusId] = useState(String(issue.status.id));
  const [priorityId, setPriorityId] = useState(String(issue.priority.id));
  const [assigneeId, setAssigneeId] = useState(issue.assigned_to ? String(issue.assigned_to.id) : '');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<NamedRef[]>([]);
  const [custom, setCustom] = useState<Record<number, string>>(() => Object.fromEntries((issue.custom_fields ?? []).map((field) => [field.id, Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? '')])));

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    const membershipKey = `projectMemberships:${issue.project.id}`;
    void Promise.all([getSetting<Membership[]>(membershipKey, []), getSetting<NamedRef[]>('issuePriorities', [])]).then(([cachedMembers, cachedPriorities]) => {
      if (!disposed) { setMemberships(cachedMembers); setPriorityOptions(cachedPriorities); }
    });
    if (navigator.onLine) {
      void api.projectMemberships<{ memberships: Membership[] }>(issue.project.id).then(async (result) => {
        if (!disposed) setMemberships(result.memberships); await setSetting(membershipKey, result.memberships);
      }).catch(() => undefined);
      void api.meta<{ issue_priorities: NamedRef[] }>('priorities').then(async (result) => {
        if (!disposed) setPriorityOptions(result.issue_priorities); await setSetting('issuePriorities', result.issue_priorities);
      }).catch(() => undefined);
    }
    return () => { disposed = true; };
  }, [open, issue.project.id]);

  const assigneeOptions = useMemo(() => {
    const values = memberships.flatMap((membership) => {
      const principal = membership.user ?? membership.group;
      return principal ? [{ value: String(principal.id), label: `${membership.group ? 'Gruppe · ' : ''}${principal.name}` }] : [];
    });
    if (issue.assigned_to && !values.some((value) => value.value === String(issue.assigned_to!.id))) values.unshift({ value: String(issue.assigned_to.id), label: issue.assigned_to.name });
    return values;
  }, [memberships, issue.assigned_to]);
  const statuses = useMemo(() => {
    const values = [issue.status, ...(issue.allowed_statuses ?? [])];
    return [...new Map(values.map((status) => [status.id, status])).values()];
  }, [issue.status, issue.allowed_statuses]);
  const priorities = priorityOptions.length ? priorityOptions : [issue.priority];

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
    const nextStatus = statuses.find((status) => String(status.id) === statusId) ?? issue.status;
    const nextPriority = priorities.find((priority) => String(priority.id) === priorityId) ?? issue.priority;
    const nextAssignee = assigneeOptions.find((assignee) => assignee.value === assigneeId);
    const patch = {
      subject,
      description,
      start_date: startDate || null,
      due_date: dueDate || null,
      done_ratio: Number(doneRatio),
      status_id: Number(statusId),
      priority_id: Number(priorityId),
      assigned_to_id: assigneeId ? Number(assigneeId) : null,
      custom_fields: (issue.custom_fields ?? []).map((field) => ({ id: field.id, value: Array.isArray(field.value) ? (custom[field.id] ?? '').split(',').map((value) => value.trim()).filter(Boolean) : custom[field.id] ?? '' })),
    };
    await queueIssueUpdate(issue, patch, (current) => ({
      ...current,
      subject,
      description,
      start_date: startDate || undefined,
      due_date: dueDate || undefined,
      done_ratio: Number(doneRatio),
      status: nextStatus,
      priority: nextPriority,
      assigned_to: assigneeId && nextAssignee ? { id: Number(assigneeId), name: nextAssignee.label.replace(/^Gruppe · /, '') } : undefined,
      custom_fields: current.custom_fields?.map((field) => ({ ...field, value: Array.isArray(field.value) ? (custom[field.id] ?? '').split(',').map((value) => value.trim()).filter(Boolean) : custom[field.id] ?? '' })),
    }));
    setOpen(false);
    notifications.show({ message: navigator.onLine ? 'Änderungen werden synchronisiert' : 'Änderungen offline gespeichert', color: 'green' });
    } catch {
      notifications.show({ message: 'Änderungen konnten nicht lokal gespeichert werden. Eingaben bleiben erhalten.', color: 'red' });
    } finally { setSaving(false); }
  };

  return <><Button variant="light" onClick={() => setOpen(true)}>Angaben bearbeiten</Button><Drawer opened={open} onClose={() => setOpen(false)} title="Alle Angaben bearbeiten" position="right" size="md" padding="lg"><Stack>
    <TextInput label="Titel" value={subject} onChange={(event) => setSubject(event.currentTarget.value)} />
    <Textarea label="Beschreibung" minRows={5} autosize value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
    <Select label="Status" searchable data={statuses.map((status) => ({ value: String(status.id), label: status.name }))} value={statusId} onChange={(value) => setStatusId(value ?? String(issue.status.id))} />
    <Select label="Priorität" searchable data={priorities.map((priority) => ({ value: String(priority.id), label: priority.name }))} value={priorityId} onChange={(value) => setPriorityId(value ?? String(issue.priority.id))} />
    <Select label="Zugewiesen an" searchable clearable data={assigneeOptions} value={assigneeId || null} onChange={(value) => setAssigneeId(value ?? '')} nothingFoundMessage={navigator.onLine ? 'Keine Projektmitglieder gefunden' : 'Keine gecachte Auswahlliste verfügbar'} />
    <TextInput label="Beginn" type="date" value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} />
    <TextInput label="Fälligkeit" type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
    <Select label="% erledigt" data={Array.from({ length: 11 }, (_, index) => ({ value: String(index * 10), label: `${index * 10}%` }))} value={doneRatio} onChange={(value) => setDoneRatio(value ?? '0')} />
    {(issue.custom_fields ?? []).map((field) => <TextInput key={field.id} label={field.name} description={Array.isArray(field.value) ? 'Mehrere Werte mit Komma trennen' : undefined} value={custom[field.id] ?? ''} onChange={(event) => setCustom((current) => ({ ...current, [field.id]: event.currentTarget.value }))} />)}
    <Alert color="blue" variant="light">Redmine bleibt maßgeblich: Workflow, Custom Workflows und Rollen werden beim Synchronisieren serverseitig geprüft.</Alert>
    <Button onClick={() => void save()} loading={saving} disabled={saving} leftSection={<UIIcon name="save" size={18} />}>Änderungen speichern</Button>
  </Stack></Drawer></>;
}
