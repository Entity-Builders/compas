import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  Suggester,
  type CompasTask,
  type HistoryStatus,
} from '@entity-builders/compas-core';
import {
  createAcceptedSlot,
  loadCompasHistory,
  loadCompasTasks,
  updateSlotStatus,
  type StoredHistoryEntry,
} from './src/services/compasRepository';
import type { CompasView } from './src/types/navigation';

const suggester = new Suggester();

const AREA_LABELS: Record<CompasTask['lifeArea'], string> = {
  cuerpo: 'Cuerpo',
  entorno: 'Entorno',
  mente: 'Mente',
  conexion: 'Conexion',
  crecimiento: 'Crecimiento',
};

const ENERGY_LABELS: Record<CompasTask['activationEnergy'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export default function App() {
  const [view, setView] = useState<CompasView>('selector');
  const [tasks, setTasks] = useState<CompasTask[]>([]);
  const [history, setHistory] = useState<StoredHistoryEntry[]>([]);
  const [activeSlot, setActiveSlot] = useState<StoredHistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [loadedTasks, loadedHistory] = await Promise.all([
      loadCompasTasks(),
      loadCompasHistory(),
    ]);
    setTasks(loadedTasks);
    setHistory(loadedHistory);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const result = useMemo(
    () =>
      suggester.suggest(tasks, history, {
        limit: 4,
      }),
    [tasks, history],
  );

  const completedToday = useMemo(() => {
    const today = new Date();
    return history.filter((entry) => {
      if (entry.status !== 'completed') return false;
      const completedAt = new Date(entry.completedAt ?? entry.startAt);
      return (
        completedAt.getFullYear() === today.getFullYear() &&
        completedAt.getMonth() === today.getMonth() &&
        completedAt.getDate() === today.getDate()
      );
    });
  }, [history]);

  const handleAcceptTask = useCallback(async (task: CompasTask) => {
    const slot = await createAcceptedSlot(task);
    setActiveSlot(slot);
    setHistory((current) => [slot, ...current]);
    setView('timeline');
  }, []);

  const handleStartSlot = useCallback(() => {
    if (!activeSlot) return;
    setActiveSlot({ ...activeSlot, startedAt: new Date() });
    setView('solo');
  }, [activeSlot]);

  const handleFinishSlot = useCallback(
    async (status: Extract<HistoryStatus, 'completed' | 'skipped' | 'abandoned'>) => {
      if (!activeSlot) return;
      const updated = await updateSlotStatus(activeSlot, status, history);
      setHistory((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setActiveSlot(null);
      setView('selector');
    },
    [activeSlot, history],
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.shell}>
          <Header completedCount={completedToday.length} />
          <SegmentedControl view={view} onChange={setView} soloEnabled={!!activeSlot} />
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#3f7c5f" />
            </View>
          ) : (
            <>
              {view === 'selector' && (
                <SelectorView
                  maxEnergy={result.maxEnergy}
                  suggestions={result.suggestions}
                  onAccept={handleAcceptTask}
                />
              )}
              {view === 'timeline' && (
                <TimelineView
                  activeSlot={activeSlot}
                  history={history}
                  onStart={handleStartSlot}
                  onSkip={() => handleFinishSlot('skipped')}
                />
              )}
              {view === 'solo' && activeSlot && (
                <SoloView
                  slot={activeSlot}
                  onComplete={() => handleFinishSlot('completed')}
                  onAbandon={() => handleFinishSlot('abandoned')}
                />
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Header({ completedCount }: { completedCount: number }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>Compas</Text>
        <Text style={styles.headerMeta}>
          {completedCount > 0 ? `${completedCount} activaciones hoy` : 'Listo'}
        </Text>
      </View>
      <View style={styles.dayBadge}>
        <Text style={styles.dayBadgeValue}>{completedCount > 0 ? '100%' : '0%'}</Text>
        <Text style={styles.dayBadgeLabel}>hoy</Text>
      </View>
    </View>
  );
}

function SegmentedControl({
  view,
  soloEnabled,
  onChange,
}: {
  view: CompasView;
  soloEnabled: boolean;
  onChange: (view: CompasView) => void;
}) {
  const items: { value: CompasView; label: string; disabled?: boolean }[] = [
    { value: 'selector', label: 'Selector' },
    { value: 'timeline', label: 'Timeline' },
    { value: 'solo', label: 'Solo', disabled: !soloEnabled },
  ];

  return (
    <View style={styles.segmented}>
      {items.map((item) => {
        const active = view === item.value;
        return (
          <Pressable
            key={item.value}
            disabled={item.disabled}
            onPress={() => onChange(item.value)}
            style={[
              styles.segment,
              active && styles.segmentActive,
              item.disabled && styles.segmentDisabled,
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                active && styles.segmentTextActive,
                item.disabled && styles.segmentTextDisabled,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SelectorView({
  maxEnergy,
  suggestions,
  onAccept,
}: {
  maxEnergy: CompasTask['activationEnergy'];
  suggestions: CompasTask[];
  onAccept: (task: CompasTask) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.modeStrip}>
        <Text style={styles.modeStripLabel}>Energia sugerida</Text>
        <Text style={styles.modeStripValue}>{ENERGY_LABELS[maxEnergy]}</Text>
      </View>
      <View style={styles.taskGrid}>
        {suggestions.map((task) => (
          <TaskCard key={task.slug} task={task} onPress={() => onAccept(task)} />
        ))}
      </View>
    </ScrollView>
  );
}

function TaskCard({ task, onPress }: { task: CompasTask; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.taskCard}>
      <View style={styles.taskCardTop}>
        <Text style={styles.areaLabel}>{AREA_LABELS[task.lifeArea]}</Text>
        <Text style={styles.energyLabel}>{ENERGY_LABELS[task.activationEnergy]}</Text>
      </View>
      <Text style={styles.taskTitle}>{task.name}</Text>
      <Text style={styles.taskBenefit} numberOfLines={2}>
        {task.benefits[0]}
      </Text>
      <Text style={styles.taskDuration}>{formatDuration(task.durationSeconds)}</Text>
    </Pressable>
  );
}

function TimelineView({
  activeSlot,
  history,
  onStart,
  onSkip,
}: {
  activeSlot: StoredHistoryEntry | null;
  history: StoredHistoryEntry[];
  onStart: () => void;
  onSkip: () => void;
}) {
  const visibleHistory = history.slice(0, 8);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {activeSlot ? (
        <View style={styles.activeSlot}>
          <Text style={styles.areaLabel}>{AREA_LABELS[activeSlot.lifeArea]}</Text>
          <Text style={styles.activeSlotTitle}>{activeSlot.taskName}</Text>
          <Text style={styles.activeSlotTime}>
            {formatTime(activeSlot.startAt)} - {formatTime(activeSlot.endAt)}
          </Text>
          <View style={styles.actionRow}>
            <Pressable onPress={onStart} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Iniciar</Text>
            </Pressable>
            <Pressable onPress={onSkip} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Ahora no</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.emptyTimeline}>
          <Text style={styles.emptyTitle}>Sin slot activo</Text>
          <Text style={styles.emptyText}>Elegimos uno cuando vuelvas al Selector.</Text>
        </View>
      )}
      <View style={styles.timelineList}>
        {visibleHistory.map((entry) => (
          <View key={entry.id} style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineBody}>
              <Text style={styles.timelineTitle}>{entry.taskName}</Text>
              <Text style={styles.timelineMeta}>
                {AREA_LABELS[entry.lifeArea]} · {statusLabel(entry.status)}
              </Text>
            </View>
            <Text style={styles.timelineTime}>{formatTime(entry.startAt)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function SoloView({
  slot,
  onComplete,
  onAbandon,
}: {
  slot: StoredHistoryEntry;
  onComplete: () => void;
  onAbandon: () => void;
}) {
  const [remaining, setRemaining] = useState(slot.durationSeconds);

  useEffect(() => {
    setRemaining(slot.durationSeconds);
    const interval = setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          clearInterval(interval);
          Vibration.vibrate(160);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [slot.durationSeconds, slot.id]);

  return (
    <View style={styles.solo}>
      <View style={styles.timerRing}>
        <Text style={styles.timerValue}>{formatCountdown(remaining)}</Text>
      </View>
      <Text style={styles.soloTitle}>{slot.taskName}</Text>
      <Text style={styles.soloBenefit}>
        {AREA_LABELS[slot.lifeArea]} · {ENERGY_LABELS[slot.activationEnergy]}
      </Text>
      <View style={styles.actionRow}>
        <Pressable onPress={onComplete} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Completar</Text>
        </Pressable>
        <Pressable onPress={onAbandon} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cerrar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatTime(value?: string | Date): string {
  if (!value) return '--:--';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function statusLabel(status: HistoryStatus): string {
  const labels: Record<HistoryStatus, string> = {
    suggested: 'Sugerido',
    accepted: 'Aceptado',
    completed: 'Completado',
    skipped: 'Saltado',
    abandoned: 'Cerrado',
  };
  return labels[status];
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f6ef',
  },
  shell: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brand: {
    color: '#1d2a25',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerMeta: {
    color: '#66746d',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  dayBadge: {
    alignItems: 'center',
    backgroundColor: '#213c35',
    borderRadius: 8,
    gap: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayBadgeValue: {
    color: '#f6fff7',
    fontSize: 18,
    fontWeight: '800',
  },
  dayBadgeLabel: {
    color: '#bdd9c7',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  segmented: {
    backgroundColor: '#e5e9dd',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#ffffff',
  },
  segmentDisabled: {
    opacity: 0.4,
  },
  segmentText: {
    color: '#59675f',
    fontSize: 13,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#20372f',
  },
  segmentTextDisabled: {
    color: '#8a948f',
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 36,
  },
  modeStrip: {
    alignItems: 'center',
    backgroundColor: '#dcefe6',
    borderColor: '#b7d5c6',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
  },
  modeStripLabel: {
    color: '#41524a',
    fontSize: 13,
    fontWeight: '700',
  },
  modeStripValue: {
    color: '#204f3d',
    fontSize: 15,
    fontWeight: '900',
  },
  taskGrid: {
    gap: 12,
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dde3d7',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    minHeight: 142,
    padding: 16,
  },
  taskCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  areaLabel: {
    color: '#2f6a52',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  energyLabel: {
    color: '#6d5262',
    fontSize: 12,
    fontWeight: '800',
  },
  taskTitle: {
    color: '#1f2c27',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  taskBenefit: {
    color: '#64736a',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  taskDuration: {
    color: '#925f3f',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  activeSlot: {
    backgroundColor: '#20372f',
    borderRadius: 8,
    gap: 12,
    padding: 18,
  },
  activeSlotTitle: {
    color: '#f9fbf4',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0,
  },
  activeSlotTime: {
    color: '#c7d8ce',
    fontSize: 14,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#3f7c5f',
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f1eee5',
    borderColor: '#d8d1bf',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#51483b',
    fontSize: 15,
    fontWeight: '900',
  },
  emptyTimeline: {
    backgroundColor: '#ffffff',
    borderColor: '#dde3d7',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  emptyTitle: {
    color: '#20372f',
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: '#65746c',
    fontSize: 15,
    fontWeight: '600',
  },
  timelineList: {
    gap: 10,
  },
  timelineItem: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  timelineDot: {
    backgroundColor: '#d59f61',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  timelineBody: {
    flex: 1,
    gap: 3,
  },
  timelineTitle: {
    color: '#20372f',
    fontSize: 16,
    fontWeight: '800',
  },
  timelineMeta: {
    color: '#6a766f',
    fontSize: 13,
    fontWeight: '700',
  },
  timelineTime: {
    color: '#925f3f',
    fontSize: 13,
    fontWeight: '900',
  },
  solo: {
    alignItems: 'center',
    flex: 1,
    gap: 22,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  timerRing: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#20372f',
    borderColor: '#d59f61',
    borderRadius: 120,
    borderWidth: 10,
    justifyContent: 'center',
    maxWidth: 240,
    width: '74%',
  },
  timerValue: {
    color: '#fbfff8',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: 0,
  },
  soloTitle: {
    color: '#1f2c27',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  soloBenefit: {
    color: '#66746d',
    fontSize: 15,
    fontWeight: '800',
  },
});
