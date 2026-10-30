'use client';

import React, { useState, useEffect } from 'react';
import { getApiHeaders } from '@/app/lib/api-helpers';

import { Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  Networking,
  NetworkingColumnId,
  BoardTimeFilter,
  NetworkingStatus,
  NetworkingNicheType,
} from './types';
import {
  networkingStatusToColumn,
  NETWORKING_NICHE_TYPE_LABELS,
} from './types';
import {
  DroppableColumn,
  DeleteModal,
  formatModalDate,
  toLocalDateString,
  LockTooltip,
  normalizeUrl,
  ModalFormPrimaryAction,
  ModalOverlay,
  ModalPanel,
} from './shared';

const ENABLE_DATE_FIELD_EDITING = false;

const NICHE_TYPE_OPTIONS: NetworkingNicheType[] = [
  'openSource',
  'techEvent',
  'hobby',
  'alumni',
  'other',
];

const STATUS_ORDER: NetworkingStatus[] = [
  'niche',
  'vibe',
  'discover',
  'offerValue',
  'pitch',
];

const STAGE_META: Record<
  NetworkingStatus,
  { title: string; subtitle: string }
> = {
  niche: { title: 'Niche', subtitle: 'Where are you showing up?' },
  vibe: { title: 'Vibe', subtitle: 'Vibe with Someone / Build Trust' },
  discover: { title: 'Discover', subtitle: "What 'need' did you hear?" },
  offerValue: { title: 'Offer Value', subtitle: 'What did you create?' },
  pitch: { title: 'Pitch', subtitle: 'What did you ask for, and what happened?' },
};

function statusIndex(status: NetworkingStatus): number {
  return STATUS_ORDER.indexOf(status);
}

function HelperMessage() {
  return (
    <div className="text-center py-3">
      <p className="text-gray-500 font-medium">Helper video is coming soon...</p>
    </div>
  );
}

type NetworkingTabProps = {
  filteredNetworkingColumns: Record<NetworkingColumnId, Networking[]>;
  networkingColumns: Record<NetworkingColumnId, Networking[]>;
  setNetworkingColumns: React.Dispatch<
    React.SetStateAction<Record<NetworkingColumnId, Networking[]>>
  >;
  isLoadingNetworking: boolean;
  networkingFilter: BoardTimeFilter;
  setNetworkingFilter: (filter: BoardTimeFilter) => void;
  setIsNetworkingModalOpen: (open: boolean) => void;
  setEditingNetworking: (card: Networking | null) => void;
  sensors: any;
  handleNetworkingDragStart: (event: any) => void;
  handleNetworkingDragEnd: (event: any) => void;
  activeNetworkingId: string | null;
  getNetworkingColumnOfItem: (id: string) => NetworkingColumnId | null;
  isNetworkingModalOpen: boolean;
  editingNetworking: Networking | null;
  setIsDeletingNetworking: (id: number | null) => void;
  isDeletingNetworking: number | null;
  fetchNetworking: () => Promise<void>;
  isDraggingNetworkingRef: React.MutableRefObject<boolean>;
  userIdParam: string | null;
  readOnly?: boolean;
};

function emptyColumns(): Record<NetworkingColumnId, Networking[]> {
  return {
    niche: [],
    vibe: [],
    discover: [],
    offerValue: [],
    pitch: [],
  };
}

