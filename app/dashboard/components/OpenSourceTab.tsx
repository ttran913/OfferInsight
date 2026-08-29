'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getApiHeaders } from '@/app/lib/api-helpers';
import { X, ChevronDown, ChevronUp, PartyPopper, Medal, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { OpenSourceEntry, OpenSourceColumnId, BoardTimeFilter, OpenSourceStatus } from './types';
import { openSourceStatusToColumn } from './types';
import { DroppableColumn, formatModalDate, toLocalDateString, LockTooltip, normalizeUrl, ModalFormPrimaryAction, ModalOverlay, ModalPanel, BOARD_CHECKBOX_CLASS, HelperGuideLink } from './shared';
import typesData from '@/partnerships/types.json';
import { getEffectiveProofOfCompletionFields } from '../lib/open-source-proof-of-work';
import { helperClickKey, isHelperClickKey, HELPER_CLICK_PREFIX } from '../lib/open-source-baby-step';
import { isUserManagedCriteriaType } from '@/app/lib/open-source-user-managed';

// Debug: set to true to show date created/modified fields in the open source modal
const ENABLE_DATE_FIELD_EDITING = false;

type OpenSourceTabProps = {
  filteredOpenSourceColumns: Record<OpenSourceColumnId, OpenSourceEntry[]>;
  openSourceColumns: Record<OpenSourceColumnId, OpenSourceEntry[]>;
  setOpenSourceColumns: React.Dispatch<React.SetStateAction<Record<OpenSourceColumnId, OpenSourceEntry[]>>>;
  isLoading: boolean;
  openSourceFilter: BoardTimeFilter;
  setOpenSourceFilter: (filter: BoardTimeFilter) => void;
  setIsModalOpen: (open: boolean) => void;
  setEditingEntry: (entry: OpenSourceEntry | null) => void;
  sensors: any;
  handleOpenSourceDragStart: (event: any) => void;
  handleOpenSourceDragOver: (event: any) => void;
  handleOpenSourceDragEnd: (event: any) => void;
  activeOpenSourceId: string | null;
  getOpenSourceColumnOfItem: (id: string) => OpenSourceColumnId | null;
  isModalOpen: boolean;
  editingEntry: OpenSourceEntry | null;
  fetchOpenSourceEntries: () => Promise<void>;
  userIdParam: string | null;
  selectedPartnership: string | null;
  setSelectedPartnership: (name: string | null) => void;
  setSelectedPartnershipId: (id: number | null) => void;
  activePartnershipDbId: number | null;
  setActivePartnershipDbId: (id: number | null) => void;
  activePartnershipCriteria: any[];
  setActivePartnershipCriteria: (criteria: any[]) => void;
  availablePartnerships: Array<{ id: number; name: string; spotsRemaining: number; criteria?: any[] }>;
  fullPartnerships: Array<{ id: number; name: string; criteria?: any[] }>;
  fetchAvailablePartnerships: () => Promise<void>;
  refreshCompletedPartnerships?: () => Promise<void>;
  completedPartnerships?: Array<{
    id: number;
    partnershipId?: number;
    partnershipName: string;
    criteria: any[];
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
  viewingCompletedPartnershipName?: string | null;
  setViewingCompletedPartnershipName?: (name: string | null) => void;
  isInstructor?: boolean;
  showProofOfWorkWarning?: boolean;
  setShowProofOfWorkWarning?: (show: boolean) => void;
  showBabyStepWarning?: boolean;
  setShowBabyStepWarning?: (show: boolean) => void;
  readOnly?: boolean;
};

function resolveCriteriaDef(criteriaType: string | null | undefined, activePartnershipCriteria: any[]) {
  if (!criteriaType) return null;
  return (
    activePartnershipCriteria.find((c) => c.type === criteriaType) ??
    (typesData.types as Record<string, any>)?.[criteriaType] ??
    null
  );
}

function dedupeFieldsByText(fields: any[]): any[] {
  const seen = new Set<string>();
  return (fields ?? []).filter((field) => {
    const text = field?.text?.trim();
    if (!text) return true;
    if (seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function getBabyStepHelperLinks(
  card: OpenSourceEntry
): Array<{ fieldText: string; url: string }> {
  const links: Array<{ fieldText: string; url: string }> = [];
  const seenFieldKeys = new Set<string>();

  const addFromFields = (fields: any[] | undefined) => {
    for (const field of fields ?? []) {
      const text = field?.text?.trim() ?? '';
      const url = field?.helper_video;
      if (typeof url !== 'string' || !url.trim()) continue;
      const key = `${text}::${url}`;
      if (seenFieldKeys.has(key)) continue;
      seenFieldKeys.add(key);
      links.push({ fieldText: text, url });
    }
  };

  const primaryDef = card.criteriaType
    ? (typesData.types as Record<string, any>)?.[card.criteriaType]
    : null;
  addFromFields(primaryDef?.baby_step_column_fields);

  if (card.criteriaType === 'issue' && card.selectedExtras?.length) {
    for (const extraType of card.selectedExtras) {
      const extraDef = (typesData.types as Record<string, any>)?.[extraType];
      addFromFields(extraDef?.baby_step_column_fields);
    }
  }

  return links;
}

function SortableOpenSourceCard(props: {
  card: OpenSourceEntry;
  activeOpenSourceId: string | null;
  setEditingEntry: (entry: OpenSourceEntry) => void;
  setIsModalOpen: (open: boolean) => void;
  isDraggingOpenSourceRef: React.MutableRefObject<boolean>;
  onRecordHelperClick: (entryId: number, fieldText: string) => void;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(props.card.id) });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  } as React.CSSProperties;

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging || props.isDraggingOpenSourceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (props.activeOpenSourceId === String(props.card.id)) {
      return;
    }
    setTimeout(() => {
      if (!props.isDraggingOpenSourceRef.current && !isDragging && props.activeOpenSourceId !== String(props.card.id)) {
        props.setEditingEntry(props.card);
        props.setIsModalOpen(true);
      }
    }, 50);
  };

  const babyStepHelperLinks =
    props.card.status === 'babyStep' ? getBabyStepHelperLinks(props.card) : [];
  const babyStepResponses = props.card.babyStepResponses ?? {};

  return (
    <div 
      ref={setNodeRef} 
      style={{ ...style, touchAction: 'none' }} 
      {...(props.readOnly ? {} : attributes)} 
      {...(props.readOnly ? {} : listeners)}
      onClick={handleClick}
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-electric-blue transition-colors group relative"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="text-gray-900 font-medium mb-1">{props.card.metric || 'Untitled'}</div>
          {props.card.selectedExtras && (props.card.selectedExtras as string[]).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-300 font-bold uppercase tracking-wider">
                +{(props.card.selectedExtras as string[]).length} Extra{(props.card.selectedExtras as string[]).length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
      {babyStepHelperLinks.length > 0 && (
        <div
          className="mt-2 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {babyStepHelperLinks.map(({ fieldText, url }) => (
            <HelperGuideLink
              key={`${fieldText}::${url}`}
              href={url}
              compact
              clicked={!!babyStepResponses[helperClickKey(fieldText)]}
              onHelperClick={
                props.readOnly
                  ? undefined
                  : () => props.onRecordHelperClick(props.card.id, fieldText)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// OpenSource Modal Component
function OpenSourceModal({ 
  entry, 
  onClose, 
  onSave,
  onDelete,
  onRecordHelperClick,
  selectedPartnership,
  activePartnershipCriteria,
  availablePartnerships,
  fullPartnerships,
  newEntryDefaultCriteriaType = null,
  readOnly = false,
}: { 
  entry: OpenSourceEntry | null; 
  onClose: () => void; 
  onSave: (data: Partial<OpenSourceEntry>) => void;
  onDelete?: () => void;
  onRecordHelperClick?: (fieldText: string) => void;
  selectedPartnership: string | null;
  activePartnershipCriteria: any[];
  availablePartnerships: Array<{ id: number; name: string; spotsRemaining: number; criteria?: any[] }>;
  fullPartnerships: Array<{ id: number; name: string; criteria?: any[] }>;
  newEntryDefaultCriteriaType?: string | null;
  readOnly?: boolean;
}) {

  type OpenSourceFormData = {
    partnershipName: string;
    metric: string;
    status: OpenSourceStatus;
    criteriaType: string;
    selectedExtras: string[];
    planFields: any[];
    planResponses: Record<string, any>;
    babyStepFields: any[];
    babyStepResponses: Record<string, any>;
    proofOfCompletion: any[];
    proofResponses: Record<string, any>;
    dateCreated: string;
    dateModified: string;
  };

  // Resolve clean primary criteria fields once at start to handle initialization (including "new issue" default)
  const initialPrimaryCriteria = entry
    ? activePartnershipCriteria.find(c => c.type === entry.criteriaType)
    : (newEntryDefaultCriteriaType ? activePartnershipCriteria.find(c => c.type === newEntryDefaultCriteriaType) : null);

  const [formData, setFormData] = useState<OpenSourceFormData>({
    partnershipName: entry?.partnershipName || selectedPartnership || '',
    metric: entry?.metric || '',
    status: entry?.status || 'plan',
    criteriaType: entry?.criteriaType || newEntryDefaultCriteriaType || '',
    selectedExtras: (entry?.selectedExtras as string[]) || [],
    planFields: initialPrimaryCriteria?.plan_column_fields || entry?.planFields || [],
    planResponses: entry?.planResponses || {},
    babyStepFields: initialPrimaryCriteria?.baby_step_column_fields || entry?.babyStepFields || [],
    babyStepResponses: entry?.babyStepResponses || {},
    proofOfCompletion: initialPrimaryCriteria?.proof_of_completion_column_fields || initialPrimaryCriteria?.proof_of_completion || entry?.proofOfCompletion || [],
    proofResponses: entry?.proofResponses || {},
    dateCreated: entry?.dateCreated ? toLocalDateString(entry.dateCreated) : '',
    dateModified: entry?.dateModified ? toLocalDateString(entry.dateModified) : '',
  });

  useEffect(() => {
    if (entry) {
      // Find clean primary criteria fields from metadata to fix any corrupted/flattened database records
      const primaryCriteria = activePartnershipCriteria.find(c => c.type === entry.criteriaType);
      
      setFormData({
        partnershipName: entry.partnershipName || '',
        metric: entry.metric || '',
        status: entry.status ?? 'plan',
        criteriaType: entry.criteriaType || '',
        selectedExtras: (entry.selectedExtras as string[]) || [],
        planFields: primaryCriteria?.plan_column_fields || entry.planFields || [],
        planResponses: entry.planResponses || {},
        babyStepFields: primaryCriteria?.baby_step_column_fields || entry.babyStepFields || [],
        babyStepResponses: entry.babyStepResponses || {},
        proofOfCompletion: primaryCriteria?.proof_of_completion_column_fields || primaryCriteria?.proof_of_completion || entry.proofOfCompletion || [],
        proofResponses: entry.proofResponses || {},
        dateCreated: entry.dateCreated ? toLocalDateString(entry.dateCreated) : '',
        dateModified: entry.dateModified ? toLocalDateString(entry.dateModified) : '',
      });
    } else {
      const defaultType = newEntryDefaultCriteriaType || '';
      const primaryCriteria = defaultType ? activePartnershipCriteria.find(c => c.type === defaultType) : null;
      const typeFromJson = defaultType
        ? (typesData.types as Record<string, any>)?.[defaultType]
        : null;
      const fallback = isUserManagedCriteriaType(defaultType) ? typeFromJson : null;
      const source = primaryCriteria || fallback;
      setFormData({
        partnershipName: selectedPartnership || '',
        metric: primaryCriteria?.metric ?? typeFromJson?.metric ?? '',
        status: 'plan',
        criteriaType: defaultType,
        selectedExtras: [],
        planFields: source?.plan_column_fields || [],
        planResponses: {},
        babyStepFields: source?.baby_step_column_fields || [],
        babyStepResponses: {},
        proofOfCompletion: source?.proof_of_completion_column_fields || source?.proof_of_completion || [],
        proofResponses: {},
        dateCreated: '',
        dateModified: '',
      });
    }
  }, [entry, selectedPartnership, newEntryDefaultCriteriaType]);

  const handleProofResponseChange = (text: string, value: any, targetStatus?: OpenSourceStatus) => {
    const status = targetStatus || formData.status;
    setFormData(prev => {
      if (status === 'plan') {
        return {
          ...prev,
          planResponses: { ...prev.planResponses, [text]: value }
        };
      } else if (status === 'babyStep') {
        return {
          ...prev,
          babyStepResponses: { ...prev.babyStepResponses, [text]: value }
        };
      } else {
        return {
          ...prev,
          proofResponses: { ...prev.proofResponses, [text]: value }
        };
      }
    });
  };

  const getEffectivePlanFields = () => {
    const primaryDef = resolveCriteriaDef(formData.criteriaType, activePartnershipCriteria);
    let effectivePlan = dedupeFieldsByText(
      primaryDef?.plan_column_fields ?? formData.planFields ?? []
    );
    const seenFieldTexts = new Set(
      effectivePlan.map((field) => field?.text?.trim()).filter(Boolean) as string[]
    );

    if (formData.criteriaType === 'issue' && formData.status !== 'plan') {
      formData.selectedExtras.forEach((extraType) => {
        const extraCriteria = resolveCriteriaDef(extraType, activePartnershipCriteria);
        const extraFields = dedupeFieldsByText(extraCriteria?.plan_column_fields ?? []).filter((field) => {
          const text = field?.text?.trim();
          if (!text) return true;
          if (seenFieldTexts.has(text)) return false;
          seenFieldTexts.add(text);
          return true;
        });
        if (extraFields.length > 0) {
          effectivePlan = [...effectivePlan, ...extraFields];
        }
      });
    }
    return effectivePlan;
  };

  // Generic helper: builds named groups from catalog primary fields + matching extra fields.
  // Uses partnership/types catalog (not stored row fields) to avoid duplicated flattened baby steps.
  const getFieldGroups = (
    getPrimaryFromDef: (def: any) => any[] | undefined,
    storedPrimaryFields: any[],
    getExtraFields: (c: any) => any[] | undefined
  ) => {
    const groups: Array<{ name: string; fields: any[] }> = [];
    const seenFieldTexts = new Set<string>();

    const primaryDef = resolveCriteriaDef(formData.criteriaType, activePartnershipCriteria);
    const primaryFields = dedupeFieldsByText(
      getPrimaryFromDef(primaryDef) ?? storedPrimaryFields ?? []
    );

    if (primaryFields.length > 0) {
      primaryFields.forEach((field) => {
        const text = field?.text?.trim();
        if (text) seenFieldTexts.add(text);
      });
      groups.push({
        name: primaryDef?.short_name || formData.criteriaType || 'issue',
        fields: primaryFields,
      });
    }

    if (formData.criteriaType === 'issue' && formData.status !== 'plan') {
      formData.selectedExtras.forEach((extraType) => {
        const extraCriteria = resolveCriteriaDef(extraType, activePartnershipCriteria);
        if (extraCriteria) {
          const fields = dedupeFieldsByText(getExtraFields(extraCriteria) ?? []).filter((field) => {
            const text = field?.text?.trim();
            if (!text) return true;
            if (seenFieldTexts.has(text)) return false;
            seenFieldTexts.add(text);
            return true;
          });
          if (fields.length > 0) {
            groups.push({ name: extraCriteria.short_name || extraType, fields });
          }
        }
      });
    }

    return groups;
  };

  const getBabyStepGroups = () =>
    getFieldGroups(
      (def) => def?.baby_step_column_fields,
      formData.babyStepFields,
      (c) => c.baby_step_column_fields
    );
  const getProofOfWorkGroups = () =>
    getFieldGroups(
      (def) => def?.proof_of_completion_column_fields || def?.proof_of_completion,
      formData.proofOfCompletion,
      (c) => c.proof_of_completion
    );

  const effectivePlan = useMemo(
    () => getEffectivePlanFields(),
    [formData.planFields, formData.criteriaType, formData.selectedExtras, formData.status, activePartnershipCriteria]
  );
  const babyStepGroups = useMemo(
    () => getBabyStepGroups(),
    [formData.babyStepFields, formData.criteriaType, formData.selectedExtras, formData.status, activePartnershipCriteria]
  );
  const proofOfWorkGroups = useMemo(
    () => getProofOfWorkGroups(),
    [formData.proofOfCompletion, formData.criteriaType, formData.selectedExtras, formData.status, activePartnershipCriteria]
  );
  const effectiveProofOfWork = useMemo(
    () => proofOfWorkGroups.flatMap(g => g.fields),
    [proofOfWorkGroups]
  );
  const proofOfWorkFlat = useMemo(
    () => proofOfWorkGroups.flatMap(g => g.fields.map(req => ({ ...req, groupName: g.name }))),
    [proofOfWorkGroups]
  );

  // Initialize collapsed sections state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Extras section: only reset when entry or status changes (not when selecting extras)
  // This prevents auto-collapse when user adds multiple extras in one go
  const collapseDepsForExtras = useMemo(
    () => `${entry?.id ?? 'new'}-${formData.status}`,
    [entry?.id, formData.status]
  );

  // Plan, proofOfWork, babyStep groups: reset when entry, status, criteria, or baby step groups change
  const collapseDepsForRest = useMemo(
    () => `${entry?.id ?? 'new'}-${formData.status}-${formData.criteriaType ?? ''}-${babyStepGroups.length}-${effectiveProofOfWork.length}`,
    [entry?.id, formData.status, formData.criteriaType, babyStepGroups.length, effectiveProofOfWork.length]
  );

  useEffect(() => {
    setCollapsedSections(prev => ({ ...prev, extras: formData.status !== 'plan' }));
  }, [collapseDepsForExtras]);

  useEffect(() => {
    const newState: Record<string, boolean> = {
      plan: formData.status !== 'plan',
    };
    babyStepGroups.forEach((_, idx) => {
      newState[`babyStep-${idx}`] = formData.status !== 'babyStep' && formData.status !== 'plan';
    });
    effectiveProofOfWork.forEach((_, idx) => {
      newState[`proofOfWork-${idx}`] = formData.status === 'babyStep';
    });
    setCollapsedSections(prev => ({ ...prev, ...newState }));
  }, [collapseDepsForRest]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const renderProofField = (requirement: any, index: number, forcedStatus?: OpenSourceStatus, disabled?: boolean) => {
    const status = forcedStatus || formData.status;
    let value = '';
    if (status === 'plan') {
      value = formData.planResponses[requirement.text] || '';
    } else if (status === 'babyStep') {
      value = formData.babyStepResponses[requirement.text] || '';
    } else {
      value = formData.proofResponses[requirement.text] || '';
    }

    return (
      <div key={index} className="space-y-2">
        <label className="block text-gray-900 font-semibold">{requirement.text}</label>
        {requirement.helper_video && (
          <HelperGuideLink
            href={requirement.helper_video}
            clicked={!!formData.babyStepResponses[helperClickKey(requirement.text)]}
            onHelperClick={
              readOnly || status !== 'babyStep'
                ? undefined
                : () => {
                    setFormData((prev) => ({
                      ...prev,
                      babyStepResponses: {
                        ...prev.babyStepResponses,
                        [helperClickKey(requirement.text)]: true,
                      },
                    }));
                    onRecordHelperClick?.(requirement.text);
                  }
            }
          />
        )}
        {requirement.type === 'URL' && (
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={value}
            onChange={(e) => handleProofResponseChange(requirement.text, e.target.value, forcedStatus)}
            onBlur={(e) => {
              const normalized = normalizeUrl(e.target.value) || '';
              if (normalized !== e.target.value) {
                handleProofResponseChange(requirement.text, normalized, forcedStatus);
              }
            }}
            disabled={disabled}
            className={`w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            placeholder="Paste link — https:// added automatically"
          />
        )}
        {(requirement.type === 'Checkbox' || requirement.type === 'checkbox') && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleProofResponseChange(requirement.text, e.target.checked, forcedStatus)}
              disabled={disabled}
              className={`w-5 h-5 ${BOARD_CHECKBOX_CLASS} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            />
            <span className="text-gray-600">Done</span>
          </div>
        )}
        {requirement.type === 'text' && (
          <textarea
            value={value}
            onChange={(e) => handleProofResponseChange(requirement.text, e.target.value, forcedStatus)}
            disabled={disabled}
            className={`w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px] ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            placeholder="Write your response here..."
          />
        )}
      </div>
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      onClose();
      return;
    }
    if (!formData.partnershipName.trim()) {
      alert('Partnership name is required');
      return;
    }
    if (!formData.metric.trim()) {
      alert('Metric is required');
      return;
    }
    
    // Recalculate fields based on current selectedExtras before saving
    // This ensures response cleanup includes all extra fields when extras are changed
    const primaryDef = resolveCriteriaDef(formData.criteriaType, activePartnershipCriteria);
    let effectiveBabySteps = dedupeFieldsByText(
      primaryDef?.baby_step_column_fields ?? formData.babyStepFields ?? []
    );
    let effectivePlan = dedupeFieldsByText(
      primaryDef?.plan_column_fields ?? formData.planFields ?? []
    );

    if (formData.criteriaType === 'issue') {
      formData.selectedExtras.forEach(extraType => {
        const extraCriteria = resolveCriteriaDef(extraType, activePartnershipCriteria);
        if (extraCriteria) {
          if (extraCriteria.baby_step_column_fields) {
            effectiveBabySteps = [...effectiveBabySteps, ...extraCriteria.baby_step_column_fields];
          }
          if (extraCriteria.plan_column_fields) {
            effectivePlan = [...effectivePlan, ...extraCriteria.plan_column_fields];
          }
        }
      });
    }

    effectiveBabySteps = dedupeFieldsByText(effectiveBabySteps);
    effectivePlan = dedupeFieldsByText(effectivePlan);

    const effectiveProofOfWork = getEffectiveProofOfCompletionFields(
      {
        criteriaType: formData.criteriaType,
        selectedExtras: formData.selectedExtras,
        proofOfCompletion: formData.proofOfCompletion,
      } as OpenSourceEntry,
      activePartnershipCriteria
    );
    
    // Collect all valid field text keys to clean up orphaned responses
    const validPlanKeys = new Set(effectivePlan.map(f => f.text).filter(Boolean));
    const validBabyStepKeys = new Set(effectiveBabySteps.map(f => f.text).filter(Boolean));
    const validProofKeys = new Set(effectiveProofOfWork.map(f => f.text).filter(Boolean));
    
    // Clean up responses to only include keys for fields that still exist
    const cleanedPlanResponses: Record<string, any> = {};
    const cleanedBabyStepResponses: Record<string, any> = {};
    const cleanedProofResponses: Record<string, any> = {};
    
    Object.keys(formData.planResponses).forEach(key => {
      if (validPlanKeys.has(key)) {
        cleanedPlanResponses[key] = formData.planResponses[key];
      }
    });
    
    Object.keys(formData.babyStepResponses).forEach(key => {
      if (validBabyStepKeys.has(key)) {
        cleanedBabyStepResponses[key] = formData.babyStepResponses[key];
      } else if (isHelperClickKey(key)) {
        const fieldText = key.slice(HELPER_CLICK_PREFIX.length);
        if (validBabyStepKeys.has(fieldText)) {
          cleanedBabyStepResponses[key] = formData.babyStepResponses[key];
        }
      }
    });
    
    Object.keys(formData.proofResponses).forEach(key => {
      if (validProofKeys.has(key)) {
        cleanedProofResponses[key] = formData.proofResponses[key];
      }
    });
    
    const primaryCriteria = activePartnershipCriteria.find(c => c.type === formData.criteriaType);
    
    const submitData: Partial<OpenSourceEntry> = { 
      ...formData,
      // Ensure we only save the primary fields to these columns, NOT the merged effective fields
      // This prevents permanent "flattening" of extra requirements into the primary card fields
      planFields: primaryCriteria?.plan_column_fields || formData.planFields || [],
      babyStepFields: primaryCriteria?.baby_step_column_fields || formData.babyStepFields || [],
      proofOfCompletion: primaryCriteria?.proof_of_completion_column_fields || primaryCriteria?.proof_of_completion || formData.proofOfCompletion || [],
      // Clean up responses to remove orphaned data from removed extras
      planResponses: cleanedPlanResponses,
      babyStepResponses: cleanedBabyStepResponses,
      proofResponses: cleanedProofResponses,
    };

    if (ENABLE_DATE_FIELD_EDITING) {
      const { dateCreated, dateModified } = formData;
      if (dateCreated) {
        try {
          const date = new Date(dateCreated);
          if (!isNaN(date.getTime())) {
            submitData.dateCreated = date.toISOString();
          }
        } catch (error) {
          console.error('Error parsing dateCreated:', error);
        }
      }
      if (dateModified !== undefined) {
        try {
          if (dateModified) {
            const date = new Date(dateModified);
            if (!isNaN(date.getTime())) {
              submitData.dateModified = date.toISOString();
            }
          } else {
            submitData.dateModified = null;
          }
        } catch (error) {
          console.error('Error parsing dateModified:', error);
        }
      }
    }

    onSave(submitData);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <ModalPanel size="2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            {entry ? 'Edit Open Source Criteria' : 'Create New Open Source Criteria'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-900 font-semibold mb-2">Metric</label>
            <div className="w-full bg-gray-100 border border-gray-200/30 rounded-lg px-4 py-3 text-gray-600 italic">
              <div className={formData.criteriaType === 'issue' && formData.selectedExtras.length > 0 ? 'pb-2 border-b border-gray-300 mb-2 font-medium text-gray-900' : ''}>
                {formData.metric || 'No metric defined'}
              </div>
              {formData.criteriaType === 'issue' && formData.selectedExtras.map(extraType => {
                const extra = activePartnershipCriteria.find(c => c.type === extraType);
                return extra ? (
                  <div key={extraType} className="text-sm flex gap-2 items-start py-1">
                    <span className="text-electric-blue text-[10px] font-bold uppercase mt-1 shrink-0">Extra:</span>
                    <span>
                      {extra.metric || extraType}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          </div>

          {/* Extras selection - Visible in all columns, collapsible, only for 'issue' type cards */}
          {formData.criteriaType === 'issue' && activePartnershipCriteria.some(c => !c.is_primary && c.type !== 'multiple_choice') && (
            <div className="bg-gray-100 rounded-lg border border-gray-200/30 my-6">
              <button
                type="button"
                onClick={() => toggleSection('extras')}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors rounded-t-lg"
              >
                <div className="flex flex-col items-start">
                  <label className="block text-gray-900 font-semibold text-sm">Knock two birds with one stone</label>
                  <p className="text-xs text-gray-400 italic">Select additional requirements you plan to complete while working on the issue.</p>
                </div>
                {collapsedSections.extras ? (
                  <ChevronDown className="w-4 h-4 text-electric-blue flex-shrink-0 ml-4" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-electric-blue flex-shrink-0 ml-4" />
                )}
              </button>
              {!collapsedSections.extras && (
                <div className="space-y-3 p-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {activePartnershipCriteria.filter(c => !c.is_primary && c.type !== 'multiple_choice').map(extra => (
                      <label key={extra.type} className="flex items-center gap-3 p-2 hover:bg-gray-200 rounded cursor-pointer transition-colors border border-transparent hover:border-gray-200/20">
                        <input
                          type="checkbox"
                          checked={formData.selectedExtras.includes(extra.type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData(prev => ({
                                ...prev,
                                selectedExtras: [...prev.selectedExtras, extra.type]
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                selectedExtras: prev.selectedExtras.filter(t => t !== extra.type)
                              }));
                            }
                          }}
                          className={`w-4 h-4 ${BOARD_CHECKBOX_CLASS}`}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-800">
                            {extra.metric || extra.type}
                          </span>
                          <span className="text-[10px] text-gray-400 italic">
                            {extra.quality || 'Extra Goal'}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Baby Step Requirements - Visible in all columns, blurred in plan, always editable */}
          {babyStepGroups.length > 0 && (
            <div className="relative group space-y-4">
              {babyStepGroups.map((group, gIdx) => {
                const sectionKey = `babyStep-${gIdx}`;
                const isCollapsed = collapsedSections[sectionKey] || false;
                const isBlurred = formData.status === 'plan';
                return (
                  <div key={gIdx} className={`${isBlurred ? 'blur-sm' : ''} bg-gray-100 rounded-lg border border-gray-300`}>
                    <button
                      type="button"
                      onClick={() => toggleSection(sectionKey)}
                      className="w-full flex items-center justify-between p-4 transition-colors rounded-t-lg hover:bg-gray-50 text-left"
                    >
                      <h4 className="text-electric-blue font-bold uppercase tracking-wider text-xs">
                        Baby Step for {group.name}
                      </h4>
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4 text-electric-blue" />
                      ) : (
                        <ChevronUp className="w-4 h-4 text-electric-blue" />
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-6 px-4 pb-4">
                        {group.fields.map((req, index) => renderProofField(req, index, 'babyStep', false))}
                      </div>
                    )}
                  </div>
                );
              })}
              {formData.status === 'plan' && <LockTooltip />}
            </div>
          )}

          {/* Plan Column Fields - Visible in all columns, blurred when not in plan, always editable */}
          {effectivePlan.length > 0 && (
            <div className="border-y border-gray-200 py-6 my-6">
              <button
                type="button"
                onClick={() => toggleSection('plan')}
                className="w-full flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg p-2 -m-2 text-left"
              >
                <h4 className={`text-electric-blue font-bold flex items-center gap-2 text-xs uppercase tracking-wider ${formData.status !== 'plan' ? 'blur-sm' : ''}`}>
                  Plan
                </h4>
                {collapsedSections.plan ? (
                  <ChevronDown className="w-4 h-4 text-electric-blue" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-electric-blue" />
                )}
              </button>
              {!collapsedSections.plan && (
                <div className={`space-y-6 mt-4 ${formData.status !== 'plan' ? 'blur-sm' : ''}`}>
                  {effectivePlan.map((req, index) => renderProofField(req, index, 'plan', false))}
                </div>
              )}
            </div>
          )}

          {/* Proof of Work Fields - Visible in babyStep/inProgress/done, blurred/disabled in babyStep, editable in inProgress/done. Title like Metric; each field collapsible like baby steps. */}
          {effectiveProofOfWork.length > 0 && formData.status !== 'plan' && (
            <div className={`relative group border-y border-gray-200 py-6 my-6 ${formData.status === 'babyStep' ? 'blur-sm' : ''}`}>
              <label className="block text-gray-900 font-semibold mb-2">Proof of Work</label>
              <div className="space-y-4">
                {proofOfWorkFlat.map((req, index) => {
                  const sectionKey = `proofOfWork-${index}`;
                  const isCollapsed = collapsedSections[sectionKey] ?? false;
                  const isDisabled = formData.status === 'babyStep';
                  return (
                    <div key={index} className="bg-gray-100 rounded-lg border border-gray-300">
                      <button
                        type="button"
                        onClick={() => !isDisabled && toggleSection(sectionKey)}
                        disabled={isDisabled}
                        className={`w-full flex items-center justify-between p-4 transition-colors rounded-t-lg text-left ${isDisabled ? 'pointer-events-none cursor-not-allowed' : 'hover:bg-gray-50'}`}
                      >
                        <h4 className="text-electric-blue font-bold uppercase tracking-wider text-xs">
                          {formatDisplayName(req.groupName)}: {req.text}
                        </h4>
                        {!isDisabled && (
                          isCollapsed ? (
                            <ChevronDown className="w-4 h-4 text-electric-blue" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-electric-blue" />
                          )
                        )}
                      </button>
                      {!isCollapsed && (
                        <div className={`space-y-2 px-4 pb-4 ${isDisabled ? 'pointer-events-none' : ''}`}>
                          {(() => {
                            const value = formData.proofResponses[req.text] || '';
                            return (
                              <>
                                {req.helper_video && (
                                  <div className="mb-2">
                                    <HelperGuideLink href={req.helper_video} />
                                  </div>
                                )}
                                {req.type === 'URL' && (
                                  <input
                                    type="text"
                                    inputMode="url"
                                    autoComplete="url"
                                    value={value}
                                    onChange={(e) => handleProofResponseChange(req.text, e.target.value, undefined)}
                                    onBlur={(e) => {
                                      const normalized = normalizeUrl(e.target.value) || '';
                                      if (normalized !== e.target.value) {
                                        handleProofResponseChange(req.text, normalized, undefined);
                                      }
                                    }}
                                    disabled={isDisabled}
                                    className={`w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                    placeholder="Paste link — https:// added automatically"
                                  />
                                )}
                                {(req.type === 'Checkbox' || req.type === 'checkbox') && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!!value}
                                      onChange={(e) => handleProofResponseChange(req.text, e.target.checked, undefined)}
                                      disabled={isDisabled}
                                      className={`w-5 h-5 ${BOARD_CHECKBOX_CLASS} ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                    />
                                    <span className="text-gray-600">Done</span>
                                  </div>
                                )}
                                {req.type === 'text' && (
                                  <textarea
                                    value={value}
                                    onChange={(e) => handleProofResponseChange(req.text, e.target.value, undefined)}
                                    disabled={isDisabled}
                                    className={`w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px] ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                                    placeholder="Write your response here..."
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {formData.status === 'babyStep' && <LockTooltip />}
            </div>
          )}

          {ENABLE_DATE_FIELD_EDITING && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-900 font-semibold mb-2">Date Created (Debug)</label>
                <input
                  type="date"
                  value={formData.dateCreated}
                  onChange={(e) => setFormData({ ...formData, dateCreated: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-gray-900 font-semibold mb-2">Date Modified (Debug)</label>
                <input
                  type="date"
                  value={formData.dateModified}
                  onChange={(e) => setFormData({ ...formData, dateModified: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
            </div>
          )}

          {entry && (
            <div className="text-xs text-gray-400 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span>Created: {formatModalDate(entry.dateCreated)}</span>
                <span>Modified: {formatModalDate(entry.dateModified)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-gray-200">
            <div className="order-2 sm:order-1">
              {!readOnly && isUserManagedCriteriaType(entry?.criteriaType) && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this card? This cannot be undone.')) {
                      onDelete();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg font-semibold transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-3 order-1 sm:order-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <ModalFormPrimaryAction readOnly={readOnly} onClose={onClose} isEditing={!!entry} />
            </div>
          </div>
        </form>
      </ModalPanel>
    </ModalOverlay>
  );
}

// Helper function to convert snake_case or camelCase to proper display name
const formatDisplayName = (name: string): string => {
  return name
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capital letters
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export default function OpenSourceTab({
  filteredOpenSourceColumns,
  openSourceColumns,
  setOpenSourceColumns,
  isLoading,
  openSourceFilter,
  setOpenSourceFilter,
  setIsModalOpen,
  setEditingEntry,
  sensors,
  handleOpenSourceDragStart,
  handleOpenSourceDragOver,
  handleOpenSourceDragEnd,
  activeOpenSourceId,
  getOpenSourceColumnOfItem,
  isModalOpen,
  editingEntry,
  fetchOpenSourceEntries,
  isDraggingOpenSourceRef,
  userIdParam,
  selectedPartnership,
  setSelectedPartnership,
  setSelectedPartnershipId,
  activePartnershipDbId,
  setActivePartnershipDbId,
  activePartnershipCriteria,
  setActivePartnershipCriteria,
  availablePartnerships,
  fullPartnerships,
  fetchAvailablePartnerships,
  refreshCompletedPartnerships,
  completedPartnerships = [],
  viewingCompletedPartnershipName = null,
  setViewingCompletedPartnershipName,
  isInstructor = false,
  showProofOfWorkWarning = false,
  setShowProofOfWorkWarning,
  showBabyStepWarning = false,
  setShowBabyStepWarning,
  readOnly = false,
}: OpenSourceTabProps & { isDraggingOpenSourceRef: React.MutableRefObject<boolean> }) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hasSavedSelection, setHasSavedSelection] = useState(selectedPartnership !== null);
  const [tempSelection, setTempSelection] = useState<string | null>(selectedPartnership);
  const [multipleChoiceSelections, setMultipleChoiceSelections] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showSwitchConfirmation, setShowSwitchConfirmation] = useState(false);
  const [showAbandonConfirmation, setShowAbandonConfirmation] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [showCongratsModal, setShowCongratsModal] = useState(false);
  const [isCompletingPartnership, setIsCompletingPartnership] = useState(false);
  const [partnershipError, setPartnershipError] = useState<string | null>(null);
  const [newEntryDefaultCriteriaType, setNewEntryDefaultCriteriaType] = useState<string | null>(null);
  const prevCriteriaCompleteRef = useRef<boolean | null>(null);

  const recordBabyStepHelperClick = useCallback(
    async (entryId: number, fieldText: string) => {
      if (readOnly) return;

      const clickKey = helperClickKey(fieldText);
      let foundEntry: OpenSourceEntry | null = null;
      for (const col of Object.keys(openSourceColumns) as OpenSourceColumnId[]) {
        const entry = openSourceColumns[col].find((e) => e.id === entryId);
        if (entry) {
          foundEntry = entry;
          break;
        }
      }
      if (!foundEntry) return;

      const updatedEntry: OpenSourceEntry = {
        ...foundEntry,
        babyStepResponses: {
          ...(foundEntry.babyStepResponses ?? {}),
          [clickKey]: true,
        },
      };

      setOpenSourceColumns((prev) => {
        const newColumns: Record<OpenSourceColumnId, OpenSourceEntry[]> = {
          plan: [...prev.plan],
          babyStep: [...prev.babyStep],
          inProgress: [...prev.inProgress],
          done: [...prev.done],
        };
        for (const col of Object.keys(newColumns) as OpenSourceColumnId[]) {
          const idx = newColumns[col].findIndex((e) => e.id === entryId);
          if (idx !== -1) {
            newColumns[col][idx] = updatedEntry;
            break;
          }
        }
        return newColumns;
      });

      if (editingEntry?.id === entryId) {
        setEditingEntry(updatedEntry);
      }

      try {
        const url = userIdParam
          ? `/api/open_source?userId=${userIdParam}`
          : '/api/open_source';
        const response = await fetch(url, {
          method: 'PUT',
          headers: getApiHeaders(),
          body: JSON.stringify({ ...updatedEntry, id: entryId }),
        });
        if (!response.ok) throw new Error('Failed to record helper click');
      } catch (error) {
        console.error('Error recording helper click:', error);
        await fetchOpenSourceEntries();
      }
    },
    [
      readOnly,
      openSourceColumns,
      editingEntry,
      userIdParam,
      fetchOpenSourceEntries,
      setOpenSourceColumns,
      setEditingEntry,
    ]
  );

  useEffect(() => {
    if (!readOnly) return;
    setIsDropdownOpen(false);
    setShowAbandonConfirmation(false);
    setShowSwitchConfirmation(false);
  }, [readOnly]);

  // Exclude completed partnerships from selection dropdown
  const availableToSelect = useMemo(
    () => availablePartnerships.filter(p => !completedPartnerships.some(c => c.partnershipName === p.name)),
    [availablePartnerships, completedPartnerships]
  );

  // Overall criteria progress: total = sum of ALL criteria counts (primaries + extras) from partnership definition
  const totalCriteriaProgress = useMemo(() => {
    if (!activePartnershipCriteria || activePartnershipCriteria.length === 0) {
      return { completed: 0, total: 0 };
    }

    const doneEntries = filteredOpenSourceColumns.done;
    let total = 0;
    let completed = 0;

    activePartnershipCriteria.forEach((criteria: any) => {
      // Ignore multiple_choice blocks; they are handled via selected extras
      if (criteria.type === 'multiple_choice') return;

      const requiredCount = criteria.count || 1;
      total += requiredCount;

      const completedCount = doneEntries.filter((entry) => {
        // Direct card for this criteria type
        if (entry.criteriaType === criteria.type) {
          return true;
        }
        // Or this criteria is attached as an extra on the card
        const extras = entry.selectedExtras as string[] | null;
        return extras && Array.isArray(extras) && extras.includes(criteria.type);
      }).length;

      completed += Math.min(completedCount, requiredCount);
    });

    return { completed, total };
  }, [activePartnershipCriteria, filteredOpenSourceColumns.done]);

  const showPartnershipCompleteButton =
    !isInstructor &&
    ((viewingCompletedPartnershipName && !activePartnershipDbId) ||
      (!viewingCompletedPartnershipName &&
        totalCriteriaProgress.total > 0 &&
        totalCriteriaProgress.completed >= totalCriteriaProgress.total));

  // Show congratulatory modal when user transitions from incomplete to all criteria complete (non-instructor only)
  useEffect(() => {
    const isComplete = totalCriteriaProgress.total > 0 && totalCriteriaProgress.completed >= totalCriteriaProgress.total;
    if (isComplete && prevCriteriaCompleteRef.current === false && !isInstructor) {
      setShowCongratsModal(true);
    }
    prevCriteriaCompleteRef.current = isComplete;
  }, [totalCriteriaProgress.completed, totalCriteriaProgress.total, isInstructor]);

  // Reset saved state when selectedPartnership changes externally to null
  useEffect(() => {
    if (selectedPartnership === null) {
      setHasSavedSelection(false);
      setTempSelection(null);
    } else {
      setHasSavedSelection(true);
      setTempSelection(selectedPartnership);
    }
  }, [selectedPartnership]);

  const handleSaveSelection = async () => {
    if (readOnly) return;
    if (tempSelection === null || isSaving) return;

    const selectedPartnershipData = availablePartnerships.find(p => p.name === tempSelection);
    if (!selectedPartnershipData) return;

    // Block selecting a partnership the user has already completed (show error immediately)
    if (completedPartnerships.some(c => c.partnershipName === tempSelection)) {
      setPartnershipError('You have already completed this partnership.');
      return;
    }

    // If instructor is switching partnerships, show confirmation
    if (isInstructor && userIdParam && selectedPartnership && tempSelection !== selectedPartnership) {
      setShowSwitchConfirmation(true);
      return;
    }

    await performSaveSelection();
  };

  const performSaveSelection = async () => {
    if (readOnly) return;
    if (tempSelection === null || isSaving) return;

    const selectedPartnershipData = availablePartnerships.find(p => p.name === tempSelection);
    if (!selectedPartnershipData) return;

    // Safety: block selecting completed partnership (e.g. from switch confirmation)
    if (completedPartnerships.some(c => c.partnershipName === tempSelection)) {
      setShowSwitchConfirmation(false);
      setPartnershipError('You have already completed this partnership.');
      return;
    }

    setIsSaving(true);
    try {
      const url = userIdParam ? `/api/users/partnership?userId=${userIdParam}` : '/api/users/partnership';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partnershipId: selectedPartnershipData.id,
          multipleChoiceSelections,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setShowSwitchConfirmation(false);
        setPartnershipError(errorData.error || 'Failed to save partnership');
        return;
      }

      const data = await response.json();
      setSelectedPartnership(tempSelection);
      setSelectedPartnershipId(selectedPartnershipData.id);
      setActivePartnershipDbId(data.id);
      setActivePartnershipCriteria(data.criteria || []);
      setIsDropdownOpen(false);
      setShowSwitchConfirmation(false);
      // Refresh available partnerships to update spots remaining
      fetchAvailablePartnerships();
      // Refresh open source entries to show the auto-generated cards
      fetchOpenSourceEntries();
    } catch (error) {
      console.error('Error saving partnership:', error);
      setPartnershipError('Failed to save partnership. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAbandonPartnership = async () => {
    if (!isInstructor || !userIdParam || readOnly) return;

    setIsAbandoning(true);
    try {
      const url = `/api/users/partnership?userId=${userIdParam}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to abandon partnership');
        return;
      }

      // Reset all partnership-related state
      setSelectedPartnership(null);
      setSelectedPartnershipId(null);
      setActivePartnershipDbId(null);
      setActivePartnershipCriteria([]);
      
      // Refresh available partnerships and entries
      fetchAvailablePartnerships();
      fetchOpenSourceEntries();
    } catch (error) {
      console.error('Error abandoning partnership:', error);
      alert('Failed to abandon partnership. Please try again.');
    } finally {
      setShowAbandonConfirmation(false);
      setIsAbandoning(false);
    }
  };

  const resetToSelectionScreen = () => {
    setSelectedPartnership(null);
    setSelectedPartnershipId(null);
    setActivePartnershipDbId(null);
    setActivePartnershipCriteria([]);
    setViewingCompletedPartnershipName?.(null);
    refreshCompletedPartnerships?.();
  };

  const handleCompletePartnership = async (resetToSelection: boolean = false) => {
    if (!activePartnershipDbId) {
      setShowCongratsModal(false);
      if (resetToSelection) resetToSelectionScreen();
      return;
    }
    if (isCompletingPartnership) return;

    setIsCompletingPartnership(true);
    try {
      const url = userIdParam ? `/api/users/partnership?userId=${userIdParam}` : '/api/users/partnership';
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activePartnershipDbId, status: 'completed' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setPartnershipError(errorData.error || 'Failed to complete partnership');
        return;
      }

      setShowCongratsModal(false);
      if (resetToSelection) {
        resetToSelectionScreen();
      } else {
        fetchOpenSourceEntries();
      }
      fetchAvailablePartnerships();
    } catch (error) {
      console.error('Error completing partnership:', error);
      setPartnershipError('Failed to complete partnership. Please try again.');
    } finally {
      setIsCompletingPartnership(false);
    }
  };

  const handleCompleteAndSelectNewPartnership = () => handleCompletePartnership(true);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
      {hasSavedSelection && (
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-xl font-bold text-gray-900">Open Source Contributions</h4>
            {viewingCompletedPartnershipName && activePartnershipDbId && selectedPartnership && setViewingCompletedPartnershipName ? (
              <button
                onClick={() => setViewingCompletedPartnershipName?.(null)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-electric-blue hover:bg-blue-600 text-white text-sm font-semibold transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to {selectedPartnership}
              </button>
            ) : null}
            {showPartnershipCompleteButton && (
              <button
                type="button"
                onClick={() => setShowCongratsModal(true)}
                className="relative flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 shadow-sm hover:from-amber-100 hover:via-yellow-50 hover:to-amber-100 hover:border-amber-400 transition-all overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-amber-200/20 via-transparent to-amber-300/20 pointer-events-none" />
                <div className="relative flex items-center gap-2">
                  <PartyPopper className="w-5 h-5 text-amber-600" strokeWidth={2.5} />
                  <span className="text-amber-900 font-bold text-sm uppercase tracking-wider">Partnership complete! - Click here to choose a new partnership!</span>
                  <Medal className="w-5 h-5 text-amber-600" strokeWidth={2.5} />
                </div>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show:</span>
            <button
              onClick={() => setOpenSourceFilter('modifiedThisMonth')}
              className={`px-3 py-1 rounded-md border transition-colors ${
                openSourceFilter === 'modifiedThisMonth'
                  ? 'bg-electric-blue text-white border-electric-blue'
                  : 'bg-gray-100 text-gray-600 border-transparent hover:border-gray-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setOpenSourceFilter('allTime')}
              className={`px-3 py-1 rounded-md border transition-colors ${
                openSourceFilter === 'allTime'
                  ? 'bg-electric-blue text-white border-electric-blue'
                  : 'bg-gray-100 text-gray-600 border-transparent hover:border-gray-200'
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      )}

      {/* Show centered dropdown when no selection has been saved */}
      {!hasSavedSelection ? (
        <div className="flex flex-col items-center justify-center py-16 min-h-[400px]">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center justify-center gap-1 mb-4 text-center">
              <label className="text-gray-900 font-semibold text-2xl">Choose Partnership Agreement</label>
              <a
                href="https://docs.google.com/spreadsheets/d/1L0T7Xr7xQTlSKHR2_VB47gU5Nkyc454A_O6w7xJy8Go/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-electric-blue hover:text-blue-400 text-sm"
              >
                Link to Partnership Contract Document
              </a>
            </div>
            <div className="relative mb-6">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 flex items-center justify-between hover:border-electric-blue transition-colors"
              >
                <span>{tempSelection || '<none selected>'}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <button
                      onClick={() => {
                        setTempSelection(null);
                        setMultipleChoiceSelections({});
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-gray-200 transition-colors ${
                        tempSelection === null ? 'bg-blue-50 text-electric-blue' : 'text-gray-900'
                      }`}
                    >
                      &lt;none selected&gt;
                    </button>
                    {availableToSelect.map(partnership => (
                      <button
                        key={partnership.id}
                        onClick={() => {
                          setTempSelection(partnership.name);
                          setMultipleChoiceSelections({});
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-200 transition-colors ${
                          tempSelection === partnership.name ? 'bg-blue-50 text-electric-blue' : 'text-gray-900'
                        }`}
                      >
                        <span>{partnership.name}</span>
                        <span className="text-gray-400 text-sm ml-2">({partnership.spotsRemaining} spot{partnership.spotsRemaining !== 1 ? 's' : ''} left)</span>
                      </button>
                    ))}
                    {fullPartnerships.map(partnership => (
                      <div
                        key={partnership.id}
                        className="w-full text-left px-4 py-2 text-gray-500 cursor-not-allowed"
                      >
                        <span>{partnership.name}</span>
                        <span className="text-gray-600 text-sm ml-2">(Not available)</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Multiple Choice Selection */}
            {tempSelection && (() => {
              const selectedP = availablePartnerships.find(p => p.name === tempSelection);
              if (!selectedP) return null;
              const mcBlocks = selectedP.criteria?.filter(c => c.type === 'multiple_choice') || [];
              if (mcBlocks.length === 0) return null;

              return (
                <div className="space-y-4 mt-6 p-4 bg-gray-100 rounded-lg border border-gray-200/30">
                  <p className="text-gray-900 font-semibold text-sm mb-2 italic">This partnership has a multiple-choice option.  Please select <b>one</b> of the following options:</p>
                  {mcBlocks.map((block, idx) => (
                    <div key={idx} className="space-y-2">
                      <label className="block text-electric-blue text-xs uppercase tracking-wider font-bold">
                        {block.quality}
                      </label>
                      <div className="grid grid-cols-1 gap-2">
                        {block.choices.map((choice: any) => (
                          <button
                            key={choice.type}
                            onClick={() => setMultipleChoiceSelections(prev => ({
                              ...prev,
                              [idx]: choice.type
                            }))}
                            className={`text-left px-3 py-2 rounded border transition-colors text-sm ${
                              multipleChoiceSelections[idx] === choice.type
                                ? 'bg-electric-blue border-electric-blue text-white'
                                : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-gray-200'
                            }`}
                          >
                            <div className="font-medium">{choice.label}</div>
                            {choice.quality && <div className={`text-[10px] ${multipleChoiceSelections[idx] === choice.type ? 'text-blue-100' : 'text-gray-400'}`}>{choice.quality}</div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <button
              onClick={handleSaveSelection}
              disabled={tempSelection === null || isSaving || (() => {
                const selectedP = availablePartnerships.find(p => p.name === tempSelection);
                if (!selectedP) return false;
                const mcBlocks = selectedP.criteria?.filter(c => c.type === 'multiple_choice') || [];
                return mcBlocks.some((_, idx) => !multipleChoiceSelections[idx]);
              })()}
              className={`w-full px-4 py-3 rounded-lg font-semibold transition-colors mt-6 ${
                tempSelection === null || isSaving || (() => {
                  const selectedP = availablePartnerships.find(p => p.name === tempSelection);
                  if (!selectedP) return false;
                  const mcBlocks = selectedP.criteria?.filter(c => c.type === 'multiple_choice') || [];
                  return mcBlocks.some((_, idx) => !multipleChoiceSelections[idx]);
                })()
                  ? 'bg-white text-gray-400 cursor-not-allowed'
                  : 'bg-electric-blue hover:bg-blue-600 text-white'
              }`}
            >
              {isSaving ? 'Saving...' : 'Save Selection'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Instructor Partnership Selector - Show at top when instructor is viewing */}
          {isInstructor && userIdParam && (
            <div className="mb-6 p-4 bg-gray-100 rounded-lg border border-gray-200/30">
              <label className="block text-gray-900 font-semibold mb-3 text-sm">
                {readOnly ? 'Student partnership (read-only)' : 'Select Partnership for Student'}
              </label>
              {readOnly && (
                <p className="text-gray-400 text-sm mb-3">
                  You can view this student&apos;s partnership and cards but cannot change or abandon them.
                </p>
              )}
              <div className="relative">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={readOnly ? undefined : () => setIsDropdownOpen(!isDropdownOpen)}
                  className={`w-full max-w-md bg-gray-100 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 flex items-center justify-between transition-colors ${
                    readOnly ? 'opacity-70 cursor-not-allowed' : 'hover:border-electric-blue'
                  }`}
                >
                  <span>{tempSelection || selectedPartnership || '<none selected>'}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {isDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute z-20 mt-1 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <button
                        onClick={() => {
                          setTempSelection(null);
                          setMultipleChoiceSelections({});
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-gray-200 transition-colors ${
                          (tempSelection || selectedPartnership) === null ? 'bg-blue-50 text-electric-blue' : 'text-gray-900'
                        }`}
                      >
                        &lt;none selected&gt;
                      </button>
                      {availableToSelect.map(partnership => (
                        <button
                          key={partnership.id}
                          onClick={() => {
                            setTempSelection(partnership.name);
                            setMultipleChoiceSelections({});
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 hover:bg-gray-200 transition-colors ${
                            (tempSelection || selectedPartnership) === partnership.name ? 'bg-blue-50 text-electric-blue' : 'text-gray-900'
                          }`}
                        >
                          <span>{partnership.name}</span>
                          <span className="text-gray-400 text-sm ml-2">({partnership.spotsRemaining} spot{partnership.spotsRemaining !== 1 ? 's' : ''} left)</span>
                        </button>
                      ))}
                      {fullPartnerships.map(partnership => (
                        <div
                          key={partnership.id}
                          className="w-full text-left px-4 py-2 text-gray-500 cursor-not-allowed"
                        >
                          <span>{partnership.name}</span>
                          <span className="text-gray-600 text-sm ml-2">(Not available)</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              {/* Multiple Choice Selection for Instructor */}
              {!readOnly && (tempSelection || selectedPartnership) && (() => {
                const selectedP = availablePartnerships.find(p => p.name === (tempSelection || selectedPartnership));
                if (!selectedP) return null;
                const mcBlocks = selectedP.criteria?.filter(c => c.type === 'multiple_choice') || [];
                if (mcBlocks.length === 0) return null;

                return (
                  <div className="space-y-4 mt-4 p-4 bg-gray-100 rounded-lg border border-gray-200/30">
                    <p className="text-gray-900 font-semibold text-sm mb-2 italic">This partnership has a multiple-choice option.  Please select <b>one</b> of the following options:</p>
                    {mcBlocks.map((block, idx) => (
                      <div key={idx} className="space-y-2">
                        <label className="block text-electric-blue text-xs uppercase tracking-wider font-bold">
                          {block.quality}
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {block.choices.map((choice: any) => (
                            <button
                              key={choice.type}
                              onClick={() => setMultipleChoiceSelections(prev => ({
                                ...prev,
                                [idx]: choice.type
                              }))}
                              className={`text-left px-3 py-2 rounded border transition-colors text-sm ${
                                multipleChoiceSelections[idx] === choice.type
                                  ? 'bg-electric-blue border-electric-blue text-white'
                                  : 'bg-gray-100 border-gray-300 text-gray-600 hover:border-gray-200'
                              }`}
                            >
                              <div className="font-medium">{choice.label}</div>
                              {choice.quality && <div className={`text-[10px] ${multipleChoiceSelections[idx] === choice.type ? 'text-blue-100' : 'text-gray-400'}`}>{choice.quality}</div>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Save / abandon — hidden for read-only instructors */}
              {!readOnly && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSaveSelection}
                  disabled={
                    isSaving ||
                    tempSelection === null ||
                    tempSelection === selectedPartnership ||
                    (() => {
                      const selectedP = availablePartnerships.find(p => p.name === tempSelection);
                      if (!selectedP) return false;
                      const mcBlocks = selectedP.criteria?.filter(c => c.type === 'multiple_choice') || [];
                      return mcBlocks.some((_, idx) => !multipleChoiceSelections[idx]);
                    })()
                  }
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                    isSaving ||
                    tempSelection === null ||
                    tempSelection === selectedPartnership ||
                    (() => {
                      const selectedP = availablePartnerships.find(p => p.name === tempSelection);
                      if (!selectedP) return false;
                      const mcBlocks = selectedP.criteria?.filter(c => c.type === 'multiple_choice') || [];
                      return mcBlocks.some((_, idx) => !multipleChoiceSelections[idx]);
                    })()
                      ? 'bg-white text-gray-400 cursor-not-allowed'
                      : 'bg-electric-blue hover:bg-blue-600 text-white'
                  }`}
                >
                  {isSaving ? 'Saving...' : tempSelection !== selectedPartnership ? 'Switch Partnership' : 'Save Partnership Selection'}
                </button>
                
                {/* Abandon Partnership Button */}
                {selectedPartnership && activePartnershipDbId && (
                  <button
                    onClick={() => setShowAbandonConfirmation(true)}
                    disabled={isAbandoning || isSaving}
                    className="px-4 py-2 rounded-lg font-semibold transition-colors bg-red-600 hover:bg-red-700 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {isAbandoning ? 'Abandoning...' : 'Abandon Partnership'}
                  </button>
                )}
              </div>
              )}
            </div>
          )}

          {/* Switch Partnership Confirmation Modal */}
          {showSwitchConfirmation && !readOnly && (
            <ModalOverlay onClose={() => setShowSwitchConfirmation(false)}>
              <ModalPanel size="md">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Switch Partnership</h3>
                <p className="text-gray-600 mb-2">
                  Are you sure you want to switch from <span className="font-semibold text-gray-900">{selectedPartnership}</span> to <span className="font-semibold text-gray-900">{tempSelection}</span>?
                </p>
                <p className="text-red-400 text-sm mb-6 font-semibold">
                  ⚠️ This will delete ALL existing cards and reset all progress for this student. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowSwitchConfirmation(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={performSaveSelection}
                    disabled={isSaving}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Switching...' : 'Yes, Switch Partnership'}
                  </button>
                </div>
              </ModalPanel>
            </ModalOverlay>
          )}

          {/* Abandon Partnership Confirmation Modal */}
          {showAbandonConfirmation && !readOnly && (
            <ModalOverlay onClose={() => setShowAbandonConfirmation(false)}>
              <ModalPanel size="md">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Abandon Partnership</h3>
                <p className="text-gray-600 mb-2">
                  Are you sure you want to abandon <span className="font-semibold text-gray-900">{selectedPartnership}</span> for this student?
                </p>
                <p className="text-red-400 text-sm mb-6 font-semibold">
                  ⚠️ This will delete ALL existing cards and reset all progress. The student will have no active partnership. This action cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowAbandonConfirmation(false)}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAbandonPartnership}
                    disabled={isAbandoning}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {isAbandoning ? 'Abandoning...' : 'Yes, Abandon Partnership'}
                  </button>
                </div>
              </ModalPanel>
            </ModalOverlay>
          )}

          {/* Partnership Error Modal */}
          {partnershipError && (
            <ModalOverlay onClose={() => setPartnershipError(null)}>
              <ModalPanel size="md">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Partnership Error</h3>
                <p className="text-amber-400 text-sm mb-6 font-medium">
                  {partnershipError}
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setPartnershipError(null)}
                    className="px-4 py-2 bg-electric-blue hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                  >
                    OK
                  </button>
                </div>
              </ModalPanel>
            </ModalOverlay>
          )}

          {/* Proof of Work Warning Modal */}
          {showProofOfWorkWarning && setShowProofOfWorkWarning && (
            <ModalOverlay onClose={() => setShowProofOfWorkWarning(false)}>
              <ModalPanel size="md">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Proof of Work Required</h3>
                <p className="text-amber-400 text-sm mb-6 font-semibold">
                  Please complete the proof of work fields first!
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowProofOfWorkWarning(false)}
                    className="px-4 py-2 bg-electric-blue hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                  >
                    OK
                  </button>
                </div>
              </ModalPanel>
            </ModalOverlay>
          )}

          {/* Baby Step Warning Modal */}
          {showBabyStepWarning && setShowBabyStepWarning && (
            <ModalOverlay onClose={() => setShowBabyStepWarning(false)}>
              <ModalPanel size="md">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Baby Steps Required</h3>
                <p className="text-amber-400 text-sm mb-6 font-semibold">
                  Complete baby steps first — open each helper and check Done where required.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowBabyStepWarning(false)}
                    className="px-4 py-2 bg-electric-blue hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
                  >
                    OK
                  </button>
                </div>
              </ModalPanel>
            </ModalOverlay>
          )}

          {/* Congratulations Modal - All Partnership Criteria Completed */}
          {showCongratsModal && (
            <ModalOverlay onClose={() => handleCompletePartnership(false)}>
              <ModalPanel size="md">
                <div className="flex flex-col items-center text-center mb-6">
                  <PartyPopper className="w-16 h-16 text-green-600 mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Congratulations!</h3>
                  <p className="text-gray-600">
                    You&apos;ve completed all criteria for your current partnership. Great work!
                  </p>
                </div>
                <p className="text-gray-400 text-sm mb-6 text-center">
                  Would you like to work on another partnership?
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => handleCompletePartnership(false)}
                    disabled={isCompletingPartnership}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {isCompletingPartnership ? 'Loading...' : 'No'}
                  </button>
                  <button
                    onClick={handleCompleteAndSelectNewPartnership}
                    disabled={isCompletingPartnership}
                    className="px-4 py-2 bg-electric-blue hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {isCompletingPartnership ? 'Loading...' : 'Yes'}
                  </button>
                </div>
              </ModalPanel>
            </ModalOverlay>
          )}

          {isLoading ? (
        <div className="text-center py-8 text-gray-400">Loading open source entries...</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleOpenSourceDragStart} onDragOver={handleOpenSourceDragOver} onDragEnd={handleOpenSourceDragEnd}>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="grid grid-cols-5 gap-3 min-w-[800px] items-stretch">
              <div className="bg-gray-100 rounded-lg p-2 flex flex-col">
                <h5 className="text-gray-900 font-semibold mb-4 flex items-center flex-shrink-0">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                  Plan ({filteredOpenSourceColumns.plan.length})
                </h5>
                <div className="flex-1 min-h-0">
                <SortableContext items={filteredOpenSourceColumns.plan.map(c => c.id)} strategy={rectSortingStrategy}>
                  <DroppableColumn 
                    id="plan"
                    hasCardsToRight={
                      filteredOpenSourceColumns.babyStep.length > 0 ||
                      filteredOpenSourceColumns.inProgress.length > 0 ||
                      filteredOpenSourceColumns.done.length > 0
                    }
                  >
                    {filteredOpenSourceColumns.plan.map(card => (
                      <SortableOpenSourceCard 
                        key={card.id} 
                        card={card}
                        activeOpenSourceId={activeOpenSourceId}
                        setEditingEntry={setEditingEntry}
                        setIsModalOpen={setIsModalOpen}
                        isDraggingOpenSourceRef={isDraggingOpenSourceRef}
                        onRecordHelperClick={recordBabyStepHelperClick}
                        readOnly={readOnly}
                      />
                    ))}
                  </DroppableColumn>
                </SortableContext>
                </div>
                {!readOnly && (
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewEntryDefaultCriteriaType('issue');
                        setEditingEntry(null);
                        setIsModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:border-electric-blue hover:text-electric-blue transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add new issue card
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewEntryDefaultCriteriaType('ecosystem_conversation');
                        setEditingEntry(null);
                        setIsModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:border-electric-blue hover:text-electric-blue transition-colors text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      Add new conversation card
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-gray-100 rounded-lg p-2 flex flex-col">
                <h5 className="text-gray-900 font-semibold mb-4 flex items-center flex-shrink-0">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                  Baby Step ({filteredOpenSourceColumns.babyStep.length})
                </h5>
                <div className="flex-1 min-h-0">
                <SortableContext items={filteredOpenSourceColumns.babyStep.map(c => c.id)} strategy={rectSortingStrategy}>
                  <DroppableColumn 
                    id="babyStep"
                    hasCardsToRight={
                      filteredOpenSourceColumns.inProgress.length > 0 ||
                      filteredOpenSourceColumns.done.length > 0
                    }
                  >
                    {filteredOpenSourceColumns.babyStep.map(card => (
                      <SortableOpenSourceCard 
                        key={card.id} 
                        card={card}
                        activeOpenSourceId={activeOpenSourceId}
                        setEditingEntry={setEditingEntry}
                        setIsModalOpen={setIsModalOpen}
                        isDraggingOpenSourceRef={isDraggingOpenSourceRef}
                        onRecordHelperClick={recordBabyStepHelperClick}
                        readOnly={readOnly}
                      />
                    ))}
                  </DroppableColumn>
                </SortableContext>
                </div>
              </div>

              <div className="bg-gray-100 rounded-lg p-2 flex flex-col">
                <h5 className="text-gray-900 font-semibold mb-4 flex items-center flex-shrink-0">
                  <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
                  In Progress ({filteredOpenSourceColumns.inProgress.length})
                </h5>
                <div className="flex-1 min-h-0">
                <SortableContext items={filteredOpenSourceColumns.inProgress.map(c => c.id)} strategy={rectSortingStrategy}>
                  <DroppableColumn 
                    id="inProgress"
                    hasCardsToRight={filteredOpenSourceColumns.done.length > 0}
                  >
                    {filteredOpenSourceColumns.inProgress.map(card => (
                      <SortableOpenSourceCard 
                        key={card.id} 
                        card={card}
                        activeOpenSourceId={activeOpenSourceId}
                        setEditingEntry={setEditingEntry}
                        setIsModalOpen={setIsModalOpen}
                        isDraggingOpenSourceRef={isDraggingOpenSourceRef}
                        onRecordHelperClick={recordBabyStepHelperClick}
                        readOnly={readOnly}
                      />
                    ))}
                  </DroppableColumn>
                </SortableContext>
                </div>
              </div>

              <div className="bg-gray-100 rounded-lg p-2 flex flex-col">
                <h5 className="text-gray-900 font-semibold mb-4 flex items-center flex-shrink-0">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  Done ({filteredOpenSourceColumns.done.length})
                </h5>
                <div className="flex-1 min-h-0">
                <SortableContext items={filteredOpenSourceColumns.done.map(c => c.id)} strategy={rectSortingStrategy}>
                  <DroppableColumn 
                    id="done"
                    hasCardsToRight={false}
                  >
                    {filteredOpenSourceColumns.done.map(card => (
                      <SortableOpenSourceCard 
                        key={card.id} 
                        card={card}
                        activeOpenSourceId={activeOpenSourceId}
                        setEditingEntry={setEditingEntry}
                        setIsModalOpen={setIsModalOpen}
                        isDraggingOpenSourceRef={isDraggingOpenSourceRef}
                        onRecordHelperClick={recordBabyStepHelperClick}
                        readOnly={readOnly}
                      />
                    ))}
                  </DroppableColumn>
                </SortableContext>
                </div>
              </div>

              {/* Progress Column - Partnership Requirements */}
              <div className="bg-gray-100 rounded-lg p-4 border border-gray-200 flex flex-col h-full">
                <div className="mb-4 pb-3 border-b border-gray-200 flex-shrink-0">
                  <h5 className="text-gray-900 font-bold text-lg flex items-center mb-1">
                    <div className="w-4 h-4 bg-electric-blue rounded-full mr-2"></div>
                    Partnership Progress
                  </h5>
                  <p className="text-xs text-gray-500 mt-1">{selectedPartnership ? `${selectedPartnership}'s Criteria` : 'Track your requirements'}</p>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto min-h-0">
                  {/* Completed Partnerships - fancy flourished section with medal (at top for visibility) */}
                  {completedPartnerships.length > 0 && (
                    <div className="pb-4 border-b-2 border-amber-500/30">
                      <div className="relative bg-gradient-to-br from-amber-50 via-yellow-50 to-amber-100 rounded-xl p-4 border-2 border-amber-300 shadow-sm overflow-hidden">
                        {/* Decorative flourish corners */}
                        <div className="absolute top-0 left-0 w-12 h-12 border-l-2 border-t-2 border-amber-400/60 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-12 h-12 border-r-2 border-t-2 border-amber-400/60 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-l-2 border-b-2 border-amber-400/60 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-r-2 border-b-2 border-amber-400/60 rounded-br-lg" />
                        {/* Subtle shimmer overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-200/20 via-transparent to-amber-300/20 pointer-events-none" />
                        <div className="relative flex flex-col items-center">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
                              <Medal className="w-6 h-6 text-white" strokeWidth={2.5} />
                            </div>
                            <h6 className="text-sm font-bold text-amber-900 uppercase tracking-[0.2em]">
                              Completed Partnerships
                            </h6>
                            <div className="p-1.5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
                              <Medal className="w-6 h-6 text-white" strokeWidth={2.5} />
                            </div>
                          </div>
                          <ul className="w-full space-y-2">
                            {completedPartnerships.map((p) => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => setViewingCompletedPartnershipName?.(p.partnershipName)}
                                  className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg border text-left font-medium text-sm transition-colors ${
                                    viewingCompletedPartnershipName === p.partnershipName
                                      ? 'bg-amber-200 border-amber-400 text-amber-900 ring-2 ring-amber-300'
                                      : 'bg-white border-amber-200 text-amber-900 hover:bg-amber-50 hover:border-amber-300'
                                  }`}
                                >
                                  <span className="text-amber-500">✦</span>
                                  <span className="flex-1 truncate">{p.partnershipName}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Current partnership criteria - hidden when viewing a completed partnership */}
                  {!viewingCompletedPartnershipName && activePartnershipCriteria && activePartnershipCriteria.length > 0 ? (
                    activePartnershipCriteria.map((criteria: any, index: number) => {
                      // Skip multiple_choice criteria as they're handled separately
                      if (criteria.type === 'multiple_choice') return null;
                      
                      const requiredCount = criteria.count || 1;

                      // Count completed entries for this criteria type
                      // This includes both standalone cards and extras attached to other cards
                      const completedCount = filteredOpenSourceColumns.done.filter(entry => {
                        // Check if this card is directly for this criteria type
                        if (entry.criteriaType === criteria.type) {
                          return true;
                        }
                        // Check if this card has this criteria type as an extra
                        const extras = entry.selectedExtras as string[] | null;
                        if (extras && Array.isArray(extras) && extras.includes(criteria.type)) {
                          return true;
                        }
                        return false;
                      }).length;
                      
                      // Get display name from types.json
                      const typeInfo = (typesData.types as any)[criteria.type];
                      const displayName = typeInfo?.metric || criteria.metric || criteria.type || 'Unknown';
                      const shortName = formatDisplayName(typeInfo?.short_name || criteria.type);
                      
                      const progressPercent = requiredCount > 0 ? (completedCount / requiredCount) * 100 : 0;
                      const isComplete = completedCount >= requiredCount;
                      
                      return (
                        <div key={`${criteria.type}-${index}`} className="bg-white rounded-lg p-3 border border-gray-200 hover:border-electric-blue/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900 truncate flex-1" title={displayName}>
                              {shortName}
                            </span>
                            <span className={`ml-2 flex-shrink-0 font-bold text-base ${
                              isComplete ? 'text-green-600' : 'text-electric-blue'
                            }`}>
                              {completedCount}/{requiredCount}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-2.5 rounded-full transition-all ${
                                isComplete 
                                  ? 'bg-gradient-to-r from-green-500 to-green-400' 
                                  : 'bg-gradient-to-r from-electric-blue to-blue-400'
                              }`}
                              style={{ width: `${Math.min(progressPercent, 100)}%` }}
                            />
                          </div>
                          {isComplete && (
                            <div className="mt-1.5 text-xs text-green-600 flex items-center">
                              <span className="mr-1">✓</span>
                              Complete
                            </div>
                          )}
                        </div>
                      );
                    }).filter(Boolean)
                  ) : !viewingCompletedPartnershipName ? (
                    <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
                      <div className="text-sm mb-1">
                        {selectedPartnership ? (
                          'No requirements defined'
                        ) : (
                          'Select a partnership to see progress'
                        )}
                      </div>
                    </div>
                  ) : null}
                  
                  {/* Overall criteria progress - hidden when viewing completed */}
                  {!viewingCompletedPartnershipName && activePartnershipCriteria && activePartnershipCriteria.length > 0 && totalCriteriaProgress.total > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                            Overall Criteria Progress
                          </span>
                          <span className="text-sm font-semibold text-electric-blue">
                            {totalCriteriaProgress.completed}/{totalCriteriaProgress.total}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden relative">
                          <div
                            className="h-4 rounded-full transition-all bg-gradient-to-r from-electric-blue to-blue-400"
                            style={{ width: `${Math.min(100, (totalCriteriaProgress.completed / totalCriteriaProgress.total) * 100)}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-900">
                              {Math.round((totalCriteriaProgress.completed / totalCriteriaProgress.total) * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DragOverlay style={{ touchAction: 'none' }}>
            {activeOpenSourceId ? (() => {
              const col = getOpenSourceColumnOfItem(activeOpenSourceId);
              if (!col) return null;
              const card = openSourceColumns[col].find(c => String(c.id) === activeOpenSourceId);
              if (!card) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg p-3" style={{ touchAction: 'none' }}>
                  <div className="text-gray-900 font-medium mb-1">{card.metric || 'Untitled'}</div>
                  <div className="text-gray-400 text-xs mb-1">Partnership: {card.partnershipName}</div>
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
          )}
        </>
      )}
      
      {/* Create/Edit Modal */}
      {isModalOpen && (
        <OpenSourceModal
          entry={editingEntry}
          readOnly={readOnly}
          newEntryDefaultCriteriaType={newEntryDefaultCriteriaType}
          onClose={() => {
            setNewEntryDefaultCriteriaType(null);
            setIsModalOpen(false);
            setEditingEntry(null);
          }}
          onSave={async (data: Partial<OpenSourceEntry>) => {
            if (readOnly) {
              setNewEntryDefaultCriteriaType(null);
              setIsModalOpen(false);
              setEditingEntry(null);
              return;
            }
            try {
              const url = userIdParam ? `/api/open_source?userId=${userIdParam}` : '/api/open_source';
              let updatedEntry: OpenSourceEntry;
              if (editingEntry) {
                const response = await fetch(url, {
                  method: 'PUT',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ ...data, id: editingEntry.id }),
                });
                if (!response.ok) throw new Error('Failed to update open source criteria');
                updatedEntry = await response.json() as OpenSourceEntry;
                
                setOpenSourceColumns(prev => {
                  const newColumns: Record<OpenSourceColumnId, OpenSourceEntry[]> = {
                    plan: [...prev.plan],
                    babyStep: [...prev.babyStep],
                    inProgress: [...prev.inProgress],
                    done: [...prev.done],
                  };
                  const targetColumn = openSourceStatusToColumn[updatedEntry.status] || 'plan';
                  
                  let oldColumn: OpenSourceColumnId | null = null;
                  let oldIndex = -1;
                  Object.keys(newColumns).forEach(colId => {
                    const col = colId as OpenSourceColumnId;
                    const index = newColumns[col].findIndex(entry => entry.id === editingEntry.id);
                    if (index !== -1) {
                      oldColumn = col;
                      oldIndex = index;
                    }
                  });
                  
                  if (oldColumn !== null && oldIndex !== -1) {
                    const updatedCard: OpenSourceEntry = { ...updatedEntry };
                    if (oldColumn === targetColumn) {
                      newColumns[targetColumn] = [
                        ...newColumns[targetColumn].slice(0, oldIndex),
                        updatedCard,
                        ...newColumns[targetColumn].slice(oldIndex + 1)
                      ];
                    } else {
                      const sourceColumn = oldColumn as OpenSourceColumnId;
                      const sourceArray = newColumns[sourceColumn];
                      newColumns[sourceColumn] = [
                        ...sourceArray.slice(0, oldIndex),
                        ...sourceArray.slice(oldIndex + 1)
                      ];
                      newColumns[targetColumn] = [...newColumns[targetColumn], updatedCard];
                    }
                  } else {
                    const updatedCard: OpenSourceEntry = { ...updatedEntry };
                    newColumns[targetColumn] = [...newColumns[targetColumn], updatedCard];
                  }
                  
                  return newColumns;
                });
              } else {
                const response = await fetch(url, {
                  method: 'POST',
                  headers: getApiHeaders(),
                  body: JSON.stringify(data),
                });
                if (!response.ok) throw new Error('Failed to create open source criteria');
                const responseData = await response.json();
                updatedEntry = (responseData.entry || responseData) as OpenSourceEntry;
                
                setOpenSourceColumns(prev => {
                  const newColumns: Record<OpenSourceColumnId, OpenSourceEntry[]> = {
                    plan: [...prev.plan],
                    babyStep: [...prev.babyStep],
                    inProgress: [...prev.inProgress],
                    done: [...prev.done],
                  };
                  const targetColumn = openSourceStatusToColumn[updatedEntry.status] || 'plan';
                  const newCard: OpenSourceEntry = { ...updatedEntry };
                  newColumns[targetColumn] = [...newColumns[targetColumn], newCard];
                  return newColumns;
                });
              }
              setNewEntryDefaultCriteriaType(null);
              setIsModalOpen(false);
              setEditingEntry(null);
            } catch (error) {
              console.error('Error saving open source criteria:', error);
              alert('Failed to save open source criteria. Please try again.');
              await fetchOpenSourceEntries();
            }
          }}
          onRecordHelperClick={
            editingEntry
              ? (fieldText) => recordBabyStepHelperClick(editingEntry.id, fieldText)
              : undefined
          }
          selectedPartnership={selectedPartnership}
          activePartnershipCriteria={
            // When editing a completed partnership's card, use that partnership's saved criteria
            // so extras (selectedExtras) resolve correctly from their original definitions.
            completedPartnerships.find(p => p.partnershipName === editingEntry?.partnershipName)?.criteria
            ?? activePartnershipCriteria
          }
          availablePartnerships={availablePartnerships}
          fullPartnerships={fullPartnerships}
          onDelete={isUserManagedCriteriaType(editingEntry?.criteriaType) ? async () => {
            if (readOnly) return;
            try {
              const url = userIdParam ? `/api/open_source?userId=${userIdParam}&id=${editingEntry.id}` : `/api/open_source?id=${editingEntry.id}`;
              const response = await fetch(url, { method: 'DELETE', headers: getApiHeaders() });
              if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error || 'Failed to delete');
              }
              setOpenSourceColumns(prev => ({
                plan: prev.plan.filter(e => e.id !== editingEntry.id),
                babyStep: prev.babyStep.filter(e => e.id !== editingEntry.id),
                inProgress: prev.inProgress.filter(e => e.id !== editingEntry.id),
                done: prev.done.filter(e => e.id !== editingEntry.id),
              }));
              setNewEntryDefaultCriteriaType(null);
              setIsModalOpen(false);
              setEditingEntry(null);
            } catch (err) {
              console.error('Error deleting open source entry:', err);
              alert('Failed to delete. Please try again.');
              await fetchOpenSourceEntries();
            }
          } : undefined}
        />
      )}

    </section>
  );
}
