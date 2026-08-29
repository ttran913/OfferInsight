'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DragOverEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Gauge, FileText, MessageCircle, Users, ArrowLeft, GitBranch } from 'lucide-react';
import Link from 'next/link';
import OverviewTab from './components/OverviewTab';
import ApplicationsTab from './components/ApplicationsTab';
import CoffeeChatsTab from './components/CoffeeChatsTab';
import EventsTab from './components/EventsTab';
import OpenSourceTab from './components/OpenSourceTab';
import { getApiHeaders } from '@/app/lib/api-helpers';
import { getFilteredOpenSourceColumns } from './lib/open-source-filter';
import { buildPartnershipNameMatchSet, normalizePartnerName } from './lib/partnership-name-match';
import {
  getPartnershipCriteriaForEntry,
  isProofOfWorkComplete,
} from './lib/open-source-proof-of-work';
import {
  isBabyStepComplete,
  statusRequiresBabyStepComplete,
} from './lib/open-source-baby-step';
import type {
  Application,
  ApplicationStatus,
  ApplicationColumnId,
  LinkedinOutreach,
  LinkedinOutreachStatus,
  LinkedinOutreachColumnId,
  InPersonEvent,
  InPersonEventStatus,
  EventColumnId,
  OpenSourceEntry,
  OpenSourceStatus,
  OpenSourceColumnId,
  BoardTimeFilter,
} from './components/types';
import {
  applicationStatusToColumn,
  applicationColumnToStatus,
  linkedinOutreachStatusToColumn,
  linkedinOutreachColumnToStatus,
  eventStatusToColumn,
  eventColumnToStatus,
  openSourceStatusToColumn,
  openSourceColumnToStatus,
  APPLICATION_COMPLETION_COLUMNS,
  EVENT_COMPLETION_COLUMNS,
} from './components/types';

// ===== MOCK DATA FEATURE TOGGLE START =====
// Toggle this flag or comment out the seeding effect below to disable mock data.
const ENABLE_DASHBOARD_MOCKS = false;
// ===== MOCK DATA FEATURE TOGGLE END =====

export default function Page() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get('userId');
  const [viewedUserName, setViewedUserName] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [canEditViewedUser, setCanEditViewedUser] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
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

  // dnd-kit: Linkedin outreach board (Linkedin_Outreach)

