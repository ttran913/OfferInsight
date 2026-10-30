'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DragOverEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Gauge, FileText, Users, ArrowLeft, GitBranch } from 'lucide-react';
import Link from 'next/link';
import OverviewTab from './components/OverviewTab';
import ApplicationsTab from './components/ApplicationsTab';
import NetworkingTab from './components/NetworkingTab';
import OpenSourceTab from './components/OpenSourceTab';
import { getApiHeaders } from '@/app/lib/api-helpers';
import { getFilteredOpenSourceColumns } from './lib/open-source-filter';
import { buildPartnershipNameMatchSet, normalizePartnerName } from './lib/partnership-name-match';
import {
  getPartnershipCriteriaForEntry,
  isProofOfWorkComplete,
} from './lib/open-source-proof-of-work';
import { computeOpenSourceCriteriaProgress } from '@/app/lib/open-source-criteria-progress';
import {
  collectClickedHelperUrlsFromEntries,
  isBabyStepComplete,
  statusRequiresBabyStepComplete,
} from './lib/open-source-baby-step';
import type {
  Application,
  ApplicationStatus,
  ApplicationColumnId,
  Networking,
  NetworkingStatus,
  NetworkingColumnId,
  OpenSourceEntry,
  OpenSourceStatus,
  OpenSourceColumnId,
  BoardTimeFilter,
} from './components/types';
import {
  applicationStatusToColumn,
  applicationColumnToStatus,
  networkingStatusToColumn,
  networkingColumnToStatus,
  openSourceStatusToColumn,
  openSourceColumnToStatus,
  APPLICATION_COMPLETION_COLUMNS,
  NETWORKING_COMPLETION_COLUMNS,
} from './components/types';

// ===== MOCK DATA FEATURE TOGGLE START =====
// Toggle this flag or comment out the seeding effect below to disable mock data.
const ENABLE_DASHBOARD_MOCKS = false;
// ===== MOCK DATA FEATURE TOGGLE END =====

const DASHBOARD_TABS = ['overview', 'opensource', 'applications', 'networking'];

