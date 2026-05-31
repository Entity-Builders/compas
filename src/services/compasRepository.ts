import {
  COMPAS_SEED_TASKS,
  isInertiaBroken,
  type ActivationHistoryEntry,
  type CompasTask,
  type HistoryStatus,
} from '@eb-packages/compas-core';
import { supabase } from '@eb-packages/logic';

type TaskRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  life_area: CompasTask['lifeArea'];
  benefits: string[];
  activation_energy: CompasTask['activationEnergy'];
  duration_seconds: number;
  psychological_reward: CompasTask['psychologicalReward'];
  toltec_agreement: string | null;
  is_seed: boolean;
  sort_order: number;
};

type HistoryRow = {
  id: string;
  task_id: string | null;
  task_name: string;
  life_area: CompasTask['lifeArea'];
  activation_energy: CompasTask['activationEnergy'];
  duration_seconds: number;
  status: HistoryStatus;
  start_at: string;
  end_at: string;
  started_at: string | null;
  completed_at: string | null;
  inertia_broken: boolean;
};

export type StoredHistoryEntry = ActivationHistoryEntry & {
  id: string;
  persisted: boolean;
};

export async function getSessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.user.id ?? null;
}

export async function loadCompasTasks(): Promise<CompasTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, slug, name, category, life_area, benefits, activation_energy, duration_seconds, psychological_reward, toltec_agreement, is_seed, sort_order',
    )
    .order('sort_order', { ascending: true });

  if (error || !data?.length) {
    return COMPAS_SEED_TASKS;
  }

  return (data as TaskRow[]).map(mapTaskRow);
}

export async function loadCompasHistory(): Promise<StoredHistoryEntry[]> {
  const userId = await getSessionUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('history')
    .select(
      'id, task_id, task_name, life_area, activation_energy, duration_seconds, status, start_at, end_at, started_at, completed_at, inertia_broken',
    )
    .order('start_at', { ascending: false })
    .limit(40);

  if (error || !data) return [];

  return (data as HistoryRow[]).map(mapHistoryRow);
}

export async function createAcceptedSlot(
  task: CompasTask,
): Promise<StoredHistoryEntry> {
  const userId = await getSessionUserId();
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + task.durationSeconds * 1000);
  const localEntry = createLocalEntry(task, 'accepted', startAt, endAt);

  if (!userId) return localEntry;

  const { data, error } = await supabase
    .from('history')
    .insert({
      user_id: userId,
      task_id: task.id ?? null,
      task_name: task.name,
      life_area: task.lifeArea,
      activation_energy: task.activationEnergy,
      duration_seconds: task.durationSeconds,
      status: 'accepted',
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    })
    .select(
      'id, task_id, task_name, life_area, activation_energy, duration_seconds, status, start_at, end_at, started_at, completed_at, inertia_broken',
    )
    .single();

  if (error || !data) return localEntry;

  return mapHistoryRow(data as HistoryRow);
}

export async function updateSlotStatus(
  entry: StoredHistoryEntry,
  status: Extract<HistoryStatus, 'completed' | 'skipped' | 'abandoned'>,
  history: StoredHistoryEntry[],
): Promise<StoredHistoryEntry> {
  const completedAt = status === 'completed' ? new Date() : null;
  const inertiaBroken =
    status === 'completed'
      ? isInertiaBroken(
          { ...entry, status, completedAt },
          history.filter((item) => item.id !== entry.id),
        )
      : false;

  const updated: StoredHistoryEntry = {
    ...entry,
    status,
    completedAt,
    inertiaBroken,
    persisted: entry.persisted,
  };

  if (!entry.persisted) return updated;

  const { data, error } = await supabase
    .from('history')
    .update({
      status,
      completed_at: completedAt?.toISOString() ?? null,
      inertia_broken: inertiaBroken,
    })
    .eq('id', entry.id)
    .select(
      'id, task_id, task_name, life_area, activation_energy, duration_seconds, status, start_at, end_at, started_at, completed_at, inertia_broken',
    )
    .single();

  if (error || !data) return updated;

  return mapHistoryRow(data as HistoryRow);
}

function mapTaskRow(row: TaskRow): CompasTask {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    lifeArea: row.life_area,
    benefits: row.benefits,
    activationEnergy: row.activation_energy,
    durationSeconds: row.duration_seconds,
    psychologicalReward: row.psychological_reward,
    toltecAgreement: row.toltec_agreement ?? undefined,
    isSeed: row.is_seed,
    sortOrder: row.sort_order,
  };
}

function mapHistoryRow(row: HistoryRow): StoredHistoryEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    lifeArea: row.life_area,
    activationEnergy: row.activation_energy,
    durationSeconds: row.duration_seconds,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    inertiaBroken: row.inertia_broken,
    persisted: true,
  };
}

function createLocalEntry(
  task: CompasTask,
  status: HistoryStatus,
  startAt: Date,
  endAt: Date,
): StoredHistoryEntry {
  return {
    id: `local-${startAt.getTime()}-${task.slug}`,
    persisted: false,
    taskId: task.id ?? null,
    taskName: task.name,
    lifeArea: task.lifeArea,
    activationEnergy: task.activationEnergy,
    durationSeconds: task.durationSeconds,
    status,
    startAt,
    endAt,
    startedAt: null,
    completedAt: null,
    inertiaBroken: false,
  };
}
