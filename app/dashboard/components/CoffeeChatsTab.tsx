'use client';

import React, { useState, useEffect } from 'react';
import { getApiHeaders } from '@/app/lib/api-helpers';

import { Plus, Trash2, X, PlayCircle } from 'lucide-react';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LinkedinOutreach, LinkedinOutreachColumnId, BoardTimeFilter, LinkedinOutreachStatus } from './types';
import { linkedinOutreachStatusToColumn, linkedinOutreachColumnToStatus } from './types';
import { DroppableColumn, DeleteModal, formatModalDate, toLocalDateString, LockTooltip, VideoModal, normalizeUrl, ModalFormPrimaryAction, ModalOverlay, ModalPanel, BOARD_CHECKBOX_CLASS } from './shared';

// ===== DATE FIELD EDITING TOGGLE START =====
// Toggle this flag to enable editing dateCreated and dateModified in create/edit modals for testing and debugging.
const ENABLE_DATE_FIELD_EDITING = false;
// ===== DATE FIELD EDITING TOGGLE END =====

// Helper Message Component - shows video link based on current column
function HelperMessage({ status }: { status?: LinkedinOutreachStatus | null }) {
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const videoUrl = 'https://www.youtube.com/watch?v=UgZrVViUQLk'; // TODO: Update with actual Coffee Chats video URL

  const getMessage = () => {
    if (!status) return 'find prospects';
    switch (status) {
      case 'prospects':
        return 'find prospects';
      case 'sendFirstMessage':
        return 'send your first message';
      case 'requestAccepted':
        return 'get your request accepted';
      case 'followUp':
        return 'follow up';
      case 'coffeeChat':
        return 'have a coffee chat';
      case 'askForReferral':
        return 'ask for a referral';
      default:
        return 'find prospects';
    }
  };

  return (
    <>
      <div className="text-center py-3">
        <button
          type="button"
          onClick={() => setIsVideoOpen(true)}
          className="inline-flex items-center gap-2 text-gray-900 font-semibold hover:text-electric-blue transition-colors cursor-pointer underline"
        >
          <PlayCircle className="w-5 h-5 text-electric-blue flex-shrink-0" />
          <span>Helper video: How to {getMessage()}</span>
        </button>
      </div>
      <VideoModal videoUrl={videoUrl} isOpen={isVideoOpen} onClose={() => setIsVideoOpen(false)} />
    </>
  );
}

type CoffeeChatsTabProps = {
  filteredLinkedinOutreachColumns: Record<LinkedinOutreachColumnId, LinkedinOutreach[]>;
  linkedinOutreachColumns: Record<LinkedinOutreachColumnId, LinkedinOutreach[]>;
  setLinkedinOutreachColumns: React.Dispatch<React.SetStateAction<Record<LinkedinOutreachColumnId, LinkedinOutreach[]>>>;
  isLoadingLinkedinOutreach: boolean;
  linkedinOutreachFilter: BoardTimeFilter;
  setLinkedinOutreachFilter: (filter: BoardTimeFilter) => void;
  setIsLinkedinOutreachModalOpen: (open: boolean) => void;
  setEditingLinkedinOutreach: (outreach: LinkedinOutreach | null) => void;
  sensors: any;
  handleLinkedinOutreachDragStart: (event: any) => void;
  handleLinkedinOutreachDragOver: (event: any) => void;
  handleLinkedinOutreachDragEnd: (event: any) => void;
  activeLinkedinOutreachId: string | null;
  getLinkedinOutreachColumnOfItem: (id: string) => LinkedinOutreachColumnId | null;
  isLinkedinOutreachModalOpen: boolean;
  editingLinkedinOutreach: LinkedinOutreach | null;
  setIsDeletingLinkedinOutreach: (id: number | null) => void;
  isDeletingLinkedinOutreach: number | null;
  fetchLinkedinOutreach: () => Promise<void>;
  isDraggingLinkedinOutreachRef: React.MutableRefObject<boolean>;
  userIdParam: string | null;
  readOnly?: boolean;
};