function SortableNetworkingCard(props: {
  card: Networking;
  activeNetworkingId: string | null;
  setEditingNetworking: (card: Networking) => void;
  setIsNetworkingModalOpen: (open: boolean) => void;
  setIsDeletingNetworking: (id: number) => void;
  isDraggingNetworkingRef: React.MutableRefObject<boolean>;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(props.card.id),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  } as React.CSSProperties;

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging || props.isDraggingNetworkingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (props.activeNetworkingId === String(props.card.id)) {
      return;
    }
    setTimeout(() => {
      if (
        !props.isDraggingNetworkingRef.current &&
        !isDragging &&
        props.activeNetworkingId !== String(props.card.id)
      ) {
        props.setEditingNetworking(props.card);
        props.setIsNetworkingModalOpen(true);
      }
    }, 50);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    props.setIsDeletingNetworking(props.card.id);
  };

  const typeLabel =
    NETWORKING_NICHE_TYPE_LABELS[props.card.nicheType] ?? props.card.nicheType;

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
          <div className="flex flex-wrap gap-1 mb-1">
            <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-300 font-bold uppercase tracking-wider">
              {typeLabel}
            </span>
          </div>
          <div className="text-gray-900 font-medium mb-1">{props.card.nicheName}</div>
          {props.card.contactName && (
            <div className="text-gray-400 text-xs mb-1">{props.card.contactName}</div>
          )}
          {props.card.contactLinkedInUrl && (
            <div className="text-xs mb-1">
              <a
                href={props.card.contactLinkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-electric-blue hover:text-sky-300 underline"
              >
                LinkedIn
              </a>
            </div>
          )}
        </div>
        {!props.readOnly && (
          <div
            className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleDelete}
              className="p-1 hover:bg-red-600 rounded text-gray-500 hover:text-white"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {(props.card.contactName ||
        props.card.buildTrust ||
        props.card.summary ||
        props.card.artifact ||
        props.card.feedback ||
        props.card.pitchAsk ||
        props.card.pitchResult) && (
        <div className="text-green-600 text-xs mb-2 flex flex-col">
          {props.card.contactName && <span>✓ Contact</span>}
          {props.card.buildTrust && <span>✓ Build trust</span>}
          {props.card.summary && <span>✓ Summary</span>}
          {props.card.artifact && <span>✓ Artifact</span>}
          {props.card.feedback && <span>✓ Feedback</span>}
          {(props.card.pitchAsk || props.card.pitchResult) && <span>✓ Pitch</span>}
        </div>
      )}
    </div>
  );
}

