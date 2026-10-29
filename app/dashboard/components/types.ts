// Shared types for dashboard components

export type ApplicationStatus = 'apply' | 'messageRecruiter' | 'messageHiringManager' | 'followUp' | 'interview';
export type ApplicationColumnId = 'apply' | 'messageRecruiter' | 'messageHiringManager' | 'followUp' | 'interview';

export type NetworkingStatus = 'niche' | 'showUp' | 'discover' | 'offerValue' | 'pitch';
export type NetworkingColumnId = 'niche' | 'showUp' | 'discover' | 'offerValue' | 'pitch';

export type NetworkingNicheType = 'openSource' | 'techEvent' | 'hobby' | 'alumni' | 'other';

export type OpenSourceStatus = 'plan' | 'babyStep' | 'inProgress' | 'done';
export type OpenSourceColumnId = 'plan' | 'babyStep' | 'inProgress' | 'done';

export type BoardTimeFilter = 'modifiedThisMonth' | 'allTime';

export type Application = {
  id: number;
  company: string;
  linkToJobPosting?: string | null;
  hiringManager?: string | null;
  msgToManager?: string | null;
  recruiter?: string | null;
  msgToRecruiter?: string | null;
  notes?: string | null;
  status: ApplicationStatus;
  dateCreated: string;
  dateModified?: string | null;
  userId: string;
};

export type Networking = {
  id: number;
  nicheType: NetworkingNicheType;
  nicheName: string;
  contactName?: string | null;
  contactLinkedInUrl?: string | null;
  takeaway?: string | null;
  artifact?: string | null;
  pitchAsk?: string | null;
  pitchResult?: string | null;
  status: NetworkingStatus;
  dateCreated: string;
  dateModified?: string | null;
  userId: string;
};

export type OpenSourceEntry = {
  id: number;
  partnershipName: string;
  criteriaType?: string | null;
  metric?: string | null;
  status: OpenSourceStatus;
  selectedExtras?: string[] | null;
  planFields?: any[] | null;
  planResponses?: Record<string, any> | null;
  babyStepFields?: any[] | null;
  babyStepResponses?: Record<string, any> | null;
  proofOfCompletion?: any[] | null;
  proofResponses?: Record<string, any> | null;
  userId: string;
  dateCreated?: string;
  dateModified?: string | null;
};

export const APPLICATION_COMPLETION_COLUMNS: ApplicationColumnId[] = [
  'messageHiringManager',
  'messageRecruiter',
  'followUp',
  'interview',
];

export const NETWORKING_COMPLETION_COLUMNS: NetworkingColumnId[] = [
  'showUp',
  'discover',
  'offerValue',
  'pitch',
];

export const NETWORKING_NICHE_TYPE_LABELS: Record<NetworkingNicheType, string> = {
  openSource: 'Open Source Project',
  techEvent: 'Tech Conference / Event',
  hobby: 'Non-tech Hobby',
  alumni: 'Alumni',
  other: 'Other',
};

export const applicationStatusToColumn: Record<ApplicationStatus, ApplicationColumnId> = {
  apply: 'apply',
  messageRecruiter: 'messageRecruiter',
  messageHiringManager: 'messageHiringManager',
  followUp: 'followUp',
  interview: 'interview',
};

export const applicationColumnToStatus: Record<ApplicationColumnId, ApplicationStatus> = {
  apply: 'apply',
  messageRecruiter: 'messageRecruiter',
  messageHiringManager: 'messageHiringManager',
  followUp: 'followUp',
  interview: 'interview',
};

export const networkingStatusToColumn: Record<NetworkingStatus, NetworkingColumnId> = {
  niche: 'niche',
  showUp: 'showUp',
  discover: 'discover',
  offerValue: 'offerValue',
  pitch: 'pitch',
};

export const networkingColumnToStatus: Record<NetworkingColumnId, NetworkingStatus> = {
  niche: 'niche',
  showUp: 'showUp',
  discover: 'discover',
  offerValue: 'offerValue',
  pitch: 'pitch',
};

export const openSourceStatusToColumn: Record<OpenSourceStatus, OpenSourceColumnId> = {
  plan: 'plan',
  babyStep: 'babyStep',
  inProgress: 'inProgress',
  done: 'done',
};

export const openSourceColumnToStatus: Record<OpenSourceColumnId, OpenSourceStatus> = {
  plan: 'plan',
  babyStep: 'babyStep',
  inProgress: 'inProgress',
  done: 'done',
};