function SortableLinkedinOutreachCard(props: { 
  card: LinkedinOutreach;
  activeLinkedinOutreachId: string | null;
  setEditingLinkedinOutreach: (outreach: LinkedinOutreach) => void;
  setIsLinkedinOutreachModalOpen: (open: boolean) => void;
  setIsDeletingLinkedinOutreach: (id: number) => void;
  isDraggingLinkedinOutreachRef: React.MutableRefObject<boolean>;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(props.card.id) });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  } as React.CSSProperties;

  const handleClick = (e: React.MouseEvent) => {
    // Prevent click during drag
    if (isDragging || props.isDraggingLinkedinOutreachRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (props.activeLinkedinOutreachId === String(props.card.id)) {
      return;
    }
    setTimeout(() => {
      if (!props.isDraggingLinkedinOutreachRef.current && !isDragging && props.activeLinkedinOutreachId !== String(props.card.id)) {
        props.setEditingLinkedinOutreach(props.card);
        props.setIsLinkedinOutreachModalOpen(true);
      }
    }, 50);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    props.setIsDeletingLinkedinOutreach(props.card.id);
  };

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
          <div className="text-gray-900 font-medium mb-1">{props.card.name}</div>
          <div className="text-gray-400 text-xs mb-1">{props.card.company}</div>
          {props.card.linkedInUrl && (
            <div className="text-xs mb-1">
              <a
                href={props.card.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-electric-blue hover:text-sky-300 underline"
              >
                LinkedIn Profile
              </a>
            </div>
          )}
        </div>
        {!props.readOnly && <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleDelete}
            className="p-1 hover:bg-red-600 rounded text-gray-500 hover:text-white"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>}
      </div>
      {(props.card.firstMessage || props.card.secondMessage || props.card.notes) && (
        <div className="text-green-600 text-xs mb-2 flex flex-col">
          {props.card.firstMessage && <span>✓ First Message</span>}
          {props.card.secondMessage && <span>✓ Second Message</span>}
          {props.card.notes && <span>✓ Notes from coffee chat</span>}
        </div>
      )}
      {props.card.recievedReferral && (
        <div className="text-yellow-500 text-sm font-semibold mb-2">✓ Referral Received</div>
      )}
    </div>
  );
}