const [linkedinOutreachColumns, setLinkedinOutreachColumns] = useState<Record<LinkedinOutreachColumnId, LinkedinOutreach[]>>({
  prospects: [],
  sendFirstMessage: [],
  requestAccepted: [],
  followUp: [],
  coffeeChat: [],
  askForReferral: [],
});
  const [activeLinkedinOutreachId, setActiveLinkedinOutreachId] = useState<string | null>(null);
  const [isLinkedinOutreachModalOpen, setIsLinkedinOutreachModalOpen] = useState(false);
  const [editingLinkedinOutreach, setEditingLinkedinOutreach] = useState<LinkedinOutreach | null>(null);
  const [isDeletingLinkedinOutreach, setIsDeletingLinkedinOutreach] = useState<number | null>(null);
  const [isLoadingLinkedinOutreach, setIsLoadingLinkedinOutreach] = useState(true);
  const [linkedinOutreachFilter, setLinkedinOutreachFilter] = useState<BoardTimeFilter>('allTime');
  const isFetchingLinkedinOutreachRef = useRef(false);
  const isDraggingLinkedinOutreachRef = useRef(false);

  const fetchLinkedinOutreach = useCallback(async () => {
    // --- MOCK DATA BYPASS FOR OUTREACH FETCH START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR OUTREACH FETCH END ---
    if (isFetchingLinkedinOutreachRef.current) return;

    try {
      isFetchingLinkedinOutreachRef.current = true;
      setIsLoadingLinkedinOutreach(true);
      const url = userIdParam ? `/api/linkedin_outreach?userId=${userIdParam}` : '/api/linkedin_outreach';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch LinkedIn outreach entries');
      const data = await response.json() as LinkedinOutreach[];

      const grouped: Record<LinkedinOutreachColumnId, LinkedinOutreach[]> = {
        prospects: [],
        sendFirstMessage: [],
        requestAccepted: [],
        followUp: [],
        coffeeChat: [],
        askForReferral: [],
      };

      (data as LinkedinOutreach[]).forEach(chat => {
        const column = linkedinOutreachStatusToColumn[chat.status] ?? 'prospects';
        grouped[column].push(chat);
      });

      setLinkedinOutreachColumns(grouped);
    } catch (error) {
      console.error('Error fetching LinkedIn outreach entries:', error);
    } finally {
      setIsLoadingLinkedinOutreach(false);
      isFetchingLinkedinOutreachRef.current = false;
    }
  }, [userIdParam]);

  useEffect(() => {
    // --- MOCK DATA BYPASS FOR OUTREACH EFFECT START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR OUTREACH EFFECT END ---
    if (activeTab === 'interviews' && !isFetchingLinkedinOutreachRef.current) {
      fetchLinkedinOutreach();
    }
  }, [activeTab, fetchLinkedinOutreach]);

  const getLinkedinOutreachColumnOfItem = (id: string): LinkedinOutreachColumnId | null => {
    const entry = (Object.keys(linkedinOutreachColumns) as LinkedinOutreachColumnId[]).find(col =>
      linkedinOutreachColumns[col].some(chat => String(chat.id) === id)
    );
    return entry ?? null;
  };

  // Debounced function to update LinkedIn outreach status (prevents rapid-fire requests when dragging)
  // Server will automatically set dateModified to current date on PATCH
  const debouncedUpdateLinkedinOutreachStatus = useDebouncedCallback(
    async (id: number, status: LinkedinOutreachStatus) => {
      try {
        const url = userIdParam ? `/api/linkedin_outreach?id=${id}&userId=${userIdParam}` : `/api/linkedin_outreach?id=${id}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: getApiHeaders(),
          body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error('Failed to update LinkedIn outreach status');
      } catch (error) {
        console.error('Error updating LinkedIn outreach status:', error);
        fetchLinkedinOutreach();
      }
    },
    300 // Wait 300ms after last change before sending request
  );

  const handleLinkedinOutreachDragEnd = async (event: DragEndEvent) => {
    if (!canEditViewedUser && userIdParam) return;
    const { active, over } = event;
    if (!over) {
      isDraggingLinkedinOutreachRef.current = false;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromCol = getLinkedinOutreachColumnOfItem(activeId);
    const toCol = (['prospects', 'sendFirstMessage', 'requestAccepted', 'followUp', 'coffeeChat', 'askForReferral'] as LinkedinOutreachColumnId[]).includes(overId as LinkedinOutreachColumnId)
      ? (overId as LinkedinOutreachColumnId)
      : getLinkedinOutreachColumnOfItem(overId);
    if (!fromCol || !toCol) {
      setActiveLinkedinOutreachId(null);
      isDraggingLinkedinOutreachRef.current = false;
      return;
    }

    if (fromCol === toCol) {
      const items = linkedinOutreachColumns[fromCol];
      const oldIndex = items.findIndex(i => String(i.id) === activeId);
      const newIndex = items.findIndex(i => String(i.id) === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setActiveLinkedinOutreachId(null);
        isDraggingLinkedinOutreachRef.current = false;
        return;
      }
      const newItems = arrayMove(items, oldIndex, newIndex);
      setLinkedinOutreachColumns(prev => ({ ...prev, [fromCol]: newItems }));
    } else {
      const fromItems = linkedinOutreachColumns[fromCol];
      const toItems = linkedinOutreachColumns[toCol];
      const movingIndex = fromItems.findIndex(i => String(i.id) === activeId);
      if (movingIndex === -1) {
        setActiveLinkedinOutreachId(null);
        isDraggingLinkedinOutreachRef.current = false;
        return;
      }
      const movingItem = fromItems[movingIndex];
      const overIndex = toItems.findIndex(i => String(i.id) === overId);
      const insertIndex = overIndex === -1 ? toItems.length : overIndex;
      const newStatus = linkedinOutreachColumnToStatus[toCol];
      const updatedItem: LinkedinOutreach = {
        ...movingItem,
        status: newStatus,
        // Optimistically update dateModified to current date (server will confirm on PATCH)
        dateModified: new Date().toISOString(),
      };
      const newFrom = [...fromItems.slice(0, movingIndex), ...fromItems.slice(movingIndex + 1)];
      const newTo = [...toItems.slice(0, insertIndex), updatedItem, ...toItems.slice(insertIndex)];
      // Create new column arrays to ensure React detects the change
      setLinkedinOutreachColumns(prev => ({
        prospects: [...prev.prospects],
        sendFirstMessage: [...prev.sendFirstMessage],
        requestAccepted: [...prev.requestAccepted],
        followUp: [...prev.followUp],
        coffeeChat: [...prev.coffeeChat],
        askForReferral: [...prev.askForReferral],
        [fromCol]: newFrom,
        [toCol]: newTo,
      }));

      // Update status in database (debounced to prevent rapid-fire requests)
      // Server will automatically set dateModified to current date on PATCH
      debouncedUpdateLinkedinOutreachStatus(movingItem.id, newStatus);
    }
    setActiveLinkedinOutreachId(null);
    isDraggingLinkedinOutreachRef.current = false;
  };

  const handleLinkedinOutreachDragStart = (event: DragStartEvent) => {
    setActiveLinkedinOutreachId(String(event.active.id));
    isDraggingLinkedinOutreachRef.current = true;
  };

  const handleLinkedinOutreachDragOver = (event: DragOverEvent) => {
    // onDragOver is only for visual feedback via DroppableColumn
  };

  // dnd-kit: Events board (In-Person Events)
  const [eventColumns, setEventColumns] = useState<Record<EventColumnId, InPersonEvent[]>>({
    plan: [],
    attended: [],
    sendLinkedInRequest: [],
    followUp: [],
  });
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<InPersonEvent | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState<number | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventsFilter, setEventsFilter] = useState<BoardTimeFilter>('allTime');
  const isFetchingEventsRef = useRef(false);
  const isDraggingEventRef = useRef(false);

  const fetchEvents = useCallback(async () => {
    // --- MOCK DATA BYPASS FOR EVENTS FETCH START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR EVENTS FETCH END ---
    if (isFetchingEventsRef.current) return;

    try {
      isFetchingEventsRef.current = true;
      setIsLoadingEvents(true);
      const url = userIdParam ? `/api/in_person_events?userId=${userIdParam}` : '/api/in_person_events';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch in-person events');
      const data = await response.json() as InPersonEvent[];

      const grouped: Record<EventColumnId, InPersonEvent[]> = {
        plan: [],
        attended: [],
        sendLinkedInRequest: [],
        followUp: [],
      };

      data.forEach((event: InPersonEvent) => {
        const column = eventStatusToColumn[event.status] ?? 'plan';
        grouped[column].push(event);
      });

      setEventColumns(grouped);
    } catch (error) {
      console.error('Error fetching in-person events:', error);
    } finally {
      setIsLoadingEvents(false);
      isFetchingEventsRef.current = false;
    }
  }, [userIdParam]);

  useEffect(() => {
    // --- MOCK DATA BYPASS FOR EVENTS EFFECT START ---
    if (ENABLE_DASHBOARD_MOCKS) return;
    // --- MOCK DATA BYPASS FOR EVENTS EFFECT END ---
    if ((activeTab === 'events' || activeTab === 'overview') && !isFetchingEventsRef.current) {
      fetchEvents();
    }
  }, [activeTab, fetchEvents]);

  const getEventColumnOfItem = (id: string): EventColumnId | null => {
    const entry = (Object.keys(eventColumns) as EventColumnId[]).find(col =>
      eventColumns[col].some(event => String(event.id) === id)
    );
    return entry ?? null;
  };

  // Debounced function to update event status (prevents rapid-fire requests when dragging)
  // Server will automatically set dateModified to current date on PATCH
  const debouncedUpdateEventStatus = useDebouncedCallback(
    async (id: number, status: InPersonEventStatus) => {
      try {
        const url = userIdParam ? `/api/in_person_events?id=${id}&userId=${userIdParam}` : `/api/in_person_events?id=${id}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: getApiHeaders(),
          body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error('Failed to update event status');
      } catch (error) {
        console.error('Error updating event status:', error);
        fetchEvents();
      }
    },
    300 // Wait 300ms after last change before sending request
  );

  const handleEventsDragEnd = async (event: DragEndEvent) => {
    if (!canEditViewedUser && userIdParam) return;
    const { active, over } = event;
    if (!over) {
      isDraggingEventRef.current = false;
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    const fromCol = getEventColumnOfItem(activeId);
    const toCol = (['plan', 'attended', 'sendLinkedInRequest', 'followUp'] as EventColumnId[]).includes(overId as EventColumnId)
      ? (overId as EventColumnId)
      : getEventColumnOfItem(overId);
    if (!fromCol || !toCol) {
      setActiveEventId(null);
      isDraggingEventRef.current = false;
      return;
    }

    if (fromCol === toCol) {
      const items = eventColumns[fromCol];
      const oldIndex = items.findIndex(i => String(i.id) === activeId);
      const newIndex = items.findIndex(i => String(i.id) === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        setActiveEventId(null);
        isDraggingEventRef.current = false;
        return;
      }
      const newItems = arrayMove(items, oldIndex, newIndex);
      setEventColumns(prev => ({ ...prev, [fromCol]: newItems }));
    } else {
      const fromItems = eventColumns[fromCol];
      const toItems = eventColumns[toCol];
      const movingIndex = fromItems.findIndex(i => String(i.id) === activeId);
      if (movingIndex === -1) {
        setActiveEventId(null);
        isDraggingEventRef.current = false;
        return;
      }
      const movingItem = fromItems[movingIndex];
      const overIndex = toItems.findIndex(i => String(i.id) === overId);
      const insertIndex = overIndex === -1 ? toItems.length : overIndex;
      const newFrom = [...fromItems.slice(0, movingIndex), ...fromItems.slice(movingIndex + 1)];
      const newStatus = eventColumnToStatus[toCol] ?? 'plan';
      const updatedItem: InPersonEvent = {
        ...movingItem,
        status: newStatus,
        // Optimistically update dateModified to current date (server will confirm on PATCH)
        dateModified: new Date().toISOString(),
      };
      const newTo = [...toItems.slice(0, insertIndex), updatedItem, ...toItems.slice(insertIndex)];
      // Create new column arrays to ensure React detects the change
      setEventColumns(prev => ({
        plan: [...prev.plan],
        attended: [...prev.attended],
        sendLinkedInRequest: [...prev.sendLinkedInRequest],
        followUp: [...prev.followUp],
        [fromCol]: newFrom,
        [toCol]: newTo,
      }));

      // Update status in database (debounced to prevent rapid-fire requests)
      // Server will automatically set dateModified to current date on PATCH
      debouncedUpdateEventStatus(movingItem.id, newStatus);
    }
    setActiveEventId(null);
    isDraggingEventRef.current = false;
  };

  const handleEventsDragStart = (event: DragStartEvent) => {
    setActiveEventId(String(event.active.id));
    isDraggingEventRef.current = true;
  };

  const handleEventsDragOver = (event: DragOverEvent) => {
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
      if (
        statusRequiresBabyStepComplete(fromCol, toCol) &&
        !isBabyStepComplete(movingItem, partnershipCriteria)
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
    linkedinOutreachPerWeek?: number | null;
    inPersonEventsPerMonth?: number | null;
    careerFairsPerYear?: number | null;
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

    const mockLinkedinOutreach: Record<LinkedinOutreachColumnId, LinkedinOutreach[]> = {
      prospects: [
        {
          id: 2000,
          name: 'Alex Morgan',
          company: 'TechStart',
          status: 'prospects',
          dateCreated: isoWithDelta({ months: 0, days: -2, hour: 10 }),
          recievedReferral: false,
          userId: 'mock-user',
        },
      ],
      sendFirstMessage: [
        {
          id: 2001,
          name: 'Priya Patel',
          company: 'Globex',
          firstMessage: 'Introduced myself and shared interest in the team.',
          status: 'sendFirstMessage',
          dateCreated: isoWithDelta({ months: 0, days: -8, hour: 12 }),
          recievedReferral: false,
          userId: 'mock-user',
        },
      ],
      requestAccepted: [
        {
          id: 2002,
          name: 'Leo Johnson',
          company: 'Initech',
          status: 'requestAccepted',
          dateCreated: isoWithDelta({ months: -3, days: -10, hour: 15 }),
          recievedReferral: false,
          userId: 'mock-user',
        },
      ],
      followUp: [
        {
          id: 2003,
          name: 'Mia Garcia',
          company: 'Acme Corp',
          status: 'followUp',
          dateCreated: isoWithDelta({ months: -6, days: -5, hour: 9 }),
          recievedReferral: false,
          userId: 'mock-user',
        },
      ],
      coffeeChat: [
        {
          id: 2004,
          name: 'Noah Kim',
          company: 'Wayne Enterprises',
          status: 'coffeeChat',
          dateCreated: isoWithDelta({ months: -8, days: -11, hour: 10 }),
          recievedReferral: true,
          userId: 'mock-user',
        },
      ],
      askForReferral: [
        {
          id: 2002.5,
          name: 'Sarah Chen',
          company: 'TechCorp',
          status: 'askForReferral',
          dateCreated: isoWithDelta({ months: -4, days: -8, hour: 11 }),
          recievedReferral: false,
          userId: 'mock-user',
        },
      ],
    };

    const mockEvents: Record<EventColumnId, InPersonEvent[]> = {
      plan: [
        {
          id: 3001,
          event: 'ProductCon',
          date: isoWithDelta({ months: 1, days: 5, hour: 9, minute: 30 }),
          location: 'San Francisco',
          status: 'plan',
          sentLinkedInRequest: false,
          careerFair: false,
          userId: 'mock-user',
        },
      ],
      attended: [
        {
          id: 3003,
          event: 'AI Hiring Fair',
          date: isoWithDelta({ months: -5, days: -7, hour: 13 }),
          location: 'Virtual',
          status: 'attended',
          nameOfPersonSpokenTo: 'John Smith',
          sentLinkedInRequest: true,
          careerFair: true,
          userId: 'mock-user',
        },
      ],
      sendLinkedInRequest: [
        {
          id: 3002,
          event: 'Tech Mixer',
          date: isoWithDelta({ months: -2, days: -2, hour: 18 }),
          location: 'Seattle',
          status: 'sendLinkedInRequest',
          nameOfPersonSpokenTo: 'Jane Doe',
          sentLinkedInRequest: true,
          careerFair: false,
          userId: 'mock-user',
        },
      ],
      followUp: [
        {
          id: 3004,
          event: 'Startup Expo',
          date: isoWithDelta({ months: -9, days: -3, hour: 15 }),
          location: 'Austin',
          status: 'followUp',
          nameOfPersonSpokenTo: 'Mike Johnson',
          sentLinkedInRequest: false,
          followUpMessage: 'Followed up with thank you message.',
          careerFair: false,
          userId: 'mock-user',
        },
      ],
    };

    setAppColumns(mockApplications);
    setLinkedinOutreachColumns(mockLinkedinOutreach);
    setEventColumns(mockEvents);
    setIsLoading(false);
    setIsLoadingLinkedinOutreach(false);
    setIsLoadingEvents(false);
    setActiveTab('overview');
    setUserData({
      appsWithOutreachPerWeek: 6,
      linkedinOutreachPerWeek: 8,
      inPersonEventsPerMonth: 3,
      careerFairsPerYear: 2,
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

  const careerFairPlanGoal = userData?.careerFairsPerYear ?? 0;

  const eventsMetrics = useMemo(() => {
    let eventCount = 0;
    let careerFairCount = 0;

    EVENT_COMPLETION_COLUMNS.forEach(col => {
      eventColumns[col].forEach(event => {
        const eventDate = new Date(event.date);
        if (!Number.isNaN(eventDate.getTime()) && eventDate >= metricsMonth && eventDate < metricsMonthEnd) {
          if (event.careerFair) {
            careerFairCount++;
          } else {
            eventCount++;
          }
        }
      });
    });

    const baseGoal = userData?.inPersonEventsPerMonth ?? 0;
    const fairGoalAnnual = careerFairPlanGoal > 0 ? careerFairPlanGoal : 0;
    const combinedGoal = baseGoal + fairGoalAnnual;
    const combinedCount = eventCount + careerFairCount;
    const rawPercentage = combinedGoal > 0 ? (combinedCount / combinedGoal) * 100 : 0;
    const clampedPercentage = Math.min(Math.max(rawPercentage, 0), 100);
    const styles = getHabitStatusStyles(combinedCount, combinedGoal, clampedPercentage);
    const statusText = `${Math.round(clampedPercentage)}%`;

    return {
      count: eventCount,
      totalCount: combinedCount,
      goal: combinedGoal,
      percentage: clampedPercentage,
      statusText,
      statusTextColor: styles.textClass,
      statusDotClass: styles.dotClass,
      statusBarClass: styles.barClass,
    };
  }, [eventColumns, userData, metricsMonth, metricsMonthEnd, getHabitStatusStyles, careerFairPlanGoal]);

  // Calculate all-time counts for each metric
  const applicationsAllTimeCount = useMemo(() => {
    let count = 0;
    APPLICATION_COMPLETION_COLUMNS.forEach(col => {
      count += appColumns[col].length;
    });
    return count;
  }, [appColumns]);

  const eventsAllTimeCount = useMemo(() => {
    let count = 0;
    EVENT_COMPLETION_COLUMNS.forEach(col => {
      count += eventColumns[col].length;
    });
    return count;
  }, [eventColumns]);

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
    const totalCriteria = activePartnershipCriteria.reduce((sum, criteria) => {
      const count = Number(criteria?.count);
      return sum + (Number.isFinite(count) && count > 0 ? count : 1);
    }, 0);
    const nameSet = selectedPartnership
      ? buildPartnershipNameMatchSet(
          selectedPartnershipId,
          selectedPartnership,
          availablePartnerships,
          fullPartnerships
        )
      : null;
    const activePartnershipDoneCount = nameSet && nameSet.size > 0
      ? doneEntries
          .filter((entry) => {
            const n = normalizePartnerName(entry.partnershipName);
            return n !== '' && nameSet.has(n);
          })
          .reduce((sum, entry) => {
            const extras = Array.isArray(entry.selectedExtras) ? entry.selectedExtras.length : 0;
            return sum + 1 + extras;
          }, 0)
      : 0;
    const completedCriteria =
      totalCriteria > 0 ? Math.min(activePartnershipDoneCount, totalCriteria) : activePartnershipDoneCount;

    return { completedCriteria, totalCriteria };
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

  const filteredLinkedinOutreachColumns = useMemo(() => {
    if (linkedinOutreachFilter === 'allTime') return linkedinOutreachColumns;
    const filtered: Record<LinkedinOutreachColumnId, LinkedinOutreach[]> = {
      prospects: [],
      sendFirstMessage: [],
      requestAccepted: [],
      followUp: [],
      coffeeChat: [],
      askForReferral: [],
    };
    (Object.keys(linkedinOutreachColumns) as LinkedinOutreachColumnId[]).forEach(columnId => {
      if (linkedinOutreachFilter === 'modifiedThisMonth') {
        filtered[columnId] = linkedinOutreachColumns[columnId].filter(entry =>
          isWithinCurrentMonth(entry.dateModified)
        );
      }
    });
    return filtered;
  }, [linkedinOutreachColumns, linkedinOutreachFilter, isWithinCurrentMonth]);

  const filteredEventColumns = useMemo(() => {
    if (eventsFilter === 'allTime') return eventColumns;
    const filtered: Record<EventColumnId, InPersonEvent[]> = {
      plan: [],
      attended: [],
      sendLinkedInRequest: [],
      followUp: [],
    };
    (Object.keys(eventColumns) as EventColumnId[]).forEach(columnId => {
      if (eventsFilter === 'modifiedThisMonth') {
        filtered[columnId] = eventColumns[columnId].filter(event =>
          isWithinCurrentMonth(event.dateModified)
        );
      }
    });
    return filtered;
  }, [eventColumns, eventsFilter, isWithinCurrentMonth]);

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

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
  };

  const handleHabitCardClick = (cardId: string) => {
    setActiveTab(cardId);
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
                onClick={() => handleTabClick('overview')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'overview' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Gauge className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Overview
              </button>
              <button 
                onClick={() => handleTabClick('opensource')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'opensource' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <GitBranch className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Open Source
              </button>
              <button 
                onClick={() => handleTabClick('applications')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'applications' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <FileText className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Applications
              </button>
              <button 
                onClick={() => handleTabClick('interviews')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'interviews' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <MessageCircle className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Coffee Chats
              </button>
              <button 
                onClick={() => handleTabClick('events')}
                className={`main-tab-btn flex-1 py-3 sm:py-4 px-3 sm:px-6 text-center font-semibold border-r border-gray-200 transition-colors whitespace-nowrap ${
                  activeTab === 'events' 
                    ? 'bg-electric-blue text-white' 
                    : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Users className="inline mr-1 sm:mr-2 w-4 h-4 sm:w-5 sm:h-5" />Events
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
            eventsMetrics={eventsMetrics}
            eventsAllTimeCount={eventsAllTimeCount}
            handleHabitCardClick={handleHabitCardClick}
            instructorViewUserId={isInstructor && userIdParam ? userIdParam : null}
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

        {/* Coffee Chats Content */}
        {activeTab === 'interviews' && (
          <CoffeeChatsTab
            filteredLinkedinOutreachColumns={filteredLinkedinOutreachColumns}
            linkedinOutreachColumns={linkedinOutreachColumns}
            setLinkedinOutreachColumns={setLinkedinOutreachColumns}
            isLoadingLinkedinOutreach={isLoadingLinkedinOutreach}
            linkedinOutreachFilter={linkedinOutreachFilter}
            setLinkedinOutreachFilter={setLinkedinOutreachFilter}
            setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
            setEditingLinkedinOutreach={setEditingLinkedinOutreach}
            sensors={sensors}
            handleLinkedinOutreachDragStart={handleLinkedinOutreachDragStart}
            handleLinkedinOutreachDragOver={handleLinkedinOutreachDragOver}
            handleLinkedinOutreachDragEnd={handleLinkedinOutreachDragEnd}
            activeLinkedinOutreachId={activeLinkedinOutreachId}
            getLinkedinOutreachColumnOfItem={getLinkedinOutreachColumnOfItem}
            isLinkedinOutreachModalOpen={isLinkedinOutreachModalOpen}
            editingLinkedinOutreach={editingLinkedinOutreach}
            setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
            isDeletingLinkedinOutreach={isDeletingLinkedinOutreach}
            fetchLinkedinOutreach={fetchLinkedinOutreach}
            isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
            userIdParam={userIdParam}
            readOnly={!canEditViewedUser && !!userIdParam}
          />
        )}

        {/* Events Content */}
        {activeTab === 'events' && (
          <EventsTab
            filteredEventColumns={filteredEventColumns}
            eventColumns={eventColumns}
            setEventColumns={setEventColumns}
            isLoadingEvents={isLoadingEvents}
            eventsFilter={eventsFilter}
            setEventsFilter={setEventsFilter}
            setIsEventModalOpen={setIsEventModalOpen}
            setEditingEvent={setEditingEvent}
            sensors={sensors}
            handleEventsDragStart={handleEventsDragStart}
            handleEventsDragOver={handleEventsDragOver}
            handleEventsDragEnd={handleEventsDragEnd}
            activeEventId={activeEventId}
            getEventColumnOfItem={getEventColumnOfItem}
            isEventModalOpen={isEventModalOpen}
            editingEvent={editingEvent}
            setIsDeletingEvent={setIsDeletingEvent}
            isDeletingEvent={isDeletingEvent}
            fetchEvents={fetchEvents}
            isDraggingEventRef={isDraggingEventRef}
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
