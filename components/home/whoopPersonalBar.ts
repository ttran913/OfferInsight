import type { PersonalBarCriterion, PersonalBarTitle } from './personalBarTypes';

export const WHOOP_LOGO_PATH = '/images/home/WHOOP-logo.svg';

export const WHOOP_PERSONAL_BAR_TITLE: PersonalBarTitle = {
  heading: 'Hiring Manager Personal Bar',
  subheading: 'Whoop',
};

export const WHOOP_PERSONAL_BAR_CRITERIA: readonly PersonalBarCriterion[] = [
  {
    id: 'problem-solving',
    heading: 'Problem-solving skills',
    subheading: 'Experience solving real-life engineering problems',
    detail: '6 issues solved on a respected open source project.',
  },
  {
    id: 'coachability',
    heading: 'Coachability',
    subheading: 'Can take critical feedback',
    detail:
      '2 pull requests which received critical feedback followed up with a resubmission that was accepted.',
  },
  {
    id: 'closer',
    heading: 'Closer',
    subheading: 'Follows through on a task until it is fully done',
    detail:
      'Time to completion for each contribution averages to 1 month or less.',
  },
];