// Linkedin outreach modal component
function LinkedinOutreachModal({ 
  linkedinOutreach, 
  onClose, 
  onSave,
  defaultStatus,
  onDelete,
  readOnly = false,
}: { 
  linkedinOutreach: LinkedinOutreach | null; 
  onClose: () => void; 
  onSave: (data: Partial<LinkedinOutreach>) => void;
  defaultStatus?: LinkedinOutreachStatus;
  onDelete?: () => void;
  readOnly?: boolean;
}) {

  type LinkedinOutreachFormData = {
    name: string;
    company: string;
    firstMessage: string;
    secondMessage: string;
    linkedInUrl: string;
    notes: string;
    status: LinkedinOutreachStatus;
    recievedReferral: boolean;
    dateCreated: string; // ===== DATE FIELD EDITING: Added for testing/debugging =====
    dateModified: string; // ===== DATE FIELD EDITING: Added for testing/debugging =====
  };

  const [formData, setFormData] = useState<LinkedinOutreachFormData>({
    name: linkedinOutreach?.name || '',
    company: linkedinOutreach?.company || '',
    firstMessage: linkedinOutreach?.firstMessage || '',
    secondMessage: linkedinOutreach?.secondMessage || '',
    linkedInUrl: linkedinOutreach?.linkedInUrl || '',
    notes: linkedinOutreach?.notes || '',
    status: linkedinOutreach ? linkedinOutreach.status : (defaultStatus || 'prospects'),
    recievedReferral: linkedinOutreach?.recievedReferral || false,
    dateCreated: linkedinOutreach?.dateCreated ? toLocalDateString(linkedinOutreach.dateCreated) : '', // ===== DATE FIELD EDITING =====
    dateModified: linkedinOutreach?.dateModified ? toLocalDateString(linkedinOutreach.dateModified) : '', // ===== DATE FIELD EDITING =====
  });

  // Update form data when linkedin outreach changes
  useEffect(() => {
    if (linkedinOutreach) {
      setFormData({
        name: linkedinOutreach.name || '',
        company: linkedinOutreach.company || '',
        firstMessage: linkedinOutreach.firstMessage || '',
        secondMessage: linkedinOutreach.secondMessage || '',
        linkedInUrl: linkedinOutreach.linkedInUrl || '',
        notes: linkedinOutreach.notes || '',
        status: linkedinOutreach.status,
        recievedReferral: linkedinOutreach.recievedReferral || false,
        dateCreated: linkedinOutreach.dateCreated ? toLocalDateString(linkedinOutreach.dateCreated) : '', // ===== DATE FIELD EDITING =====
        dateModified: linkedinOutreach.dateModified ? toLocalDateString(linkedinOutreach.dateModified) : '', // ===== DATE FIELD EDITING =====
      });
      } else {
      setFormData({
        name: '',
        company: '',
        firstMessage: '',
        secondMessage: '',
        linkedInUrl: '',
        notes: '',
        status: defaultStatus || 'prospects',
        recievedReferral: false,
        dateCreated: '', // ===== DATE FIELD EDITING =====
        dateModified: '', // ===== DATE FIELD EDITING =====
      });
    }
  }, [linkedinOutreach, defaultStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) {
      onClose();
      return;
    }
    if (!formData.name.trim() || !formData.company.trim()) {
      alert('Name and company are required');
      return;
    }
    // ===== DATE FIELD EDITING: Convert date strings to ISO DateTime if provided =====
    const { dateCreated, dateModified, ...restFormData } = formData;
    const submitData: Partial<LinkedinOutreach> = { 
      ...restFormData,
      linkedInUrl: normalizeUrl(formData.linkedInUrl),
    };
    if (ENABLE_DATE_FIELD_EDITING) {
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
            {linkedinOutreach ? 'Edit Coffee Chat' : 'Create New Coffee Chat'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-900 font-semibold mb-2">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400"
                placeholder="Person's name"
                required
              />
            </div>

            <div>
              <label className="block text-gray-900 font-semibold mb-2">Company *</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400"
                placeholder="Company name"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-900 font-semibold mb-2">LinkedIn URL</label>
            <input
              type="text"
              value={formData.linkedInUrl}
              onChange={(e) => setFormData({ ...formData, linkedInUrl: e.target.value })}
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400"
              placeholder="linkedin.com/in/... or https://linkedin.com/in/..."
            />
          </div>

          {/* Helper message for create mode or 'prospects' status */}
          {(!linkedinOutreach || linkedinOutreach?.status === 'prospects') && (
            <HelperMessage status={linkedinOutreach?.status || 'prospects'} />
          )}

          {/* First Message field - visible from sendFirstMessage, blurred in prospects */}
          {!linkedinOutreach ? (
            // Create mode: Show First Message blurred
            <div className="relative group py-4">
              <div className="blur-sm">
                <label className="block font-semibold mb-2 text-gray-900">First Message</label>
                <textarea
                  value={formData.firstMessage}
                  onChange={(e) => setFormData({ ...formData, firstMessage: e.target.value })}
                  disabled={true}
                  className="w-full border rounded-lg px-4 py-2 placeholder-gray-400 min-h-[100px] bg-gray-100 border-gray-200 text-gray-900"
                  placeholder="First message sent to the person"
                />
              </div>
              <LockTooltip />
            </div>
          ) : linkedinOutreach.status === 'prospects' ? (
            // Prospects status: Show First Message blurred
            <div className="relative group py-4">
              <div className="blur-sm">
                <label className="block font-semibold mb-2 text-gray-900">First Message</label>
                <textarea
                  value={formData.firstMessage}
                  onChange={(e) => setFormData({ ...formData, firstMessage: e.target.value })}
                  disabled={true}
                  className="w-full border rounded-lg px-4 py-2 placeholder-gray-400 min-h-[100px] bg-gray-100 border-gray-200 text-gray-900"
                  placeholder="First message sent to the person"
                />
              </div>
              <LockTooltip />
            </div>
          ) : (
            // sendFirstMessage or beyond: Show First Message unblurred
            <div className={linkedinOutreach?.status === 'sendFirstMessage' ? 'border border-yellow-500 rounded-lg p-4 bg-yellow-500/10' : ''}>
              <label className="block text-gray-900 font-semibold mb-2">First Message</label>
              <textarea
                value={formData.firstMessage}
                onChange={(e) => setFormData({ ...formData, firstMessage: e.target.value })}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[100px]"
                placeholder="First message sent to the person"
              />
              {/* Helper message inside highlighted section */}
              {linkedinOutreach && linkedinOutreach.status === 'sendFirstMessage' && (
                <HelperMessage status={linkedinOutreach.status} />
              )}
            </div>
          )}

          {/* Second Message field - visible from followUp */}
          {linkedinOutreach && (linkedinOutreach.status === 'followUp' || linkedinOutreach.status === 'coffeeChat' || linkedinOutreach.status === 'askForReferral') ? (
            // Follow Up, Coffee Chat, or Ask for Referral: Show Second Message unblurred
            <div className={linkedinOutreach.status === 'followUp' ? 'border border-yellow-500 rounded-lg p-4 bg-yellow-500/10' : ''}>
              <label className="block text-gray-900 font-semibold mb-2">Second Message</label>
              <textarea
                value={formData.secondMessage}
                onChange={(e) => setFormData({ ...formData, secondMessage: e.target.value })}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[100px]"
                placeholder="Second message sent to the person"
              />
              {/* Helper message inside highlighted section */}
              {linkedinOutreach.status === 'followUp' && (
                <HelperMessage status={linkedinOutreach.status} />
              )}
            </div>
          ) : linkedinOutreach && (linkedinOutreach.status === 'sendFirstMessage' || linkedinOutreach.status === 'requestAccepted') ? (
            // Send First Message or Request Accepted: Show Second Message blurred (unlocks in next column "Follow Up")
            <div className="relative group py-4">
              <div className="blur-sm">
                <label className="block font-semibold mb-2 text-gray-900">Second Message</label>
                <textarea
                  value={formData.secondMessage}
                  onChange={(e) => setFormData({ ...formData, secondMessage: e.target.value })}
                  disabled={true}
                  className="w-full border rounded-lg px-4 py-2 placeholder-gray-400 min-h-[100px] bg-gray-100 border-gray-200 text-gray-900"
                  placeholder="Second message sent to the person"
                />
              </div>
              <LockTooltip />
            </div>
          ) : null}

          {/* Notes field - visible from coffeeChat */}
          {linkedinOutreach && (linkedinOutreach.status === 'coffeeChat' || linkedinOutreach.status === 'askForReferral') ? (
            // Coffee Chat or Ask for Referral status: Show Notes unblurred
            <div className={linkedinOutreach.status === 'coffeeChat' ? 'border border-yellow-500 rounded-lg p-4 bg-yellow-500/10' : ''}>
              <label className="block text-gray-900 font-semibold mb-2">Notes from coffee chat</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-400 min-h-[100px]"
                placeholder="Enter notes from the coffee chat"
              />
              {/* Helper message inside highlighted section */}
              {linkedinOutreach.status === 'coffeeChat' && (
                <HelperMessage status={linkedinOutreach.status} />
              )}
            </div>
          ) : linkedinOutreach && linkedinOutreach.status === 'followUp' ? (
            // Follow Up status: Show Notes blurred (unlocks in next column)
            <div className="relative group py-4">
              <div className="blur-sm">
                <label className="block font-semibold mb-2 text-gray-900">Notes from coffee chat</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  disabled={true}
                  className="w-full border rounded-lg px-4 py-2 placeholder-gray-400 min-h-[100px] bg-gray-100 border-gray-200 text-gray-900"
                  placeholder="Enter notes from the coffee chat"
                />
              </div>
              <LockTooltip />
            </div>
          ) : null}

          {/* Received Referral checkbox - visible from askForReferral */}
          {linkedinOutreach && linkedinOutreach.status === 'askForReferral' ? (
            // Ask for Referral status: Show checkbox unblurred
            <div className="border border-yellow-500 rounded-lg p-4 bg-yellow-500/10">
              <div className="flex items-center mb-3">
                <input
                  type="checkbox"
                  id="recievedReferral"
                  checked={formData.recievedReferral}
                  onChange={(e) => setFormData({ ...formData, recievedReferral: e.target.checked })}
                  className={`w-4 h-4 ${BOARD_CHECKBOX_CLASS}`}
                />
                <label htmlFor="recievedReferral" className="ml-2 font-semibold text-gray-900">
                  Received Referral
                </label>
              </div>
              {/* Helper message inside highlighted section */}
              <HelperMessage status={linkedinOutreach.status} />
            </div>
          ) : linkedinOutreach && linkedinOutreach.status === 'coffeeChat' ? (
            // Coffee Chat status: Show checkbox blurred (unlocks in next column)
            <div className="relative group py-4">
              <div className="blur-sm">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="recievedReferral"
                    checked={formData.recievedReferral}
                    onChange={(e) => setFormData({ ...formData, recievedReferral: e.target.checked })}
                    disabled={true}
                    className={`w-4 h-4 ${BOARD_CHECKBOX_CLASS}`}
                  />
                  <label htmlFor="recievedReferral" className="ml-2 font-semibold text-gray-900">
                    Received Referral
                  </label>
                </div>
              </div>
              <LockTooltip />
            </div>
          ) : null}


          {/* ===== DATE FIELD EDITING: Show dateCreated and dateModified fields when toggle is enabled ===== */}
          {ENABLE_DATE_FIELD_EDITING && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-900 font-semibold mb-2">Date Created (Testing/Debug)</label>
                <input
                  type="date"
                  value={formData.dateCreated}
                  onChange={(e) => setFormData({ ...formData, dateCreated: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-gray-900 font-semibold mb-2">Date Modified (Testing/Debug)</label>
                <input
                  type="date"
                  value={formData.dateModified}
                  onChange={(e) => setFormData({ ...formData, dateModified: e.target.value })}
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
            </div>
          )}

          {linkedinOutreach && (
            <div className="text-xs text-gray-400 pt-2 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span>Created: {formatModalDate(linkedinOutreach.dateCreated)}</span>
                <span>Modified: {formatModalDate(linkedinOutreach.dateModified)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between sm:justify-end gap-3 pt-4">
            {!readOnly && linkedinOutreach && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors md:hidden order-3 sm:order-1"
              >
                <Trash2 className="inline mr-2 w-4 h-4" />Delete
              </button>
            )}
            <div className="flex gap-3 order-1 sm:order-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <ModalFormPrimaryAction readOnly={readOnly} onClose={onClose} isEditing={!!linkedinOutreach} />
            </div>
          </div>
        </form>
      </ModalPanel>
    </ModalOverlay>
  );
}

export default function CoffeeChatsTab({
  filteredLinkedinOutreachColumns,
  linkedinOutreachColumns,
  setLinkedinOutreachColumns,
  isLoadingLinkedinOutreach,
  linkedinOutreachFilter,
  setLinkedinOutreachFilter,
  setIsLinkedinOutreachModalOpen,
  setEditingLinkedinOutreach,
  sensors,
  handleLinkedinOutreachDragStart,
  handleLinkedinOutreachDragOver,
  handleLinkedinOutreachDragEnd,
  activeLinkedinOutreachId,
  getLinkedinOutreachColumnOfItem,
  isLinkedinOutreachModalOpen,
  editingLinkedinOutreach,
  setIsDeletingLinkedinOutreach,
  isDeletingLinkedinOutreach,
  fetchLinkedinOutreach,
  isDraggingLinkedinOutreachRef,
  userIdParam,
  readOnly = false,
}: CoffeeChatsTabProps) {
  const [defaultStatus, setDefaultStatus] = React.useState<LinkedinOutreachStatus | undefined>(undefined);
  
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-4 mb-6">
        <h4 className="text-xl font-bold text-gray-900">Coffee Chats</h4>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Show:</span>
          <button
            onClick={() => setLinkedinOutreachFilter('modifiedThisMonth')}
            className={`px-3 py-1 rounded-md border transition-colors ${
              linkedinOutreachFilter === 'modifiedThisMonth'
                ? 'bg-electric-blue text-white border-electric-blue'
                : 'bg-gray-100 text-gray-600 border-transparent hover:border-gray-200'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setLinkedinOutreachFilter('allTime')}
            className={`px-3 py-1 rounded-md border transition-colors ${
              linkedinOutreachFilter === 'allTime'
                ? 'bg-electric-blue text-white border-electric-blue'
                : 'bg-gray-100 text-gray-600 border-transparent hover:border-gray-200'
            }`}
          >
            All Time
          </button>
        </div>
        {!readOnly && <button 
          onClick={() => {
            setDefaultStatus(undefined);
            setEditingLinkedinOutreach(null);
            setIsLinkedinOutreachModalOpen(true);
          }}
          className="bg-electric-blue hover:bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold transition-colors flex items-center text-sm sm:text-base w-full sm:w-auto"
        >
          <Plus className="mr-2 w-4 h-4 sm:w-5 sm:h-5" />New Outreach
        </button>}
      </div>
      {isLoadingLinkedinOutreach ? (
        <div className="text-center py-8 text-gray-400">Loading coffee chats...</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleLinkedinOutreachDragStart} onDragOver={handleLinkedinOutreachDragOver} onDragEnd={handleLinkedinOutreachDragEnd}>
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="grid grid-cols-6 gap-3">
            <div className="bg-gray-100 rounded-lg p-2">
              <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                <div className="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                Prospects ({filteredLinkedinOutreachColumns.prospects.length})
              </h5>
              <SortableContext items={filteredLinkedinOutreachColumns.prospects.map(c => String(c.id))} strategy={rectSortingStrategy}>
                <DroppableColumn 
                  id="prospects"
                  onAddCard={() => {
                    setDefaultStatus(linkedinOutreachColumnToStatus.prospects);
                    setEditingLinkedinOutreach(null);
                    setIsLinkedinOutreachModalOpen(true);
                  }}
                  hasCardsToRight={
                    filteredLinkedinOutreachColumns.sendFirstMessage.length > 0 ||
                    filteredLinkedinOutreachColumns.requestAccepted.length > 0 ||
                    filteredLinkedinOutreachColumns.followUp.length > 0 ||
                    filteredLinkedinOutreachColumns.coffeeChat.length > 0 ||
                    filteredLinkedinOutreachColumns.askForReferral.length > 0
                  }
                >
                  {filteredLinkedinOutreachColumns.prospects.map(card => (
                    <SortableLinkedinOutreachCard 
                      key={card.id} 
                      card={card}
                      activeLinkedinOutreachId={activeLinkedinOutreachId}
                      setEditingLinkedinOutreach={setEditingLinkedinOutreach}
                      setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
                      setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
                      isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
                      readOnly={readOnly}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>

            <div className="bg-gray-100 rounded-lg p-2">
              <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                Send First Message ({filteredLinkedinOutreachColumns.sendFirstMessage.length})
              </h5>
              <SortableContext items={filteredLinkedinOutreachColumns.sendFirstMessage.map(c => String(c.id))} strategy={rectSortingStrategy}>
                <DroppableColumn 
                  id="sendFirstMessage"
                  hasCardsToRight={
                    filteredLinkedinOutreachColumns.requestAccepted.length > 0 ||
                    filteredLinkedinOutreachColumns.followUp.length > 0 ||
                    filteredLinkedinOutreachColumns.coffeeChat.length > 0 ||
                    filteredLinkedinOutreachColumns.askForReferral.length > 0
                  }
                >
                  {filteredLinkedinOutreachColumns.sendFirstMessage.map(card => (
                    <SortableLinkedinOutreachCard 
                      key={card.id} 
                      card={card}
                      activeLinkedinOutreachId={activeLinkedinOutreachId}
                      setEditingLinkedinOutreach={setEditingLinkedinOutreach}
                      setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
                      setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
                      isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
                      readOnly={readOnly}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>

            <div className="bg-gray-100 rounded-lg p-2">
              <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                Request Accepted ({filteredLinkedinOutreachColumns.requestAccepted.length})
              </h5>
              <SortableContext items={filteredLinkedinOutreachColumns.requestAccepted.map(c => String(c.id))} strategy={rectSortingStrategy}>
                <DroppableColumn 
                  id="requestAccepted"
                  hasCardsToRight={
                    filteredLinkedinOutreachColumns.followUp.length > 0 ||
                    filteredLinkedinOutreachColumns.coffeeChat.length > 0 ||
                    filteredLinkedinOutreachColumns.askForReferral.length > 0
                  }
                >
                  {filteredLinkedinOutreachColumns.requestAccepted.map(card => (
                    <SortableLinkedinOutreachCard 
                      key={card.id} 
                      card={card}
                      activeLinkedinOutreachId={activeLinkedinOutreachId}
                      setEditingLinkedinOutreach={setEditingLinkedinOutreach}
                      setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
                      setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
                      isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
                      readOnly={readOnly}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>

            <div className="bg-gray-100 rounded-lg p-2">
              <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
                Follow Up ({filteredLinkedinOutreachColumns.followUp.length})
              </h5>
              <SortableContext items={filteredLinkedinOutreachColumns.followUp.map(c => String(c.id))} strategy={rectSortingStrategy}>
                <DroppableColumn 
                  id="followUp"
                  hasCardsToRight={
                    filteredLinkedinOutreachColumns.coffeeChat.length > 0 ||
                    filteredLinkedinOutreachColumns.askForReferral.length > 0
                  }
                >
                  {filteredLinkedinOutreachColumns.followUp.map(card => (
                    <SortableLinkedinOutreachCard 
                      key={card.id} 
                      card={card}
                      activeLinkedinOutreachId={activeLinkedinOutreachId}
                      setEditingLinkedinOutreach={setEditingLinkedinOutreach}
                      setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
                      setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
                      isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
                      readOnly={readOnly}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>

            <div className="bg-gray-100 rounded-lg p-2">
              <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                Coffee Chat ({filteredLinkedinOutreachColumns.coffeeChat.length})
              </h5>
              <SortableContext items={filteredLinkedinOutreachColumns.coffeeChat.map(c => String(c.id))} strategy={rectSortingStrategy}>
                <DroppableColumn 
                  id="coffeeChat"
                  hasCardsToRight={filteredLinkedinOutreachColumns.askForReferral.length > 0}
                >
                  {filteredLinkedinOutreachColumns.coffeeChat.map(card => (
                    <SortableLinkedinOutreachCard 
                      key={card.id} 
                      card={card}
                      activeLinkedinOutreachId={activeLinkedinOutreachId}
                      setEditingLinkedinOutreach={setEditingLinkedinOutreach}
                      setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
                      setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
                      isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
                      readOnly={readOnly}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>

            <div className="bg-gray-100 rounded-lg p-2">
              <h5 className="text-gray-900 font-semibold mb-4 flex items-center">
                <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                Ask for Referral ({filteredLinkedinOutreachColumns.askForReferral.length})
              </h5>
              <SortableContext items={filteredLinkedinOutreachColumns.askForReferral.map(c => String(c.id))} strategy={rectSortingStrategy}>
                <DroppableColumn 
                  id="askForReferral"
                  hasCardsToRight={false}
                >
                  {filteredLinkedinOutreachColumns.askForReferral.map(card => (
                    <SortableLinkedinOutreachCard 
                      key={card.id} 
                      card={card}
                      activeLinkedinOutreachId={activeLinkedinOutreachId}
                      setEditingLinkedinOutreach={setEditingLinkedinOutreach}
                      setIsLinkedinOutreachModalOpen={setIsLinkedinOutreachModalOpen}
                      setIsDeletingLinkedinOutreach={setIsDeletingLinkedinOutreach}
                      isDraggingLinkedinOutreachRef={isDraggingLinkedinOutreachRef}
                      readOnly={readOnly}
                    />
                  ))}
                </DroppableColumn>
              </SortableContext>
            </div>
          </div>
          </div>
          <DragOverlay style={{ touchAction: 'none' }}>
            {activeLinkedinOutreachId ? (() => {
              const col = getLinkedinOutreachColumnOfItem(activeLinkedinOutreachId);
              if (!col) return null;
              const card = linkedinOutreachColumns[col].find(c => String(c.id) === activeLinkedinOutreachId);
              if (!card) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg p-3" style={{ touchAction: 'none' }}>
                  <div className="text-gray-900 font-medium mb-1">{card.name}</div>
                  <div className="text-gray-400 text-xs mb-1">{card.company}</div>
                </div>
              );
            })() : null}
          </DragOverlay>
        </DndContext>
      )}
      
      {/* Create/Edit Modal */}
      {isLinkedinOutreachModalOpen && (
        <LinkedinOutreachModal
          linkedinOutreach={editingLinkedinOutreach}
          readOnly={readOnly}
          defaultStatus={defaultStatus}
          onClose={() => {
            setIsLinkedinOutreachModalOpen(false);
            setEditingLinkedinOutreach(null);
            setDefaultStatus(undefined);
          }}
          onDelete={() => {
            if (readOnly) return;
            if (editingLinkedinOutreach) {
              setIsLinkedinOutreachModalOpen(false);
              setIsDeletingLinkedinOutreach(editingLinkedinOutreach.id);
            }
          }}
          onSave={async (data: Partial<LinkedinOutreach>) => {
            if (readOnly) {
              setIsLinkedinOutreachModalOpen(false);
              setEditingLinkedinOutreach(null);
              return;
            }
            try {
              const url = userIdParam ? `/api/linkedin_outreach?userId=${userIdParam}` : '/api/linkedin_outreach';
              let updatedOutreach: LinkedinOutreach;
              if (editingLinkedinOutreach) {
                const response = await fetch(url, {
                  method: 'PUT',
                  headers: getApiHeaders(),
                  body: JSON.stringify({ ...data, id: editingLinkedinOutreach.id }),
                });
                if (!response.ok) throw new Error('Failed to update LinkedIn outreach entry');
                updatedOutreach = await response.json() as LinkedinOutreach;
                
                // Optimistically update the state immediately
                setLinkedinOutreachColumns(prev => {
                  const newColumns = { ...prev };
                  const targetColumn = linkedinOutreachStatusToColumn[updatedOutreach.status] ?? 'prospects';
                  
                  // Find the old item's column and index
                  let oldColumn: LinkedinOutreachColumnId | null = null;
                  let oldIndex = -1;
                  Object.keys(newColumns).forEach(colId => {
                    const col = colId as LinkedinOutreachColumnId;
                    const index = newColumns[col].findIndex(outreach => outreach.id === editingLinkedinOutreach.id);
                    if (index !== -1) {
                      oldColumn = col;
                      oldIndex = index;
                    }
                  });
                  
                  if (oldColumn !== null && oldIndex !== -1) {
                    // Create a new object reference to ensure React detects the change
                    const updatedCard = { ...updatedOutreach };
                    if (oldColumn === targetColumn) {
                      // Same column: update in place
                      newColumns[targetColumn] = [
                        ...newColumns[targetColumn].slice(0, oldIndex),
                        updatedCard,
                        ...newColumns[targetColumn].slice(oldIndex + 1)
                      ];
                    } else {
                      // Different column: remove from old, add to new
                      // Use type assertion to help TypeScript understand oldColumn is not null here
                      const sourceColumn = oldColumn as LinkedinOutreachColumnId;
                      const sourceArray = newColumns[sourceColumn];
                      newColumns[sourceColumn] = [
                        ...sourceArray.slice(0, oldIndex),
                        ...sourceArray.slice(oldIndex + 1)
                      ];
                      newColumns[targetColumn] = [...newColumns[targetColumn], updatedCard];
                    }
                  } else {
                    // Not found (shouldn't happen), just add to target column
                    const updatedCard = { ...updatedOutreach };
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
                if (!response.ok) throw new Error('Failed to create LinkedIn outreach entry');
                updatedOutreach = await response.json() as LinkedinOutreach;
                
                // Optimistically update the state immediately
                setLinkedinOutreachColumns(prev => {
                  const newColumns = { ...prev };
                  const targetColumn = linkedinOutreachStatusToColumn[updatedOutreach.status] ?? 'prospects';
                  newColumns[targetColumn] = [...newColumns[targetColumn], updatedOutreach];
                  return newColumns;
                });
              }
              setIsLinkedinOutreachModalOpen(false);
              setEditingLinkedinOutreach(null);
              // No need to refetch - we already have the updated item from the API response
              // The optimistic update is sufficient since we're using the server's response data
            } catch (error) {
              console.error('Error saving LinkedIn outreach entry:', error);
              alert('Failed to save coffee chat. Please try again.');
              // Refresh data on error to restore correct state
              await fetchLinkedinOutreach();
            }
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {!readOnly && isDeletingLinkedinOutreach !== null && (
        <DeleteModal
          onConfirm={async () => {
            try {
              const url = userIdParam ? `/api/linkedin_outreach?id=${isDeletingLinkedinOutreach}&userId=${userIdParam}` : `/api/linkedin_outreach?id=${isDeletingLinkedinOutreach}`;
              const response = await fetch(url, {
                method: 'DELETE',
              });
              if (!response.ok) throw new Error('Failed to delete LinkedIn outreach entry');
              await fetchLinkedinOutreach();
              setIsDeletingLinkedinOutreach(null);
            } catch (error) {
              console.error('Error deleting LinkedIn outreach entry:', error);
              alert('Failed to delete coffee chat. Please try again.');
              setIsDeletingLinkedinOutreach(null);
            }
          }}
          onCancel={() => setIsDeletingLinkedinOutreach(null)}
        />
      )}
    </section>
  );
}
