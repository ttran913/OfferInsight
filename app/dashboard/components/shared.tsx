'use client';

import { Plus, Lock, X } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import React, { useState, useEffect } from 'react';

type ModalPanelSize = 'md' | '2xl' | '3xl';

const MODAL_PANEL_MAX_WIDTH: Record<ModalPanelSize, string> = {
  md: 'max-w-md',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
};

/** Full-screen backdrop above the fixed navbar; content starts below --navbar-height. */
export function ModalOverlay({
  onClose,
  children,
  backdropClassName = 'bg-black/50',
}: {
  onClose: () => void;
  children: React.ReactNode;
  backdropClassName?: string;
}) {
  return (
    <div
      className={`fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[calc(var(--navbar-height)+1rem)] pb-4 ${backdropClassName}`}
      onClick={onClose}
    >
      {children}
    </div>
  );
}

export function ModalPanel({
  children,
  size = '2xl',
  scrollable,
}: {
  children: React.ReactNode;
  size?: ModalPanelSize;
  scrollable?: boolean;
}) {
  const isScrollable = scrollable ?? size !== 'md';

  return (
    <div
      className={`w-full rounded-lg border border-gray-200 bg-white p-4 sm:p-6 ${MODAL_PANEL_MAX_WIDTH[size]} ${
        isScrollable ? 'max-h-[calc(100dvh-var(--navbar-height)-2rem)] overflow-y-auto' : ''
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** Shared board-modal checkbox style: dark border unchecked; blue fill when checked so the white checkmark is visible. */
export const BOARD_CHECKBOX_CLASS =
  'rounded border-2 border-gray-500 bg-white text-electric-blue checked:bg-electric-blue checked:border-electric-blue focus:ring-2 focus:ring-electric-blue focus:ring-offset-1';

// Delete Confirmation Modal
export function DeleteModal({ 
  onConfirm, 
  onCancel 
}: { 
  onConfirm: () => void; 
  onCancel: () => void;
}) {
  return (
    <ModalOverlay onClose={onCancel}>
      <ModalPanel size="md">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Delete Item</h3>
        <p className="text-gray-600 mb-6">Are you sure you want to delete this item? This action cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
          >
            Delete
          </button>
        </div>
      </ModalPanel>
    </ModalOverlay>
  );
}

/** Primary action in tab create/edit modals: read-only shows Close; otherwise submits as Update or Create. */
export function ModalFormPrimaryAction({
  readOnly,
  onClose,
  isEditing,
}: {
  readOnly: boolean;
  onClose: () => void;
  isEditing: boolean;
}) {
  return (
    <button
      type={readOnly ? 'button' : 'submit'}
      onClick={readOnly ? onClose : undefined}
      className="px-4 py-2 bg-electric-blue hover:bg-blue-600 text-white rounded-lg font-semibold transition-colors"
    >
      {readOnly ? 'Close' : isEditing ? 'Update' : 'Create'}
    </button>
  );
}

// Shared components used across multiple tabs

// Helper function to format dates for display in modals
export function formatModalDate(value?: string | null): string {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    return `${month} ${day}, ${year}`;
  } catch {
    return '-';
  }
}

// Helper function to convert ISO date string to local date string (YYYY-MM-DD format)
// Used for date input fields in modals
export function toLocalDateString(value: string): string {
  try {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

// Helper function to get local date parts (month, day, year) from ISO date string
export function getLocalDateParts(value: string): { year: number; month: number; day: number } {
  try {
    const date = new Date(value);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
    };
  } catch {
    return { year: 0, month: 0, day: 0 };
  }
}

// Helper function to get local time parts (hours, minutes) from ISO date string
export function getLocalTimeParts(value: string): { hours: number; minutes: number } {
  try {
    const date = new Date(value);
    return {
      hours: date.getHours(),
      minutes: date.getMinutes(),
    };
  } catch {
    return { hours: 0, minutes: 0 };
  }
}

// Helper function to format date with full month name (e.g., "January 15, 2024")
export function formatDateWithFullMonth(value: string | Date): string {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    return `${month} ${day}, ${year}`;
  } catch {
    return '—';
  }
}

// Helper function to normalize URLs - adds https:// if missing and value looks like a URL
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  // If it already starts with http:// or https://, return as is
  if (trimmed.match(/^https?:\/\//i)) return trimmed;
  // If it looks like a domain (contains a dot and doesn't start with a protocol), add https://
  if (trimmed.includes('.') && !trimmed.match(/^[a-zA-Z]+:/)) {
    return `https://${trimmed}`;
  }
  // Otherwise return as is (might be a relative URL or invalid)
  return trimmed;
}

// Lock Tooltip Component - centered in unified blur area
export function LockTooltip() {
  return (
    <div className="flex md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 md:absolute md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:z-10 items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg whitespace-nowrap justify-center md:pointer-events-none">
      <Lock className="w-4 h-4 text-electric-blue flex-shrink-0" />
      <span className="text-sm text-gray-900">Drag card to next column to unlock next step</span>
    </div>
  );
}

// Video Modal Component - displays YouTube video in a modal overlay
export function VideoModal({ videoUrl, isOpen, onClose }: { videoUrl: string; isOpen: boolean; onClose: () => void }) {
  // Convert YouTube watch URL to embed format
  const getEmbedUrl = (url: string) => {
    // Extract video ID from various YouTube URL formats
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`;
    }
    return url; // Fallback to original URL if extraction fails
  };

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose} backdropClassName="bg-black/80">
      <div
        className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors bg-black/50 rounded-full p-2"
          aria-label="Close video"
        >
          <X size={24} />
        </button>
        <iframe
          src={getEmbedUrl(videoUrl)}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video player"
        />
      </div>
    </ModalOverlay>
  );
}

export function DroppableColumn(props: { id: string; children: React.ReactNode; onAddCard?: () => void; showLockIcon?: boolean; hasCardsToRight?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: props.id });
  const [showTooltip, setShowTooltip] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const showLock = props.showLockIcon !== false; // Default to true if not specified
  
  // Detect if device is primarily touch-based (mobile/tablet)
  // We check for touch AND small screen to avoid false positives on touchscreen laptops
  useEffect(() => {
    const checkTouchDevice = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
      // Consider it a touch device only if it has touch AND is a small screen
      setIsTouchDevice(hasTouch && isSmallScreen);
    };
    checkTouchDevice();
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    mediaQuery.addEventListener('change', checkTouchDevice);
    return () => mediaQuery.removeEventListener('change', checkTouchDevice);
  }, []);
  
  // Check if column is empty (no cards, only potentially the Add Card button)
  const childrenArray = React.Children.toArray(props.children);
  const isEmpty = childrenArray.length === 0;
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Only toggle on touch devices; on desktop, hover handles it
    if (isTouchDevice) {
      setShowTooltip(prev => !prev);
    }
  };
  
  // Don't show lock if there are cards in columns to the right (progress indication)
  const shouldShowLock = isEmpty && !props.onAddCard && showLock && !props.hasCardsToRight;
  
  return (
    <div ref={setNodeRef} className={`space-y-3 min-h-64 relative ${isOver ? 'outline outline-2 outline-electric-blue/60 outline-offset-2 bg-gray-50/40' : ''}`}>
      {props.children}
      {props.onAddCard && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onAddCard?.();
          }}
          className="w-full mt-2 py-2 px-3 text-sm text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded-lg border border-dashed border-gray-300 hover:border-electric-blue transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Add Card
        </button>
      )}
      
      {/* Lock icon and tooltip for empty columns (but not for first column, and only if showLockIcon is true, and no cards to the right) */}
      {shouldShowLock && (
        <div className="absolute inset-x-0 top-[40%] flex justify-center">
          <div 
            className="relative group cursor-pointer"
            onClick={handleClick}
          >
            <Lock className="w-12 h-12 text-gray-500" />
            {/* Tooltip - visible on hover (desktop) or when showTooltip is true (mobile toggle) */}
            <div 
              className={`absolute top-full left-1/2 -translate-x-1/2 mt-3 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-lg whitespace-nowrap z-10 pointer-events-none transition-opacity duration-200 ${
                isTouchDevice
                  ? (showTooltip ? 'opacity-100 visible' : 'opacity-0 invisible')
                  : 'opacity-0 invisible md:group-hover:opacity-100 md:group-hover:visible'
              }`}
            >
              <span className="text-sm text-gray-900">Drag card to this column to unlock this step</span>
              {/* Tooltip arrow */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0 border-4 border-transparent border-b-gray-900"></div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[1px] border-4 border-transparent border-b-light-steel-blue"></div>
            </div>
          </div>
        </div>
      )}
      
      {/* When empty, provide space to drop */}
      <div className="h-2"></div>
    </div>
  );
}

