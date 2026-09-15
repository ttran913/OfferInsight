import { NextResponse } from "next/server";
import { getInstructorSession } from "@/app/lib/instructor-auth";
import { prisma } from "@/db";
import { getCurrentMonthDateRange } from "@/app/lib/date-utils";
import { computeOpenSourceCriteriaProgress } from "@/app/lib/open-source-criteria-progress";
import { buildCriteria } from "@/app/lib/partnership-criteria";

// Status values that count as "completed" for display counts (matches dashboard completion columns)
const APPLICATION_COMPLETION_STATUSES = ['messageHiringManager', 'messageRecruiter', 'followUp', 'interview'];
const LINKEDIN_COMPLETION_STATUSES = ['prospects', 'sendFirstMessage', 'requestAccepted', 'followUp', 'coffeeChat', 'askForReferral'];
const EVENT_COMPLETION_STATUSES = ['attended', 'sendLinkedInRequest', 'followUp'];

export async function GET() {
  try {
    const instructor = await getInstructorSession();
    if (!instructor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { firstDayOfMonth, lastDayOfMonth } = getCurrentMonthDateRange();
    const now = new Date();

    // Fetch all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        removedFromResumeBook: true,
        inactivityWarningCount: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const studentsData = await Promise.all(
      users.map(async (user) => {
        const [
          openSourceEntries,
          activePartnership,
          completedPartnershipsCount,
        ] = await Promise.all([
          prisma.openSourceEntry.findMany({
            where: { userId: user.id },
            select: {
              status: true,
              criteriaType: true,
              selectedExtras: true,
              partnershipName: true,
              dateModified: true,
            },
          }),
          prisma.userPartnership.findFirst({
            where: { userId: user.id, status: 'active' },
            include: { partnership: true },
          }),
          prisma.userPartnership.count({
            where: { userId: user.id, status: 'completed' },
          }),
        ]);

        // Open Source: issue count and criteria progress (for display and Progress status)
        const issuesCompletedCount = openSourceEntries.filter(
          (entry) => entry.criteriaType === 'issue' && entry.status === 'done'
        ).length;

        let totalCriteriaCount = 0;
        let completedCriteriaCount = 0;

        if (activePartnership) {
          const selections = (activePartnership.selections as Record<string, string>) || {};
          const criteria = buildCriteria(activePartnership.partnershipId, selections);
          const partnershipName = activePartnership.partnership.name;
          const doneEntries = openSourceEntries.filter(
            (e) => e.status === 'done' && e.partnershipName === partnershipName
          );
          const progress = computeOpenSourceCriteriaProgress(criteria, doneEntries);
          totalCriteriaCount += progress.total;
          completedCriteriaCount += progress.completed;
        } else {
          for (const entry of openSourceEntries) {
            const extras = Array.isArray(entry.selectedExtras)
              ? (entry.selectedExtras as unknown[]).length
              : 0;

            totalCriteriaCount += 1 + extras;

            if (entry.status === 'done') {
              completedCriteriaCount += 1 + extras;
            }
          }
        }

        // Display stats (last month + all time) for dashboard cards
        const [applicationsLastMonth, applicationsAllTime] = await Promise.all([
          prisma.applications_With_Outreach.count({
            where: {
              userId: user.id,
              status: { in: APPLICATION_COMPLETION_STATUSES },
              dateCreated: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth,
              },
            },
          }),
          prisma.applications_With_Outreach.count({
            where: {
              userId: user.id,
              status: { in: APPLICATION_COMPLETION_STATUSES },
            },
          }),
        ]);

        const [coffeeChatsLastMonth, coffeeChatsAllTime] = await Promise.all([
          prisma.linkedin_Outreach.count({
            where: {
              userId: user.id,
              status: { in: LINKEDIN_COMPLETION_STATUSES },
              dateCreated: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth,
              },
            },
          }),
          prisma.linkedin_Outreach.count({
            where: {
              userId: user.id,
              status: { in: LINKEDIN_COMPLETION_STATUSES },
            },
          }),
        ]);

        const [eventsLastMonth, eventsAllTime] = await Promise.all([
          prisma.in_Person_Events.count({
            where: {
              userId: user.id,
              status: { in: EVENT_COMPLETION_STATUSES },
              date: {
                gte: firstDayOfMonth,
                lte: lastDayOfMonth,
              },
            },
          }),
          prisma.in_Person_Events.count({
            where: {
              userId: user.id,
              status: { in: EVENT_COMPLETION_STATUSES },
            },
          }),
        ]);

        const referralCount = await prisma.linkedin_Outreach.count({
          where: {
            userId: user.id,
            recievedReferral: true,
          },
        });

        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Active: any open source card (any partnership) last modified. Green = last 7 days, Yellow = last 30 days.
        let activeStatus = 0;
        const anyCardModifiedInLastWeek = openSourceEntries.some(
          (e) => e.dateModified && new Date(e.dateModified) >= sevenDaysAgo
        );
        const anyCardModifiedInLastMonth = openSourceEntries.some(
          (e) => e.dateModified && new Date(e.dateModified) >= thirtyDaysAgo
        );
        if (anyCardModifiedInLastWeek) {
          activeStatus = 2; // Green
        } else if (anyCardModifiedInLastMonth) {
          activeStatus = 1; // Yellow
        }

        // Progress: open source completion. Green = 2+ criteria types done in 30 days, Yellow = 1 issue in 90 days (active partnership only).
        let progressStatus = 0;

        if (activePartnership) {
          const partnershipName = activePartnership.partnership.name;
          const doneEntriesForPartnership = openSourceEntries.filter(
            (e) => e.status === 'done' && e.partnershipName === partnershipName
          );

          // Green: at least 2 distinct criteria types completed in last 30 days
          const doneInLast30Days = doneEntriesForPartnership.filter(
            (e) => e.dateModified && new Date(e.dateModified) >= thirtyDaysAgo
          );
          const criteriaTypesInLast30Days = new Set<string>();
          for (const e of doneInLast30Days) {
            if (e.criteriaType) criteriaTypesInLast30Days.add(e.criteriaType);
            const extras = e.selectedExtras as string[] | null;
            if (extras && Array.isArray(extras)) {
              extras.forEach((t) => criteriaTypesInLast30Days.add(t));
            }
          }
          if (criteriaTypesInLast30Days.size >= 2) {
            progressStatus = 2; // Green
          } else {
            // Yellow: at least 1 issue completed in last 90 days
            const issueDoneInLast90Days = doneEntriesForPartnership.some(
              (e) =>
                e.criteriaType === 'issue' &&
                e.dateModified &&
                new Date(e.dateModified) >= ninetyDaysAgo
            );
            if (issueDoneInLast90Days) {
              progressStatus = 1; // Yellow
            }
          }
        }

        return {
          id: user.id,
          name: user.name || 'Unknown',
          email: user.email,
          activeStatus,
          progressStatus,
          referralCount,
          removedFromResumeBook: user.removedFromResumeBook,
          inactivityWarningCount: user.inactivityWarningCount,
          openSource: {
            issuesCompleted: issuesCompletedCount,
            partnershipsCompleted: completedPartnershipsCount,
            completedCount: completedCriteriaCount,
            totalCount: totalCriteriaCount,
          },
          applications: {
            lastMonth: applicationsLastMonth,
            allTime: applicationsAllTime,
          },
          coffeeChats: {
            lastMonth: coffeeChatsLastMonth,
            allTime: coffeeChatsAllTime,
          },
          events: {
            lastMonth: eventsLastMonth,
            allTime: eventsAllTime,
          },
        };
      })
    );

    return NextResponse.json({ students: studentsData });
  } catch (error) {
    console.error("Error fetching students data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