export default function Page() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get('userId');
  const [viewedUserName, setViewedUserName] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [canEditViewedUser, setCanEditViewedUser] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const rawTab = searchParams.get('tab');
    // Legacy tab names (coffee chats / events) now live under the Networking board
    const tab = rawTab === 'interviews' || rawTab === 'events' ? 'networking' : rawTab;
    return tab && DASHBOARD_TABS.includes(tab) ? tab : 'overview';
  });
  const [leetCodeStats, setLeetCodeStats] = useState<{
    solved: number;
    easy: number;
    medium: number;
    hard: number;
    username: string | null;
    hasUsername: boolean;
    unavailable: boolean;
  }>({
    solved: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    username: null,
    hasUsername: false,
    unavailable: false,
  });

  // dnd-kit: Applications board state

  const [appColumns, setAppColumns] = useState<Record<ApplicationColumnId, Application[]>>({
    apply: [],
    messageRecruiter: [],
    messageHiringManager: [],
    followUp: [],
    interview: [],
  });
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [applicationsFilter, setApplicationsFilter] = useState<BoardTimeFilter>('allTime');
  const isFetchingRef = useRef(false);
  const isDraggingAppRef = useRef(false);
  const isFetchingLeetCodeStatsRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  const fetchApplications = useCallback(async () => {
    // --- MOCK DATA BYPASS FOR APPLICATIONS FETCH START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR APPLICATIONS FETCH END ---
    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) return;
    
    try {
      isFetchingRef.current = true;
      setIsLoading(true);
      const url = userIdParam ? `/api/applications_with_outreach?userId=${userIdParam}` : '/api/applications_with_outreach';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch applications');
      const data = await response.json() as Application[];
      
      // Group applications by status
      const grouped: Record<ApplicationColumnId, Application[]> = {
        apply: [],
        messageRecruiter: [],
        messageHiringManager: [],
        followUp: [],
        interview: [],
      };
      
      data.forEach((app: Application) => {
        const column = applicationStatusToColumn[app.status] || 'apply';
        grouped[column].push(app);
      });
      
      setAppColumns(grouped);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Fetch applications from API (needed for both overview metrics and applications tab)
  useEffect(() => {
    // --- MOCK DATA BYPASS FOR APPLICATIONS EFFECT START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR APPLICATIONS EFFECT END ---
    if ((activeTab === 'applications' || activeTab === 'overview') && !isFetchingRef.current) {
      fetchApplications();
    }
  }, [activeTab, fetchApplications]);

  const getApplicationColumnOfItem = (id: string): ApplicationColumnId | null => {
    const entry = (Object.keys(appColumns) as ApplicationColumnId[]).find(col => 
      appColumns[col].some(c => String(c.id) === id)
    );
    return entry ?? null;
  };

  // Debounced function to update application status (prevents rapid-fire requests when dragging)
  // Server will automatically set dateModified to current date on PATCH
  const debouncedUpdateApplicationStatus = useDebouncedCallback(
    async (id: number, status: ApplicationStatus) => {
      try {
        const url = userIdParam ? `/api/applications_with_outreach?id=${id}&userId=${userIdParam}` : `/api/applications_with_outreach?id=${id}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: getApiHeaders(),
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Failed to update status:', {
            httpStatus: response.status,
            statusText: response.statusText,
            errorData,
            id,
            cardStatus: status
          });
          throw new Error(`Failed to update status: ${response.status} - ${errorData.error || errorData.details || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Error updating status:', error);
        fetchApplications();
      }
    },
    300 // Wait 300ms after last change before sending request
  );

  const handleApplicationsDragEnd = async (event: DragEndEvent) => {
    if (!canEditViewedUser && userIdParam) return;
    const { active, over } = event;
    if (!over) {
      isDraggingAppRef.current = false;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromCol = getApplicationColumnOfItem(activeId);
    const toCol = (['apply','messageRecruiter','messageHiringManager','followUp','interview'] as ApplicationColumnId[]).includes(overId as ApplicationColumnId)
      ? (overId as ApplicationColumnId)
      : getApplicationColumnOfItem(overId);
    if (!fromCol || !toCol) {
      setActiveAppId(null);
      isDraggingAppRef.current = false;
      return;
    }

    // Update UI optimistically
    if (fromCol === toCol) {
      const items = appColumns[fromCol];
      const oldIndex = items.findIndex(i => String(i.id) === activeId);
      const newIndex = items.findIndex(i => String(i.id) === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setActiveAppId(null);
        isDraggingAppRef.current = false;
        return;
      }
      const newItems = arrayMove(items, oldIndex, newIndex);
      setAppColumns(prev => ({ ...prev, [fromCol]: newItems }));
    } else {
      const fromItems = appColumns[fromCol];
      const toItems = appColumns[toCol];
      const movingIndex = fromItems.findIndex(i => String(i.id) === activeId);
      if (movingIndex === -1) {
        setActiveAppId(null);
        isDraggingAppRef.current = false;
        return;
      }
      const movingItem = fromItems[movingIndex];
      const overIndex = toItems.findIndex(i => String(i.id) === overId);
      const insertIndex = overIndex === -1 ? toItems.length : overIndex;
      const newFrom = [...fromItems.slice(0, movingIndex), ...fromItems.slice(movingIndex + 1)];
      const newStatus = applicationColumnToStatus[toCol];
      const updatedItem: Application = {
        ...movingItem,
        status: newStatus,
        // Optimistically update dateModified to current date (server will confirm on PATCH)
        dateModified: new Date().toISOString(),
      };
      const newTo = [...toItems.slice(0, insertIndex), updatedItem, ...toItems.slice(insertIndex)];
      // Create new column arrays to ensure React detects the change
      setAppColumns(prev => ({
        apply: [...prev.apply],
        messageRecruiter: [...prev.messageRecruiter],
        messageHiringManager: [...prev.messageHiringManager],
        followUp: [...prev.followUp],
        interview: [...prev.interview],
        [fromCol]: newFrom,
        [toCol]: newTo,
      }));
      
      // Update status in database (debounced to prevent rapid-fire requests)
      // Server will automatically set dateModified to current date on PATCH
      debouncedUpdateApplicationStatus(movingItem.id, newStatus);
    }
    setActiveAppId(null);
    isDraggingAppRef.current = false;
  };

  const handleApplicationsDragStart = (event: DragStartEvent) => {
    setActiveAppId(String(event.active.id));
    isDraggingAppRef.current = true;
  };

  const handleApplicationsDragOver = (event: DragOverEvent) => {
    // onDragOver is only for visual feedback via DroppableColumn
    // State updates should only happen in onDragEnd to prevent infinite loops
    // No state updates here - just let the DroppableColumn handle visual feedback
  };

  // dnd-kit: Networking board
  const [networkingColumns, setNetworkingColumns] = useState<Record<NetworkingColumnId, Networking[]>>({
    niche: [],
    vibe: [],
    discover: [],
    offerValue: [],
    pitch: [],
  });
  const [activeNetworkingId, setActiveNetworkingId] = useState<string | null>(null);
  const [isNetworkingModalOpen, setIsNetworkingModalOpen] = useState(false);
  const [editingNetworking, setEditingNetworking] = useState<Networking | null>(null);
  const [isDeletingNetworking, setIsDeletingNetworking] = useState<number | null>(null);
  const [isLoadingNetworking, setIsLoadingNetworking] = useState(true);
  const [networkingFilter, setNetworkingFilter] = useState<BoardTimeFilter>('allTime');
  const isFetchingNetworkingRef = useRef(false);
  const isDraggingNetworkingRef = useRef(false);

  const fetchNetworking = useCallback(async () => {
    // --- MOCK DATA BYPASS FOR NETWORKING FETCH START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR NETWORKING FETCH END ---
    if (isFetchingNetworkingRef.current) return;

    try {
      isFetchingNetworkingRef.current = true;
      setIsLoadingNetworking(true);
      const url = userIdParam ? `/api/networking?userId=${userIdParam}` : '/api/networking';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch networking entries');
      const data = await response.json() as Networking[];

      const grouped: Record<NetworkingColumnId, Networking[]> = {
        niche: [],
        vibe: [],
        discover: [],
        offerValue: [],
        pitch: [],
      };

      data.forEach((entry: Networking) => {
        const column = networkingStatusToColumn[entry.status] ?? 'niche';
        grouped[column].push(entry);
      });

      setNetworkingColumns(grouped);
    } catch (error) {
      console.error('Error fetching networking entries:', error);
    } finally {
      setIsLoadingNetworking(false);
      isFetchingNetworkingRef.current = false;
    }
  }, [userIdParam]);

  // Fetch networking entries (needed for both overview metrics and networking tab)
  useEffect(() => {
    // --- MOCK DATA BYPASS FOR NETWORKING EFFECT START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR NETWORKING EFFECT END ---
    if ((activeTab === 'networking' || activeTab === 'overview') && !isFetchingNetworkingRef.current) {
      fetchNetworking();
    }
  }, [activeTab, fetchNetworking]);

  const getNetworkingColumnOfItem = (id: string): NetworkingColumnId | null => {
    const entry = (Object.keys(networkingColumns) as NetworkingColumnId[]).find(col =>
      networkingColumns[col].some(card => String(card.id) === id)
    );
    return entry ?? null;
  };

  // Debounced function to update networking status (prevents rapid-fire requests when dragging)
  // Server will automatically set dateModified to current date on PATCH
  const debouncedUpdateNetworkingStatus = useDebouncedCallback(
    async (id: number, status: NetworkingStatus) => {
      try {
        const url = userIdParam ? `/api/networking?id=${id}&userId=${userIdParam}` : `/api/networking?id=${id}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: getApiHeaders(),
          body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error('Failed to update networking status');
      } catch (error) {
        console.error('Error updating networking status:', error);
        fetchNetworking();
      }
    },
    300 // Wait 300ms after last change before sending request
  );

  const handleNetworkingDragEnd = async (event: DragEndEvent) => {
    if (!canEditViewedUser && userIdParam) return;
    const { active, over } = event;
    if (!over) {
      isDraggingNetworkingRef.current = false;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromCol = getNetworkingColumnOfItem(activeId);
    const toCol = (['niche', 'vibe', 'discover', 'offerValue', 'pitch'] as NetworkingColumnId[]).includes(overId as NetworkingColumnId)
      ? (overId as NetworkingColumnId)
      : getNetworkingColumnOfItem(overId);
    if (!fromCol || !toCol) {
      setActiveNetworkingId(null);
      isDraggingNetworkingRef.current = false;
      return;
    }

    if (fromCol === toCol) {
      const items = networkingColumns[fromCol];
      const oldIndex = items.findIndex(i => String(i.id) === activeId);
      const newIndex = items.findIndex(i => String(i.id) === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setActiveNetworkingId(null);
        isDraggingNetworkingRef.current = false;
        return;
      }
      const newItems = arrayMove(items, oldIndex, newIndex);
      setNetworkingColumns(prev => ({ ...prev, [fromCol]: newItems }));
    } else {
      const fromItems = networkingColumns[fromCol];
      const toItems = networkingColumns[toCol];
      const movingIndex = fromItems.findIndex(i => String(i.id) === activeId);
      if (movingIndex === -1) {
        setActiveNetworkingId(null);
        isDraggingNetworkingRef.current = false;
        return;
      }
      const movingItem = fromItems[movingIndex];
      const overIndex = toItems.findIndex(i => String(i.id) === overId);
      const insertIndex = overIndex === -1 ? toItems.length : overIndex;
      const newStatus = networkingColumnToStatus[toCol];
      const updatedItem: Networking = {
        ...movingItem,
        status: newStatus,
        // Optimistically update dateModified to current date (server will confirm on PATCH)
        dateModified: new Date().toISOString(),
      };
      const newFrom = [...fromItems.slice(0, movingIndex), ...fromItems.slice(movingIndex + 1)];
      const newTo = [...toItems.slice(0, insertIndex), updatedItem, ...toItems.slice(insertIndex)];
      // Create new column arrays to ensure React detects the change
      setNetworkingColumns(prev => ({
        niche: [...prev.niche],
        vibe: [...prev.vibe],
        discover: [...prev.discover],
        offerValue: [...prev.offerValue],
        pitch: [...prev.pitch],
        [fromCol]: newFrom,
        [toCol]: newTo,
      }));

      // Update status in database (debounced to prevent rapid-fire requests)
      // Server will automatically set dateModified to current date on PATCH
      debouncedUpdateNetworkingStatus(movingItem.id, newStatus);
    }
    setActiveNetworkingId(null);
    isDraggingNetworkingRef.current = false;
  };

  const handleNetworkingDragStart = (event: DragStartEvent) => {
    setActiveNetworkingId(String(event.active.id));
    isDraggingNetworkingRef.current = true;
  };

  const handleNetworkingDragOver = (event: DragOverEvent) => {
    // onDragOver is only for visual feedback via DroppableColumn
  };

  // ----- MOCK DATA SEED TRACKER START -----
const hasSeededMockDataRef = useRef(false);
// ----- MOCK DATA SEED TRACKER END -----

  // dnd-kit: OpenSource board
  const [openSourceColumns, setOpenSourceColumns] = useState<Record<OpenSourceColumnId, OpenSourceEntry[]>>({
    plan: [],
    babyStep: [],
    inProgress: [],
    done: [],
  });
  const [activeOpenSourceId, setActiveOpenSourceId] = useState<string | null>(null);
  const [isOpenSourceModalOpen, setIsOpenSourceModalOpen] = useState(false);
  const [editingOpenSource, setEditingOpenSource] = useState<OpenSourceEntry | null>(null);
  const [isLoadingOpenSource, setIsLoadingOpenSource] = useState(true);
  const [openSourceFilter, setOpenSourceFilter] = useState<BoardTimeFilter>('allTime');
  const [selectedPartnership, setSelectedPartnership] = useState<string | null>(null);
  const [selectedPartnershipId, setSelectedPartnershipId] = useState<number | null>(null);
  const [activePartnershipDbId, setActivePartnershipDbId] = useState<number | null>(null);
  const [activePartnershipCriteria, setActivePartnershipCriteria] = useState<any[]>([]);
  const [completedPartnerships, setCompletedPartnerships] = useState<
    Array<{
      id: number;
      partnershipId: number;
      partnershipName: string;
      criteria: any[];
      startedAt?: string | null;
      completedAt?: string | null;
    }>
  >([]);
  const [viewingCompletedPartnershipName, setViewingCompletedPartnershipName] = useState<string | null>(null);
  const [availablePartnerships, setAvailablePartnerships] = useState<Array<{ id: number; name: string; spotsRemaining: number }>>([]);
  const [fullPartnerships, setFullPartnerships] = useState<Array<{ id: number; name: string }>>([]);
  const isFetchingOpenSourceRef = useRef(false);
  const isFetchingPartnershipRef = useRef(false);
  const isFetchingAvailablePartnershipsRef = useRef(false);
  const isDraggingOpenSourceRef = useRef(false);
  const [showProofOfWorkWarning, setShowProofOfWorkWarning] = useState(false);
  const [showBabyStepWarning, setShowBabyStepWarning] = useState(false);

  const fetchOpenSourceEntries = useCallback(async () => {
    // --- MOCK DATA BYPASS FOR OPENSOURCE FETCH START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR OPENSOURCE FETCH END ---
    if (isFetchingOpenSourceRef.current) return;

    try {
      isFetchingOpenSourceRef.current = true;
      setIsLoadingOpenSource(true);
        const url = userIdParam ? `/api/open_source?userId=${userIdParam}` : '/api/open_source';
      const response = await fetch(url);
      if (!response.ok) {
        // Do not wipe the board on transient 401/503/session races.
        console.warn('Open source fetch failed:', response.status, response.statusText);
        return;
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        console.error('Open source: expected array', data);
        return;
      }

      const grouped: Record<OpenSourceColumnId, OpenSourceEntry[]> = {
        plan: [],
        babyStep: [],
        inProgress: [],
        done: [],
      };

      (data as OpenSourceEntry[]).forEach((entry: OpenSourceEntry) => {
        const column = openSourceStatusToColumn[entry.status] ?? 'plan';
        grouped[column].push(entry);
      });

      setOpenSourceColumns(grouped);
    } catch (error) {
      console.error('Error fetching open source entries:', error);
    } finally {
      setIsLoadingOpenSource(false);
      isFetchingOpenSourceRef.current = false;
    }
  }, [userIdParam]);

  useEffect(() => {
    // --- MOCK DATA BYPASS FOR OPENSOURCE EFFECT START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR OPENSOURCE EFFECT END ---
    if ((activeTab === 'opensource' || activeTab === 'overview') && !isFetchingOpenSourceRef.current) {
      fetchOpenSourceEntries();
    }
  }, [activeTab, fetchOpenSourceEntries]);

  // Fetch user's active partnership on load
  const fetchActivePartnership = useCallback(async () => {
    if (isFetchingPartnershipRef.current) return;

    try {
      isFetchingPartnershipRef.current = true;
      const url = userIdParam ? `/api/users/partnership?userId=${userIdParam}` : '/api/users/partnership';
      const response = await fetch(url);
      if (!response.ok) {
        // No partnership saved yet
        setSelectedPartnership(null);
        setSelectedPartnershipId(null);
        setActivePartnershipDbId(null);
        setCompletedPartnerships([]);
        return;
      }
      const data = await response.json();
      const completed = (data.completed || []).map(
        (p: {
          id: number;
          partnershipId: number;
          partnershipName: string;
          criteria: any[];
          startedAt?: string | null;
          completedAt?: string | null;
        }) => ({
          id: p.id,
          partnershipId: p.partnershipId,
          partnershipName: p.partnershipName,
          criteria: p.criteria || [],
          startedAt: p.startedAt ?? null,
          completedAt: p.completedAt ?? null,
        })
      );
      setCompletedPartnerships(completed);
      if (data.active) {
        setSelectedPartnership(data.active.partnershipName);
        setSelectedPartnershipId(data.active.partnershipId);
        setActivePartnershipDbId(data.active.id);
        setActivePartnershipCriteria(data.active.criteria || []);
        // Keep completed-view selection; refetch can run after user clicks completed history.
      } else if (completed.length > 0) {
        // No active partnership, but there are completed ones - show the most recent completed
        const mostRecent = completed[0]; // Already sorted by completedAt desc from API
        setSelectedPartnership(mostRecent.partnershipName);
        setSelectedPartnershipId(null); // No active partnership ID
        setActivePartnershipDbId(null);
        setActivePartnershipCriteria([]); // Will be loaded when viewing completed partnership
        setViewingCompletedPartnershipName(mostRecent.partnershipName); // Show completed cards
      } else {
        // No active and no completed - show selection screen
        setSelectedPartnership(null);
        setSelectedPartnershipId(null);
        setActivePartnershipDbId(null);
        setViewingCompletedPartnershipName(null);
      }
    } catch (error) {
      console.error('Error fetching active partnership:', error);
    } finally {
      isFetchingPartnershipRef.current = false;
    }
  }, [userIdParam]);

  // Refresh completed partnerships list without changing selection state (used after completing and going to selection).
  const refreshCompletedPartnerships = useCallback(async () => {
    try {
      const url = userIdParam ? `/api/users/partnership?userId=${userIdParam}` : '/api/users/partnership';
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      const completed = (data.completed || []).map(
        (p: {
          id: number;
          partnershipId: number;
          partnershipName: string;
          criteria: any[];
          startedAt?: string | null;
          completedAt?: string | null;
        }) => ({
          id: p.id,
          partnershipId: p.partnershipId,
          partnershipName: p.partnershipName,
          criteria: p.criteria || [],
          startedAt: p.startedAt ?? null,
          completedAt: p.completedAt ?? null,
        })
      );
      setCompletedPartnerships(completed);
    } catch (error) {
      console.error('Error refreshing completed partnerships:', error);
    }
  }, [userIdParam]);

  useEffect(() => {
    if (ENABLE_DASHBOARD_MOCKS) return;
    if ((activeTab === 'opensource' || activeTab === 'overview') && !isFetchingPartnershipRef.current) {
      fetchActivePartnership();
    }
  }, [activeTab, fetchActivePartnership]);

  // Fetch available partnerships
  const fetchAvailablePartnerships = useCallback(async () => {
    if (isFetchingAvailablePartnershipsRef.current) return;

    try {
      isFetchingAvailablePartnershipsRef.current = true;
      const response = await fetch('/api/partnerships/available');
      if (!response.ok) {
        console.error('Failed to fetch available partnerships');
        return;
      }
      const data = await response.json();
      setAvailablePartnerships(data.available || []);
      setFullPartnerships(data.full || []);
    } catch (error) {
      console.error('Error fetching available partnerships:', error);
    } finally {
      isFetchingAvailablePartnershipsRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (ENABLE_DASHBOARD_MOCKS) return;
    if ((activeTab === 'opensource' || activeTab === 'overview') && !isFetchingAvailablePartnershipsRef.current) {
      fetchAvailablePartnerships();
    }
  }, [activeTab, fetchAvailablePartnerships]);

  const getOpenSourceColumnOfItem = (id: string): OpenSourceColumnId | null => {
    const entry = (Object.keys(openSourceColumns) as OpenSourceColumnId[]).find(col =>
      openSourceColumns[col].some(entry => String(entry.id) === id)
    );
    return entry ?? null;
  };

  // Debounced function to update open source status
  const debouncedUpdateOpenSourceStatus = useDebouncedCallback(
    async (id: number, status: OpenSourceStatus) => {
      try {
        const url = userIdParam ? `/api/open_source?id=${id}&userId=${userIdParam}` : `/api/open_source?id=${id}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: getApiHeaders(),
          body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error('Failed to update open source status');
      } catch (error) {
        console.error('Error updating open source status:', error);
        fetchOpenSourceEntries();
      }
    },
    300
  );

  const handleOpenSourceDragEnd = async (event: DragEndEvent) => {
    if (!canEditViewedUser && userIdParam) return;
    const { active, over } = event;
    if (!over) {
      isDraggingOpenSourceRef.current = false;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromCol = getOpenSourceColumnOfItem(activeId);
    const toCol = (['plan', 'babyStep', 'inProgress', 'done'] as OpenSourceColumnId[]).includes(overId as OpenSourceColumnId)
      ? (overId as OpenSourceColumnId)
      : getOpenSourceColumnOfItem(overId);
    if (!fromCol || !toCol) {
      setActiveOpenSourceId(null);
      isDraggingOpenSourceRef.current = false;
      return;
    }

    if (fromCol === toCol) {
      const items = openSourceColumns[fromCol];
      const oldIndex = items.findIndex(i => String(i.id) === activeId);
      const newIndex = items.findIndex(i => String(i.id) === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setActiveOpenSourceId(null);
        isDraggingOpenSourceRef.current = false;
        return;
      }
      const newItems = arrayMove(items, oldIndex, newIndex);
      setOpenSourceColumns(prev => ({ ...prev, [fromCol]: newItems }));
    } else {
      const fromItems = openSourceColumns[fromCol];
      const toItems = openSourceColumns[toCol];
      const movingIndex = fromItems.findIndex(i => String(i.id) === activeId);
      if (movingIndex === -1) {
        setActiveOpenSourceId(null);
        isDraggingOpenSourceRef.current = false;
        return;
      }
      const movingItem = fromItems[movingIndex];

      const partnershipCriteria = getPartnershipCriteriaForEntry(
        movingItem,
        activePartnershipCriteria,
        completedPartnerships
      );
      const sharedClickedHelperUrls = collectClickedHelperUrlsFromEntries(
        (Object.keys(openSourceColumns) as OpenSourceColumnId[]).flatMap(
          (col) => openSourceColumns[col]
        )
      );
      if (
        statusRequiresBabyStepComplete(fromCol, toCol) &&
        !isBabyStepComplete(movingItem, partnershipCriteria, sharedClickedHelperUrls)
      ) {
        setShowBabyStepWarning(true);
        setActiveOpenSourceId(null);
        isDraggingOpenSourceRef.current = false;
        return;
      }
      if (toCol === 'done' && !isProofOfWorkComplete(movingItem, partnershipCriteria)) {
        setShowProofOfWorkWarning(true);
        setActiveOpenSourceId(null);
        isDraggingOpenSourceRef.current = false;
        return;
      }

      const overIndex = toItems.findIndex(i => String(i.id) === overId);
      const insertIndex = overIndex === -1 ? toItems.length : overIndex;
      const newFrom = [...fromItems.slice(0, movingIndex), ...fromItems.slice(movingIndex + 1)];
      const newStatus = openSourceColumnToStatus[toCol];
      const updatedItem: OpenSourceEntry = {
        ...movingItem,
        status: newStatus,
        dateModified: new Date().toISOString(),
      };
      const newTo = [...toItems.slice(0, insertIndex), updatedItem, ...toItems.slice(insertIndex)];
      setOpenSourceColumns(prev => ({
        plan: [...prev.plan],
        babyStep: [...prev.babyStep],
        inProgress: [...prev.inProgress],
        done: [...prev.done],
        [fromCol]: newFrom,
        [toCol]: newTo,
      }));
      
      debouncedUpdateOpenSourceStatus(movingItem.id, newStatus);
    }
    setActiveOpenSourceId(null);
    isDraggingOpenSourceRef.current = false;
  };

  const handleOpenSourceDragStart = (event: DragStartEvent) => {
    setActiveOpenSourceId(String(event.active.id));
    isDraggingOpenSourceRef.current = true;
  };

  const handleOpenSourceDragOver = (event: DragOverEvent) => {
    // onDragOver is only for visual feedback via DroppableColumn
  };

  const [userData, setUserData] = useState<{
    appsWithOutreachPerWeek?: number | null;
    networkingPerMonth?: number | null;
  } | null>(null);

  // <<<<< MOCK DATA SEEDING EFFECT START >>>>>
  useEffect(() => {
    if (!ENABLE_DASHBOARD_MOCKS || hasSeededMockDataRef.current) return;
    hasSeededMockDataRef.current = true;

    const now = new Date();
    const isoWithDelta = ({
      months = 0,
      days = 0,
      hour = 10,
      minute = 0,
    }: {
      months?: number;
      days?: number;
      hour?: number;
      minute?: number;
    }) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() + months);
      if (days !== 0) {
        d.setDate(d.getDate() + days);
      }
      d.setHours(hour, minute, 0, 0);
      return d.toISOString();
    };

    const mockApplications: Record<ApplicationColumnId, Application[]> = {
      apply: [
        {
          id: 1001,
          company: 'Acme Corp',
          status: 'apply',
          dateCreated: isoWithDelta({ months: -1, days: -3, hour: 9 }),
          userId: 'mock-user',
        },
        {
          id: 1002,
          company: 'Globex',
          recruiter: 'Jordan Smith',
          status: 'apply',
          dateCreated: isoWithDelta({ months: -4, days: -12, hour: 14 }),
          userId: 'mock-user',
        },
      ],
      messageRecruiter: [
        {
          id: 1003,
          company: 'Initech',
          recruiter: 'Ava Chen',
          msgToRecruiter: 'Followed up with recruiter on LinkedIn.',
          status: 'messageRecruiter',
          dateCreated: isoWithDelta({ months: -2, days: -6, hour: 11 }),
          userId: 'mock-user',
        },
      ],
      messageHiringManager: [
        {
          id: 1004,
          company: 'Vandelay Industries',
          hiringManager: 'Art Vandelay',
          msgToManager: 'Sent tailored cover letter and message.',
          status: 'messageHiringManager',
          dateCreated: isoWithDelta({ months: -5, days: -9, hour: 16 }),
          userId: 'mock-user',
        },
      ],
      followUp: [
        {
          id: 1005,
          company: 'Stark Industries',
          status: 'followUp',
          dateCreated: isoWithDelta({ months: -7, days: -4, hour: 13 }),
          userId: 'mock-user',
        },
      ],
      interview: [
        {
          id: 1006,
          company: 'Wayne Enterprises',
          hiringManager: 'Lucius Fox',
          status: 'interview',
          dateCreated: isoWithDelta({ months: -10, days: -15, hour: 10 }),
          userId: 'mock-user',
        },
      ],
    };

    const mockNetworking: Record<NetworkingColumnId, Networking[]> = {
      niche: [
        {
          id: 2000,
          nicheType: 'techEvent',
          nicheName: 'Local AI Meetup',
          status: 'niche',
          dateCreated: isoWithDelta({ months: 0, days: -2, hour: 10 }),
          userId: 'mock-user',
        },
      ],
      vibe: [
        {
          id: 2001,
          nicheType: 'openSource',
          nicheName: 'Open Source Sprint',
          status: 'vibe',
          dateCreated: isoWithDelta({ months: 0, days: -8, hour: 12 }),
          userId: 'mock-user',
        },
      ],
      discover: [
        {
          id: 2002,
          nicheType: 'alumni',
          nicheName: 'University Alumni Network',
          contactName: 'Priya Patel',
          summary: 'Learned about the team structure.',
          status: 'discover',
          dateCreated: isoWithDelta({ months: -3, days: -10, hour: 15 }),
          userId: 'mock-user',
        },
      ],
      offerValue: [
        {
          id: 2003,
          nicheType: 'hobby',
          nicheName: 'Climbing Gym',
          contactName: 'Leo Johnson',
          artifact: 'Shared a project walkthrough.',
          status: 'offerValue',
          dateCreated: isoWithDelta({ months: -6, days: -5, hour: 9 }),
          userId: 'mock-user',
        },
      ],
      pitch: [
        {
          id: 2004,
          nicheType: 'techEvent',
          nicheName: 'Startup Expo',
          contactName: 'Noah Kim',
          pitchAsk: 'Asked for an intro to the hiring manager.',
          pitchResult: 'Intro made.',
          status: 'pitch',
          dateCreated: isoWithDelta({ months: -8, days: -11, hour: 10 }),
          userId: 'mock-user',
        },
      ],
    };

    setAppColumns(mockApplications);
    setNetworkingColumns(mockNetworking);
    setIsLoading(false);
    setIsLoadingNetworking(false);
    setActiveTab('overview');
    setUserData({
      appsWithOutreachPerWeek: 6,
      networkingPerMonth: 6,
    });
  }, []);
  // <<<<< MOCK DATA SEEDING EFFECT END >>>>>

  // Check if viewing as instructor and fetch user name
  useEffect(() => {
    async function checkInstructorAndFetchUserName() {
      if (!userIdParam) {
        setIsInstructor(false);
        setCanEditViewedUser(true);
        setViewedUserName(null);
        return;
      }

      try {
        // Check if current user is an instructor
        const instructorRes = await fetch('/api/instructor');
        if (instructorRes.ok) {
          const instructorData = await instructorRes.json();
          setIsInstructor(true);
          setCanEditViewedUser(Boolean(instructorData?.canEditViewedUser));
          
          // Fetch the user's name
          const userRes = await fetch(`/api/instructor/students`);
          if (userRes.ok) {
            const data = await userRes.json();
            const user = data.students?.find((u: { id: string }) => u.id === userIdParam);
            if (user) {
              setViewedUserName(user.name);
            }
          }
        } else {
          setIsInstructor(false);
          setCanEditViewedUser(true);
          setViewedUserName(null);
        }
      } catch (error) {
        console.error('Error checking instructor status or fetching user name:', error);
        setIsInstructor(false);
        setCanEditViewedUser(true);
        setViewedUserName(null);
      }
    }

    checkInstructorAndFetchUserName();
  }, [userIdParam]);

  const fetchLeetCodeStats = useCallback(async () => {
    if (ENABLE_DASHBOARD_MOCKS) {
      setLeetCodeStats({
        solved: 33,
        easy: 20,
        medium: 12,
        hard: 1,
        username: 'mock-user',
        hasUsername: true,
        unavailable: false,
      });
      return;
    }
    if (isFetchingLeetCodeStatsRef.current) return;
    try {
      isFetchingLeetCodeStatsRef.current = true;
      const url = userIdParam ? `/api/leetcode/stats?userId=${userIdParam}` : '/api/leetcode/stats';
      const response = await fetch(url);
      if (!response.ok) {
        setLeetCodeStats((prev) => ({ ...prev, unavailable: true }));
        return;
      }
      const data = await response.json();
      setLeetCodeStats({
        solved: Number(data.solved) || 0,
        easy: Number(data.easy) || 0,
        medium: Number(data.medium) || 0,
        hard: Number(data.hard) || 0,
        username: typeof data.username === 'string' && data.username.trim().length > 0 ? data.username.trim() : null,
        hasUsername: Boolean(data.hasUsername),
        unavailable: Boolean(data.unavailable),
      });
    } catch (error) {
      console.error('Error fetching LeetCode stats:', error);
      setLeetCodeStats((prev) => ({ ...prev, unavailable: true }));
    } finally {
      isFetchingLeetCodeStatsRef.current = false;
    }
  }, [userIdParam]);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchLeetCodeStats();
    }
  }, [activeTab, fetchLeetCodeStats]);

  useEffect(() => {
    if (ENABLE_DASHBOARD_MOCKS) return;
    let isMounted = true;
    const maxRetries = 3;
    const retryDelay = 500; // 500ms between retries
    
    const fetchUser = async (attempt: number = 0) => {
      try {
        const url = userIdParam ? `/api/users/onboarding2?userId=${userIdParam}` : '/api/users/onboarding2';
        const res = await fetch(url);
        if (!res.ok) {
          // If user not found and we haven't exceeded retries, retry after a delay
          // This handles race conditions where the user was just created
          if (res.status === 404 && attempt < maxRetries && isMounted) {
            setTimeout(() => {
              if (isMounted) {
                fetchUser(attempt + 1);
              }
            }, retryDelay * (attempt + 1)); // Exponential backoff
            return;
          }
          return;
        }
        const user = await res.json();
        if (isMounted) {
          setUserData(user);
        }
      } catch (e) {
        // If error and we haven't exceeded retries, retry after a delay
        if (attempt < maxRetries && isMounted) {
          setTimeout(() => {
            if (isMounted) {
              fetchUser(attempt + 1);
            }
          }, retryDelay * (attempt + 1));
        }
      }
    };
    fetchUser();
    return () => { isMounted = false; };
  }, [userIdParam]);

  // Calculate applications metrics for this month
  const metricsMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    // For testing a specific month, replace the line above with something like:
    // const start = new Date(2024, 0, 1); // January 2024
    return start;
  }, []);

  const metricsMonthEnd = useMemo(() => {
    const end = new Date(metricsMonth);
    end.setMonth(end.getMonth() + 1);
    return end;
  }, [metricsMonth]);

  const getHabitStatusStyles = useCallback((
    count: number,
    goal: number,
    percentage: number
  ): {
    dotClass: string;
    textClass: string;
    barClass: string;
  } => {
    if (goal > 0 && percentage >= 100) {
      return {
        dotClass: 'bg-purple-500',
        textClass: 'text-purple-600',
        barClass: 'bg-purple-500',
      };
    }
    if (count <= 0) {
      return {
        dotClass: 'bg-red-500',
        textClass: 'text-red-600',
        barClass: 'bg-red-500',
      };
    }
    if (count === 1) {
      return {
        dotClass: 'bg-yellow-500',
        textClass: 'text-yellow-600',
        barClass: 'bg-yellow-500',
      };
    }
    return {
      dotClass: 'bg-green-500',
      textClass: 'text-green-600',
      barClass: 'bg-green-500',
    };
  }, []);

  const applicationsMetrics = useMemo(() => {
    // Count applications in columns: messagedHiringManager, messagedRecruiter, followedUp, interview
    // (any column to the right of "applied")
    let count = 0;
    
    APPLICATION_COMPLETION_COLUMNS.forEach(col => {
      appColumns[col].forEach(app => {
        const appDate = new Date(app.dateCreated);
        if (!Number.isNaN(appDate.getTime()) && appDate >= metricsMonth && appDate < metricsMonthEnd) {
          count++;
        }
      });
    });

    // Goal is appsWithOutreachPerWeek * 4 (4 weeks per month)
    const goal = userData?.appsWithOutreachPerWeek ? userData.appsWithOutreachPerWeek * 4 : 0;
    const rawPercentage = goal > 0 ? (count / goal) * 100 : 0;
    const clampedPercentage = Math.min(Math.max(rawPercentage, 0), 100);
    const styles = getHabitStatusStyles(count, goal, clampedPercentage);
    const statusText = `${Math.round(clampedPercentage)}%`;

    return {
      count,
      goal,
      percentage: clampedPercentage,
      statusText,
      statusTextColor: styles.textClass,
      statusDotClass: styles.dotClass,
      statusBarClass: styles.barClass,
    };
  }, [appColumns, userData, metricsMonth, metricsMonthEnd, getHabitStatusStyles]);

  const networkingMetrics = useMemo(() => {
    // Count cards in completion columns whose dateModified (fallback dateCreated) is in the current month
    let count = 0;

    NETWORKING_COMPLETION_COLUMNS.forEach(col => {
      networkingColumns[col].forEach(card => {
        const dateValue = card.dateModified ?? card.dateCreated;
        const cardDate = new Date(dateValue);
        if (!Number.isNaN(cardDate.getTime()) && cardDate >= metricsMonth && cardDate < metricsMonthEnd) {
          count++;
        }
      });
    });

    const goal = userData?.networkingPerMonth ?? 0;
    const rawPercentage = goal > 0 ? (count / goal) * 100 : 0;
    const clampedPercentage = Math.min(Math.max(rawPercentage, 0), 100);
    const styles = getHabitStatusStyles(count, goal, clampedPercentage);
    const statusText = `${Math.round(clampedPercentage)}%`;

    return {
      count,
      goal,
      percentage: clampedPercentage,
      statusText,
      statusTextColor: styles.textClass,
      statusDotClass: styles.dotClass,
      statusBarClass: styles.barClass,
    };
  }, [networkingColumns, userData, metricsMonth, metricsMonthEnd, getHabitStatusStyles]);

  // Calculate all-time counts for each metric
  const applicationsAllTimeCount = useMemo(() => {
    let count = 0;
    APPLICATION_COMPLETION_COLUMNS.forEach(col => {
      count += appColumns[col].length;
    });
    return count;
  }, [appColumns]);

  const networkingAllTimeCount = useMemo(() => {
    let count = 0;
    NETWORKING_COMPLETION_COLUMNS.forEach(col => {
      count += networkingColumns[col].length;
    });
    return count;
  }, [networkingColumns]);

  const isWithinCurrentMonth = useCallback(
    (value?: string | null) => {
      if (!value) return false;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return false;
      return d >= metricsMonth && d < metricsMonthEnd;
    },
    [metricsMonth, metricsMonthEnd]
  );


  const openSourceCriteria = useMemo(() => {
    const doneEntries = openSourceColumns.done ?? [];
    const nameSet = selectedPartnership
      ? buildPartnershipNameMatchSet(
          selectedPartnershipId,
          selectedPartnership,
          availablePartnerships,
          fullPartnerships
        )
      : null;
    const activePartnershipDoneEntries =
      nameSet && nameSet.size > 0
        ? doneEntries.filter((entry) => {
            const n = normalizePartnerName(entry.partnershipName);
            return n !== '' && nameSet.has(n);
          })
        : [];
    const { completed, total } = computeOpenSourceCriteriaProgress(
      activePartnershipCriteria,
      activePartnershipDoneEntries
    );

    return { completedCriteria: completed, totalCriteria: total };
  }, [
    openSourceColumns,
    selectedPartnership,
    selectedPartnershipId,
    availablePartnerships,
    fullPartnerships,
    activePartnershipCriteria,
  ]);

  const filteredAppColumns = useMemo(() => {
    if (applicationsFilter === 'allTime') return appColumns;
    const filtered: Record<ApplicationColumnId, Application[]> = {
      apply: [],
      messageRecruiter: [],
      messageHiringManager: [],
      followUp: [],
      interview: [],
    };
    (Object.keys(appColumns) as ApplicationColumnId[]).forEach(columnId => {
      if (applicationsFilter === 'modifiedThisMonth') {
        filtered[columnId] = appColumns[columnId].filter(app => isWithinCurrentMonth(app.dateModified));
      }
    });
    return filtered;
  }, [appColumns, applicationsFilter, isWithinCurrentMonth]);

  const filteredNetworkingColumns = useMemo(() => {
    if (networkingFilter === 'allTime') return networkingColumns;
    const filtered: Record<NetworkingColumnId, Networking[]> = {
      niche: [],
      vibe: [],
      discover: [],
      offerValue: [],
      pitch: [],
    };
    (Object.keys(networkingColumns) as NetworkingColumnId[]).forEach(columnId => {
      if (networkingFilter === 'modifiedThisMonth') {
        filtered[columnId] = networkingColumns[columnId].filter(card =>
          isWithinCurrentMonth(card.dateModified)
        );
      }
    });
    return filtered;
  }, [networkingColumns, networkingFilter, isWithinCurrentMonth]);

  const filteredOpenSourceColumns = useMemo(() => {
    return getFilteredOpenSourceColumns({
      openSourceColumns,
      openSourceFilter,
      selectedPartnership,
      selectedPartnershipId,
      viewingCompletedPartnershipName,
      completedPartnerships,
      availablePartnerships,
      fullPartnerships,
      isWithinCurrentMonth,
    });
  }, [
    openSourceColumns,
    openSourceFilter,
    selectedPartnership,
    selectedPartnershipId,
    viewingCompletedPartnershipName,
    completedPartnerships,
    availablePartnerships,
    fullPartnerships,
    isWithinCurrentMonth,
  ]);

  const selectTab = (tabId: string) => {
    setActiveTab(tabId);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.replaceState(null, '', url);
  };


  return (
    <div className="bg-white text-gray-900 min-h-[calc(100dvh-var(--navbar-height))] w-full">
      {/* Instructor View Banner */}
      {isInstructor && userIdParam && viewedUserName && (
        <div className="border-b border-blue-100 bg-blue-50 w-full">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-electric-blue font-semibold">
                  Viewing dashboard as instructor
                </div>
                <div className="text-gray-600">
                  User: <span className="text-gray-900 font-medium">{viewedUserName}</span>
                </div>
              </div>
              <Link
                href="/instructor/dashboard"
                className="flex items-center gap-2 text-electric-blue hover:text-blue-400 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm sm:text-base">Back to Instructor Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Main Navigation Tabs */}
        <section className="mb-8">
          <div className="flex border-b border-gray-200 bg-white rounded-t-lg overflow-x-auto">
            <div className="flex min-w-full">
              <button 
                onClick={() => selectTab('overview')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'overview' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Gauge className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Overview
              </button>
              <button 
                onClick={() => selectTab('opensource')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'opensource' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <GitBranch className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Open Source
              </button>
              <button 
                onClick={() => selectTab('applications')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'applications' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <FileText className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Applications
              </button>
              <button 
                onClick={() => selectTab('networking')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'networking' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Users className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Networking
              </button>
            </div>
          </div>
        </section>

        {/* Overview Content */}
        {activeTab === 'overview' && (
          <OverviewTab
            openSourceCriteria={openSourceCriteria}
            leetCodeStats={leetCodeStats}
            applicationsMetrics={applicationsMetrics}
            applicationsAllTimeCount={applicationsAllTimeCount}
            networkingMetrics={networkingMetrics}
            networkingAllTimeCount={networkingAllTimeCount}
            handleHabitCardClick={selectTab}
            instructorViewUserId={userIdParam}
          />
        )}

        {/* Applications Content */}
        {activeTab === 'applications' && (
          <ApplicationsTab
            filteredAppColumns={filteredAppColumns}
            appColumns={appColumns}
            setAppColumns={setAppColumns}
            isLoading={isLoading}
            applicationsFilter={applicationsFilter}
            setApplicationsFilter={setApplicationsFilter}
            setIsModalOpen={setIsModalOpen}
            setEditingApp={setEditingApp}
            sensors={sensors}
            handleApplicationsDragStart={handleApplicationsDragStart}
            handleApplicationsDragOver={handleApplicationsDragOver}
            handleApplicationsDragEnd={handleApplicationsDragEnd}
            activeAppId={activeAppId}
            getApplicationColumnOfItem={getApplicationColumnOfItem}
            isModalOpen={isModalOpen}
            editingApp={editingApp}
            setIsDeleting={setIsDeleting}
            isDeleting={isDeleting}
            fetchApplications={fetchApplications}
            isDraggingAppRef={isDraggingAppRef}
            userIdParam={userIdParam}
            readOnly={!canEditViewedUser && !!userIdParam}
          />
        )}

        {/* Networking Content */}
        {activeTab === 'networking' && (
          <NetworkingTab
            filteredNetworkingColumns={filteredNetworkingColumns}
            networkingColumns={networkingColumns}
            setNetworkingColumns={setNetworkingColumns}
            isLoadingNetworking={isLoadingNetworking}
            networkingFilter={networkingFilter}
            setNetworkingFilter={setNetworkingFilter}
            setIsNetworkingModalOpen={setIsNetworkingModalOpen}
            setEditingNetworking={setEditingNetworking}
            sensors={sensors}
            handleNetworkingDragStart={handleNetworkingDragStart}
            handleNetworkingDragOver={handleNetworkingDragOver}
            handleNetworkingDragEnd={handleNetworkingDragEnd}
            activeNetworkingId={activeNetworkingId}
            getNetworkingColumnOfItem={getNetworkingColumnOfItem}
            isNetworkingModalOpen={isNetworkingModalOpen}
            editingNetworking={editingNetworking}
            setIsDeletingNetworking={setIsDeletingNetworking}
            isDeletingNetworking={isDeletingNetworking}
            fetchNetworking={fetchNetworking}
            isDraggingNetworkingRef={isDraggingNetworkingRef}
            userIdParam={userIdParam}
            readOnly={!canEditViewedUser && !!userIdParam}
          />
        )}

        {/* Open Source Content */}
        {activeTab === 'opensource' && (
          <OpenSourceTab
            filteredOpenSourceColumns={filteredOpenSourceColumns}
            openSourceColumns={openSourceColumns}
            setOpenSourceColumns={setOpenSourceColumns}
            isLoading={isLoadingOpenSource}
            openSourceFilter={openSourceFilter}
            setOpenSourceFilter={setOpenSourceFilter}
            setIsModalOpen={setIsOpenSourceModalOpen}
            setEditingEntry={setEditingOpenSource}
            sensors={sensors}
            handleOpenSourceDragStart={handleOpenSourceDragStart}
            handleOpenSourceDragOver={handleOpenSourceDragOver}
            handleOpenSourceDragEnd={handleOpenSourceDragEnd}
            activeOpenSourceId={activeOpenSourceId}
            getOpenSourceColumnOfItem={getOpenSourceColumnOfItem}
            isModalOpen={isOpenSourceModalOpen}
            editingEntry={editingOpenSource}
            fetchOpenSourceEntries={fetchOpenSourceEntries}
            isDraggingOpenSourceRef={isDraggingOpenSourceRef}
            userIdParam={userIdParam}
            selectedPartnership={selectedPartnership}
            setSelectedPartnership={setSelectedPartnership}
            setSelectedPartnershipId={setSelectedPartnershipId}
            activePartnershipDbId={activePartnershipDbId}
            setActivePartnershipDbId={setActivePartnershipDbId}
            activePartnershipCriteria={activePartnershipCriteria}
            setActivePartnershipCriteria={setActivePartnershipCriteria}
            availablePartnerships={availablePartnerships}
            fullPartnerships={fullPartnerships}
            fetchAvailablePartnerships={fetchAvailablePartnerships}
            refreshCompletedPartnerships={refreshCompletedPartnerships}
            completedPartnerships={completedPartnerships}
            viewingCompletedPartnershipName={viewingCompletedPartnershipName}
            setViewingCompletedPartnershipName={setViewingCompletedPartnershipName}
            isInstructor={isInstructor}
            showProofOfWorkWarning={showProofOfWorkWarning}
            setShowProofOfWorkWarning={setShowProofOfWorkWarning}
            showBabyStepWarning={showBabyStepWarning}
            setShowBabyStepWarning={setShowBabyStepWarning}
            readOnly={!canEditViewedUser && !!userIdParam}
          />
        )}
    </div>
    </div>
  );
}