function NetworkingModal({
  card,
  onClose,
  onSave,
  defaultStatus,
  onDelete,
  readOnly = false,
}: {
  card: Networking | null;
  onClose: () => void;
  onSave: (data: Partial<Networking>) => void;
  defaultStatus?: NetworkingStatus;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  type FormData = {
    nicheType: NetworkingNicheType;
    nicheName: string;
    contactName: string;
    contactLinkedInUrl: string;
    buildTrust: string;
    summary: string;
    artifact: string;
    feedback: string;
    pitchAsk: string;
    pitchResult: string;
    status: NetworkingStatus;
    dateCreated: string;
    dateModified: string;
  };

  const [formData, setFormData] = useState<FormData>({
    nicheType: card?.nicheType || 'openSource',
    nicheName: card?.nicheName || '',
    contactName: card?.contactName || '',
    contactLinkedInUrl: card?.contactLinkedInUrl || '',
    buildTrust: card?.buildTrust || '',
    summary: card?.summary || '',
    artifact: card?.artifact || '',
    feedback: card?.feedback || '',
    pitchAsk: card?.pitchAsk || '',
    pitchResult: card?.pitchResult || '',
    status: card?.status ?? (defaultStatus || 'niche'),
    dateCreated: card?.dateCreated ? toLocalDateString(card.dateCreated) : '',
    dateModified: card?.dateModified ? toLocalDateString(card.dateModified) : '',
  });

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setFormData({
      nicheType: card?.nicheType || 'openSource',
      nicheName: card?.nicheName || '',
      contactName: card?.contactName || '',
      contactLinkedInUrl: card?.contactLinkedInUrl || '',
      buildTrust: card?.buildTrust || '',
      summary: card?.summary || '',
      artifact: card?.artifact || '',
      feedback: card?.feedback || '',
      pitchAsk: card?.pitchAsk || '',
      pitchResult: card?.pitchResult || '',
      status: card?.status ?? (defaultStatus || 'niche'),
      dateCreated: card?.dateCreated ? toLocalDateString(card.dateCreated) : '',
      dateModified: card?.dateModified ? toLocalDateString(card.dateModified) : '',
    });
  }, [card, defaultStatus]);

  const currentStatus: NetworkingStatus = card?.status ?? (defaultStatus || 'niche');
  const idx = statusIndex(currentStatus);

  const unlocked = (minStatus: NetworkingStatus) => idx >= statusIndex(minStatus);
  const isCurrent = (s: NetworkingStatus) => currentStatus === s;
  const showBlurredPreview = (minStatus: NetworkingStatus) =>
    !card || idx === statusIndex(minStatus) - 1;
  const hideLater = (minStatus: NetworkingStatus) => idx < statusIndex(minStatus) - 1;

  useEffect(() => {
    const next: Record<string, boolean> = {};
    STATUS_ORDER.forEach((stage) => {
      next[stage] = stage !== currentStatus;
    });
    setCollapsedSections(next);
  }, [card?.id, currentStatus]);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      onClose();
      return;
    }
    if (!formData.nicheName.trim()) {
      alert('Name is required');
      return;
    }
    const { dateCreated, dateModified, ...rest } = formData;
    const submitData: Partial<Networking> = {
      ...rest,
      nicheName: formData.nicheName.trim(),
      contactName: formData.contactName.trim() || null,
      contactLinkedInUrl: normalizeUrl(formData.contactLinkedInUrl) || null,
      buildTrust: formData.buildTrust.trim() || null,
      summary: formData.summary.trim() || null,
      artifact: formData.artifact.trim() || null,
      feedback: formData.feedback.trim() || null,
      pitchAsk: formData.pitchAsk.trim() || null,
      pitchResult: formData.pitchResult.trim() || null,
    };
    if (ENABLE_DATE_FIELD_EDITING) {
      if (dateCreated) {
        try {
          const date = new Date(dateCreated);
          if (!isNaN(date.getTime())) submitData.dateCreated = date.toISOString();
        } catch (error) {
          console.error('Error parsing dateCreated:', error);
        }
      }
      if (dateModified !== undefined) {
        try {
          if (dateModified) {
            const date = new Date(dateModified);
            if (!isNaN(date.getTime())) submitData.dateModified = date.toISOString();
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

  const renderStageShell = ({
    stage,
    blurred = false,
    chevronDisabled = false,
    children,
  }: {
    stage: NetworkingStatus;
    blurred?: boolean;
    chevronDisabled?: boolean;
    children: React.ReactNode;
  }) => {
    const meta = STAGE_META[stage];
    const isCollapsed = collapsedSections[stage] ?? false;
    return (
      <div className={blurred ? 'relative group' : undefined}>
        <div
          className={`${blurred ? 'blur-sm pointer-events-none' : ''} bg-gray-100 rounded-lg border border-gray-300`}
        >
          <button
            type="button"
            onClick={() => !chevronDisabled && toggleSection(stage)}
            disabled={chevronDisabled}
            className={`w-full flex items-center justify-between p-4 transition-colors rounded-t-lg text-left ${
              chevronDisabled
                ? 'cursor-not-allowed'
                : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex flex-col items-start">
              <span className="text-electric-blue font-bold uppercase tracking-wider text-xs">
                {meta.title}
              </span>
              <p className="text-xs text-gray-400 italic mt-0.5">{meta.subtitle}</p>
            </div>
            {!chevronDisabled &&
              (isCollapsed ? (
                <ChevronDown className="w-4 h-4 text-electric-blue flex-shrink-0 ml-4" />
              ) : (
                <ChevronUp className="w-4 h-4 text-electric-blue flex-shrink-0 ml-4" />
              ))}
          </button>
          {(!isCollapsed || blurred) && (
            <div className="space-y-4 p-4 pt-0">{children}</div>
          )}
        </div>
        {blurred && <LockTooltip />}
      </div>
    );
  };

  const nicheFields = (_disabled = false) => (
    <>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Type *</label>
        <select
          value={formData.nicheType}
          onChange={(e) =>
            setFormData({
              ...formData,
              nicheType: e.target.value as NetworkingNicheType,
            })
          }
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
          required
        >
          {NICHE_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {NETWORKING_NICHE_TYPE_LABELS[opt]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Name *</label>
        <input
          type="text"
          value={formData.nicheName}
          onChange={(e) => setFormData({ ...formData, nicheName: e.target.value })}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400"
          placeholder="Name of the project, event, hobby, alumni group, etc."
          required
        />
      </div>
    </>
  );

  const vibeFields = (disabled = false) => (
    <>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Person</label>
        <input
          type="text"
          value={disabled ? '' : formData.contactName}
          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400"
          placeholder="Name of one person you spoke to"
        />
      </div>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">LinkedIn</label>
        <input
          type="text"
          value={disabled ? '' : formData.contactLinkedInUrl}
          onChange={(e) => setFormData({ ...formData, contactLinkedInUrl: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400"
          placeholder="linkedin.com/in/... or https://..."
        />
      </div>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">
          How you tried to vibe / build trust
        </label>
        <textarea
          value={disabled ? '' : formData.buildTrust}
          onChange={(e) => setFormData({ ...formData, buildTrust: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px]"
          placeholder="What did you do to vibe or build trust?"
        />
      </div>
    </>
  );

  const discoverFields = (disabled = false) => (
    <div>
      <label className="block text-gray-900 font-semibold mb-2">Summary</label>
      <textarea
        value={disabled ? '' : formData.summary}
        onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
        disabled={disabled}
        className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px]"
        placeholder="Quick summary (what 'need' did you discover?)"
      />
    </div>
  );

  const offerValueFields = (disabled = false) => (
    <>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Artifact</label>
        <textarea
          value={disabled ? '' : formData.artifact}
          onChange={(e) => setFormData({ ...formData, artifact: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px]"
          placeholder="Link, demo video, proposal, etc."
        />
      </div>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Feedback</label>
        <textarea
          value={disabled ? '' : formData.feedback}
          onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px]"
          placeholder="What feedback did you get?"
        />
      </div>
    </>
  );

  const pitchFields = (disabled = false) => (
    <>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Ask for Investment</label>
        <textarea
          value={disabled ? '' : formData.pitchAsk}
          onChange={(e) => setFormData({ ...formData, pitchAsk: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px]"
          placeholder="What was your pitch? What did you ask for?"
        />
      </div>
      <div>
        <label className="block text-gray-900 font-semibold mb-2">Result</label>
        <textarea
          value={disabled ? '' : formData.pitchResult}
          onChange={(e) => setFormData({ ...formData, pitchResult: e.target.value })}
          disabled={disabled}
          className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[80px]"
          placeholder="What was the result?"
        />
      </div>
    </>
  );

  const renderStage = (stage: NetworkingStatus) => {
    if (hideLater(stage)) return null;

    const fieldsForStage = {
      niche: nicheFields,
      vibe: vibeFields,
      discover: discoverFields,
      offerValue: offerValueFields,
      pitch: pitchFields,
    }[stage];

    if (stage !== 'niche' && !unlocked(stage)) {
      if (!showBlurredPreview(stage)) return null;
      return (
        <React.Fragment key={stage}>
          {renderStageShell({
            stage,
            blurred: true,
            chevronDisabled: true,
            children: fieldsForStage(true),
          })}
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={stage}>
        {renderStageShell({
          stage,
          children: (
            <>
              {fieldsForStage(false)}
              {isCurrent(stage) && <HelperMessage />}
            </>
          ),
        })}
      </React.Fragment>
    );
  };

  return (
    <ModalOverlay onClose={onClose}>
      <ModalPanel size="2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            {card ? 'Edit Networking' : 'New Networking'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {STATUS_ORDER.map((stage) => renderStage(stage))}

          {ENABLE_DATE_FIELD_EDITING && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-900 font-semibold mb-2">
                  Date Created (Testing/Debug)
                </label>
                <input
                  type="date"
                  value={formData.dateCreated}
                  onChange={(e) => setFormData({ ...formData, dateCreated: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-gray-900 font-semibold mb-2">
                  Date Modified (Testing/Debug)
                </label>
                <input
                  type="date"
                  value={formData.dateModified}
                  onChange={(e) => setFormData({ ...formData, dateModified: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
            </div>
          )}

          {card && (
            <div className="text-xs text-gray-400 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span>Created: {formatModalDate(card.dateCreated)}</span>
                <span>Modified: {formatModalDate(card.dateModified)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-gray-200">
            <div className="order-2 sm:order-1">
              {!readOnly && card && onDelete && (
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
              <ModalFormPrimaryAction
                readOnly={readOnly}
                onClose={onClose}
                isEditing={!!card}
              />
            </div>
          </div>
        </form>
      </ModalPanel>
    </ModalOverlay>
  );
}

const COLUMN_DOTS: Record<NetworkingColumnId, string> = {
  niche: 'bg-yellow-500',
  vibe: 'bg-purple-500',
  discover: 'bg-blue-500',
  offerValue: 'bg-green-500',
  pitch: 'bg-pink-500',
};

const COLUMNS: { id: NetworkingColumnId; label: string; dot: string }[] =
  STATUS_ORDER.map((id) => ({
    id,
    label: STAGE_META[id].title,
    dot: COLUMN_DOTS[id],
  }));

export default function NetworkingTab({
  filteredNetworkingColumns,
  networkingColumns,
  setNetworkingColumns,
  isLoadingNetworking,
  networkingFilter,
  setNetworkingFilter,
  setIsNetworkingModalOpen,
  setEditingNetworking,
  sensors,
  handleNetworkingDragStart,
  handleNetworkingDragEnd,
  activeNetworkingId,
  getNetworkingColumnOfItem,
  isNetworkingModalOpen,
  editingNetworking,
  setIsDeletingNetworking,
  isDeletingNetworking,
  fetchNetworking,
  isDraggingNetworkingRef,
  userIdParam,
  readOnly = false,
}: NetworkingTabProps) {
  const [defaultStatus, setDefaultStatus] = useState<NetworkingStatus | undefined>(
    undefined
  );

  const hasCardsToRight = (fromIndex: number) =>
    COLUMNS.slice(fromIndex + 1).some(
      (col) => filteredNetworkingColumns[col.id].length > 0
    );

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-4 mb-6">
        <h4 className="text-xl font-bold text-gray-900">Networking</h4>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Show:</span>
          <button
            onClick={() => setNetworkingFilter('modifiedThisMonth')}
            className={`px-3 py-1 rounded-md border transition-colors ${
              networkingFilter === 'modifiedThisMonth'
                ? 'bg-electric-blue text-white border-electric-blue'
                : 'bg-gray-100 text-gray-600 border-transparent hover:border-gray-200'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setNetworkingFilter('allTime')}
            className={`px-3 py-1 rounded-md border transition-colors ${
              networkingFilter === 'allTime'
                ? 'bg-electric-blue text-white border-electric-blue'
                : 'bg-gray-100 text-gray-600 border-transparent hover:border-gray-200'
            }`}
          >
            All Time
          </button>
        </div>
        {!readOnly && (
          <button
            onClick={() => {
              setEditingNetworking(null);
              setDefaultStatus('niche');
              setIsNetworkingModalOpen(true);
            }}
            className="bg-electric-blue hover:bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold transition-colors flex items-center text-sm sm:text-base"
          >
            <Plus className="mr-2 w-4 h-4 sm:w-5 sm:h-5" />
            Add Networking
          </button>
        )}
      </div>

      {isLoadingNetworking ? (
        <div className="text-center py-8 text-gray-400">Loading networking...</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleNetworkingDragStart}
          onDragEnd={handleNetworkingDragEnd}
        >
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="grid grid-cols-5 gap-3 min-w-[900px]">
              {COLUMNS.map((col, index) => (
                <div key={col.id} className="bg-gray-100 rounded-lg p-2">
                  <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                    <div className={`w-3 h-3 ${col.dot} rounded-full mr-2`}></div>
                    {col.label} ({filteredNetworkingColumns[col.id].length})
                  </h5>
                  <SortableContext
                    items={filteredNetworkingColumns[col.id].map((c) => c.id)}
                    strategy={rectSortingStrategy}
                  >
                    <DroppableColumn
                      id={col.id}
                      onAddCard={
                        col.id === 'niche' && !readOnly
                          ? () => {
                              setEditingNetworking(null);
                              setDefaultStatus('niche');
                              setIsNetworkingModalOpen(true);
                            }
                          : undefined
                      }
                      hasCardsToRight={hasCardsToRight(index)}
                    >
                      {filteredNetworkingColumns[col.id].map((card) => (
                        <SortableNetworkingCard
                          key={card.id}
                          card={card}
                          activeNetworkingId={activeNetworkingId}
                          setEditingNetworking={setEditingNetworking}
                          setIsNetworkingModalOpen={setIsNetworkingModalOpen}
                          setIsDeletingNetworking={setIsDeletingNetworking}
                          isDraggingNetworkingRef={isDraggingNetworkingRef}
                          readOnly={readOnly}
                        />
                      ))}
                    </DroppableColumn>
                  </SortableContext>
                </div>
              ))}
            </div>
          </div>
          <DragOverlay style={{ touchAction: 'none' }}>
            {activeNetworkingId
              ? (() => {
                  const col = getNetworkingColumnOfItem(activeNetworkingId);
                  if (!col) return null;
                  const card = networkingColumns[col].find(
                    (c) => String(c.id) === activeNetworkingId
                  );
                  if (!card) return null;
                  return (
                    <div
                      className="bg-white border border-gray-200 rounded-lg p-3"
                      style={{ touchAction: 'none' }}
                    >
                      <div className="flex flex-wrap gap-1 mb-1">
                        <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-300 font-bold uppercase tracking-wider">
                          {NETWORKING_NICHE_TYPE_LABELS[card.nicheType] ?? card.nicheType}
                        </span>
                      </div>
                      <div className="text-gray-900 font-medium mb-1">{card.nicheName}</div>
                      {card.contactName && (
                        <div className="text-gray-400 text-xs mb-1">{card.contactName}</div>
                      )}
                    </div>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}

      {isNetworkingModalOpen && (
        <NetworkingModal
          card={editingNetworking}
          defaultStatus={defaultStatus}
          readOnly={readOnly}
          onClose={() => {
            setIsNetworkingModalOpen(false);
            setEditingNetworking(null);
            setDefaultStatus(undefined);
          }}
          onDelete={() => {
            if (readOnly) return;
            if (editingNetworking) {
              setIsNetworkingModalOpen(false);
              setIsDeletingNetworking(editingNetworking.id);
            }
          }}
          onSave={async (data: Partial<Networking>) => {
            if (readOnly) {
              setIsNetworkingModalOpen(false);
              setEditingNetworking(null);
              return;
            }
            try {
              const url = userIdParam
                ? `/api/networking?userId=${userIdParam}`
                : '/api/networking';
              let updated: Networking;
              if (editingNetworking) {
                const response = await fetch(url, {
                  method: 'PUT',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ ...data, id: editingNetworking.id }),
                });
                if (!response.ok) throw new Error('Failed to update networking card');
                updated = (await response.json()) as Networking;

                setNetworkingColumns((prev) => {
                  const newColumns = emptyColumns();
                  (Object.keys(prev) as NetworkingColumnId[]).forEach((colId) => {
                    newColumns[colId] = [...prev[colId]];
                  });
                  const targetColumn =
                    networkingStatusToColumn[updated.status] || 'niche';

                  let oldColumn: NetworkingColumnId | null = null;
                  let oldIndex = -1;
                  (Object.keys(newColumns) as NetworkingColumnId[]).forEach((col) => {
                    const index = newColumns[col].findIndex(
                      (c) => c.id === editingNetworking.id
                    );
                    if (index !== -1) {
                      oldColumn = col;
                      oldIndex = index;
                    }
                  });

                  const updatedCard: Networking = { ...updated };
                  if (oldColumn !== null && oldIndex !== -1) {
                    if (oldColumn === targetColumn) {
                      newColumns[targetColumn] = [
                        ...newColumns[targetColumn].slice(0, oldIndex),
                        updatedCard,
                        ...newColumns[targetColumn].slice(oldIndex + 1),
                      ];
                    } else {
                      const sourceColumn = oldColumn as NetworkingColumnId;
                      newColumns[sourceColumn] = [
                        ...newColumns[sourceColumn].slice(0, oldIndex),
                        ...newColumns[sourceColumn].slice(oldIndex + 1),
                      ];
                      newColumns[targetColumn] = [
                        ...newColumns[targetColumn],
                        updatedCard,
                      ];
                    }
                  } else {
                    newColumns[targetColumn] = [
                      ...newColumns[targetColumn],
                      updatedCard,
                    ];
                  }
                  return newColumns;
                });
              } else {
                const response = await fetch(url, {
                  method: 'POST',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ ...data, status: data.status || 'niche' }),
                });
                if (!response.ok) throw new Error('Failed to create networking card');
                updated = (await response.json()) as Networking;

                setNetworkingColumns((prev) => {
                  const newColumns = emptyColumns();
                  (Object.keys(prev) as NetworkingColumnId[]).forEach((colId) => {
                    newColumns[colId] = [...prev[colId]];
                  });
                  const targetColumn =
                    networkingStatusToColumn[updated.status] || 'niche';
                  newColumns[targetColumn] = [
                    ...newColumns[targetColumn],
                    { ...updated },
                  ];
                  return newColumns;
                });
              }
              setIsNetworkingModalOpen(false);
              setEditingNetworking(null);
              setDefaultStatus(undefined);
            } catch (error) {
              console.error('Error saving networking card:', error);
              alert('Failed to save networking card. Please try again.');
              await fetchNetworking();
            }
          }}
        />
      )}

      {!readOnly && isDeletingNetworking !== null && (
        <DeleteModal
          onConfirm={async () => {
            try {
              const url = userIdParam
                ? `/api/networking?id=${isDeletingNetworking}&userId=${userIdParam}`
                : `/api/networking?id=${isDeletingNetworking}`;
              const response = await fetch(url, { method: 'DELETE' });
              if (!response.ok) throw new Error('Failed to delete networking card');
              await fetchNetworking();
              setIsDeletingNetworking(null);
            } catch (error) {
              console.error('Error deleting networking card:', error);
              alert('Failed to delete networking card. Please try again.');
              setIsDeletingNetworking(null);
            }
          }}
          onCancel={() => setIsDeletingNetworking(null)}
        />
      )}
    </section>
  );
}
